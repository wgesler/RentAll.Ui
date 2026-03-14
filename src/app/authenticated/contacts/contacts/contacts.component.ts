
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, filter, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { ContactService } from '../services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { ContactListComponent } from '../contact-list/contact-list.component';
import { ContactComponent } from '../contact/contact.component';
import { EntityType } from '../models/contact-enum';

@Component({
    standalone: true,
    selector: 'app-contacts',
    imports: [
    MaterialModule,
    FormsModule,
    ContactListComponent,
    ContactComponent
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
  private globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  destroy$ = new Subject<void>();

  /** Embedded contact form: when set, show form in the tab with this index instead of list. */
  showContactForm = false;
  formContactId: string | null = null;
  formCopyFrom: string | null = null;
  formEntityTypeId: number | null = null;
  formTabIndex: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private contactService: ContactService
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

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.selectedOffice = officeId != null ? this.offices.find(o => o.officeId === officeId) || null : null;
        this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
        const queryParams: Record<string, string> = { tab: this.selectedTabIndex.toString() };
        if (this.selectedOfficeId != null) queryParams['officeId'] = this.selectedOfficeId.toString();
        else queryParams['officeId'] = '';
        this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
      }
    });
  }

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
  //#endregion

  //#region Form Response Methods
  onOfficeIdChange(officeId: number | null): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(officeId);
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

  onOpenContact(event: { contactId: string; copyFrom?: string; entityTypeId?: number; tabIndex?: number }): void {
    this.formContactId = event.contactId;
    this.formCopyFrom = event.copyFrom ?? null;
    this.formEntityTypeId = event.entityTypeId ?? null;
    this.formTabIndex = event.tabIndex ?? this.selectedTabIndex;
    this.showContactForm = true;
  }

  onContactClosed(_event: { saved?: boolean }): void {
    this.showContactForm = false;
    this.formContactId = null;
    this.formCopyFrom = null;
    this.formEntityTypeId = null;
    this.formTabIndex = null;
    if (_event.saved) {
      this.contactService.loadAllContacts().pipe(take(1)).subscribe();
    }
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
        } else if (!this.selectedOffice) {
          const globalOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
          if (globalOfficeId !== null) {
            const globalOffice = this.offices.find(office => office.officeId === globalOfficeId) || null;
            if (globalOffice) {
              this.selectedOffice = globalOffice;
              this.selectedOfficeId = globalOffice.officeId;
            }
          }
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
