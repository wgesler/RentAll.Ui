import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, forkJoin, finalize, of, skip, Subject, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { TransactionType } from '../../accounting/models/accounting-enum';
import { InvoiceRequest, LedgerLineRequest } from '../../accounting/models/invoice.model';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../../accounting/models/chart-of-accounts.model';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import { getWorkOrderTypes, ReceiptType, WorkOrderType } from '../models/maintenance-enums';
import { ReceiptRequest, ReceiptResponse, ReceiptSelection, Split } from '../models/receipt.model';
import { ReceiptSplitOption, WorkOrderItemEditable, WorkOrderItemRequest, WorkOrderItemResponse, WorkOrderItemSnapshot, WorkOrderPreviewSelection, WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderAmountService } from '../services/work-order-amount.service';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';
import { JournalEntryService } from '../../accounting/services/journal-entry.service';

@Component({
  standalone: true,
  selector: 'app-work-order',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss'
})
export class WorkOrderComponent implements OnInit, OnChanges, OnDestroy {


  @Input() property: PropertyResponse | null = null;
  @Input() workOrderId: string | null = null;
  @Input() prefetchedWorkOrder: WorkOrderResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() initialTitle: string | null = null;
  @Input() initialDescription: string | null = null;
  @Input() showBackButton: boolean = true;
  @Input() embeddedInMaintenance = false;
  @Input() embedDocumentPreviewInShell = false;
  @Input() navigateToPreviewOnSave: boolean = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<WorkOrderResponse>();
  @Output() saveValidationAttempted = new EventEmitter<void>();
  @Output() propertySelectionRequiredChange = new EventEmitter<boolean>();
  @Output() shellLocationSync = new EventEmitter<{ officeId: number | null; propertyId: string | null }>();
  @Output() receiptSelect = new EventEmitter<ReceiptSelection>();
  @Output() previewEvent = new EventEmitter<WorkOrderPreviewSelection>();
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private propertyService = inject(PropertyService);
  private propertyAgreementService = inject(PropertyAgreementService);
  private invoiceService = inject(InvoiceService);
  private costCodesService = inject(CostCodesService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private contactService = inject(ContactService);
  private reservationService = inject(ReservationService);
  private receiptService = inject(ReceiptService);
  private workOrderAmountService = inject(WorkOrderAmountService);
  utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private journalEntryService = inject(JournalEntryService);
  
  readonly parseInt = parseInt;
  readonly noReceiptOptionValue = 0;
  readonly inventoryItemOptionValue = -1;

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;
  workOrderService: WorkOrderService;
  isAddMode: boolean = true;
  isSubmitting: boolean = false;

  organizationId: string = '';
  selectedPropertyId: string | null = null;
  workOrder: WorkOrderResponse | null = null;
  workOrderTypeOptions = getWorkOrderTypes();
  workOrderItems: WorkOrderItemEditable[] = [];
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  propertyReceipts: ReceiptResponse[] = [];
  associatedWorkOrderReceiptIds = new Set<string>();
  accountingOffice: AccountingOfficeResponse | null = null;
  generatedWorkOrderCode: string | null = null;
  nextWorkOrderNo: number | null = null;
  propertyReservations: ReservationListResponse[] = [];
  propertyAgreement: PropertyAgreementResponse | null = null;
  tenantDamagesCcId: number | null = null;
  defaultLaborCost: number = 0;
  focusedCurrencyField: { index: number; field: 'laborCost' | 'amount'; editValue: string } | null = null;
  initialWorkOrderItemsSnapshot: WorkOrderItemSnapshot[] = [];
  lastMarkupFactor: number = 1;
  hasUserEditedWorkOrder = false;
  activeWorkOrderLoadId = 0;
  selectedGlobalOfficeId: number | null = null;

  isPageReady = false;
  isWorkOrderContentReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();
  
  constructor() {
    const fb = inject(FormBuilder);
    const authService = inject(AuthService);
    const workOrderService = inject(WorkOrderService);

    this.fb = fb;
    this.authService = authService;
    this.workOrderService = workOrderService;
  }

  //#region Work Order
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.buildForm();
    this.selectedPropertyId = this.property?.propertyId ?? null;
    this.isAddMode = this.workOrderId == null;

    if (!this.embeddedInMaintenance) {
      const workOrderIdParam = this.route.snapshot.paramMap.get('id');
      if (workOrderIdParam !== null) {
        this.workOrderId = workOrderIdParam === 'new' ? null : workOrderIdParam;
      }
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;
      this.isAddMode = this.workOrderId == null;

      this.selectedGlobalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
        this.selectedGlobalOfficeId = officeId;
      });
    }

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.detectChanges();
    });

    // Only Tenant types have reservations...
    this.form.get('workOrderTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(typeId => {
      this.onWorkOrderTypeChanged(typeId);
    });
    this.form.get('applyMarkup')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.reapplyMarkupToCurrentItems(true);
    });
    this.onWorkOrderTypeChanged(this.form.get('workOrderTypeId')?.value);
    this.emitPropertySelectionRequiredState();

    if (this.isAddMode) {
      this.form.patchValue({
        officeName: this.property?.officeName || '',
        propertyCode: this.property?.propertyCode || ''
      }, { emitEvent: false });
      this.applyInitialWorkOrderPrefill();
    }

    this.loadOffices();
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
    this.loadCostCodes();
    this.loadVendors();
    this.loadProperty();
    if (this.isAddMode) {
      this.isWorkOrderContentReady = true;
      this.clearWorkOrderLoading();
    } else if (this.prefetchedWorkOrder && this.prefetchedWorkOrder.workOrderId === this.workOrderId) {
      this.applyLoadedWorkOrder(this.prefetchedWorkOrder);
    } else {
      const prefetchedWorkOrder = this.resolvePrefetchedWorkOrder();
      if (prefetchedWorkOrder) {
        this.applyLoadedWorkOrder(prefetchedWorkOrder);
      } else {
        this.isWorkOrderContentReady = false;
        this.loadWorkOrder();
      }
    }
    this.loadAccountingOfficeForWorkOrderCode();
    this.loadPropertyReservations();
    this.loadPropertyReceipts();
    this.loadPropertyAgreement();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      this.selectedPropertyId = this.property?.propertyId ?? null;

      if (this.selectedPropertyId && this.embeddedInMaintenance) {
        this.form.patchValue({
          workOrderCode: this.generatedWorkOrderCode ?? this.form.get('workOrderCode')?.value ?? '',
          officeName: this.property?.officeName || '',
          propertyCode: this.property?.propertyCode || ''
        }, { emitEvent: false });
        if (!changes['property'].firstChange) {
          this.loadAccountingOfficeForWorkOrderCode();
          this.loadPropertyReservations();
          this.loadPropertyReceipts();
          this.loadPropertyAgreement();
        }
      }
    }

    if (changes['workOrderId'] && !changes['workOrderId'].firstChange) {
      this.onWorkOrderIdChanged();
    }

    if (changes['prefetchedWorkOrder'] && !changes['prefetchedWorkOrder'].firstChange
      && this.prefetchedWorkOrder && this.prefetchedWorkOrder.workOrderId === this.workOrderId) {
      this.applyLoadedWorkOrder(this.prefetchedWorkOrder);
    }

    if (changes['officeId'] && this.embeddedInMaintenance && this.isAddMode && !this.property?.officeId) {
      this.loadAccountingOfficeForWorkOrderCode();
    }

    if ((changes['initialTitle'] || changes['initialDescription']) && this.isAddMode) {
      this.applyInitialWorkOrderPrefill();
    }
  }

  private   onWorkOrderIdChanged(): void {
    this.isAddMode = this.workOrderId == null;
    this.hasUserEditedWorkOrder = false;
    this.workOrder = null;
    this.workOrderItems = [];
    this.associatedWorkOrderReceiptIds.clear();
    if (this.isAddMode) {
      this.isWorkOrderContentReady = true;
      this.clearWorkOrderLoading();
    } else if (this.prefetchedWorkOrder && this.prefetchedWorkOrder.workOrderId === this.workOrderId) {
      this.applyLoadedWorkOrder(this.prefetchedWorkOrder);
    } else {
      const prefetchedWorkOrder = this.resolvePrefetchedWorkOrder();
      if (prefetchedWorkOrder) {
        this.applyLoadedWorkOrder(prefetchedWorkOrder);
      } else {
        this.isWorkOrderContentReady = false;
        this.loadWorkOrder();
      }
    }
    if (this.isAddMode && this.property?.officeId) {
      this.loadAccountingOfficeForWorkOrderCode();
    }
  }

  saveWorkOrder(): void {
    this.saveValidationAttempted.emit();
    this.form.markAllAsTouched();

    const requiresPropertySelection = this.isPropertySelectionRequired();
    const resolvedOrganizationId = (
      this.property?.organizationId
      || this.organizationId
      || this.workOrder?.organizationId
      || ''
    ).trim();
    const resolvedOfficeId = Number(
      this.property?.officeId
      ?? this.workOrder?.officeId
      ?? this.getShellOfficeId()
      ?? 0
    );
    const hasValidOfficeId = Number.isFinite(resolvedOfficeId) && resolvedOfficeId > 0;
    const resolvedPropertyId = this.resolvePropertyIdForSave(requiresPropertySelection);

    if (!resolvedOrganizationId || !hasValidOfficeId || (requiresPropertySelection && !resolvedPropertyId)) {
      if (!hasValidOfficeId) {
        this.toastr.error('Office is required. Select an office in the title bar.', 'Error');
      } else if (requiresPropertySelection && !resolvedPropertyId) {
        this.toastr.error('Property is required. Select a property in the title bar.', 'Error');
      } else {
        this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
      }
      return;
    }
    if (this.form.invalid) {
      this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
      return;
    }
    if (this.workOrderItems.length === 0) {
      this.toastr.warning('Add at least one work order item before saving.', 'Items Required');
      return;
    }

    const isCreate = this.workOrder?.workOrderId == null;
    if (isCreate && !this.generatedWorkOrderCode) {
      this.toastr.warning('Work order code is still loading. Please try Save again.', 'Please Wait');
      this.loadAccountingOfficeForWorkOrderCode();
      return;
    }
    const workOrderItemsForSave = this.mapWorkOrderItemsForSave(isCreate);
    const invalidItem = workOrderItemsForSave.find(item => item.itemAmount === 0);
    if (invalidItem) {
      this.form.markAllAsTouched();
      this.toastr.warning('Each work order item must have a non-zero Total. Total = receipt amount + (labor hours × labor cost).', 'Item Total Required');
      return;
    }

    if (!isCreate && !this.journalEntryService.guardCanUpdateJournalEntry(this.workOrder?.postingStatusId, 'Work Order')) {
      return;
    }

    const payload: WorkOrderRequest = {
      organizationId: resolvedOrganizationId,
      officeId: resolvedOfficeId,
      propertyId: resolvedPropertyId,
      workOrderCode: isCreate ? (this.generatedWorkOrderCode ?? undefined) : (this.workOrder?.workOrderCode ?? undefined),
      workOrderDate: this.getWorkOrderDateForApi(),
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
      applyMarkup: this.isOwnerTypeSelected() ? (this.form.get('applyMarkup')?.value === true) : false,
      reservationId: this.isTenantTypeSelected() ? (this.form.get('reservationId')?.value ?? null) : null,
      reservationCode: this.isTenantTypeSelected() ? this.getSelectedReservationCode() : null,
      useDepartureFee: this.getUseDepartureFeeForSave(),
      enteredInQb: this.form.get('enteredInQb')?.value === true,
      title: (this.form.get('title')?.value ?? '').trim(),
      description: (this.form.get('description')?.value ?? '').trim(),
      workOrderItems: workOrderItemsForSave,
      isActive: this.form.get('isActive')?.value ?? true
    };
    if (!isCreate && this.workOrder?.workOrderId) {
      payload.workOrderId = this.workOrder.workOrderId;
    }

    // Edit mode: only call update when something changed
    if (this.workOrder?.workOrderId) {
      if (!this.hasWorkOrderUpdates(payload)) {
        if (this.selectedPropertyId) {
          this.back();
        }
        return;
      }
    }

    this.isSubmitting = true;

    const previousAssignedSplitKeys = this.getAssignedSplitKeysForWorkOrderCode(this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '');
    const selectedSplitKeysForSave: string[] = [];
    const usedSplitKeys = new Set<string>();
    const currentWorkOrderCodeForSelection = (this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? this.form.get('workOrderCode')?.value ?? '').toString();
    this.workOrderItems
      .filter(item => item.itemSource === 'receipt' && this.isValidReceiptId(item.receiptId))
      .forEach(item => {
        const splitKey = item.receiptSplitKey || this.resolveInitialSplitKeyForItem(String(item.receiptId), currentWorkOrderCodeForSelection, usedSplitKeys);
        if (splitKey) {
          item.receiptSplitKey = splitKey;
          usedSplitKeys.add(splitKey);
          selectedSplitKeysForSave.push(splitKey);
        }
      });

    const save$ = this.workOrder?.workOrderId
      ? this.workOrderService.updateWorkOrder(payload)
      : this.workOrderService.createWorkOrder(payload);

    save$.pipe(take(1), finalize(() => { this.isSubmitting = false; })).subscribe({
      next: (saved: WorkOrderResponse) => {
        this.workOrder = saved;
        this.isAddMode = false;
        const wasCreate = isCreate;
        let totalAmount: number = 0;
        this.form.patchValue({
          workOrderCode: saved.workOrderCode ?? this.generatedWorkOrderCode ?? '',
          workOrderDate: this.getWorkOrderDateControlValue(saved.workOrderDate),
          officeName: saved.officeName || this.property?.officeName || '',
          propertyCode: saved.propertyCode || this.property?.propertyCode || '',
          workOrderTypeId: saved.workOrderTypeId,
          applyMarkup: saved.applyMarkup === true,
          reservationId: saved.reservationId ?? null,
          useDepartureFee: saved.useDepartureFee === true,
          enteredInQb: saved.enteredInQb === true,
          title: saved.title ?? '',
          description: saved.description ?? '',
          isActive: saved.isActive
        }, { emitEvent: false });
        setTimeout(() => this.onWorkOrderTypeChanged(saved.workOrderTypeId, true), 0);
        this.workOrderItems = (saved.workOrderItems ?? []).map(item => {
          const itemSource = this.resolveItemSourceFromReceiptId(item.receiptId);
          const laborHours = Math.floor(Number(item.laborHours)) || 0;
          const laborCost = Number(item.laborCost) || 0;
          const derivedAmount = Math.round(((Number(item.itemAmount) || 0) - (laborHours * laborCost)) * 100) / 100;
          const receiptAmount = derivedAmount;
          totalAmount += item.itemAmount;
          return {
            workOrderItemId: item.workOrderItemId,
            workOrderId: item.workOrderId,
            description: item.description ?? '',
            receiptId: item.receiptId ?? null,
            receiptSplitKey: null,
            receiptAmount,
            itemSource,
            laborHours,
            laborCost,
            itemAmount: item.itemAmount ?? 0
          };
        });
        if (this.isAddMode) {
          this.syncReceiptAmounts();
        }
        this.hydrateReceiptSplitKeysFromLoadedReceipts();
        this.syncUseDepartureFeeFromItems();
        this.hasUserEditedWorkOrder = false;
        this.captureInitialWorkOrderItemsSnapshot();
        this.savedEvent.emit(saved);
        if (wasCreate) {
          this.updateAccountingOfficeWorkOrderNoAfterCreate();
        }
        const hasReceiptItems = this.workOrderItems.some(item => item.itemSource === 'receipt');
        if (hasReceiptItems) {
          const effectiveWorkOrderCode = saved.workOrderCode ?? this.form.get('workOrderCode')?.value ?? this.generatedWorkOrderCode ?? '';
          this.updateReceiptsWorkOrderCode(effectiveWorkOrderCode, saved.workOrderId ?? null, selectedSplitKeysForSave, previousAssignedSplitKeys);
        }
        this.toastr.success('Work order saved.', 'Success');

        // Save this work order as an invoice that can be paid
        this.saveWorkOrderAsInvoice(saved, totalAmount);

        if (!this.navigateToPreviewOnSave) {
          return;
        }

        if (saved.workOrderId) {
          const propertyId = this.resolvePropertyIdForSave() ?? ((saved.propertyId || '').trim() || null);
          const reservationId = (saved.reservationId || this.form.get('reservationId')?.value || '').toString().trim();
          if (this.embeddedInMaintenance && this.embedDocumentPreviewInShell) {
            this.previewEvent.emit({
              workOrderId: saved.workOrderId,
              propertyId,
              reservationId: reservationId || null,
              officeId: this.getShellOfficeId(),
              propertyCode: (this.property?.propertyCode || saved.propertyCode || '').trim(),
              returnToDetail: true
            });
            return;
          }
          this.router.navigateByUrl(this.buildWorkOrderPreviewUrl(saved.workOrderId, propertyId, reservationId, 'work-order'));
          return;
        }

        this.toastr.warning('Work order saved, but unable to open the preview page.', 'Navigation Warning');
      },
      error: (err: HttpErrorResponse) => {
        const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(err);
        if (closedPeriodMessage) {
          this.toastr.error(closedPeriodMessage, 'Error');
          return;
        }
        const detail = this.utilityService.extractApiErrorMessage(err);
        this.toastr.error(
          detail ? `Unable to save work order. ${detail}` : 'Unable to save work order.',
          'Error'
        );
      }
    });
  }

  saveWorkOrderAsInvoice(workOrder: WorkOrderResponse, totalAmount: number): void {
    const workOrderTypeId = Number(this.form.get('workOrderTypeId')?.value ?? -1);
    if (workOrderTypeId !== WorkOrderType.Tenant || workOrder.useDepartureFee) {
      return;
    }
    
    const numericCostCodeId = this.getNumericCostCodeIdForInvoice();
    if (numericCostCodeId === null) {
      this.toastr.warning('Work order saved, but invoice was not created because Cost Code is invalid.', 'Partial Update');
      return;
    }

    const now = new Date();
    const todayCalendar =
      this.utilityService.formatDateOnlyForApi(now) ?? this.utilityService.todayAsCalendarDateString();
    const workOrderRef = this.form.get('workOrderCode')?.value || this.workOrder?.workOrderCode || this.workOrder?.workOrderId || this.workOrderId || 'Work Order';
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    const ledgerLines: LedgerLineRequest[] = [
      {
        lineNumber: 1,
        transactionTypeId: TransactionType.Charge,
        reservationId: workOrder.reservationId,
        costCodeId: numericCostCodeId,
        description: workOrderRef,
        amount: roundedTotalAmount,
        ledgerLineDate: todayCalendar
      }
    ];

    const invoiceRequest: InvoiceRequest = {
      organizationId: this.property.organizationId,
      officeId: this.property.officeId,
      officeName: this.property.officeName,
      reservationId: workOrder.reservationId,
      reservationCode: workOrder.reservationCode,
      invoiceCode: workOrder.workOrderCode,
      startDate: todayCalendar,
      endDate: todayCalendar,
      invoiceDate: todayCalendar,
      dueDate: todayCalendar,
      accountingPeriod: this.utilityService.toDateOnlyJsonString(new Date(now.getFullYear(), now.getMonth(), 1)),
      invoicePeriod: `${this.formatter.dateOnly(now)} - ${this.formatter.dateOnly(now)}`,
      totalAmount: roundedTotalAmount,
      paidAmount: 0,
      notes: `Generated from Work Order ${workOrderRef}`,
      isActive: true,
      ledgerLines
    };

    this.isSubmitting = true;
    this.invoiceService.getInvoiceByCode(invoiceRequest.invoiceCode || '', [this.property.officeId]).pipe(take(1),
      switchMap(existingInvoice => {
        if (existingInvoice) {
          invoiceRequest.invoiceId = existingInvoice.invoiceId;
          ledgerLines[0].invoiceId = existingInvoice.invoiceId;
          ledgerLines[0].ledgerLineId = existingInvoice.ledgerLines[0].ledgerLineId;
          return this.invoiceService.updateInvoice(invoiceRequest);
        }
        return this.invoiceService.createInvoice(invoiceRequest);
      }),
      finalize(() => { this.isSubmitting = false; })
    ).subscribe({
      next: (invoice) => {
        if (!invoice) {
          return;
        }
      },
      error: (err: HttpErrorResponse) => {
        const detail = this.utilityService.extractApiErrorMessage(err);
        this.toastr.error(
          detail ? `Unable to save invoice from work order. ${detail}` : 'Unable to save invoice from work order.',
          'Error'
        );
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      workOrderCode: new FormControl(''),
      workOrderDate: new FormControl(this.getWorkOrderDateControlValue(this.getTodayWorkOrderDate()), [Validators.required]),
      officeName: new FormControl(''),
      propertyCode: new FormControl(''),
      workOrderTypeId: new FormControl<number | null>(null, [Validators.required]),
      applyMarkup: new FormControl(false),
      reservationId: new FormControl<string | null>(null),
      useDepartureFee: new FormControl(false),
      enteredInQb: new FormControl(false),
      title: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
    this.lastMarkupFactor = this.getMarkupFactor();
  }

  applyInitialWorkOrderPrefill(): void {
    if (!this.isAddMode) {
      return;
    }

    const title = (this.initialTitle || '').trim();
    const description = (this.initialDescription || '').trim();
    if (!title && !description) {
      return;
    }

    const patch: { title?: string; description?: string } = {};
    if (title && !(this.form.get('title')?.value ?? '').toString().trim()) {
      patch.title = title.slice(0, 1000);
    }
    if (description && !(this.form.get('description')?.value ?? '').toString().trim()) {
      patch.description = description.slice(0, 2048);
    }

    if (Object.keys(patch).length > 0) {
      this.form.patchValue(patch, { emitEvent: false });
    }
  }

  populateForm(workOrder: WorkOrderResponse): void {
    this.form.patchValue({
      workOrderCode: workOrder.workOrderCode ?? '',
      workOrderDate: this.getWorkOrderDateControlValue(workOrder.workOrderDate),
      officeName: workOrder.officeName ?? this.property?.officeName ?? '',
      propertyCode: workOrder.propertyCode ?? this.property?.propertyCode ?? '',
      workOrderTypeId: workOrder.workOrderTypeId ?? 0,
      applyMarkup: workOrder.applyMarkup === true,
      reservationId: workOrder.reservationId ?? null,
      useDepartureFee: workOrder.useDepartureFee === true,
      enteredInQb: workOrder.enteredInQb === true,
      title: workOrder.title ?? '',
      description: workOrder.description ?? '',
      isActive: workOrder.isActive
    }, { emitEvent: false });
    setTimeout(() => this.onWorkOrderTypeChanged(workOrder.workOrderTypeId ?? 0, true), 0);

    this.workOrderItems = (workOrder.workOrderItems ?? []).map(item => ({
      ...(() => {
        const itemSource = this.resolveItemSourceFromReceiptId(item.receiptId);
        const laborHours = Math.floor(Number(item.laborHours)) || 0;
        const laborCost = Number(item.laborCost) || 0;
        const derivedAmount = Math.round(((Number(item.itemAmount) || 0) - (laborHours * laborCost)) * 100) / 100;
        const receiptAmount = derivedAmount;
        return {
          workOrderItemId: item.workOrderItemId,
          workOrderId: item.workOrderId,
          description: item.description ?? '',
          receiptId: item.receiptId ?? null,
          receiptSplitKey: null,
          receiptAmount,
          itemSource,
          laborHours,
          laborCost,
          itemAmount: item.itemAmount ?? 0
        };
      })()
    }));
    if (this.isAddMode) {
      this.syncReceiptAmounts();
    }
    this.lastMarkupFactor = this.getMarkupFactor();
    this.hasUserEditedWorkOrder = false;
    this.captureInitialWorkOrderItemsSnapshot();
    this.syncUseDepartureFeeFromItems();
  }

  isInventoryItemSelected(item: WorkOrderItemEditable): boolean {
    return item.itemSource === 'inventory';
  }
  
  isTenantTypeSelected(): boolean {
    return Number(this.form.get('workOrderTypeId')?.value ?? -1) === 0;
  }

  isOwnerTypeSelected(): boolean {
    return Number(this.form.get('workOrderTypeId')?.value ?? -1) === WorkOrderType.Owner;
  }

  isPropertySelectionRequired(): boolean {
    return Number(this.form.get('workOrderTypeId')?.value ?? -1) !== WorkOrderType.Company;
  }

  resolvePropertyIdForSave(requiresPropertySelection: boolean = this.isPropertySelectionRequired()): string | null {
    if (!requiresPropertySelection) {
      return null;
    }
    const resolvedPropertyId = (this.property?.propertyId || this.selectedPropertyId || '').trim();
    return resolvedPropertyId || null;
  }

  getUseDepartureFeeForSave(): boolean {
    return this.isTenantTypeSelected() && this.workOrderItemsHasDepartureReceiptSplit();
  }

  workOrderItemsHasDepartureReceiptSplit(): boolean {
    return this.workOrderItems.some(item => {
      if (item.itemSource !== 'receipt' || !item.receiptSplitKey) {
        return false;
      }
      return this.getReceiptTypeIdForSplitKey(item.receiptSplitKey) === ReceiptType.Departure;
    });
  }

  getReceiptTypeIdForSplitKey(splitKey: string | null | undefined): number | null {
    const parsed = this.parseSplitKey(splitKey || '');
    if (!parsed) {
      return null;
    }

    const receipt = this.propertyReceipts.find(r => r.receiptId === parsed.receiptId);
    if (!receipt) {
      return null;
    }

    const splits: Split[] = receipt.splits?.length
      ? receipt.splits
      : [{ receiptTypeId: ReceiptType.Tenant, amount: 0, description: '' }];

    if (parsed.receiptSplitId != null) {
      const split = splits.find(s => Number(s.receiptSplitId) === parsed.receiptSplitId);
      return split == null ? null : Number(split.receiptTypeId);
    }

    if (parsed.splitIndex != null && parsed.splitIndex >= 0 && parsed.splitIndex < splits.length) {
      return Number(splits[parsed.splitIndex].receiptTypeId);
    }

    return null;
  }

  syncUseDepartureFeeFromItems(): void {
    const useDepartureFeeControl = this.form.get('useDepartureFee');
    if (!useDepartureFeeControl) {
      return;
    }

    if (!this.isTenantTypeSelected()) {
      useDepartureFeeControl.setValue(false, { emitEvent: false });
      useDepartureFeeControl.enable({ emitEvent: false });
      return;
    }

    useDepartureFeeControl.setValue(this.workOrderItemsHasDepartureReceiptSplit(), { emitEvent: false });
    useDepartureFeeControl.disable({ emitEvent: false });
  }

  onWorkOrderTypeChanged(typeId: number | null | undefined, skipItemRecalculation: boolean = false): void {
    this.updateReservationRequirementByType(typeId);
    const isOwner = Number(typeId) === WorkOrderType.Owner;
    const applyMarkupControl = this.form.get('applyMarkup');
    if (this.isAddMode) {
      applyMarkupControl?.setValue(isOwner, { emitEvent: false });
    } else if (!isOwner) {
      applyMarkupControl?.setValue(false, { emitEvent: false });
    }
    this.syncUseDepartureFeeFromItems();
    if (!skipItemRecalculation) {
      this.reapplyMarkupToCurrentItems(true);
    }
    this.emitPropertySelectionRequiredState();
  }

  emitPropertySelectionRequiredState(): void {
    this.propertySelectionRequiredChange.emit(this.isPropertySelectionRequired());
  }

  onApplyMarkupToggle(): void {
    const currentApplyMarkup = this.form.get('applyMarkup')?.value === true;
    const previousFactor = this.getMarkupFactorForApplyState(!currentApplyMarkup);
    const nextFactor = this.getMarkupFactorForApplyState(currentApplyMarkup);
    const previousReceiptAmounts = this.workOrderItems.map(item => Number(item.receiptAmount) || 0);
    this.workOrderItems.forEach(item => {
      item.receiptAmount = undefined;
    });
    this.reapplyMarkupToCurrentItems(true, previousFactor, nextFactor, previousReceiptAmounts);
  }

  reapplyMarkupToCurrentItems(
    forceReevaluate: boolean = false,
    previousFactorOverride?: number,
    nextFactorOverride?: number,
    previousReceiptAmounts?: number[]
  ): void {
    const previousFactor = previousFactorOverride ?? this.lastMarkupFactor;
    const nextFactor = nextFactorOverride ?? this.getMarkupFactor();
    const shouldRoundUpForMarkup = this.form.get('applyMarkup')?.value === true
      && this.isOwnerTypeSelected()
      && nextFactor > 1;
    const factorDelta = previousFactor - nextFactor;
    if (!forceReevaluate && factorDelta > -0.000001 && factorDelta < 0.000001) {
      this.lastMarkupFactor = nextFactor;
      return;
    }

    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    const usedSplitKeys = new Set<string>();
    this.workOrderItems.forEach((item, index) => {
      if (item.itemSource === 'receipt' && item.receiptId != null) {
        if (!item.receiptSplitKey) {
          item.receiptSplitKey = this.resolveInitialSplitKeyForItem(item.receiptId, currentWorkOrderCode, usedSplitKeys);
        }
        if (item.receiptSplitKey) {
          usedSplitKeys.add(item.receiptSplitKey);
        }
        const splitOption = item.receiptSplitKey ? this.getSplitOptionByKey(item.receiptSplitKey) : null;
        const baseAmount = splitOption?.amount ?? this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0;
        item.receiptAmount = this.workOrderAmountService.roundCurrency(baseAmount * nextFactor, shouldRoundUpForMarkup);
      } else if (item.itemSource === 'inventory') {
        const currentAmount = previousReceiptAmounts?.[index] ?? (Number(item.receiptAmount) || 0);
        const baseAmount = previousFactor !== 0 ? (currentAmount / previousFactor) : currentAmount;
        item.receiptAmount = this.workOrderAmountService.roundCurrency(baseAmount * nextFactor, shouldRoundUpForMarkup);
      }

      // Persist recalculated amount onto the line item model immediately.
      item.itemAmount = this.getItemTotal(item);
    });

    this.lastMarkupFactor = nextFactor;
  }

  syncReceiptAmounts(): void {
    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    const usedSplitKeys = new Set<string>();
    this.workOrderItems.forEach(item => {
      if (item.itemSource === 'receipt' && item.receiptId != null) {
        if (!item.receiptSplitKey) {
          item.receiptSplitKey = this.resolveInitialSplitKeyForItem(item.receiptId, currentWorkOrderCode, usedSplitKeys);
        }
        if (item.receiptSplitKey) {
          usedSplitKeys.add(item.receiptSplitKey);
        }
        const splitOption = item.receiptSplitKey ? this.getSplitOptionByKey(item.receiptSplitKey) : null;
        const amt = splitOption?.amount ?? this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0;
        (item as WorkOrderItemEditable).receiptAmount = this.applyPropertyAgreementMarkup(amt);
      }
    });
  }

  hydrateReceiptSplitKeysFromLoadedReceipts(): void {
    if (!this.workOrderItems?.length || !this.propertyReceipts?.length) {
      return;
    }

    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    const usedSplitKeys = new Set<string>();

    this.workOrderItems.forEach(item => {
      if (item.itemSource === 'receipt' && item.receiptSplitKey) {
        usedSplitKeys.add(item.receiptSplitKey);
      }
    });

    this.workOrderItems.forEach(item => {
      const receiptId = String(item.receiptId ?? '').trim();
      if (!receiptId) {
        return;
      }
      item.itemSource = 'receipt';
      if (item.receiptSplitKey) {
        return;
      }
      const splitKey = this.resolveInitialSplitKeyForItem(receiptId, currentWorkOrderCode, usedSplitKeys);
      if (splitKey) {
        item.receiptSplitKey = splitKey;
        usedSplitKeys.add(splitKey);
      }
    });

    this.syncUseDepartureFeeFromItems();
  }

  onPrimaryAction(): void {
    if (this.isViewModeBeforeChanges()) {
      this.openWorkOrderView();
      return;
    }
    this.saveWorkOrder();
  }

  onInlineSaveClick(): void {
    this.onPrimaryAction();
  }

  openWorkOrderView(): void {
    const id = this.workOrder?.workOrderId ?? this.workOrderId;
    if (!id) {
      this.toastr.warning('Save the work order before viewing.', 'No Work Order');
      return;
    }

    const associatedReceiptIds = this.getCurrentAssociatedReceiptIds();
    const existingReceiptIds = new Set((this.propertyReceipts || []).map(receipt => String(receipt.receiptId).trim()));
    const missingReceiptIds = associatedReceiptIds.filter(receiptId => !existingReceiptIds.has(receiptId));
    if (!missingReceiptIds.length) {
      this.navigateToWorkOrderView(id);
      return;
    }

    this.isSubmitting = true;
    const fetches = missingReceiptIds.map(receiptId =>
      this.receiptService.getReceiptById(receiptId).pipe(
        take(1),
        catchError(() => of(null))
      )
    );
    forkJoin(fetches).pipe(take(1), finalize(() => { this.isSubmitting = false; })).subscribe({
      next: receipts => {
        const fetchedReceipts = (receipts || []).filter((receipt): receipt is ReceiptResponse => receipt != null);
        if (fetchedReceipts.length) {
          this.associatedWorkOrderReceiptIds = new Set([...this.associatedWorkOrderReceiptIds, ...associatedReceiptIds]);
          this.propertyReceipts = this.mergeAssociatedReceipts(this.propertyReceipts, fetchedReceipts);
          this.syncReceiptAmounts();
        }
        this.navigateToWorkOrderView(id);
      },
      error: () => {
        this.navigateToWorkOrderView(id);
      }
    });
  }
  //#endregion

  //#region Work Order Items
  addWorkOrderItem(): void {
    this.setUserEdited('addWorkOrderItem');
    if (!this.canAddItem()) {
      this.form.markAllAsTouched();
      return;
    }

    const newItem: WorkOrderItemEditable = {
      description: '',
      receiptId: null,
      receiptSplitKey: null,
      receiptAmount: 0,
      itemSource: 'noReceipt',
      laborHours: 0,
      laborCost: this.defaultLaborCost,
      itemAmount: 0
    };
    this.workOrderItems.push(newItem);
  }

  removeWorkOrderItem(index: number): void {
    this.setUserEdited('removeWorkOrderItem');
    if (index >= 0 && index < this.workOrderItems.length) {
      this.workOrderItems.splice(index, 1);
    }
    this.syncUseDepartureFeeFromItems();
  }

  updateWorkOrderItemField(index: number, field: keyof WorkOrderItemEditable, value: number | string | null): void {
    this.setUserEdited(`updateWorkOrderItemField.${String(field)}`);
    if (this.workOrderItems[index]) {
      (this.workOrderItems[index] as Record<string, number | string | null>)[field] = value;
    }
  }

  getAvailableReceiptsForItem(itemIndex: number): ReceiptSplitOption[] {
    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    const eligible = this.propertyReceipts.flatMap(receipt => this.getReceiptSplitOptions(receipt, currentWorkOrderCode));
    const usedByOthers = new Set<string>();
    this.workOrderItems.forEach((it, i) => {
      if (i !== itemIndex && it.itemSource === 'receipt' && it.receiptSplitKey) {
        usedByOthers.add(it.receiptSplitKey);
      }
    });
    const currentReceiptSplitKey = this.workOrderItems[itemIndex]?.receiptSplitKey ?? null;
    return eligible.filter(
      option => !usedByOthers.has(option.key) || option.key === currentReceiptSplitKey
    );
  }

  onReceiptSelectionChange(itemIndex: number, receiptSelectionValue: number | string | null): void {
    this.setUserEdited('onReceiptSelectionChange');
    const item = this.workOrderItems[itemIndex] as WorkOrderItemEditable;
    if (!item) {
      return;
    }

    if (receiptSelectionValue === this.inventoryItemOptionValue) {
      item.itemSource = 'inventory';
      item.receiptId = null;
      item.receiptSplitKey = null;
      item.receiptAmount = 0;
      this.syncUseDepartureFeeFromItems();
      return;
    }

    const splitKey = receiptSelectionValue === this.noReceiptOptionValue
      ? null
      : (typeof receiptSelectionValue === 'string' ? receiptSelectionValue : null);
    const splitOption = splitKey ? this.getSplitOptionByKey(splitKey) : null;
    const receiptId = splitOption?.receiptId ?? null;
    item.itemSource = receiptId == null ? 'noReceipt' : 'receipt';
    item.receiptId = receiptId;
    item.receiptSplitKey = splitOption?.key ?? null;
    const receiptAmount = this.applyPropertyAgreementMarkup(splitOption?.amount ?? 0);
    item.receiptAmount = receiptAmount;
    if (splitOption?.description) {
      this.updateWorkOrderItemField(itemIndex, 'description', splitOption.description);
    }
    this.syncUseDepartureFeeFromItems();
  }

  getReceiptSelectionValue(item: WorkOrderItemEditable): number | string {
    if (item.itemSource === 'inventory') {
      return this.inventoryItemOptionValue;
    }
    if (item.itemSource === 'receipt' && item.receiptSplitKey) {
      return item.receiptSplitKey;
    }
    if (item.itemSource === 'receipt' && this.isValidReceiptId(item.receiptId)) {
      const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
      const resolvedSplitKey = this.resolveInitialSplitKeyForItem(String(item.receiptId), currentWorkOrderCode, new Set<string>());
      if (resolvedSplitKey) {
        return resolvedSplitKey;
      }
    }
    return this.noReceiptOptionValue;
  }

  resolveItemSourceFromReceiptId(receiptId: string | null | undefined): 'noReceipt' | 'receipt' | 'inventory' {
    if (!this.isValidReceiptId(receiptId)) {
      return 'noReceipt';
    }
    return 'receipt';
  }

  onAmountInput(itemIndex: number, event: Event): void {
    this.setUserEdited('onAmountInput');
    const item = this.workOrderItems[itemIndex] as WorkOrderItemEditable;
    if (!item || item.itemSource !== 'inventory') {
      return;
    }

    const input = event.target as HTMLInputElement;
    if (this.focusedCurrencyField?.index === itemIndex && this.focusedCurrencyField?.field === 'amount') {
      this.focusedCurrencyField = { ...this.focusedCurrencyField, editValue: input.value };
    }
    const sanitized = input.value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(sanitized);
    item.receiptAmount = this.applyPropertyAgreementMarkup(Number.isFinite(parsed) ? parsed : 0);
  }

  getAmountInputValue(item: WorkOrderItemEditable): string {
    const itemIndex = this.workOrderItems.indexOf(item);
    if (item.itemSource === 'inventory'
      && this.focusedCurrencyField?.field === 'amount'
      && this.focusedCurrencyField?.index === itemIndex) {
      return this.focusedCurrencyField.editValue;
    }
    if (item.receiptAmount === null || item.receiptAmount === undefined) {
      return '';
    }
    return this.formatter.currencyUsd(Number(item.receiptAmount) || 0);
  }

  onAmountFocus(index: number, event: Event): void {
    const item = this.workOrderItems[index] as WorkOrderItemEditable;
    if (!item || item.itemSource !== 'inventory') {
      return;
    }
    const baseAmount = this.removePropertyAgreementMarkup(Number(item.receiptAmount) || 0);
    const raw = String(baseAmount);
    this.focusedCurrencyField = { index, field: 'amount', editValue: raw };
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onAmountBlur(index: number, event: Event): void {
    this.setUserEdited('onAmountBlur');
    const item = this.workOrderItems[index] as WorkOrderItemEditable;
    if (!item || item.itemSource !== 'inventory') {
      this.focusedCurrencyField = null;
      return;
    }
    const input = event.target as HTMLInputElement;
    const sanitized = input.value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(sanitized);
    item.receiptAmount = this.applyPropertyAgreementMarkup(Number.isFinite(parsed) ? parsed : 0);
    this.focusedCurrencyField = null;
  }

  applyPropertyAgreementMarkup(baseAmount: number): number {
    return this.workOrderAmountService.applyMarkupToReceiptAmount(baseAmount, {
      applyMarkup: this.form.get('applyMarkup')?.value === true,
      isOwnerType: this.isOwnerTypeSelected(),
      markupPercent: this.propertyAgreement?.markup
    });
  }

  removePropertyAgreementMarkup(markedAmount: number): number {
    return this.workOrderAmountService.removeMarkupFromReceiptAmount(markedAmount, {
      applyMarkup: this.form.get('applyMarkup')?.value === true,
      isOwnerType: this.isOwnerTypeSelected(),
      markupPercent: this.propertyAgreement?.markup
    });
  }

  getMarkupFactor(): number {
    const applyMarkup = this.form.get('applyMarkup')?.value === true;
    return this.getMarkupFactorForApplyState(applyMarkup);
  }

  getMarkupFactorForApplyState(applyMarkup: boolean): number {
    return this.workOrderAmountService.getMarkupFactor({
      applyMarkup,
      isOwnerType: this.isOwnerTypeSelected(),
      markupPercent: this.propertyAgreement?.markup
    });
  }

  getMarkupAmountDisplay(): string {
    const parsed = this.workOrderAmountService.parseMarkupPercent(this.propertyAgreement?.markup);
    if (parsed === null) {
      return '0%';
    }
    const normalized = (parsed >= -1 && parsed <= 1) ? parsed * 100 : parsed;
    return `${Math.round(normalized)}%`;
  }

  getItemTotal(item: WorkOrderItemEditable | WorkOrderItemResponse): number {
    const editable = item as WorkOrderItemEditable;
    const receiptAmt = editable.receiptAmount != null
      ? Number(editable.receiptAmount)
      : (item.receiptId != null ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0) : 0);
    return this.workOrderAmountService.calculateLineTotal(receiptAmt, item.laborHours, item.laborCost);
  }

  getTotalDisplay(item: WorkOrderItemEditable): string {
    return this.formatter.currencyUsd(this.getItemTotal(item));
  }

  getTotalAmount(): number {
    return this.workOrderItems.reduce((sum, item) => sum + this.getItemTotal(item), 0);
  }

  getTotalAmountDisplay(): string {
    return this.formatter.currencyUsd(this.getTotalAmount());
  }

  getLaborCostDisplay(index: number, item: WorkOrderItemEditable): string {
    if (this.focusedCurrencyField?.index === index && this.focusedCurrencyField?.field === 'laborCost') {
      return this.focusedCurrencyField.editValue;
    }
    return this.formatter.currencyUsd(Number(item.laborCost) || 0);
  }

  onLaborCostFocus(index: number, event: Event): void {
    const item = this.workOrderItems[index];
    const raw = item?.laborCost != null ? String(item.laborCost) : '';
    this.focusedCurrencyField = { index, field: 'laborCost', editValue: raw };
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onLaborCostBlur(index: number, event: Event): void {
    this.setUserEdited('onLaborCostBlur');
    const input = event.target as HTMLInputElement;
    const parsed = parseFloat(input.value) || 0;
    this.updateWorkOrderItemField(index, 'laborCost', parsed);
    this.focusedCurrencyField = null;
  }

  onLaborCostInput(index: number, event: Event): void {
    this.setUserEdited('onLaborCostInput');
    const input = event.target as HTMLInputElement;
    if (this.focusedCurrencyField?.index === index && this.focusedCurrencyField?.field === 'laborCost') {
      this.focusedCurrencyField = { ...this.focusedCurrencyField, editValue: input.value };
    }
  }

  getSelectedReservationCode(): string | null {
    const reservationId = this.form.get('reservationId')?.value ?? null;
    if (!reservationId) {
      return null;
    }
    const fromList = this.propertyReservations.find(r => r.reservationId === reservationId)?.reservationCode ?? null;
    if (fromList) {
      return fromList;
    }
    // Fallback for edit mode if reservation list has not loaded yet.
    if (this.workOrder?.reservationId === reservationId) {
      return this.workOrder.reservationCode ?? null;
    }
    return null;
  }

  //#endregion

  //#region Save Detection
  isViewModeBeforeChanges(): boolean {
    if (this.isAddMode || !this.workOrder?.workOrderId) {
      return false;
    }
    const payload: WorkOrderRequest = {
      organizationId: this.property?.organizationId ?? this.workOrder.organizationId,
      officeId: this.property?.officeId ?? this.workOrder.officeId,
      propertyId: this.resolvePropertyIdForSave(),
      workOrderDate: this.getWorkOrderDateForApi(),
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
      applyMarkup: this.isOwnerTypeSelected() ? (this.form.get('applyMarkup')?.value === true) : false,
      reservationId: this.isTenantTypeSelected() ? (this.form.get('reservationId')?.value ?? null) : null,
      reservationCode: this.isTenantTypeSelected() ? this.getSelectedReservationCode() : null,
      useDepartureFee: this.getUseDepartureFeeForSave(),
      enteredInQb: this.form.get('enteredInQb')?.value === true,
      title: (this.form.get('title')?.value ?? '').trim(),
      description: (this.form.get('description')?.value ?? '').trim(),
      workOrderItems: this.mapWorkOrderItemsForSave(false),
      isActive: this.form.get('isActive')?.value ?? true,
      workOrderId: this.workOrder.workOrderId
    };
    return !this.hasWorkOrderUpdates(payload);
  }

  mapWorkOrderItemsForSave(isCreate: boolean): WorkOrderItemRequest[] {
    return this.workOrderItems.map(item => {
      const base: WorkOrderItemRequest = {
        description: (item.description ?? '').trim(),
        receiptId: item.itemSource === 'receipt' ? (item.receiptId ?? undefined) : undefined,
        laborHours: Math.floor(Number(item.laborHours)) || 0,
        laborCost: Number(item.laborCost) || 0,
        itemAmount: this.getItemTotal(item)
      };
      if (!isCreate && this.workOrder?.workOrderId) {
        base.workOrderId = this.workOrder.workOrderId;
        if (item.workOrderItemId != null && item.workOrderItemId !== '') {
          base.workOrderItemId = String(item.workOrderItemId);
        }
      }
      return base;
    });
  }

  hasWorkOrderItemsChanged(): boolean {
    const baseline = this.initialWorkOrderItemsSnapshot ?? [];
    if (this.workOrderItems.length !== baseline.length) {
      return true;
    }
    for (let i = 0; i < this.workOrderItems.length; i++) {
      const current = this.workOrderItems[i];
      const original = baseline[i];
      if (!original) {
        return true;
      }
      const currentTotal = this.getItemTotal(current);
      const currentDescription = (current.description ?? '').trim();
      const currentReceiptId = current.receiptId ?? null;
      const currentSplitKey = current.receiptSplitKey ?? null;
      const currentLaborHours = Math.floor(Number(current.laborHours)) || 0;
      const currentLaborCost = Number(current.laborCost) || 0;

      if (currentDescription !== original.description ||
          currentReceiptId !== original.receiptId ||
          currentSplitKey !== original.receiptSplitKey ||
          currentLaborHours !== original.laborHours ||
          currentLaborCost !== original.laborCost ||
          currentTotal !== original.itemAmount ||
          (current.workOrderItemId ? String(current.workOrderItemId) : null) !== original.workOrderItemId) {
        return true;
      }
    }
    return false;
  }

  captureInitialWorkOrderItemsSnapshot(): void {
    const snapshotWorkOrderCode = this.workOrder?.workOrderCode ?? this.form.get('workOrderCode')?.value ?? null;
    this.initialWorkOrderItemsSnapshot = this.workOrderItems.map(item => ({
      workOrderItemId: item.workOrderItemId ? String(item.workOrderItemId) : null,
      workOrderCode: snapshotWorkOrderCode,
      description: (item.description ?? '').trim(),
      receiptId: item.receiptId ?? null,
      receiptSplitKey: item.receiptSplitKey ?? null,
      laborHours: Math.floor(Number(item.laborHours)) || 0,
      laborCost: Number(item.laborCost) || 0,
      itemAmount: this.getItemTotal(item)
    }));
  }

  hasWorkOrderUpdates(payload: WorkOrderRequest): boolean {
    if (!this.workOrder) {
      return true;
    }
    const payloadReservationId = this.normalizeComparableString(payload.reservationId);
    const workOrderReservationId = this.normalizeComparableString(this.workOrder.reservationId);
    const payloadReservationCode = this.normalizeComparableString(payload.reservationCode);
    const workOrderReservationCode = this.normalizeComparableString(this.workOrder.reservationCode);
    const payloadTitle = this.normalizeComparableString(payload.title) ?? '';
    const workOrderTitle = this.normalizeComparableString(this.workOrder.title) ?? '';
    const payloadDescription = this.normalizeComparableString(payload.description) ?? '';
    const workOrderDescription = this.normalizeComparableString(this.workOrder.description) ?? '';
    const payloadWorkOrderDate = this.normalizeComparableString(payload.workOrderDate) ?? '';
    const workOrderWorkOrderDate = this.normalizeComparableString(this.normalizeWorkOrderDate(this.workOrder.workOrderDate)) ?? '';
    const useDepartureFeeMismatch = this.getUseDepartureFeeForSave() !== (this.workOrder.useDepartureFee === true);

    return (
      payloadWorkOrderDate !== workOrderWorkOrderDate ||
      payload.workOrderTypeId !== this.workOrder.workOrderTypeId ||
      payload.applyMarkup !== (this.workOrder.applyMarkup === true) ||
      payloadReservationId !== workOrderReservationId ||
      payloadReservationCode !== workOrderReservationCode ||
      useDepartureFeeMismatch ||
      payload.enteredInQb !== (this.workOrder.enteredInQb === true) ||
      payloadTitle !== workOrderTitle ||
      payloadDescription !== workOrderDescription ||
      payload.isActive !== this.workOrder.isActive ||
      this.hasWorkOrderItemsChanged()
    );
  }

  normalizeComparableString(value: string | null | undefined): string | null {
    const normalized = (value ?? '').toString().trim();
    return normalized.length > 0 ? normalized : null;
  }

  getTodayWorkOrderDate(): string {
    return this.utilityService.todayAsCalendarDateString();
  }

  getWorkOrderDateForApi(): string {
    const dateValue = this.form.get('workOrderDate')?.value;
    return this.utilityService.toDateOnlyJsonString(dateValue) ?? this.getTodayWorkOrderDate();
  }

  normalizeWorkOrderDate(value: string | null | undefined): string | null {
    return this.utilityService.toDateOnlyJsonString(value);
  }

  getWorkOrderDateControlValue(value: string | null | undefined): Date {
    return this.utilityService.parseCalendarDateInput(value) ?? new Date();
  }

  refreshBaselineAfterDataLoad(): void {
    if (this.isAddMode || !this.workOrder?.workOrderId || this.isSubmitting || this.hasUserEditedWorkOrder) {
      return;
    }
    this.captureInitialWorkOrderItemsSnapshot();
  }

  updateReservationRequirementByType(typeId: number | null | undefined): void {
    const reservationControl = this.form.get('reservationId');
    if (!reservationControl) {
      return;
    }

    const isTenantType = Number(typeId) === WorkOrderType.Tenant;
    if (isTenantType) {
      reservationControl.setValidators([Validators.required]);
    } else {
      reservationControl.clearValidators();
      reservationControl.setValue(null, { emitEvent: false });
      if (this.workOrder) {
        this.workOrder.reservationId = null;
        this.workOrder.reservationCode = null;
      }
    }

    reservationControl.updateValueAndValidity({ emitEvent: false });
  }
  //#endregion 

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
        });
      },
      error: () => {
        this.offices = [];
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          if (this.property?.officeId) {
            this.setTenantDamagesCcId(this.property.officeId);
          }
        });
      },
      error: () => {
        this.accountingOffices = [];
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(() => {
          if (this.property?.officeId) {
            this.setTenantDamagesCcId(this.property.officeId);
          }
        });
      },
      error: () => {}
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        if (this.property?.officeId) {
          this.setTenantDamagesCcId(this.property.officeId);
        }
      });
    });
  }

  loadVendors(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      error: () => {}
    });
  }

  setTenantDamagesCcId(officeId: number): void {
    const accountId = this.accountingOffices.find(o => o.officeId === officeId)?.defaultTenantIncAccountId;
    if (accountId == null || accountId <= 0) {
      this.tenantDamagesCcId = null;
      return;
    }

    const cachedAccountNo = this.chartOfAccounts
      .filter(account => account.officeId === officeId)
      .find(account => account.accountId === accountId)?.accountNo;
    if (cachedAccountNo) {
      this.tenantDamagesCcId = this.costCodesService.getCostCodeIdByOfficeAndAccountNo(officeId, cachedAccountNo);
      return;
    }

    this.chartOfAccountsService.getChartOfAccountById(officeId, accountId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: account => {
        this.tenantDamagesCcId = this.costCodesService.getCostCodeIdByOfficeAndAccountNo(officeId, account?.accountNo);
      },
      error: () => {
        this.tenantDamagesCcId = null;
      }
    });
  }

  resolvePrefetchedWorkOrder(): WorkOrderResponse | null {
    if (this.prefetchedWorkOrder?.workOrderId === this.workOrderId) {
      return this.prefetchedWorkOrder;
    }

    const stateWorkOrder = history.state?.prefetchedWorkOrder as WorkOrderResponse | undefined;
    if (stateWorkOrder?.workOrderId === this.workOrderId) {
      return stateWorkOrder;
    }

    return null;
  }

  loadWorkOrder(): void {
    if (this.isAddMode || this.workOrderId == null) {
      this.associatedWorkOrderReceiptIds.clear();
      this.activeWorkOrderLoadId++;
      this.clearWorkOrderLoading();
      return;
    }

    const loadId = ++this.activeWorkOrderLoadId;
    const requestedWorkOrderId = this.workOrderId;
    this.isWorkOrderContentReady = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'workOrder');

    this.workOrderService.getWorkOrderById(requestedWorkOrderId).pipe(take(1), finalize(() => {
      if (this.activeWorkOrderLoadId === loadId) {
        this.clearWorkOrderLoading();
      }
    })).subscribe({
      next: (workOrder: WorkOrderResponse) => {
        if (this.activeWorkOrderLoadId !== loadId || this.workOrderId !== requestedWorkOrderId) {
          return;
        }
        this.applyLoadedWorkOrder(workOrder);
      },
      error: (_err: HttpErrorResponse) => {
        if (this.activeWorkOrderLoadId !== loadId) {
          return;
        }
        this.toastr.error('Unable to load work order.', 'Error');
        this.cdr.detectChanges();
      }
    });
  }

  applyLoadedWorkOrder(workOrder: WorkOrderResponse): void {
    this.workOrder = workOrder;
    this.associatedWorkOrderReceiptIds = new Set(
      (workOrder.workOrderItems || [])
        .map(item => String(item.receiptId ?? '').trim())
        .filter(receiptId => receiptId.length > 0)
    );
    this.populateForm(workOrder);
    this.applyPropertyContextFromWorkOrder(workOrder);
    this.syncShellLocationFromWorkOrder(workOrder);
    this.loadAssociatedReceiptsForCurrentWorkOrder();
    this.isWorkOrderContentReady = true;
    this.cdr.detectChanges();
  }

  clearWorkOrderLoading(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
    this.cdr.detectChanges();
  }

  private applyPropertyContextFromWorkOrder(workOrder: WorkOrderResponse): void {
    const propertyId = (workOrder.propertyId || '').trim();
    if (!propertyId) {
      return;
    }

    this.selectedPropertyId = propertyId;
    if (this.property?.propertyId === propertyId) {
      this.loadPropertyAgreement();
      this.loadPropertyReceipts();
      this.loadPropertyReservations();
      return;
    }

    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
      next: property => {
        this.property = property;
        this.setTenantDamagesCcId(property.officeId);
        this.form.patchValue({
          officeName: property.officeName || workOrder.officeName || '',
          propertyCode: property.propertyCode || workOrder.propertyCode || ''
        }, { emitEvent: false });
        this.loadPropertyAgreement();
        this.loadPropertyReceipts();
        this.loadPropertyReservations();
      },
      error: () => {
        this.toastr.error('Unable to load property for this work order.', 'Error');
      }
    });
  }

  private syncShellLocationFromWorkOrder(workOrder: WorkOrderResponse): void {
    if (!this.embeddedInMaintenance) {
      return;
    }

    const officeId = Number(workOrder.officeId ?? 0);
    this.shellLocationSync.emit({
      officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null,
      propertyId: (workOrder.propertyId || '').trim() || null
    });
  }

  loadProperty(): void {
    if (this.property) {
      this.setTenantDamagesCcId(this.property.officeId);
      return;
    }

    if (!this.selectedPropertyId) {
      return;
    }

    this.propertyService.getPropertyByGuid(this.selectedPropertyId).pipe(take(1)).subscribe({
      next: (property) => {
        this.property = property;
        this.setTenantDamagesCcId(property.officeId);
     },
      error: () => {
        this.toastr.error('Unable to load property.', 'Error');
      }
    });
  }

  loadPropertyAgreement(): void {
    if (!this.selectedPropertyId) {
      this.propertyAgreement = null;
      this.defaultLaborCost = 0;
      return;
    }

    this.propertyAgreementService.getPropertyAgreement(this.selectedPropertyId).pipe(take(1)).subscribe({
      next: agreement => {
        this.propertyAgreement = agreement;
        this.defaultLaborCost = Number(agreement?.hourlyLaborCost) || 0;
        this.applyDefaultLaborCostToUnsavedItems();
        if (this.isAddMode) {
          this.reapplyMarkupToCurrentItems(true);
        }
      },
      error: () => {
        this.propertyAgreement = null;
        this.defaultLaborCost = 0;
        if (this.isAddMode) {
          this.reapplyMarkupToCurrentItems(true);
        }
      }
    });
  }

  loadPropertyReceipts(): void {
    if (!this.selectedPropertyId) {
      this.propertyReceipts = [];
      this.cdr.detectChanges();
      return;
    }
    this.receiptService.getReceiptsByPropertyId(this.selectedPropertyId).pipe(take(1)).subscribe({
      next: (receipts) => {
        const activePropertyReceipts = (receipts ?? []).filter(r => r.isActive !== false);
        this.propertyReceipts = this.mergeAssociatedReceipts(activePropertyReceipts);
        this.hydrateReceiptSplitKeysFromLoadedReceipts();
        if (this.isAddMode) {
          this.syncReceiptAmounts();
        }
        this.refreshBaselineAfterDataLoad();
        this.cdr.detectChanges();
      },
      error: () => {
        this.propertyReceipts = this.mergeAssociatedReceipts([]);
        this.hydrateReceiptSplitKeysFromLoadedReceipts();
        if (this.isAddMode) {
          this.syncReceiptAmounts();
        }
        this.refreshBaselineAfterDataLoad();
        this.cdr.detectChanges();
      }
    });
  }

  loadAssociatedReceiptsForCurrentWorkOrder(): void {
    const associatedIds = Array.from(this.associatedWorkOrderReceiptIds)
      .filter(receiptId => receiptId.length > 0);
    if (!associatedIds.length) {
      return;
    }

    const existingIds = new Set((this.propertyReceipts || []).map(receipt => receipt.receiptId));
    const missingIds = associatedIds.filter(receiptId => !existingIds.has(receiptId));
    if (!missingIds.length) {
      this.hydrateReceiptSplitKeysFromLoadedReceipts();
      if (this.isAddMode) {
        this.syncReceiptAmounts();
      }
      this.refreshBaselineAfterDataLoad();
      this.cdr.detectChanges();
      return;
    }

    const fetches = missingIds.map(receiptId =>
      this.receiptService.getReceiptById(receiptId).pipe(
        take(1),
        catchError(() => of(null))
      )
    );

    forkJoin(fetches).pipe(take(1)).subscribe({
      next: (receipts) => {
        const fetchedReceipts = (receipts || []).filter((receipt): receipt is ReceiptResponse => receipt != null);
        this.propertyReceipts = this.mergeAssociatedReceipts(this.propertyReceipts, fetchedReceipts);
        this.hydrateReceiptSplitKeysFromLoadedReceipts();
        if (this.isAddMode) {
          this.syncReceiptAmounts();
        }
        this.refreshBaselineAfterDataLoad();
        this.cdr.detectChanges();
      }
    });
  }

  mergeAssociatedReceipts(baseReceipts: ReceiptResponse[], additionalReceipts: ReceiptResponse[] = []): ReceiptResponse[] {
    const mergedById = new Map<string, ReceiptResponse>();
    (baseReceipts || []).forEach(receipt => mergedById.set(receipt.receiptId, receipt));
    (additionalReceipts || []).forEach(receipt => mergedById.set(receipt.receiptId, receipt));

    const currentAssociated = (this.propertyReceipts || [])
      .filter(receipt => this.associatedWorkOrderReceiptIds.has(receipt.receiptId));
    currentAssociated.forEach(receipt => {
      if (!mergedById.has(receipt.receiptId)) {
        mergedById.set(receipt.receiptId, receipt);
      }
    });

    return Array.from(mergedById.values());
  }

  loadPropertyReservations(): void {
    if (!this.selectedPropertyId) {
      this.propertyReservations = [];
      return;
    }
    this.reservationService.getReservationsByPropertyId(this.selectedPropertyId).pipe(take(1)).subscribe({
      next: reservations => {
        this.propertyReservations = (reservations ?? []).filter(r => r.isActive !== false);
      },
      error: () => {
        this.propertyReservations = [];
      }
    });
  }

  loadAccountingOfficeForWorkOrderCode(): void {
    const officeId = Number(this.property?.officeId ?? this.getShellOfficeId() ?? 0);
    if (!this.isAddMode || !Number.isFinite(officeId) || officeId <= 0) {
      return;
    }

    this.accountingOfficeService.getAccountingOfficeById(officeId).pipe(take(1)).subscribe({
      next: office => this.applyAccountingOfficeSequenceFromOffice(office),
      error: () => this.applyAccountingOfficeSequenceFromOffice(null)
    });
  }

  applyAccountingOfficeSequenceFromOffice(office: AccountingOfficeResponse | null): void {
    if (!office) {
      this.accountingOffice = null;
      this.nextWorkOrderNo = null;
      this.generatedWorkOrderCode = null;
      this.form.patchValue({ workOrderCode: '' }, { emitEvent: false });
      return;
    }
    this.accountingOffice = office;
    const currentNo = Number(office.workOrderNo) || 0;
    this.nextWorkOrderNo = currentNo + 1;
    const paddedCode = String(this.nextWorkOrderNo).padStart(5, '0');
    this.generatedWorkOrderCode = `WO-${paddedCode}`;
    this.form.patchValue({ workOrderCode: this.generatedWorkOrderCode }, { emitEvent: false });
  }
  //#endregion

  //#region Property Agreement Defaults
  applyDefaultLaborCostToUnsavedItems(): void {
    if (!this.workOrderItems?.length) {
      return;
    }

    this.workOrderItems.forEach(item => {
      const isUnsavedItem = !item.workOrderItemId;
      const hasManualLaborCost = Number(item.laborCost) > 0;
      if (isUnsavedItem && !hasManualLaborCost) {
        item.laborCost = this.defaultLaborCost;
      }
    });
  }
  //#endregion

  //#region Work-order post save updates
  updateAccountingOfficeWorkOrderNoAfterCreate(): void {
    if (!this.accountingOffice || this.nextWorkOrderNo == null) {
      return;
    }

    const officeId = this.accountingOffice.officeId;
    this.accountingOfficeService.updateAccountingOfficeWorkOrderNo(officeId, this.nextWorkOrderNo).pipe(take(1)).subscribe({
      next: updated => {
        this.accountingOffice = { ...this.accountingOffice!, workOrderNo: updated.workOrderNo };
      },
      error: () => {
        this.toastr.warning('Work order saved, but failed to update Accounting Office work order number.', 'Partial Update');
      }
    });
  }

  updateReceiptsWorkOrderCode(
    workOrderCode: string,
    workOrderId: string | null = null,
    selectedSplitKeys: string[] = [],
    previousSplitKeys: string[] = []
  ): void {
    const activeWorkOrderCode = (workOrderCode || '').trim();
    if (!activeWorkOrderCode) {
      return;
    }

    const currentSplitKeys = new Set(selectedSplitKeys || []);
    const previousSplitKeySet = new Set(previousSplitKeys);

    const affectedReceiptIds = new Set<string>();
    [...currentSplitKeys, ...previousSplitKeySet].forEach(splitKey => {
      const parsed = this.parseSplitKey(splitKey);
      if (parsed) {
        affectedReceiptIds.add(parsed.receiptId);
      }
    });

    const updates = [...affectedReceiptIds].map(receiptId => {
      const receipt = this.propertyReceipts.find(r => r.receiptId === receiptId);
      if (!receipt) {
        return of(null);
      }

      const normalizedSplits = (receipt.splits && receipt.splits.length > 0)
        ? receipt.splits.map(split => ({ ...split }))
        : [{
            receiptSplitId: null,
            amount: Number(receipt.amount) || 0,
            description: receipt.description || '',
            workOrderId: null,
            workOrderCode: '',
            workOrder: '',
            receiptTypeId: 0,
            bankCardId: 0,
            bankCardDisplayName: null
          }];

      const nextSplits = normalizedSplits.map((split, index) => {
        const splitKey = this.buildSplitKey(receipt.receiptId, index, split.receiptSplitId ?? null);
        const currentlySelected = currentSplitKeys.has(splitKey);
        const previouslySelected = previousSplitKeySet.has(splitKey);
        const existingCode = this.getSplitWorkOrder(split);
        if (currentlySelected) {
          return {
            ...split,
            workOrderId,
            workOrderCode: activeWorkOrderCode,
            workOrder: activeWorkOrderCode
          };
        }
        if (previouslySelected && existingCode === activeWorkOrderCode) {
          return {
            ...split,
            workOrderId: null,
            workOrderCode: '',
            workOrder: ''
          };
        }
        return split;
      });

      if (JSON.stringify(nextSplits) === JSON.stringify(normalizedSplits)) {
        return of(null);
      }

      const payload: ReceiptRequest = {
        receiptId: receipt.receiptId,
        organizationId: receipt.organizationId,
        officeId: receipt.officeId,
        propertyIds: (receipt.propertyIds || []).map(propertyId => (propertyId || '').trim()).filter(propertyId => propertyId.length > 0),
        receiptDate: receipt.receiptDate || '',
        dueDate: receipt.dueDate,
        accountingPeriod: receipt.accountingPeriod,
        billNumber: receipt.billNumber ?? null,
        ticketId: receipt.ticketId,
        description: receipt.description ?? '',
        amount: receipt.amount ?? 0,
        paidAmount: receipt.paidAmount ?? 0,
        paidDate: receipt.paidDate ?? null,
        bankCardId: receipt.bankCardId ?? null,
        vendorId: receipt.vendorId ?? null,
        vendorName: receipt.vendorName ?? null,
        splits: nextSplits,
        receiptPath: receipt.receiptPath ?? undefined,
        fileDetails: receipt.fileDetails ?? undefined,
        isActive: receipt.isActive ?? true
      };
      return this.receiptService.updateReceipt(payload);
    });

    if (updates.length === 0) return;
    forkJoin(updates).pipe(take(1)).subscribe({
      next: () => {
        this.loadPropertyReceipts();
      },
      error: () => {
        this.toastr.warning('Work order saved, but one or more receipts could not be synchronized.', 'Partial Update');
      }
    });
  }

  getAssignedSplitKeysForWorkOrderCode(workOrderCode: string): string[] {
    const currentCode = (workOrderCode || '').trim();
    if (!currentCode) {
      return [];
    }
    return this.propertyReceipts.flatMap(receipt =>
      (receipt.splits || [])
        .map((split, index) => ({ split, index }))
        .filter(({ split }) => this.getSplitWorkOrder(split) === currentCode)
        .map(({ split, index }) => this.buildSplitKey(receipt.receiptId, index, split.receiptSplitId ?? null))
    );
  }

  getReceiptSplitOptions(receipt: ReceiptResponse, currentWorkOrderCode: string): ReceiptSplitOption[] {
    const normalizedSplits = (receipt.splits && receipt.splits.length > 0)
      ? receipt.splits
      : [{
          amount: Number(receipt.amount) || 0,
          description: receipt.description || '',
          workOrder: ''
        }];

    return normalizedSplits
      .map((split, index) => ({ split, index }))
      .filter(({ split }) => {
        const splitCode = this.getSplitWorkOrder(split);
        return !splitCode || (!!currentWorkOrderCode && splitCode === currentWorkOrderCode);
      })
      .map(({ split, index }) => {
        const amount = Number(split.amount) || 0;
        const description = (split.description || '').trim();
        const displayDescription = description || `Split ${index + 1}`;
        return {
          key: this.buildSplitKey(receipt.receiptId, index, split.receiptSplitId ?? null),
          receiptId: receipt.receiptId,
          receiptSplitId: Number(split.receiptSplitId) > 0 ? Number(split.receiptSplitId) : null,
          splitIndex: index,
          amount,
          description,
          receiptTypeId: Number(split.receiptTypeId) || 0,
          workOrderId: (split.workOrderId || '').toString().trim() || null,
          workOrder: this.getSplitWorkOrder(split),
          label: `${receipt.receiptCode}: ${displayDescription} - $${this.formatter.currency(amount)}`
        };
      });
  }

  getSplitOptionByKey(splitKey: string): ReceiptSplitOption | null {
    if (!splitKey) {
      return null;
    }
    const parsed = this.parseSplitKey(splitKey);
    if (!parsed) {
      return null;
    }
    const receipt = this.propertyReceipts.find(r => r.receiptId === parsed.receiptId);
    if (!receipt) {
      return null;
    }
    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    return this.getReceiptSplitOptions(receipt, currentWorkOrderCode).find(option => option.key === splitKey) ?? null;
  }

  buildSplitKey(receiptId: string, splitIndex: number, receiptSplitId?: number | null): string {
    const numericSplitId = Number(receiptSplitId);
    const identity = Number.isFinite(numericSplitId) && numericSplitId > 0
      ? `sid-${numericSplitId}`
      : `idx-${splitIndex}`;
    return `${receiptId}::${identity}`;
  }

  parseSplitKey(splitKey: string): { receiptId: string; splitIndex: number | null; receiptSplitId: number | null } | null {
    const parts = (splitKey || '').split('::');
    if (parts.length !== 2) {
      return null;
    }
    const receiptId = (parts[0] || '').trim();
    if (!receiptId) {
      return null;
    }

    const identity = parts[1] || '';
    if (identity.startsWith('sid-')) {
      const receiptSplitId = Number(identity.slice(4));
      if (!Number.isFinite(receiptSplitId) || receiptSplitId <= 0) {
        return null;
      }
      return { receiptId, splitIndex: null, receiptSplitId };
    }
    if (identity.startsWith('idx-')) {
      const splitIndex = Number(identity.slice(4));
      if (!Number.isFinite(splitIndex) || splitIndex < 0) {
        return null;
      }
      return { receiptId, splitIndex, receiptSplitId: null };
    }
    return null;
  }

  getSplitWorkOrder(split: { workOrder?: string; workOrderCode?: string } | null | undefined): string {
    return (split?.workOrderCode || split?.workOrder || '').trim();
  }

  resolveInitialSplitKeyForItem(receiptId: string, currentWorkOrderCode: string, usedKeys: Set<string>): string | null {
    const receipt = this.propertyReceipts.find(r => r.receiptId === receiptId);
    if (!receipt) {
      return null;
    }
    const options = this.getReceiptSplitOptions(receipt, currentWorkOrderCode);
    const preferredAssigned = options.find(option => (option.workOrder || '').trim() === (currentWorkOrderCode || '').trim() && !usedKeys.has(option.key));
    if (preferredAssigned) {
      return preferredAssigned.key;
    }
    const firstUnused = options.find(option => !usedKeys.has(option.key));
    return firstUnused?.key ?? null;
  }
  //#endregion

  //#region Receipt Methods
  getNumericCostCodeIdForInvoice(): number | null {
    const numericValue = Number(this.tenantDamagesCcId);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
      return null;
    }
    return numericValue;
  }

  canAddItem(): boolean {
    return this.form.valid;
  }

  getCurrentAssociatedReceiptIds(): string[] {
    return Array.from(new Set(
      (this.workOrderItems || [])
        .map(item => String(item.receiptId ?? '').trim())
        .filter(receiptId => receiptId.length > 0)
    ));
  }

  hasSelectedReceipt(item: WorkOrderItemEditable): boolean {
    return this.isValidReceiptId(item?.receiptId);
  }

  openReceiptFromItem(item: WorkOrderItemEditable): void {
    const receiptId = String(item?.receiptId ?? '').trim();
    if (!receiptId) {
      return;
    }

    const propertyId = (this.property?.propertyId || this.selectedPropertyId || '').trim();
    const officeId = Number(this.property?.officeId || 0);

    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit({
        receiptId,
        officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null,
        propertyId: propertyId || null
      });
      return;
    }

    if (!propertyId) {
      this.toastr.error('Unable to open receipt: property context is missing.', 'Receipt');
      return;
    }

    const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
    this.router.navigate([maintenanceUrl], {
      queryParams: {
        tab: 2,
        receiptId
      }
    });
  }

  navigateToWorkOrderView(workOrderId: string): void {
    const propertyId = this.resolvePropertyIdForSave() ?? ((this.workOrder?.propertyId || '').trim() || null);
    const reservationId = (this.workOrder?.reservationId || this.form.get('reservationId')?.value || '').toString().trim();
    if (this.embeddedInMaintenance && this.embedDocumentPreviewInShell) {
      this.previewEvent.emit({
        workOrderId,
        propertyId,
        reservationId: reservationId || null,
        officeId: this.getShellOfficeId(),
        propertyCode: (this.property?.propertyCode || this.workOrder?.propertyCode || '').trim(),
        returnToDetail: true
      });
      return;
    }
    this.router.navigateByUrl(this.buildWorkOrderPreviewUrl(workOrderId, propertyId, reservationId, 'work-order'));
  }

  buildWorkOrderPreviewUrl(
    workOrderId: string,
    propertyId?: string | null,
    reservationId?: string | null,
    returnTo?: string | null
  ): string {
    const params = new URLSearchParams();
    params.set('workOrderId', workOrderId);
    const trimmedPropertyId = (propertyId || '').trim();
    if (trimmedPropertyId) {
      params.set('propertyId', trimmedPropertyId);
    }
    const trimmedReservationId = (reservationId || '').trim();
    if (trimmedReservationId) {
      params.set('reservationId', trimmedReservationId);
    }
    if (returnTo) {
      params.set('returnTo', returnTo);
    }
    return `${RouterUrl.WorkOrderCreate}?${params.toString()}`;
  }

  setUserEdited(_source: string): void {
    const wasUserEdited = this.hasUserEditedWorkOrder;
    this.hasUserEditedWorkOrder = true;
    if (wasUserEdited || !this.workOrder?.workOrderId || this.isAddMode) {
      return;
    }
  }

  getShellOfficeId(): number | null {
    const officeId = Number((this.embeddedInMaintenance ? this.officeId : this.selectedGlobalOfficeId) ?? 0);
    return Number.isFinite(officeId) && officeId > 0 ? officeId : null;
  }
  //#endregion
  
  //#region Utility Methods
  back(): void {
    if (this.embeddedInMaintenance) {
      this.backEvent.emit();
      return;
    }
    if (this.selectedPropertyId) {
      const maintenanceUrl = RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId]);
      this.router.navigate(['/' + maintenanceUrl], { queryParams: { tab: 3 } });
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  ngOnDestroy(): void {
    this.activeWorkOrderLoadId++;
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  private isValidReceiptId(receiptId: string | null | undefined): boolean {
    return !!(receiptId && String(receiptId).trim());
  }
  //#endregion
}
