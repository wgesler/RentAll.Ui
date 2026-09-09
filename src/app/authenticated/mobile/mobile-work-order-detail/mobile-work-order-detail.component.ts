import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { WorkOrderComponent } from '../../maintenance/work-order/work-order.component';
import { WorkOrderResponse } from '../../maintenance/models/work-order.model';
import { isReceiptCompanyPropertyId, RECEIPT_COMPANY_PROPERTY_ID } from '../../maintenance/models/receipt.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { getMobileTicketReturnRoute, MobileTicketReturnState } from '../mobile-ticket-return.util';

@Component({
  standalone: true,
  selector: 'app-mobile-work-order-detail',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './mobile-work-order-detail.component.html',
  styleUrl: './mobile-work-order-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileWorkOrderDetailComponent extends WorkOrderComponent implements OnInit, OnChanges {
  @Input() override workOrderId: string | null = null;
  @Output() workOrderTitleChange = new EventEmitter<string>();

  readonly companyPropertyId = RECEIPT_COMPANY_PROPERTY_ID;
  readonly compareMobileOfficeIds = (left: number | null, right: number | null): boolean =>
    left == null ? right == null : Number(left) === Number(right);

  private mobileRouter = inject(Router);
  private mobileRoute = inject(ActivatedRoute);
  private mobilePrefillPropertyId: string | null = null;
  private mobileReturnReceiptId: string | null = null;
  private mobileReturnTicketId: string | null = null;
  private mobileReturnTicketTab: string | null = null;
  private readonly mobileOfficeService = inject(OfficeService);
  private readonly mobilePropertyService = inject(PropertyService);
  private readonly mobileGlobalSelectionService = inject(GlobalSelectionService);

  mobilePropertyOptions: PropertyCodeResponse[] = [];
  mobileAllPropertyOptions: PropertyCodeResponse[] = [];
  mobileSelectedOfficeId: number | null = null;
  mobileSaveValidationAttempted = false;
  private mobileOfficeUserSelected = false;
  private initialMobileOfficeScopeApplied = false;

  //#region Mobile-Work-Order-Detail
  override ngOnInit(): void {
    this.embeddedInMaintenance = true;
    this.showInlineSaveButtons = true;
    this.showBackButton = false;
    this.navigateToPreviewOnSave = false;
    this.shellContext = this.authService.isAdmin() ? 'accounting' : 'maintenance';

    const queryParams = this.mobileRoute.snapshot.queryParamMap;
    const queryReceiptId = queryParams.get('receiptId')?.trim() || null;
    const queryReceiptSplitKey = queryParams.get('receiptSplitKey')?.trim() || null;
    this.mobilePrefillPropertyId = queryParams.get('propertyId')?.trim() || null;
    this.mobileReturnReceiptId = queryParams.get('returnReceiptId')?.trim() || null;
    this.mobileReturnTicketId = queryParams.get('returnTicketId')?.trim() || null;
    this.mobileReturnTicketTab = queryParams.get('returnTicketTab')?.trim() || null;

    if (this.workOrderId === 'new') {
      if (queryReceiptId) {
        this.initialReceiptId = queryReceiptId;
      }
      if (queryReceiptSplitKey) {
        this.initialReceiptSplitKey = queryReceiptSplitKey;
      }
      if (this.mobilePrefillPropertyId) {
        this.propertyId = this.mobilePrefillPropertyId;
      }

      const returnState = (this.mobileRouter.getCurrentNavigation()?.extras.state ?? history.state ?? {}) as MobileTicketReturnState;
      if (returnState.initialTitle) {
        this.initialTitle = returnState.initialTitle;
      }
      if (returnState.initialDescription) {
        this.initialDescription = returnState.initialDescription;
      }
      if (returnState.initialReservationId) {
        this.initialReservationId = returnState.initialReservationId;
      }
      const queryMaintenanceId = queryParams.get('maintenanceId')?.trim() || null;
      if (queryMaintenanceId) {
        this.maintenanceId = queryMaintenanceId;
      }
    }

    super.ngOnInit();

    this.mobileSelectedOfficeId = this.mobileGlobalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.mobileSelectedOfficeId,
      offices: this.getMobileOfficeOptions(),
      globalOfficeId: this.mobileGlobalSelectionService.getSelectedOfficeIdValue()
    });
    this.officeId = this.mobileSelectedOfficeId;

    this.loadMobileTitleBarProperties(this.mobilePrefillPropertyId);

    this.mobileGlobalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(globalOfficeId => {
      if (!this.mobileOfficeUserSelected && this.isAddMode) {
        this.applyOfficeFromGlobal(globalOfficeId);
      }
      this.markViewForCheck();
    });

    this.form.get('title')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.workOrderTitleChange.emit((value || '').trim());
    });

    this.savedEvent.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.back();
    });

    if (this.isAddMode) {
      this.workOrderTitleChange.emit('New');
    } else if (this.workOrder?.title) {
      this.workOrderTitleChange.emit((this.workOrder.title || '').trim());
    }
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['workOrderId'] && this.workOrderId === 'new') {
      this.workOrderTitleChange.emit('New');
    }
  }

  override loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      return;
    }

    this.mobileOfficeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.mobileOfficeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
          this.offices = (allOffices || []).filter(
            office => office.organizationId === this.organizationId && office.isActive !== false
          );
          this.applyInitialMobileOfficeScope();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  override applyLoadedWorkOrder(workOrder: WorkOrderResponse): void {
    super.applyLoadedWorkOrder(workOrder);
    this.syncMobileOfficeFromWorkOrder(workOrder);
    this.updateMobileAvailableProperties();
    this.workOrderTitleChange.emit((workOrder.title || '').trim());
  }

  override saveWorkOrder(): void {
    this.mobileSaveValidationAttempted = true;
    this.officeId = this.getShellOfficeId();
    super.saveWorkOrder();
  }

  override saveWorkOrderAndNew(): void {
    this.mobileSaveValidationAttempted = true;
    this.officeId = this.getShellOfficeId();
    super.saveWorkOrderAndNew();
  }

  override getShellOfficeId(): number | null {
    return this.normalizeMobileOfficeId(this.mobileSelectedOfficeId);
  }

  override back(): void {
    if (this.mobileReturnReceiptId) {
      void this.mobileRouter.navigate(['/mobile', 'maintenance', 'receipts', this.mobileReturnReceiptId]);
      return;
    }
    const ticketRoute = getMobileTicketReturnRoute(this.mobileReturnTicketId, this.mobileReturnTicketTab);
    if (ticketRoute) {
      void this.mobileRouter.navigate(ticketRoute);
      return;
    }
    void this.mobileRouter.navigate(['/mobile', 'maintenance', 'work-orders']);
  }

  getMobileOfficeOptions(): OfficeResponse[] {
    return this.mobileGlobalSelectionService.filterOfficeListForUser(
      (this.offices || []).filter(office => office.isActive !== false)
    );
  }

  shouldShowMobileOfficeError(): boolean {
    return this.mobileSaveValidationAttempted && !this.getShellOfficeId();
  }

  shouldShowMobilePropertyError(): boolean {
    return this.mobileSaveValidationAttempted
      && this.isPropertySelectionRequired()
      && !(this.resolvePropertyIdForSave() || '').trim();
  }

  onMobileOfficeSelected(officeId: number | null): void {
    this.mobileOfficeUserSelected = true;
    const previousOfficeId = this.mobileSelectedOfficeId;
    this.applyPageOfficeScope(officeId);
    this.applyMobileOfficeChangeEffects(previousOfficeId);
  }

  private loadMobileTitleBarProperties(prefillPropertyId: string | null = null): void {
    this.mobilePropertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.mobilePropertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.mobileAllPropertyOptions = (properties || []).filter(option => !!option.propertyId);
            this.updateMobileAvailableProperties();
            if (prefillPropertyId) {
              this.onMobilePropertySelected(prefillPropertyId);
            }
          },
          error: () => {
            this.mobileAllPropertyOptions = [];
            this.mobilePropertyOptions = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.mobileAllPropertyOptions = [];
        this.mobilePropertyOptions = [];
        this.markViewForCheck();
      }
    });
  }

  private applyInitialMobileOfficeScope(): void {
    if (this.initialMobileOfficeScopeApplied || this.mobileOfficeUserSelected) {
      return;
    }

    this.initialMobileOfficeScopeApplied = true;

    if (!this.isAddMode) {
      if (this.mobileSelectedOfficeId != null) {
        this.applyMobileOfficeChangeEffects(undefined);
      }
      return;
    }

    if (this.getMobileOfficeOptions().length === 1) {
      this.applyPageOfficeScope(this.getMobileOfficeOptions()[0].officeId);
    } else {
      this.applyOfficeFromGlobal(this.mobileGlobalSelectionService.getSelectedOfficeIdValue());
    }

    this.applyMobileOfficeChangeEffects(undefined);
  }

  private applyOfficeFromGlobal(globalOfficeId: number | null): void {
    if (this.mobileOfficeUserSelected) {
      return;
    }

    const resolvedOfficeId = this.mobileGlobalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.mobileSelectedOfficeId,
      offices: this.getMobileOfficeOptions(),
      globalOfficeId
    });
    this.applyPageOfficeScope(resolvedOfficeId ?? this.normalizeMobileOfficeId(globalOfficeId));
  }

  private applyPageOfficeScope(officeId: number | null): void {
    this.mobileSelectedOfficeId = officeId == null ? null : this.normalizeMobileOfficeId(officeId);
    this.officeId = this.mobileSelectedOfficeId;
    this.form.patchValue({ officeName: this.getMobileOfficeName(this.mobileSelectedOfficeId) }, { emitEvent: false });
  }

  private applyMobileOfficeChangeEffects(previousOfficeId: number | null | undefined): void {
    this.mobileSaveValidationAttempted = false;
    const officeChanged = previousOfficeId !== undefined && previousOfficeId !== this.mobileSelectedOfficeId;

    if (officeChanged) {
      if (isReceiptCompanyPropertyId(this.selectedPropertyId)) {
        // Keep Company selected when office scope changes.
      } else {
        const propertyOfficeId = this.normalizeMobileOfficeId(this.property?.officeId);
        if (!propertyOfficeId || propertyOfficeId !== this.mobileSelectedOfficeId) {
          this.onMobilePropertySelected(null);
        }
      }
    }

    if (this.mobileSelectedOfficeId) {
      this.setTenantDamagesCcId(this.mobileSelectedOfficeId);
      this.loadAccountingOfficeForWorkOrderCode();
    }

    this.updateMobileAvailableProperties();
    this.markViewForCheck();
  }

  private updateMobileAvailableProperties(): void {
    this.mobilePropertyOptions = this.getMobileScopedPropertyOptions();
    this.syncSelectedPropertyToOfficeScope();
    this.markViewForCheck();
  }

  private getMobileScopedPropertyOptions(): PropertyCodeResponse[] {
    if (!this.mobileSelectedOfficeId) {
      return [];
    }
    return (this.mobileAllPropertyOptions || [])
      .filter(option => !!option.propertyId
        && !isReceiptCompanyPropertyId(option.propertyId)
        && Number(option.officeId) === Number(this.mobileSelectedOfficeId))
      .sort((left, right) => (left.propertyCode || '').localeCompare(right.propertyCode || '', undefined, { sensitivity: 'base' }));
  }

  private syncSelectedPropertyToOfficeScope(): void {
    if (!this.selectedPropertyId) {
      return;
    }

    if (isReceiptCompanyPropertyId(this.selectedPropertyId)) {
      return;
    }

    const isPropertyInScope = this.mobilePropertyOptions.some(option => option.propertyId === this.selectedPropertyId);
    if (!isPropertyInScope) {
      this.onMobilePropertySelected(null);
    }
  }

  onMobilePropertySelected(propertyId: string | null): void {
    const normalized = (propertyId || '').trim() || null;
    if (isReceiptCompanyPropertyId(normalized)) {
      this.propertyId = normalized;
      this.selectedPropertyId = normalized;
      this.property = null;
      this.propertyReceipts = [];
      this.propertyReservations = [];
      this.propertyAgreement = null;
      this.form.patchValue({ propertyCode: 'Company' }, { emitEvent: false });
      this.markViewForCheck();
      return;
    }

    this.propertyId = normalized;
    this.selectedPropertyId = normalized;
    if (!normalized) {
      this.property = null;
      this.form.patchValue({ propertyCode: '' }, { emitEvent: false });
      this.markViewForCheck();
      return;
    }

    this.mobilePropertyService.getPropertyByGuid(normalized).pipe(take(1)).subscribe({
      next: property => {
        this.property = property;
        this.form.patchValue({
          propertyCode: property.propertyCode || '',
          officeName: this.getMobileOfficeName(this.getShellOfficeId()) || property.officeName || ''
        }, { emitEvent: false });
        this.loadPropertyAgreement();
        this.loadPropertyReceipts();
        this.loadPropertyReservations();
        this.loadAccountingOfficeForWorkOrderCode();
        this.markViewForCheck();
      },
      error: () => {
        this.markViewForCheck();
      }
    });
  }

  private syncMobileOfficeFromWorkOrder(workOrder: WorkOrderResponse): void {
    const nextOfficeId = this.normalizeMobileOfficeId(workOrder.officeId)
      ?? this.normalizeMobileOfficeId(this.property?.officeId);
    if (nextOfficeId) {
      this.applyPageOfficeScope(nextOfficeId);
      this.applyMobileOfficeChangeEffects(undefined);
    }
    this.initialMobileOfficeScopeApplied = true;
  }

  private getMobileOfficeName(officeId: number | null): string {
    if (!officeId) {
      return '';
    }
    const fromOffice = this.getMobileOfficeOptions().find(office => Number(office.officeId) === Number(officeId));
    if ((fromOffice?.name || '').trim()) {
      return fromOffice.name.trim();
    }
    if (this.workOrder?.officeId === officeId && (this.workOrder.officeName || '').trim()) {
      return this.workOrder.officeName.trim();
    }
    return (this.property?.officeName || '').trim();
  }

  private normalizeMobileOfficeId(value: number | null | undefined): number | null {
    const officeId = Number(value ?? 0);
    return Number.isFinite(officeId) && officeId > 0 ? officeId : null;
  }
  //#endregion
}
