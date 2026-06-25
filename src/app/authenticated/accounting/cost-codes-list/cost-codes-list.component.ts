import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { SelectionModel } from '@angular/cdk/collections';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import {BehaviorSubject, Subject, catchError, concatMap, filter, finalize, from, map, of, skip, switchMap, take, takeUntil, toArray} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TransactionTypeLabels } from '../models/accounting-enum';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { CostCodesListDisplay, CostCodesRequest, CostCodesResponse } from '../models/cost-codes.model';
import { CostCodesService } from '../services/cost-codes.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { CostCodeCopyOfficesDialogComponent } from './cost-code-copy-offices-dialog.component';

@Component({
    standalone: true,
    selector: 'app-cost-codes-list',
    templateUrl: './cost-codes-list.component.html',
    styleUrls: ['./cost-codes-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective, CostCodesComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class CostCodesListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() showInactiveInput?: boolean; // Input to control inactive filter from parent. If provided, parent manages controls.
  @Input() embeddedInSettings: boolean = false; // Embedded in settings or accounting shell (office from title bar)
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() addCostCodeEvent = new EventEmitter<void>();
  @Output() editCostCodeEvent = new EventEmitter<{ costCodeId: number, officeId: number | null }>();
   
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allCostCodes: CostCodesResponse[] = [];
  costCodesDisplay: any[] = [];
  selectedCostCodes: CostCodesListDisplay[] = [];
  isAdmin = false;
  canEditIsActiveCheckbox = false;

  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  officeScopeResolved: boolean = false;
  isEditingCostCodes: boolean = false;
  costCodesId: string | number | null = null;
  costCodesOfficeId: number | null = null;

  costCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: number, label: string }[] = [];
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
 
  costCodesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    costCode: { displayAs: 'Cost Code', maxWidth: '20ch', sortType: 'natural' },
    transactionType: { displayAs: 'Type', maxWidth: '15ch' },
    description: { displayAs: 'Description', maxWidth: '33ch' },
    chartOfAccountDisplay: { displayAs: 'Chart Of Account', maxWidth: '30ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' },
    rowColor: { displayAs: '', sort: false, wrap: false } // Hidden column for row coloring
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['costCodes', 'chartOfAccounts']));
  destroy$ = new Subject<void>();

  constructor(
    public costCodesService: CostCodesService,
    public chartOfAccountsService: ChartOfAccountsService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private utilityService: UtilityService,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef) {
  }

  //#region CostCodes-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.loadOffices();
    this.loadCostCodes();
    this.loadChartOfAccounts();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
      this.markViewForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent (settings/accounting title bar)
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      if (this.isEditingCostCodes) {
        this.costCodesOfficeId = newOfficeId ?? null;
      }
      if (this.offices.length > 0) {
        this.resolveOfficeScope(newOfficeId, false);
      }
    }
    
    // Watch for changes to showInactiveInput input
    if (changes['showInactiveInput'] && !changes['showInactiveInput'].firstChange) {
      // Reapply filters when showInactiveInput changes
      this.applyFilters();
    }
  }

  addCostCode(): void {
    if (this.embeddedInSettings) {
      this.costCodesId = 'new';
      this.costCodesOfficeId = this.selectedOffice?.officeId || this.officeId || null;
      this.isEditingCostCodes = true;
      return;
    }

    // Always emit event - parent can handle navigation if needed
    this.addCostCodeEvent.emit();
    
    // Only navigate if not embedded in settings (for standalone usage)
    if (!this.embeddedInSettings) {
      const url = RouterUrl.replaceTokens(RouterUrl.CostCodes, ['new']);
      const params: string[] = [];
      if (this.selectedOffice) {
        params.push(`officeId=${this.selectedOffice.officeId}`);
      }
      params.push('fromOffice=true');
      if (params.length > 0) {
        this.router.navigateByUrl(url + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(url);
      }
    }
  }

  onCostCodeCheckboxChange(event: CostCodesListDisplay): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyCostCodeIsActiveValue(event.costCodeId, event.officeId, nextValue);

    this.costCodesService.getCostCodeById(event.costCodeId, event.officeId).pipe(
      take(1),
      switchMap((costCode: CostCodesResponse) => this.costCodesService.updateCostCode(this.mappingService.mapCostCodeUpdateRequest(costCode, nextValue)).pipe(take(1))),
      finalize(() => {
        this.applyFilters();
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Cost code updated.', CommonMessage.Success);
        this.costCodesService.refreshCostCodesForOffice(event.officeId);
      },
      error: () => {
        this.applyCostCodeIsActiveValue(event.costCodeId, event.officeId, previousValue);
        this.toastr.error('Unable to update cost code.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  deleteCostCode(costCode: CostCodesResponse): void {
    const officeIdToUse = costCode.officeId || this.selectedOffice?.officeId;
    if (!officeIdToUse) {
      return;
    }
    this.costCodesService.deleteCostCode(officeIdToUse, costCode.costCodeId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Cost Code deleted successfully', CommonMessage.Success);
        this.costCodesService.refreshCostCodesForOffice(officeIdToUse);
        this.filterCostCodes();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  goToCostCode(event: CostCodesResponse): void {
    if (this.embeddedInSettings) {
      this.costCodesId = event.costCodeId;
      this.costCodesOfficeId = event.officeId || this.selectedOffice?.officeId || this.officeId || null;
      this.isEditingCostCodes = true;
      return;
    }

    // Always emit event - parent can handle navigation if needed
    this.editCostCodeEvent.emit({ 
      costCodeId: event.costCodeId, 
      officeId: event.officeId || this.selectedOffice?.officeId || null
    });
    
    // Only navigate if not embedded in settings (for standalone usage)
    if (!this.embeddedInSettings) {
      const url = RouterUrl.replaceTokens(RouterUrl.CostCodes, [event.costCodeId.toString()]);
      const params: string[] = [];
      // Use officeId from the response, fallback to selectedOffice
      const officeIdToUse = event.officeId || this.selectedOffice?.officeId;
      if (officeIdToUse) {
        params.push(`officeId=${officeIdToUse}`);
      }
      params.push('fromOffice=true');
      if (params.length > 0) {
        this.router.navigateByUrl(url + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(url);
      }
    }
  }

  onCostCodesBack(): void {
    if (this.selectedOffice?.officeId) {
      this.costCodesService.refreshCostCodesForOffice(this.selectedOffice.officeId);
    }
    this.costCodesId = null;
    this.costCodesOfficeId = null;
    this.isEditingCostCodes = false;
    this.filterCostCodes();
  }

  onCostCodesSaved(): void {
    this.costCodesService.refreshAllCostCodes();
    this.filterCostCodes();
  }
  //#endregion

  //#region Copy Codes
  onSelectionSet(selection: SelectionModel<unknown>): void {
    this.selectedCostCodes = (selection?.selected ?? []) as CostCodesListDisplay[];
    this.markViewForCheck();
  }

  copyCostCode(): void {
    if (this.selectedCostCodes.length === 0) {
      return;
    }

    this.dialog.open(CostCodeCopyOfficesDialogComponent, {
      data: { offices: this.offices },
      width: '28rem'
    }).afterClosed().pipe(take(1)).subscribe((officeIds: number[] | undefined) => {
      if (!officeIds?.length) {
        return;
      }
      this.copySelectedCostCodesToOffices(this.selectedCostCodes, officeIds);
    });
  }

  copySelectedCostCodesToOffices(sources: CostCodesListDisplay[], officeIds: number[]): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    const copyPairs: { source: CostCodesListDisplay; officeId: number }[] = [];
    for (const source of sources) {
      for (const officeId of officeIds) {
        if (source.officeId === officeId) {
          continue;
        }
        copyPairs.push({ source, officeId });
      }
    }

    if (copyPairs.length === 0) {
      this.toastr.error('No copies to create. Select different target office(s).', CommonMessage.Error);
      return;
    }

    from(copyPairs).pipe(
      concatMap(({ source, officeId }) => {
        const request: CostCodesRequest = {
          organizationId,
          officeId,
          costCode: source.costCode,
          transactionTypeId: source.transactionTypeId,
          description: source.description,
          isActive: source.isActive
        };
        return this.costCodesService.createCostCode(request).pipe(
          take(1),
          map(() => true),
          catchError(() => of(false))
        );
      }),
      toArray()
    ).subscribe({
      next: (results) => {
        const successCount = results.filter(success => success).length;
        const failCount = results.length - successCount;
        if (successCount > 0) {
          this.toastr.success(`${successCount} cost code${successCount === 1 ? '' : 's'} copied successfully.`, CommonMessage.Success);
        }
        if (failCount > 0) {
          this.toastr.error(`${failCount} cost code cop${failCount === 1 ? 'y' : 'ies'} failed.` + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.costCodesService.refreshAllCostCodes();
        this.filterCostCodes();
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        // API already filters offices by user access
        this.offices = allOffices || [];
        
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, useGlobalSelection: this.embeddedInSettings }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = this.embeddedInSettings ? false : uiState.showOfficeDropdown;
            const officeIdToUse = this.embeddedInSettings ? this.officeId : uiState.selectedOfficeId;
            this.resolveOfficeScope(officeIdToUse ?? null, this.officeId === null || this.officeId === undefined);
            this.markViewForCheck();
          }
        });
        this.markViewForCheck();
      });
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(() => {
          this.filterCostCodes();
          this.markViewForCheck();
        });
        this.markViewForCheck();
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts');
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.applyFilters();
        this.markViewForCheck();
      });
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Filter Methods
  onTitleBarOfficeIdUpdate(officeId: number | null): void {
    if (this.offices.length > 0) {
      this.resolveOfficeScope(officeId, false);
    } else {
      this.selectedOffice = null;
      this.filterCostCodes();
    }
  }

  onOfficeChange(): void {
    if (!this.embeddedInSettings) {
      this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    }
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.filterCostCodes();
  }
  
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allCostCodes;
    // Filter by inactive if needed
    // Use the @Input() showInactiveInput value if provided; otherwise use internal property
    const shouldShowInactive = this.showInactiveInput !== undefined 
      ? this.showInactiveInput 
      : this.showInactive;
    if (!shouldShowInactive) {
      filtered = filtered.filter(costCode => costCode.isActive !== false);
    }
    // Map cost codes using mapping service to convert transactionTypeId to display string
    const mapped = this.mappingService.mapCostCodes(
      filtered,
      this.offices,
      this.transactionTypes,
      this.chartOfAccountsService.getAllChartOfAccountsValue()
    );
    this.costCodesDisplay = mapped;
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
      // Show all cost codes across all offices when "All Offices" is selected
      this.costCodesService.getAllCostCodes().pipe(take(1)).subscribe(allCostCodes => {
        this.costCodes = allCostCodes || [];
        this.availableCostCodes = this.costCodes.filter(c => c.isActive).map(c => ({
          value: c.costCodeId,
          label: `${c.costCode}: ${c.description}`
        }));
        this.allCostCodes = this.costCodes;
        this.applyFilters();
        this.markViewForCheck();
      });
      return;
    }
    
    // Get cost codes for the selected office from the observable data
    this.costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice.officeId);
    this.availableCostCodes = this.costCodes.filter(c => c.isActive).map(c => ({
      value: c.costCodeId,
      label: `${c.costCode}: ${c.description}`
    }));
    
    // Update allCostCodes and apply filters
    this.allCostCodes = this.costCodes;
    this.applyFilters();
  }  

  toggleInactive(): void {
    // Toggle if showInactiveInput is undefined (component manages its own state)
    if (this.showInactiveInput === undefined) {
      this.showInactive = !this.showInactive;
      this.applyFilters();
    }
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    }
    this.filterCostCodes();
  }
  //#endregion

  //#region Dynamic List Methods
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.costCodesDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  applyCostCodeIsActiveValue(costCodeId: number, officeId: number, isActive: boolean): void {
    for (const costCode of this.allCostCodes) {
      if (costCode.costCodeId === costCodeId && costCode.officeId === officeId) {
        costCode.isActive = isActive;
        break;
      }
    }
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
