import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
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
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { ReceiptSelection } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { ReceiptsListComponent } from '../../maintenance/receipts-list/receipts-list.component';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InvoiceComponent } from '../invoice/invoice.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-accounting-shell',
    standalone: true,
    imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    InvoiceComponent,
    InvoiceListComponent,
    ReceiptsListComponent,
    ReceiptComponent,
    TitleBarSelectComponent
],
    templateUrl: './accounting-shell.component.html',
    styleUrls: ['./accounting-shell.component.scss']
})
export class AccountingShellComponent implements OnInit, OnDestroy {
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;

  selectedTabIndex = 0;
  isSuperAdmin: boolean = false;
  currentUserOrganizationId: string | null = null;

  organizations: OrganizationResponse[] = [];
  offices: OfficeResponse[] = [];
  organizationId = '';
  initialOfficeScopeApplied = false;
  selectedOrganizationId: string | null = null;
  /** Page-level office filter: seeded from global; does not write global. */
  selectedOfficeId: number | null = null;
  selectedCompanyId: string | null = null;
  selectedReservationId: string | null = null;
  activeInvoiceId: string | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  /** Passed to invoice-list; updated only in syncInvoiceSearchDateRange. */
  invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
  billsSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };
  billsRefreshTrigger = 0;
  showBillsReceiptDetail = false;
  selectedBillsReceiptId: number | null = null;
  billsReceiptProperty: PropertyResponse | null = null;

  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private costCodesService: CostCodesService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private propertyService: PropertyService,
    private toastr: ToastrService
  ) {
    this.setDefaultDateRange();
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  //#region Accounting
  ngOnInit(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.initializeSuperAdminFilters();
    if (!this.isSuperAdmin) {
      this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      this.loadOffices();
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
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

  onAccountingInvoiceCompanyDropdownChange(value: string | number | null): void {
    this.selectedCompanyId = value == null || value === '' ? null : String(value);
  }

  onAccountingInvoiceReservationDropdownChange(value: string | number | null): void {
    const reservationId = value == null || value === '' ? null : String(value);
    if (!reservationId && !this.selectedReservationId) {
      return;
    }
    this.selectedReservationId = reservationId;
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

  //#region Bills Receipt Detail
  onBillsReceiptSelect(selection: ReceiptSelection): void {
    const receiptId = selection?.receiptId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
      this.syncBillsSearchRequest();
    }

    const openReceiptDetail = (property: PropertyResponse | null) => {
      this.selectedTabIndex = 1;
      this.billsReceiptProperty = property;
      this.selectedBillsReceiptId = receiptId;
      this.showBillsReceiptDetail = true;
    };

    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: (property: PropertyResponse) => openReceiptDetail(property),
        error: () => this.toastr.error('Unable to load property for receipt.', 'Error')
      });
      return;
    }

    openReceiptDetail(this.buildBillsReceiptPropertyStub(officeId));
  }

  onBillsReceiptBack(): void {
    this.showBillsReceiptDetail = false;
    this.selectedBillsReceiptId = null;
    this.billsReceiptProperty = null;
  }

  onBillsReceiptSaved(): void {
    this.onBillsReceiptBack();
    this.billsRefreshTrigger++;
  }

  buildBillsReceiptPropertyStub(officeId: number | null): PropertyResponse {
    const resolvedOfficeId = officeId ?? 0;
    const officeName = this.offices.find(office => office.officeId === resolvedOfficeId)?.name ?? '';
    return {
      propertyId: '',
      organizationId: this.organizationId,
      propertyCode: '',
      officeId: resolvedOfficeId,
      officeName,
      isActive: true
    } as PropertyResponse;
  }
  //#endregion

  //#region Tab Selection
  onTabChange(event: { index: number }): void {
    if (event.index !== 1) {
      this.onBillsReceiptBack();
    }
    this.selectedTabIndex = event.index;
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: String(event.index) }),
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Date Range
  syncInvoiceSearchDateRange(): void {
    this.invoiceSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  syncBillsSearchRequest(): void {
    this.billsSearchRequest = {
      officeIds: this.resolveOfficeIdsForBillsSearch(),
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  resolveOfficeIdsForBillsSearch(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }
    return this.offices.map(office => office.officeId).filter(id => id > 0);
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

    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
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

    if (this.isSuperAdmin) {
      if (this.currentUserOrganizationId) {
        params.push(`organizationId=${this.currentUserOrganizationId}`);
        params.push(`reservationId=${this.selectedOrganizationId}`);
      }
    } else {
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

  get isBillsReceiptDetailActive(): boolean {
    return this.selectedTabIndex === 1 && this.showBillsReceiptDetail;
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
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
  }

  onAccountingOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganizationId = organizationId;
  }

  applyQueryParamState(params: Record<string, string>): void {
    let tabIndex = getNumberQueryParam(params, 'tab', 0, 2);
    if (tabIndex !== null) {
      tabIndex = Math.min(Math.max(tabIndex, 0), 1);
      if (this.selectedTabIndex !== tabIndex) {
        this.selectedTabIndex = tabIndex;
      }
    }

    if ('officeId' in params) {
      this.applyPageOfficeScope(getNumberQueryParam(params, 'officeId'));
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
      this.syncInvoiceSearchDateRange();
      this.syncBillsSearchRequest();
      if (this.selectedTabIndex === 1) {
        queueMicrotask(() => { this.billsRefreshTrigger++; });
      }
    } else if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
      this.syncInvoiceSearchDateRange();
      this.syncBillsSearchRequest();
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
  }

  applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.syncBillsSearchRequest();
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

  buildShellQueryParams(overrides: Record<string, string | null> = {}): Record<string, string | null> {
    return {
      tab: String(this.selectedTabIndex),
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate),
      ...overrides
    };
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

    const url = params.length > 0
      ? `${RouterUrl.AccountingList}?${params.join('&')}`
      : RouterUrl.AccountingList;
    this.router.navigateByUrl(url);
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
            this.syncBillsSearchRequest();
          }
        });
      },
      error: () => {
        this.offices = [];
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
