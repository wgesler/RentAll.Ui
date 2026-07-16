import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, map, of, switchMap, take, takeUntil, throwError } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../models/accounting-office.model';
import { BankCardRequest, BankCardResponse } from '../models/bank.model';
import { getCardTypes } from '../models/card-type-enum';
import { AccountType } from '../../accounting/models/accounting-enum';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { OfficeResponse } from '../models/office.model';
import { AccountingOfficeService } from '../services/accounting-office.service';
import { BankCardService } from '../services/bank-card.service';
import { OfficeService } from '../services/office.service';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../../accounting/models/chart-of-accounts.model';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { CheckHtmlService } from '../../accounting/services/check-html.service';
import { CheckHtmlResponse } from '../../accounting/models/check-html.model';
import { CheckLayoutEditorDialogComponent, CheckLayoutEditorDialogData } from './check-layout-editor-dialog/check-layout-editor-dialog.component';

@Component({
    standalone: true,
    selector: 'app-accounting-office',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent],
    templateUrl: './accounting-office.component.html',
    styleUrl: './accounting-office.component.scss'
})

export class AccountingOfficeComponent implements OnInit, OnDestroy, OnChanges {

  @Input() id: string | number | null = null;
  @Input() copyFrom: AccountingOfficeResponse | null = null; // When set in add mode, form is pre-filled (name cleared)
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  accountingOfficeService = inject(AccountingOfficeService);
  private bankCardService = inject(BankCardService);
  fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private formatterService = inject(FormatterService);
  private commonService = inject(CommonService);
  private officeService = inject(OfficeService);
  private costCodesService = inject(CostCodesService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private pdfThumbnailService = inject(PdfThumbnailService);
  private checkHtmlService = inject(CheckHtmlService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild('firstInput') firstInputRef: MatSelect;
  
  isServiceError: boolean = false;
  form: FormGroup;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  checkStockFileName: string = null;
  checkStockFileDetails: FileDetails = null;
  checkStockPath: string = null;
  checkStockPreviewDataUrl: string = null;
  checkStockPdfThumbnailUrl: string = null;
  hasNewCheckStockUpload: boolean = false;
  checkStockRemoved: boolean = false;
  isUploadingCheckStock: boolean = false;
  isSavingCheckPrinting: boolean = false;
  officeCheckHtml: CheckHtmlResponse | null = null;
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  accountingOffice: AccountingOfficeResponse;
  yearEndMonthOptions: { value: number; label: string }[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return { value: month, label: String(month).padStart(2, '0') };
  });
  yearEndDayOptions: { value: number; label: string }[] = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return { value: day, label: String(day).padStart(2, '0') };
  });

  // Bank card state
  bankCards: BankCardResponse[] = [];
  showBankCardRows: boolean = false;
  bankCardValidationAttempted = false;
  bankCardActionIndexes = new Set<number>();
  editingBankCardNumberIndexes = new Set<number>();
  bankCardNumberUpdatePendingIndexes = new Set<number>();
  private bankCardLastSavedState = new Map<number, { cardTypeId: number; cardName: string; chartOfAccountId: number | null }>();
  cardTypeOptions: { value: number; label: string }[] = getCardTypes();
  bankCardChartOfAccountOptions: SearchableSelectOption<number>[] = [];

  costCodeOptions: { value: number; label: string }[] = [];
  chartOfAccountOptions: SearchableSelectOption<number>[] = [];
  allChartOfAccounts: ChartOfAccountResponse[] = [];
  defaultTenantOwnerCompanyAccountFieldsRow1: { controlName: string; label: string }[] = [
    { controlName: 'defaultTenantIncAccountId', label: 'Tenant Income' },
    { controlName: 'defaultTenantExpAccountId', label: 'Tenant Expense' },
    { controlName: 'defaultOwnerIncAccountId', label: 'Owner Income' },
    { controlName: 'defaultOwnerExpAccountId', label: 'Owner Expense' }
  ];
  defaultTenantOwnerCompanyAccountFieldsRow2: { controlName: string; label: string }[] = [
    { controlName: 'defaultCompanyExpAccountId', label: 'Company Expense' },
    { controlName: 'defaultPmUtilityIncAccountId', label: 'PM Utility Income' },
    { controlName: 'defaultLaborIncAccountId', label: 'Labor Income' },
    { controlName: 'defaultLinenTowelIncAccountId', label: 'Linen/Towel Income' }
  ];
  defaultDepartureAccountFields: { controlName: string; label: string }[] = [
    { controlName: 'defaultDepartureIncAccountId', label: 'Departure Income' },
    { controlName: 'defaultDepartureExpAccountId', label: 'Departure Expense' }
  ];
  defaultAccountFieldsRow2: { controlName: string; label: string }[] = [
    { controlName: 'defaultBankAccountId', label: 'Bank' },
    { controlName: 'defaultActRcvableAccountId', label: 'A/R' },
    { controlName: 'defaultActPayableAccountId', label: 'A/P' },
    { controlName: 'defaultUndepFundsAccountId', label: 'Undeposited' }
  ];
  defaultAccountFieldsEscrow: { controlName: string; label: string }[] = [
    { controlName: 'defaultEscrowDepositAccountId', label: 'Escrow Deposits' },
    { controlName: 'defaultEscrowSecDepAccountId', label: 'Escrow Security Deposit' },
    { controlName: 'defaultEscrowSdwAccountId', label: 'Escrow Security Deposit Waiver' }
  ];
  defaultAccountFieldsRow3: { controlName: string; label: string }[] = [
    { controlName: 'defaultEscrowOwnersAccountId', label: 'Escrow Owners' },
    { controlName: 'defaultOwnActPayableAccountId', label: 'Owner A/P' },
    { controlName: 'defaultPrePayAccountId', label: 'Pre-Payment' },
    { controlName: 'defaultRetainedEarningsAccountId', label: 'Retained Earnings' }
  ];

  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  //#region Office
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadStates();
    this.loadOffices();
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.allChartOfAccounts = accounts || [];
        const officeId = Number(this.form?.get('officeId')?.value ?? this.accountingOffice?.officeId ?? 0);
        if (officeId > 0) {
          this.loadChartOfAccountsForOffice(officeId);
        }
      });
    });

    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (!this.id) {
        return;
      }

      this.isAddMode = this.id === 'new';
      if (this.isAddMode) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
        this.buildForm();
        this.setupOfficeSelectionHandler();
        this.scheduleFocusFirstField();
        if (this.copyFrom) {
          setTimeout(() => this.populateFormFromCopy(), 0);
        }
        return;
      }

      const officeIdNum = this.parseOfficeId(this.id);
      if (officeIdNum == null) {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
        return;
      }

      this.getAccountingOffice(officeIdNum);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['copyFrom'] && this.copyFrom && this.form && this.isAddMode) {
      this.populateFormFromCopy();
    }
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        if (newId && newId !== 'new') {
          const officeIdNum = this.parseOfficeId(newId);
          if (officeIdNum == null) {
            this.isServiceError = true;
            return;
          }
          this.utilityService.addLoadItem(this.itemsToLoad$, 'office');
          this.getAccountingOffice(officeIdNum);
        } else if (newId === 'new') {
          this.isAddMode = true;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
          this.resetBankCards();
          this.buildForm();
          this.setupOfficeSelectionHandler();
          this.scheduleFocusFirstField();
          if (this.copyFrom) {
            setTimeout(() => this.populateFormFromCopy(), 0);
          }
        }
      });
    }
  }

