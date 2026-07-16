import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { GlobalSelectionService } from '../../../organizations/services/global-selection.service';
import { OfficeService } from '../../../organizations/services/office.service';
import { ReservationCodeResponse, ReservationResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../../shared/titlebar-select/titlebar-select.component';
import { TransactionType, TransactionTypeLabels } from '../../models/accounting-enum';
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceMonthlyDataRequest, InvoiceMonthlyDataResponse, InvoicePreviewSelection, InvoiceRequest, InvoiceResponse, LedgerLineListDisplay, LedgerLineRequest } from '../../models/invoice.model';
import { InvoiceService } from '../../services/invoice.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { CostCodesService } from '../../services/cost-codes.service';

@Component({
    standalone: true,
    selector: 'app-invoice',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, TitleBarSelectComponent],
    templateUrl: './invoice.component.html',
    styleUrl: './invoice.component.scss'
})

export class InvoiceComponent implements OnInit, OnDestroy, OnChanges {

  @Input() shellMode: boolean = false;
  @Input() embedDocumentPreviewInShell = false;
  @Input() invoiceIdInput: string | null = null;
  @Input() officeIdInput: number | null = null;
  @Input() reservationIdInput: string | null = null;
  @Input() companyIdInput: string | null = null;
  @Input() prefetchedInvoice: InvoiceResponse | null = null;
  @Output() previewEvent = new EventEmitter<InvoicePreviewSelection>();
  accountingService = inject(InvoiceService);
  router = inject(Router);
  fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private officeService = inject(OfficeService);
  private reservationService = inject(ReservationService);
  private authService = inject(AuthService);
  private mappingService = inject(MappingService);
  private costCodesService = inject(CostCodesService);
  formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private journalEntryService = inject(JournalEntryService);
  private cdr = inject(ChangeDetectorRef);

  isServiceError: boolean = false;
  invoiceId: string;
  invoice: InvoiceResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  saveAttempted: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;

  reservations: ReservationCodeResponse[] = [];
  availableReservations: { value: string, label: string }[] = [];
  selectedReservation: ReservationCodeResponse | null = null;
  selectedReservationDetail: ReservationResponse | null = null;
  selectedReservationDetailRequestId: string | null = null;
  
  companyId: string | null = null;
  
