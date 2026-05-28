import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { FileDetails } from '../../documents/models/document.model';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { UtilityService } from '../../../services/utility.service';
import { getReceiptTypes, ReceiptType } from '../models/maintenance-enums';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { PropertyListResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReceiptRequest, ReceiptResponse, Split } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { BankCardResponse } from '../../organizations/models/bank.model';
import { WorkOrderService } from '../services/work-order.service';
import { MappingService } from '../../../services/mapping.service';

@Component({
  standalone: true,
  selector: 'app-receipt',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './receipt.component.html',
  styleUrl: './receipt.component.scss'
})
export class ReceiptComponent implements OnInit, OnChanges, OnDestroy {
  readonly newVendorOptionValue = '__new_vendor__';
  @Input() property: PropertyResponse | null = null;
  @Input() receiptId: number | null = null;
  @Input() maintenanceId: string | null = null;
  @Input() maintenanceOfficeId: number | null = null;
  @Input() showBackButton: boolean = true;
   @Input() embeddedInMaintenance = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<ReceiptResponse>();
  @Output() saveValidationAttempted = new EventEmitter<void>();
  @Output() workOrderSelect = new EventEmitter<{ workOrderId: string | null; propertyId: string | null }>();

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;
  receiptService: ReceiptService;
  isAddMode: boolean = true;
  isSubmitting: boolean = false;
  isPageReady = false;

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
  receiptTypeOptions = getReceiptTypes();
  bankCardOptions: { value: number; label: string }[] = [];
  vendorOptions: { value: string; label: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipt', 'property', 'properties', 'accountingOffices', 'bankCards', 'vendors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  private destroy$ = new Subject<void>();

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    receiptService: ReceiptService,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private propertyService: PropertyService,
    private accountingOfficeService: AccountingOfficeService,
    private contactService: ContactService,
    private workOrderService: WorkOrderService,
    private utilityService: UtilityService,
    private pdfThumbnailService: PdfThumbnailService,
    private mappingService: MappingService,
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

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
    this.splitsFormArray.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updatePropertyRequirementByReceiptType();
    });
    this.updatePropertyRequirementByReceiptType();
    
    this.loadAccountingOffices();
    this.loadVendors();

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

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embeddedInMaintenance) {
      return;
    }

    if (changes['maintenanceOfficeId'] && !changes['maintenanceOfficeId'].firstChange) {
      const selectedOfficeId = Number(this.maintenanceOfficeId);
      this.loadBankCardsForOffice(selectedOfficeId || null);
      this.loadVendorsForOffice(selectedOfficeId || null);
    }
  }

  saveReceipt(): void {
    this.updatePropertyRequirementByReceiptType();
    this.saveValidationAttempted.emit();
    this.form.markAllAsTouched();

    if (!this.organizationId || this.form.invalid) {
      this.showValidationErrorToast();
      return;
    }
    const receiptDateValue = this.getReceiptDateForApi();
    if (!receiptDateValue) {
      this.form.get('receiptDate')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (this.isAddMode && !this.property && this.isPropertySelectionRequired()) {
      this.showValidationErrorToast();
      return;
    }
    const selectedPropertyIds = this.getSelectedPropertyIds();
    if (this.isPropertySelectionRequired() && selectedPropertyIds.length === 0) {
      this.form.get('propertyIds')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const hasReceiptFile = !!(this.receiptFileDetails?.file) || !!(this.form.get('receiptPath')?.value) || !!(this.receipt?.receiptPath);
    if (!hasReceiptFile) {
      this.showValidationErrorToast();
      return;
    }

    const sendNewReceipt = this.hasNewReceiptUpload;
    const receiptPathValue = this.form.get('receiptPath')?.value ?? this.receipt?.receiptPath ?? null;
    const amountStr = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    const amountValue = parseFloat(amountStr) || 0;
    const payloadSplits = this.getPayloadSplitsFromForm();
    if (payloadSplits.length === 0) {
      this.showValidationErrorToast();
      return;
    }
    const missingRequiredSplitField = this.validateRequiredSplitFields();
    if (missingRequiredSplitField) {
      this.showValidationErrorToast();
      return;
    }
    const splitTotalAmount = this.getSplitTotalAmount(payloadSplits);
    if (splitTotalAmount > amountValue) {
      this.splitTotalValidationError = true;
      this.toastr.warning('Split total cannot be greater than the receipt amount.', 'Invalid split total');
      return;
    }
    this.splitTotalValidationError = false;
    const bankCardId = Number(this.form.get('bankCardId')?.value ?? 0);
    const isBill = bankCardId === 0;
    const vendorId = (this.form.get('vendorId')?.value || '').toString().trim() || null;
    const vendorName = (this.form.get('vendorName')?.value || '').toString().trim() || null;
    if (!Number.isFinite(bankCardId) || bankCardId < 0) {
      this.form.get('bankCardId')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (isBill && !vendorId) {
      this.form.get('vendorId')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (!isBill && !vendorName) {
      this.form.get('vendorName')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    const payload: ReceiptRequest = {
      receiptId: this.receipt?.receiptId,
      organizationId: this.organizationId,
      officeId: this.receipt?.officeId || this.property?.officeId || 0,
      propertyIds: selectedPropertyIds,
      receiptDate: receiptDateValue,
      maintenanceId: this.receipt?.maintenanceId || this.maintenanceId || '',
      description: (this.form.get('description')?.value || '').trim(),
      amount: amountValue,
      bankCardId: isBill ? null : bankCardId,
      vendorId: isBill ? vendorId : null,
      vendorName: isBill ? null : vendorName,
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
          (this.normalizeReceiptDate(payload.receiptDate) !== this.normalizeReceiptDate(this.receipt.receiptDate)) ||
          payload.amount !== (this.receipt.amount ?? 0) ||
          (payload.bankCardId ?? null) !== (this.receipt.bankCardId ?? null) ||
          ((payload.vendorId || '').toString().trim() || null) !== ((this.receipt.vendorId || '').toString().trim() || null) ||
          ((payload.vendorName || '').toString().trim() || null) !== ((this.receipt.vendorName || '').toString().trim() || null) ||
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
          receiptDate: this.getReceiptDateControlValue(saved.receiptDate),
          propertyCode: this.getPropertyCodesDisplay(saved.propertyIds || []) || this.property?.propertyCode || '',
          propertyIds: saved.propertyIds || [],
          description: saved.description || '',
          amount: saved.amount != null ? this.formatter.currency(saved.amount) : '0.00',
          bankCardId: saved.bankCardId ?? 0,
          vendorId: (saved.vendorId || '').trim() || null,
          vendorName: (saved.vendorName || '').trim() || null,
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

  showValidationErrorToast(): void {
    this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      officeName: new FormControl(''),
      receiptDate: new FormControl<Date | null>(null, [Validators.required]),
      propertyCode: new FormControl(''),
      propertyIds: new FormControl<string[]>([], [Validators.required]),
      amount: new FormControl('0.00', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      bankCardId: new FormControl<number>(0, [Validators.required]),
      vendorId: new FormControl<string | null>(null),
      vendorName: new FormControl<string | null>(null),
      splits: this.fb.array([]),
      receiptPath: new FormControl(''),
      isActive: new FormControl(true)
    });
    this.ensureAtLeastOneSplit();
  }

  populateForm(receipt: ReceiptResponse): void {
    this.form.patchValue({
      officeName: this.property?.officeName || '',
      receiptDate: this.getReceiptDateControlValue(receipt.receiptDate),
      propertyCode: this.getPropertyCodesDisplay(receipt.propertyIds || []) || this.property?.propertyCode || '',
      propertyIds: receipt.propertyIds || [],
      description: receipt.description || '',
      amount: receipt.amount != null ? this.formatter.currency(receipt.amount) : '0.00',
      bankCardId: receipt.bankCardId ?? 0,
      vendorId: (receipt.vendorId || '').trim() || null,
      vendorName: (receipt.vendorName || '').trim() || null,
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
        this.loadBankCardsForOffice(receipt.officeId || this.property?.officeId || this.maintenanceOfficeId || null);
        this.loadVendorsForOffice(receipt.officeId || this.property?.officeId || this.maintenanceOfficeId || null);
        this.populateForm(receipt);
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load receipt.', 'Error');
      }
    });
  }

  loadProperty(): void {
    if (this.property || !this.selectedPropertyId) {
      const fallbackOfficeId = this.property?.officeId || this.maintenanceOfficeId;
      if (fallbackOfficeId) {
        this.loadBankCardsForOffice(fallbackOfficeId);
        this.loadVendorsForOffice(fallbackOfficeId);
      } else {
        this.bankCardOptions = [];
        this.vendorOptions = [{ value: this.newVendorOptionValue, label: 'New Vendor' }];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
      }
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
        this.loadBankCardsForOffice(this.property?.officeId || this.maintenanceOfficeId || null);
        this.loadVendorsForOffice(this.property?.officeId || this.maintenanceOfficeId || null);
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

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'); })
    ).subscribe({
      error: () => {}
    });
  }

  loadBankCardsForOffice(officeId: number | null | undefined): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'bankCards');
    const parsedOfficeId = Number(officeId);
    if (!parsedOfficeId || parsedOfficeId <= 0) {
      this.bankCardOptions = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
      return;
    }

    this.accountingOfficeService.getAccountingOfficeById(parsedOfficeId).pipe(
      take(1),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards'); })
    ).subscribe({
      next: (accountingOffice) => {
        const bankCards = this.mappingService.mapBankCardsFromResponse(accountingOffice?.bankCards);
        this.bankCardOptions = bankCards
          .filter(card => Number(card.bankCardId) > 0)
          .map(card => ({
            value: Number(card.bankCardId),
            label: this.toBankCardOptionLabel(card)
          }));
      },
      error: (err) => {
        console.error('[Receipt] Bank cards API call failed', {
          officeId: parsedOfficeId,
          error: err
        });
        this.bankCardOptions = [];
      }
    });
  }

  loadVendors(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'vendors');
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendors'); })).subscribe({
      next: () => {
        const officeId = Number(this.receipt?.officeId || this.property?.officeId || this.maintenanceOfficeId || 0) || null;
        this.loadVendorsForOffice(officeId);
      },
      error: () => {
        this.vendorOptions = [{ value: this.newVendorOptionValue, label: 'New Vendor' }];
      }
    });
  }

  loadVendorsForOffice(officeId: number | null | undefined): void {
    const parsedOfficeId = Number(officeId);
    const vendorContacts = Number.isFinite(parsedOfficeId) && parsedOfficeId > 0
      ? this.contactService.getAllContactsValue().filter(contact => contact.entityTypeId === EntityType.Vendor && Number(contact.officeId) === parsedOfficeId)
      : [];
    this.vendorOptions = [
      { value: this.newVendorOptionValue, label: 'New Vendor' },
      ...vendorContacts.map(contact => ({
        value: String(contact.contactId || ''),
        label: this.utilityService.getVendorDropdownLabel(contact)
      })).filter(option => option.value.trim().length > 0)
    ];
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

  openReceiptDialog(): void {
    const imageSrc = this.receiptPreviewDataUrl;
    if (!imageSrc) {
      this.toastr.warning('Receipt file is not available.', 'Receipt');
      return;
    }
    if (this.isReceiptPreviewPdf()) {
      const propertyId =
        this.getSelectedPropertyIds().find(id => (id || '').trim().length > 0)
        || (this.selectedPropertyId || '').trim()
        || (this.property?.propertyId || '').trim()
        || null;
      const documentViewUrl = '/' + RouterUrl.replaceTokens(RouterUrl.DocumentView, ['inline-receipt']);
      this.router.navigate([documentViewUrl], {
        queryParams: {
          returnTo: propertyId ? 'maintenance' : 'documentList',
          ...(propertyId ? { propertyId } : {})
        },
        state: {
          inlineDocument: {
            dataUrl: imageSrc,
            contentType: 'application/pdf',
            fileName: this.receiptFileName || 'Receipt.pdf'
          }
        }
      });
      return;
    }
    const data: ImageViewDialogData = { imageSrc, title: 'Receipt' };
    this.dialog.open(ImageViewDialogComponent, {
      data,
      width: '60vw',
      height: '88vh',
      maxWidth: '60vw',
      maxHeight: '88vh',
      panelClass: 'image-view-dialog-panel'
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
    const normalizedReceiptTypeId = split?.receiptTypeId ?? 0;
    const normalizedWorkOrderCode = (split?.workOrderCode || split?.workOrder || '').trim();
    return this.fb.group({
      receiptSplitId: new FormControl(split?.receiptSplitId ?? null),
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '', [Validators.required]),
      description: new FormControl((split?.description || '').trim(), [Validators.required]),
      workOrderId: new FormControl(split?.workOrderId ?? null),
      workOrderCode: new FormControl(normalizedWorkOrderCode),
      workOrder: new FormControl(normalizedWorkOrderCode),
      receiptTypeId: new FormControl(normalizedReceiptTypeId, [Validators.required])
    });
  }

  private validateRequiredSplitFields(): string | null {
    for (let i = 0; i < this.splitsFormArray.length; i++) {
      const row = this.splitsFormArray.at(i) as FormGroup;
      row.markAllAsTouched();

      const amountRaw = this.sanitizeSignedDecimalInput(row.get('amount')?.value?.toString() ?? '').trim();
      const description = (row.get('description')?.value || '').trim();
      const receiptTypeId = row.get('receiptTypeId')?.value;

      if (!amountRaw) return `Split line ${i + 1}: Amount is required.`;
      if (!description) return `Split line ${i + 1}: Description is required.`;
      if (receiptTypeId === null || receiptTypeId === undefined || receiptTypeId === '') return `Split line ${i + 1}: Type is required.`;
    }

    return null;
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
    this.updatePropertyRequirementByReceiptType();
  }

  getPayloadSplitsFromForm(): Split[] {
    return this.splitsFormArray.controls.map(control => {
      const amountRaw = this.sanitizeSignedDecimalInput(control.get('amount')?.value?.toString() ?? '');
      return {
        receiptSplitId: control.get('receiptSplitId')?.value ?? null,
        amount: parseFloat(amountRaw) || 0,
        description: (control.get('description')?.value || '').trim(),
        workOrderId: (control.get('workOrderId')?.value || '').toString().trim() || null,
        workOrderCode: (control.get('workOrderCode')?.value || control.get('workOrder')?.value || '').trim(),
        workOrder: (control.get('workOrderCode')?.value || control.get('workOrder')?.value || '').trim(),
        receiptTypeId: control.get('receiptTypeId')?.value ?? 0
      };
    });
  }

  isOverallBillBankCard(): boolean {
    const rawValue = this.form.get('bankCardId')?.value;
    return Number(rawValue ?? 0) === 0;
  }

  onOverallBankCardChange(): void {
    if (this.isOverallBillBankCard()) {
      this.form.patchValue({ vendorName: null }, { emitEvent: false });
      return;
    }
    this.form.patchValue({ vendorId: null }, { emitEvent: false });
  }

  onOverallVendorSelectionChange(value: string | null | undefined): void {
    const selectedValue = String(value || '').trim();
    if (!selectedValue) {
      this.form.patchValue({ vendorId: null, vendorName: null }, { emitEvent: false });
      return;
    }
    if (selectedValue === this.newVendorOptionValue) {
      this.form.patchValue({ vendorId: null, vendorName: null }, { emitEvent: false });
      this.openNewVendorContactDialog();
      return;
    }
    this.form.patchValue({
      vendorId: selectedValue,
      vendorName: null
    }, { emitEvent: false });
  }

  openNewVendorContactDialog(): void {
    const selectedOfficeId = Number(this.receipt?.officeId || this.property?.officeId || this.maintenanceOfficeId || 0) || null;
    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        compactDialogMode: true,
        entityTypeId: EntityType.Vendor,
        showDialogCancelButton: true,
        ...(selectedOfficeId ? { preselectPropertyOfficeId: selectedOfficeId } : {})
      }
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: { saved?: boolean; contactId?: string; entityTypeId?: number }) => dialogRef.close(result));

    dialogRef.afterClosed().pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string; entityTypeId?: number }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }
      this.contactService.refreshContacts().pipe(take(1)).subscribe({
        next: (contacts: ContactResponse[]) => {
          this.loadVendorsForOffice(selectedOfficeId);
          const vendor = (contacts || []).find(contact => String(contact.contactId || '').trim() === String(result.contactId || '').trim());
          if (!vendor) {
            return;
          }
          this.form.patchValue({
            vendorId: result.contactId,
            vendorName: null
          }, { emitEvent: false });
        },
        error: () => {}
      });
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
    const splitWorkOrder = (
      splitGroup.get('workOrderCode')?.value
      || splitGroup.get('workOrder')?.value
      || ''
    ).trim();
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
      receiptSplitId: split.receiptSplitId ?? null,
      amount: Number(split.amount) || 0,
      description: (split.description || '').trim(),
      workOrderId: (split.workOrderId || '').toString().trim() || null,
      workOrderCode: (split.workOrderCode || split.workOrder || '').trim(),
      workOrder: (split.workOrderCode || split.workOrder || '').trim(),
      receiptTypeId: split.receiptTypeId ?? 0
    }));
  }

  isPropertySelectionRequired(): boolean {
    const splits = this.getPayloadSplitsFromForm();
    if (!splits || splits.length === 0) {
      return true;
    }
    return splits.some(split => Number(split.receiptTypeId) !== ReceiptType.Organization);
  }

  updatePropertyRequirementByReceiptType(): void {
    const propertyIdsControl = this.form.get('propertyIds');
    if (!propertyIdsControl) {
      return;
    }
    if (this.isPropertySelectionRequired()) {
      propertyIdsControl.setValidators([Validators.required]);
    } else {
      propertyIdsControl.clearValidators();
      propertyIdsControl.setErrors(null);
    }
    propertyIdsControl.updateValueAndValidity({ emitEvent: false });
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
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const isNegative = cleaned.startsWith('-');
    const unsigned = cleaned.replace(/-/g, '');
    const parts = unsigned.split('.');
    const numericPortion = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
    return `${isNegative ? '-' : ''}${numericPortion}`;
  }

  getReceiptDateForApi(): string | null {
    const dateValue = this.form.get('receiptDate')?.value;
    return this.utilityService.toDateOnlyJsonString(dateValue);
  }

  normalizeReceiptDate(value: string | null | undefined): string | null {
    return this.utilityService.toDateOnlyJsonString(value);
  }

  getReceiptDateControlValue(value: string | null | undefined): Date {
    return this.utilityService.parseCalendarDateInput(value) ?? new Date();
  }

  toBankCardOptionLabel(card: BankCardResponse): string {
    return (card?.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card);
  }

  hasSplitWorkOrder(splitIndex: number): boolean {
    const workOrderId = (this.splitsFormArray.at(splitIndex)?.get('workOrderId')?.value || '').toString().trim();
    const workOrderCode = this.getSplitWorkOrderCode(splitIndex);
    return workOrderId.length > 0 || workOrderCode.length > 0;
  }

  openWorkOrderFromSplit(splitIndex: number): void {
    const targetWorkOrderId = (this.splitsFormArray.at(splitIndex)?.get('workOrderId')?.value || '').toString().trim();
    const targetWorkOrderCode = this.getSplitWorkOrderCode(splitIndex);
    if (!targetWorkOrderId && !targetWorkOrderCode) {
      return;
    }

    const propertyId =
      this.getSelectedPropertyIds().find(id => (id || '').trim().length > 0)
      || (this.selectedPropertyId || '').trim()
      || (this.property?.propertyId || '').trim()
      || null;
    const officeId = Number(this.receipt?.officeId || this.property?.officeId || 0) || null;

    if (targetWorkOrderId) {
      if (this.embeddedInMaintenance) {
        this.workOrderSelect.emit({
          workOrderId: targetWorkOrderId,
          propertyId
        });
        return;
      }

      if (!propertyId) {
        this.toastr.error('Unable to open work order: property context is missing.', 'Work Order');
        return;
      }

      const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
      this.router.navigate([maintenanceUrl], {
        queryParams: {
          tab: 3,
          workOrderId: targetWorkOrderId
        }
      });
      return;
    }

    this.workOrderService.getWorkOrders(propertyId, officeId).pipe(take(1)).subscribe({
      next: workOrders => {
        const matchingWorkOrder = (workOrders || []).find(
          workOrder => (workOrder.workOrderCode || '').trim().toLowerCase() === targetWorkOrderCode.toLowerCase()
        );
        if (!matchingWorkOrder) {
          this.toastr.warning(`Unable to locate ${targetWorkOrderCode}.`, 'Work Order');
          return;
        }

        const workOrderId = String(matchingWorkOrder.workOrderId || '').trim();
        const resolvedPropertyId = (matchingWorkOrder.propertyId || propertyId || '').trim();
        if (!workOrderId || !resolvedPropertyId) {
          this.toastr.error('Unable to open work order: missing work order context.', 'Work Order');
          return;
        }

        if (this.embeddedInMaintenance) {
          this.workOrderSelect.emit({
            workOrderId,
            propertyId: resolvedPropertyId
          });
          return;
        }

        const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [resolvedPropertyId]);
        this.router.navigate([maintenanceUrl], {
          queryParams: {
            tab: 3,
            workOrderId
          }
        });
      },
      error: () => {
        this.toastr.error('Unable to load work order.', 'Work Order');
      }
    });
  }

  getSplitWorkOrderCode(splitIndex: number): string {
    const row = this.splitsFormArray.at(splitIndex);
    const rawWorkOrder = (
      row?.get('workOrderCode')?.value
      || row?.get('workOrder')?.value
      || ''
    ).toString().trim();
    if (!rawWorkOrder) {
      return '';
    }
    return rawWorkOrder
      .split(',')
      .map(code => code.trim())
      .find(code => code.length > 0) || '';
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