parseOfficeId(id: string | number | null): number | null {
    if (id == null || id === 'new') {
      return null;
    }
    const officeIdNum = typeof id === 'number' ? id : parseInt(id.toString(), 10);
    return Number.isFinite(officeIdNum) && officeIdNum > 0 ? officeIdNum : null;
  }

  getAccountingOffice(officeIdNum: number): void {
    this.accountingOfficeService.getAccountingOfficeById(officeIdNum).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
    })).subscribe({
      next: (response: AccountingOfficeResponse) => {
        this.accountingOffice = response;
        this.loadCostCodesForOffice(response?.officeId);
        // Load logo from fileDetails if present (contains base64 image data)
        if (response.fileDetails && response.fileDetails.file) {
          this.fileDetails = response.fileDetails;
          // Always ensure dataUrl is set - construct from base64 file if missing or empty
          if (!this.fileDetails.dataUrl || this.fileDetails.dataUrl.trim() === '') {
            const contentType = this.fileDetails.contentType || 'image/png'; // Default to png if missing
            // Check if file already includes data URL prefix
            if (this.fileDetails.file.startsWith('data:')) {
              this.fileDetails.dataUrl = this.fileDetails.file;
            } else {
               this.fileDetails.dataUrl = `data:${contentType};base64,${this.fileDetails.file}`;
            }
          }
          this.hasNewFileUpload = false; // FileDetails from API, not a new upload
        }
        
        // Always preserve logoPath from response if it exists (even if fileDetails also exists)
        if (response.logoPath) {
          this.logoPath = response.logoPath;
        }
        // Check stock: load like logo (AccountingOffice owns the PDF path for reopen).
        this.applyAccountingOfficeCheckStock(response);
        this.buildForm();
        this.loadChartOfAccountsForOffice(response?.officeId, () => {
          this.populateForm();
          this.applyBankCardsFromSource(response?.bankCards);
          this.cdr.markForCheck();
        });
        this.loadOfficeCheckHtml(response?.officeId);
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
      }
    });
  }

  saveOffice(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.value;
    const user = this.authService.getUser();
    
    // Validate required fields
    if (!user?.organizationId) {
      this.toastr.error('Organization ID is missing', CommonMessage.Error);
      return;
    }
    
    // Validate that officeId is provided for create mode
    if (this.isAddMode && !formValue.officeId) {
      this.toastr.error('Please select an office', CommonMessage.Error);
      this.form.get('officeId')?.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone);
    const faxDigits = formValue.fax ? this.formatterService.stripPhoneFormatting(formValue.fax) : '';
    const bankPhoneDigits = formValue.bankPhone ? this.formatterService.stripPhoneFormatting(formValue.bankPhone) : '';

    const officeIdNum = formValue.officeId ? Number(formValue.officeId) : undefined;
    
    if (this.isAddMode && (!officeIdNum || officeIdNum === 0)) {
      this.toastr.error('Please select a valid office', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }
    
    const officeRequest: AccountingOfficeRequest = {
      organizationId: user.organizationId,
      officeId: this.isAddMode ? officeIdNum! : 0, // Will be set correctly in update mode below
      name: formValue.name,
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2?.trim() || undefined,
      suite: formValue.suite?.trim() || undefined,
      city: (formValue.city || '').trim(),
      state: (formValue.state || '').trim(),
      zip: (formValue.zip || '').trim(),
      phone: phoneDigits,
      fax: faxDigits,
      email: formValue.email || '',
      website: formValue.website || '',
      bankName: formValue.bankName || '',
      bankRouting: formValue.bankRouting || '',
      bankAccount: formValue.bankAccount || '',
      bankSwiftCode: formValue.bankSwiftCode || '',
      bankAddress: formValue.bankAddress || '',
      bankPhone: bankPhoneDigits,
      yearEndMonth: Number(formValue.yearEndMonth),
      yearEndDay: Number(formValue.yearEndDay),
      workOrderNo: Number(formValue.workOrderNo) || 0,
      currentCheckNumber: Number(formValue.currentCheckNumber) || 1,
      defaultTenantIncAccountId: this.parseOptionalAccountId(formValue.defaultTenantIncAccountId),
      defaultTenantExpAccountId: this.parseOptionalAccountId(formValue.defaultTenantExpAccountId),
      defaultOwnerIncAccountId: this.parseOptionalAccountId(formValue.defaultOwnerIncAccountId),
      defaultOwnerExpAccountId: this.parseOptionalAccountId(formValue.defaultOwnerExpAccountId),
      defaultCompanyExpAccountId: this.parseOptionalAccountId(formValue.defaultCompanyExpAccountId),
      defaultPmUtilityIncAccountId: this.parseOptionalAccountId(formValue.defaultPmUtilityIncAccountId),
      defaultLaborIncAccountId: this.parseOptionalAccountId(formValue.defaultLaborIncAccountId),
      defaultLinenTowelIncAccountId: this.parseOptionalAccountId(formValue.defaultLinenTowelIncAccountId),
      defaultDepartureIncAccountId: this.parseOptionalAccountId(formValue.defaultDepartureIncAccountId),
      defaultDepartureExpAccountId: this.parseOptionalAccountId(formValue.defaultDepartureExpAccountId),
      defaultBankAccountId: this.parseOptionalAccountId(formValue.defaultBankAccountId),
      defaultActRcvableAccountId: this.parseOptionalAccountId(formValue.defaultActRcvableAccountId),
      defaultActPayableAccountId: this.parseOptionalAccountId(formValue.defaultActPayableAccountId),
      defaultUndepFundsAccountId: this.parseOptionalAccountId(formValue.defaultUndepFundsAccountId),
      defaultEscrowDepositAccountId: this.parseOptionalAccountId(formValue.defaultEscrowDepositAccountId),
      defaultEscrowOwnersAccountId: this.parseOptionalAccountId(formValue.defaultEscrowOwnersAccountId),
      defaultEscrowSecDepAccountId: this.parseOptionalAccountId(formValue.defaultEscrowSecDepAccountId),
      defaultEscrowSdwAccountId: this.parseOptionalAccountId(formValue.defaultEscrowSdwAccountId),
      defaultOwnActPayableAccountId: this.parseOptionalAccountId(formValue.defaultOwnActPayableAccountId),
      defaultPrePayAccountId: this.parseOptionalAccountId(formValue.defaultPrePayAccountId),
      defaultRetainedEarningsAccountId: this.parseOptionalAccountId(formValue.defaultRetainedEarningsAccountId),
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      logoPath: this.hasNewFileUpload ? undefined : this.logoPath,
      isActive: formValue.isActive
    };

    if (!this.isAddMode) {
      const idToUse = this.id;
      const resolvedOfficeId = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(resolvedOfficeId)) {
        this.toastr.error('Invalid office ID', CommonMessage.Error);
        this.isSubmitting = false;
        return;
      }
      officeRequest.officeId = resolvedOfficeId;
      officeRequest.organizationId = this.accountingOffice?.organizationId || user?.organizationId || '';
    }

    const saveOffice$ = this.isAddMode
      ? this.accountingOfficeService.createAccountingOffice(officeRequest)
      : this.accountingOfficeService.updateAccountingOffice(officeRequest);

    saveOffice$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        this.toastr.success(this.isAddMode ? 'Office created successfully' : 'Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.accountingOfficeService.notifyAccountingOfficesChanged();
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
    });
  }

  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(filter(states => states && states.length > 0), take(1)).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: (err) => {
        console.error('Accounting Office Component - Error loading states:', err);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      officeId: new FormControl(null),
      name: new FormControl('', [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      fax: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      website: new FormControl(''),
      bankName: new FormControl('', [Validators.required]),
      bankRouting: new FormControl('', [Validators.required, Validators.pattern(/^[0-9]+$/)]),
      bankAccount: new FormControl('', [Validators.required, Validators.pattern(/^[0-9]+$/)]),
      bankSwiftCode: new FormControl('', [Validators.required]),
      bankAddress: new FormControl('', [Validators.required]),
      bankPhone: new FormControl('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      yearEndMonth: new FormControl<number>(12, [Validators.required]),
      yearEndDay: new FormControl<number>(31, [Validators.required]),
      workOrderNo: new FormControl(0, [Validators.required, Validators.min(0)]),
      currentCheckNumber: new FormControl(1, [Validators.required, Validators.min(1)]),
      defaultTenantIncAccountId: new FormControl<number | null>(null),
      defaultTenantExpAccountId: new FormControl<number | null>(null),
      defaultOwnerIncAccountId: new FormControl<number | null>(null),
      defaultOwnerExpAccountId: new FormControl<number | null>(null),
      defaultCompanyExpAccountId: new FormControl<number | null>(null),
      defaultPmUtilityIncAccountId: new FormControl<number | null>(null),
      defaultLaborIncAccountId: new FormControl<number | null>(null),
      defaultLinenTowelIncAccountId: new FormControl<number | null>(null),
      defaultDepartureIncAccountId: new FormControl<number | null>(null),
      defaultDepartureExpAccountId: new FormControl<number | null>(null),
      defaultBankAccountId: new FormControl<number | null>(null),
      defaultActRcvableAccountId: new FormControl<number | null>(null),
      defaultActPayableAccountId: new FormControl<number | null>(null),
      defaultUndepFundsAccountId: new FormControl<number | null>(null),
      defaultEscrowDepositAccountId: new FormControl<number | null>(null),
      defaultEscrowOwnersAccountId: new FormControl<number | null>(null),
      defaultEscrowSecDepAccountId: new FormControl<number | null>(null),
      defaultEscrowSdwAccountId: new FormControl<number | null>(null),
      defaultOwnActPayableAccountId: new FormControl<number | null>(null),
      defaultPrePayAccountId: new FormControl<number | null>(null),
      defaultRetainedEarningsAccountId: new FormControl<number | null>(null),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif', 'pdf'], ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif', 'application/pdf'], 2000000, true)] }),
      checkStockUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['pdf'], ['application/pdf'], 10000000, true)] }),
      isActive: new FormControl(true)
    }, { validators: [this.yearEndDayWithinMonthValidator()] });
  }

  populateForm(): void {
    if (this.accountingOffice && this.form) {
      this.form.patchValue({
        officeId: this.accountingOffice.officeId || null,
        name: this.accountingOffice.name,
        address1: this.accountingOffice.address1,
        address2: this.accountingOffice.address2 || '',
        suite: this.accountingOffice.suite || '',
        city: this.accountingOffice.city,
        state: this.accountingOffice.state,
        zip: this.accountingOffice.zip,
        phone: this.formatterService.phoneNumber(this.accountingOffice.phone),
        fax: this.accountingOffice.fax ? this.formatterService.phoneNumber(this.accountingOffice.fax) : '',
        email: this.accountingOffice.email || '',
        website: this.accountingOffice.website || '',
        bankName: this.accountingOffice.bankName || '',
        bankRouting: this.accountingOffice.bankRouting || '',
        bankAccount: this.accountingOffice.bankAccount || '',
        bankSwiftCode: this.accountingOffice.bankSwiftCode || '',
        bankAddress: this.accountingOffice.bankAddress || '',
        bankPhone: this.accountingOffice.bankPhone ? this.formatterService.phoneNumber(this.accountingOffice.bankPhone) : '',
        yearEndMonth: this.accountingOffice.yearEndMonth ?? 12,
        yearEndDay: this.accountingOffice.yearEndDay ?? 31,
        workOrderNo: this.accountingOffice.workOrderNo ?? 0,
        currentCheckNumber: this.accountingOffice.currentCheckNumber ?? 1,
        defaultTenantIncAccountId: this.accountingOffice.defaultTenantIncAccountId ?? null,
        defaultTenantExpAccountId: this.accountingOffice.defaultTenantExpAccountId ?? null,
        defaultOwnerIncAccountId: this.accountingOffice.defaultOwnerIncAccountId ?? null,
        defaultOwnerExpAccountId: this.accountingOffice.defaultOwnerExpAccountId ?? null,
        defaultCompanyExpAccountId: this.accountingOffice.defaultCompanyExpAccountId ?? null,
        defaultPmUtilityIncAccountId: this.accountingOffice.defaultPmUtilityIncAccountId ?? null,
        defaultLaborIncAccountId: this.accountingOffice.defaultLaborIncAccountId ?? null,
        defaultLinenTowelIncAccountId: this.accountingOffice.defaultLinenTowelIncAccountId ?? null,
        defaultDepartureIncAccountId: this.accountingOffice.defaultDepartureIncAccountId ?? null,
        defaultDepartureExpAccountId: this.accountingOffice.defaultDepartureExpAccountId ?? null,
        defaultBankAccountId: this.accountingOffice.defaultBankAccountId ?? null,
        defaultActRcvableAccountId: this.accountingOffice.defaultActRcvableAccountId ?? null,
        defaultActPayableAccountId: this.accountingOffice.defaultActPayableAccountId ?? null,
        defaultUndepFundsAccountId: this.accountingOffice.defaultUndepFundsAccountId ?? null,
        defaultEscrowDepositAccountId: this.accountingOffice.defaultEscrowDepositAccountId ?? null,
        defaultEscrowOwnersAccountId: this.accountingOffice.defaultEscrowOwnersAccountId ?? null,
        defaultEscrowSecDepAccountId: this.accountingOffice.defaultEscrowSecDepAccountId ?? null,
        defaultEscrowSdwAccountId: this.accountingOffice.defaultEscrowSdwAccountId ?? null,
        defaultOwnActPayableAccountId: this.accountingOffice.defaultOwnActPayableAccountId ?? null,
        defaultPrePayAccountId: this.accountingOffice.defaultPrePayAccountId ?? null,
        defaultRetainedEarningsAccountId: this.accountingOffice.defaultRetainedEarningsAccountId ?? null,
        isActive: this.accountingOffice.isActive
      }, { emitEvent: false });
    }
  }

  populateFormFromCopy(): void {
    if (!this.copyFrom || !this.form) return;
    const o = this.copyFrom;
    this.form.patchValue({
      officeId: o.officeId || null,
      name: o.name || '',
      address1: o.address1 || '',
      address2: o.address2 || '',
      suite: o.suite || '',
      city: o.city || '',
      state: o.state || '',
      zip: o.zip || '',
      phone: this.formatterService.phoneNumber(o.phone) || '',
      fax: o.fax ? this.formatterService.phoneNumber(o.fax) : '',
      email: o.email || '',
      website: o.website || '',
      bankName: o.bankName || '',
      bankRouting: o.bankRouting || '',
      bankAccount: o.bankAccount || '',
      bankSwiftCode: o.bankSwiftCode || '',
      bankAddress: o.bankAddress || '',
      bankPhone: o.bankPhone ? this.formatterService.phoneNumber(o.bankPhone) : '',
      yearEndMonth: o.yearEndMonth ?? 12,
      yearEndDay: o.yearEndDay ?? 31,
      workOrderNo: o.workOrderNo ?? 0,
      defaultTenantIncAccountId: o.defaultTenantIncAccountId ?? null,
      defaultTenantExpAccountId: o.defaultTenantExpAccountId ?? null,
      defaultOwnerIncAccountId: o.defaultOwnerIncAccountId ?? null,
      defaultOwnerExpAccountId: o.defaultOwnerExpAccountId ?? null,
      defaultCompanyExpAccountId: o.defaultCompanyExpAccountId ?? null,
      defaultPmUtilityIncAccountId: o.defaultPmUtilityIncAccountId ?? null,
      defaultLaborIncAccountId: o.defaultLaborIncAccountId ?? null,
      defaultLinenTowelIncAccountId: o.defaultLinenTowelIncAccountId ?? null,
      defaultDepartureIncAccountId: o.defaultDepartureIncAccountId ?? null,
      defaultDepartureExpAccountId: o.defaultDepartureExpAccountId ?? null,
      defaultBankAccountId: o.defaultBankAccountId ?? null,
      defaultActRcvableAccountId: o.defaultActRcvableAccountId ?? null,
      defaultActPayableAccountId: o.defaultActPayableAccountId ?? null,
      defaultUndepFundsAccountId: o.defaultUndepFundsAccountId ?? null,
      defaultEscrowDepositAccountId: o.defaultEscrowDepositAccountId ?? null,
      defaultEscrowOwnersAccountId: o.defaultEscrowOwnersAccountId ?? null,
      defaultEscrowSecDepAccountId: o.defaultEscrowSecDepAccountId ?? null,
      defaultEscrowSdwAccountId: o.defaultEscrowSdwAccountId ?? null,
      defaultOwnActPayableAccountId: o.defaultOwnActPayableAccountId ?? null,
      defaultPrePayAccountId: o.defaultPrePayAccountId ?? null,
      defaultRetainedEarningsAccountId: o.defaultRetainedEarningsAccountId ?? null,
      isActive: o.isActive
    }, { emitEvent: false });
    this.resetBankCards();
  }

  setupOfficeSelectionHandler(): void {
    // Only populate from office selection in add mode
    if (this.isAddMode) {
      this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(officeId => {
        if (officeId && this.offices.length > 0) {
          const selectedOffice = this.offices.find(o => o.officeId === officeId);
          if (selectedOffice) {
            // Populate form fields with office data (excluding bank fields)
            this.form.patchValue({
              name: selectedOffice.name || '',
              address1: selectedOffice.address1 || '',
              address2: selectedOffice.address2 || '',
              suite: selectedOffice.suite || '',
              city: selectedOffice.city || '',
              state: selectedOffice.state || '',
              zip: selectedOffice.zip || '',
              phone: selectedOffice.phone ? this.formatterService.phoneNumber(selectedOffice.phone) : '',
              fax: selectedOffice.fax ? this.formatterService.phoneNumber(selectedOffice.fax) : ''
            }, { emitEvent: false });
            this.loadCostCodesForOffice(officeId);
            this.loadChartOfAccountsForOffice(officeId);
          }
        }
      });
    }
  }
  //#endregion

  //#region Data Load Methods
  loadCostCodesForOffice(officeId?: number | null): void {
    const parsedOfficeId = Number(officeId);
    if (!parsedOfficeId || parsedOfficeId <= 0) {
      this.costCodeOptions = [];
      return;
    }

    this.costCodesService.getCostCodesByOfficeId(parsedOfficeId).pipe(take(1)).subscribe({
      next: (codes: CostCodesResponse[]) => {
        const activeCodes = (codes || []).filter(c => c.isActive);
        this.costCodeOptions = activeCodes.map(code => ({
          value: code.costCodeId,
          label: `${code.costCode}: ${code.description}`
        }));
      },
      error: (_err) => {
        this.costCodeOptions = [];
      }
    });
  }

  loadChartOfAccountsForOffice(officeId?: number | null, onLoaded?: () => void): void {
    const parsedOfficeId = Number(officeId);
    if (!parsedOfficeId || parsedOfficeId <= 0) {
      this.chartOfAccountOptions = [];
      this.setBankCardChartOfAccountOptions([]);
      onLoaded?.();
      this.cdr.markForCheck();
      return;
    }

    const accounts = this.allChartOfAccounts.filter(account => account.officeId === parsedOfficeId);
    const sortedAccounts = accounts
      .map(account => ({
        value: account.accountId,
        label: this.utilityService.getChartOfAccountDropdownLabel(account),
        accountTypeId: account.accountTypeId
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    this.chartOfAccountOptions = sortedAccounts.map(({ value, label }) => ({ value, label }));
    this.setBankCardChartOfAccountOptions(sortedAccounts);
    onLoaded?.();
    this.cdr.markForCheck();
  }

  parseOptionalAccountId(value: unknown): number | null {
    const parsed = this.utilityService.parseOptionalIntString(value);
    return parsed == null ? null : parsed;
  }

  onDefaultAccountIdChange(controlName: string, value: string | number | null): void {
    const control = this.form.get(controlName);
    control?.setValue(this.parseOptionalAccountId(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }
  //#endregion

  //#region Logo methods
  async upload(event: Event): Promise<void> {
    this.isUploadingLogo = true;
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      this.isUploadingLogo = false;
      return;
    }

    try {
      const payload = await this.utilityService.buildOptimizedUploadPayload(file);
      this.fileName = payload.fileDetails.fileName;
      this.form.patchValue({ fileUpload: payload.uploadFile });
      this.form.get('fileUpload')?.updateValueAndValidity();
      this.logoPath = null;
      this.hasNewFileUpload = true;
      this.fileDetails = payload.fileDetails;
    } finally {
      this.isUploadingLogo = false;
    }
  }
  
  removeLogo(): void {
    this.logoPath = null;
    this.fileName = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false; // Reset flag when logo is removed
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload').updateValueAndValidity();
  }

  async uploadCheckStock(event: Event): Promise<void> {
    const officeId = this.parseOfficeId(this.isAddMode ? this.form?.get('officeId')?.value : this.id);
    if (officeId == null) {
      this.toastr.warning('Save or select an office before uploading check stock.');
      return;
    }

    this.isUploadingCheckStock = true;
    const input = event.target as HTMLInputElement | null;
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      this.isUploadingCheckStock = false;
      return;
    }

    try {
      // Show preview/thumbnail immediately from the selected file first (same as receipts).
      const immediatePreviewDataUrl = await this.readSelectedFilePreviewDataUrl(file);
      if (immediatePreviewDataUrl) {
        this.checkStockFileName = file.name;
        this.checkStockPreviewDataUrl = immediatePreviewDataUrl;
        this.checkStockFileDetails = {
          contentType: file.type || 'application/pdf',
          fileName: file.name,
          file: immediatePreviewDataUrl.split(',')[1] ?? '',
          dataUrl: immediatePreviewDataUrl
        };
        this.checkStockPath = null;
        this.hasNewCheckStockUpload = true;
        this.checkStockRemoved = false;
        this.setCheckStockPdfThumbnail(immediatePreviewDataUrl, file.type || 'application/pdf');
        this.cdr.detectChanges();
      }

      // Reduce/optimize before save (same utility path as receipts/logos).
      const payload = await this.utilityService.buildOptimizedUploadPayload(file);
      this.checkStockFileName = payload.fileDetails.fileName;
      this.checkStockFileDetails = payload.fileDetails;
      this.checkStockPreviewDataUrl = payload.fileDetails.dataUrl || this.checkStockPreviewDataUrl;
      this.checkStockPath = null;
      this.hasNewCheckStockUpload = true;
      this.checkStockRemoved = false;
      this.form.patchValue({ checkStockUpload: payload.uploadFile });
      this.form.get('checkStockUpload')?.updateValueAndValidity();
      this.setCheckStockPdfThumbnail(this.checkStockPreviewDataUrl, payload.fileDetails.contentType || file.type || 'application/pdf');
      this.cdr.detectChanges();
    } catch {
      this.toastr.error('Unable to prepare check stock.', CommonMessage.Error);
    } finally {
      this.isUploadingCheckStock = false;
      this.cdr.detectChanges();
      if (input) {
        input.value = '';
      }
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

  removeCheckStock(): void {
    const hadPersistedStock = !!(this.officeCheckHtml?.checkStockPath || this.checkStockPath);
    this.clearCheckStockLocal();
    this.hasNewCheckStockUpload = false;
    this.checkStockRemoved = hadPersistedStock;
    this.cdr.detectChanges();
  }

  setCheckStockPdfThumbnail(dataUrl: string | null, contentType: string | null): void {
    if (!dataUrl) {
      this.checkStockPdfThumbnailUrl = null;
      return;
    }

    const normalizedType = (contentType || this.utilityService.getContentTypeFromDataUrl(dataUrl) || '').toLowerCase();
    const looksLikePdf = normalizedType.includes('pdf') || dataUrl.toLowerCase().includes('application/pdf');
    if (!looksLikePdf) {
      this.checkStockPdfThumbnailUrl = null;
      return;
    }

    this.checkStockPdfThumbnailUrl = null;
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => {
      this.checkStockPdfThumbnailUrl = url;
      this.cdr.detectChanges();
    });
  }

  isCheckStockPreviewPdf(): boolean {
    const contentType = (this.checkStockFileDetails?.contentType
      || this.utilityService.getContentTypeFromDataUrl(this.checkStockPreviewDataUrl)
      || '').toLowerCase();
    return contentType.includes('pdf');
  }

  saveCheckPrinting(): void {
    if (this.isAddMode) {
      this.toastr.warning('Save the accounting office first, then save check printing.');
      return;
    }

    const officeId = this.parseOfficeId(this.id);
    if (officeId == null) {
      this.toastr.warning('Please select an office first');
      return;
    }

    const checkNumberControl = this.form.get('currentCheckNumber');
    if (checkNumberControl?.invalid) {
      checkNumberControl.markAsTouched();
      this.toastr.warning('Enter a valid current check number.');
      return;
    }

    const currentCheckNumber = Number(checkNumberControl?.value) || 1;
    this.isSavingCheckPrinting = true;
    this.cdr.detectChanges();

    this.accountingOfficeService.updateAccountingOfficeCheckNumber(officeId, currentCheckNumber).pipe(
      switchMap(() => {
        if (this.accountingOffice) {
          this.accountingOffice.currentCheckNumber = currentCheckNumber;
        }
        return this.persistAccountingOfficeCheckStockIfNeeded(officeId);
      }),
      switchMap(() => this.persistCheckPrintingIfNeeded(officeId)),
      take(1),
      finalize(() => {
        this.isSavingCheckPrinting = false;
        this.cdr.detectChanges();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.hasNewCheckStockUpload = false;
        this.checkStockRemoved = false;
        this.accountingOfficeService.notifyAccountingOfficesChanged();
        this.toastr.success('Check printing saved.', CommonMessage.Success);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toastr.error('Unable to save check printing.', CommonMessage.Error);
      }
    });
  }

  openCheckLayoutEditor(): void {
    const officeId = this.parseOfficeId(this.isAddMode ? this.form?.get('officeId')?.value : this.id);
    if (officeId == null) {
      this.toastr.warning('Save or select an office before aligning check layout.');
      return;
    }

    if (this.hasNewCheckStockUpload || this.checkStockRemoved) {
      this.toastr.warning('Save check printing first to store check stock changes, then align layout.');
      return;
    }

    const data: CheckLayoutEditorDialogData = {
      officeId,
      checkStockFileDetails: this.checkStockFileDetails,
      checkStockPreviewDataUrl: this.checkStockPreviewDataUrl,
      checkStockPdfThumbnailUrl: this.checkStockPdfThumbnailUrl
    };
    this.dialog.open(CheckLayoutEditorDialogComponent, {
      width: '960px',
      maxWidth: '98vw',
      maxHeight: '94vh',
      disableClose: true,
      panelClass: 'accounting-form-dialog-panel',
      data
    }).afterClosed().pipe(take(1)).subscribe(saved => {
      if (saved) {
        this.loadOfficeCheckHtml(officeId);
      }
    });
  }

loadOfficeCheckHtml(officeId?: number | null): void {
    if (!officeId || officeId <= 0) {
      this.clearCheckStockLocal();
      this.officeCheckHtml = null;
      this.hasNewCheckStockUpload = false;
      this.checkStockRemoved = false;
      return;
    }

    this.checkHtmlService.getCheckHtmlResponseByScope(officeId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
        // Never clobber an in-progress local upload/remove (late GET races used to wipe the upload before Save).
        if (this.hasNewCheckStockUpload || this.checkStockRemoved) {
          return;
        }

        const officeOwned = !!response && Number(response.officeId) === Number(officeId);
        if (officeOwned) {
          this.officeCheckHtml = response;
          // AccountingOffice owns reopen display; only fill from CheckHtml when AO has no stock yet.
          if (!this.checkStockPath && !this.checkStockPreviewDataUrl) {
            this.applyCheckHtmlStock(response);
          }
        } else {
          this.officeCheckHtml = null;
          // Do not clear AO-loaded stock when GetByScope returns the system/org template.
        }
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.hasNewCheckStockUpload || this.checkStockRemoved) {
          return;
        }
        this.officeCheckHtml = null;
      }
    });
  }

persistAccountingOfficeCheckStockIfNeeded(officeId: number): Observable<unknown> {
    if (!this.hasNewCheckStockUpload && !this.checkStockRemoved) {
      return of(null);
    }

    const clearStock = this.checkStockRemoved && !this.hasNewCheckStockUpload;
    const body = {
      checkStockFileDetails: clearStock ? undefined : (this.hasNewCheckStockUpload ? this.checkStockFileDetails : undefined),
      // Empty string keeps existing path (ResolveImagePath treats null as clear).
      checkStockPath: clearStock ? null : (this.hasNewCheckStockUpload ? null : (this.checkStockPath || ''))
    };

    return this.accountingOfficeService.updateAccountingOfficeCheckStock(officeId, body).pipe(
      map(saved => {
        if (clearStock) {
          this.clearCheckStockLocal();
        } else {
          this.applyCheckStockFromSaved(saved.checkStockPath, saved.checkStockFileDetails, this.checkStockFileDetails);
        }
        if (this.accountingOffice) {
          this.accountingOffice.checkStockPath = saved.checkStockPath || null;
          this.accountingOffice.checkStockFileDetails = saved.checkStockFileDetails || null;
        }
        return saved;
      })
    );
  }

applyAccountingOfficeCheckStock(response: AccountingOfficeResponse): void {
    this.applyCheckStockFromSaved(response?.checkStockPath, response?.checkStockFileDetails || null, null);
  }

applyCheckStockFromSaved(
    path: string | null | undefined,
    fileDetails: FileDetails | null | undefined,
    fallbackFileDetails?: FileDetails | null
  ): void {
    const trimmedPath = (path || '').trim();
    this.checkStockPath = trimmedPath || null;
    this.checkStockFileDetails = fileDetails || fallbackFileDetails || null;

    // Logo/receipt style: build dataUrl from file bytes when the API did not include dataUrl.
    if (this.checkStockFileDetails?.file && (!this.checkStockFileDetails.dataUrl || !this.checkStockFileDetails.dataUrl.trim())) {
      const contentType = this.checkStockFileDetails.contentType || 'application/pdf';
      if (this.checkStockFileDetails.file.startsWith('data:')) {
        this.checkStockFileDetails.dataUrl = this.checkStockFileDetails.file;
      } else {
        this.checkStockFileDetails.dataUrl = `data:${contentType};base64,${this.checkStockFileDetails.file}`;
      }
    }

    this.checkStockPreviewDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.checkStockFileDetails, this.checkStockPath)
      || this.checkStockFileDetails?.dataUrl
      || null;
    this.checkStockFileName = this.checkStockFileDetails?.fileName
      || this.extractCheckStockFileName(this.checkStockPath)
      || this.checkStockFileName;
    this.setCheckStockPdfThumbnail(
      this.checkStockPreviewDataUrl,
      this.checkStockFileDetails?.contentType || this.utilityService.getContentTypeFromDataUrl(this.checkStockPreviewDataUrl) || 'application/pdf'
    );
    this.cdr.detectChanges();
  }

