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
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';

@Component({
  standalone: true,
  selector: 'app-receipt',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './receipt.component.html',
  styleUrl: './receipt.component.scss'
})
export class ReceiptComponent implements OnInit, OnDestroy {
  @Input() property: PropertyResponse | null = null;
  @Input() receiptId: number | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() showBackButton: boolean = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;
  receiptService: ReceiptService;
  isAddMode: boolean = true;
  isSubmitting: boolean = false;

  organizationId: string = '';
  selectedPropertyId: string | null = null;
  receipt: ReceiptResponse | null = null;
  receiptPreviewDataUrl: string | null = null;
  receiptFileName: string | null = null;
  receiptFileDetails: FileDetails | null = null;
  hasNewReceiptUpload: boolean = false;
  originalReceiptPath: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipt', 'property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    receiptService: ReceiptService,
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    private toastr: ToastrService
  ) {
    this.fb = fb;
    this.authService = authService;
    this.receiptService = receiptService;
  }

  //#region Receipt
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const receiptIdParam = paramMap.get('id');
      if (receiptIdParam !== null)
        this.receiptId = receiptIdParam === 'new' ? null : parseInt(receiptIdParam, 10) || null;

      this.isAddMode = this.receiptId == null;
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;

      this.loadProperty();
      this.loadReceipt();
    });
  }

  saveReceipt(): void {
    if (!this.property || !this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const hasReceiptImage = !!(this.receiptFileDetails?.file) || !!(this.form.get('receiptPath')?.value) || !!(this.receipt?.receiptPath);
    if (!hasReceiptImage) {
      this.toastr.warning('A receipt image is required before saving.', 'Receipt required');
      return;
    }

    const sendNewReceipt = this.hasNewReceiptUpload;
    const receiptPathValue = this.form.get('receiptPath')?.value ?? this.receipt?.receiptPath ?? null;
    const payload: ReceiptRequest = {
      receiptId: this.receipt?.receiptId,
      organizationId: this.organizationId,
      officeId: this.receipt?.officeId || this.property.officeId,
      propertyId: this.property.propertyId,
      maintenanceId: this.receipt?.maintenanceId || this.maintenanceId || '',
      description: (this.form.get('description')?.value || '').trim(),
      receiptPath: sendNewReceipt ? undefined : receiptPathValue,
      fileDetails: sendNewReceipt ? this.receiptFileDetails : undefined,
      isActive: this.form.get('isActive')?.value
    };

    if (this.receipt?.receiptId) {
      const hasReceiptChange = this.hasNewReceiptUpload ||
        (payload.receiptPath !== (this.receipt.receiptPath ?? null)) ||
        (!!payload.fileDetails !== !!(this.receipt.fileDetails?.file));
      const hasReceiptUpdates = this.receipt
        ? (payload.description !== (this.receipt.description ?? '').trim()) ||
          payload.isActive !== this.receipt.isActive ||
          hasReceiptChange
        : true;
      if (!hasReceiptUpdates) {
        if (this.selectedPropertyId) {
          this.back();
        }
        return;
      }
    }

    this.isSubmitting = true;

    const save$ = this.receipt?.receiptId
      ? this.receiptService.updateReceipt(payload)
      : this.receiptService.createReceipt(payload);

    save$.pipe(take(1), finalize(() => { this.isSubmitting = false; })).subscribe({
      next: (saved: ReceiptResponse) => {
        this.receipt = saved;
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
        this.toastr.success('Receipt saved.', 'Success');
        if (this.selectedPropertyId) {
          this.back();
        }
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to save receipt.', 'Error');
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

  populateForm(receipt: ReceiptResponse): void {
    this.form.patchValue({
      officeName: this.property?.officeName || '',
      propertyCode: this.property?.propertyCode || '',
      description: receipt.description || '',
      receiptPath: receipt.receiptPath || '',
      isActive: receipt.isActive
    });
    this.receiptFileDetails = receipt.fileDetails || null;
    this.hasNewReceiptUpload = false;
    this.originalReceiptPath = receipt.receiptPath ?? null;
    if (receipt.fileDetails?.file && receipt.fileDetails?.contentType) {
      this.receiptPreviewDataUrl = receipt.fileDetails.dataUrl || `data:${receipt.fileDetails.contentType};base64,${receipt.fileDetails.file}`;
      this.receiptFileName = receipt.fileDetails.fileName || this.extractFileName(receipt.receiptPath || '');
    } else {
      this.receiptPreviewDataUrl = null;
      this.receiptFileName = this.extractFileName(receipt.receiptPath || '');
    }
  }
  //#endregion

  //#region Data Load Methods
  loadReceipt(): void {
    if (this.isAddMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipt');
      return;
    }

    this.receiptService.getReceipt(this.organizationId, this.receiptId!).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipt'); })).subscribe({
      next: (receipt: ReceiptResponse) => {
        this.receipt = receipt;
        this.populateForm(receipt);
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load receipt.', 'Error');
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
    if (this.receipt) {
      this.receipt.receiptPath = null;
      this.receipt.fileDetails = null;
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
      this.router.navigate(['/' + maintenanceUrl], { queryParams: { tab: 2 } });
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
