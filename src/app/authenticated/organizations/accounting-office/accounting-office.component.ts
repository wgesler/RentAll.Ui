import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
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
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';

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
  @ViewChild('firstInput') firstInputRef: MatSelect;
  
  isServiceError: boolean = false;
  form: FormGroup;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  accountingOffice: AccountingOfficeResponse;

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
    { controlName: 'defaultPrePayAccountId', label: 'Pre-Payment' }
  ];

  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public accountingOfficeService: AccountingOfficeService,
    private bankCardService: BankCardService,
    public fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,    private commonService: CommonService,
    private officeService: OfficeService,
    private costCodesService: CostCodesService,
    private chartOfAccountsService: ChartOfAccountsService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef
  ) {
  }

  //#region Office
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadStates();
    this.loadOffices();

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

  private parseOfficeId(id: string | number | null): number | null {
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
        this.buildForm();
        this.loadChartOfAccountsForOffice(response?.officeId, () => {
          this.populateForm();
          this.applyBankCardsFromSource(response?.bankCards);
          this.cdr.markForCheck();
        });
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
      bankName: formValue.bankName || '',
      bankRouting: formValue.bankRouting || '',
      bankAccount: formValue.bankAccount || '',
      bankSwiftCode: formValue.bankSwiftCode || '',
      bankAddress: formValue.bankAddress || '',
      bankPhone: bankPhoneDigits,
      workOrderNo: Number(formValue.workOrderNo) || 0,
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
      email: formValue.email || '',
      website: formValue.website || '',
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
      workOrderNo: new FormControl(0, [Validators.required, Validators.min(0)]),
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
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif', 'pdf'], ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif', 'application/pdf'], 2000000, true)] }),
      isActive: new FormControl(true)
    });
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
        workOrderNo: this.accountingOffice.workOrderNo ?? 0,
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

    this.chartOfAccountsService.getChartOfAccountsByOfficeId(parsedOfficeId).pipe(take(1)).subscribe({
      next: accounts => {
        const sortedAccounts = (accounts || [])
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
      },
      error: () => {
        this.chartOfAccountOptions = [];
        this.setBankCardChartOfAccountOptions([]);
        onLoaded?.();
        this.cdr.markForCheck();
      }
    });
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
//#endregion
}
