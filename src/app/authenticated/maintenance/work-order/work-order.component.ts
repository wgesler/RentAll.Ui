import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, forkJoin, finalize, map, of, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { getWorkOrderTypes } from '../models/maintenance-enums';
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';
import { WorkOrderRequest, WorkOrderResponse, WorkOrderItemResponse, WorkOrderItemRequest } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

/** Editable work order item (new rows have no workOrderItemId/workOrderId; GUIDs from response). itemAmount is auto-calculated as receiptAmount + (laborHours * laborCost). */
export type WorkOrderItemEditable = Partial<Pick<WorkOrderItemResponse, 'workOrderItemId' | 'workOrderId'>> & Pick<WorkOrderItemResponse, 'description' | 'laborHours' | 'laborCost' | 'itemAmount'> & { receiptId?: number | null; receiptAmount?: number };

@Component({
  standalone: true,
  selector: 'app-work-order',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss'
})
export class WorkOrderComponent implements OnInit, OnDestroy {
  /** Expose for template (labor hours integer parsing) */
  readonly parseInt = parseInt;

  @Input() property: PropertyResponse | null = null;
  @Input() workOrderId: string | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() showBackButton: boolean = true;
  /** When true, component is shown inside maintenance tabs; uses @Input() workOrderId and back/saved emit only (no route nav). */
  @Input() embeddedInMaintenance = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

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
  /** Editable list of work order items (loaded from workOrder or added by user) */
  workOrderItems: WorkOrderItemEditable[] = [];
  /** Receipts for the current property (for Add Receipt dropdown) */
  propertyReceipts: ReceiptResponse[] = [];
  /** Accounting office used to generate next work order code in add mode. */
  accountingOffice: AccountingOfficeResponse | null = null;
  generatedWorkOrderCode: string | null = null;
  nextWorkOrderNo: number | null = null;
  /** Reservations for the current property (Tenant work orders only). */
  propertyReservations: ReservationResponse[] = [];
  /** When user is editing a currency field, hold index + field + raw edit string (so "12." is preserved until blur). Total is read-only. */
  focusedCurrencyField: { index: number; field: 'laborCost'; editValue: string } | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['workOrder', 'property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    workOrderService: WorkOrderService,
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
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
    this.organizationId = this.property?.organizationId ?? this.authService.getUser()?.organizationId ?? '';
    this.buildForm();
    this.form.get('workOrderTypeId')?.valueChanges.subscribe(typeId => {
      if (Number(typeId) !== 0) {
        this.form.patchValue({ reservationId: null }, { emitEvent: false });
        if (this.workOrder) {
          this.workOrder.reservationId = null;
          this.workOrder.reservationCode = null;
        }
      }
    });
    if (this.embeddedInMaintenance) {
      this.isAddMode = this.workOrderId == null;
      this.selectedPropertyId = this.property?.propertyId ?? null;
      if (this.isAddMode) {
        this.form.patchValue({ workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0 });
      }
      this.loadProperty();
      this.loadWorkOrder();
      return;
    }
    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const workOrderIdParam = paramMap.get('id');
      if (workOrderIdParam !== null)
        this.workOrderId = workOrderIdParam === 'new' ? null : workOrderIdParam;

      this.isAddMode = this.workOrderId == null;
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;
      if (this.isAddMode) {
        this.form.patchValue({ workOrderTypeId: this.form.get('workOrderTypeId')?.value ?? 0 });
      }

      this.loadProperty();
      this.loadWorkOrder();
    });
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

    console.log('Work order request (before POST/PUT):', JSON.stringify(payload, null, 2));

    const save$ = this.workOrder?.workOrderId
      ? this.workOrderService.updateWorkOrder(payload)
      : this.workOrderService.createWorkOrder(payload);

    save$.pipe(take(1), finalize(() => { this.isSubmitting = false; })).subscribe({
      next: (saved: WorkOrderResponse) => {
        this.workOrder = saved;
        this.isAddMode = false;
        const wasCreate = isCreate;
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
          const receiptAmount = item.receiptId != null
            ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0)
            : 0;
          return {
            workOrderItemId: item.workOrderItemId,
            workOrderId: item.workOrderId,
            description: item.description ?? '',
            receiptId: item.receiptId ?? null,
            receiptAmount,
            laborHours: Math.floor(Number(item.laborHours)) || 0,
            laborCost: item.laborCost ?? 0,
            itemAmount: item.itemAmount ?? 0
          };
        });
        this.syncReceiptAmounts();
        this.savedEvent.emit();
        if (wasCreate) {
          this.updateAccountingOfficeWorkOrderNoAfterCreate();
        }
        this.updateReceiptsWorkOrderCode(saved.workOrderCode ?? this.generatedWorkOrderCode ?? '');
        this.loadPropertyReceipts(); /* refresh receipts so dropdown and display stay in sync */
        this.toastr.success('Work order saved.', 'Success');
        if (this.selectedPropertyId) {
          this.back();
        }
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to save work order.', 'Error');
      }
    });
  }
  //#endregion

  /** On untouched edit state show View, otherwise Save. */
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

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      workOrderCode: new FormControl(''),
      officeName: new FormControl(''),
      propertyCode: new FormControl(''),
      workOrderTypeId: new FormControl(0, [Validators.required]),
      reservationId: new FormControl<string | null>(null),
      description: new FormControl(''),
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
      workOrderItemId: item.workOrderItemId,
      workOrderId: item.workOrderId,
      description: item.description ?? '',
      receiptId: item.receiptId ?? null,
      receiptAmount: item.receiptId != null ? (this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0) : 0,
      laborHours: Math.floor(Number(item.laborHours)) || 0,
      laborCost: item.laborCost ?? 0,
      itemAmount: item.itemAmount ?? 0
    }));
    this.syncReceiptAmounts();
  }

  /** When propertyReceipts load (e.g. after work order), fill receiptAmount on items that have a receiptId. */
  syncReceiptAmounts(): void {
    this.workOrderItems.forEach(item => {
      if (item.receiptId != null) {
        const amt = this.propertyReceipts.find(r => r.receiptId === item.receiptId)?.amount ?? 0;
        (item as WorkOrderItemEditable).receiptAmount = amt;
      }
    });
  }
  //#endregion

  //#region Work Order Items
  addWorkOrderItem(): void {
    const newItem: WorkOrderItemEditable = {
      description: '',
      receiptId: null,
      receiptAmount: 0,
      laborHours: 0,
      laborCost: 0,
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

  /**
   * Receipts available for the dropdown: all property receipts are loaded for display.
   * For picking a receipt we show only those not yet assigned to a work order, or already assigned to this work order,
   * and exclude receipts already selected by another line item (except this item's current selection).
   */
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

  onReceiptSelectionChange(itemIndex: number, receiptId: number | null): void {
    this.updateWorkOrderItemField(itemIndex, 'receiptId', receiptId);
    const receipt = receiptId != null ? this.propertyReceipts.find(r => r.receiptId === receiptId) : null;
    const receiptAmount = receipt?.amount ?? 0;
    (this.workOrderItems[itemIndex] as WorkOrderItemEditable).receiptAmount = receiptAmount;
    if (receipt?.description != null && receipt.description !== '') {
      this.updateWorkOrderItemField(itemIndex, 'description', receipt.description);
    }
  }

  /** Total = receipt amount + (labor hours × labor cost). Used for display and save. */
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

  /** Sum of all work order item totals (for Total Amount display). */
  getTotalAmount(): number {
    return this.workOrderItems.reduce((sum, item) => sum + this.getItemTotal(item), 0);
  }

  getTotalAmountDisplay(): string {
    return '$' + this.formatter.currency(this.getTotalAmount());
  }

  getReceiptAmountDisplay(item: WorkOrderItemEditable): string {
    const amt = item.receiptAmount ?? 0;
    return '$' + this.formatter.currency(amt);
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

  /** Map editable items to request shape. On create omit workOrderId and workOrderItemId (GUIDs returned in response); on update include them. */
  mapWorkOrderItemsForSave(isCreate: boolean): WorkOrderItemRequest[] {
    return this.workOrderItems.map(item => {
      const base: WorkOrderItemRequest = {
        description: (item.description ?? '').trim(),
        receiptId: item.receiptId ?? undefined,
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

  private hasWorkOrderUpdates(payload: WorkOrderRequest): boolean {
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

  private getSelectedReservationCode(): string | null {
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

  isTenantTypeSelected(): boolean {
    return Number(this.form.get('workOrderTypeId')?.value ?? -1) === 0;
  }

  getReservationLabel(reservation: ReservationResponse): string {
    const reservationName = reservation.reservationCode || 'Reservation';
    const tenantName = reservation.tenantName || reservation.contactName || '';
    return `${reservationName}: ${tenantName}`.trim();
  }
  //#endregion

  //#region Data Load Methods
  loadWorkOrder(): void {
    if (this.isAddMode || this.workOrderId == null) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
      return;
    }

    this.workOrderService.getWorkOrder(this.organizationId, this.workOrderId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder'); })).subscribe({
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
    if (this.property || !this.selectedPropertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      if (this.property) {
        this.loadAccountingOfficeForWorkOrderCode();
        this.loadPropertyReservations();
        this.loadPropertyReceipts();
      }
      return;
    }
    this.propertyService.getPropertyByGuid(this.selectedPropertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (p) => {
        this.property = p;
        if (this.property?.organizationId) {
          this.organizationId = this.property.organizationId;
        }
        this.form.patchValue({
          workOrderCode: this.generatedWorkOrderCode ?? '',
          officeName: this.property?.officeName || '',
          propertyCode: this.property?.propertyCode || '',
        });
        this.loadAccountingOfficeForWorkOrderCode();
        this.loadPropertyReservations();
        this.loadPropertyReceipts();
      },
      error: () => {
        this.toastr.error('Unable to load property.', 'Error');
      }
    });
  }

  /** Load all property receipts (no filter by workOrderCode) so line items can display their receipt and dropdown can filter correctly. */
  loadPropertyReceipts(): void {
    const propertyId = this.property?.propertyId ?? null;
    if (!propertyId) {
      this.propertyReceipts = [];
      return;
    }
    this.receiptService.getReceiptsByPropertyId(propertyId).pipe(take(1)).subscribe({
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
    const propertyId = this.property?.propertyId ?? null;
    if (!propertyId) {
      this.propertyReservations = [];
      return;
    }
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1)).subscribe({
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
      return;
    }
    this.accountingOfficeService.getAccountingOfficeById(this.property.officeId).pipe(take(1)).subscribe({
      next: office => {
        this.accountingOffice = office;
        const currentNo = Number(office.workOrderNo) || 0;
        this.nextWorkOrderNo = currentNo + 1;
        const paddedCode = String(this.nextWorkOrderNo).padStart(5, '0');
        this.generatedWorkOrderCode = `WO-${paddedCode}`;
        this.form.patchValue({ workOrderCode: this.generatedWorkOrderCode }, { emitEvent: false });
      },
      error: () => {
        this.accountingOffice = null;
        this.nextWorkOrderNo = null;
        this.generatedWorkOrderCode = null;
        this.form.patchValue({ workOrderCode: '' }, { emitEvent: false });
      }
    });
  }

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

  /** After work order save, set workOrderCode on each receipt used in work order items. */
  updateReceiptsWorkOrderCode(workOrderCode: string): void {
    const receiptIds = [...new Set(this.workOrderItems.map(i => i.receiptId).filter((id): id is number => id != null))];
    if (receiptIds.length === 0) return;
    const updates = receiptIds.map(receiptId => {
      const receipt = this.propertyReceipts.find(r => r.receiptId === receiptId);
      if (!receipt) return of(null);
      const payload: ReceiptRequest = {
        receiptId: receipt.receiptId,
        organizationId: receipt.organizationId,
        officeId: receipt.officeId,
        propertyId: receipt.propertyId,
        maintenanceId: receipt.maintenanceId,
        description: receipt.description ?? '',
        amount: receipt.amount ?? 0,
        workOrderCode,
        receiptPath: receipt.receiptPath ?? undefined,
        fileDetails: receipt.fileDetails ?? undefined,
        isActive: receipt.isActive ?? true
      };
      return this.receiptService.updateReceipt(payload);
    });
    forkJoin(updates).pipe(take(1)).subscribe({
      next: () => {
        receiptIds.forEach(id => {
          const r = this.propertyReceipts.find(x => x.receiptId === id);
          if (r) r.workOrderCode = workOrderCode;
        });
      },
      error: () => {
        this.toastr.warning('Work order saved, but one or more receipts could not be updated with the work order code.', 'Partial Update');
      }
    });
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
    this.itemsToLoad$.complete();
  }
  //#endregion
}
