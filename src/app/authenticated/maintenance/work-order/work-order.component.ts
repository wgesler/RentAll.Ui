import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  selector: 'app-work-order',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss'
})
export class WorkOrderComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() workOrderIdInput: number | null = null;
  @Input() maintenanceIdInput: string | null = null;
  @Input() showBackButton: boolean = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  form: FormGroup;
  organizationId: string = '';
  workOrder: WorkOrderResponse | null = null;
  isLoading: boolean = false;
  isSaving: boolean = false;
  isServiceError: boolean = false;

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    workOrderService: WorkOrderService
  ) {
    this.fb = fb;
    this.authService = authService;
    this.workOrderService = workOrderService;
    this.form = this.fb.group({
      descriptionId: ['', [Validators.required]],
      documentPath: [''],
      isActive: [true]
    });
  }

  fb: FormBuilder;
  authService: AuthService;
  workOrderService: WorkOrderService;

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    if (this.workOrderIdInput) {
      this.loadWorkOrder(this.workOrderIdInput);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workOrderIdInput']) {
      const workOrderId = this.workOrderIdInput || null;
      if (workOrderId) {
        this.loadWorkOrder(workOrderId);
      } else {
        this.workOrder = null;
        this.form.reset({
          descriptionId: '',
          documentPath: '',
          isActive: true
        });
      }
    }
  }

  loadWorkOrder(workOrderId: number): void {
    if (!this.organizationId) {
      this.organizationId = this.authService.getUser()?.organizationId || '';
    }
    if (!this.organizationId) {
      this.isServiceError = true;
      return;
    }

    this.isLoading = true;
    this.isServiceError = false;
    this.workOrderService.getWorkOrder(this.organizationId, workOrderId).pipe(take(1)).subscribe({
      next: (workOrder: WorkOrderResponse) => {
        this.workOrder = workOrder;
        this.form.patchValue({
          descriptionId: workOrder.descriptionId || '',
          documentPath: workOrder.documentPath || '',
          isActive: workOrder.isActive
        });
        this.isLoading = false;
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }

  saveWorkOrder(): void {
    if (!this.property || !this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: WorkOrderRequest = {
      workOrderId: this.workOrder?.workOrderId,
      organizationId: this.organizationId,
      officeId: this.workOrder?.officeId || this.property.officeId,
      propertyId: this.property.propertyId,
      maintenanceId: this.workOrder?.maintenanceId || this.maintenanceIdInput || '',
      descriptionId: this.form.get('descriptionId')?.value || '',
      documentPath: this.form.get('documentPath')?.value || null,
      isActive: this.form.get('isActive')?.value === true
    };

    this.isSaving = true;
    this.isServiceError = false;

    const save$ = this.workOrder?.workOrderId
      ? this.workOrderService.updateWorkOrder(payload)
      : this.workOrderService.createWorkOrder(payload);

    save$.pipe(take(1)).subscribe({
      next: (saved: WorkOrderResponse) => {
        this.workOrder = saved;
        this.form.patchValue({
          descriptionId: saved.descriptionId || '',
          documentPath: saved.documentPath || '',
          isActive: saved.isActive
        });
        this.isSaving = false;
        this.savedEvent.emit();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.isSaving = false;
      }
    });
  }

  back(): void {
    this.backEvent.emit();
  }
}
