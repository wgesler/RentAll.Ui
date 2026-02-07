import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { CompanyListComponent } from '../company-list/company-list.component';
import { VendorListComponent } from '../vendor-list/vendor-list.component';
import { Router, ActivatedRoute } from '@angular/router';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { Subscription, filter, take } from 'rxjs';

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    CompanyListComponent,
    VendorListComponent
  ],
  templateUrl: './companies.component.html',
  styleUrls: ['./companies.component.scss']
})
export class CompaniesComponent implements OnInit, OnDestroy {
  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) { }

  //#region Companies Parent Page
  ngOnInit(): void {
    const initialParams = this.route.snapshot.queryParams;
    if (initialParams['tab']) {
      const tabIndex = parseInt(initialParams['tab'], 10);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 1) {
        this.selectedTabIndex = tabIndex;
      }
    }

    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tabIndex = parseInt(params['tab'], 10);
        if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 1 && this.selectedTabIndex !== tabIndex) {
          this.selectedTabIndex = tabIndex;
        }
      }
    });
    
    this.loadOffices();
  }
  //#endregion

  //#region Form Response Methods
  onOfficeIdChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    
    if (officeId !== null) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    } else {
      this.selectedOffice = null;
    }
    
    const queryParams: any = { tab: this.selectedTabIndex.toString() };
    if (officeId !== null) {
      queryParams.officeId = officeId.toString();
    } else {
      queryParams.officeId = null;
    }
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    const queryParams: any = { tab: event.index.toString() };
    if (this.selectedOfficeId !== null) {
      queryParams.officeId = this.selectedOfficeId.toString();
    }
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        const officeIdFromParams = this.route.snapshot.queryParams['officeId'];
        if (officeIdFromParams) {
          const officeId = parseInt(officeIdFromParams, 10);
          if (!isNaN(officeId)) {
            const office = this.offices.find(o => o.officeId === officeId);
            if (office) {
              this.selectedOffice = office;
              this.selectedOfficeId = office.officeId;
              this.showOfficeDropdown = true;
              return;
            }
          }
        }
        
        if (this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.selectedOfficeId = this.offices[0].officeId;
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
      });
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              this.selectedOfficeId = this.selectedOffice.officeId;
            }
          }
        } else {
          this.selectedOffice = null;
          this.selectedOfficeId = null;
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