  allCostCodes: CostCodesResponse[] = [];
  officeCostCodes:CostCodesResponse[] = [];
  debitCostCodes: CostCodesResponse[] = [];
  creditCostCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: number, label: string }[] = [];
  officeAvailableCostCodes: { value: number, label: string }[] = [];
  isPaymentMode: boolean = false;
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
  ledgerLines: LedgerLineListDisplay[] = [];
  originalLedgerLines: LedgerLineListDisplay[] = [];
  originalFormSnapshot: {
    officeId: number | null;
    reservationId: string | null;
    startDate: string | null;
    endDate: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    accountingPeriod: string | null;
    notes: string | null;
    isActive: boolean;
  } | null = null;

  routeInvoiceId: string | null = null;
  contextReady: boolean = false;
  lastContextKey: string | null = null;
  activeInvoiceLoadId = 0;
  organizationId = '';
  private addModeQueryParamsBound = false;

  isPageReady = false;
  isInvoiceContentReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['invoice', 'reservations']));
  destroy$ = new Subject<void>();

  //#region Invoice
  ngOnInit(): void {
    this.isPaymentMode = false;
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.routeInvoiceId = this.route.snapshot.paramMap.get('id');
    const initialInvoiceId = this.resolveInvoiceContextId();
    this.isAddMode = !initialInvoiceId || initialInvoiceId === 'new';
    if (initialInvoiceId) {
      this.invoiceId = initialInvoiceId;
    }

    if (this.isAddMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');
    }

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.markForCheck();
    });

    this.loadOffices();
    this.loadReservationCodes();
    this.loadCostCodes();

    this.buildForm();
    this.setupFormHandlers();
    this.contextReady = true;
    this.initializeInvoiceContext(false);

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0 && this.isAddMode && this.form) {
        this.resolveOfficeScope(officeId);
        this.form.get('officeId')?.setValue(this.selectedOffice?.officeId ?? null, { emitEvent: false });
        this.updateAvailableReservations();
        this.filterCostCodes();
      }
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((paramMap: ParamMap) => {
      this.routeInvoiceId = paramMap.get('id');
      if (this.contextReady && !this.shellMode) {
        this.initializeInvoiceContext(false);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.contextReady) {
      return;
    }

    if (changes['shellMode'] || changes['invoiceIdInput']) {
      this.initializeInvoiceContext(false);
    }


    if (this.isAddMode && (
      changes['shellMode'] ||
      changes['invoiceIdInput'] ||
      changes['officeIdInput'] ||
      changes['reservationIdInput'] ||
      changes['companyIdInput']
    )) {
      this.applyPrefilledInvoiceContext();
    }
  }

  resolveInvoiceContextId(): string | null {
    if (this.invoiceIdInput !== null && this.invoiceIdInput !== undefined && this.invoiceIdInput !== '') {
      return this.invoiceIdInput;
    }

    if (this.shellMode) {
      return null;
    }

    return this.routeInvoiceId;
  }

  initializeInvoiceContext(force: boolean = false): void {
    const contextInvoiceId = this.resolveInvoiceContextId();
    if (!contextInvoiceId) {
      return;
    }

    const contextKey = [
      contextInvoiceId,
      this.officeIdInput ?? '',
      this.reservationIdInput ?? '',
      this.companyIdInput ?? '',
      this.shellMode ? 'shell' : 'route'
    ].join('|');

    if (!force && this.lastContextKey === contextKey) {
      return;
    }

    this.lastContextKey = contextKey;
    this.invoiceId = contextInvoiceId;
    this.isAddMode = !this.invoiceId || this.invoiceId === 'new';

    if (!this.isAddMode) {
      // Always GET by id for the editor. List rows / prefetch are summary-shaped and
      // frequently omit (or already remapped) ledger lines.
      this.isInvoiceContentReady = false;
      this.getInvoice();
    } else {
      this.invoice = null as any;
      this.ledgerLines = [];
      this.originalLedgerLines = [];
      this.originalFormSnapshot = null;
      this.isInvoiceContentReady = true;
      this.handleAddModeQueryParams();
    }
  }

  handleAddModeQueryParams(): void {
    this.processQueryParams(this.route.snapshot.queryParams);

    if (this.addModeQueryParamsBound) {
      return;
    }
    this.addModeQueryParamsBound = true;

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      this.processQueryParams(queryParams);
    });
  }

  processQueryParams(queryParams: Record<string, unknown> = this.route.snapshot.queryParams): void {
    this.applyPrefilledInvoiceContext(queryParams);

    if (this.isAddMode && this.offices.length > 0 && this.form && !this.form.get('officeId')?.value && !this.shellMode) {
      const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      if (globalOfficeId != null) {
        this.resolveOfficeScope(globalOfficeId);
        if (this.selectedOffice) {
          this.form.get('officeId')?.setValue(this.selectedOffice.officeId, { emitEvent: false });
          this.updateAvailableReservations();
          this.filterCostCodes();
        }
      }
    }
  }

  applyPrefilledInvoiceContext(queryParams: Record<string, unknown> = this.route.snapshot.queryParams): void {
    if (!this.isAddMode || !this.form) {
      return;
    }

    const reservationIdParam = this.getContextReservationId(queryParams);
    const companyIdParam = this.companyIdInput ?? queryParams['companyId'];
    const reservationFromContext = reservationIdParam
      ? this.reservations.find(r => r.reservationId === reservationIdParam) || null
      : null;
    const officeIdToApply = reservationFromContext?.officeId ?? this.parseContextOfficeId(queryParams);

    if (companyIdParam) {
      this.companyId = String(companyIdParam);
    }

    if (this.offices.length === 0 || officeIdToApply == null) {
      return;
    }

    this.resolveOfficeScope(officeIdToApply);
    if (!this.selectedOffice) {
      return;
    }

    this.form.get('officeId')?.setValue(this.selectedOffice.officeId, { emitEvent: false });
    if (this.reservations.length > 0) {
      this.updateAvailableReservations();
    }
    this.filterCostCodes();

    if (!reservationFromContext) {
      return;
    }

    this.form.get('reservationId')?.setValue(reservationFromContext.reservationId, { emitEvent: false });
    this.selectedReservation = reservationFromContext;
    this.setInvoiceCode(this.selectedReservation);
  }

  getContextReservationId(queryParams: Record<string, unknown> = this.route.snapshot.queryParams): string | null {
    const fromInput = this.reservationIdInput?.trim();
    if (fromInput) {
      return fromInput;
    }

    const fromQuery = queryParams['reservationId'];
    if (fromQuery == null || fromQuery === '') {
      return null;
    }

    return String(fromQuery).trim() || null;
  }

  parseContextOfficeId(queryParams: Record<string, unknown> = this.route.snapshot.queryParams): number | null {
    const officeIdParam = this.officeIdInput ?? queryParams['officeId'];
    if (officeIdParam == null || officeIdParam === '') {
      return null;
    }

    const parsedOfficeId = typeof officeIdParam === 'number' ? officeIdParam : parseInt(String(officeIdParam), 10);
    return !Number.isNaN(parsedOfficeId) ? parsedOfficeId : null;
  }

  getEffectiveReservationId(): string | null {
    const fromForm = this.form?.get('reservationId')?.value;
    if (fromForm) {
      return String(fromForm);
    }

    return this.getContextReservationId();
  }

  getInvoice(): void {
    const companyIdParam = this.companyIdInput ?? this.route.snapshot.queryParams['companyId'];
    if (companyIdParam) {
      this.companyId = companyIdParam;
    }

    const loadId = ++this.activeInvoiceLoadId;
    const requestedInvoiceId = this.invoiceId;
    this.isInvoiceContentReady = false;
    this.accountingService.getInvoiceByGuid(this.invoiceId).pipe(take(1), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');
      })
    ).subscribe({
      next: (response: InvoiceResponse) => {
        if (this.activeInvoiceLoadId !== loadId || this.invoiceId !== requestedInvoiceId) {
          return;
        }
        this.applyLoadedInvoice(response);
        const addLedgerLineParam = this.route.snapshot.queryParams['addLedgerLine'];
        if (addLedgerLineParam === 'true') {
          this.isPaymentMode = true;
          this.filterCostCodes();
          this.addLedgerLine();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (this.activeInvoiceLoadId !== loadId) {
          return;
        }
        this.isServiceError = true;
        if (err.status === 404) {
        }
      }
    });
  }

  applyLoadedInvoice(response: InvoiceResponse): void {
    this.invoice = response;
    try {
      this.populateForm();
      this.loadLedgerLines(false);
    } finally {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');
      this.isInvoiceContentReady = true;
      this.cdr.markForCheck();
    }
  }

  saveInvoice(): void {
    if (this.isAddMode) {
      this.applyPrefilledInvoiceContext();
    }

    this.saveAttempted = true;
    this.isSubmitting = true;

    if (!this.form || !this.form.valid) {
      this.form?.markAllAsTouched();
      this.form?.updateValueAndValidity({ emitEvent: false });
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      this.isSubmitting = false;
      this.cdr.markForCheck();
      return;
    }

    if (!this.isAddMode && !this.journalEntryService.guardCanUpdateJournalEntry(this.invoice?.postingStatusId, 'Invoice')) {
      this.isSubmitting = false;
      this.cdr.markForCheck();
      return;
    }

    this.performSave();
  }

  toInvoiceCreate(invoiceToUse: InvoiceResponse | null | undefined, formValue?: any): void {
    if (!invoiceToUse?.invoiceId) {
      this.back(formValue || this.form?.getRawValue() || {});
      return;
    }

    const officeIdToUse = this.selectedOffice?.officeId || invoiceToUse.officeId || formValue?.officeId;
    const reservationIdToUse = this.selectedReservation?.reservationId || invoiceToUse.reservationId || formValue?.reservationId;

    if (this.shellMode && this.embedDocumentPreviewInShell) {
      this.previewEvent.emit({
        invoiceId: invoiceToUse.invoiceId,
        invoiceCode: invoiceToUse.invoiceCode ?? null,
        officeId: officeIdToUse ?? null,
        reservationId: reservationIdToUse ?? null,
        companyId: this.companyId,
        returnToEditor: true
      });
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const originReturnTo = this.shellMode
      ? 'reservation'
      : (queryParams['returnTo'] || 'accounting');
    const params: string[] = [
      'returnTo=invoice-edit',
      `originReturnTo=${encodeURIComponent(originReturnTo)}`
    ];

    if (officeIdToUse) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse) {
      params.push(`reservationId=${reservationIdToUse}`);
    }

    params.push(`invoiceId=${invoiceToUse.invoiceId}`);

    if (this.companyId) {
      params.push(`companyId=${this.companyId}`);
    }

    const organizationIdParam = queryParams['organizationId'];
    if (organizationIdParam) {
      params.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
    }

    const invoiceCreateUrl = `${RouterUrl.InvoiceCreate}?${params.join('&')}`;
    this.router.navigateByUrl(invoiceCreateUrl);
  }
  //#endregion

  //#region Form Response Methods
  onPrimaryAction(): void {
    if (!this.isAddMode && !this.isPaymentMode && !this.hasChanges()) {
      this.toInvoiceCreate(this.invoice, this.form?.getRawValue());
      return;
    }

    this.saveInvoice();
  }

  get officeTitleBarOptions(): { value: number, label: string }[] {
    return this.availableOffices.map(office => ({
      value: office.value,
      label: office.name
    }));
  }

  get reservationTitleBarOptions(): { value: string, label: string }[] {
    return this.availableReservations.map(reservation => ({
      value: reservation.value,
      label: reservation.label
    }));
  }

  get titleBarPropertyCode(): string {
    const fromInvoice = (this.invoice?.propertyCode ?? '').trim();
    if (fromInvoice) {
      return fromInvoice;
    }

    const fromSelectedReservation = (this.selectedReservation?.propertyCode ?? '').trim();
    if (fromSelectedReservation) {
      return fromSelectedReservation;
    }

    const reservationId = String(this.form?.get('reservationId')?.value ?? this.invoice?.reservationId ?? '').trim();
    if (reservationId) {
      const fromReservationList = (this.reservations.find(r => r.reservationId === reservationId)?.propertyCode ?? '').trim();
      if (fromReservationList) {
        return fromReservationList;
      }
    }

    const propertyId = (this.selectedReservationDetail?.propertyId ?? this.invoice?.propertyId ?? '').trim();
    if (propertyId) {
      return (this.reservations.find(r => r.propertyId === propertyId)?.propertyCode ?? '').trim();
    }

    return '';
  }

  onTitleBarOfficeChange(value: string | number | null): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    this.form.get('officeId')?.setValue(value == null || value === '' ? null : Number(value));
  }

  onTitleBarReservationChange(value: string | number | null): void {
    if (!this.isAddMode || !this.form) {
      return;
    }

    const reservationId = value == null || value === '' ? null : String(value);
    this.form.get('reservationId')?.setValue(reservationId, { emitEvent: false });
    this.syncSelectedReservationFromForm();

    if (this.selectedReservation) {
      this.setInvoiceCode(this.selectedReservation);
    } else {
      this.form.get('invoiceCode')?.setValue(' ', { emitEvent: false });
    }
  }
  //#endregion

  //#region Reservation Tooltip Methods
  get showReservationInfoIcon(): boolean {
    return !!(this.resolveReservationForInfoTooltip() || this.form?.get('reservationId')?.value);
  }

  get reservationInfoTooltip(): string {
    return this.buildReservationInfoTooltip(this.resolveReservationForInfoTooltip());
  }

  resolveReservationForInfoTooltip(): ReservationCodeResponse | null {
    if (this.selectedReservation) {
      return this.selectedReservation;
    }

    const reservationId = this.form?.get('reservationId')?.value;
    if (!reservationId) {
      return null;
    }

    return this.reservations.find(r => r.reservationId === reservationId) || null;
  }

  syncSelectedReservationFromForm(): void {
    if (!this.form) {
      this.selectedReservation = null;
      this.loadSelectedReservationDetail(null);
      return;
    }

    const reservationId = this.form.get('reservationId')?.value;
    this.selectedReservation = reservationId
      ? this.reservations.find(r => r.reservationId === reservationId) || null
      : null;
    this.loadSelectedReservationDetail(reservationId ? String(reservationId) : null);
  }

  loadSelectedReservationDetail(reservationId: string | null): void {
    if (!reservationId) {
      this.selectedReservationDetail = null;
      this.selectedReservationDetailRequestId = null;
      return;
    }

    if (this.selectedReservationDetailRequestId === reservationId && this.selectedReservationDetail?.reservationId === reservationId) {
      return;
    }

    this.selectedReservationDetailRequestId = reservationId;
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
      next: (detail) => {
        if (this.selectedReservationDetailRequestId !== reservationId) {
          return;
        }

        this.selectedReservationDetail = detail;
        this.updateInvoiceCodeFromSelectedReservation();
        this.form?.get('startDate')?.updateValueAndValidity({ emitEvent: false });
        this.form?.get('endDate')?.updateValueAndValidity({ emitEvent: false });
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.selectedReservationDetailRequestId !== reservationId) {
          return;
        }

        this.selectedReservationDetail = null;
        if (this.isAddMode && this.form && this.selectedReservation?.reservationId === reservationId) {
          this.form.get('invoiceCode')?.setValue(`${this.selectedReservation.reservationCode}-001`, { emitEvent: false });
        }
        this.cdr.markForCheck();
      }
    });
  }

  buildReservationInfoTooltip(reservation: ReservationCodeResponse | null): string {
    const detail = this.selectedReservationDetail;
    const reservationId = reservation?.reservationId ?? this.form?.get('reservationId')?.value ?? null;

    if (!reservation && !detail && reservationId) {
      return 'Loading reservation details...';
    }

    if (!reservation && !detail) {
      return '';
    }

    const contact = (reservation?.contactName ?? detail?.contactName ?? '').trim() || '—';
    const company = (reservation?.companyName ?? detail?.companyName ?? '').trim();
    const tenant = (reservation?.tenantName ?? detail?.tenantName ?? '').trim() || '—';
    const property = (reservation?.propertyCode ?? '').trim() || '—';
    const office = (reservation?.officeName ?? detail?.officeName ?? '').trim() || '—';
    const reservationCode = reservation?.reservationCode ?? detail?.reservationCode ?? this.form?.get('reservationCode')?.value ?? '—';

    const lines = [
      `Reservation: ${reservationCode || '—'}`,
      `Property: ${property}`,
      `Office: ${office}`,
      `Start Date: ${this.formatReservationTooltipDate(detail?.arrivalDate)}`,
      `End Date: ${this.formatReservationTooltipDate(detail?.departureDate)}`,
      `Billing Rate: ${this.formatReservationTooltipBillingRate(detail?.billingRate)}`,
      `Contact: ${contact}`
    ];

    if (company) {
      lines.push(`Company: ${company}`);
    }

    lines.push(`Tenant: ${tenant}`);
    return lines.join('\n');
  }

  formatReservationTooltipDate(value: string | Date | null | undefined): string {
    if (value instanceof Date) {
      return this.formatter.dateOnly(value) || '—';
    }

    const formatted = this.formatter.formatDateString(value ?? undefined);
    return formatted?.trim() || '—';
  }

  formatReservationTooltipBillingRate(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '—';
    }

    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return '—';
    }

    return '$' + this.formatter.currency(numeric);
  }
  //#endregion

  //#region Ledger Line Methods
  performSave(): void {
    this.isSubmitting = true;

    if (this.ledgerLines.length === 0) {
      this.toastr.error('Add or generate ledger lines before saving.', CommonMessage.Error);
      this.isSubmitting = false;
      this.cdr.markForCheck();
      return;
    }

    if (this.hasLedgerLineValidationErrors()) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      this.isSubmitting = false;
      this.cdr.markForCheck();
      return;
    }

    const formValue = this.form.getRawValue();
    const reservationId = this.getEffectiveReservationId();
    if (!reservationId) {
      this.toastr.warning('Please select a reservation before saving.', 'No Reservation Selected');
      this.isSubmitting = false;
      this.cdr.markForCheck();
      return;
    }

    const user = this.authService.getUser();
    this.recomputeLedgerLineNumbers();

    const invoiceDateString = this.utilityService.toDateOnlyJsonString(formValue.invoiceDate) ?? this.utilityService.todayAsCalendarDateString();
    const ledgerLines: LedgerLineRequest[] = this.ledgerLines.map((line, index) => {
        const numericCostCodeId = line.costCodeId == null ? NaN : Number(line.costCodeId);
        const ledgerLine: LedgerLineRequest = {
          ledgerLineId: line.ledgerLineId || undefined,
          invoiceId: this.isAddMode ? undefined : this.invoiceId,
          lineNumber: line.lineNumber !== undefined ? line.lineNumber : index + 1,
          costCodeId: Number.isInteger(numericCostCodeId) && numericCostCodeId > 0 ? numericCostCodeId : undefined,
          transactionTypeId: (line as any).transactionTypeId,
          reservationId,
          amount: line.amount || 0,
          description: line.description || '',
          ledgerLineDate: line.ledgerLineDate || invoiceDateString
        };
        return ledgerLine;
      });
    
    const invoiceCode = formValue.invoiceCode || '';
    const selectedOffice = this.availableOffices.find(office => office.value === formValue.officeId);
    const officeName = selectedOffice?.name || '';  
    const selectedReservation = this.reservations.find(res => res.reservationId === reservationId);
    const reservationCode = selectedReservation?.reservationCode || null;
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.isPaymentMode
      ? this.calculateNewPaymentAmount()
      : this.calculatePaidAmount();
    
    const invoiceRequest: InvoiceRequest = {
      organizationId: user?.organizationId || '',
      officeId: formValue.officeId,
      officeName: officeName,
      invoiceCode: invoiceCode,
      reservationId,
      reservationCode: reservationCode,
      startDate: this.utilityService.toDateOnlyJsonString(formValue.startDate) ?? '',
      endDate: this.utilityService.toDateOnlyJsonString(formValue.endDate) ?? '',
      invoiceDate: invoiceDateString,
      dueDate: this.utilityService.toDateOnlyJsonString(formValue.dueDate) ?? invoiceDateString,
      accountingPeriod: this.resolveAccountingPeriodForSave(formValue),
      invoicePeriod: (() => {
        const sd = this.utilityService.parseCalendarDateInput(formValue.startDate);
        const ed = this.utilityService.parseCalendarDateInput(formValue.endDate);
        return sd && ed ? `${this.formatter.dateOnly(sd)} - ${this.formatter.dateOnly(ed)}` : '';
      })(),
      totalAmount: invoicedAmount,
      paidAmount: paidAmount,
      notes: formValue.notes || null,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true,
      ledgerLines: ledgerLines
    };

    const isCreating = !this.invoiceId || this.invoiceId === 'new' || this.invoiceId === '';
    
    if (!isCreating) {
      invoiceRequest.invoiceId = this.invoiceId;
    }

    const save$ = isCreating
      ? this.accountingService.createInvoice(invoiceRequest)
      : this.accountingService.updateInvoice(invoiceRequest);

    save$.pipe(take(1), finalize(() => {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (savedInvoice: InvoiceResponse) => {
        const message = isCreating ? 'Invoice created successfully' : 'Invoice updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });

        if (isCreating) {
          this.toInvoiceCreate(savedInvoice || this.invoice, formValue);
          return;
        }

        if (savedInvoice) {
          this.invoice = {
            ...savedInvoice,
            ledgerLines: savedInvoice.ledgerLines ?? []
          };
        }
        this.populateForm();
        this.loadLedgerLines(false);
        this.updateTotalAmount();
        this.captureFormSnapshot();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          return;
        }
        const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(err);
        if (closedPeriodMessage) {
          this.toastr.error(closedPeriodMessage, CommonMessage.Error);
          return;
        }
        this.toastr.error('Unable to save invoice. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
      }
    });
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
      this.officeCostCodes = [];
      this.debitCostCodes = [];
      this.creditCostCodes = [];
      this.availableCostCodes = [];
      return;
    }
    
    this.officeCostCodes = this.allCostCodes.filter(c => c.officeId === this.selectedOffice.officeId);
    this.debitCostCodes = this.officeCostCodes.filter(c => c.transactionTypeId !== TransactionType.Payment);
    this.creditCostCodes = this.officeCostCodes.filter(c => c.transactionTypeId === TransactionType.Payment);
    
    this.availableCostCodes = this.allCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
    
    this.officeAvailableCostCodes = this.officeCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
  }
  
  getCostCodesForLine(line: LedgerLineListDisplay): { value: number, label: string }[] {
    if (line.isNew !== true) {
      return this.officeAvailableCostCodes;
    }

    if (!this.isAddMode && !this.isPaymentMode) {
      const chargeAndPayment = this.officeCostCodes.filter(
        c => c.isActive && (c.transactionTypeId === TransactionType.Charge || c.transactionTypeId === TransactionType.Payment)
      );
      return chargeAndPayment.map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
    }

    const transactionTypeId = (line as any).transactionTypeId;

    if (transactionTypeId !== undefined && transactionTypeId !== null && transactionTypeId === TransactionType.Payment) {
      return this.creditCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
    }

    return this.debitCostCodes.filter(c => c.isActive).map(c => ({
      value: c.costCodeId,
      label: this.utilityService.getCostCodeDropdownLabel(c)
    }));
  }

  isPaymentLine(line: LedgerLineListDisplay): boolean {
    const transactionTypeId = (line as any).transactionTypeId;
    if (transactionTypeId !== undefined && transactionTypeId !== null) {
      return transactionTypeId === TransactionType.Payment;
    }
    return line.transactionType === 'Payment';
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.applyPrefilledInvoiceContext();
      });
    });
  }

  loadReservationCodes(): void {
    this.reservationService.getReservationCodes().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
    })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.syncSelectedReservationFromForm();
        if (this.form) {
          this.updateAvailableReservations();
        } else {
          this.availableReservations = this.reservations.map(r => ({
            value: r.reservationId,
            label: this.utilityService.getReservationDropdownLabel(r, null)
          }));
        }
        this.applyPrefilledInvoiceContext();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe(() => {
      this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(costCodes => {
        this.allCostCodes = costCodes || [];
        this.filterCostCodes();
        if (this.invoice && this.form) {
          this.loadLedgerLines(false);
        }
      });
    });
  }

  loadLedgerLines(updateTotalAmount: boolean = true): void {
    const rawLedgerLines = this.invoice?.ledgerLines || [];
    if (!this.invoice || !rawLedgerLines || rawLedgerLines.length === 0) {
      this.ledgerLines = [];
      this.originalLedgerLines = [];
      if (updateTotalAmount) {
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
      }
      return;
    }
    
    if (!this.officeCostCodes || this.officeCostCodes.length === 0) {
      this.filterCostCodes();
    }
    
    this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.officeCostCodes, this.transactionTypes);
    this.ledgerLines.forEach(line => {
      if (line.isNew === undefined) {
        (line as any).isNew = false;
      }
    });
    this.recomputeLedgerLineNumbers();
    this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
    
    if (updateTotalAmount) {
      this.updateTotalAmount();
    }
  }

  loadMonthlyLedgerLines(reservationId: string): void {
    const invoiceDate = this.form.get('invoiceDate')?.value; 
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    const invoiceCode = this.form.get('invoiceCode')?.value || '';
    
    if (!startDate || !endDate) {
      this.toastr.warning('Start Date and End Date are required to load ledger lines', 'Missing Dates');
      return;
    }
    
    const request: InvoiceMonthlyDataRequest = {
      invoiceCode: invoiceCode,
      reservationId: reservationId,
      invoiceDate: this.utilityService.toDateOnlyJsonString(invoiceDate) ?? '', 
      startDate: this.utilityService.toDateOnlyJsonString(startDate) ?? '',
      endDate: this.utilityService.toDateOnlyJsonString(endDate) ?? ''
    };
    
    this.accountingService.getMonthlyLedgerLines(request).pipe(take(1)).subscribe({
      next: (response: InvoiceMonthlyDataResponse) => {
        const rawLedgerLines = response.ledgerLines || [];
        this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.officeCostCodes, this.transactionTypes);
        this.recomputeLedgerLineNumbers();
        this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
        this.updateTotalAmount();
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
        this.ledgerLines = [];
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
        this.cdr.markForCheck();
        if (err.status === 404) {
        }
      }
    });
  }
 //#endregion

  //#region Form methods
  buildForm(): void {
    const user = this.authService.getUser();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      officeId: new FormControl(null, [Validators.required]),
      officeName: new FormControl({ value: '', disabled: true }), 
      reservationId: new FormControl(null),
      reservationCode: new FormControl({ value: '', disabled: true }), 
      startDate: new FormControl(firstDayOfCurrentMonth, [
        this.endDateValidator.bind(this),
        this.startDateReservationValidator.bind(this)
      ]),
      endDate: new FormControl(lastDayOfCurrentMonth, [
        this.endDateValidator.bind(this),
        this.endDateReservationValidator.bind(this)
      ]),
      invoiceDate: new FormControl(today, [Validators.required]),
      dueDate: new FormControl(today, [Validators.required]),
      accountingPeriod: new FormControl(firstDayOfCurrentMonth, [Validators.required]),
      invoiceTotal: new FormControl({ value: '', disabled: true }),
      invoiceCode: new FormControl({ value: ' ', disabled: true }),
      invoicedAmount: new FormControl({ value: '0.00', disabled: true }), 
      paidAmount: new FormControl({ value: '0.00', disabled: true }),
      totalDue: new FormControl({ value: '0.00', disabled: true }), 
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });
    

    this.form.get('startDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((startDateValue) => {
      if (!startDateValue) {
        return;
      }

      const startDate = this.utilityService.parseCalendarDateInput(startDateValue);
      if (!startDate) {
        return;
      }

      const lastDayOfStartMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      lastDayOfStartMonth.setHours(0, 0, 0, 0);
      setTimeout(() => {
        this.form.get('endDate')?.setValue(lastDayOfStartMonth, { emitEvent: false });
        this.syncAccountingPeriodFromStartDate(startDate);
      }, 0);
    });
  }

  populateForm(): void {
    if (this.invoice && this.form) {
      const { startDate, endDate } = this.utilityService.invoicePeriodStartEnd(
        this.invoice.invoicePeriod,
        this.invoice.startDate,
        this.invoice.endDate
      );
      this.form.patchValue({
        organizationId: this.invoice.organizationId,
        officeId: this.invoice.officeId,
        officeName: this.invoice.officeName || '',
        reservationId: this.invoice.reservationId || null,
        reservationCode: this.invoice.reservationCode || '',
        startDate: this.utilityService.parseCalendarDateInput(startDate),
        endDate: this.utilityService.parseCalendarDateInput(endDate),
        accountingPeriod: this.utilityService.parseCalendarDateInput(this.invoice.accountingPeriod),
        invoiceDate: this.utilityService.parseCalendarDateInput(this.invoice.invoiceDate),
        dueDate: this.utilityService.parseCalendarDateInput(this.invoice.dueDate),
        invoiceTotal: this.invoice.totalAmount || '',
        invoiceCode: this.invoice.invoiceCode || '',
        invoicedAmount: (this.invoice.totalAmount ?? 0).toFixed(2),
        paidAmount: (this.invoice.paidAmount || 0).toFixed(2),
        totalDue: ((this.invoice.totalAmount || 0) - (this.invoice.paidAmount || 0)).toFixed(2),
        notes: this.invoice.notes || '',
        isActive: this.invoice.isActive
      }, { emitEvent: false });
      
      this.captureFormSnapshot();
      
      const officeId = this.form.get('officeId')?.value;
      this.selectedOffice = officeId ? this.offices.find(o => o.officeId === officeId) || null : null;
      
      const reservationId = this.form.get('reservationId')?.value;
      this.syncSelectedReservationFromForm();
      
      this.updateAvailableReservations();
      this.filterCostCodes();
      this.setInvoiceCode(this.selectedReservation);
    } else {
      this.originalFormSnapshot = null;
      
      setTimeout(() => {
        const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
        if (invoicedInput && document.activeElement !== invoicedInput) {
          const invoicedValue = parseFloat(this.form.get('invoicedAmount')?.value) || 0;
          const formattedInvoiced = invoicedValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(invoicedValue))
            : '$' + this.formatter.currency(invoicedValue);
          invoicedInput.value = formattedInvoiced;
        }
        const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
        if (paidInput && document.activeElement !== paidInput) {
          const paidValue = parseFloat(this.form.get('paidAmount')?.value) || 0;
          const formattedPaid = paidValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(paidValue))
            : '$' + this.formatter.currency(paidValue);
          paidInput.value = formattedPaid;
        }
        const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
        if (totalDueInput && document.activeElement !== totalDueInput) {
          const totalDueValue = parseFloat(this.form.get('totalDue')?.value) || 0;
          const formattedTotalDue = totalDueValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(totalDueValue))
            : '$' + this.formatter.currency(totalDueValue);
          totalDueInput.value = formattedTotalDue;
        }
      }, 100);
      
      if (!this.invoice.reservationId) {
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
      }
    }
  }
  //#endregion

  //#region Form Responders
  setupFormHandlers(): void {
    this.setupOfficeIdHandler();
    this.setupReservationIdHandler();
    this.setupInvoiceDateSyncHandler();
    
    
    setTimeout(() => {
      const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
      if (invoicedInput && document.activeElement !== invoicedInput) {
        const invoicedValue = parseFloat(this.form.get('invoicedAmount')?.value) || 0;
        const formattedInvoiced = invoicedValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(invoicedValue))
          : '$' + this.formatter.currency(invoicedValue);
        invoicedInput.value = formattedInvoiced;
      }
      const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
      if (paidInput && document.activeElement !== paidInput) {
        const paidValue = parseFloat(this.form.get('paidAmount')?.value) || 0;
        const formattedPaid = paidValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(paidValue))
          : '$' + this.formatter.currency(paidValue);
        paidInput.value = formattedPaid;
      }
      const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
      if (totalDueInput && document.activeElement !== totalDueInput) {
        const totalDueValue = parseFloat(this.form.get('totalDue')?.value) || 0;
        const formattedTotalDue = totalDueValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(totalDueValue))
          : '$' + this.formatter.currency(totalDueValue);
        totalDueInput.value = formattedTotalDue;
      }
    }, 100);
  }

  setupInvoiceDateSyncHandler(): void {
    this.form.get('invoiceDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(invoiceDateValue => {
      if (!this.isAddMode || !this.form) {
        return;
      }

      const parsedInvoiceDate = this.utilityService.parseCalendarDateInput(invoiceDateValue);
      if (!parsedInvoiceDate) {
        return;
      }

      parsedInvoiceDate.setHours(0, 0, 0, 0);
      const syncedDate = new Date(parsedInvoiceDate.getTime());
      const syncedEndDate = new Date(parsedInvoiceDate.getFullYear(), parsedInvoiceDate.getMonth() + 1, 0);
      syncedEndDate.setHours(0, 0, 0, 0);

      // Keep Due Date and Start Date aligned with Invoice Date during add flow.
      this.form.get('dueDate')?.setValue(new Date(syncedDate.getTime()), { emitEvent: false });
      this.form.get('startDate')?.setValue(new Date(syncedDate.getTime()), { emitEvent: false });
      this.form.get('endDate')?.setValue(new Date(syncedEndDate.getTime()), { emitEvent: false });
      this.form.get('accountingPeriod')?.setValue(this.firstDayOfMonthDate(syncedDate), { emitEvent: false });
    });
  }

  firstDayOfMonthDate(value: Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const first = new Date(value.getFullYear(), value.getMonth(), 1);
    first.setHours(0, 0, 0, 0);
    return first;
  }

  syncAccountingPeriodFromStartDate(startDate: Date): void {
    const firstOfMonth = this.firstDayOfMonthDate(startDate);
    if (firstOfMonth) {
      this.form.get('accountingPeriod')?.setValue(firstOfMonth, { emitEvent: false });
    }
  }

  resolveAccountingPeriodForSave(formValue: Record<string, unknown>): string {
    const explicit = this.utilityService.toDateOnlyJsonString(formValue['accountingPeriod']);
    if (explicit) {
      return explicit;
    }
    const start = this.utilityService.parseCalendarDateInput(formValue['startDate'] as string | Date | null | undefined);
    const fromStart = start ? this.utilityService.toDateOnlyJsonString(this.firstDayOfMonthDate(start)) : null;
    if (fromStart) {
      return fromStart;
    }
    const fromInvoiceDate = this.utilityService.toDateOnlyJsonString(
      formValue['invoiceDate'] as string | Date | null | undefined
    );
    if (fromInvoiceDate) {
      const match = /^(\d{4})-(\d{2})/.exec(fromInvoiceDate);
      return match ? `${match[1]}-${match[2]}-01` : fromInvoiceDate;
    }
    const today = new Date();
    return this.utilityService.toDateOnlyJsonString(new Date(today.getFullYear(), today.getMonth(), 1)) ?? '';
  }

  setupOfficeIdHandler(): void {
    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.resolveOfficeScope(officeId);
      this.updateAvailableReservations();
      this.filterCostCodes();
      
      const currentReservationId = this.form.get('reservationId')?.value;
      if (currentReservationId && this.selectedOffice) {
        const currentReservation = this.reservations.find(r => r.reservationId === currentReservationId);
        if (currentReservation && currentReservation.officeId !== this.selectedOffice.officeId) {
          this.form.get('reservationId')?.setValue(null, { emitEvent: false });
        }
      } else if (!this.selectedOffice) {
        this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  setupReservationIdHandler(): void {
    this.form.get('reservationId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(reservationId => {
      this.syncSelectedReservationFromForm();
      if (this.selectedReservation) {
        const selectedOfficeId = this.form.get('officeId')?.value;
        if (selectedOfficeId !== this.selectedReservation.officeId) {
          this.form.get('officeId')?.setValue(this.selectedReservation.officeId);
        }
        this.setInvoiceCode(this.selectedReservation);
      } else {
        this.form.get('invoiceCode')?.setValue(' ', { emitEvent: false });
      }
    });
  }

  setInvoiceCode(reservation: ReservationCodeResponse | null): void {
    if (!this.isAddMode || !reservation || !this.form) {
      return;
    }

    if (this.selectedReservationDetail?.reservationId === reservation.reservationId) {
      this.updateInvoiceCodeFromSelectedReservation();
      return;
    }

    if (this.selectedReservationDetailRequestId !== reservation.reservationId) {
      this.loadSelectedReservationDetail(reservation.reservationId);
    }
  }

  updateInvoiceCodeFromSelectedReservation(): void {
    if (!this.isAddMode || !this.form || !this.selectedReservation || !this.selectedReservationDetail) {
      return;
    }

    if (this.selectedReservation.reservationId !== this.selectedReservationDetail.reservationId) {
      return;
    }

    const invoiceCode = `${this.selectedReservation.reservationCode}-${((this.selectedReservationDetail.currentInvoiceNo ?? 0) + 1).toString().padStart(3, '0')}`;
    this.form.get('invoiceCode')?.setValue(invoiceCode, { emitEvent: false });
  }

  updateAvailableReservations(): void {
    if (this.selectedOffice) {
      const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
      this.availableReservations = filteredReservations.map(r => ({
        value: r.reservationId,
        label: this.utilityService.getReservationDropdownLabel(r, null)
      }));
    } else {
      this.availableReservations = this.reservations.map(r => ({
        value: r.reservationId,
        label: this.utilityService.getReservationDropdownLabel(r, null)
      }));
    }
  }

  updateLedgerLineField(index: number, field: keyof LedgerLineListDisplay, value: any): void {
    if (this.ledgerLines[index]) {
      (this.ledgerLines[index] as any)[field] = value;
      if (field === 'amount') {
        this.updateTotalAmount();
      }
      
      if (field === 'transactionType' && typeof value === 'string') {
        const transactionType = this.transactionTypes.find(t => t.label === value);
        if (transactionType) {
           (this.ledgerLines[index] as any).transactionTypeId = transactionType.value;
        }
      }
      
    }
  }

  private readonly ledgerDateCache = new WeakMap<object, { key: string; date: Date | null }>();

  getLedgerLineDateValue(line: LedgerLineListDisplay): Date | null {
    const key = String(line?.ledgerLineDate || '');
    const cached = this.ledgerDateCache.get(line);
    if (cached && cached.key === key) {
      return cached.date;
    }

    const date = this.utilityService.parseCalendarDateInput(line?.ledgerLineDate);
    this.ledgerDateCache.set(line, { key, date });
    return date;
  }

  onLedgerLineDateChange(index: number, value: Date | string | null): void {
    const line = this.ledgerLines[index];
    if (!line) {
      return;
    }

    const next = this.utilityService.toDateOnlyJsonString(value) ?? '';
    if ((line.ledgerLineDate || '') === next) {
      return;
    }

    const stableDate = value instanceof Date && !isNaN(value.getTime())
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
      : this.utilityService.parseCalendarDateInput(next);
    this.ledgerDateCache.set(line, { key: next, date: stableDate });
    this.updateLedgerLineField(index, 'ledgerLineDate', next);
  }

  selectLedgerDateOnFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    queueMicrotask(() => input?.select());
  }

  onTransactionTypeChange(index: number, transactionTypeId: number | null): void {
    if (transactionTypeId === null || transactionTypeId === undefined) {
      this.updateLedgerLineField(index, 'transactionType', '');
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      return;
    }

    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    if (transactionType) {
      this.updateLedgerLineField(index, 'transactionType', transactionType.label);
      (this.ledgerLines[index] as any).transactionTypeId = transactionTypeId;
    }
  }

  onCostCodeChange(index: number, costCodeId: string | number | null): void {
    const parsedCostCodeId = costCodeId === null || costCodeId === undefined || costCodeId === '' ? NaN : Number(costCodeId);
    const normalizedCostCodeId = Number.isInteger(parsedCostCodeId) ? parsedCostCodeId : null;
    if (normalizedCostCodeId === null) {
      this.updateLedgerLineField(index, 'costCodeId', null);
      this.updateLedgerLineField(index, 'costCode', null);
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      this.updateLedgerLineField(index, 'transactionType', '');
    } else {
      const line = this.ledgerLines[index];
      
      this.updateLedgerLineField(index, 'costCodeId', normalizedCostCodeId);
      const matchingCostCode = this.officeCostCodes.find(c => c.costCodeId === normalizedCostCodeId)
        ?? this.allCostCodes.find(c =>
          c.costCodeId === normalizedCostCodeId
          && (!this.selectedOffice || c.officeId === this.selectedOffice.officeId)
        );
      if (matchingCostCode) {
        this.updateLedgerLineField(index, 'costCode', matchingCostCode.costCode);
        const newTransactionTypeId = matchingCostCode.transactionTypeId;
        (this.ledgerLines[index] as any).transactionTypeId = newTransactionTypeId;
        const transactionType = this.transactionTypes.find(t => t.value === newTransactionTypeId);
        if (transactionType) {
          this.updateLedgerLineField(index, 'transactionType', transactionType.label);
        }
        
      } else {
        this.updateLedgerLineField(index, 'costCode', null);
        (this.ledgerLines[index] as any).transactionTypeId = undefined;
        this.updateLedgerLineField(index, 'transactionType', '');
      }
    }
  }

  getTransactionTypeId(line: LedgerLineListDisplay): number | null {
    const transactionTypeId = (line as any).transactionTypeId;
    return transactionTypeId !== undefined && transactionTypeId !== null ? transactionTypeId : null;
  }

  calculateInvoicedAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      if (!this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  calculatePaidAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      if (this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  calculateNewPaymentAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      if (line.isNew === true && this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  updateTotalAmount(): void {
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.calculatePaidAmount();
    const totalDue = invoicedAmount - paidAmount;
    
    const invoicedControl = this.form.get('invoicedAmount');
    if (invoicedControl) {
      invoicedControl.setValue(invoicedAmount.toFixed(2), { emitEvent: false });
    }
    
    const paidControl = this.form.get('paidAmount');
    if (paidControl) {
      paidControl.setValue(paidAmount.toFixed(2), { emitEvent: false });
    }
    
    const totalDueControl = this.form.get('totalDue');
    if (totalDueControl) {
      totalDueControl.setValue(totalDue.toFixed(2), { emitEvent: false });
    }
    
    setTimeout(() => {
      const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
      if (invoicedInput && document.activeElement !== invoicedInput) {
        const formattedValue = invoicedAmount < 0 
          ? '-$' + this.formatter.currency(Math.abs(invoicedAmount))
          : '$' + this.formatter.currency(invoicedAmount);
        invoicedInput.value = formattedValue;
      }
      
      const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
      if (paidInput && document.activeElement !== paidInput) {
        const formattedValue = '$' + this.formatter.currency(Math.abs(paidAmount));
        paidInput.value = formattedValue;
      }
      
      const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
      if (totalDueInput && document.activeElement !== totalDueInput) {
        const formattedValue = totalDue < 0 
          ? '-$' + this.formatter.currency(Math.abs(totalDue))
          : '$' + this.formatter.currency(totalDue);
        totalDueInput.value = formattedValue;
      }
    }, 0);
  }

  get isSaveDisabled(): boolean {
    if (this.isSubmitting) {
      return true;
    }
    
    if (this.isAddMode) {
      return false;
    }

    return false;
  }

  get showOfficeValidationError(): boolean {
    return !!this.form && this.saveAttempted && !!this.form.get('officeId')?.invalid;
  }

  get showInvoiceDateValidationError(): boolean {
    return !!this.form && this.saveAttempted && !!this.form.get('invoiceDate')?.invalid;
  }

  get showDueDateValidationError(): boolean {
    return !!this.form && this.saveAttempted && !!this.form.get('dueDate')?.invalid;
  }

  getInvoiceOfficeFieldClass(baseClass: string = 'titlebar-field-office'): string {
    return this.showOfficeValidationError
      ? `${baseClass} invoice-required-field`
      : baseClass;
  }

  isLedgerLineFieldInvalid(line: LedgerLineListDisplay, field: 'costCodeId' | 'transactionType' | 'description' | 'amount' | 'ledgerLineDate'): boolean {
    if (!this.saveAttempted) {
      return false;
    }

    const hasTransactionTypeId = (line as any).transactionTypeId !== undefined && (line as any).transactionTypeId !== null;
    const parsedCostCodeId = line.costCodeId == null ? NaN : Number(line.costCodeId);
    const hasCostCodeId = Number.isInteger(parsedCostCodeId) && parsedCostCodeId > 0;
    const hasDescription = !!line.description && line.description.trim() !== '';
    const hasAmount = line.amount !== null && line.amount !== undefined && line.amount !== 0;
    const hasLedgerLineDate = !!line.ledgerLineDate;

    switch (field) {
      case 'costCodeId':
        return !hasCostCodeId;
      case 'transactionType':
        return !hasTransactionTypeId;
      case 'description':
        return !hasDescription;
      case 'amount':
        return !hasAmount;
      case 'ledgerLineDate':
        return !hasLedgerLineDate;
      default:
        return false;
    }
  }

  getLedgerCostCodeSelectClass(line: LedgerLineListDisplay): string {
    const baseClass = 'w-full cost-code-select editable-select';
    return this.isLedgerLineFieldInvalid(line, 'costCodeId')
      ? `${baseClass} invoice-line-invalid`
      : baseClass;
  }

  hasLedgerLineValidationErrors(): boolean {
    return this.ledgerLines.some((line) =>
      this.isLedgerLineFieldInvalid(line, 'costCodeId')
      || this.isLedgerLineFieldInvalid(line, 'transactionType')
      || this.isLedgerLineFieldInvalid(line, 'description')
      || this.isLedgerLineFieldInvalid(line, 'amount')
      || this.isLedgerLineFieldInvalid(line, 'ledgerLineDate')
    );
  }

  get primaryActionLabel(): string {
    if (this.isPaymentMode) {
      return 'Apply';
    }

    if (this.isAddMode) {
      return 'Create';
    }

    return this.hasChanges() ? 'Modify' : 'View';
  }

  hasChanges(): boolean {
    if (this.hasLedgerLinesChanged()) {
      return true;
    }

    return this.hasFormStateChanged();
  }

  hasLedgerLinesChanged(): boolean {
    if (this.isAddMode && this.originalLedgerLines.length === 0) {
      return this.ledgerLines.length > 0;
    }
    
    if (this.ledgerLines.length !== this.originalLedgerLines.length) {
      return true;
    }
    
    for (let i = 0; i < this.ledgerLines.length; i++) {
      const current = this.ledgerLines[i];
      const original = this.originalLedgerLines[i];
      
      if (!original) {
        return true;
      }
      
      if (current.ledgerLineId !== original.ledgerLineId ||
          current.lineNumber !== original.lineNumber ||
          current.ledgerLineDate !== original.ledgerLineDate ||
          current.costCodeId !== original.costCodeId ||
          (current as any).transactionTypeId !== (original as any).transactionTypeId ||
          current.description !== original.description ||
          current.amount !== original.amount) {
        return true;
      }
    }
    
    return false;
  }

  hasFormStateChanged(): boolean {
    if (this.isAddMode || !this.form || !this.originalFormSnapshot) {
      return false;
    }

    const current = this.normalizeFormForDirtyCompare(this.form.getRawValue());
    return JSON.stringify(current) !== JSON.stringify(this.originalFormSnapshot);
  }

  captureFormSnapshot(): void {
    if (!this.form) {
      this.originalFormSnapshot = null;
      return;
    }
    this.originalFormSnapshot = this.normalizeFormForDirtyCompare(this.form.getRawValue());
  }

  normalizeFormForDirtyCompare(formValue: any): {
    officeId: number | null;
    reservationId: string | null;
    startDate: string | null;
    endDate: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    accountingPeriod: string | null;
    notes: string | null;
    isActive: boolean;
  } {
    const toDateKey = (value: any): string | null => this.utilityService.toDateOnlyJsonString(value);

    return {
      officeId: formValue?.officeId ?? null,
      reservationId: formValue?.reservationId ?? null,
      startDate: toDateKey(formValue?.startDate),
      endDate: toDateKey(formValue?.endDate),
      invoiceDate: toDateKey(formValue?.invoiceDate),
      dueDate: toDateKey(formValue?.dueDate),
      accountingPeriod: toDateKey(formValue?.accountingPeriod),
      notes: (formValue?.notes ?? '').trim() || null,
      isActive: !!formValue?.isActive
    };
  }
  //#endregion

  //#region Ledger Lines
  onLedgerAmountInput(event: Event, _index: number): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    value = value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;

    const parts = normalizedValue.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = normalizedValue;
    }
  }

  onLedgerAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line && line.amount != null && line.amount !== undefined) {
      input.value = line.amount.toString();
      input.select();
    } else {
      input.value = '';
    }
  }

  onLedgerAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line) {
      const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
      let numValue: number;
      let formattedValue: string;
      
      if (rawValue !== '' && rawValue !== null) {
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          const finalValue = parsed;
          formattedValue = finalValue.toFixed(2);
          numValue = parseFloat(formattedValue);
        } else {
          formattedValue = '0.00';
          numValue = 0;
        }
      } else {
        formattedValue = '0.00';
        numValue = 0;
      }
      
      input.value = formattedValue;
      line.amount = numValue;
      this.updateTotalAmount();
    }
  }

  generateLedgerLines(): void {
    this.applyPrefilledInvoiceContext();
    const startDateControl = this.form?.get('startDate');
    startDateControl?.markAsTouched();
    startDateControl?.updateValueAndValidity({ emitEvent: false });
    if (startDateControl?.hasError('startDateBeforeArrivalMonth')) {
      this.toastr.error('Start Date month cannot be before the reservation arrival month.', CommonMessage.Error);
      return;
    }

    if (startDateControl?.hasError('startDateAfterDeparture')) {
      this.toastr.error('Start Date cannot be after the reservation departure date.', CommonMessage.Error);
      return;
    }

    const endDateControl = this.form?.get('endDate');
    endDateControl?.markAsTouched();
    endDateControl?.updateValueAndValidity({ emitEvent: false });
    if (endDateControl?.hasError('endDateAfterDepartureMonth')) {
      this.toastr.error('End Date month cannot be after the reservation departure month.', CommonMessage.Error);
      return;
    }

    const reservationId = this.getEffectiveReservationId();
    if (reservationId) {
      this.loadMonthlyLedgerLines(reservationId);
    } else {
      this.toastr.warning('Please select a reservation before generating ledger lines', 'No Reservation Selected');
    }
  }

  getLedgerAmountDisplay(line: LedgerLineListDisplay): string {
    if (line.amount == null || line.amount === undefined) {
      return '';
    }
    return line.amount.toFixed(2);
  }

  addLedgerLine(): void {
    this.recomputeLedgerLineNumbers();
    const invoiceDateString = this.utilityService.toDateOnlyJsonString(this.form?.get('invoiceDate')?.value) ?? this.utilityService.todayAsCalendarDateString();
    const newLine: LedgerLineListDisplay = {
      ledgerLineId: null,
      lineNumber: this.ledgerLines.length + 1,
      costCodeId: null as number | null,
      costCode: null,
      transactionType: '',
      description: '',
      amount: undefined as any,
      ledgerLineDate: invoiceDateString,
      isNew: true
    };
    (newLine as any).transactionTypeId = undefined;
    this.ledgerLines.push(newLine);
    this.updateTotalAmount();
  }

  removeLedgerLine(index: number): void {
    if (index >= 0 && index < this.ledgerLines.length) {
      this.ledgerLines.splice(index, 1);
      this.recomputeLedgerLineNumbers();
      this.updateTotalAmount();
    }
  }

  private recomputeLedgerLineNumbers(): void {
    this.ledgerLines.forEach((line, index) => {
      line.lineNumber = index + 1;
    });
  }
  //#endregion

  //#region Formatting Methods
  get reservationArrivalMonthMin(): Date | null {
    if (!this.isAddMode || !this.selectedReservationDetail?.arrivalDate) {
      return null;
    }

    const arrival = this.utilityService.parseCalendarDateInput(this.selectedReservationDetail.arrivalDate);
    if (!arrival) {
      return null;
    }

    return new Date(arrival.getFullYear(), arrival.getMonth(), 1);
  }

  get reservationDepartureDateMax(): Date | null {
    if (!this.isAddMode || !this.selectedReservationDetail?.departureDate) {
      return null;
    }

    return this.utilityService.parseCalendarDateInput(this.selectedReservationDetail.departureDate);
  }

  startDateReservationValidator(control: FormControl): { [key: string]: any } | null {
    if (!this.isAddMode || !control.value || !this.form) {
      return null;
    }

    const detail = this.selectedReservationDetail;
    if (!detail) {
      return null;
    }

    const startDate = this.utilityService.parseCalendarDateInput(control.value);
    if (!startDate) {
      return null;
    }

    startDate.setHours(0, 0, 0, 0);

    if (detail.arrivalDate) {
      const arrival = this.utilityService.parseCalendarDateInput(detail.arrivalDate);
      if (arrival) {
        const startMonthIndex = startDate.getFullYear() * 12 + startDate.getMonth();
        const arrivalMonthIndex = arrival.getFullYear() * 12 + arrival.getMonth();
        if (startMonthIndex < arrivalMonthIndex) {
          return { startDateBeforeArrivalMonth: true };
        }
      }
    }

    if (detail.departureDate) {
      const departure = this.utilityService.parseCalendarDateInput(detail.departureDate);
      if (departure) {
        departure.setHours(0, 0, 0, 0);
        if (startDate > departure) {
          return { startDateAfterDeparture: true };
        }
      }
    }

    return null;
  }

  endDateReservationValidator(control: FormControl): { [key: string]: any } | null {
    if (!this.isAddMode || !control.value || !this.form) {
      return null;
    }

    const departureDate = this.selectedReservationDetail?.departureDate;
    if (!departureDate) {
      return null;
    }

    const endDate = this.utilityService.parseCalendarDateInput(control.value);
    const departure = this.utilityService.parseCalendarDateInput(departureDate);
    if (!endDate || !departure) {
      return null;
    }

    const endMonthIndex = endDate.getFullYear() * 12 + endDate.getMonth();
    const departureMonthIndex = departure.getFullYear() * 12 + departure.getMonth();
    if (endMonthIndex > departureMonthIndex) {
      return { endDateAfterDepartureMonth: true };
    }

    return null;
  }

  endDateValidator(control: FormControl): { [key: string]: any } | null {
    if (!control.value || !this.form) {
      return null;
    }
    
    const startDate = this.form.get('startDate')?.value;
    if (!startDate) {
      return null;
    }
    
    const endDate = this.utilityService.parseCalendarDateInput(control.value);
    const start = this.utilityService.parseCalendarDateInput(startDate);
    if (!endDate || !start) {
      return null;
    }
    
    endDate.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    
    if (endDate < start) {
      return { endDateBeforeStartDate: true };
    }
    
    return null;
  }
  //#endregion

  //#region Utility Methods
  back(formValue?: any): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];
    let officeId = queryParams['officeId'] || formValue?.officeId;
    const reservationId = queryParams['reservationId'] || formValue?.reservationId;
    const params: string[] = [];
    
    if (!officeId && this.invoice && this.invoice.officeId) {
      officeId = this.invoice.officeId.toString();
    } 
    if (officeId) {
      params.push(`officeId=${officeId}`);
    }

    if (returnTo === 'reservation' && reservationId) {
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }      
      params.push(`tab=invoices`);
      const reservationUrl = params.length > 0 
        ? RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]) + `?${params.join('&')}`
        : RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
      this.router.navigateByUrl(reservationUrl);
    } else if (returnTo === 'accounting' || !returnTo) {
      if (this.companyId) {
        params.push(`companyId=${this.companyId}`);
      }
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    } else {
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    }
  }

  ngOnDestroy(): void {
    this.activeInvoiceLoadId++;
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  } 
  //#endregion
}
