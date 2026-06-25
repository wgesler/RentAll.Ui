import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, take, takeUntil } from 'rxjs';
import { FileDetails } from '../../documents/models/document.model';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { UtilityService } from '../../../services/utility.service';
import { getReceiptTypes, ReceiptType } from '../models/maintenance-enums';
import { EntityType, getPaymentTermDays } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { NewContactDialogService } from '../../shared/contacts/new-contact-dialog.service';
import { PropertyService } from '../../properties/services/property.service';
import { ReceiptPrefill, ReceiptRequest, ReceiptResponse, Split } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { BankCardResponse } from '../../organizations/models/bank.model';
import { WorkOrderService } from '../services/work-order.service';
import { MappingService } from '../../../services/mapping.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';

/** Form-only sentinel for company-level receipts in the accounting shell (not sent to the API). */
const ACCOUNTING_COMPANY_PROPERTY_ID = '__accounting_company__';

@Component({
  standalone: true,
  selector: 'app-receipt',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './receipt.component.html',
  styleUrl: './receipt.component.scss'
})
export class ReceiptComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() receiptId: string | null = null;
  @Input() prefill: ReceiptPrefill | null = null;
  @Input() agreementLineIdOverride: number | null = null;
  @Input() agreementLineNotesOverride: string | null = null;
  @Input() ticketId: string | null = null;
  @Input() shellContext: 'maintenance' | 'accounting' | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<ReceiptResponse>();
  @Output() saveValidationAttempted = new EventEmitter<void>();
  @Output() propertySelectionRequiredChange = new EventEmitter<boolean>();
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
  amountFocused = false;
  amountEditValue = '';
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
  splitTotalValidationError = false;
  saveValidationHighlightActive = false;
  receiptFileValidationError = false;
  isSyncingInitialSplit = false;
  receiptOfficeInitialized = false;
  propertyOptions: PropertyCodeResponse[] = [];
  allPropertyOptions: PropertyCodeResponse[] = [];
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  receiptTypeOptions = getReceiptTypes();
  bankCardOptions: SearchableSelectOption<number>[] = [];
  showAllOrganizationBankCards = false;
  private lastAppliedShellOfficeId: number | null | undefined;
  readonly moreBankCardsOptionValue = -1;
  expenseAccountOptions: SearchableSelectOption<number>[] = [];

  readonly accountingCompanyPropertyId = ACCOUNTING_COMPANY_PROPERTY_ID;
  lastPropertyIdsValue: string[] = [];
  manualSplitAccountIndexes = new Set<number>();
  appliedPrefillKey: string | null = null;
  activeAgreementLineId: number | null = null;
  activeAgreementLineNotes: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipt']));
  destroy$ = new Subject<void>();

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    receiptService: ReceiptService,
    private newContactDialogService: NewContactDialogService,
    private propertyService: PropertyService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private contactService: ContactService,
    private workOrderService: WorkOrderService,
    private chartOfAccountsService: ChartOfAccountsService,
    private utilityService: UtilityService,
    private pdfThumbnailService: PdfThumbnailService,
    private mappingService: MappingService,
    public formatter: FormatterService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.fb = fb;
    this.authService = authService;
    this.receiptService = receiptService;
  }

  //#region Receipt
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.setupAccountingBillDateHandlers();
    this.setupVendorSelectionHandlers();
    this.applyPropertyInputToForm();

    this.splitsFormArray.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updatePropertyRequirementByReceiptType();
    });
    this.updatePropertyRequirementByReceiptType();

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncPageReadyFromLoadItems());

    this.isAddMode = this.receiptId == null;
    this.syncSelectedPropertyIdFromForm();

    this.form.get('propertyIds')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      const previous = this.lastPropertyIdsValue;
      this.normalizeAccountingCompanyPropertySelection(value, previous);
      this.lastPropertyIdsValue = this.getFormPropertyIds();
      this.syncSelectedPropertyIdFromForm();
      this.syncReceiptOfficeFromSelectedProperties();
      this.updatePropertyRequirementByReceiptType();
      this.form.patchValue({ propertyCode: this.getPropertyCodesDisplay(this.getFormPropertyIds()) }, { emitEvent: false });
      if (!this.isAllOfficesShellScope()) {
        this.loadBankCardsAndVendors();
      }
    });

    this.loadOffices();
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
    this.loadVendors();
    this.loadPropertyCodes();
    this.loadReceipt();
    this.emitPropertySelectionRequiredState();
    if (this.isAddMode) {
      this.applyShellOfficeToReceipt();
      this.applyPrefillIfNeeded();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && (this.isAddMode || this.receiptOfficeInitialized)) {
      this.applyShellOfficeToReceipt();
    }

    if (changes['property']) {
      this.applyPropertyInputToForm();
    }

    if (changes['shellContext'] && !changes['shellContext'].firstChange) {
      this.loadChartOfAccounts();
      this.updateAccountingBillFieldValidators();
      this.updateSplitLineAccountValidators();
      this.cdr.markForCheck();
    }

    if (changes['receiptId'] && !changes['receiptId'].firstChange) {
      this.clearManualSplitAccountOverrides();
      this.isAddMode = this.receiptId == null;
      this.receiptOfficeInitialized = false;
      this.lastAppliedShellOfficeId = undefined;
      this.appliedPrefillKey = null;
      this.activeAgreementLineId = null;
      this.activeAgreementLineNotes = null;
      this.receipt = null;
      if (this.isAddMode) {
        this.clearReceiptLoading();
        this.applyShellOfficeToReceipt();
        this.applyPrefillIfNeeded();
      } else {
        this.loadReceipt();
      }
    }

    if (changes['prefill'] && this.isAddMode) {
      this.applyPrefillIfNeeded();
    }

    if (changes['agreementLineIdOverride'] || changes['agreementLineNotesOverride']) {
      this.applyAgreementLineOverrides();
    }
  }

  saveReceipt(): void {
    this.updatePropertyRequirementByReceiptType();
    this.updateVendorFieldValidators();
    this.saveValidationHighlightActive = true;
    this.saveValidationAttempted.emit();
    this.form.markAllAsTouched();
    this.receiptFileValidationError = !this.hasReceiptFileForSave();

    if (!this.organizationId) {
      this.showValidationErrorToast();
      return;
    }
    if (this.form.invalid) {
      this.showValidationErrorToast();
      return;
    }
    const receiptDateValue = this.getReceiptDateForApi();
    if (!receiptDateValue) {
      this.form.get('receiptDate')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (this.showAccountingBillFields && !this.utilityService.toDateOnlyJsonString(this.form.get('dueDate')?.value)) {
      this.form.get('dueDate')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (this.showAccountingBillFields && !this.utilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value)) {
      this.form.get('accountingPeriod')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }
    if (this.isAddMode && !this.property && this.isPropertySelectionRequired()) {
      this.showValidationErrorToast();
      return;
    }
    const selectedPropertyIds = this.getPayloadPropertyIds()
      .map(propertyId => this.normalizeGuidOrNull(propertyId))
      .filter((propertyId): propertyId is string => !!propertyId);
    if (this.isPropertySelectionRequired() && selectedPropertyIds.length === 0) {
      this.form.get('propertyIds')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    if (!this.hasReceiptFileForSave()) {
      this.receiptFileValidationError = true;
      this.showValidationErrorToast();
      return;
    }

    const sendNewReceipt = this.hasNewReceiptUpload;
    const receiptPathValue = (this.form.get('receiptPath')?.value ?? this.receipt?.receiptPath ?? null)
      ?.toString()
      .trim() || null;
    const amountStr = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    const amountValue = parseFloat(amountStr) || 0;
    const payloadSplits = this.getPayloadSplitsFromForm().map(split => {
      const normalizedWorkOrderId = this.normalizeGuidOrNull(split.workOrderId);
      return {
        ...split,
        workOrderId: normalizedWorkOrderId
      };
    });
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
    if (this.isSplitTotalGreaterThanReceipt(splitTotalAmount, amountValue)) {
      this.splitTotalValidationError = true;
      this.toastr.warning('Split total cannot be greater than the receipt amount.', 'Invalid split total');
      return;
    }
    this.splitTotalValidationError = false;
    const bankCardId = Number(this.form.get('bankCardId')?.value ?? 0);
    const isBill = bankCardId === 0;
    const vendorId = this.normalizeGuidOrNull(this.form.get('vendorId')?.value);
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
      officeId: this.getReceiptOfficeId() ?? 0,
      propertyIds: selectedPropertyIds,
      receiptDate: receiptDateValue,
      dueDate: this.resolveDueDateForPayload(receiptDateValue),
      accountingPeriod: this.resolveAccountingPeriodForPayload(receiptDateValue),
      billNumber: this.resolveBillNumberForPayload(),
      ticketId: this.receipt?.ticketId || this.ticketId || '',
      description: (this.form.get('description')?.value || '').trim(),
      amount: amountValue,
      paidAmount: this.receipt?.paidAmount ?? 0,
      paidDate: this.receipt?.paidDate ?? null,
      bankCardId: isBill ? null : bankCardId,
      vendorId: isBill ? vendorId : null,
      vendorName: isBill ? null : vendorName,
      splits: payloadSplits,
      agreementLineId: this.activeAgreementLineId,
      receiptPath: sendNewReceipt ? null : receiptPathValue,
      fileDetails: sendNewReceipt ? (this.receiptFileDetails ?? null) : null,
      isUtility: !!this.form.get('isUtility')?.value,
      isActive: this.form.get('isActive')?.value
    };

    if (this.receipt?.receiptId) {
      const hasReceiptChange = this.hasNewReceiptUpload ||
        (payload.receiptPath !== (this.receipt.receiptPath ?? null)) ||
        (!!payload.fileDetails !== !!(this.receipt.fileDetails?.file));
      const hasReceiptUpdates = this.receipt
        ? (payload.description !== (this.receipt.description ?? '').trim()) ||
          (this.normalizeReceiptDate(payload.receiptDate) !== this.normalizeReceiptDate(this.receipt.receiptDate)) ||
          (this.normalizeReceiptDate(payload.dueDate) !== this.normalizeReceiptDate(this.receipt.dueDate)) ||
          (this.normalizeReceiptDate(payload.accountingPeriod) !== this.normalizeReceiptDate(this.receipt.accountingPeriod)) ||
          ((payload.billNumber || '').toString().trim() || null) !== ((this.receipt.billNumber || '').toString().trim() || null) ||
          payload.amount !== (this.receipt.amount ?? 0) ||
          (payload.bankCardId ?? null) !== (this.receipt.bankCardId ?? null) ||
          ((payload.vendorId || '').toString().trim() || null) !== ((this.receipt.vendorId || '').toString().trim() || null) ||
          ((payload.vendorName || '').toString().trim() || null) !== ((this.receipt.vendorName || '').toString().trim() || null) ||
          this.havePropertyIdsChanged(payload.propertyIds, this.receipt.propertyIds || []) ||
          this.haveSplitsChanged(payload.splits, this.receipt.splits || []) ||
          payload.isUtility !== (this.receipt.isUtility ?? false) ||
          payload.isActive !== this.receipt.isActive ||
          hasReceiptChange
        : true;
      if (!hasReceiptUpdates) {
        if (this.selectedPropertyId || this.isEmbeddedInShell) {
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
        this.activeAgreementLineId = this.normalizeAgreementLineId(saved.agreementLineId);
        this.activeAgreementLineNotes = this.normalizeAgreementLineNotes(saved.agreementLineNotes);
        this.isAddMode = false;
        this.form.patchValue({
          officeName: saved.officeName || this.property?.officeName || '',
          receiptDate: this.getReceiptDateControlValue(saved.receiptDate),
          dueDate: this.getReceiptDateControlValue(saved.dueDate || saved.receiptDate),
          accountingPeriod: this.getReceiptDateControlValue(saved.accountingPeriod || saved.receiptDate),
          propertyCode: this.getPropertyCodesDisplay(this.toFormPropertyIds(saved.propertyIds || [])) || this.property?.propertyCode || '',
          propertyIds: this.toFormPropertyIds(saved.propertyIds || []),
          description: saved.description || '',
          amount: saved.amount != null ? this.formatter.currency(saved.amount) : '0.00',
          bankCardId: saved.bankCardId ?? 0,
          vendorId: (saved.vendorId || '').trim() || null,
          vendorName: (saved.vendorName || '').trim() || null,
          billNumber: (saved.billNumber || '').trim() || null,
          receiptPath: saved.receiptPath || '',
          isUtility: saved.isUtility ?? false,
          isActive: saved.isActive
        });
        this.replaceSplitLines(saved.splits || []);
        this.lastPropertyIdsValue = this.getFormPropertyIds();
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
        this.saveValidationHighlightActive = false;
        this.receiptFileValidationError = false;
        this.savedEvent.emit(saved);
        this.toastr.success('Receipt saved.', 'Success');
        if (this.selectedPropertyId || this.isEmbeddedInShell) {
          this.back();
        }
      },
      error: (err: HttpErrorResponse) => {
        const apiMessage = typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.error?.title || err.message;
        this.toastr.error(apiMessage || 'Unable to save receipt.', 'Error');
      }
    });
  }

  showValidationErrorToast(): void {
    this.cdr.markForCheck();
    this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
  }

  shouldShowControlError(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }
    return control.invalid && (control.touched || this.saveValidationHighlightActive);
  }

  shouldShowSplitControlError(splitGroup: AbstractControl, controlName: string): boolean {
    return this.shouldShowControlError((splitGroup as FormGroup).get(controlName));
  }

  hasReceiptFileForSave(): boolean {
    return !!(this.receiptFileDetails?.file)
      || !!(this.form.get('receiptPath')?.value)
      || !!(this.receipt?.receiptPath);
  }

  canChooseReceiptFile(): boolean {
    if ((this.property?.propertyId || '').trim().length > 0) {
      return true;
    }
    if (this.isAccountingCompanySelected()) {
      return true;
    }
    if (this.getSelectedPropertyIds().length > 0) {
      return true;
    }
    if (!this.isPropertySelectionRequired()) {
      return true;
    }
    if (this.isAccountingShell && (this.getReceiptOfficeId() ?? 0) > 0) {
      return true;
    }
    return false;
  }
  //#endregion

  //#region Form Methods
  readonly requireNonEmptyArray = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!Array.isArray(value) || value.filter(entry => entry != null && String(entry).trim().length > 0).length === 0) {
      return { required: true };
    }
    return null;
  };

  readonly requireNonEmptyVendorId = (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value || '').toString().trim();
    return value ? null : { required: true };
  };

  buildForm(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form = this.fb.group({
      officeName: new FormControl(''),
      receiptDate: new FormControl<Date | null>(today, [Validators.required]),
      dueDate: new FormControl<Date | null>(new Date(today.getTime())),
      accountingPeriod: new FormControl<Date | null>(new Date(today.getTime())),
      propertyCode: new FormControl(''),
      propertyIds: new FormControl<string[]>([], [this.requireNonEmptyArray]),
      amount: new FormControl('0.00', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      bankCardId: new FormControl<number>(0, [Validators.required]),
      vendorId: new FormControl<string | null>(null),
      vendorName: new FormControl<string | null>(null),
      billNumber: new FormControl<string | null>(null),
      splits: this.fb.array([]),
      receiptPath: new FormControl(''),
      isUtility: new FormControl(false),
      isActive: new FormControl(true)
    });
    this.ensureAtLeastOneSplit();
    this.updateAccountingBillFieldValidators();
    this.updateVendorFieldValidators();
  }

  populateForm(receipt: ReceiptResponse): void {
    this.form.patchValue({
      officeName: receipt.officeName || this.property?.officeName || '',
      receiptDate: this.getReceiptDateControlValue(receipt.receiptDate),
      dueDate: this.getReceiptDateControlValue(receipt.dueDate || receipt.receiptDate),
      accountingPeriod: this.getReceiptDateControlValue(receipt.accountingPeriod || receipt.receiptDate),
      propertyCode: this.getPropertyCodesDisplay(this.toFormPropertyIds(receipt.propertyIds || [])) || this.property?.propertyCode || '',
      propertyIds: this.toFormPropertyIds(receipt.propertyIds || []),
      description: receipt.description || '',
      amount: receipt.amount != null ? this.formatter.currency(receipt.amount) : '0.00',
      bankCardId: receipt.bankCardId ?? 0,
      vendorId: (receipt.vendorId || '').trim() || null,
      vendorName: (receipt.vendorName || '').trim() || null,
      billNumber: (receipt.billNumber || '').trim() || null,
      receiptPath: receipt.receiptPath || '',
      isUtility: receipt.isUtility ?? false,
      isActive: receipt.isActive
    });
    this.replaceSplitLines(receipt.splits || []);
    this.lastPropertyIdsValue = this.getFormPropertyIds();
    this.receiptFileDetails = receipt.fileDetails || null;
    this.hasNewReceiptUpload = false;
    this.originalReceiptPath = receipt.receiptPath ?? null;
    this.splitTotalValidationError = false;
    this.updateAccountingBillFieldValidators();
    this.updateVendorFieldValidators();
    this.applyLegacyBillAccountingDatesIfNeeded();
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
    if (this.isAddMode || !this.receiptId) {
      this.clearReceiptLoading();
      return;
    }

    this.receiptService.getReceipt(this.organizationId, this.receiptId).pipe(take(1), finalize(() => this.clearReceiptLoading())).subscribe({
      next: (receipt: ReceiptResponse) => {
        this.receipt = receipt;
        this.activeAgreementLineId = this.normalizeAgreementLineId(receipt.agreementLineId);
        this.activeAgreementLineNotes = this.normalizeAgreementLineNotes(receipt.agreementLineNotes);
        this.applyAgreementLineOverrides();
        this.receiptOfficeInitialized = true;
        this.populateForm(receipt);
        this.syncSelectedPropertyIdFromForm();
        this.syncBankCardOptionsForCurrentContext();
        this.ensureEditModeBankCardVisible();
        this.cdr.markForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load receipt.', 'Error');
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1)).subscribe({
      next: (properties) => {
        this.allPropertyOptions = (properties || []).filter(p => !!p.propertyId);
        this.applyPropertyOptionsForCurrentOffice();
        if (this.isAddMode && this.selectedPropertyId) {
          this.form.patchValue({ propertyIds: [this.selectedPropertyId] });
        } else if (this.showAccountingCompanyPropertyOption && this.shouldDefaultToAccountingCompany()) {
          this.applyAccountingCompanySelection();
        } else {
          this.form.patchValue({ propertyCode: this.getPropertyCodesDisplay(this.getFormPropertyIds()) });
        }
        this.lastPropertyIdsValue = this.getFormPropertyIds();
        this.updatePropertyRequirementByReceiptType();
      },
      error: () => {
        this.allPropertyOptions = [];
        this.propertyOptions = [];
        this.toastr.error('Unable to load properties.', 'Error');
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.syncBankCardOptionsForCurrentContext();
          this.applyDefaultSplitAccountsForAddMode();
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadVendors(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(() => {
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.cdr.markForCheck();
      }
    });
  }

  syncBankCardOptionsForCurrentContext(): void {
    if (this.isAllOfficesShellScope()) {
      this.loadOrganizationBankCardOptions();
      return;
    }

    const officeId = this.getReceiptOfficeId();
    if (this.showAllOrganizationBankCards) {
      if (officeId) {
        if (!this.bankCardOptions.length) {
          this.loadOfficeBankCardOptions(officeId);
        }
        this.appendOtherOfficeBankCardOptions();
        return;
      }
      this.loadOrganizationBankCardOptions();
      return;
    }

    if (officeId) {
      this.loadOfficeBankCardOptions(officeId);
      return;
    }

    this.bankCardOptions = [];
  }

  resetBankCardsToOfficeScope(): void {
    this.showAllOrganizationBankCards = false;
    if (this.form) {
      this.form.patchValue({ bankCardId: 0 }, { emitEvent: false });
      this.onOverallBankCardChange();
    }
    this.syncBankCardOptionsForCurrentContext();
    this.cdr.markForCheck();
  }

  ensureEditModeBankCardVisible(): void {
    if (this.isAddMode || !this.form) {
      return;
    }

    const selectedBankCardId = Number(this.form.get('bankCardId')?.value ?? 0);
    if (!Number.isFinite(selectedBankCardId) || selectedBankCardId <= 0) {
      return;
    }

    if (this.bankCardOptions.some(option => option.value === selectedBankCardId)) {
      return;
    }

    this.showAllOrganizationBankCards = true;
    this.syncBankCardOptionsForCurrentContext();
  }

  loadBankCardsAndVendors(): void {
    this.syncBankCardOptionsForCurrentContext();
    this.applyLegacyBillAccountingDatesIfNeeded();
    this.loadSplitAccountsForCurrentOffice();
    this.applyPropertyInputToForm();
    this.cdr.markForCheck();
  }

  loadChartOfAccounts(): void {
    if (!this.isAccountingShell) {
      this.expenseAccountOptions = [];
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.loadSplitAccountsForCurrentOffice();
      this.cdr.markForCheck();
    });
  }

  loadSplitAccountsForCurrentOffice(): void {
    if (!this.isAccountingShell) {
      this.expenseAccountOptions = [];
      return;
    }

    const officeId = this.getReceiptOfficeId();
    if (!officeId) {
      this.expenseAccountOptions = [];
      return;
    }

    this.expenseAccountOptions = (this.chartOfAccountsService.getChartOfAccountsForOffice(officeId) || [])
      .map(account => ({
        value: account.accountId,
        label: this.utilityService.getChartOfAccountDropdownLabel(account)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    const splitAccountIds = this.splitsFormArray.controls
      .map(control => Number(control.get('chartOfAccountId')?.value ?? 0))
      .filter(accountId => Number.isFinite(accountId) && accountId > 0);
    const fallbackLabels = new Map<number, string>();
    (this.receipt?.splits || []).forEach(split => {
      const accountId = Number(split.chartOfAccountId ?? 0);
      if (accountId > 0 && split.chartOfAccountDisplayName) {
        fallbackLabels.set(accountId, split.chartOfAccountDisplayName.trim());
      }
    });

    splitAccountIds.forEach(accountId => {
      if (this.expenseAccountOptions.some(option => option.value === accountId)) {
        return;
      }
      const fallbackLabel = fallbackLabels.get(accountId) || `Account ${accountId}`;
      this.expenseAccountOptions = [...this.expenseAccountOptions, { value: accountId, label: fallbackLabel }]
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    });

    this.applyDefaultSplitAccountsForAddMode();
  }

  loadOfficeBankCardOptions(officeId: number | null | undefined): void {
    const parsedOfficeId = Number(officeId);
    if (!parsedOfficeId || parsedOfficeId <= 0) {
      this.bankCardOptions = [];
      return;
    }

    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === parsedOfficeId) ?? null;
    const bankCards = this.mappingService.mapBankCardsFromResponse(accountingOffice?.bankCards);
    this.bankCardOptions = bankCards
      .filter(card => Number(card.bankCardId) > 0)
      .map(card => ({
        value: Number(card.bankCardId),
        label: this.toBankCardOptionLabel(card)
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
  }

  loadOrganizationBankCardOptions(): void {
    const byId = new Map<number, SearchableSelectOption<number>>();
    (this.accountingOffices || []).forEach(office => {
      const bankCards = this.mappingService.mapBankCardsFromResponse(office.bankCards);
      bankCards
        .filter(card => Number(card.bankCardId) > 0)
        .forEach(card => {
          const bankCardId = Number(card.bankCardId);
          if (!byId.has(bankCardId)) {
            byId.set(bankCardId, {
              value: bankCardId,
              label: this.toBankCardOptionLabel(card)
            });
          }
        });
    });
    this.bankCardOptions = Array.from(byId.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })
    );
  }

  appendOtherOfficeBankCardOptions(): void {
    const currentOfficeId = this.getReceiptOfficeId();
    const existingIds = new Set(this.bankCardOptions.map(option => option.value));
    const additionalOptions: SearchableSelectOption<number>[] = [];

    (this.accountingOffices || []).forEach(office => {
      const officeId = Number(office.officeId);
      if (currentOfficeId && officeId === currentOfficeId) {
        return;
      }

      const bankCards = this.mappingService.mapBankCardsFromResponse(office.bankCards);
      bankCards
        .filter(card => Number(card.bankCardId) > 0)
        .forEach(card => {
          const bankCardId = Number(card.bankCardId);
          if (!existingIds.has(bankCardId)) {
            existingIds.add(bankCardId);
            additionalOptions.push({
              value: bankCardId,
              label: this.toBankCardOptionLabel(card)
            });
          }
        });
    });

    if (additionalOptions.length > 0) {
      this.bankCardOptions = [...this.bankCardOptions, ...additionalOptions];
    }
  }
  //#endregion

  //#region Receipt File Methods
  openReceiptPicker(fileInput: HTMLInputElement): void {
    if (!this.canChooseReceiptFile()) {
      return;
    }
    fileInput.click();
  }

  async onReceiptSelected(event: Event): Promise<void> {
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file || !this.canChooseReceiptFile()) {
      return;
    }

    // Show preview/thumbnail immediately from the selected file first.
    const immediatePreviewDataUrl = await this.readSelectedFilePreviewDataUrl(file);
    if (immediatePreviewDataUrl) {
      this.receiptPreviewDataUrl = immediatePreviewDataUrl;
      this.setReceiptPdfThumbnail(immediatePreviewDataUrl, file.type || '');
      this.receiptFileName = file.name;
      this.hasNewReceiptUpload = true;
      this.receiptFileValidationError = false;
      this.form.patchValue({ receiptPath: '' });
      this.cdr.detectChanges();
    }

    const payload = await this.utilityService.buildOptimizedUploadPayload(file);
    this.receiptFileDetails = payload.fileDetails;
    this.receiptPreviewDataUrl = payload.fileDetails.dataUrl;
    this.setReceiptPdfThumbnail(payload.fileDetails.dataUrl, payload.fileDetails.contentType || file.type || '');
    this.receiptFileName = payload.fileDetails.fileName;
    this.hasNewReceiptUpload = true;
    this.receiptFileValidationError = false;
    this.form.patchValue({ receiptPath: '' });
    this.cdr.detectChanges();

    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      inputElement.value = '';
    }
  }

  readSelectedFilePreviewDataUrl(file: File): Promise<string | null> {
    return new Promise(resolve => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch {
        resolve(null);
      }
    });
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

    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) {
      this.toastr.warning('Please allow pop-ups to open receipts in a new tab.', 'Receipt');
      return;
    }

    receiptWindow.document.title = 'Receipt';
    this.renderReceiptInWindow(receiptWindow, imageSrc);
  }

  renderReceiptInWindow(receiptWindow: Window, imageSrc: string): void {
    const isPdf = /^data:application\/pdf/i.test(imageSrc);
    const renderSrc = this.toBlobObjectUrl(imageSrc) ?? imageSrc;
    const receiptDocument = receiptWindow.document;
    receiptDocument.open();
    receiptDocument.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          <style>
            html, body { height: 100%; margin: 0; background: #f5f6f8; }
            .receipt-frame { width: 100%; height: 100%; border: 0; background: #fff; }
            .receipt-image-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            .receipt-image { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          ${isPdf
            ? '<iframe id="receipt-frame" class="receipt-frame" title="Receipt PDF"></iframe>'
            : '<div class="receipt-image-wrap"><img id="receipt-image" class="receipt-image" alt="Receipt image" /></div>'}
        </body>
      </html>
    `);
    receiptDocument.close();

    const releaseUrl = () => {
      if (renderSrc.startsWith('blob:')) {
        URL.revokeObjectURL(renderSrc);
      }
    };
    receiptWindow.addEventListener('beforeunload', releaseUrl);

    if (isPdf) {
      const frame = receiptDocument.getElementById('receipt-frame') as HTMLIFrameElement | null;
      if (frame) {
        frame.src = renderSrc;
      }
      return;
    }

    const image = receiptDocument.getElementById('receipt-image') as HTMLImageElement | null;
    if (image) {
      image.src = renderSrc;
      image.addEventListener('load', releaseUrl, { once: true });
      image.addEventListener('error', releaseUrl, { once: true });
    }
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

  toBlobObjectUrl(src: string): string | null {
    if (!src || !src.startsWith('data:')) {
      return null;
    }
    try {
      const dataUrlParts = src.split(',');
      if (dataUrlParts.length < 2) {
        return null;
      }
      const header = dataUrlParts[0];
      const data = dataUrlParts.slice(1).join(',');
      const mimeMatch = header.match(/^data:([^;]+)/i);
      const mimeType = mimeMatch?.[1] || 'application/octet-stream';
      const isBase64 = /;base64/i.test(header);
      const binaryString = isBase64 ? atob(data) : decodeURIComponent(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  //#endregion

  //#region Accounting Bill Date Methods
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

  resolveDueDateForPayload(receiptDate: string): string {
    if (this.isOverallBillBankCard()) {
      return this.utilityService.toDateOnlyJsonString(this.form.get('dueDate')?.value) ?? receiptDate;
    }
    return receiptDate;
  }

  resolveAccountingPeriodForPayload(receiptDate: string): string {
    if (this.isOverallBillBankCard()) {
      const explicit = this.utilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value);
      if (explicit) {
        return explicit;
      }
      return receiptDate;
    }
    const match = /^(\d{4})-(\d{2})/.exec(receiptDate);
    return match ? `${match[1]}-${match[2]}-01` : receiptDate;
  }

  resolveBillNumberForPayload(): string | null {
    if (!this.isOverallBillBankCard() && this.shellContext !== 'maintenance') {
      return null;
    }
    const billNumber = (this.form.get('billNumber')?.value || '').toString().trim();
    return billNumber.length > 0 ? billNumber : null;
  }

  setupAccountingBillDateHandlers(): void {
    this.form.get('receiptDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(receiptDateValue => {
      if (!this.isAccountingShell) {
        return;
      }
      if (this.showAccountingBillFields) {
        this.applyCalculatedDueDate();
      }
      if (!this.isAddMode) {
        return;
      }
      const parsedReceiptDate = this.utilityService.parseCalendarDateInput(receiptDateValue);
      if (!parsedReceiptDate) {
        return;
      }
      parsedReceiptDate.setHours(0, 0, 0, 0);
      this.form.get('accountingPeriod')?.setValue(new Date(parsedReceiptDate.getTime()), { emitEvent: false });
    });
  }

  setupVendorSelectionHandlers(): void {
    this.form.get('vendorId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.newContactDialogService.isNewContactOptionValue(value, EntityType.Vendor)) {
        this.form.patchValue({ vendorId: null, vendorName: null }, { emitEvent: false });
        this.openNewVendorContactDialog();
        return;
      }
      if (this.showAccountingBillFields) {
        this.applyCalculatedDueDate();
      }
    });
  }

  calculateDueDateFromPaymentTerms(
    receiptDate: Date | null | undefined,
    paymentTermsId: number | null | undefined
  ): Date | null {
    const parsedReceiptDate = this.utilityService.parseCalendarDateInput(receiptDate);
    if (!parsedReceiptDate) {
      return null;
    }
    parsedReceiptDate.setHours(0, 0, 0, 0);
    const dueDate = new Date(parsedReceiptDate.getTime());
    dueDate.setDate(dueDate.getDate() + getPaymentTermDays(paymentTermsId));
    return dueDate;
  }

  getSelectedVendorPaymentTermsId(): number | null {
    const vendorId = (this.form.get('vendorId')?.value || '').toString().trim();
    if (!vendorId) {
      return null;
    }
    const vendor = this.contactService.getAllContactsValue().find(contact => String(contact.contactId || '').trim() === vendorId);
    return vendor?.paymentTermsId ?? null;
  }

  applyCalculatedDueDate(): void {
    if (!this.showAccountingBillFields) {
      return;
    }
    const dueDate = this.calculateDueDateFromPaymentTerms(
      this.form.get('receiptDate')?.value,
      this.getSelectedVendorPaymentTermsId()
    );
    if (!dueDate) {
      return;
    }
    this.form.get('dueDate')?.setValue(dueDate, { emitEvent: false });
  }

  getDefaultBillAccountingPeriodFromReceiptDate(receiptDate: string | null | undefined): string | null {
    const normalizedReceiptDate = this.normalizeReceiptDate(receiptDate);
    if (!normalizedReceiptDate) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})/.exec(normalizedReceiptDate);
    return match ? `${match[1]}-${match[2]}-01` : normalizedReceiptDate;
  }

  hasLegacyBillDueDate(receipt: ReceiptResponse, paymentTermsId: number | null): boolean {
    if (Number(receipt.bankCardId ?? 0) !== 0) {
      return false;
    }

    const receiptDate = this.normalizeReceiptDate(receipt.receiptDate);
    if (!receiptDate) {
      return false;
    }

    const storedDueDate = this.normalizeReceiptDate(receipt.dueDate) ?? receiptDate;
    if (storedDueDate !== receiptDate) {
      return false;
    }

    const calculatedDueDate = this.normalizeReceiptDate(
      this.utilityService.toDateOnlyJsonString(
        this.calculateDueDateFromPaymentTerms(
          this.getReceiptDateControlValue(receipt.receiptDate),
          paymentTermsId
        )
      )
    );
    return !!calculatedDueDate && calculatedDueDate !== storedDueDate;
  }

  hasLegacyBillAccountingPeriod(receipt: ReceiptResponse): boolean {
    if (Number(receipt.bankCardId ?? 0) !== 0) {
      return false;
    }

    const receiptDate = this.normalizeReceiptDate(receipt.receiptDate);
    if (!receiptDate) {
      return false;
    }

    const storedAccountingPeriod = this.normalizeReceiptDate(receipt.accountingPeriod);
    const defaultAccountingPeriod = this.getDefaultBillAccountingPeriodFromReceiptDate(receiptDate);
    return !!storedAccountingPeriod
      && !!defaultAccountingPeriod
      && storedAccountingPeriod === defaultAccountingPeriod
      && storedAccountingPeriod !== receiptDate;
  }

  applyLegacyBillAccountingDatesIfNeeded(): void {
    if (this.isAddMode || !this.receipt || !this.isOverallBillBankCard()) {
      return;
    }

    const paymentTermsId = this.getSelectedVendorPaymentTermsId();
    const receiptDateControl = this.getReceiptDateControlValue(this.receipt.receiptDate);
    receiptDateControl.setHours(0, 0, 0, 0);
    let updated = false;

    if (this.hasLegacyBillDueDate(this.receipt, paymentTermsId)) {
      const dueDate = this.calculateDueDateFromPaymentTerms(receiptDateControl, paymentTermsId);
      if (dueDate) {
        this.form.get('dueDate')?.setValue(dueDate, { emitEvent: false });
        updated = true;
      }
    }

    if (this.hasLegacyBillAccountingPeriod(this.receipt)) {
      this.form.get('accountingPeriod')?.setValue(new Date(receiptDateControl.getTime()), { emitEvent: false });
      updated = true;
    }

    if (updated) {
      this.cdr.markForCheck();
    }
  }

  normalizeReceiptDate(value: string | null | undefined): string | null {
    return this.utilityService.toDateOnlyJsonString(value);
  }

  normalizeGuidOrNull(value: unknown): string | null {
    const normalized = (value || '').toString().trim();
    if (!normalized) {
      return null;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
      ? normalized
      : null;
  }

  getReceiptDateControlValue(value: string | null | undefined): Date {
    return this.utilityService.parseCalendarDateInput(value) ?? new Date();
  }
  //#endregion

  //#region Form Response Methods
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

  onOverallDescriptionBlur(): void {
    if (this.amountFocused) {
      return;
    }
    this.syncInitialSplitWithOverallIfNeeded();
  }
  //#endregion

  //#region Split Response Methods
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

  get splitsFormArray(): FormArray {
    return this.form.get('splits') as FormArray;
  }

  onSplitAccountSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const parsed = Number(value ?? 0);
    const accountId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const row = this.splitsFormArray.at(splitIndex);
    row?.get('chartOfAccountId')?.setValue(accountId);
    row?.get('chartOfAccountId')?.markAsTouched();
    this.markSplitAccountAsManual(splitIndex);
    this.cdr.markForCheck();
  }

  onSplitReceiptTypeChange(splitIndex: number): void {
    this.applyDefaultSplitAccountFromReceiptType(splitIndex);
    this.updatePropertyRequirementByReceiptType();
  }

  getAccountingOfficeForReceiptOffice(): AccountingOfficeResponse | null {
    const officeId = this.getReceiptOfficeId();
    if (!officeId) {
      return null;
    }
    return (this.accountingOffices || []).find(office => office.officeId === officeId) ?? null;
  }

  normalizeOptionalAccountId(value: number | null | undefined): number | null {
    const accountId = Number(value ?? 0);
    return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
  }

  clearManualSplitAccountOverrides(): void {
    this.manualSplitAccountIndexes.clear();
  }

  markSplitAccountAsManual(splitIndex: number): void {
    this.manualSplitAccountIndexes.add(splitIndex);
  }

  isSplitAccountManuallySet(splitIndex: number): boolean {
    return this.manualSplitAccountIndexes.has(splitIndex);
  }

  shiftManualSplitAccountIndexesAfterRemove(removedIndex: number): void {
    const nextManualSplitAccountIndexes = new Set<number>();
    this.manualSplitAccountIndexes.forEach(index => {
      if (index < removedIndex) {
        nextManualSplitAccountIndexes.add(index);
      } else if (index > removedIndex) {
        nextManualSplitAccountIndexes.add(index - 1);
      }
    });
    this.manualSplitAccountIndexes = nextManualSplitAccountIndexes;
  }

  resolveDefaultChartOfAccountIdForReceiptType(receiptTypeId: number | null | undefined): number | null {
    if (!this.isAccountingShell) {
      return null;
    }

    const accountingOffice = this.getAccountingOfficeForReceiptOffice();
    if (!accountingOffice) {
      return null;
    }

    switch (Number(receiptTypeId)) {
      case ReceiptType.Tenant:
        return this.normalizeOptionalAccountId(accountingOffice.defaultTenantExpAccountId);
      case ReceiptType.Owner:
        return this.normalizeOptionalAccountId(accountingOffice.defaultOwnerExpAccountId);
      case ReceiptType.Organization:
        return this.normalizeOptionalAccountId(accountingOffice.defaultCompanyExpAccountId);
      default:
        return null;
    }
  }

  applyDefaultSplitAccountFromReceiptType(splitIndex: number): void {
    if (!this.isAccountingShell || this.isSplitAccountManuallySet(splitIndex)) {
      return;
    }

    const row = this.splitsFormArray.at(splitIndex);
    if (!row) {
      return;
    }

    const accountId = this.resolveDefaultChartOfAccountIdForReceiptType(row.get('receiptTypeId')?.value);
    row.get('chartOfAccountId')?.setValue(accountId, { emitEvent: false });
    this.cdr.markForCheck();
  }

  applyDefaultSplitAccountsForAddMode(): void {
    if (!this.isAddMode || !this.isAccountingShell) {
      return;
    }

    for (let splitIndex = 0; splitIndex < this.splitsFormArray.length; splitIndex++) {
      if (this.isSplitAccountManuallySet(splitIndex)) {
        continue;
      }

      const row = this.splitsFormArray.at(splitIndex);
      const currentAccountId = Number(row?.get('chartOfAccountId')?.value ?? 0);
      if (Number.isFinite(currentAccountId) && currentAccountId > 0) {
        continue;
      }

      this.applyDefaultSplitAccountFromReceiptType(splitIndex);
    }
  }

  addSplitLine(): void {
    this.splitsFormArray.push(this.createSplitFormGroup());
    this.updateSplitLineAccountValidators();
    if (this.isAccountingShell) {
      this.applyDefaultSplitAccountFromReceiptType(this.splitsFormArray.length - 1);
    }
  }

  removeSplitLine(index: number): void {
    if (this.splitsFormArray.length <= 1 || index < 0 || index >= this.splitsFormArray.length) {
      return;
    }
    this.shiftManualSplitAccountIndexesAfterRemove(index);
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
    return this.isSplitTotalGreaterThanReceipt(this.getDisplayedSplitTotal(), this.getReceiptAmountValue());
  }

  createSplitFormGroup(split?: Partial<Split>): FormGroup {
    const amount = Number(split?.amount);
    const normalizedReceiptTypeId = split?.receiptTypeId ?? 0;
    const normalizedWorkOrderCode = (split?.workOrderCode || split?.workOrder || '').trim();
    const rawSplit = split as (Partial<Split> & Record<string, unknown>) | undefined;
    const normalizedChartOfAccountId = Number(
      rawSplit?.chartOfAccountId
      ?? rawSplit?.['ChartOfAccountId']
      ?? 0
    );
    const resolvedChartOfAccountId = Number.isFinite(normalizedChartOfAccountId) && normalizedChartOfAccountId > 0
      ? normalizedChartOfAccountId
      : (this.isAccountingShell
        ? this.resolveDefaultChartOfAccountIdForReceiptType(normalizedReceiptTypeId)
        : null);
    return this.fb.group({
      receiptSplitId: new FormControl(split?.receiptSplitId ?? null),
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '', [Validators.required]),
      description: new FormControl((split?.description || '').trim(), [Validators.required]),
      workOrderId: new FormControl(split?.workOrderId ?? null),
      workOrderCode: new FormControl(normalizedWorkOrderCode),
      workOrder: new FormControl(normalizedWorkOrderCode),
      chartOfAccountId: new FormControl(resolvedChartOfAccountId),
      receiptTypeId: new FormControl(normalizedReceiptTypeId, [Validators.required])
    });
  }

  validateRequiredSplitFields(): string | null {
    for (let i = 0; i < this.splitsFormArray.length; i++) {
      const row = this.splitsFormArray.at(i) as FormGroup;
      row.markAllAsTouched();

      const amountRaw = this.sanitizeSignedDecimalInput(row.get('amount')?.value?.toString() ?? '').trim();
      const description = (row.get('description')?.value || '').trim();
      const receiptTypeId = row.get('receiptTypeId')?.value;

      if (!amountRaw) return `Split line ${i + 1}: Amount is required.`;
      if (!description) return `Split line ${i + 1}: Description is required.`;
      if (receiptTypeId === null || receiptTypeId === undefined || receiptTypeId === '') return `Split line ${i + 1}: Type is required.`;
      if (this.showSplitAccountColumn) {
        const chartOfAccountId = Number(row.get('chartOfAccountId')?.value ?? 0);
        if (!Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
          return `Split line ${i + 1}: Account is required.`;
        }
      }
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
    this.clearManualSplitAccountOverrides();
    this.splitsFormArray.clear();
    (splits || []).forEach(split => this.splitsFormArray.push(this.createSplitFormGroup(split)));
    this.ensureAtLeastOneSplit();
    this.updateSplitLineAccountValidators();
    this.updatePropertyRequirementByReceiptType();
  }

  getPayloadSplitsFromForm(): Split[] {
    // Maintenance preserves existing split account values when present; accounting sends them for bill and card modes.
    const includeChartOfAccount = true;
    return this.splitsFormArray.controls.map(control => {
      const amountRaw = this.sanitizeSignedDecimalInput(control.get('amount')?.value?.toString() ?? '');
      const chartOfAccountId = Number(control.get('chartOfAccountId')?.value ?? 0);
      return {
        receiptSplitId: control.get('receiptSplitId')?.value ?? null,
        amount: parseFloat(amountRaw) || 0,
        description: (control.get('description')?.value || '').trim(),
        workOrderId: (control.get('workOrderId')?.value || '').toString().trim() || null,
        workOrderCode: (control.get('workOrderCode')?.value || control.get('workOrder')?.value || '').trim(),
        workOrder: (control.get('workOrderCode')?.value || control.get('workOrder')?.value || '').trim(),
        chartOfAccountId: includeChartOfAccount && Number.isFinite(chartOfAccountId) && chartOfAccountId > 0
          ? chartOfAccountId
          : null,
        receiptTypeId: control.get('receiptTypeId')?.value ?? 0
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
    const hasUserEditedSplitAmount = splitAmountControl?.dirty === true;
    const shouldSyncSplitAmountToOverall = isSplitAmountEmptyOrZero || !hasUserEditedSplitAmount;
    if (shouldSyncSplitAmountToOverall && overallAmount) {
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

  isSplitTotalGreaterThanReceipt(splitTotal: number, receiptAmount: number): boolean {
    return this.toCurrencyCents(splitTotal) > this.toCurrencyCents(receiptAmount);
  }
 
  haveSplitsChanged(nextSplits: Split[], currentSplits: Split[]): boolean {
    return JSON.stringify(this.normalizeSplits(nextSplits)) !== JSON.stringify(this.normalizeSplits(currentSplits));
  }

  normalizeSplits(splits: Split[]): Split[] {
    return (splits || []).map(split => {
      const chartOfAccountId = this.mappingService.readSplitChartOfAccountId(split);
      return {
        receiptSplitId: split.receiptSplitId ?? null,
        amount: Number(split.amount) || 0,
        description: (split.description || '').trim(),
        workOrderId: (split.workOrderId || '').toString().trim() || null,
        workOrderCode: (split.workOrderCode || split.workOrder || '').trim(),
        workOrder: (split.workOrderCode || split.workOrder || '').trim(),
        chartOfAccountId,
        receiptTypeId: split.receiptTypeId ?? 0
      };
    });
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
    const officeId = this.getReceiptOfficeId();

    if (targetWorkOrderId) {
      this.workOrderSelect.emit({
        workOrderId: targetWorkOrderId,
        propertyId
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

        this.workOrderSelect.emit({
          workOrderId,
          propertyId: resolvedPropertyId
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

  //#region Bank Card Methods
  isOverallBillBankCard(): boolean {
    const rawValue = this.form.get('bankCardId')?.value;
    return Number(rawValue ?? 0) === 0;
  }

  onOverallBankCardChange(): void {
    if (this.isOverallBillBankCard()) {
      this.form.patchValue({ vendorName: null }, { emitEvent: false });
      this.applyCalculatedDueDate();
    } else {
      const patchValue: { vendorId: null; billNumber?: null } = { vendorId: null };
      if (this.isAccountingShell) {
        patchValue.billNumber = null;
      }
      this.form.patchValue(patchValue, { emitEvent: false });
    }
    this.updateSplitLineAccountValidators();
    this.updateAccountingBillFieldValidators();
    this.updateVendorFieldValidators();
    this.loadSplitAccountsForCurrentOffice();
    this.cdr.markForCheck();
  }

  onOverallBankCardSelectionChange(value: string | number | null | undefined): void {
    const normalized = Number(value ?? 0);
    if (normalized === this.moreBankCardsOptionValue) {
      this.showAllOrganizationBankCards = true;
      this.syncBankCardOptionsForCurrentContext();
      this.cdr.markForCheck();
      return;
    }

    this.form.patchValue({
      bankCardId: Number.isFinite(normalized) ? normalized : 0
    }, { emitEvent: false });
    this.onOverallBankCardChange();
  }
  
  get overallBankCardOptions(): SearchableSelectOption<number>[] {
    const options: SearchableSelectOption<number>[] = [{ value: 0, label: 'Bill' }, ...(this.bankCardOptions || [])];
    if (!this.showAllOrganizationBankCards && !this.isAllOfficesShellScope() && this.getReceiptOfficeId()) {
      options.push({ value: this.moreBankCardsOptionValue, label: 'More...' });
    }
    return options;
  }

  toBankCardOptionLabel(card: BankCardResponse): string {
    return (card?.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card);
  }
  //#endregion

  //#region Account Methods
  get isAccountingShell(): boolean {
    return this.shellContext === 'accounting';
  }

  get showSplitAccountColumn(): boolean {
    return this.isAccountingShell;
  }

  get showAccountingBillFields(): boolean {
    return this.showSplitAccountColumn;
  }

  updateAccountingBillFieldValidators(): void {
    const dueDateControl = this.form.get('dueDate');
    const accountingPeriodControl = this.form.get('accountingPeriod');
    if (!dueDateControl || !accountingPeriodControl) {
      return;
    }
    if (this.showAccountingBillFields) {
      dueDateControl.setValidators([Validators.required]);
      accountingPeriodControl.setValidators([Validators.required]);
    } else {
      dueDateControl.clearValidators();
      accountingPeriodControl.clearValidators();
    }
    dueDateControl.updateValueAndValidity({ emitEvent: false });
    accountingPeriodControl.updateValueAndValidity({ emitEvent: false });
  }

  updateSplitLineAccountValidators(): void {
    this.splitsFormArray.controls.forEach(control => {
      const accountControl = control.get('chartOfAccountId');
      if (!accountControl) {
        return;
      }
      if (this.showSplitAccountColumn) {
        accountControl.setValidators([Validators.required]);
      } else {
        accountControl.clearValidators();
      }
      accountControl.updateValueAndValidity({ emitEvent: false });
    });
  }
  //#endregion

  //#region Vendor Methods
  get vendorContactsForOffice(): ContactResponse[] {
    if (this.isAllOfficesShellScope()) {
      return this.contactService
        .getAllContactsValue()
        .filter(contact => contact.entityTypeId === EntityType.Vendor);
    }

    const officeId = this.getReceiptOfficeId();
    if (!officeId) {
      return [];
    }

    return this.contactService
      .getAllContactsValue()
      .filter(contact =>
        contact.entityTypeId === EntityType.Vendor
        && this.utilityService.contactHasOfficeAccess(contact, officeId));
  }

  get vendorOptions(): SearchableSelectOption<string>[] {
    if (this.isAllOfficesShellScope()) {
      const byId = new Map<string, SearchableSelectOption<string>>();
      this.vendorContactsForOffice.forEach(contact => {
        const contactId = String(contact.contactId || '').trim();
        if (!contactId || byId.has(contactId)) {
          return;
        }
        byId.set(contactId, {
          value: contactId,
          label: this.utilityService.getVendorDropdownLabel(contact)
        });
      });

      return [
        this.newContactDialogService.buildSearchableSelectOption(EntityType.Vendor),
        ...Array.from(byId.values()).sort((left, right) =>
          left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
      ];
    }

    return [
      this.newContactDialogService.buildSearchableSelectOption(EntityType.Vendor),
      ...this.vendorContactsForOffice.map(contact => ({
        value: String(contact.contactId || ''),
        label: this.utilityService.getVendorDropdownLabel(contact)
      })).filter(option => option.value.trim().length > 0)
    ];
  }

  get overallVendorOptions(): SearchableSelectOption<string>[] {
    return [{ value: '', label: '' }, ...this.vendorOptions];
  }

  onOverallVendorSelectionChange(value: string | null | undefined): void {
    const control = this.form.get('vendorId');
    const normalized = value == null || value === '' ? null : String(value);
    control?.setValue(normalized);
    control?.markAsTouched();
    control?.markAsDirty();
    if (normalized && !this.newContactDialogService.isNewContactOptionValue(normalized, EntityType.Vendor)) {
      this.form.patchValue({ vendorName: null }, { emitEvent: false });
    }
  }

  openNewVendorContactDialog(): void {
    this.newContactDialogService.openNewContactDialog({
      entityTypeId: EntityType.Vendor,
      preselectPropertyOfficeId: this.getReceiptOfficeId()
    }).pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }
      this.form.patchValue({
        vendorId: result.contactId,
        vendorName: null
      }, { emitEvent: false });
      this.applyCalculatedDueDate();
      this.cdr.markForCheck();
    });
  }
  //#endregion

  //#region Property Selection Methods
  syncReceiptOfficeFromSelectedProperties(): void {
    const propertyIds = this.getSelectedPropertyIds();
    const firstProperty = propertyIds
      .map(propertyId => this.propertyOptions.find(property => property.propertyId === propertyId))
      .find(property => !!property);
    const propertyOfficeId = this.normalizeOfficeId(firstProperty?.officeId ?? this.property?.officeId);
    if (propertyOfficeId) {
      this.setReceiptOfficeId(propertyOfficeId);
    }
  }

  applyPropertyInputToForm(): void {
    if (this.property?.propertyId) {
      this.selectedPropertyId = this.property.propertyId;
    }
    if (!this.form) {
      const propertyOfficeId = this.normalizeOfficeId(this.property?.officeId);
      if (propertyOfficeId) {
        this.setReceiptOfficeId(propertyOfficeId);
      }
      return;
    }
    this.syncReceiptOfficeFromSelectedProperties();
    if (!this.isAddMode) {
      return;
    }
    if (this.showAccountingCompanyPropertyOption && !this.property?.propertyId) {
      this.applyAccountingCompanySelection();
      return;
    }
    if (!this.selectedPropertyId) {
      return;
    }
    const officeName = this.getOfficeNameForOfficeId(this.getReceiptOfficeId()) || this.property?.officeName || '';
    this.form.patchValue({
      officeName,
      propertyCode: this.property?.propertyCode || this.getPropertyCodesDisplay([this.selectedPropertyId]),
      propertyIds: [this.selectedPropertyId]
    }, { emitEvent: false });
    this.lastPropertyIdsValue = this.getFormPropertyIds();
  }

  syncSelectedPropertyIdFromForm(): void {
    const fromForm = this.getSelectedPropertyIds()[0] ?? null;
    this.selectedPropertyId = fromForm ?? (this.isAccountingCompanySelected() ? null : this.property?.propertyId ?? null);
  }

  get showAccountingCompanyPropertyOption(): boolean {
    return this.shellContext === 'accounting';
  }

  isAccountingCompanySelected(): boolean {
    return this.showAccountingCompanyPropertyOption
      && this.getFormPropertyIds().includes(ACCOUNTING_COMPANY_PROPERTY_ID);
  }

  shouldDefaultToAccountingCompany(): boolean {
    if (!this.showAccountingCompanyPropertyOption) {
      return false;
    }
    if (this.getSelectedPropertyIds().length > 0) {
      return false;
    }
    return this.isAddMode || this.getFormPropertyIds().length === 0;
  }

  applyAccountingCompanySelection(): void {
    this.form.patchValue({
      propertyIds: [ACCOUNTING_COMPANY_PROPERTY_ID],
      propertyCode: 'Company'
    }, { emitEvent: false });
    this.lastPropertyIdsValue = [ACCOUNTING_COMPANY_PROPERTY_ID];
    this.selectedPropertyId = null;
    this.updatePropertyRequirementByReceiptType();
  }

  normalizeAccountingCompanyPropertySelection(current: string[] | null | undefined, previous: string[]): void {
    if (!this.showAccountingCompanyPropertyOption || !Array.isArray(current)) {
      return;
    }

    const hasCompany = current.includes(ACCOUNTING_COMPANY_PROPERTY_ID);
    const realIds = current
      .filter(propertyId => propertyId !== ACCOUNTING_COMPANY_PROPERTY_ID)
      .map(propertyId => (propertyId || '').toString().trim())
      .filter(propertyId => propertyId.length > 0);

    if (!hasCompany || realIds.length === 0) {
      return;
    }

    const companyAdded = hasCompany && !previous.includes(ACCOUNTING_COMPANY_PROPERTY_ID);
    const next = companyAdded ? [ACCOUNTING_COMPANY_PROPERTY_ID] : realIds;
    this.form.patchValue({ propertyIds: next }, { emitEvent: false });
  }

  toFormPropertyIds(propertyIds: string[] | null | undefined): string[] {
    const realIds = (propertyIds || [])
      .map(propertyId => (propertyId || '').toString().trim())
      .filter(propertyId => propertyId.length > 0);
    if (realIds.length > 0) {
      return realIds;
    }
    if (this.showAccountingCompanyPropertyOption) {
      return [ACCOUNTING_COMPANY_PROPERTY_ID];
    }
    return [];
  }

  getFormPropertyIds(): string[] {
    if (!this.form) {
      return [];
    }
    const value = this.form.get('propertyIds')?.value;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(propertyId => (propertyId || '').toString().trim()).filter(propertyId => propertyId.length > 0);
  }

  getPayloadPropertyIds(): string[] {
    if (this.isAccountingCompanySelected()) {
      return [];
    }
    return this.getSelectedPropertyIds();
  }

  isPropertySelectionRequired(): boolean {
    if (this.isAccountingCompanySelected()) {
      return false;
    }
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
      propertyIdsControl.setValidators([this.requireNonEmptyArray]);
    } else {
      propertyIdsControl.clearValidators();
      propertyIdsControl.setErrors(null);
    }
    propertyIdsControl.updateValueAndValidity({ emitEvent: false });
    this.emitPropertySelectionRequiredState();
  }

  updateVendorFieldValidators(): void {
    const vendorIdControl = this.form.get('vendorId');
    const vendorNameControl = this.form.get('vendorName');
    if (!vendorIdControl || !vendorNameControl) {
      return;
    }

    if (this.isOverallBillBankCard()) {
      vendorIdControl.setValidators([this.requireNonEmptyVendorId]);
      vendorNameControl.clearValidators();
    } else {
      vendorNameControl.setValidators([Validators.required]);
      vendorIdControl.clearValidators();
    }

    vendorIdControl.updateValueAndValidity({ emitEvent: false });
    vendorNameControl.updateValueAndValidity({ emitEvent: false });
  }

  emitPropertySelectionRequiredState(): void {
    this.propertySelectionRequiredChange.emit(this.isPropertySelectionRequired());
  }

  getSelectedPropertyIds(): string[] {
    return this.getFormPropertyIds()
      .filter(propertyId => propertyId !== ACCOUNTING_COMPANY_PROPERTY_ID);
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
    const ids = propertyIds || [];
    if (this.showAccountingCompanyPropertyOption && ids.includes(ACCOUNTING_COMPANY_PROPERTY_ID)) {
      const realIds = ids.filter(propertyId => propertyId !== ACCOUNTING_COMPANY_PROPERTY_ID && (propertyId || '').trim());
      if (realIds.length === 0) {
        return 'Company';
      }
    }
    const codeLookup = new Map(
      (this.propertyOptions || []).map(property => [property.propertyId, (property.propertyCode || '').trim()])
    );
    return ids
      .filter(propertyId => propertyId !== ACCOUNTING_COMPANY_PROPERTY_ID)
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .map(propertyId => codeLookup.get(propertyId) || propertyId)
      .join(', ');
  }
  //#endregion 

  //#region Load-state helpers
  clearReceiptLoading(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipt');
    this.syncPageReadyFromLoadItems();
  }

  syncPageReadyFromLoadItems(): void {
    this.isPageReady = this.itemsToLoad$.value.size === 0;
    this.cdr.markForCheck();
  }
  //#endregion

  //#region OfficeId Methods
  isAllOfficesShellScope(): boolean {
    return this.normalizeOfficeId(this.officeId) === null;
  }

  applyShellOfficeToReceipt(): void {
    const shellOfficeId = this.normalizeOfficeId(this.officeId);
    const shellOfficeChanged = this.lastAppliedShellOfficeId !== shellOfficeId;
    if (!shellOfficeId) {
      const propertyOfficeId = this.normalizeOfficeId(this.property?.officeId);
      if (propertyOfficeId) {
        this.setReceiptOfficeId(propertyOfficeId);
      } else if (this.isAddMode && this.form && shellOfficeChanged) {
        this.resetBankCardsToOfficeScope();
      }
      this.lastAppliedShellOfficeId = shellOfficeId;
      if (!this.form) {
        return;
      }
      this.loadBankCardsAndVendors();
      return;
    }
    this.setReceiptOfficeId(shellOfficeId);
    if (this.isAddMode && this.form && shellOfficeChanged) {
      this.resetBankCardsToOfficeScope();
    }
    this.lastAppliedShellOfficeId = shellOfficeId;
    if (!this.form) {
      return;
    }
    this.loadBankCardsAndVendors();
  }

  setReceiptOfficeId(officeId: number): void {
    const previousOfficeId = this.normalizeOfficeId(this.receipt?.officeId);
    const nextOfficeId = this.normalizeOfficeId(officeId) ?? officeId;
    const officeName = this.getOfficeNameForOfficeId(nextOfficeId) || '';
    if (!this.receipt) {
      this.receipt = this.createDraftReceipt(nextOfficeId, officeName);
    } else {
      this.receipt.officeId = nextOfficeId;
      if (officeName) {
        this.receipt.officeName = officeName;
      }
    }
    if (!this.form) {
      return;
    }
    this.form.patchValue({ officeName: this.receipt.officeName || officeName }, { emitEvent: false });
    this.applyPropertyOptionsForCurrentOffice();
    if (previousOfficeId !== this.normalizeOfficeId(nextOfficeId)) {
      this.resetBankCardsToOfficeScope();
    }
  }

  getReceiptOfficeId(): number | null {
    const officeId = Number(this.receipt?.officeId ?? 0);
    return Number.isFinite(officeId) && officeId > 0 ? officeId : null;
  }

  normalizeOfficeId(value: number | null | undefined): number | null {
    const officeId = Number(value ?? 0);
    return Number.isFinite(officeId) && officeId > 0 ? officeId : null;
  }

  normalizeAgreementLineId(value: number | string | null | undefined): number | null {
    const agreementLineId = Number(value ?? 0);
    return Number.isFinite(agreementLineId) && agreementLineId > 0 ? Math.trunc(agreementLineId) : null;
  }

  normalizeAgreementLineNotes(value: string | null | undefined): string | null {
    const notes = String(value || '').trim();
    return notes.length > 0 ? notes : null;
  }

  get agreementLineNotesTooltip(): string {
    return this.activeAgreementLineNotes || '';
  }

  get hasAgreementLineNotes(): boolean {
    return !!this.activeAgreementLineNotes;
  }

  createDraftReceipt(officeId: number, officeName: string): ReceiptResponse {
    return {
      receiptId: '',
      receiptCode: '',
      organizationId: this.organizationId,
      officeId,
      officeName,
      propertyIds: [],
      receiptDate: '',
      dueDate: '',
      accountingPeriod: '',
      ticketId: this.ticketId || '',
      description: '',
      amount: 0,
      splits: [],
      isUtility: false,
      isActive: true,
      modifiedOn: '',
      modifiedBy: ''
    };
  }

  getOfficeNameForOfficeId(officeId: number | null): string {
    if (!officeId) {
      return '';
    }
    if (this.receipt?.officeId === officeId && (this.receipt.officeName || '').trim()) {
      return this.receipt.officeName.trim();
    }
    const fromPropertyRow = this.propertyOptions.find(row => row.officeId === officeId);
    if ((fromPropertyRow?.officeName || '').trim()) {
      return fromPropertyRow.officeName.trim();
    }
    const fromOffice = this.offices.find(row => row.officeId === officeId);
    if ((fromOffice?.name || '').trim()) {
      return fromOffice.name.trim();
    }
    return (this.property?.officeName || '').trim();
  }

  applyPropertyOptionsForCurrentOffice(): void {
    const source = this.allPropertyOptions || [];
    if (source.length === 0) {
      this.propertyOptions = [];
      return;
    }

    const receiptOfficeId = this.getReceiptOfficeId();
    if (this.isAllOfficesShellScope() || !receiptOfficeId) {
      this.propertyOptions = source;
      return;
    }

    this.propertyOptions = source.filter(property => Number(property.officeId) === receiptOfficeId);
  }
  //#endregion
  
  //#region Utility Methods
  toCurrencyCents(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.round((numeric + Number.EPSILON) * 100);
  }

  get isEmbeddedInShell(): boolean {
    return this.shellContext === 'maintenance' || this.shellContext === 'accounting';
  }

  applyPrefillIfNeeded(): void {
    if (!this.isAddMode || !this.prefill || !this.form) {
      return;
    }

    const prefillKey = (this.prefill.key || '').trim();
    if (!prefillKey || prefillKey === this.appliedPrefillKey) {
      return;
    }

    const officeId = this.normalizeOfficeId(this.prefill.officeId);
    if (officeId) {
      this.setReceiptOfficeId(officeId);
    }
    this.activeAgreementLineId = this.normalizeAgreementLineId(this.prefill.agreementLineId);
    this.activeAgreementLineNotes = this.normalizeAgreementLineNotes(this.prefill.agreementLineNotes);
    this.applyAgreementLineOverrides();

    const propertyIds = (this.prefill.propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0);
    if (propertyIds.length > 0) {
      this.form.patchValue({
        propertyIds,
        propertyCode: this.getPropertyCodesDisplay(propertyIds)
      }, { emitEvent: false });
    }

    const parsedAmount = Number(this.prefill.amount ?? 0);
    const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
    const description = (this.prefill.description || '').trim();
    const vendorId = (this.prefill.vendorId || '').trim() || null;
    const vendorName = (this.prefill.vendorName || '').trim() || null;
    const bankCardId = Number(this.prefill.bankCardId ?? 0);

    this.form.patchValue({
      receiptDate: this.getReceiptDateControlValue(this.prefill.receiptDate || null),
      dueDate: this.getReceiptDateControlValue(this.prefill.dueDate || this.prefill.receiptDate || null),
      accountingPeriod: this.getReceiptDateControlValue(this.prefill.accountingPeriod || this.prefill.receiptDate || null),
      description,
      amount: amount > 0 ? amount.toFixed(2) : '0.00',
      bankCardId: Number.isFinite(bankCardId) ? bankCardId : 0,
      vendorId,
      vendorName: vendorId ? null : vendorName,
      billNumber: (this.prefill.billNumber || '').trim() || null
    }, { emitEvent: false });

    const split = this.prefill.split || null;
    if (split) {
      const splitAmount = Number(split.amount ?? amount);
      const splitChartOfAccountId = Number(split.chartOfAccountId ?? 0);
      const splitReceiptTypeId = Number(split.receiptTypeId ?? 1);
      this.replaceSplitLines([{
        amount: Number.isFinite(splitAmount) ? splitAmount : amount,
        description: (split.description || description || '').trim(),
        receiptTypeId: Number.isFinite(splitReceiptTypeId) ? splitReceiptTypeId : 1,
        chartOfAccountId: Number.isFinite(splitChartOfAccountId) && splitChartOfAccountId > 0 ? splitChartOfAccountId : null
      } as Split]);
    }

    this.onOverallBankCardChange();
    this.updatePropertyRequirementByReceiptType();
    this.lastPropertyIdsValue = this.getFormPropertyIds();
    this.syncSelectedPropertyIdFromForm();
    this.appliedPrefillKey = prefillKey;
    this.cdr.markForCheck();
  }

  applyAgreementLineOverrides(): void {
    const overrideAgreementLineId = this.normalizeAgreementLineId(this.agreementLineIdOverride);
    const overrideAgreementLineNotes = this.normalizeAgreementLineNotes(this.agreementLineNotesOverride);
    if (overrideAgreementLineId) {
      this.activeAgreementLineId = overrideAgreementLineId;
    }
    if (overrideAgreementLineNotes) {
      this.activeAgreementLineNotes = overrideAgreementLineNotes;
    }
  }

  back(): void {
    if (this.isEmbeddedInShell) {
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
