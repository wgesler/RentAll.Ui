import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, forkJoin, finalize, of, switchMap, take, Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { TransactionType } from '../../accounting/models/accounting-enum';
import { InvoiceRequest, LedgerLineRequest } from '../../accounting/models/invoice.model';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import { getWorkOrderTypes, WorkOrderType } from '../models/maintenance-enums';
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';
import { ReceiptSplitOption, WorkOrderItemEditable, WorkOrderItemRequest, WorkOrderItemResponse, WorkOrderItemSnapshot, WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderAmountService } from '../services/work-order-amount.service';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

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
  @Input() maintenanceId: string | null = null;
  @Input() showBackButton: boolean = true;
  @Input() embeddedInMaintenance = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  
  readonly parseInt = parseInt;
  readonly costCode = '4100';
  readonly noReceiptOptionValue = 0;
  readonly inventoryItemOptionValue = -1;

  fb: FormBuilder;
  form: FormGroup;
  isPageLoading = true;
  authService: AuthService;
  workOrderService: WorkOrderService;
  isAddMode: boolean = true;
  isSubmitting: boolean = false;

  organizationId: string = '';
  selectedPropertyId: string | null = null;
  workOrder: WorkOrderResponse | null = null;
  workOrderTypeOptions = getWorkOrderTypes();
  workOrderItems: WorkOrderItemEditable[] = [];
  propertyReceipts: ReceiptResponse[] = [];
  accountingOffice: AccountingOfficeResponse | null = null;
  generatedWorkOrderCode: string | null = null;
  nextWorkOrderNo: number | null = null;
  propertyReservations: ReservationListResponse[] = [];
  propertyAgreement: PropertyAgreementResponse | null = null;
  costCodeId: number | null = null;
  defaultLaborCost: number = 0;
  focusedCurrencyField: { index: number; field: 'laborCost' | 'amount'; editValue: string } | null = null;
  initialWorkOrderItemsSnapshot: WorkOrderItemSnapshot[] = [];
  lastMarkupFactor: number = 1;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'workOrder', 'costCode', 'propertyAgreement', 'propertyReceipts', 'propertyReservations', 'workOrderNumber']));
  destroy$ = new Subject<void>();
  
  constructor(
    fb: FormBuilder,
    authService: AuthService,
    workOrderService: WorkOrderService,
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private propertyAgreementService: PropertyAgreementService,
    private costCodeService: CostCodesService,
    private invoiceService: InvoiceService,
    private accountingOfficeService: AccountingOfficeService,
    private reservationService: ReservationService,
    private receiptService: ReceiptService,
    private workOrderAmountService: WorkOrderAmountService,
    public utilityService: UtilityService,
    private formatter: FormatterService,
    private toastr: ToastrService
  ) {
    this.fb = fb;
    this.authService = authService;
    this.workOrderService = workOrderService;
  }

  //#region Work Order
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId ?? '';
    this.buildForm();

    // Wait to load page until all data is available
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageLoading = items.size > 0;
    });

    // Only Tenant types have reservations...
    this.form.get('workOrderTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(typeId => {
      this.onWorkOrderTypeChanged(typeId);
    });
    this.form.get('applyMarkup')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.reapplyMarkupToCurrentItems(true);
    });
    this.onWorkOrderTypeChanged(this.form.get('workOrderTypeId')?.value);

    this.selectedPropertyId = this.property?.propertyId ?? null;
    this.isAddMode = this.workOrderId == null;
    if (!this.embeddedInMaintenance) {
      const workOrderIdParam = this.route.snapshot.paramMap.get('id');
      if (workOrderIdParam !== null)
        this.workOrderId = workOrderIdParam === 'new' ? null : workOrderIdParam;
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;
    }

    this.loadProperty();
    this.loadWorkOrder();
    this.loadAccountingOfficeForWorkOrderCode();
    this.loadPropertyReservations();
    this.loadPropertyReceipts();
    this.loadPropertyAgreement();
    this.loadCostCode();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property'] && !changes['property'].firstChange) {
      this.selectedPropertyId = this.property?.propertyId ?? null;

      if (this.selectedPropertyId && this.embeddedInMaintenance) {
        this.form.patchValue({
          workOrderCode: this.generatedWorkOrderCode ?? '',
          officeName: this.property.officeName || '',
          propertyCode: this.property.propertyCode || ''
        }, { emitEvent: false });
        this.loadAccountingOfficeForWorkOrderCode();
        this.loadPropertyReservations();
        this.loadPropertyReceipts();
        this.loadPropertyAgreement();
        this.loadCostCode();
      }
    }

    if (changes['workOrderId'] && !changes['workOrderId'].firstChange) {
      this.isAddMode = this.workOrderId == null;
      this.loadWorkOrder();
      if (this.isAddMode && this.property?.officeId) {
        this.loadAccountingOfficeForWorkOrderCode();
      }
    }
  }

  saveWorkOrder(): void {
    if (!this.property?.propertyId || !this.property?.organizationId) {
      this.toastr.warning('Property (with organization) is required to save.', 'Cannot Save');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Please complete the required fields (e.g. Work Order Type).', 'Form Incomplete');
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

    const payload: WorkOrderRequest = {
      organizationId: this.property.organizationId,
      officeId: this.property.officeId,
      propertyId: this.property.propertyId,
      workOrderCode: isCreate ? (this.generatedWorkOrderCode ?? undefined) : (this.workOrder?.workOrderCode ?? undefined),
      workOrderDate: this.getWorkOrderDateForApi(),
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
      applyMarkup: this.isOwnerTypeSelected() ? (this.form.get('applyMarkup')?.value === true) : false,
      reservationId: this.isTenantTypeSelected() ? (this.form.get('reservationId')?.value ?? null) : null,
      reservationCode: this.isTenantTypeSelected() ? this.getSelectedReservationCode() : null,
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
      .filter(item => item.itemSource === 'receipt' && item.receiptId != null && Number(item.receiptId) > 0)
      .forEach(item => {
        const splitKey = item.receiptSplitKey || this.resolveInitialSplitKeyForItem(item.receiptId as number, currentWorkOrderCodeForSelection, usedSplitKeys);
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
          description: saved.description ?? '',
          isActive: saved.isActive
        }, { emitEvent: false });
        setTimeout(() => this.onWorkOrderTypeChanged(saved.workOrderTypeId), 0);
        this.workOrderItems = (saved.workOrderItems ?? []).map(item => {
          const itemSource = this.resolveItemSourceFromReceiptId(item.receiptId);
          const laborHours = Math.floor(Number(item.laborHours)) || 0;
          const laborCost = Number(item.laborCost) || 0;
          const derivedInventoryAmount = Math.round(((Number(item.itemAmount) || 0) - (laborHours * laborCost)) * 100) / 100;
          const receiptAmount = itemSource === 'receipt'
            ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0)
            : (itemSource === 'inventory' ? derivedInventoryAmount : 0);
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
        this.syncReceiptAmounts();
        this.captureInitialWorkOrderItemsSnapshot();
        this.savedEvent.emit();
        if (wasCreate) {
          this.updateAccountingOfficeWorkOrderNoAfterCreate();
        }
        const hasReceiptItems = this.workOrderItems.some(item => item.itemSource === 'receipt');
        if (hasReceiptItems) {
          const effectiveWorkOrderCode = saved.workOrderCode ?? this.form.get('workOrderCode')?.value ?? this.generatedWorkOrderCode ?? '';
          this.updateReceiptsWorkOrderCode(effectiveWorkOrderCode, selectedSplitKeysForSave, previousAssignedSplitKeys);
        }
        this.toastr.success('Work order saved.', 'Success');

        // Save this work order as an invoice that can be paid
        this.saveWorkOrderAsInvoice(saved, totalAmount);

        if (saved.workOrderId) {
          const propertyId = this.property?.propertyId ?? this.selectedPropertyId ?? '';
          this.router.navigateByUrl(
            `${RouterUrl.WorkOrderCreate}?workOrderId=${encodeURIComponent(saved.workOrderId)}&propertyId=${encodeURIComponent(propertyId)}&returnTo=work-order`
          );
          return;
        }

        this.toastr.warning('Work order saved, but unable to open the preview page.', 'Navigation Warning');
      },
      error: (err: HttpErrorResponse) => {
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
    if (workOrderTypeId !== WorkOrderType.Tenant) {
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
        amount: roundedTotalAmount
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
      invoicePeriod: `${this.formatter.dateOnly(now)} - ${this.formatter.dateOnly(now)}`,
      totalAmount: roundedTotalAmount,
      paidAmount: 0,
      notes: `Generated from Work Order ${workOrderRef}`,
      isActive: true,
      ledgerLines
    };

    this.isSubmitting = true;
    this.invoiceService.getInvoiceByCode(invoiceRequest.invoiceCode || '').pipe(take(1),
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
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
    this.lastMarkupFactor = this.getMarkupFactor();
  }

  populateForm(workOrder: WorkOrderResponse): void {
    this.form.patchValue({
      workOrderCode: workOrder.workOrderCode ?? '',
      workOrderDate: this.getWorkOrderDateControlValue(workOrder.workOrderDate),
      officeName: this.property?.officeName ?? '',
      propertyCode: this.property?.propertyCode ?? '',
      workOrderTypeId: workOrder.workOrderTypeId ?? 0,
      applyMarkup: workOrder.applyMarkup === true,
      reservationId: workOrder.reservationId ?? null,
      description: workOrder.description ?? '',
      isActive: workOrder.isActive
    }, { emitEvent: false });
    setTimeout(() => this.onWorkOrderTypeChanged(workOrder.workOrderTypeId ?? 0), 0);

    this.workOrderItems = (workOrder.workOrderItems ?? []).map(item => ({
      ...(() => {
        const itemSource = this.resolveItemSourceFromReceiptId(item.receiptId);
        const laborHours = Math.floor(Number(item.laborHours)) || 0;
        const laborCost = Number(item.laborCost) || 0;
        const derivedInventoryAmount = Math.round(((Number(item.itemAmount) || 0) - (laborHours * laborCost)) * 100) / 100;
        const receiptAmount = itemSource === 'receipt'
          ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0)
          : (itemSource === 'inventory' ? derivedInventoryAmount : 0);
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
    this.syncReceiptAmounts();
    this.lastMarkupFactor = this.getMarkupFactor();
    this.captureInitialWorkOrderItemsSnapshot();
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

  onWorkOrderTypeChanged(typeId: number | null | undefined): void {
    this.updateReservationRequirementByType(typeId);
    const isOwner = Number(typeId) === WorkOrderType.Owner;
    const applyMarkupControl = this.form.get('applyMarkup');
    if (this.isAddMode) {
      applyMarkupControl?.setValue(isOwner, { emitEvent: false });
    } else if (!isOwner) {
      applyMarkupControl?.setValue(false, { emitEvent: false });
    }
    this.reapplyMarkupToCurrentItems(true);
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
    if (!forceReevaluate && Math.abs(previousFactor - nextFactor) < 0.000001) {
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
        item.receiptAmount = Math.round((baseAmount * nextFactor) * 100) / 100;
      } else if (item.itemSource === 'inventory') {
        const currentAmount = previousReceiptAmounts?.[index] ?? (Number(item.receiptAmount) || 0);
        const baseAmount = previousFactor !== 0 ? (currentAmount / previousFactor) : currentAmount;
        item.receiptAmount = Math.round((baseAmount * nextFactor) * 100) / 100;
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

  onPrimaryAction(): void {
    if (this.isViewModeBeforeChanges()) {
      this.openWorkOrderView();
      return;
    }
    this.saveWorkOrder();
  }

  openWorkOrderView(): void {
    const id = this.workOrder?.workOrderId ?? this.workOrderId;
    if (!id) {
      this.toastr.warning('Save the work order before viewing.', 'No Work Order');
      return;
    }
    this.router.navigateByUrl(
      `${RouterUrl.WorkOrderCreate}?workOrderId=${encodeURIComponent(id)}&propertyId=${encodeURIComponent(this.property?.propertyId ?? this.selectedPropertyId ?? '')}&returnTo=work-order`
    );
  }
  //#endregion

  //#region Work Order Items
  addWorkOrderItem(): void {
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
    if (index >= 0 && index < this.workOrderItems.length) {
      this.workOrderItems.splice(index, 1);
    }
  }

  updateWorkOrderItemField(index: number, field: keyof WorkOrderItemEditable, value: number | string | null): void {
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
    const item = this.workOrderItems[itemIndex] as WorkOrderItemEditable;
    if (!item) {
      return;
    }

    if (receiptSelectionValue === this.inventoryItemOptionValue) {
      item.itemSource = 'inventory';
      item.receiptId = 0;
      item.receiptSplitKey = null;
      item.receiptAmount = 0;
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
  }

  getReceiptSelectionValue(item: WorkOrderItemEditable): number | string {
    if (item.itemSource === 'inventory') {
      return this.inventoryItemOptionValue;
    }
    if (item.itemSource === 'receipt' && item.receiptSplitKey) {
      return item.receiptSplitKey;
    }
    return this.noReceiptOptionValue;
  }

  resolveItemSourceFromReceiptId(receiptId: number | null | undefined): 'noReceipt' | 'receipt' | 'inventory' {
    if (receiptId === 0) {
      return 'inventory';
    }
    if (receiptId != null) {
      return 'receipt';
    }
    return 'noReceipt';
  }

  onAmountInput(itemIndex: number, event: Event): void {
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
    const normalized = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
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
    const input = event.target as HTMLInputElement;
    const parsed = parseFloat(input.value) || 0;
    this.updateWorkOrderItemField(index, 'laborCost', parsed);
    this.focusedCurrencyField = null;
  }

  onLaborCostInput(index: number, event: Event): void {
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
      propertyId: this.property?.propertyId ?? this.workOrder.propertyId,
      workOrderDate: this.getWorkOrderDateForApi(),
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
      applyMarkup: this.isOwnerTypeSelected() ? (this.form.get('applyMarkup')?.value === true) : false,
      reservationId: this.isTenantTypeSelected() ? (this.form.get('reservationId')?.value ?? null) : null,
      reservationCode: this.isTenantTypeSelected() ? this.getSelectedReservationCode() : null,
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
        receiptId: item.itemSource === 'inventory' ? 0 : (item.receiptId ?? undefined),
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
    const payloadDescription = this.normalizeComparableString(payload.description) ?? '';
    const workOrderDescription = this.normalizeComparableString(this.workOrder.description) ?? '';
    const payloadWorkOrderDate = this.normalizeComparableString(payload.workOrderDate) ?? '';
    const workOrderWorkOrderDate = this.normalizeComparableString(this.normalizeWorkOrderDate(this.workOrder.workOrderDate)) ?? '';

    return (
      payloadWorkOrderDate !== workOrderWorkOrderDate ||
      payload.workOrderTypeId !== this.workOrder.workOrderTypeId ||
      payload.applyMarkup !== (this.workOrder.applyMarkup === true) ||
      payloadReservationId !== workOrderReservationId ||
      payloadReservationCode !== workOrderReservationCode ||
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
    if (this.isAddMode || !this.workOrder?.workOrderId || this.isSubmitting) {
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
  loadCostCode(): void {
    const officeId = this.property?.officeId ?? null;
    if (!officeId) {
      this.costCodeId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
      return;
    }
    this.costCodeService.getCostCodeByCode(this.costCode, officeId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode'); })).subscribe({
      next: (costCode) => {
        const numericCostCodeId = Number(costCode?.costCodeId);
        this.costCodeId = Number.isInteger(numericCostCodeId) && numericCostCodeId > 0 ? numericCostCodeId : null;
      },
      error: () => {
        this.costCodeId = null;
      }
    });
  }

  loadWorkOrder(): void {
    if (this.isAddMode || this.workOrderId == null) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
      return;
    }

    this.workOrderService.getWorkOrderById(this.workOrderId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder'); })).subscribe({
      next: (workOrder: WorkOrderResponse) => {
        this.workOrder = workOrder;
        this.populateForm(workOrder);
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load work order.', 'Error');
      }
    });
  }

  loadProperty(): void {
    if (this.property) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.selectedPropertyId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (property) => {
        this.property = property;
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
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      return;
    }

    this.propertyAgreementService.getPropertyAgreement(this.selectedPropertyId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement'); })).subscribe({
      next: agreement => {
        this.propertyAgreement = agreement;
        this.defaultLaborCost = Number(agreement?.hourlyLaborCost) || 0;
        this.applyDefaultLaborCostToUnsavedItems();
        this.reapplyMarkupToCurrentItems(true);
      },
      error: () => {
        this.propertyAgreement = null;
        this.defaultLaborCost = 0;
        this.reapplyMarkupToCurrentItems(true);
      }
    });
  }

  loadPropertyReceipts(): void {
    if (!this.selectedPropertyId) {
      this.propertyReceipts = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
      return;
    }
    this.receiptService.getReceiptsByPropertyId(this.selectedPropertyId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts'); })).subscribe({
      next: (receipts) => {
        this.propertyReceipts = (receipts ?? []).filter(r => r.isActive !== false);
        this.syncReceiptAmounts();
        this.refreshBaselineAfterDataLoad();
      },
      error: () => {
        this.propertyReceipts = [];
        this.syncReceiptAmounts();
        this.refreshBaselineAfterDataLoad();
      }
    });
  }

  loadPropertyReservations(): void {
    if (!this.selectedPropertyId) {
      this.propertyReservations = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReservations');
      return;
    }
    this.reservationService.getReservationsByPropertyId(this.selectedPropertyId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReservations'); })).subscribe({
      next: reservations => {
        this.propertyReservations = (reservations ?? []).filter(r => r.isActive !== false);
      },
      error: () => {
        this.propertyReservations = [];
      }
    });
  }

  loadAccountingOfficeForWorkOrderCode(): void {
    if (!this.isAddMode || !this.property?.officeId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber');
      return;
    }

    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber'); })).subscribe(list => {
      const office = (list || []).find(o => Number(o.officeId) === this.property?.officeId) ?? null;
      this.applyAccountingOfficeSequenceFromOffice(office);
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
    const updateRequest: AccountingOfficeRequest = {
      organizationId: this.accountingOffice.organizationId,
      officeId: this.accountingOffice.officeId,
      name: this.accountingOffice.name,
      address1: this.accountingOffice.address1,
      address2: this.accountingOffice.address2,
      suite: this.accountingOffice.suite,
      city: this.accountingOffice.city,
      state: this.accountingOffice.state,
      zip: this.accountingOffice.zip,
      phone: this.accountingOffice.phone,
      fax: this.accountingOffice.fax,
      email: this.accountingOffice.email,
      website: this.accountingOffice.website,
      bankName: this.accountingOffice.bankName,
      bankRouting: this.accountingOffice.bankRouting,
      bankAccount: this.accountingOffice.bankAccount,
      bankSwiftCode: this.accountingOffice.bankSwiftCode,
      bankAddress: this.accountingOffice.bankAddress,
      bankPhone: this.accountingOffice.bankPhone,
      workOrderNo: this.nextWorkOrderNo,
      logoPath: this.accountingOffice.logoPath,
      fileDetails: this.accountingOffice.fileDetails,
      isActive: this.accountingOffice.isActive
    };
    this.accountingOfficeService.updateAccountingOffice(updateRequest).pipe(take(1)).subscribe({
      next: updated => {
        this.accountingOffice = updated;
      },
      error: () => {
        this.toastr.warning('Work order saved, but failed to update Accounting Office work order number.', 'Partial Update');
      }
    });
  }

  updateReceiptsWorkOrderCode(workOrderCode: string, selectedSplitKeys: string[] = [], previousSplitKeys: string[] = []): void {
    const activeWorkOrderCode = (workOrderCode || '').trim();
    if (!activeWorkOrderCode) {
      return;
    }

    const currentSplitKeys = new Set(selectedSplitKeys || []);
    const previousSplitKeySet = new Set(previousSplitKeys);

    const affectedReceiptIds = new Set<number>();
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
            amount: Number(receipt.amount) || 0,
            description: receipt.description || '',
            workOrder: ''
          }];

      const nextSplits = normalizedSplits.map((split, index) => {
        const splitKey = this.buildSplitKey(receipt.receiptId, index);
        const currentlySelected = currentSplitKeys.has(splitKey);
        const previouslySelected = previousSplitKeySet.has(splitKey);
        const existingCode = this.getSplitWorkOrder(split);
        if (currentlySelected) {
          return { ...split, workOrder: activeWorkOrderCode };
        }
        if (previouslySelected && existingCode === activeWorkOrderCode) {
          return { ...split, workOrder: '' };
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
        maintenanceId: receipt.maintenanceId,
        description: receipt.description ?? '',
        amount: receipt.amount ?? 0,
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
        .map(({ index }) => this.buildSplitKey(receipt.receiptId, index))
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
          key: this.buildSplitKey(receipt.receiptId, index),
          receiptId: receipt.receiptId,
          splitIndex: index,
          amount,
          description,
          workOrder: this.getSplitWorkOrder(split),
          label: `R${receipt.receiptId}: ${displayDescription} - $${this.formatter.currency(amount)}`
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

  buildSplitKey(receiptId: number, splitIndex: number): string {
    return `${receiptId}::${splitIndex}`;
  }

  parseSplitKey(splitKey: string): { receiptId: number; splitIndex: number } | null {
    const parts = (splitKey || '').split('::');
    if (parts.length !== 2) {
      return null;
    }
    const receiptId = Number(parts[0]);
    const splitIndex = Number(parts[1]);
    if (!Number.isFinite(receiptId) || !Number.isFinite(splitIndex)) {
      return null;
    }
    return { receiptId, splitIndex };
  }

  getSplitWorkOrder(split: { workOrder?: string } | null | undefined): string {
    return (split?.workOrder || '').trim();
  }

  resolveInitialSplitKeyForItem(receiptId: number, currentWorkOrderCode: string, usedKeys: Set<string>): string | null {
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

  //#region Utility Methods
  getNumericCostCodeIdForInvoice(): number | null {
    const numericValue = Number(this.costCodeId);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
      return null;
    }
    return numericValue;
  }

  canAddItem(): boolean {
    return this.form.valid;
  }

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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
