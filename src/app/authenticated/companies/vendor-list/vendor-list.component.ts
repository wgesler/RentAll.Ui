import { OnInit, Component, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { VendorResponse, VendorListDisplay } from '../models/vendor.model';
import { VendorService } from '../services/vendor.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-vendor-list',
  templateUrl: './vendor-list.component.html',
  styleUrls: ['./vendor-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class VendorListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() selectedOffice: OfficeResponse | null = null; // Office selection from parent
  @Output() officeChange = new EventEmitter<OfficeResponse | null>(); // Emit office changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['vendors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public vendorService: VendorService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private route: ActivatedRoute) {
  }

  //#region Vendor-List
  ngOnInit(): void {
    this.loadOffices();
  }

  getVendors(): void {
    this.vendorService.getVendors().pipe(take(1), finalize(() => { this.removeLoadItem('vendors'); })).subscribe({
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
    // Reapply filters when selectedOffice changes
    if (changes['selectedOffice']) {
      // Update local selectedOffice when input changes from parent
      this.selectedOffice = changes['selectedOffice'].currentValue;
      this.applyFilters();
    }
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
      // Offices are already loaded on login, so directly subscribe to changes
      // API already filters offices by user access
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        // Auto-select if only one office available and no office is already selected from parent
        if (this.offices.length === 1 && !this.selectedOffice) {
          this.selectedOffice = this.offices[0];
          this.officeChange.emit(this.selectedOffice);
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        this.getVendors();
    });
  }

  onOfficeChange(): void {
    // Emit office change to parent so all tabs can be updated
    this.officeChange.emit(this.selectedOffice);
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
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
    this.itemsToLoad$.complete();
  }
  //#endregion
}

