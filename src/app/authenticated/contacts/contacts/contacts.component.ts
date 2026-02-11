
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, filter, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { ContactListComponent } from '../contact-list/contact-list.component';
import { EntityType } from '../models/contact-enum';

@Component({
    selector: 'app-contacts',
    imports: [
    MaterialModule,
    FormsModule,
    ContactListComponent
],
    templateUrl: './contacts.component.html',
    styleUrls: ['./contacts.component.scss']
})
export class ContactsComponent implements OnInit, OnDestroy {
  EntityType = EntityType;
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

  //#region Contacts
  ngOnInit(): void {
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    // Subscribe to query params for tab selection
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));
    
    // Load offices for shared office selection
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
    // Update URL query params when tab changes manually (user clicks tab)
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams: { tab: event.index.toString() },
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
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion

  applyQueryParamState(params: Record<string, unknown>): void {
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 3);
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
}
