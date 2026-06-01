import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { UserGroups } from '../../users/models/user-enums';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentGetRequest } from '../../documents/models/document.model';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
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
    CommonModule,
    MaterialModule,
    FormsModule,
    InvoiceComponent,
    InvoiceListComponent,
    CostCodesListComponent,
    GeneralLedgerComponent,
    DocumentListComponent,
    TitleBarSelectComponent
],
    templateUrl: './accounting.component.html',
    styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  readonly DocumentType = DocumentType;
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;
  @ViewChild('accountingCostCodes') accountingCostCodes?: CostCodesListComponent;
  @ViewChild('accountingGeneralLedger') accountingGeneralLedger?: GeneralLedgerComponent;
  @ViewChild('accountingDocumentList') accountingDocumentList?: DocumentListComponent;
  selectedTabIndex: number = 0;
  isSuperAdmin: boolean = false;
  currentUserOrganizationId: string | null = null;

  organizations: OrganizationResponse[] = [];
  offices: OfficeResponse[] = [];
  organizationId = '';
  private initialOfficeScopeApplied = false;
  selectedOrganizationId: string | null = null;
  /** Page-level office filter: seeded from global; does not write global. */
  selectedOfficeId: number | null = null;
  selectedCompanyId: string | null = null; 
  selectedReservationId: string | null = null; 
  activeInvoiceId: string | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  documentRequest: DocumentGetRequest = { officeIds: [] };
  /** Passed to invoice-list; updated only in syncInvoiceSearchDateRange (same pattern as documentRequest). */
  invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
   
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private costCodesService: CostCodesService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService
  ) {
    this.setDefaultDateRange();
    this.syncDocumentRequest();
    this.syncInvoiceSearchDateRange();
  }

  //#region Accounting
  ngOnInit(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.initializeSuperAdminFilters();
    if (!this.isSuperAdmin) {
      this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      this.loadOffices();
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)) .subscribe(officeId => {
        this.applyOfficeFromGlobal(officeId);
      });
    }
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => this.applyQueryParamState(params));

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
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
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
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
    this.selectedCompanyId = contactId;
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

    const reservationId = value == null || value === '' ? null : String(value);

    // During list initialization, the title-bar select can briefly emit null before
    // reservation options are hydrated. Ignore only when parent already has no selection.
    if (
      !reservationId
      && !this.selectedReservationId
      && (this.accountingInvoiceList.availableReservations?.length ?? 0) === 0
    ) {
      return;
    }

    this.selectedReservationId = reservationId;
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
  
  //#endregion

  //#region CostCode Drop Downs
  onCostCodesOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
     }
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
 //#endregion

  //#region Document Drop Downs
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
    if (this.selectedTabIndex !== 3 && reservationId === null) {
      return;
    }

    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
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
    
  syncDocumentRequest(): void {
    this.documentRequest = {
      officeIds: this.resolveOfficeIdsForDocumentRequest(),
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  syncInvoiceSearchDateRange(): void {
    this.invoiceSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  resolveOfficeIdsForDocumentRequest(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }
    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }
  //#endregion

  //#region Tab Selections
  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    this.propagateOfficeToAccountingTabs();
    this.costCodesService.ensureCostCodesLoaded();
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: event.index.toString() }),
      queryParamsHandling: 'merge'
    });
    
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
    } else if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }

    this.syncDocumentRequest();
    this.syncInvoiceSearchDateRange();
    this.reloadDateFilteredTabs();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
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

  //#region Get Methods
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

  get showShellOfficeDropdown(): boolean {
    return !this.isSuperAdmin && this.offices.length > 0;
  }

  get showShellDateRange(): boolean {
    return !this.activeInvoiceId;
  }

  get shellOfficeTitleBarOptions(): { value: number, label: string }[] {
    return this.getOfficeOptions(this.offices);
  }

  get organizationTitleBarOptions(): { value: string, label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
    }));
  }

  get selectedOrganizationName(): string | null {
    if (!this.selectedOrganizationId) {
      return null;
    }
    return this.organizations.find(organization => organization.organizationId === this.selectedOrganizationId)?.name || null;
  }

  getInvoiceEditorOfficeFieldClass(): string {
    const baseClass = 'titlebar-field-office';
    if (!this.accountingInvoiceEditor?.showOfficeValidationError) {
      return baseClass;
    }
    return `${baseClass} invoice-required-field`;
  }

  getInvoiceEditorReservationFieldClass(): string {
    return 'titlebar-field-reservation';
  }
  //#endregion 

  //#region Form Response Methods
  onShellOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    const officeChanged = this.selectedOfficeId !== officeId;
    this.applyPageOfficeScope(officeId);
    if (officeChanged) {
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    if (this.selectedTabIndex === 3) {
      this.selectedReservationId = null;
    }
    this.propagateOfficeToAccountingTabs();
  }

  onAccountingOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganizationId = organizationId;
  }

  applyQueryParamState(params: Record<string, string>): void {
    let tabIndex = getNumberQueryParam(params, 'tab', 0, 4);
    if (tabIndex !== null) {
      if (tabIndex === 4) {
        tabIndex = 3;
      }
      tabIndex = Math.min(tabIndex, 3);
      if (this.selectedTabIndex !== tabIndex) {
        this.selectedTabIndex = tabIndex;
      }
    }

    if ('officeId' in params) {
      this.applyPageOfficeScope(getNumberQueryParam(params, 'officeId'));
      this.propagateOfficeToAccountingTabs();
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

    const startDateParam = getStringQueryParam(params, 'startDate');
    const endDateParam = getStringQueryParam(params, 'endDate');
    if (startDateParam || endDateParam) {
      this.startDate = this.utilityService.parseDateOnlyStringToDate(startDateParam);
      this.endDate = this.utilityService.parseDateOnlyStringToDate(endDateParam);
      this.normalizeDateRangeValues();
      this.syncDocumentRequest();
      this.syncInvoiceSearchDateRange();
      this.reloadDateFilteredTabs();
    } else if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
      this.syncDocumentRequest();
      this.syncInvoiceSearchDateRange();
    }
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    let resolvedOfficeId: number | null = officeId;
    if (this.offices.length === 1) {
      resolvedOfficeId = this.offices[0].officeId;
    } else if (this.offices.length > 1) {
      resolvedOfficeId = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
    }
    const officeChanged = this.selectedOfficeId !== resolvedOfficeId;
    this.applyPageOfficeScope(resolvedOfficeId);
    if (officeChanged) {
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    if (this.selectedTabIndex === 3) {
      this.selectedReservationId = null;
    }
    this.propagateOfficeToAccountingTabs();
  }

  applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  propagateOfficeToAccountingTabs(): void {
    this.syncDocumentRequest();
    queueMicrotask(() => {
      this.accountingInvoiceList?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      this.accountingCostCodes?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      this.accountingGeneralLedger?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      this.accountingDocumentList?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      this.reloadDateFilteredTabs();
    });
  }

  setDefaultDateRange(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);

    this.endDate = end;
    this.startDate = start;
  }

  normalizeDateRangeValues(): void {
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
      return;
    }
    if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }
  }

  reloadDateFilteredTabs(): void {
    queueMicrotask(() => {
      this.accountingDocumentList?.reload();
    });
  }

  buildShellQueryParams(overrides: Record<string, string | null> = {}): Record<string, string | null> {
    const queryParams: Record<string, string | null> = {
      tab: String(this.selectedTabIndex),
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate),
      ...overrides
    };
    return queryParams;
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
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    if (!this.organizationId) {
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(
            o => o.organizationId === this.organizationId && o.isActive
          );

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(
                this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
              );
            }
            this.propagateOfficeToAccountingTabs();
            this.syncDocumentRequest();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.syncDocumentRequest();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
