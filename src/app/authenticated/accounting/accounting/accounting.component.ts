
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { ContactResponse } from '../../contacts/models/contact.model';
import { UserGroups } from '../../users/models/user-enums';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceComponent } from '../invoice/invoice.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-accounting',
    standalone: true,
    imports: [
    MaterialModule,
    FormsModule,
    InvoiceComponent,
    InvoiceListComponent,
    CostCodesListComponent,
    GeneralLedgerComponent,
    DocumentListComponent,
    EmailListComponent,
    TitleBarSelectComponent
],
    templateUrl: './accounting.component.html',
    styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;
  @ViewChild('accountingCostCodes') accountingCostCodes?: CostCodesListComponent;
  @ViewChild('accountingGeneralLedger') accountingGeneralLedger?: GeneralLedgerComponent;
  @ViewChild('accountingEmailList') accountingEmailList?: EmailListComponent;
  @ViewChild('accountingDocumentList') accountingDocumentList?: DocumentListComponent;
  selectedTabIndex: number = 0;
  isSuperAdmin: boolean = false;
  currentUserOrganizationId: string | null = null;

  organizations: OrganizationResponse[] = [];
  availableOffices: OfficeResponse[] = [];
  selectedOrganizationId: string | null = null;
  selectedOfficeId: number | null = null; 
  selectedCompanyId: string | null = null; 
  selectedReservationId: string | null = null; 
  activeInvoiceId: string | null = null;
   
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private costCodesService: CostCodesService,
    private utilityService: UtilityService
  ) { }

  //#region Accounting
  ngOnInit(): void {
    // Shared accounting reference data: load once for all accounting tabs/components.
    this.costCodesService.ensureCostCodesLoaded();
    this.initializeSuperAdminFilters();
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));

    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(paramMap => {
        const invoiceId = paramMap.get('id');
        this.activeInvoiceId = invoiceId;
        if (invoiceId && this.selectedTabIndex !== 0) {
          this.selectedTabIndex = 0;
        }
      });
  }

  initializeSuperAdminFilters(): void {
    this.isSuperAdmin = this.authService.hasRole(UserGroups.SuperAdmin);
    if (!this.isSuperAdmin) {
      return;
    }

    this.selectedOrganizationId = null;
    this.currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.organizationId !== this.currentUserOrganizationId);
      }
    });
  }
  //#endregion

  //#region Invoice Drop Downs
  onInvoiceOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onInvoiceOfficeChange(officeId: number | null): void {
   if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }
  
  onInvoiceCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onInvoiceReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //#region CostCode Drop Downs
  onCostCodesOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
     }
  }
  //#endregion

  //#region General Ledger Drop Downs
  onGeneralLedgerOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onGeneralLedgerOfficeChange(officeId: number | null): void {
     if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }

  onGeneralLedgerReservationChange(reservationId: string | null): void {
    // General Ledger child can emit null during initialization while hidden.
    // Do not let non-active tab emissions clear Invoice tab reservation state.
    if (this.selectedTabIndex !== 2 && reservationId === null) {
      return;
    }

    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }

  onGeneralLedgerCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }
  //#endregion

  //#region Document Drop Downs
  onDocumentsOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onDocumentsOfficeChange(officeId: number | null): void {
     if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
       this.selectedReservationId = null;
    }
  }

  onDocumentsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
      }
  }

  onDocumentsReservationChange(reservationId: string | null): void {
    if (this.selectedTabIndex !== 4 && reservationId === null) {
      return;
    }

    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //#region Email Drop Downs
  onEmailsOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onEmailsOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }

  onEmailsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }
  
  onEmailsReservationChange(reservationId: string | null): void {
    if (this.selectedTabIndex !== 3 && reservationId === null) {
      return;
    }

    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //#region Tab Selections
  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    this.costCodesService.ensureCostCodesLoaded();
    const queryParams: any = { tab: event.index.toString() };
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
    
  }

  onPrintInvoice(event: { officeId: number | null, reservationId: string | null, invoiceId: string }): void {
    const params: string[] = [];
    params.push(`returnTo=accounting`);
    params.push(`autoPrint=true`);
    
    if(this.isSuperAdmin)
    {
      if (this.currentUserOrganizationId) {
        params.push(`organizationId=${this.currentUserOrganizationId}`);
        params.push(`reservationId=${this.selectedOrganizationId}`);
      }
    }
    else {
      if (event.officeId !== null && event.officeId !== undefined) {
        params.push(`officeId=${event.officeId}`);
      }
      if (this.selectedCompanyId) {
        params.push(`companyId=${this.selectedCompanyId}`);
      }
      if (event.reservationId !== null && event.reservationId !== undefined && event.reservationId !== '') {
        params.push(`reservationId=${event.reservationId}`);
      }
      if (event.invoiceId) {
        params.push(`invoiceId=${event.invoiceId}`);
      }
    }
    
    const url = params.length > 0 
      ? `${RouterUrl.InvoiceCreate}?${params.join('&')}`
      : RouterUrl.InvoiceCreate;
    this.router.navigateByUrl(url);
  }

  //#endregion

  //#region Utility Methods
  getOfficeOptions(offices: OfficeResponse[] | null | undefined): { value: number, label: string }[] {
    return (offices || []).map(office => ({ value: office.officeId, label: office.name }));
  }

  getAccountingCompanyOptions(contacts: ContactResponse[] | null | undefined, selectedOfficeId: number | null | undefined): { value: string, label: string }[] {
    const dedupedByCompanyLabel = new Map<string, { value: string, label: string }>();
    const normalizeCompanyKey = (label: string): string => label.replace(/[^a-z0-9]/gi, '').toLowerCase();

    (contacts || [])
      .filter(contact => !!contact?.isActive)
      .filter(contact => selectedOfficeId == null || contact.officeId === selectedOfficeId || (contact.officeAccess || []).some(id => Number(id) === selectedOfficeId))
      .forEach(contact => {
        const label = this.getAccountingCompanyLabel(contact);
        if (!label) {
          return;
        }
        const dedupeKey = normalizeCompanyKey(label);

        if (!dedupedByCompanyLabel.has(dedupeKey)) {
          dedupedByCompanyLabel.set(dedupeKey, {
            value: contact.contactId,
            label
          });
          return;
        }

        const existing = dedupedByCompanyLabel.get(dedupeKey)!;
        // Prefer the more descriptive label when two variants normalize to same company key.
        if (label.length > existing.label.length) {
          dedupedByCompanyLabel.set(dedupeKey, {
            value: contact.contactId,
            label
          });
        }
      });

    return Array.from(dedupedByCompanyLabel.values())
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
        || a.value.localeCompare(b.value, undefined, { sensitivity: 'base' })
      )
      .map(({ value, label }) => ({ value, label }));
  }

  getAccountingCompanyLabel(contact: ContactResponse | null | undefined): string {
    return this.utilityService.getCompanyDropdownLabel(contact);
  }

  getReservationOptions(reservations: { value: { reservationId: string }, label: string }[] | null | undefined): { value: string, label: string }[] {
    return (reservations || []).map(reservation => ({ value: reservation.value.reservationId, label: reservation.label }));
  }

  get organizationTitleBarOptions(): { value: string, label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
    }));
  }

  get accountingEmailTypeOptions(): { value: number, label: string }[] {
    return this.accountingEmailList?.emailTypeOptions || [];
  }

  get selectedAccountingEmailTypeId(): number | null {
    return this.accountingEmailList?.selectedEmailTypeId ?? null;
  }

  get accountingDocumentTypeOptions(): { value: number, label: string }[] {
    return this.accountingDocumentList?.documentTypeOptions || [];
  }

  get selectedAccountingDocumentTypeId(): number | null {
    return this.accountingDocumentList?.selectedDocumentTypeId ?? null;
  }

  get selectedOrganizationName(): string | null {
    if (!this.selectedOrganizationId) {
      return null;
    }
    return this.organizations.find(organization => organization.organizationId === this.selectedOrganizationId)?.name || null;
  }

  onAccountingOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganizationId = organizationId;
  }

  onAccountingInvoiceOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }
    const officeId = value == null || value === '' ? null : Number(value);
    this.accountingInvoiceList.selectedOffice = officeId == null
      ? null
      : this.accountingInvoiceList.offices.find(office => office.officeId === officeId) || null;
    this.accountingInvoiceList.onOfficeChange();
  }

  onAccountingInvoiceCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingInvoiceList.selectedCompanyContact = contactId
      ? this.accountingInvoiceList.companyContacts.find(company =>
          company.contactId === contactId
          && (!this.accountingInvoiceList?.selectedOffice || company.officeId === this.accountingInvoiceList.selectedOffice.officeId)
          && !!company.isActive
        ) || null
      : null;
    this.accountingInvoiceList.onCompanyChange();
  }

  onAccountingInvoiceReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }

    // During list initialization, the title-bar select can briefly emit null before
    // reservation options are hydrated. Ignore that transient clear so route state wins.
    if (
      (value == null || value === '')
      && !!this.selectedReservationId
      && (this.accountingInvoiceList.availableReservations?.length ?? 0) === 0
    ) {
      return;
    }

    const reservationId = value == null || value === '' ? null : String(value);
    this.accountingInvoiceList.selectedReservation = reservationId
      ? this.accountingInvoiceList.availableReservations.find(reservation => reservation.value.reservationId === reservationId)?.value || null
      : null;
    this.accountingInvoiceList.onReservationChange();
  }

  onAccountingInvoiceEditorOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceEditor) {
      return;
    }
    this.accountingInvoiceEditor.onTitleBarOfficeChange(value);
  }

  onAccountingInvoiceEditorReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceEditor) {
      return;
    }
    this.accountingInvoiceEditor.onTitleBarReservationChange(value);
  }

  onAccountingCostCodesOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingCostCodes) {
      return;
    }
    const officeId = value == null || value === '' ? null : Number(value);
    this.accountingCostCodes.selectedOffice = officeId == null
      ? null
      : this.accountingCostCodes.offices.find(office => office.officeId === officeId) || null;
    this.accountingCostCodes.onOfficeChange();
  }

  onAccountingGeneralLedgerOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    this.accountingGeneralLedger.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingGeneralLedger.onOfficeChange();
  }

  onAccountingGeneralLedgerCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingGeneralLedger.selectedCompanyContact = contactId
      ? this.accountingGeneralLedger.companyContacts.find(company =>
          company.contactId === contactId
          && (this.accountingGeneralLedger?.selectedOfficeId == null || company.officeId === this.accountingGeneralLedger.selectedOfficeId)
          && !!company.isActive
        ) || null
      : null;
    this.accountingGeneralLedger.onCompanyChange();
  }

  onAccountingGeneralLedgerReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    this.accountingGeneralLedger.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingGeneralLedger.onReservationChange();
  }

  onAccountingEmailOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    this.accountingEmailList.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingEmailList.onOfficeChange();
  }

  onAccountingEmailCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingEmailList.selectedCompanyContact = contactId
      ? this.accountingEmailList.companyContacts.find(company =>
          company.contactId === contactId
          && (this.accountingEmailList?.selectedOfficeId == null || company.officeId === this.accountingEmailList.selectedOfficeId)
          && !!company.isActive
        ) || null
      : null;
    this.accountingEmailList.onCompanyChange();
  }

  onAccountingEmailReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    this.accountingEmailList.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingEmailList.onReservationChange();
  }

  onAccountingEmailTypeDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    this.accountingEmailList.onEmailTypeDropdownChange(value);
  }

  onAccountingDocumentOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingDocumentList.onOfficeChange();
  }

  onAccountingDocumentCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingDocumentList.selectedCompany = contactId
      ? this.accountingDocumentList.companies.find(company =>
          company.contactId === contactId
          && (this.accountingDocumentList?.selectedOfficeId == null || company.officeId === this.accountingDocumentList.selectedOfficeId)
          && !!company.isActive
        ) || null
      : null;
    this.accountingDocumentList.onCompanyChange();
  }

  onAccountingDocumentReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingDocumentList.onReservationChange();
  }

  onAccountingDocumentTypeDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.onDocumentTypeDropdownChange(value);
  }

  applyQueryParamState(params: Record<string, string>): void {
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 4);
    if (tabIndex !== null && this.selectedTabIndex !== tabIndex) {
      this.selectedTabIndex = tabIndex;
    }

    if ('officeId' in params) {
      this.selectedOfficeId = getNumberQueryParam(params, 'officeId');
    }

    if ('reservationId' in params) {
      const reservationId = params['reservationId'];
      this.selectedReservationId = reservationId ? String(reservationId) : null;
    }

    if ('companyId' in params) {
      const companyId = params['companyId'];
      this.selectedCompanyId = companyId ? String(companyId) : null;
    }

    if ('organizationId' in params) {
      const organizationId = params['organizationId'];
      this.selectedOrganizationId = organizationId ? String(organizationId) : null;
    }
  }

  closeEmbeddedInvoiceEditor(): void {
    this.activeInvoiceId = null;

    const currentQueryParams = this.route.snapshot.queryParams || {};
    const editorFormValue = this.accountingInvoiceEditor?.form?.getRawValue?.() || {};
    const officeIdFromEditor = editorFormValue?.officeId;
    const reservationIdFromEditor = editorFormValue?.reservationId;
    const reservationIdFromEditorSelection = this.accountingInvoiceEditor?.selectedReservation?.reservationId ?? null;

    const officeIdToUse = this.selectedOfficeId
      ?? getNumberQueryParam(currentQueryParams, 'officeId')
      ?? (officeIdFromEditor != null && officeIdFromEditor !== '' ? Number(officeIdFromEditor) : null);
    const reservationIdToUse = (reservationIdFromEditor ? String(reservationIdFromEditor) : null)
      ?? (reservationIdFromEditorSelection ? String(reservationIdFromEditorSelection) : null)
      ?? this.selectedReservationId
      ?? (currentQueryParams['reservationId'] ? String(currentQueryParams['reservationId']) : null);
    const companyIdToUse = this.selectedCompanyId
      ?? (currentQueryParams['companyId'] ? String(currentQueryParams['companyId']) : null);
    const organizationIdToUse = this.selectedOrganizationId
      ?? (currentQueryParams['organizationId'] ? String(currentQueryParams['organizationId']) : null);

    this.selectedOfficeId = officeIdToUse;
    this.selectedReservationId = reservationIdToUse;
    this.selectedCompanyId = companyIdToUse;
    this.selectedOrganizationId = organizationIdToUse;

    const params: string[] = ['tab=0'];
    if (officeIdToUse !== null && officeIdToUse !== undefined) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    if (companyIdToUse) {
      params.push(`companyId=${companyIdToUse}`);
    }
    if (organizationIdToUse) {
      params.push(`organizationId=${organizationIdToUse}`);
    }

    this.router.navigateByUrl(`${RouterUrl.AccountingList}?${params.join('&')}`);
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

}
