import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FileDetails } from '../../documents/models/document.model';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  standalone: true,
  selector: 'app-work-order',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './work-order.component.html',
  styleUrl: './work-order.component.scss'
})
export class WorkOrderComponent implements OnInit, OnDestroy {
  @Input() property: PropertyResponse | null = null;
  @Input() workOrderId: number | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() showBackButton: boolean = true;
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
  receiptPreviewDataUrl: string | null = null;
  receiptFileName: string | null = null;
  receiptFileDetails: FileDetails | null = null;
  hasNewReceiptUpload: boolean = false;
  /** Original receipt path from load; used to detect removal and avoid re-sending unchanged file */
  originalReceiptPath: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['workOrder', 'property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    workOrderService: WorkOrderService,
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    private toastr: ToastrService
  ) {
    this.fb = fb;
    this.authService = authService;
    this.workOrderService = workOrderService;
  }

  //#region Work Order
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const workOrderIdParam = paramMap.get('id');
      if (workOrderIdParam !== null) 
        this.workOrderId = workOrderIdParam === 'new' ? null : parseInt(workOrderIdParam, 10) || null;

      this.isAddMode = this.workOrderId == null;
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;

      this.loadProperty();
      this.loadWorkOrder();
    });
  }

  saveWorkOrder(): void {
    if (!this.property || !this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const hasReceiptImage = !!(this.receiptFileDetails?.file) || !!(this.form.get('receiptPath')?.value) || !!(this.workOrder?.receiptPath);
    if (!hasReceiptImage) {
      this.toastr.warning('A receipt image is required before saving.', 'Receipt required');
      return;
    }

    // Like user profile: send fileDetails only when user uploaded a new receipt; otherwise send receiptPath (or null if removed)
    const sendNewReceipt = this.hasNewReceiptUpload;
    const receiptPathValue = this.form.get('receiptPath')?.value ?? this.workOrder?.receiptPath ?? null;
    const payload: WorkOrderRequest = {
      workOrderId: this.workOrder?.workOrderId,
      organizationId: this.organizationId,
      officeId: this.workOrder?.officeId || this.property.officeId,
      propertyId: this.property.propertyId,
      maintenanceId: this.workOrder?.maintenanceId || this.maintenanceId || '',
      description: (this.form.get('description')?.value || '').trim(),
      receiptPath: sendNewReceipt ? undefined : receiptPathValue,
      fileDetails: sendNewReceipt ? this.receiptFileDetails : undefined,
      isActive: this.form.get('isActive')?.value
    };

    // Edit mode: only call update when something changed (like user profile self-edit)
    if (this.workOrder?.workOrderId) {
      const hasReceiptChange = this.hasNewReceiptUpload ||
        (payload.receiptPath !== (this.workOrder.receiptPath ?? null)) ||
        (!!payload.fileDetails !== !!(this.workOrder.fileDetails?.file));
      const hasWorkOrderUpdates = this.workOrder
        ? (payload.description !== (this.workOrder.description ?? '').trim()) ||
          payload.isActive !== this.workOrder.isActive ||
          hasReceiptChange
        : true;
      if (!hasWorkOrderUpdates) {
        if (this.selectedPropertyId) {
          this.back();
        }
        return;
      }
    }

    this.isSubmitting = true;

    const save$ = this.workOrder?.workOrderId
      ? this.workOrderService.updateWorkOrder(payload)
      : this.workOrderService.createWorkOrder(payload);

    save$.pipe(take(1),finalize(() => { this.isSubmitting = false; })).subscribe({
      next: (saved: WorkOrderResponse) => {
        this.workOrder = saved;
        this.isAddMode = false;
        this.form.patchValue({
          officeName: saved.officeName || this.property?.officeName || '',
          propertyCode: saved.propertyCode || this.property?.propertyCode || '',
          description: saved.description || '',
          receiptPath: saved.receiptPath || '',
          isActive: saved.isActive
        });
        this.receiptFileDetails = saved.fileDetails || this.receiptFileDetails;
        if (saved.fileDetails?.file && saved.fileDetails?.contentType) {
          this.receiptPreviewDataUrl = saved.fileDetails.dataUrl
            || `data:${saved.fileDetails.contentType};base64,${saved.fileDetails.file}`;
          this.receiptFileName = saved.fileDetails.fileName || this.extractFileName(saved.receiptPath || '');
        } else {
          this.receiptPreviewDataUrl = null;
          this.receiptFileName = this.extractFileName(saved.receiptPath || '');
        }
        this.hasNewReceiptUpload = false;
        this.originalReceiptPath = saved.receiptPath ?? null;
        this.savedEvent.emit();
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

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      officeName: new FormControl(''),
      propertyCode: new FormControl(''),
      description: new FormControl('', [Validators.required]),
      receiptPath: new FormControl(''),
      isActive: new FormControl(true)
    });
  }

  populateForm(workOrder: WorkOrderResponse): void {
    this.form.patchValue({
      officeName: this.property?.officeName || '',
      propertyCode: this.property?.propertyCode || '',
      description: workOrder.description || '',
      receiptPath: workOrder.receiptPath || '',
      isActive: workOrder.isActive
    });
    this.receiptFileDetails = workOrder.fileDetails || null;
    this.hasNewReceiptUpload = false;
    this.originalReceiptPath = workOrder.receiptPath ?? null;
    if (workOrder.fileDetails?.file && workOrder.fileDetails?.contentType) {
      this.receiptPreviewDataUrl = workOrder.fileDetails.dataUrl || `data:${workOrder.fileDetails.contentType};base64,${workOrder.fileDetails.file}`;
      this.receiptFileName = workOrder.fileDetails.fileName || this.extractFileName(workOrder.receiptPath || '');
    } else {
      this.receiptPreviewDataUrl = null;
      this.receiptFileName = this.extractFileName(workOrder.receiptPath || '');
    }
  }
  //#endregion

  //#region Data Load Methods
  loadWorkOrder(): void {
    if (this.isAddMode) {
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
      return;
    }
    this.propertyService.getPropertyByGuid(this.selectedPropertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (p) => {
        this.property = p;
        this.form.patchValue({
          officeName: this.property?.officeName || '',
          propertyCode: this.property?.propertyCode || '',
        });
      },
      error: () => {
        this.toastr.error('Unable to load property.', 'Error');
      }
    });
  }
  //#endregion

  //#region Receipt Methods
  openReceiptPicker(fileInput: HTMLInputElement): void {
    if (!this.property) return;
    fileInput.click();
  }

  onReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file || !this.property) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64String = result.includes(',') ? result.split(',')[1] : result;
      this.receiptFileDetails = {
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        file: base64String,
        dataUrl: result
      };
      this.receiptPreviewDataUrl = result;
      this.receiptFileName = file.name;
      this.hasNewReceiptUpload = true;
      this.form.patchValue({ receiptPath: '' });
    };
    reader.readAsDataURL(file);
  }

  removeReceipt(): void {
    this.form.patchValue({ receiptPath: null });
    if (this.workOrder) {
      this.workOrder.receiptPath = null;
      this.workOrder.fileDetails = null;
    }
    this.receiptPreviewDataUrl = null;
    this.receiptFileName = null;
    this.receiptFileDetails = null;
    this.hasNewReceiptUpload = false;
  }

  extractFileName(path: string): string | null {
    if (!path) return null;
    const parts = path.split(/[\\/]/);
    return parts.length ? parts[parts.length - 1] : null;
  }
  //#endregion

  //#region Utility Methods
  back(): void {
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
