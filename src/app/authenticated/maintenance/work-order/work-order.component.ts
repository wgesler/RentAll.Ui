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
import { WorkOrderRequest, WorkOrderResponse, WorkOrderItemResponse, WorkOrderItemRequest } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

/** Editable work order item (new rows have no workOrderItemId/workOrderId; GUIDs from response). itemAmount is auto-calculated as receiptAmount + (laborHours * laborCost). */
export type WorkOrderItemEditable = Partial<Pick<WorkOrderItemResponse, 'workOrderItemId' | 'workOrderId'>> & Pick<WorkOrderItemResponse, 'description' | 'laborHours' | 'laborCost' | 'itemAmount'> & {
  receiptId?: number | null;
  receiptAmount?: number;
  itemSource?: 'noReceipt' | 'receipt' | 'inventory';
};

@Component({
  standalone: true,
  selector: 'app-work-order',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss'
})
export class WorkOrderComponent implements OnInit, OnChanges, OnDestroy {

  readonly parseInt = parseInt;
  readonly costCode = '4100';
  readonly noReceiptOptionValue = 0;
  readonly inventoryItemOptionValue = -1;

  @Input() property: PropertyResponse | null = null;
  @Input() workOrderId: string | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() showBackButton: boolean = true;
  @Input() embeddedInMaintenance = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

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
  costCodeId: string | null = null;
  defaultLaborCost: number = 0;
  focusedCurrencyField: { index: number; field: 'laborCost' | 'amount'; editValue: string } | null = null;

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
    private utilityService: UtilityService,
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
      this.updateReservationRequirementByType(typeId);
    });
    this.updateReservationRequirementByType(this.form.get('workOrderTypeId')?.value);

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
    if (isCreate && (!this.accountingOffice || this.nextWorkOrderNo == null || !this.generatedWorkOrderCode)) {
      this.toastr.warning('Accounting Office sequence is still loading. Please try Save again.', 'Please Wait');
      this.loadAccountingOfficeForWorkOrderCode();
      return;
    }
    const workOrderItemsForSave = this.mapWorkOrderItemsForSave(isCreate);
    const invalidItem = workOrderItemsForSave.find(item => item.itemAmount <= 0);
    if (invalidItem) {
      this.form.markAllAsTouched();
      this.toastr.warning('Each work order item must have a Total greater than 0. Total = receipt amount + (labor hours × labor cost).', 'Item Total Required');
      return;
    }

    const payload: WorkOrderRequest = {
      organizationId: this.property.organizationId,
      officeId: this.property.officeId,
      propertyId: this.property.propertyId,
      workOrderCode: isCreate ? (this.generatedWorkOrderCode ?? undefined) : (this.workOrder?.workOrderCode ?? undefined),
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
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

    const previousReceiptIds = this.workOrder?.workOrderItems
      ?.map(item => item.receiptId)
      .filter((id): id is number => Number(id) > 0) ?? [];

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
          officeName: saved.officeName || this.property?.officeName || '',
          propertyCode: saved.propertyCode || this.property?.propertyCode || '',
          workOrderTypeId: saved.workOrderTypeId,
          reservationId: saved.reservationId ?? null,
          description: saved.description ?? '',
          isActive: saved.isActive
        });
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
            receiptAmount,
            itemSource,
            laborHours,
            laborCost,
            itemAmount: item.itemAmount ?? 0
          };
        });
        this.syncReceiptAmounts();
        this.savedEvent.emit();
        if (wasCreate) {
          this.updateAccountingOfficeWorkOrderNoAfterCreate();
        }
        this.updateReceiptsWorkOrderCode(saved.workOrderCode ?? this.generatedWorkOrderCode ?? '', previousReceiptIds);
        this.loadPropertyReceipts(); /* refresh receipts so dropdown and display stay in sync */
        this.toastr.success('Work order saved.', 'Success');

        // Save this work order as an invoice that can be paid
        this.saveWorkOrderAsInvoice(saved, totalAmount);

        if (this.selectedPropertyId) {
          this.back();
        }
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to save work order.', 'Error');
      }
    });
  }

  saveWorkOrderAsInvoice(workOrder: WorkOrderResponse, totalAmount: number): void {
    const workOrderTypeId = Number(this.form.get('workOrderTypeId')?.value ?? -1);
    if (workOrderTypeId !== WorkOrderType.Tenant) {
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
        costCodeId: this.costCodeId,
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
        this.toastr.success(`Invoice ${invoice.invoiceCode || ''} saved from work order.`, 'Success');
      },
      error: () => {
        this.toastr.error('Unable to save invoice from work order.', 'Error');
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      workOrderCode: new FormControl(''),
      officeName: new FormControl(''),
      propertyCode: new FormControl(''),
      workOrderTypeId: new FormControl<number | null>(null, [Validators.required]),
      reservationId: new FormControl<string | null>(null),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(workOrder: WorkOrderResponse): void {
    this.form.patchValue({
      workOrderCode: workOrder.workOrderCode ?? '',
      officeName: this.property?.officeName ?? '',
      propertyCode: this.property?.propertyCode ?? '',
      workOrderTypeId: workOrder.workOrderTypeId ?? 0,
      reservationId: workOrder.reservationId ?? null,
      description: workOrder.description ?? '',
      isActive: workOrder.isActive
    });

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
          receiptAmount,
          itemSource,
          laborHours,
          laborCost,
          itemAmount: item.itemAmount ?? 0
        };
      })()
    }));
    this.syncReceiptAmounts();
  }

  isInventoryItemSelected(item: WorkOrderItemEditable): boolean {
    return item.itemSource === 'inventory';
  }
  
  isTenantTypeSelected(): boolean {
    return Number(this.form.get('workOrderTypeId')?.value ?? -1) === 0;
  }

  syncReceiptAmounts(): void {
    this.workOrderItems.forEach(item => {
      if (item.itemSource === 'receipt' && item.receiptId != null) {
        const amt = this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0;
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

  getAvailableReceiptsForItem(itemIndex: number): ReceiptResponse[] {
    const currentWorkOrderCode = this.workOrder?.workOrderCode ?? this.generatedWorkOrderCode ?? '';
    const eligible = this.propertyReceipts.filter(r => {
      const unassigned = !r.workOrderCode || (typeof r.workOrderCode === 'string' && r.workOrderCode.trim() === '');
      const onThisWorkOrder = !!currentWorkOrderCode && r.workOrderCode === currentWorkOrderCode;
      return unassigned || onThisWorkOrder;
    });
    const usedByOthers = new Set<number>();
    this.workOrderItems.forEach((it, i) => {
      if (i !== itemIndex && it.receiptId != null) {
        usedByOthers.add(it.receiptId);
      }
    });
    const currentReceiptId = this.workOrderItems[itemIndex]?.receiptId ?? null;
    return eligible.filter(
      r => !usedByOthers.has(r.receiptId) || r.receiptId === currentReceiptId
    );
  }

  onReceiptSelectionChange(itemIndex: number, receiptSelectionValue: number | null): void {
    const item = this.workOrderItems[itemIndex] as WorkOrderItemEditable;
    if (!item) {
      return;
    }

    if (receiptSelectionValue === this.inventoryItemOptionValue) {
      item.itemSource = 'inventory';
      item.receiptId = 0;
      item.receiptAmount = 0;
      return;
    }

    const receiptId = receiptSelectionValue === this.noReceiptOptionValue ? null : receiptSelectionValue;
    item.itemSource = receiptId == null ? 'noReceipt' : 'receipt';
    item.receiptId = receiptId;
    const receipt = receiptId != null ? this.propertyReceipts.find(r => r.receiptId === receiptId) : null;
    const receiptAmount = this.applyPropertyAgreementMarkup(receipt?.amount ?? 0);
    item.receiptAmount = receiptAmount;
    if (receipt?.description != null && receipt.description !== '') {
      this.updateWorkOrderItemField(itemIndex, 'description', receipt.description);
    }
  }

  getReceiptSelectionValue(item: WorkOrderItemEditable): number {
    if (item.itemSource === 'inventory') {
      return this.inventoryItemOptionValue;
    }
    if (item.receiptId != null) {
      return item.receiptId;
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
    return '$' + this.formatter.currency(Number(item.receiptAmount) || 0);
  }

  onAmountFocus(index: number, event: Event): void {
    const item = this.workOrderItems[index] as WorkOrderItemEditable;
    if (!item || item.itemSource !== 'inventory') {
      return;
    }
    const raw = item.receiptAmount != null ? String(item.receiptAmount) : '';
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
    const amount = Number(baseAmount) || 0;
    const workOrderTypeId = Number(this.form.get('workOrderTypeId')?.value ?? -1);
    if (workOrderTypeId !== WorkOrderType.Owner) {
      return Math.round(amount * 100) / 100;
    }

    const markupPct = Number(this.propertyAgreement?.markup ?? 0);
    if (!Number.isFinite(markupPct) || markupPct === 0) {
      return Math.round(amount * 100) / 100;
    }
    return Math.round(amount * (1 + markupPct / 100) * 100) / 100;
  }

  getItemTotal(item: WorkOrderItemEditable | WorkOrderItemResponse): number {
    const editable = item as WorkOrderItemEditable;
    const receiptAmt = editable.receiptAmount != null
      ? Number(editable.receiptAmount)
      : (item.receiptId != null ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0) : 0);
    const hours = Math.floor(Number(item.laborHours)) || 0;
    const cost = Number(item.laborCost) || 0;
    return Math.round((receiptAmt + hours * cost) * 100) / 100;
  }

  getTotalDisplay(item: WorkOrderItemEditable): string {
    return '$' + this.formatter.currency(this.getItemTotal(item));
  }

  getTotalAmount(): number {
    return this.workOrderItems.reduce((sum, item) => sum + this.getItemTotal(item), 0);
  }

  getTotalAmountDisplay(): string {
    return '$' + this.formatter.currency(this.getTotalAmount());
  }

  getLaborCostDisplay(index: number, item: WorkOrderItemEditable): string {
    if (this.focusedCurrencyField?.index === index && this.focusedCurrencyField?.field === 'laborCost') {
      return this.focusedCurrencyField.editValue;
    }
    return '$' + this.formatter.currency(Number(item.laborCost) || 0);
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

  getReservationLabel(reservation: ReservationListResponse): string {
    const reservationName = reservation.reservationCode || 'Reservation';
    const tenantName = reservation.tenantName || reservation.contactName || '';
    return `${reservationName}: ${tenantName}`.trim();
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
      workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0,
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
    const existing = this.workOrder?.workOrderItems ?? [];
    if (this.workOrderItems.length !== existing.length) return true;
    for (let i = 0; i < this.workOrderItems.length; i++) {
      const a = this.workOrderItems[i];
      const b = existing[i];
      if (!b) return true;
      const serverTotal = Math.round((Number(b.itemAmount) ?? 0) * 100) / 100;
      const currentTotal = this.getItemTotal(a);
      if ((a.description ?? '') !== (b.description ?? '') ||
          (a.receiptId ?? null) !== (b.receiptId ?? null) ||
          (Math.floor(Number(a.laborHours)) || 0) !== (Math.floor(Number(b.laborHours)) || 0) ||
          (a.laborCost ?? 0) !== (b.laborCost ?? 0) ||
          currentTotal !== serverTotal) return true;
    }
    return false;
  }

  hasWorkOrderUpdates(payload: WorkOrderRequest): boolean {
    if (!this.workOrder) {
      return true;
    }
    return (
      payload.workOrderTypeId !== this.workOrder.workOrderTypeId ||
      (payload.reservationId ?? null) !== (this.workOrder.reservationId ?? null) ||
      (payload.reservationCode ?? null) !== (this.workOrder.reservationCode ?? null) ||
      (payload.description ?? '') !== (this.workOrder.description ?? '') ||
      payload.isActive !== this.workOrder.isActive ||
      this.hasWorkOrderItemsChanged()
    );
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
        this.costCodeId = costCode?.costCodeId ?? null;
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

    this.workOrderService.getWorkOrder(this.organizationId, this.workOrderId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder'); })).subscribe({
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
      },
      error: () => {
        this.propertyAgreement = null;
        this.defaultLaborCost = 0;
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
      },
      error: () => {
        this.propertyReceipts = [];
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

    this.accountingOfficeService.ensureAccountingOfficesLoaded(this.organizationId).pipe(takeUntil(this.destroy$), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber'); })).subscribe(list => {
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

  updateReceiptsWorkOrderCode(workOrderCode: string, previousReceiptIds: number[] = []): void {
    const currentReceiptIds = [...new Set(this.workOrderItems.map(i => i.receiptId).filter((id): id is number => Number(id) > 0))];
    const currentReceiptIdSet = new Set(currentReceiptIds);
    const removedReceiptIds = [...new Set(previousReceiptIds.filter(id => !currentReceiptIdSet.has(id)))];
    const updates = [
      ...currentReceiptIds.map(receiptId => ({ receiptId, nextWorkOrderCode: workOrderCode })),
      ...removedReceiptIds.map(receiptId => ({ receiptId, nextWorkOrderCode: '' }))
    ].map(update => {
      const receipt = this.propertyReceipts.find(r => r.receiptId === update.receiptId);
      if (!receipt) return of(null);
      const payload: ReceiptRequest = {
        receiptId: receipt.receiptId,
        organizationId: receipt.organizationId,
        officeId: receipt.officeId,
        propertyId: receipt.propertyId,
        maintenanceId: receipt.maintenanceId,
        description: receipt.description ?? '',
        amount: receipt.amount ?? 0,
        workOrderCode: update.nextWorkOrderCode,
        receiptPath: receipt.receiptPath ?? undefined,
        fileDetails: receipt.fileDetails ?? undefined,
        isActive: receipt.isActive ?? true
      };
      return this.receiptService.updateReceipt(payload);
    });
    if (updates.length === 0) return;
    forkJoin(updates).pipe(take(1)).subscribe({
      next: () => {
        currentReceiptIds.forEach(id => {
          const r = this.propertyReceipts.find(x => x.receiptId === id);
          if (r) r.workOrderCode = workOrderCode;
        });
        removedReceiptIds.forEach(id => {
          const r = this.propertyReceipts.find(x => x.receiptId === id);
          if (r) r.workOrderCode = '';
        });
      },
      error: () => {
        this.toastr.warning('Work order saved, but one or more receipts could not be synchronized.', 'Partial Update');
      }
    });
  }
  //#endregion

  //#region Utility Methods
  canAddItem(): boolean {
    return this.form.valid;
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
