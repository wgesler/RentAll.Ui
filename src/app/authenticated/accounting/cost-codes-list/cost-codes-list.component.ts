import { OnInit, Component, OnDestroy, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { CostCodesResponse } from '../models/cost-codes.model';
import { CostCodesService } from '../services/cost-codes.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { TransactionTypeLabels } from '../models/accounting-enum';

@Component({
  selector: 'app-cost-codes-list',
  templateUrl: './cost-codes-list.component.html',
  styleUrls: ['./cost-codes-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class CostCodesListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() embeddedMode: boolean = false; // If true, hide header and office selector
  @Input() hideHeader: boolean = false; // If true, hide the header/sub-heading
  @Input() showInactiveInput?: boolean; // Input to control inactive filter from parent (for embedded mode). If provided, parent manages controls.
  @Output() addCostCodeEvent = new EventEmitter<void>();
  @Output() editCostCodeEvent = new EventEmitter<{ costCodeId: string, officeId: number | null }>();
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allCostCodes: CostCodesResponse[] = [];
  costCodesDisplay: any[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  costCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: string, label: string }[] = [];
  costCodesSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
 
  costCodesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    costCode: { displayAs: 'Cost Code', maxWidth: '20ch', sortType: 'natural' },
    transactionType: { displayAs: 'Type', maxWidth: '15ch' },
    description: { displayAs: 'Description', maxWidth: '33ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'costCodes']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public costCodesService: CostCodesService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  //#region CostCodes-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadCostCodes();
    
    // Handle query params for office selection changes (works in both embedded and non-embedded modes)
    // Wait for offices to load before processing query params
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            // Find office from already loaded offices
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              // Emit office change to parent if in embedded mode
              if (this.embeddedMode) {
                this.officeIdChange.emit(this.selectedOffice.officeId);
              }
              this.filterCostCodes();
            }
            this.applyFilters();
          }
        } else {
          if (!this.embeddedMode || this.officeId === null || this.officeId === undefined) {
            this.selectedOffice = null;
            this.allCostCodes = [];
            this.costCodesDisplay = [];
            this.applyFilters();
          }
        }
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent
    if (changes['officeId'] && this.embeddedMode) {
      const newOfficeId = changes['officeId'].currentValue;
      if (this.offices.length > 0) {
        this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
        if (this.selectedOffice) {
          this.filterCostCodes();
        } else {
          this.applyFilters();
        }
      } else {
        // Offices not loaded yet, wait for them to load in loadOffices()
        // The loadOffices() method will handle setting selectedOffice from officeId input
      }
    }
    
    // Watch for changes to showInactiveInput input
    if (changes['showInactiveInput'] && !changes['showInactiveInput'].firstChange) {
      // Reapply filters when showInactiveInput changes
      this.applyFilters();
    }
  }

  addCostCode(): void {
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.addCostCodeEvent.emit();
      return;
    }
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

  deleteCostCode(costCode: CostCodesResponse): void {
    // Use officeId from the costCode response, fallback to selectedOffice
    const officeIdToUse = costCode.officeId || this.selectedOffice?.officeId;
    if (!officeIdToUse) {
      return;
    }
    if (confirm(`Are you sure you want to delete this cost code?`)) {
      this.costCodesService.deleteCostCode(officeIdToUse, costCode.costCodeId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Cost Code deleted successfully', CommonMessage.Success);
          // Refresh cost codes for this office from the service
          this.costCodesService.refreshCostCodesForOffice(officeIdToUse);
          this.filterCostCodes(); // Refresh the display
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToCostCode(event: CostCodesResponse): void {
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.editCostCodeEvent.emit({ 
        costCodeId: event.costCodeId, 
        officeId: event.officeId || this.selectedOffice?.officeId || null
      });
      return;
    }
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
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.removeLoadItem('offices');
        
        // Set selectedOffice from input (embedded mode) or query params (standalone mode)
        if (this.embeddedMode && this.officeId !== null && this.officeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (!this.embeddedMode) {
          const snapshotParams = this.route.snapshot.queryParams;
          const officeIdParam = snapshotParams['officeId'];
          if (officeIdParam) {
            const parsedOfficeId = parseInt(officeIdParam, 10);
            if (parsedOfficeId) {
              this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            }
          }
        }
        
        // Only filter cost codes if an office is selected
        if (this.selectedOffice) {
          // Filter cost codes - this will work even if cost codes aren't loaded yet (will get empty array)
          // When cost codes load, they will trigger filtering again via loadCostCodes subscription
          this.filterCostCodes();
        } else {
          // No office selected, clear cost codes display
          this.allCostCodes = [];
          this.costCodesDisplay = [];
        }
      });
    });
  }

  loadCostCodes(): void {
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.removeLoadItem('costCodes');
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(codes => {
        this.filterCostCodes();
      });
    });
  }
  //#endregion

  //#region Filter Methods
  onOfficeChange(): void {
    // Emit office change to parent if in embedded mode
    if (this.embeddedMode && this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else if (this.embeddedMode && !this.selectedOffice) {
      this.officeIdChange.emit(null);
    }
    
    // Only filter cost codes if an office is selected
    if (this.selectedOffice) {
      this.filterCostCodes();
    } else {
      // Clear cost codes when no office is selected
      this.allCostCodes = [];
      this.costCodesDisplay = [];
      this.applyFilters();
    }
  }
  
  applyFilters(): void {
    let filtered = this.allCostCodes;
    // Filter by inactive if needed
    // In embedded mode, use the @Input() showInactiveInput value if provided; otherwise use internal property
    const shouldShowInactive = this.embeddedMode && this.showInactiveInput !== undefined 
      ? this.showInactiveInput 
      : this.showInactive;
    if (!shouldShowInactive) {
      filtered = filtered.filter(costCode => costCode.isActive !== false);
    }
    // Map cost codes using mapping service to convert transactionTypeId to display string
    const mapped = this.mappingService.mapCostCodes(filtered, this.offices, this.transactionTypes);
    this.costCodesDisplay = mapped;
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
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
    // Only toggle if not in embedded mode (parent controls it)
    if (!this.embeddedMode) {
      this.showInactive = !this.showInactive;
      this.applyFilters();
    }
  }
  //#endregion

  //#region Utility Methods
  addLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.add(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
