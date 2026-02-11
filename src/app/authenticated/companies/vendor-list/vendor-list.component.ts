import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { VendorListDisplay } from '../models/vendor.model';
import { VendorService } from '../services/vendor.service';

@Component({
    selector: 'app-vendor-list',
    templateUrl: './vendor-list.component.html',
    styleUrls: ['./vendor-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class VendorListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;

  vendorsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'vendorCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'phone': { displayAs: 'Phone' },
    'website': { displayAs: 'Website' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  allVendors: VendorListDisplay[] = [];
  vendorsDisplay: VendorListDisplay[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'vendors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public vendorService: VendorService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private route: ActivatedRoute,
    private utilityService: UtilityService) {
  }

  //#region Vendor-List
  ngOnInit(): void {
    this.loadOffices();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        if (this.selectedOffice) {
          this.applyFilters();
        }
      }
    });
  }

  getVendors(): void {
    this.vendorService.getVendors().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendors'); })).subscribe({
      next: (vendors) => {
        this.allVendors = this.mappingService.mapVendors(vendors);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  addVendor(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Vendor, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  deleteVendor(vendor: VendorListDisplay): void {
    if (confirm(`Are you sure you want to delete ${vendor.name}?`)) {
      this.vendorService.deleteVendor(vendor.vendorId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Vendor deleted successfully', CommonMessage.Success);
          this.getVendors(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToVendor(event: VendorListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Vendor, [event.vendorId]);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  copyVendor(event: VendorListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Vendor, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Add copyFrom parameter
    queryParams.copyFrom = event.vendorId;
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: queryParams
    });
  }
  //#endregion

  //#region Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allVendors;

    // Filter by office
    if (this.selectedOffice) {
      filtered = filtered.filter(vendor => vendor.officeId === this.selectedOffice.officeId);
    }

    // Filter by active status
    this.vendorsDisplay = this.showInactive
      ? filtered
      : filtered.filter(vendor => vendor.isActive);
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
          if (this.selectedOffice) {
            this.applyFilters();
          } else {
            this.applyFilters();
          }
        }
      }
    }
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        
        if (this.offices.length === 1 && (this.officeId === null || this.officeId === undefined)) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        if (this.officeId !== null && this.officeId !== undefined) {
          const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (matchingOffice !== this.selectedOffice) {
            this.selectedOffice = matchingOffice;
            if (this.selectedOffice) {
              this.applyFilters();
            } else {
              this.applyFilters();
            }
          }
        } else if (this.selectedOffice && this.offices.length === 1) {
          this.applyFilters();
        }
        
        this.getVendors();
      });
    });
  }

  onOfficeChange(): void {
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

