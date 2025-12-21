import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { VendorResponse, VendorListDisplay } from '../models/vendor.model';
import { VendorService } from '../services/vendor.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-vendor-list',
  templateUrl: './vendor-list.component.html',
  styleUrls: ['./vendor-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class VendorListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  vendorsDisplayedColumns: ColumnSet = {
    'vendorCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'phone': { displayAs: 'Phone' },
    'website': { displayAs: 'Website' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allVendors: VendorListDisplay[] = [];
  vendorsDisplay: VendorListDisplay[] = [];

  constructor(
    public vendorService: VendorService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('vendors');
  }

  ngOnInit(): void {
    this.getVendors();
  }

  getVendors(): void {
    this.vendorService.getVendors().pipe(take(1), finalize(() => { this.removeLoadItem('vendors') })).subscribe({
      next: (vendors) => {
        this.allVendors = this.mappingService.mapVendors(vendors);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Vendors', CommonMessage.ServiceError);
        }
      }
    });
  }

  addVendor(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Vendor, ['new']));
  }

  deleteVendor(vendor: VendorListDisplay): void {
    if (confirm(`Are you sure you want to delete ${vendor.name}?`)) {
      this.vendorService.deleteVendor(vendor.vendorId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Vendor deleted successfully', CommonMessage.Success);
          this.getVendors(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete vendor. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete vendor', CommonMessage.Error);
          }
        }
      });
    }
  }

  // Routing methods
  goToVendor(event: VendorListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Vendor, [event.vendorId]));
  }

  // Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.vendorsDisplay = this.showInactive
      ? this.allVendors
      : this.allVendors.filter(vendor => vendor.isActive);
  }

  // Utility helpers
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

