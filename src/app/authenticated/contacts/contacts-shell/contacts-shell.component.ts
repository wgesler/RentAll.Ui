import { ChangeDetectorRef, Component, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { skip, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { ContactService } from '../services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { ContactListComponent } from '../contact-list/contact-list.component';
import { ContactComponent } from '../contact/contact.component';
import { EntityType } from '../models/contact-enum';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
    standalone: true,
    selector: 'app-contacts-shell',
    imports: [
    MaterialModule,
    FormsModule,
    TitleBarSelectComponent,
    ContactListComponent,
    ContactComponent
],
    templateUrl: './contacts-shell.component.html',
    styleUrls: ['./contacts-shell.component.scss']
})
export class ContactsShellComponent implements OnInit, OnDestroy {
  @ViewChildren(ContactListComponent) contactSections?: QueryList<ContactListComponent>;

  EntityType = EntityType;
  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null;
  showInactive: boolean = false;
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  organizationId = '';
  private initialOfficeScopeApplied = false;
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
    private globalSelectionService: GlobalSelectionService,
    private contactService: ContactService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  //#region Contacts
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });
    this.applyQueryParamState(this.route.snapshot.queryParams);

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
    });

    this.loadOffices();
  }

  applyQueryParamState(params: Record<string, unknown>): void {
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 3);
    if (tabIndex !== null && this.selectedTabIndex !== tabIndex) {
      this.selectedTabIndex = tabIndex;
    }

    if (params['officeId'] === undefined) {
      return;
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null && this.offices.length > 0) {
      this.resolveOfficeScope(officeId);
      return;
    }

    if (getStringQueryParam(params, 'officeId') === null) {
      this.resolveOfficeScope(null);
    }
  }
  //#endregion

  //#region Form Response Methods
  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.resolveOfficeScope(officeId);
    this.updateUrlWithCurrentState();
    this.cdr.markForCheck();
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    this.updateUrlWithCurrentState();
  }

  onShowInactiveChange(showInactive: boolean): void {
    this.showInactive = showInactive;
  }

  updateUrlWithCurrentState(): void {
    const queryParams: Record<string, string> = { tab: this.selectedTabIndex.toString() };
    if (this.selectedOfficeId != null) {
      queryParams['officeId'] = this.selectedOfficeId.toString();
    } else {
      queryParams['officeId'] = '';
    }
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
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
      this.contactService.refreshContacts().pipe(take(1)).subscribe();
    }
  }

  onContactFormBack(): void {
    this.onContactClosed({});
  }

  isActiveContactFormVisible(): boolean {
    return this.showContactForm && this.formTabIndex === this.selectedTabIndex;
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        this.offices = allOffices || [];
        this.showOfficeDropdown = this.offices.length > 1;

        let didSetInitialOffice = false;
        if (!this.initialOfficeScopeApplied) {
          this.initialOfficeScopeApplied = true;
          this.applyQueryParamState(this.route.snapshot.queryParams);

          if (this.selectedOfficeId == null && this.offices.length === 1) {
            this.resolveOfficeScope(this.offices[0].officeId);
            didSetInitialOffice = true;
          } else if (this.selectedOfficeId == null) {
            const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
            if (globalOfficeId !== null && this.offices.some(office => office.officeId === globalOfficeId)) {
              this.resolveOfficeScope(globalOfficeId);
              didSetInitialOffice = true;
            }
          } else {
            this.resolveOfficeScope(this.selectedOfficeId);
          }
        } else if (this.selectedOfficeId != null) {
          this.resolveOfficeScope(this.selectedOfficeId);
        }

        this.cdr.markForCheck();
        this.propagateOfficeToContactLists();
        if (didSetInitialOffice) {
          this.updateUrlWithCurrentState();
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
  resolveOfficeScope(officeId: number | null): void {
    if (this.offices.length > 0) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
      return;
    }
    this.selectedOffice = null;
    this.selectedOfficeId = officeId;
  }

  /** Page-level office follows global header; does not write global. */
  private applyOfficeFromGlobal(officeId: number | null): void {
    this.resolveOfficeScope(this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    }));
    this.updateUrlWithCurrentState();
    this.cdr.markForCheck();
    this.propagateOfficeToContactLists();
  }

  private propagateOfficeToContactLists(): void {
    queueMicrotask(() => {
      const scopeOfficeId = this.selectedOfficeId;
      this.contactSections?.forEach(section => {
        section.resolveOfficeScope(scopeOfficeId);
        section.markViewForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
