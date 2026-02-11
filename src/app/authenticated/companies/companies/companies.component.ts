import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, filter, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { CompanyListComponent } from '../company-list/company-list.component';
import { VendorListComponent } from '../vendor-list/vendor-list.component';

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
  destroy$ = new Subject<void>();
  
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) { }

  //#region Companies Parent Page
  ngOnInit(): void {
    this.applyQueryParamState(this.route.snapshot.queryParams);
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));
    
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
        
        this.showOfficeDropdown = this.offices.length !== 1;
        this.applyQueryParamState(this.route.snapshot.queryParams);

        if (!this.selectedOffice && this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.selectedOfficeId = this.offices[0].officeId;
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
    applyQueryParamState(params: Record<string, unknown>): void {
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 1);
    if (tabIndex !== null && this.selectedTabIndex !== tabIndex) {
      this.selectedTabIndex = tabIndex;
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null && this.offices.length > 0) {
      const matchedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.selectedOffice = matchedOffice;
      this.selectedOfficeId = matchedOffice?.officeId ?? null;
      return;
    }

    if (getStringQueryParam(params, 'officeId') === null) {
      this.selectedOffice = null;
      this.selectedOfficeId = null;
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
