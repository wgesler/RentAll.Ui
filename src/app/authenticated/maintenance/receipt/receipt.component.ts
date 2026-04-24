import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FileDetails } from '../../documents/models/document.model';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReceiptRequest, ReceiptResponse, Split } from '../models/receipt.model';
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
   @Input() embeddedInMaintenance = false;
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
  /** When true, amount input shows raw value for editing (no $); when false, shows getAmountDisplay() with $ prefix. */
  amountFocused = false;
  amountEditValue = '';
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
  receiptImageTargetMinBytes = 150 * 1024;
  receiptImageTargetMaxBytes = 500 * 1024;
  splitTotalValidationError = false;
  isSyncingInitialSplit = false;
  propertyOptions: PropertyListResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipt', 'property', 'properties']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    receiptService: ReceiptService,
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    public formatter: FormatterService,
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
    if (this.embeddedInMaintenance) {
      this.isAddMode = this.receiptId == null;
      this.selectedPropertyId = this.property?.propertyId ?? null;
      this.loadProperty();
      this.loadProperties();
      this.loadReceipt();
      return;
    }
    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const receiptIdParam = paramMap.get('id');
      if (receiptIdParam !== null)
        this.receiptId = receiptIdParam === 'new' ? null : parseInt(receiptIdParam, 10) || null;

      this.isAddMode = this.receiptId == null;
      this.selectedPropertyId = this.property?.propertyId ?? this.route.snapshot.queryParamMap.get('propertyId') ?? null;
      this.loadProperty();
      this.loadProperties();
      this.loadReceipt();
    });
  }

  saveReceipt(): void {
    if (!this.property || !this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const selectedPropertyIds = this.getSelectedPropertyIds();
    if (selectedPropertyIds.length === 0) {
      this.form.get('propertyIds')?.markAsTouched();
      this.toastr.warning('At least one property must be selected.', 'Missing property');
      return;
    }

    const hasReceiptImage = !!(this.receiptFileDetails?.file) || !!(this.form.get('receiptPath')?.value) || !!(this.receipt?.receiptPath);
    if (!hasReceiptImage) {
      this.toastr.warning('A receipt image is required before saving.', 'Receipt required');
      return;
    }

    const sendNewReceipt = this.hasNewReceiptUpload;
    const receiptPathValue = this.form.get('receiptPath')?.value ?? this.receipt?.receiptPath ?? null;
    const amountStr = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    const amountValue = parseFloat(amountStr) || 0;
    const payloadSplits = this.getPayloadSplitsFromForm();
    if (payloadSplits.length === 0) {
      this.toastr.warning('At least one split line is required.', 'Missing split');
      return;
    }
    const splitTotalAmount = this.getSplitTotalAmount(payloadSplits);
    if (splitTotalAmount > amountValue) {
      this.splitTotalValidationError = true;
      this.toastr.warning('Split total cannot be greater than the receipt amount.', 'Invalid split total');
      return;
    }
    this.splitTotalValidationError = false;
    const payload: ReceiptRequest = {
      receiptId: this.receipt?.receiptId,
      organizationId: this.organizationId,
      officeId: this.receipt?.officeId || this.property.officeId,
      propertyIds: selectedPropertyIds,
      maintenanceId: this.receipt?.maintenanceId || this.maintenanceId || '',
      description: (this.form.get('description')?.value || '').trim(),
      amount: amountValue,
      splits: payloadSplits,
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
          payload.amount !== (this.receipt.amount ?? 0) ||
          this.havePropertyIdsChanged(payload.propertyIds, this.receipt.propertyIds || []) ||
          this.haveSplitsChanged(payload.splits, this.receipt.splits || []) ||
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
          propertyCode: this.getPropertyCodesDisplay(saved.propertyIds || []) || this.property?.propertyCode || '',
          propertyIds: saved.propertyIds || [],
          description: saved.description || '',
          amount: saved.amount != null ? this.formatter.currency(saved.amount) : '0.00',
          receiptPath: saved.receiptPath || '',
          isActive: saved.isActive
        });
        this.replaceSplitLines(saved.splits || []);
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
        this.splitTotalValidationError = false;
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
      propertyIds: new FormControl<string[]>([], [Validators.required]),
      amount: new FormControl('0.00', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      splits: this.fb.array([]),
      receiptPath: new FormControl(''),
      isActive: new FormControl(true)
    });
    this.ensureAtLeastOneSplit();
  }

  populateForm(receipt: ReceiptResponse): void {
    this.form.patchValue({
      officeName: this.property?.officeName || '',
      propertyCode: this.getPropertyCodesDisplay(receipt.propertyIds || []) || this.property?.propertyCode || '',
      propertyIds: receipt.propertyIds || [],
      description: receipt.description || '',
      amount: receipt.amount != null ? this.formatter.currency(receipt.amount) : '0.00',
      receiptPath: receipt.receiptPath || '',
      isActive: receipt.isActive
    });
    this.replaceSplitLines(receipt.splits || []);
    this.receiptFileDetails = receipt.fileDetails || null;
    this.hasNewReceiptUpload = false;
    this.originalReceiptPath = receipt.receiptPath ?? null;
    this.splitTotalValidationError = false;
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
      if (this.isAddMode) {
        const defaultPropertyId = this.selectedPropertyId || this.property?.propertyId || null;
        if (defaultPropertyId) {
          this.form.patchValue({ propertyIds: [defaultPropertyId] });
        }
      }
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }
    this.propertyService.getPropertyByGuid(this.selectedPropertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (p) => {
        this.property = p;
        this.form.patchValue({
          officeName: this.property?.officeName || '',
          propertyCode: this.property?.propertyCode || '',
          propertyIds: this.isAddMode && this.property?.propertyId ? [this.property.propertyId] : this.getSelectedPropertyIds(),
        });
      },
      error: () => {
        this.toastr.error('Unable to load property.', 'Error');
      }
    });
  }

  loadProperties(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }
    this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties) => {
        this.propertyOptions = (properties || []).filter(p => !!p.propertyId);
        if (this.isAddMode && this.selectedPropertyId) {
          this.form.patchValue({ propertyIds: [this.selectedPropertyId] });
        } else {
          this.form.patchValue({ propertyCode: this.getPropertyCodesDisplay(this.getSelectedPropertyIds()) });
        }
      },
      error: () => {
        this.propertyOptions = [];
        this.toastr.error('Unable to load properties.', 'Error');
      }
    });
  }
  //#endregion

  //#region Receipt Methods
  openReceiptPicker(fileInput: HTMLInputElement): void {
    if (!this.property) return;
    fileInput.click();
  }

  async onReceiptSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file || !this.property) {
      return;
    }

    try {
      const optimizedBlob = await this.optimizeUploadedReceiptImage(file);
      const optimizedDataUrl = await this.blobToDataUrl(optimizedBlob);
      const base64String = optimizedDataUrl.includes(',') ? optimizedDataUrl.split(',')[1] : optimizedDataUrl;
      const optimizedName = optimizedBlob.type === 'image/jpeg'
        ? file.name.replace(/\.[^/.]+$/, '.jpg')
        : file.name;

      this.receiptFileDetails = {
        fileName: optimizedName,
        contentType: optimizedBlob.type || 'image/jpeg',
        file: base64String,
        dataUrl: optimizedDataUrl
      };
      this.receiptPreviewDataUrl = optimizedDataUrl;
      this.receiptFileName = optimizedName;
      this.hasNewReceiptUpload = true;
      this.form.patchValue({ receiptPath: '' });
    } catch {
      const originalDataUrl = await this.fileToDataUrl(file);
      const base64String = originalDataUrl.includes(',') ? originalDataUrl.split(',')[1] : originalDataUrl;
      this.receiptFileDetails = {
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        file: base64String,
        dataUrl: originalDataUrl
      };
      this.receiptPreviewDataUrl = originalDataUrl;
      this.receiptFileName = file.name;
      this.hasNewReceiptUpload = true;
      this.form.patchValue({ receiptPath: '' });
    }
  }

  async optimizeUploadedReceiptImage(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/') && !this.isHeicLikeFile(file)) {
      return file;
    }

    const normalizedFile = await this.convertHeicToJpegIfNeeded(file);
    if (normalizedFile.size <= this.receiptImageTargetMaxBytes) {
      return normalizedFile;
    }

    const image = await this.loadImageFromFile(normalizedFile);
    const largestSide = Math.max(image.width, image.height);
    const initialScale = largestSide > 1800 ? 1800 / largestSide : 1;

    let scale = initialScale;
    let quality = 0.82;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const nextBlob = await this.renderCompressedJpegBlob(image, scale, quality);
      if (!nextBlob) {
        break;
      }
      bestBlob = nextBlob;

      if (nextBlob.size <= this.receiptImageTargetMaxBytes && nextBlob.size >= this.receiptImageTargetMinBytes) {
        break;
      }

      if (nextBlob.size > this.receiptImageTargetMaxBytes) {
        if (quality > 0.5) {
          quality = Math.max(0.5, quality - 0.1);
        } else {
          scale *= 0.85;
          quality = 0.78;
        }
        continue;
      }

      break;
    }

    if (!bestBlob || bestBlob.size >= normalizedFile.size) {
      return normalizedFile;
    }

    return bestBlob;
  }

  isHeicLikeFile(file: File): boolean {
    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    return fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');
  }

  async convertHeicToJpegIfNeeded(file: File): Promise<File> {
    if (!this.isHeicLikeFile(file)) {
      return file;
    }

    try {
      const heic2anyModule = await import('heic2any');
      const heic2any = heic2anyModule.default;
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });

      const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(convertedBlob instanceof Blob)) {
        throw new Error('Unsupported HEIC conversion result.');
      }

      const convertedName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([convertedBlob], convertedName, { type: 'image/jpeg' });
    } catch {
      throw new Error('Unable to process HEIC image. Please convert to JPG/PNG and try again.');
    }
  }

  loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to decode image'));
      };
      image.src = objectUrl;
    });
  }

  renderCompressedJpegBlob(image: HTMLImageElement, scale: number, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
      const targetWidth = Math.max(1, Math.floor(image.width * scale));
      const targetHeight = Math.max(1, Math.floor(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }

  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  }

  fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
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

  onAmountKeydown(event: Event): void {
    this.formatter.formatDecimalOnEnter(event as KeyboardEvent, this.form.get('amount'));
  }

  getAmountDisplay(): string {
    if (this.amountFocused) {
      return this.amountEditValue;
    }
    const raw = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    const num = parseFloat(raw) || 0;
    return '$' + this.formatter.currency(num);
  }

  onAmountFocus(event: Event): void {
    const control = this.form.get('amount');
    const current = this.sanitizeSignedDecimalInput(control?.value?.toString() ?? '');
    this.amountEditValue = current || '';
    this.amountFocused = true;
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = this.sanitizeSignedDecimalInput(input?.value ?? '');
    const num = parseFloat(raw) || 0;
    const formatted = num.toFixed(2);
    const control = this.form.get('amount');
    control?.setValue(formatted, { emitEvent: false });
    control?.markAsTouched();
    this.syncInitialSplitWithOverallIfNeeded();
    this.amountFocused = false;
    this.amountEditValue = '';
  }

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value ?? '';
    this.amountEditValue = this.sanitizeSignedDecimalInput(value);
    this.form.get('amount')?.setValue(this.amountEditValue, { emitEvent: false });
  }

  getSplitAmountDisplay(index: number): string {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    const raw = this.sanitizeSignedDecimalInput(amountControl?.value?.toString() ?? '');
    if (this.focusedSplitAmountIndex === index) {
      return this.splitAmountEditValue;
    }
    const num = parseFloat(raw) || 0;
    return '$' + this.formatter.currency(num);
  }

  onSplitAmountFocus(event: Event, index: number): void {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    const current = this.sanitizeSignedDecimalInput(amountControl?.value?.toString() ?? '');
    this.focusedSplitAmountIndex = index;
    this.splitAmountEditValue = current || '';
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onSplitAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value ?? '';
    this.splitAmountEditValue = this.sanitizeSignedDecimalInput(value);
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    amountControl?.setValue(this.splitAmountEditValue, { emitEvent: false });
  }

  onSplitAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const raw = this.sanitizeSignedDecimalInput(input?.value ?? '');
    const num = parseFloat(raw) || 0;
    const formatted = num.toFixed(2);
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    amountControl?.setValue(formatted, { emitEvent: false });
    amountControl?.markAsTouched();
    if (this.focusedSplitAmountIndex === index) {
      this.focusedSplitAmountIndex = null;
      this.splitAmountEditValue = '';
    }
  }

  onSplitAmountKeydown(event: Event, index: number): void {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    this.formatter.formatDecimalOnEnter(event as KeyboardEvent, amountControl);
  }

  onOverallDescriptionBlur(): void {
    if (this.amountFocused) {
      return;
    }
    this.syncInitialSplitWithOverallIfNeeded();
  }

  get splitsFormArray(): FormArray {
    return this.form.get('splits') as FormArray;
  }

  addSplitLine(): void {
    this.splitsFormArray.push(this.createSplitFormGroup());
  }

  removeSplitLine(index: number): void {
    if (this.splitsFormArray.length <= 1) {
      return;
    }
    this.splitsFormArray.removeAt(index);
    this.ensureAtLeastOneSplit();
  }

  getDisplayedSplitTotal(): number {
    return this.getSplitTotalAmount(this.getPayloadSplitsFromForm());
  }

  isDisplayedSplitTotalInvalid(): boolean {
    return this.getDisplayedSplitTotal() > this.getReceiptAmountValue();
  }

  createSplitFormGroup(split?: Partial<Split>): FormGroup {
    const amount = Number(split?.amount);
    return this.fb.group({
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '', [Validators.required]),
      description: new FormControl((split?.description || '').trim(), [Validators.required]),
      workOrder: new FormControl((split?.workOrder || '').trim())
    });
  }

  ensureAtLeastOneSplit(): void {
    if (this.splitsFormArray.length > 0) {
      return;
    }
    this.splitsFormArray.push(this.createSplitFormGroup());
  }

  replaceSplitLines(splits: Split[]): void {
    this.splitsFormArray.clear();
    (splits || []).forEach(split => this.splitsFormArray.push(this.createSplitFormGroup(split)));
    this.ensureAtLeastOneSplit();
  }

  getPayloadSplitsFromForm(): Split[] {
    return this.splitsFormArray.controls.map(control => {
      const amountRaw = this.sanitizeSignedDecimalInput(control.get('amount')?.value?.toString() ?? '');
      return {
        amount: parseFloat(amountRaw) || 0,
        description: (control.get('description')?.value || '').trim(),
        workOrder: (control.get('workOrder')?.value || '').trim()
      };
    });
  }

  syncInitialSplitWithOverallIfNeeded(): void {
    if (this.isSyncingInitialSplit || this.splitsFormArray.length !== 1) {
      return;
    }

    const splitGroup = this.splitsFormArray.at(0) as FormGroup;
    const splitAmountControl = splitGroup.get('amount');
    const splitDescriptionControl = splitGroup.get('description');
    const splitAmountRaw = this.sanitizeSignedDecimalInput(splitAmountControl?.value?.toString() ?? '');
    const splitAmount = parseFloat(splitAmountRaw) || 0;
    const splitDescription = (splitDescriptionControl?.value || '').trim();
    const splitWorkOrder = (splitGroup.get('workOrder')?.value || '').trim();
    const isBlankInitialSplit = splitAmount <= 0 && !splitDescription && !splitWorkOrder;

    if (!isBlankInitialSplit) {
      return;
    }

    this.isSyncingInitialSplit = true;
    splitGroup.patchValue({
      amount: this.getReceiptAmountValue().toFixed(2),
      description: (this.form.get('description')?.value || '').trim()
    }, { emitEvent: false });
    this.isSyncingInitialSplit = false;
  }

  getSplitTotalAmount(splits: Split[]): number {
    return (splits || []).reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  }

  haveSplitsChanged(nextSplits: Split[], currentSplits: Split[]): boolean {
    return JSON.stringify(this.normalizeSplits(nextSplits)) !== JSON.stringify(this.normalizeSplits(currentSplits));
  }

  normalizeSplits(splits: Split[]): Split[] {
    return (splits || []).map(split => ({
      amount: Number(split.amount) || 0,
      description: (split.description || '').trim(),
      workOrder: (split.workOrder || '').trim()
    }));
  }

  getSelectedPropertyIds(): string[] {
    const value = this.form.get('propertyIds')?.value;
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(propertyId => (propertyId || '').toString().trim())
      .filter(propertyId => propertyId.length > 0);
  }

  havePropertyIdsChanged(nextPropertyIds: string[], currentPropertyIds: string[]): boolean {
    const normalize = (ids: string[]) =>
      (ids || [])
        .map(id => (id || '').trim())
        .filter(id => id.length > 0)
        .sort();
    return JSON.stringify(normalize(nextPropertyIds)) !== JSON.stringify(normalize(currentPropertyIds));
  }

  getPropertyCodesDisplay(propertyIds: string[] | null | undefined): string {
    const codeLookup = new Map(
      (this.propertyOptions || []).map(property => [property.propertyId, (property.propertyCode || '').trim()])
    );
    return (propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .map(propertyId => codeLookup.get(propertyId) || propertyId)
      .join(', ');
  }

  getReceiptAmountValue(): number {
    const raw = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    return parseFloat(raw) || 0;
  }

  sanitizeSignedDecimalInput(value: string): string {
    if (!value) {
      return '';
    }
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const isNegative = cleaned.startsWith('-');
    const unsigned = cleaned.replace(/-/g, '');
    const parts = unsigned.split('.');
    const numericPortion = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
    return `${isNegative ? '-' : ''}${numericPortion}`;
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