persistCheckPrintingIfNeeded(officeId: number): Observable<CheckHtmlResponse | null> {
    if (!this.hasNewCheckStockUpload && !this.checkStockRemoved) {
      return of(null);
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim() || this.accountingOffice?.organizationId;
    if (!organizationId) {
      this.toastr.error('Organization ID is missing', CommonMessage.Error);
      return throwError(() => new Error('Organization ID is missing'));
    }

    const existing = this.officeCheckHtml && Number(this.officeCheckHtml.officeId) === Number(officeId)
      ? this.officeCheckHtml
      : null;
    const clearStock = this.checkStockRemoved && !this.hasNewCheckStockUpload;
    const fileDetails = this.hasNewCheckStockUpload ? this.checkStockFileDetails : null;

    const templateSource$ = existing?.check && this.checkHtmlService.hasMergeTokens(existing.check)
      ? of(existing.check)
      : this.checkHtmlService.getCheckHtmlByScope(officeId);

    return templateSource$.pipe(
      switchMap(check => {
        if (existing) {
          return this.checkHtmlService.updateCheckHtml({
            checkHtmlId: existing.checkHtmlId,
            organizationId,
            officeId,
            check,
            checkStockFileDetails: clearStock ? undefined : (fileDetails ?? undefined),
            // Empty string = keep existing (ResolveImagePath treats null as explicit clear; omitted JSON also binds as null).
            checkStockPath: clearStock ? null : (existing.checkStockPath || '')
          });
        }

        if (clearStock) {
          return of(null);
        }

        return this.checkHtmlService.createCheckHtml({
          organizationId,
          officeId,
          check,
          checkStockFileDetails: fileDetails
        });
      }),
      map(response => {
        if (response) {
          this.officeCheckHtml = response;
          if (clearStock) {
            this.clearCheckStockLocal();
          } else {
            this.applyCheckHtmlStock(response, fileDetails);
          }
        } else if (clearStock) {
          this.officeCheckHtml = existing ? { ...existing, checkStockPath: null, checkStockFileDetails: null } : null;
          this.clearCheckStockLocal();
        }
        return response;
      }),
      catchError(err => throwError(() => err))
    );
  }

applyCheckHtmlStock(response: CheckHtmlResponse, fallbackFileDetails?: FileDetails | null): void {
    const path = (response.checkStockPath || '').trim();
    this.checkStockPath = path || null;
    this.checkStockFileDetails = response.checkStockFileDetails || fallbackFileDetails || null;
    this.checkStockPreviewDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.checkStockFileDetails, this.checkStockPath);
    if (this.checkStockFileDetails && this.checkStockPreviewDataUrl && (!this.checkStockFileDetails.dataUrl || !this.checkStockFileDetails.dataUrl.trim())) {
      this.checkStockFileDetails.dataUrl = this.checkStockPreviewDataUrl;
    }
    this.checkStockFileName = this.checkStockFileDetails?.fileName
      || this.extractCheckStockFileName(this.checkStockPath)
      || this.checkStockFileName;
    this.setCheckStockPdfThumbnail(
      this.checkStockPreviewDataUrl,
      this.checkStockFileDetails?.contentType || this.utilityService.getContentTypeFromDataUrl(this.checkStockPreviewDataUrl) || 'application/pdf'
    );
    this.cdr.detectChanges();
  }

