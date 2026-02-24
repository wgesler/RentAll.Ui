import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TransactionTypeLabels } from '../models/accounting-enum';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { CostCodesResponse } from '../models/cost-codes.model';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-cost-codes-list',
    templateUrl: './cost-codes-list.component.html',
    styleUrls: ['./cost-codes-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, CostCodesComponent]
})

export class CostCodesListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() showInactiveInput?: boolean; // Input to control inactive filter from parent. If provided, parent manages controls.
  @Input() embeddedInSettings: boolean = false; // Input to indicate component is embedded in configuration settings
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() addCostCodeEvent = new EventEmitter<void>();
  @Output() editCostCodeEvent = new EventEmitter<{ costCodeId: string, officeId: number | null }>();
   
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allCostCodes: CostCodesResponse[] = [];
  costCodesDisplay: any[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  isEditingCostCodes: boolean = false;
  costCodesId: string | number | null = null;
  costCodesOfficeId: number | null = null;

  costCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: string, label: string }[] = [];
  costCodesSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
 
  costCodesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    costCode: { displayAs: 'Cost Code', maxWidth: '20ch', sortType: 'natural' },
    transactionType: { displayAs: 'Type', maxWidth: '15ch' },
    description: { displayAs: 'Description', maxWidth: '33ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, maxWidth: '20ch', sort: false, wrap: false, alignment: 'left' },
    rowColor: { displayAs: '', sort: false, wrap: false } // Hidden column for row coloring
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'costCodes']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public costCodesService: CostCodesService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private utilityService: UtilityService) {
  }

  //#region CostCodes-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadCostCodes();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      if (this.offices.length > 0) {
        this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
        // Filter cost codes - show all if no office selected, or filter by office if selected
        this.filterCostCodes();
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
    if (this.selectedOffice?.officeId) {
      this.costCodesService.refreshCostCodesForOffice(this.selectedOffice.officeId);
    }
    this.filterCostCodes();
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        // API already filters offices by user access
        this.offices = allOffices || [];
        
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        
        // Set selectedOffice from parent input.
        if (this.officeId !== null && this.officeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        }
        
        // Auto-select if only one office available (unless officeId input/query param is provided)
        if (this.offices.length === 1 && !this.selectedOffice) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        // Filter cost codes - show all if no office selected, or filter by office if selected
        // This will work even if cost codes aren't loaded yet (will get empty array)
        // When cost codes load, they will trigger filtering again via loadCostCodes subscription
        this.filterCostCodes();
      });
    });
  }

  loadCostCodes(): void {
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(codes => {
        this.filterCostCodes();
      });
    });
  }
  //#endregion

  //#region Filter Methods
  onOfficeChange(): void {
    // Emit office change to parent
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    
    // Filter cost codes - show all if no office selected, or filter by office if selected
    this.filterCostCodes();
  }
  
  applyFilters(): void {
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
    const mapped = this.mappingService.mapCostCodes(filtered, this.offices, this.transactionTypes);
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
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
