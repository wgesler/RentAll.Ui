import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
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
  bankCards: BankCardResponse[] = [];
  showBankCardRows: boolean = false;
  bankCardValidationAttempted = false;
  editingBankCardNumberIndexes: Set<number> = new Set<number>();
  cardTypeOptions: { value: number; label: string }[] = getCardTypes();
  costCodeOptions: { value: number; label: string }[] = [];
  chartOfAccountOptions: SearchableSelectOption<number>[] = [];
  bankCardChartOfAccountOptions: SearchableSelectOption<number>[] = [];
  defaultTenantOwnerCompanyAccountFields: { controlName: string; label: string }[] = [
    { controlName: 'defaultTenantIncAccountId', label: 'Tenant Income' },
    { controlName: 'defaultTenantExpAccountId', label: 'Tenant Expense' },
    { controlName: 'defaultOwnerIncAccountId', label: 'Owner Income' },
    { controlName: 'defaultOwnerExpAccountId', label: 'Owner Expense' },
    { controlName: 'defaultCompanyExpAccountId', label: 'Company Expense' }
  ];
  defaultAccountFieldsRow2: { controlName: string; label: string }[] = [
    { controlName: 'defaultBankAccountId', label: 'Bank' },
    { controlName: 'defaultActRecvAccountId', label: 'A/R' },
    { controlName: 'defaultEscrowAccountId', label: 'Deposits' },
    { controlName: 'defaultUndepFundsAccountId', label: 'Undeposited' },
    { controlName: 'defaultActPayableAccountId', label: 'A/P' },
    { controlName: 'defaultOwnActPayableAccountId', label: 'Owner A/P' }
  ];

  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office', 'offices', 'bankCards']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public accountingOfficeService: AccountingOfficeService,
    public fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,    private commonService: CommonService,
    private officeService: OfficeService,
    private costCodesService: CostCodesService,
    private chartOfAccountsService: ChartOfAccountsService,
    private mappingService: MappingService,
    private utilityService: UtilityService
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
        return;
      }

      this.getAccountingOffice(officeIdNum);
      this.loadBankCards(officeIdNum);
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
          this.utilityService.addLoadItem(this.itemsToLoad$, 'bankCards');
          this.getAccountingOffice(officeIdNum);
          this.loadBankCards(officeIdNum);
        } else if (newId === 'new') {
          this.isAddMode = true;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
          this.bankCards = [];
          this.showBankCardRows = false;
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
        this.applyBankCardsFromSource(response?.bankCards);
        this.loadCostCodesForOffice(response?.officeId);
        this.loadChartOfAccountsForOffice(response?.officeId);
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
        this.populateForm();
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

    const bankCardValidationError = this.validateBankCardsBeforeSave();
    if (bankCardValidationError) {
      this.toastr.error(bankCardValidationError, CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const bankCardRequests = this.buildBankCardRequests();
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
      defaultActRecvAccountId: this.parseOptionalAccountId(formValue.defaultActRecvAccountId),
      defaultEscrowAccountId: this.parseOptionalAccountId(formValue.defaultEscrowAccountId),
      defaultUndepFundsAccountId: this.parseOptionalAccountId(formValue.defaultUndepFundsAccountId),
      defaultBankAccountId: this.parseOptionalAccountId(formValue.defaultBankAccountId),
      defaultActPayableAccountId: this.parseOptionalAccountId(formValue.defaultActPayableAccountId),
      defaultOwnActPayableAccountId: this.parseOptionalAccountId(formValue.defaultOwnActPayableAccountId),
      defaultTenantExpAccountId: this.parseOptionalAccountId(formValue.defaultTenantExpAccountId),
      defaultTenantIncAccountId: this.parseOptionalAccountId(formValue.defaultTenantIncAccountId),
      defaultOwnerExpAccountId: this.parseOptionalAccountId(formValue.defaultOwnerExpAccountId),
      defaultOwnerIncAccountId: this.parseOptionalAccountId(formValue.defaultOwnerIncAccountId),
      defaultCompanyExpAccountId: this.parseOptionalAccountId(formValue.defaultCompanyExpAccountId),
      email: formValue.email || '',
      website: formValue.website || '',
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      logoPath: this.hasNewFileUpload ? undefined : this.logoPath,
      isActive: formValue.isActive,
      bankCards: bankCardRequests
    };

    if (this.isAddMode) {
      this.accountingOfficeService.createAccountingOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AccountingOfficeResponse) => {
          this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.accountingOfficeService.notifyAccountingOfficesChanged();
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    } else {
      const idToUse = this.id;
      const officeIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(officeIdNum)) {
        this.toastr.error('Invalid office ID', CommonMessage.Error);
        this.isSubmitting = false;
        return;
      }
      officeRequest.officeId = officeIdNum;
      officeRequest.organizationId = this.accountingOffice?.organizationId || user?.organizationId || '';
      
      this.accountingOfficeService.updateAccountingOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AccountingOfficeResponse) => {
          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.accountingOfficeService.notifyAccountingOfficesChanged();
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    }
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
      defaultActRecvAccountId: new FormControl<number | null>(null),
      defaultEscrowAccountId: new FormControl<number | null>(null),
      defaultUndepFundsAccountId: new FormControl<number | null>(null),
      defaultBankAccountId: new FormControl<number | null>(null),
      defaultActPayableAccountId: new FormControl<number | null>(null),
      defaultOwnActPayableAccountId: new FormControl<number | null>(null),
      defaultTenantExpAccountId: new FormControl<number | null>(null),
      defaultTenantIncAccountId: new FormControl<number | null>(null),
      defaultOwnerExpAccountId: new FormControl<number | null>(null),
      defaultOwnerIncAccountId: new FormControl<number | null>(null),
      defaultCompanyExpAccountId: new FormControl<number | null>(null),
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
        defaultActRecvAccountId: this.accountingOffice.defaultActRecvAccountId ?? null,
        defaultEscrowAccountId: this.accountingOffice.defaultEscrowAccountId ?? null,
        defaultUndepFundsAccountId: this.accountingOffice.defaultUndepFundsAccountId ?? null,
        defaultBankAccountId: this.accountingOffice.defaultBankAccountId ?? null,
        defaultActPayableAccountId: this.accountingOffice.defaultActPayableAccountId ?? null,
        defaultOwnActPayableAccountId: this.accountingOffice.defaultOwnActPayableAccountId ?? null,
        defaultTenantExpAccountId: this.accountingOffice.defaultTenantExpAccountId ?? null,
        defaultTenantIncAccountId: this.accountingOffice.defaultTenantIncAccountId ?? null,
        defaultOwnerExpAccountId: this.accountingOffice.defaultOwnerExpAccountId ?? null,
        defaultOwnerIncAccountId: this.accountingOffice.defaultOwnerIncAccountId ?? null,
        defaultCompanyExpAccountId: this.accountingOffice.defaultCompanyExpAccountId ?? null,
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
      defaultActRecvAccountId: o.defaultActRecvAccountId ?? null,
      defaultEscrowAccountId: o.defaultEscrowAccountId ?? null,
      defaultUndepFundsAccountId: o.defaultUndepFundsAccountId ?? null,
      defaultBankAccountId: o.defaultBankAccountId ?? null,
      defaultActPayableAccountId: o.defaultActPayableAccountId ?? null,
      defaultOwnActPayableAccountId: o.defaultOwnActPayableAccountId ?? null,
      defaultTenantExpAccountId: o.defaultTenantExpAccountId ?? null,
      defaultTenantIncAccountId: o.defaultTenantIncAccountId ?? null,
      defaultOwnerExpAccountId: o.defaultOwnerExpAccountId ?? null,
      defaultOwnerIncAccountId: o.defaultOwnerIncAccountId ?? null,
      defaultCompanyExpAccountId: o.defaultCompanyExpAccountId ?? null,
      isActive: o.isActive
    }, { emitEvent: false });
    this.bankCards = [];
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

  loadChartOfAccountsForOffice(officeId?: number | null): void {
    const parsedOfficeId = Number(officeId);
    if (!parsedOfficeId || parsedOfficeId <= 0) {
      this.chartOfAccountOptions = [];
      this.bankCardChartOfAccountOptions = [];
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
        this.bankCardChartOfAccountOptions = sortedAccounts
          .filter(account => account.accountTypeId === AccountType.CreditCard)
          .map(({ value, label }) => ({ value, label }));
      },
      error: () => {
        this.chartOfAccountOptions = [];
        this.bankCardChartOfAccountOptions = [];
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
  loadBankCards(officeIdNum: number): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
      })
    ).subscribe({
      next: () => {
        const cachedOffice = this.accountingOfficeService.getAllAccountingOfficesValue()
          .find(office => office.officeId === officeIdNum);
        this.applyBankCardsFromSource(cachedOffice?.bankCards);
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
      }
    });
  }

  applyBankCardsFromSource(cards: BankCardResponse[] | null | undefined): void {
    const mapped = this.mappingService.mapBankCardsFromResponse(cards);
    if (mapped.length === 0) {
      return;
    }

    this.bankCards = mapped;
    this.showBankCardRows = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'bankCards');
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
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
    this.editingBankCardNumberIndexes.delete(index);
  }

  getBankCardNumberDisplay(card: BankCardResponse, index: number): string {
    const isPersisted = (card?.bankCardId || 0) > 0;
    const isEditing = this.editingBankCardNumberIndexes.has(index);
    if (isPersisted && !isEditing) {
      return card.displayName || '';
    }

    return card.cardNumber || '';
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
    if (index < 0 || index >= this.bankCards.length) return;
    this.bankCards.splice(index, 1);
  }

  onAddCardClick(): void {
    this.showBankCardRows = true;
    this.addBankCard();
  }

  buildBankCardRequests(): BankCardRequest[] {
    const requests: BankCardRequest[] = [];

    for (let i = 0; i < this.bankCards.length; i++) {
      const card = this.bankCards[i];
      if (this.isBankCardRowBlank(card)) {
        continue;
      }

      requests.push({
        bankCardId: (card.bankCardId || 0) > 0 ? card.bankCardId : undefined,
        cardTypeId: Number(card.cardTypeId),
        cardName: (card.cardName || '').trim(),
        cardNumber: this.getBankCardNumberDigits(card),
        chartOfAccountId: this.mappingService.normalizeBankCardChartOfAccountId(card.chartOfAccountId)
      });
    }

    return requests;
  }

  validateBankCardsBeforeSave(): string | null {
    this.bankCardValidationAttempted = true;

    for (let i = 0; i < this.bankCards.length; i++) {
      const card = this.bankCards[i];
      if (this.isBankCardRowBlank(card)) {
        continue;
      }

      const missingFields = this.getMissingBankCardFields(card);
      if (missingFields.length > 0) {
        return `Bank card row ${i + 1}: ${missingFields.join(', ')} ${missingFields.length === 1 ? 'is' : 'are'} required.`;
      }
    }

    this.bankCardValidationAttempted = false;
    return null;
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

  getMissingBankCardFields(card: BankCardResponse): string[] {
    const missingFields: string[] = [];
    const cardTypeId = Number(card?.cardTypeId);

    if (!this.isValidBankCardType(cardTypeId)) {
      missingFields.push('Type');
    }
    if (!(card?.cardName || '').trim()) {
      missingFields.push('Name');
    }
    if (!this.isBankCardNumberValid(card)) {
      missingFields.push('Number');
    }

    return missingFields;
  }

  isBankCardFieldInvalid(index: number, field: 'type' | 'name' | 'number'): boolean {
    if (!this.bankCardValidationAttempted) {
      return false;
    }

    const card = this.bankCards[index];
    if (!card || this.isBankCardRowBlank(card)) {
      return false;
    }

    switch (field) {
      case 'type':
        return !this.isValidBankCardType(Number(card.cardTypeId));
      case 'name':
        return !(card.cardName || '').trim();
      case 'number':
        return !this.isBankCardNumberValid(card);
      default:
        return false;
    }
  }


  //#endregion

  //#region Utility Methods
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