extractCheckStockFileName(path: string | null | undefined): string | null {
    const value = (path || '').trim();
    if (!value) {
      return null;
    }
    try {
      const withoutQuery = value.split('?')[0].split('#')[0];
      const segments = withoutQuery.split('/').filter(Boolean);
      return segments.length ? decodeURIComponent(segments[segments.length - 1]) : null;
    } catch {
      return null;
    }
  }

clearCheckStockLocal(): void {
    this.checkStockPath = null;
    this.checkStockFileName = null;
    this.checkStockFileDetails = null;
    this.checkStockPreviewDataUrl = null;
    this.checkStockPdfThumbnailUrl = null;
    this.form?.patchValue({ checkStockUpload: null });
    this.form?.get('checkStockUpload')?.updateValueAndValidity();
    this.cdr.detectChanges();
  }
  //#endregion

  //#region Form Response Methods
  focusFirstField(): void {
    this.firstInputRef?.focus();
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }
    
  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
  }
  //#endregion

  //#region Phone helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  formatFax(): void {
    this.formatterService.formatPhoneControl(this.form.get('fax'));
  }

  onFaxInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('fax'));
  }

  formatBankPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('bankPhone'));
  }

  onBankPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('bankPhone'));
  }
  //#endregion

  //#region Bank Cards
  applyBankCardsFromSource(cards: BankCardResponse[] | null | undefined): void {
    const mapped = this.mappingService.mapBankCardsFromResponse(cards);
    this.bankCards = mapped;
    this.bankCardLastSavedState.clear();
    mapped.forEach(card => this.captureBankCardSavedState(card));
    if (mapped.length > 0) {
      this.showBankCardRows = true;
    }
  }

  resetBankCards(): void {
    this.bankCards = [];
    this.showBankCardRows = false;
    this.bankCardValidationAttempted = false;
    this.bankCardActionIndexes.clear();
    this.editingBankCardNumberIndexes.clear();
    this.bankCardNumberUpdatePendingIndexes.clear();
    this.bankCardLastSavedState.clear();
  }

  captureBankCardSavedState(card: BankCardResponse): void {
    if ((card.bankCardId || 0) <= 0) {
      return;
    }

    this.bankCardLastSavedState.set(card.bankCardId, {
      cardTypeId: Number(card.cardTypeId),
      cardName: (card.cardName || '').trim(),
      chartOfAccountId: this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId)
    });
  }

  hasPersistedBankCardChanges(card: BankCardResponse, request: BankCardRequest): boolean {
    const saved = this.bankCardLastSavedState.get(card.bankCardId);
    if (!saved) {
      return true;
    }

    if (Number(card.cardTypeId) !== saved.cardTypeId) {
      return true;
    }
    if ((card.cardName || '').trim() !== saved.cardName) {
      return true;
    }
    if (this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId) !== saved.chartOfAccountId) {
      return true;
    }
    if (request.cardNumber.length >= 13) {
      return true;
    }

    return false;
  }

  setBankCardChartOfAccountOptions(accounts: { value: number; label: string; accountTypeId: number }[]): void {
    this.bankCardChartOfAccountOptions = accounts
      .filter(account => account.accountTypeId === AccountType.CreditCard)
      .map(({ value, label }) => ({ value, label }));
  }

  getBankCardOfficeId(): number | null {
    if (this.isAddMode) {
      return null;
    }

    const fromAccountingOffice = Number(this.accountingOffice?.officeId || 0);
    if (fromAccountingOffice > 0) {
      return fromAccountingOffice;
    }

    const idToUse = this.id;
    const fromRoute = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
    return Number.isFinite(fromRoute) && fromRoute > 0 ? fromRoute : null;
  }

  onAddCardClick(): void {
    if (this.isAddMode) {
      this.toastr.warning('Save the accounting office before adding bank cards.', CommonMessage.Error);
      return;
    }

    const officeId = this.getBankCardOfficeId();
    if (!officeId) {
      this.toastr.error('Office is required before adding bank cards.', CommonMessage.Error);
      return;
    }

    this.showBankCardRows = true;
    this.bankCardValidationAttempted = false;
    this.addBankCard();
  }

  addBankCard(): void {
    const officeIdNum = Number(this.form?.get('officeId')?.value || this.accountingOffice?.officeId || 0);
    const organizationId = this.accountingOffice?.organizationId || this.authService.getUser()?.organizationId || '';
    this.bankCards.push({
      bankCardId: 0,
      organizationId,
      officeId: officeIdNum,
      cardTypeId: -1,
      cardName: '',
      displayName: '',
      cardNumber: '',
      rawCardNumber: '',
      lastFour: '',
      chartOfAccountId: null
    });
  }

  removeBankCard(index: number): void {
    if (index < 0 || index >= this.bankCards.length) {
      return;
    }

    const card = this.bankCards[index];
    const officeId = this.getBankCardOfficeId();
    if ((card.bankCardId || 0) > 0 && officeId) {
      this.bankCardService.deleteBankCard(officeId, card.bankCardId).pipe(take(1)).subscribe({
        next: () => {
          this.bankCards.splice(index, 1);
          this.cdr.markForCheck();
        },
        error: () => {
          this.toastr.error('Failed to delete bank card.', CommonMessage.Error);
        }
      });
      return;
    }

    this.bankCards.splice(index, 1);
  }

  onBankCardFieldChange(index: number): void {
    const card = this.bankCards[index];
    if (!card) {
      return;
    }

    const officeId = this.getBankCardOfficeId();
    if (!officeId) {
      return;
    }

    if ((card.bankCardId || 0) > 0) {
      this.persistBankCardUpdate(index, officeId);
      return;
    }

    this.persistBankCardCreate(index, officeId);
  }

  persistBankCardCreate(index: number, officeId: number): void {
    const card = this.bankCards[index];
    if (!card || (card.bankCardId || 0) > 0 || this.bankCardActionIndexes.has(index)) {
      return;
    }

    if (this.isBankCardRowBlank(card)) {
      return;
    }

    const missingFields = this.getMissingBankCardFields(card, true);
    if (missingFields.length > 0) {
      this.bankCardValidationAttempted = true;
      return;
    }

    this.bankCardActionIndexes.add(index);
    const request = this.buildBankCardRequest(card);
    this.bankCardService.createBankCard(officeId, request).pipe(take(1), finalize(() => this.bankCardActionIndexes.delete(index))).subscribe({
      next: (response) => {
        const mapped = this.mappingService.mapBankCardsFromResponse([response]);
        if (mapped[0]) {
          this.bankCards[index] = mapped[0];
          this.captureBankCardSavedState(mapped[0]);
        }
        this.bankCardValidationAttempted = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastr.error('Failed to create bank card.', CommonMessage.Error);
      }
    });
  }

  persistBankCardUpdate(index: number, officeId: number): void {
    const card = this.bankCards[index];
    if (!card || (card.bankCardId || 0) <= 0 || this.bankCardActionIndexes.has(index)) {
      return;
    }

    const missingFields = this.getMissingBankCardFields(card, false);
    if (missingFields.length > 0) {
      this.bankCardNumberUpdatePendingIndexes.delete(index);
      this.bankCardValidationAttempted = true;
      return;
    }

    const request = this.buildBankCardRequest(card);
    if (!this.hasPersistedBankCardChanges(card, request)) {
      this.bankCardNumberUpdatePendingIndexes.delete(index);
      return;
    }

    this.bankCardActionIndexes.add(index);
    if (request.cardNumber.length >= 13) {
      this.bankCardNumberUpdatePendingIndexes.add(index);
      card.cardNumber = '';
      card.rawCardNumber = '';
      this.cdr.markForCheck();
    }

    this.bankCardService.updateBankCard(officeId, card.bankCardId, request).pipe(take(1), finalize(() => this.bankCardActionIndexes.delete(index))).subscribe({
      next: (response) => this.onBankCardUpdateSucceeded(index, response),
      error: () => this.onBankCardUpdateFailed(index)
    });
  }

  onBankCardUpdateSucceeded(index: number, response: BankCardResponse): void {
    this.bankCardNumberUpdatePendingIndexes.delete(index);
    const mapped = this.mappingService.mapBankCardsFromResponse([response]);
    if (!mapped[0]) {
      this.cdr.markForCheck();
      return;
    }

    this.bankCards[index] = mapped[0];
    this.captureBankCardSavedState(mapped[0]);
    this.bankCardValidationAttempted = false;
    this.toastr.success('Bank card updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
    this.cdr.markForCheck();
  }

  onBankCardUpdateFailed(index: number): void {
    this.bankCardNumberUpdatePendingIndexes.delete(index);
    this.toastr.error('Failed to update bank card.', CommonMessage.Error);
    this.cdr.markForCheck();
  }

  onBankCardNumberInput(event: Event, index: number): void {
    this.formatterService.formatCreditCardInput(event, null);
    const input = event.target as HTMLInputElement;
    const cardNumber = input.value || '';
    this.bankCards[index].cardNumber = cardNumber;
    this.bankCards[index].rawCardNumber = this.formatterService.stripCreditCardFormatting(cardNumber);
    this.bankCards[index].lastFour = this.mappingService.normalizeBankCardLastFour(
      null,
      this.bankCards[index].rawCardNumber
    );
  }

  onBankCardNumberFocus(index: number): void {
    this.editingBankCardNumberIndexes.add(index);
    const card = this.bankCards[index];
    if (!card) return;
    const sourceDigits = card.rawCardNumber || this.formatterService.stripCreditCardFormatting(card.cardNumber || '');
    card.cardNumber = sourceDigits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  onBankCardNumberBlur(index: number): void {
    const card = this.bankCards[index];
    if (card && this.isBankCardNumberChangeUpdate(card, index)) {
      this.bankCardNumberUpdatePendingIndexes.add(index);
    }

    this.editingBankCardNumberIndexes.delete(index);
    this.onBankCardFieldChange(index);
  }

  getBankCardNumberDisplay(card: BankCardResponse, index: number): string {
    const isPersisted = (card?.bankCardId || 0) > 0;
    const isEditing = this.editingBankCardNumberIndexes.has(index);
    if (isPersisted && !isEditing) {
      if (this.bankCardNumberUpdatePendingIndexes.has(index)) {
        return '';
      }
      return card.displayName || '';
    }

    return card.cardNumber || '';
  }

  isBankCardNumberChangeUpdate(card: BankCardResponse, index: number): boolean {
    if ((card.bankCardId || 0) <= 0 || this.bankCardActionIndexes.has(index)) {
      return false;
    }

    return this.getBankCardNumberDigits(card).length >= 13
      && this.getMissingBankCardFields(card, false).length === 0;
  }

  buildBankCardRequest(card: BankCardResponse): BankCardRequest {
    return {
      bankCardId: (card.bankCardId || 0) > 0 ? card.bankCardId : undefined,
      cardTypeId: Number(card.cardTypeId),
      cardName: (card.cardName || '').trim(),
      cardNumber: this.getBankCardNumberDigits(card),
      chartOfAccountId: this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId)
    };
  }

  getMissingBankCardFields(card: BankCardResponse, requireFullCardNumber: boolean): string[] {
    const missingFields: string[] = [];
    const cardTypeId = Number(card?.cardTypeId);

    if (!this.isValidBankCardType(cardTypeId)) {
      missingFields.push('Type');
    }
    if (!(card?.cardName || '').trim()) {
      missingFields.push('Name');
    }
    if (requireFullCardNumber) {
      if (this.getBankCardNumberDigits(card).length < 13) {
        missingFields.push('Number');
      }
    } else if (!this.isBankCardNumberValid(card)) {
      missingFields.push('Number');
    }
    if (!this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId)) {
      missingFields.push('Account');
    }

    return missingFields;
  }

  isBankCardRowBlank(card: BankCardResponse): boolean {
    const cardTypeId = Number(card?.cardTypeId);
    const cardName = (card?.cardName || '').trim();
    const cardNumberDigits = this.getBankCardNumberDigits(card);

    return cardTypeId === -1
      && !cardName
      && cardNumberDigits.length === 0;
  }

  getBankCardNumberDigits(card: BankCardResponse): string {
    return this.formatterService.stripCreditCardFormatting(card?.rawCardNumber || card?.cardNumber || '');
  }

  isBankCardNumberValid(card: BankCardResponse): boolean {
    const digits = this.getBankCardNumberDigits(card);
    if ((card?.bankCardId || 0) > 0) {
      return digits.length >= 4 || (card.lastFour || '').replace(/\D/g, '').length === 4;
    }

    return digits.length >= 13;
  }

  isValidBankCardType(cardTypeId: number): boolean {
    return this.cardTypeOptions.some(option => option.value === cardTypeId);
  }

  isBankCardFieldInvalid(index: number, field: 'type' | 'name' | 'number' | 'account'): boolean {
    if (!this.bankCardValidationAttempted) {
      return false;
    }

    const card = this.bankCards[index];
    if (!card || this.isBankCardRowBlank(card)) {
      return false;
    }

    const requireFullCardNumber = (card.bankCardId || 0) <= 0;

    switch (field) {
      case 'type':
        return !this.isValidBankCardType(Number(card.cardTypeId));
      case 'name':
        return !(card.cardName || '').trim();
      case 'number':
        return requireFullCardNumber
          ? this.getBankCardNumberDigits(card).length < 13
          : !this.isBankCardNumberValid(card);
      case 'account':
        return !this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId);
      default:
        return false;
    }
  }
  //#endregion

  //#region Utility Methods
  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  back(): void {
    this.backEvent.emit();
  }

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (this.form?.valid && !this.isSubmitting) {
      this.saveOffice();
    }
  }

  yearEndDayWithinMonthValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const monthValue = control.get('yearEndMonth')?.value;
      const dayValue = control.get('yearEndDay')?.value;
      const month = Number(monthValue);
      const day = Number(dayValue);

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return { invalidYearEndMonth: true };
      }
      if (!Number.isInteger(day)) {
        return { invalidYearEndDayForMonth: true };
      }
      const maxDayInMonth = new Date(2024, month, 0).getDate();
      if (day < 1 || day > maxDayInMonth) {
        return { invalidYearEndDayForMonth: true };
      }

      return null;
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
//#endregion
}
