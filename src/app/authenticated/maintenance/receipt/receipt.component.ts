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
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
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
  @Output() savedEvent = new EventEmitter<ReceiptResponse>();
  @Output() saveValidationAttempted = new EventEmitter<void>();

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
  receiptPdfThumbnailUrl: string | null = null;
  hasNewReceiptUpload: boolean = false;
  originalReceiptPath: string | null = null;
  /** When true, amount input shows raw value for editing (no $); when false, shows getAmountDisplay() with $ prefix. */
  amountFocused = false;
  amountEditValue = '';
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
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
    private pdfThumbnailService: PdfThumbnailService,
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
    this.saveValidationAttempted.emit();
    this.form.markAllAsTouched();

    if (!this.organizationId || this.form.invalid) {
      this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
      return;
    }
    if (this.isAddMode && !this.property) {
      this.toastr.warning('Select a property before saving a new receipt.', 'Missing property');
      return;
    }
    const selectedPropertyIds = this.getSelectedPropertyIds();
    if (selectedPropertyIds.length === 0) {
      this.form.get('propertyIds')?.markAsTouched();
      this.toastr.warning('At least one property must be selected.', 'Missing property');
      return;
    }

    const hasReceiptFile = !!(this.receiptFileDetails?.file) || !!(this.form.get('receiptPath')?.value) || !!(this.receipt?.receiptPath);
    if (!hasReceiptFile) {
      this.toastr.warning('A receipt file is required before saving.', 'Receipt required');
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
      officeId: this.receipt?.officeId || this.property?.officeId || 0,
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
          this.setReceiptPdfThumbnail(this.receiptPreviewDataUrl, saved.fileDetails.contentType);
        } else {
          this.receiptPreviewDataUrl = null;
          this.receiptPdfThumbnailUrl = null;
          this.receiptFileName = this.extractFileName(saved.receiptPath || '');
        }
        this.hasNewReceiptUpload = false;
        this.originalReceiptPath = saved.receiptPath ?? null;
        this.splitTotalValidationError = false;
        this.savedEvent.emit(saved);
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
      this.setReceiptPdfThumbnail(this.receiptPreviewDataUrl, receipt.fileDetails.contentType);
    } else {
      this.receiptPreviewDataUrl = null;
      this.receiptPdfThumbnailUrl = null;
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
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file || !this.property) {
      return;
    }

    const payload = await this.utilityService.buildOptimizedUploadPayload(file);
    this.receiptFileDetails = payload.fileDetails;
    this.receiptPreviewDataUrl = payload.fileDetails.dataUrl;
    this.setReceiptPdfThumbnail(payload.fileDetails.dataUrl, payload.fileDetails.contentType || file.type || '');
    this.receiptFileName = payload.fileDetails.fileName;
    this.hasNewReceiptUpload = true;
    this.form.patchValue({ receiptPath: '' });
  }

  removeReceipt(): void {
    this.form.patchValue({ receiptPath: null });
    if (this.receipt) {
      this.receipt.receiptPath = null;
      this.receipt.fileDetails = null;
    }
    this.receiptPreviewDataUrl = null;
    this.receiptPdfThumbnailUrl = null;
    this.receiptFileName = null;
    this.receiptFileDetails = null;
    this.hasNewReceiptUpload = false;
  }

  extractFileName(path: string): string | null {
    if (!path) return null;
    const parts = path.split(/[\\/]/);
    return parts.length ? parts[parts.length - 1] : null;
  }

  isReceiptPreviewPdf(): boolean {
    const contentType = this.getReceiptPreviewContentType();
    return contentType === 'application/pdf';
  }

  getReceiptPreviewContentType(): string {
    const previewDataUrl = (this.receiptPreviewDataUrl || '').trim();
    const dataUrlMatch = previewDataUrl.match(/^data:([^;]+);/i);
    if (dataUrlMatch?.[1]) {
      return dataUrlMatch[1].toLowerCase();
    }

    const detailsContentType = (this.receiptFileDetails?.contentType || '').trim().toLowerCase();
    if (detailsContentType) {
      return detailsContentType;
    }

    const fileName = (this.receiptFileName || '').trim().toLowerCase();
    if (fileName.endsWith('.pdf')) {
      return 'application/pdf';
    }

    return '';
  }

  setReceiptPdfThumbnail(dataUrl: string | null, contentType: string | null): void {
    if (!dataUrl || !contentType?.toLowerCase().includes('pdf')) {
      this.receiptPdfThumbnailUrl = null;
      return;
    }
    this.receiptPdfThumbnailUrl = null;
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => {
      this.receiptPdfThumbnailUrl = url;
    });
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
    if (this.splitsFormArray.length <= 1 || index < 0 || index >= this.splitsFormArray.length) {
      return;
    }
    this.splitsFormArray.removeAt(index);
    if (this.focusedSplitAmountIndex !== null) {
      if (this.focusedSplitAmountIndex === index) {
        this.focusedSplitAmountIndex = null;
        this.splitAmountEditValue = '';
      } else if (this.focusedSplitAmountIndex > index) {
        this.focusedSplitAmountIndex = this.focusedSplitAmountIndex - 1;
      }
    }
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
    const splitAmountRaw = this.sanitizeSignedDecimalInput(splitAmountControl?.value?.toString() ?? '').trim();
    const splitAmountValue = parseFloat(splitAmountRaw);
    const splitDescription = (splitDescriptionControl?.value || '').trim();
    const splitWorkOrder = (splitGroup.get('workOrder')?.value || '').trim();
    if (splitWorkOrder) {
      return;
    }

    const overallAmount = this.getReceiptAmountValue().toFixed(2);
    const overallDescription = (this.form.get('description')?.value || '').trim();
    const patch: { amount?: string; description?: string } = {};

    const isSplitAmountEmptyOrZero = !splitAmountRaw || !Number.isFinite(splitAmountValue) || Math.abs(splitAmountValue) < 0.000001;
    if (isSplitAmountEmptyOrZero && overallAmount) {
      patch.amount = overallAmount;
    }
    if (!splitDescription && overallDescription) {
      patch.description = overallDescription;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }

    this.isSyncingInitialSplit = true;
    splitGroup.patchValue(patch, { emitEvent: false });
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
