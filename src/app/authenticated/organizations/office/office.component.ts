import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { TransactionType } from '../../accounting/models/accounting-enum';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { UserRequest, UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { OfficeRequest, OfficeResponse } from '../models/office.model';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-office',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './office.component.html',
    styleUrl: './office.component.scss'
})

export class OfficeComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() id: string | number | null = null;
  @Input() organizationId: string | null = null; // Organization ID from parent (for SuperAdmin)
  @Input() copyFrom: OfficeResponse | null = null; // When set in add mode, form is pre-filled (name cleared)
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;
  @ViewChild('quotePrefaceEditor') set quotePrefaceEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.quotePrefaceEditor = value;
    this.syncQuoteTextEditorFromForm('quotePreface');
  }
  quotePrefaceEditor?: ElementRef<HTMLDivElement>;
  @ViewChild('quoteSuffixEditor') set quoteSuffixEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.quoteSuffixEditor = value;
    this.syncQuoteTextEditorFromForm('quoteSuffix');
  }
  quoteSuffixEditor?: ElementRef<HTMLDivElement>;
  @ViewChild('quoteDisclaimerEditor') set quoteDisclaimerEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.quoteDisclaimerEditor = value;
    this.syncQuoteTextEditorFromForm('quoteDisclaimer');
  }
  quoteDisclaimerEditor?: ElementRef<HTMLDivElement>;

  isServiceError: boolean = false;
  office: OfficeResponse;
  form: FormGroup;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  allCostCodes: CostCodesResponse[] = [];
  chargeCostCodeOptions: { value: number, label: string }[] = [];
  expenseCostCodeOptions: { value: number, label: string }[] = [];
  depositCostCodeOptions: { value: number, label: string }[] = [];
  sdwCostCodeOptions: { value: number, label: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public officeService: OfficeService,
    public fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,
    private commonService: CommonService,
    private costCodesService: CostCodesService,
    private userService: UserService,
    private utilityService: UtilityService
  ) {
  }

  //#region Office
  ngOnInit(): void {
    this.loadStates();
    this.loadCostCodes();

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new' || this.id === 'new';
      if (this.isAddMode) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
        this.buildForm();
        this.scheduleFocusFirstField();
        if (this.copyFrom) {
          setTimeout(() => this.populateFormFromCopy(), 0);
        }
      } else {
        this.getOffice(this.id.toString());
      }
    }
  }

  ngAfterViewInit(): void {
    this.syncAllQuoteTextEditorsFromForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['copyFrom'] && this.copyFrom && this.form && this.isAddMode) {
      this.populateFormFromCopy();
    }
    // If id changes, reload office
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getOffice(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
        this.buildForm();
        this.scheduleFocusFirstField();
        if (this.copyFrom) {
          setTimeout(() => this.populateFormFromCopy(), 0);
        }
      }
    }
  }

  getOffice(id?: string | number): void {
    const idToUse = id || this.id;
    if (!idToUse || idToUse === 'new') {
      return;
    }

    const officeIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(officeIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid office ID', CommonMessage.Error);
      return;
    }

    this.officeService.getOfficeById(officeIdNum).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office'); })).subscribe({
      next: (response: OfficeResponse) => {
        this.office = response;
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
              // Construct dataUrl from base64 string
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
        this.filterOfficeCostCodeOptions();
      },
      error: (err: HttpErrorResponse) => {
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

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone);
    const faxDigits = this.formatterService.stripPhoneFormatting(formValue.fax);
    const isInternational = formValue.isInternational || false;
    const officeRequest: OfficeRequest = {
      organizationId: this.organizationId || user?.organizationId || '',
      officeCode: formValue.officeCode,
      name: formValue.name,
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || undefined,
      suite: formValue.suite || undefined,
      city: isInternational ? undefined : (formValue.city || '').trim() || undefined,
      state: isInternational ? undefined : (formValue.state || '').trim() || undefined,
      zip: isInternational ? undefined : (formValue.zip || '').trim() || undefined,
      isInternational: isInternational,
      website: formValue.website || undefined,
      phone: phoneDigits,
      fax: faxDigits || undefined,
      // Send fileDetails if a new file was uploaded OR if fileDetails exists from API (preserve existing logo)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath,
      isActive: formValue.isActive,
      // Configuration fields
      maintenanceEmail: formValue.maintenanceEmail || undefined,
      afterHoursPhone: formValue.afterHoursPhone ? this.formatterService.stripPhoneFormatting(formValue.afterHoursPhone) : undefined,
      afterHoursInstructions: formValue.afterHoursInstructions || undefined,
      useDailyOnResBoard: formValue.useDailyOnResBoard ?? false,
      daysToRefundDeposit: formValue.daysToRefundDeposit || 0,
      defaultDeposit: formValue.defaultDeposit ? parseFloat(formValue.defaultDeposit.toString()) : 0,
      defaultSdw: formValue.defaultSdw ? parseFloat(formValue.defaultSdw.toString()) : 0,
      defaultKeyFee: formValue.defaultKeyFee ? parseFloat(formValue.defaultKeyFee.toString()) : 0,
      undisclosedPetFee: formValue.undisclosedPetFee ? parseFloat(formValue.undisclosedPetFee.toString()) : 0,
      minimumSmokingFee: formValue.minimumSmokingFee ? parseFloat(formValue.minimumSmokingFee.toString()) : 0,
      utilityOneBed: formValue.utilityOneBed ? parseFloat(formValue.utilityOneBed.toString()) : 0,
      utilityTwoBed: formValue.utilityTwoBed ? parseFloat(formValue.utilityTwoBed.toString()) : 0,
      utilityThreeBed: formValue.utilityThreeBed ? parseFloat(formValue.utilityThreeBed.toString()) : 0,
      utilityFourBed: formValue.utilityFourBed ? parseFloat(formValue.utilityFourBed.toString()) : 0,
      utilityHouse: formValue.utilityHouse ? parseFloat(formValue.utilityHouse.toString()) : 0,
      maidOneBed: formValue.maidOneBed ? parseFloat(formValue.maidOneBed.toString()) : 0,
      maidTwoBed: formValue.maidTwoBed ? parseFloat(formValue.maidTwoBed.toString()) : 0,
      maidThreeBed: formValue.maidThreeBed ? parseFloat(formValue.maidThreeBed.toString()) : 0,
      maidFourBed: formValue.maidFourBed ? parseFloat(formValue.maidFourBed.toString()) : 0,
      maidHouse: formValue.maidHouse ? parseFloat(formValue.maidHouse.toString()) : 0,
      parkingLowEnd: formValue.parkingLowEnd ? parseFloat(formValue.parkingLowEnd.toString()) : 0,
      parkingHighEnd: formValue.parkingHighEnd ? parseFloat(formValue.parkingHighEnd.toString()) : 0,
      defaultMarkup: this.parseOptionalOfficePercentage(formValue.defaultMarkup),
      defaultRevenueSplitOwner: this.parseOptionalOfficePercentage(formValue.defaultRevenueSplitOwner),
      defaultRevenueSplitOffice: this.parseOptionalOfficePercentage(formValue.defaultRevenueSplitOffice),
      defaultWorkingCapitalBalance: this.parseOptionalOfficeDecimal(formValue.defaultWorkingCapitalBalance),
      defaultHourlyLaborCost: this.parseOptionalOfficeDecimal(formValue.defaultHourlyLaborCost),
      defaultLinenTowelOneBed: this.parseOptionalOfficeDecimal(formValue.defaultLinenTowelOneBed),
      defaultLinenTowelTwoBed: this.parseOptionalOfficeDecimal(formValue.defaultLinenTowelTwoBed),
      defaultLinenTowelThreeBed: this.parseOptionalOfficeDecimal(formValue.defaultLinenTowelThreeBed),
      defaultLinenTowelFourBed: this.parseOptionalOfficeDecimal(formValue.defaultLinenTowelFourBed),
      defaultOnlineFee: this.parseOptionalOfficeDecimal(formValue.defaultOnlineFee),
      defaultOnlineClean: this.parseOptionalOfficeDecimal(formValue.defaultOnlineClean),
      defaultOfflineFee: this.parseOptionalOfficeDecimal(formValue.defaultOfflineFee),
      emailListForReservations: (formValue.emailListForReservations || '').trim() || null,
      quotePreface: (formValue.quotePreface ?? '').toString().trim(),
      quoteSuffix: (formValue.quoteSuffix ?? '').toString().trim(),
      quoteDisclaimer: (formValue.quoteDisclaimer ?? '').toString().trim(),
      quotePropertyCode: !!formValue.quotePropertyCode,
      quotePetFee: !!formValue.quotePetFee,
      quoteDepartureFee: !!formValue.quoteDepartureFee,
      quoteMaidFee: !!formValue.quoteMaidFee,
      docuSignUserId: this.parseOptionalGuid(formValue.docuSignUserId),
      docuSignApiAccountId: this.parseOptionalGuid(formValue.docuSignApiAccountId),
      ...this.buildValidCostCodeRequest(formValue)
    };
    const orgId = (this.organizationId || this.office?.organizationId || user?.organizationId || '').trim();

    if (this.isAddMode) {
      this.officeService.createOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: OfficeResponse) => {
          const createdOfficeId = Number(response?.officeId ?? 0);
          this.syncCurrentUserOfficeAccess(createdOfficeId, true).pipe(take(1)).subscribe({
            next: (isUpdated: boolean) => {
              this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
              if (!isUpdated) {
                this.toastr.warning('Office created, but failed to update your office access.', 'Partial Update');
              }
              if (orgId) this.officeService.notifyOfficesChanged(orgId);
              this.savedEvent.emit();
              this.backEvent.emit();
            },
            error: () => {
              this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
              this.toastr.warning('Office created, but failed to update your office access.', 'Partial Update');
              if (orgId) this.officeService.notifyOfficesChanged(orgId);
              this.savedEvent.emit();
              this.backEvent.emit();
            }
          });
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
      officeRequest.organizationId = orgId;
      const transitionedToInactive = !!this.office?.isActive && !officeRequest.isActive;
      const transitionedToActive = !this.office?.isActive && !!officeRequest.isActive;
      this.officeService.updateOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (_response: OfficeResponse) => {
          if (transitionedToInactive || transitionedToActive) {
            const addAccess = transitionedToActive;
            this.syncCurrentUserOfficeAccess(officeIdNum, addAccess).pipe(take(1)).subscribe({
              next: (allUpdated: boolean) => {
                this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
                if (!allUpdated) {
                  this.toastr.warning('Office updated, but failed to update your office access.', 'Partial Update');
                }
                if (orgId) this.officeService.notifyOfficesChanged(orgId);
                this.savedEvent.emit();
                this.backEvent.emit();
              },
              error: () => {
                this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
                this.toastr.warning('Office updated, but failed to update your office access.', 'Partial Update');
                if (orgId) this.officeService.notifyOfficesChanged(orgId);
                this.savedEvent.emit();
                this.backEvent.emit();
              }
            });
            return;
          }

          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (orgId) this.officeService.notifyOfficesChanged(orgId);
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    }
  }
  //#endregion

  //#region Data Loading Methods
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
        console.error('Office Component - Error loading states:', err);
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(costCodes => {
        this.allCostCodes = costCodes || [];
        this.filterOfficeCostCodeOptions();
      });
    });
  }

  filterOfficeCostCodeOptions(): void {
    const officeId = this.office?.officeId;
    if (!officeId) {
      this.chargeCostCodeOptions = [];
      this.expenseCostCodeOptions = [];
      this.depositCostCodeOptions = [];
      this.sdwCostCodeOptions = [];
      return;
    }

    const officeActiveCostCodes = this.allCostCodes
      .filter(c => c.officeId === officeId && c.isActive);

    this.chargeCostCodeOptions = officeActiveCostCodes
      .filter(c => c.transactionTypeId === TransactionType.Charge)
      .map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));

    this.expenseCostCodeOptions = officeActiveCostCodes
      .filter(c => c.transactionTypeId === TransactionType.CostOfGoodsSold)
      .map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));

    this.depositCostCodeOptions = officeActiveCostCodes
      .filter(c => c.transactionTypeId === TransactionType.Deposit)
      .map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));

    this.sdwCostCodeOptions = officeActiveCostCodes
      .filter(c => c.transactionTypeId === TransactionType.SDW)
      .map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      officeCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      fax: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]),
      website: new FormControl(''),
      fileUpload: new FormControl(null, { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif', 'pdf'], ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif', 'application/pdf'], 2000000, true)] }),
      isInternational: new FormControl(false),
      isActive: new FormControl(true),
      // Configuration fields
      maintenanceEmail: new FormControl<string>('', [Validators.required, Validators.email]),
      afterHoursPhone: new FormControl<string>('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      afterHoursInstructions: new FormControl<string>(''),
      useDailyOnResBoard: new FormControl<boolean>(false),
      defaultDeposit: new FormControl<string>('0.00', [Validators.required]),
      defaultSdw: new FormControl<string>('0.00', [Validators.required]),
      daysToRefundDeposit: new FormControl<string>('0', [Validators.required]),
      defaultKeyFee: new FormControl<string>('0.00', [Validators.required]),
      undisclosedPetFee: new FormControl<string>('0.00', [Validators.required]),
      minimumSmokingFee: new FormControl<string>('0.00', [Validators.required]),
      utilityOneBed: new FormControl<string>('0.00', [Validators.required]),
      utilityTwoBed: new FormControl<string>('0.00', [Validators.required]),
      utilityThreeBed: new FormControl<string>('0.00', [Validators.required]),
      utilityFourBed: new FormControl<string>('0.00', [Validators.required]),
      utilityHouse: new FormControl<string>('0.00', [Validators.required]),
      maidOneBed: new FormControl<string>('0.00', [Validators.required]),
      maidTwoBed: new FormControl<string>('0.00', [Validators.required]),
      maidThreeBed: new FormControl<string>('0.00', [Validators.required]),
      maidFourBed: new FormControl<string>('0.00', [Validators.required]),
      maidHouse: new FormControl<string>('0.00', [Validators.required]),
      parkingLowEnd: new FormControl<string>('0.00', [Validators.required]),
      parkingHighEnd: new FormControl<string>('0.00', [Validators.required]),
      defaultMarkup: new FormControl<string>(''),
      defaultRevenueSplitOwner: new FormControl<string>(''),
      defaultRevenueSplitOffice: new FormControl<string>(''),
      defaultWorkingCapitalBalance: new FormControl<string>(''),
      defaultHourlyLaborCost: new FormControl<string>(''),
      defaultLinenTowelOneBed: new FormControl<string>(''),
      defaultLinenTowelTwoBed: new FormControl<string>(''),
      defaultLinenTowelThreeBed: new FormControl<string>(''),
      defaultLinenTowelFourBed: new FormControl<string>(''),
      defaultOnlineFee: new FormControl<string>(''),
      defaultOnlineClean: new FormControl<string>(''),
      defaultOfflineFee: new FormControl<string>(''),
      emailListForReservations: new FormControl<string>(''),
      tenantChargeCcId: new FormControl<number | null>(null),
      tenantExpenseCcId: new FormControl<number | null>(null),
      ownerChargeCcId: new FormControl<number | null>(null),
      ownerExpenseCcId: new FormControl<number | null>(null),
      furnishedRentChargeCcId: new FormControl<number | null>(null),
      furnishedRentExpenseCcId: new FormControl<number | null>(null),
      unfurnishedRentChargeCcId: new FormControl<number | null>(null),
      unfurnishedRentExpenseCcId: new FormControl<number | null>(null),
      maidServiceChargeCcId: new FormControl<number | null>(null),
      maidServiceExpenseCcId: new FormControl<number | null>(null),
      parkingChargeCcId: new FormControl<number | null>(null),
      parkingExpenseCcId: new FormControl<number | null>(null),
      departureFeeCcId: new FormControl<number | null>(null),
      petFeeCcId: new FormControl<number | null>(null),
      securityDepositCcId: new FormControl<number | null>(null),
      securityDepositWaiverCcId: new FormControl<number | null>(null),
      quotePreface: new FormControl<string>(''),
      quoteSuffix: new FormControl<string>(''),
      quoteDisclaimer: new FormControl<string>(''),
      quotePropertyCode: new FormControl<boolean>(false),
      quotePetFee: new FormControl<boolean>(false),
      quoteDepartureFee: new FormControl<boolean>(false),
      quoteMaidFee: new FormControl<boolean>(false),
      docuSignUserId: new FormControl<string>('', [Validators.pattern(/^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)]),
      docuSignApiAccountId: new FormControl<string>('', [Validators.pattern(/^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)])
    });

    // Setup conditional validation for international addresses
    this.setupConditionalFields();
  }

  populateForm(): void {
    if (this.office && this.form) {
      // Use setTimeout to defer form population to avoid ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => {
        this.form.patchValue({
          officeCode: this.office.officeCode?.toUpperCase() || '',
          name: this.office.name,
           address1: this.office.address1,
          address2: this.office.address2 || '',
          suite: this.office.suite || '',
          city: this.office.city,
          state: this.office.state,
          zip: this.office.zip,
          phone: this.formatterService.phoneNumber(this.office.phone),
          fax: this.formatterService.phoneNumber(this.office.fax) || '',
          website: this.office.website || '',
          isInternational: this.office.isInternational || false,
          isActive: this.office.isActive
        });
        // Populate configuration fields from office response
        this.form.patchValue({
          maintenanceEmail: this.office.maintenanceEmail || '',
          afterHoursPhone: this.formatterService.phoneNumber(this.office.afterHoursPhone) || '',
          afterHoursInstructions: this.office.afterHoursInstructions || '',
          useDailyOnResBoard: this.office.useDailyOnResBoard ?? false,
          defaultDeposit: this.office.defaultDeposit !== null && this.office.defaultDeposit !== undefined ? this.office.defaultDeposit.toFixed(2) : '0.00',
          defaultSdw: this.office.defaultSdw !== null && this.office.defaultSdw !== undefined ? this.office.defaultSdw.toFixed(2) : '0.00',
          daysToRefundDeposit: this.office.daysToRefundDeposit !== null && this.office.daysToRefundDeposit !== undefined ? this.office.daysToRefundDeposit.toString() : '0',
          defaultKeyFee: this.office.defaultKeyFee !== null && this.office.defaultKeyFee !== undefined ? this.office.defaultKeyFee.toFixed(2) : '0.00',
          undisclosedPetFee: this.office.undisclosedPetFee !== null && this.office.undisclosedPetFee !== undefined ? this.office.undisclosedPetFee.toFixed(2) : '0.00',
          minimumSmokingFee: this.office.minimumSmokingFee !== null && this.office.minimumSmokingFee !== undefined ? this.office.minimumSmokingFee.toFixed(2) : '0.00',
          utilityOneBed: this.office.utilityOneBed !== null && this.office.utilityOneBed !== undefined ? this.office.utilityOneBed.toFixed(2) : '0.00',
          utilityTwoBed: this.office.utilityTwoBed !== null && this.office.utilityTwoBed !== undefined ? this.office.utilityTwoBed.toFixed(2) : '0.00',
          utilityThreeBed: this.office.utilityThreeBed !== null && this.office.utilityThreeBed !== undefined ? this.office.utilityThreeBed.toFixed(2) : '0.00',
          utilityFourBed: this.office.utilityFourBed !== null && this.office.utilityFourBed !== undefined ? this.office.utilityFourBed.toFixed(2) : '0.00',
          utilityHouse: this.office.utilityHouse !== null && this.office.utilityHouse !== undefined ? this.office.utilityHouse.toFixed(2) : '0.00',
          maidOneBed: this.office.maidOneBed !== null && this.office.maidOneBed !== undefined ? this.office.maidOneBed.toFixed(2) : '0.00',
          maidTwoBed: this.office.maidTwoBed !== null && this.office.maidTwoBed !== undefined ? this.office.maidTwoBed.toFixed(2) : '0.00',
          maidThreeBed: this.office.maidThreeBed !== null && this.office.maidThreeBed !== undefined ? this.office.maidThreeBed.toFixed(2) : '0.00',
          maidFourBed: this.office.maidFourBed !== null && this.office.maidFourBed !== undefined ? this.office.maidFourBed.toFixed(2) : '0.00',
          maidHouse: this.office.maidHouse !== null && this.office.maidHouse !== undefined ? this.office.maidHouse.toFixed(2) : '0.00',
          parkingLowEnd: this.office.parkingLowEnd !== null && this.office.parkingLowEnd !== undefined ? this.office.parkingLowEnd.toFixed(2) : '0.00',
          parkingHighEnd: this.office.parkingHighEnd !== null && this.office.parkingHighEnd !== undefined ? this.office.parkingHighEnd.toFixed(2) : '0.00',
          defaultMarkup: this.formatOptionalOfficePercentage(this.office.defaultMarkup),
          defaultRevenueSplitOwner: this.formatOptionalOfficePercentage(this.office.defaultRevenueSplitOwner),
          defaultRevenueSplitOffice: this.formatOptionalOfficePercentage(this.office.defaultRevenueSplitOffice),
          defaultWorkingCapitalBalance: this.formatOptionalOfficeDecimal(this.office.defaultWorkingCapitalBalance),
          defaultHourlyLaborCost: this.formatOptionalOfficeDecimal(this.office.defaultHourlyLaborCost),
          defaultLinenTowelOneBed: this.formatOptionalOfficeDecimal(this.office.defaultLinenTowelOneBed),
          defaultLinenTowelTwoBed: this.formatOptionalOfficeDecimal(this.office.defaultLinenTowelTwoBed),
          defaultLinenTowelThreeBed: this.formatOptionalOfficeDecimal(this.office.defaultLinenTowelThreeBed),
          defaultLinenTowelFourBed: this.formatOptionalOfficeDecimal(this.office.defaultLinenTowelFourBed),
          defaultOnlineFee: this.formatOptionalOfficeDecimal(this.office.defaultOnlineFee),
          defaultOnlineClean: this.formatOptionalOfficeDecimal(this.office.defaultOnlineClean),
          defaultOfflineFee: this.formatOptionalOfficeDecimal(this.office.defaultOfflineFee),
          emailListForReservations: this.office.emailListForReservations || '',
          tenantChargeCcId: this.office.tenantChargeCcId ?? null,
          tenantExpenseCcId: this.office.tenantExpenseCcId ?? null,
          ownerChargeCcId: this.office.ownerChargeCcId ?? null,
          ownerExpenseCcId: this.office.ownerExpenseCcId ?? null,
          furnishedRentChargeCcId: this.office.furnishedRentChargeCcId ?? null,
          furnishedRentExpenseCcId: this.office.furnishedRentExpenseCcId ?? null,
          unfurnishedRentChargeCcId: this.office.unfurnishedRentChargeCcId ?? null,
          unfurnishedRentExpenseCcId: this.office.unfurnishedRentExpenseCcId ?? null,
          maidServiceChargeCcId: this.office.maidServiceChargeCcId ?? null,
          maidServiceExpenseCcId: this.office.maidServiceExpenseCcId ?? null,
          parkingChargeCcId: this.office.parkingChargeCcId ?? null,
          parkingExpenseCcId: this.office.parkingExpenseCcId ?? null,
          departureFeeCcId: this.office.departureFeeCcId ?? null,
          petFeeCcId: this.office.petFeeCcId ?? null,
          securityDepositCcId: this.office.securityDepositCcId ?? null,
          securityDepositWaiverCcId: this.office.securityDepositWaiverCcId ?? null,
          quotePreface: this.office.quotePreface || '',
          quoteSuffix: this.office.quoteSuffix || '',
          quoteDisclaimer: this.office.quoteDisclaimer || '',
          quotePropertyCode: this.office.quotePropertyCode ?? false,
          quotePetFee: this.office.quotePetFee ?? false,
          quoteDepartureFee: this.office.quoteDepartureFee ?? false,
          quoteMaidFee: this.office.quoteMaidFee ?? false,
          docuSignUserId: this.office.docuSignUserId || '',
          docuSignApiAccountId: this.office.docuSignApiAccountId || ''
        });
        this.syncAllQuoteTextEditorsFromForm();
      }, 0);
    }
  }

  populateFormFromCopy(): void {
    if (!this.copyFrom || !this.form) return;
    const o = this.copyFrom;
    this.form.patchValue({
      officeCode: o.officeCode?.toUpperCase() || '',
      name: o.name || '',
      address1: o.address1 || '',
      address2: o.address2 || '',
      suite: o.suite || '',
      city: o.city || '',
      state: o.state || '',
      zip: o.zip || '',
      phone: this.formatterService.phoneNumber(o.phone) || '',
      fax: this.formatterService.phoneNumber(o.fax) || '',
      website: o.website || '',
      isInternational: o.isInternational || false,
      isActive: o.isActive
    }, { emitEvent: false });
    this.form.patchValue({
      maintenanceEmail: o.maintenanceEmail || '',
      afterHoursPhone: this.formatterService.phoneNumber(o.afterHoursPhone) || '',
      afterHoursInstructions: o.afterHoursInstructions || '',
      useDailyOnResBoard: o.useDailyOnResBoard ?? false,
      defaultDeposit: o.defaultDeposit != null ? o.defaultDeposit.toFixed(2) : '0.00',
      defaultSdw: o.defaultSdw != null ? o.defaultSdw.toFixed(2) : '0.00',
      daysToRefundDeposit: o.daysToRefundDeposit != null ? o.daysToRefundDeposit.toString() : '0',
      defaultKeyFee: o.defaultKeyFee != null ? o.defaultKeyFee.toFixed(2) : '0.00',
      undisclosedPetFee: o.undisclosedPetFee != null ? o.undisclosedPetFee.toFixed(2) : '0.00',
      minimumSmokingFee: o.minimumSmokingFee != null ? o.minimumSmokingFee.toFixed(2) : '0.00',
      utilityOneBed: o.utilityOneBed != null ? o.utilityOneBed.toFixed(2) : '0.00',
      utilityTwoBed: o.utilityTwoBed != null ? o.utilityTwoBed.toFixed(2) : '0.00',
      utilityThreeBed: o.utilityThreeBed != null ? o.utilityThreeBed.toFixed(2) : '0.00',
      utilityFourBed: o.utilityFourBed != null ? o.utilityFourBed.toFixed(2) : '0.00',
      utilityHouse: o.utilityHouse != null ? o.utilityHouse.toFixed(2) : '0.00',
      maidOneBed: o.maidOneBed != null ? o.maidOneBed.toFixed(2) : '0.00',
      maidTwoBed: o.maidTwoBed != null ? o.maidTwoBed.toFixed(2) : '0.00',
      maidThreeBed: o.maidThreeBed != null ? o.maidThreeBed.toFixed(2) : '0.00',
      maidFourBed: o.maidFourBed != null ? o.maidFourBed.toFixed(2) : '0.00',
      maidHouse: o.maidHouse != null ? o.maidHouse.toFixed(2) : '0.00',
      parkingLowEnd: o.parkingLowEnd != null ? o.parkingLowEnd.toFixed(2) : '0.00',
      parkingHighEnd: o.parkingHighEnd != null ? o.parkingHighEnd.toFixed(2) : '0.00',
      defaultMarkup: this.formatOptionalOfficePercentage(o.defaultMarkup),
      defaultRevenueSplitOwner: this.formatOptionalOfficePercentage(o.defaultRevenueSplitOwner),
      defaultRevenueSplitOffice: this.formatOptionalOfficePercentage(o.defaultRevenueSplitOffice),
      defaultWorkingCapitalBalance: this.formatOptionalOfficeDecimal(o.defaultWorkingCapitalBalance),
      defaultHourlyLaborCost: this.formatOptionalOfficeDecimal(o.defaultHourlyLaborCost),
      defaultLinenTowelOneBed: this.formatOptionalOfficeDecimal(o.defaultLinenTowelOneBed),
      defaultLinenTowelTwoBed: this.formatOptionalOfficeDecimal(o.defaultLinenTowelTwoBed),
      defaultLinenTowelThreeBed: this.formatOptionalOfficeDecimal(o.defaultLinenTowelThreeBed),
      defaultLinenTowelFourBed: this.formatOptionalOfficeDecimal(o.defaultLinenTowelFourBed),
      defaultOnlineFee: this.formatOptionalOfficeDecimal(o.defaultOnlineFee),
      defaultOnlineClean: this.formatOptionalOfficeDecimal(o.defaultOnlineClean),
      defaultOfflineFee: this.formatOptionalOfficeDecimal(o.defaultOfflineFee),
      emailListForReservations: o.emailListForReservations || '',
      tenantChargeCcId: o.tenantChargeCcId ?? null,
      tenantExpenseCcId: o.tenantExpenseCcId ?? null,
      ownerChargeCcId: o.ownerChargeCcId ?? null,
      ownerExpenseCcId: o.ownerExpenseCcId ?? null,
      furnishedRentChargeCcId: o.furnishedRentChargeCcId ?? null,
      furnishedRentExpenseCcId: o.furnishedRentExpenseCcId ?? null,
      unfurnishedRentChargeCcId: o.unfurnishedRentChargeCcId ?? null,
      unfurnishedRentExpenseCcId: o.unfurnishedRentExpenseCcId ?? null,
      maidServiceChargeCcId: o.maidServiceChargeCcId ?? null,
      maidServiceExpenseCcId: o.maidServiceExpenseCcId ?? null,
      parkingChargeCcId: o.parkingChargeCcId ?? null,
      parkingExpenseCcId: o.parkingExpenseCcId ?? null,
      departureFeeCcId: o.departureFeeCcId ?? null,
      petFeeCcId: o.petFeeCcId ?? null,
      securityDepositCcId: o.securityDepositCcId ?? null,
      securityDepositWaiverCcId: o.securityDepositWaiverCcId ?? null,
      quotePreface: o.quotePreface || '',
      quoteSuffix: o.quoteSuffix || '',
      quoteDisclaimer: o.quoteDisclaimer || '',
      quotePropertyCode: o.quotePropertyCode ?? false,
      quotePetFee: o.quotePetFee ?? false,
      quoteDepartureFee: o.quoteDepartureFee ?? false,
      quoteMaidFee: o.quoteMaidFee ?? false,
      docuSignUserId: o.docuSignUserId || '',
      docuSignApiAccountId: o.docuSignApiAccountId || ''
    }, { emitEvent: false });
    setTimeout(() => this.syncAllQuoteTextEditorsFromForm(), 0);
  }

  setupConditionalFields(): void {
    this.form.get('isInternational')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(isInternational => {
      const cityControl = this.form.get('city');
      const stateControl = this.form.get('state');
      const zipControl = this.form.get('zip');

      if (isInternational) {
        cityControl?.clearValidators();
        stateControl?.clearValidators();
        zipControl?.clearValidators();
      } else {
        cityControl?.setValidators([Validators.required]);
        stateControl?.setValidators([Validators.required]);
        zipControl?.setValidators([Validators.required]);
      }

      cityControl?.updateValueAndValidity({ emitEvent: false });
      stateControl?.updateValueAndValidity({ emitEvent: false });
      zipControl?.updateValueAndValidity({ emitEvent: false });
    });
  }
  //#endregion

  //#region Quote text HTML editors
  syncAllQuoteTextEditorsFromForm(): void {
    this.syncQuoteTextEditorFromForm('quotePreface');
    this.syncQuoteTextEditorFromForm('quoteSuffix');
    this.syncQuoteTextEditorFromForm('quoteDisclaimer');
  }

  syncQuoteTextEditorFromForm(controlName: 'quotePreface' | 'quoteSuffix' | 'quoteDisclaimer'): void {
    const editor = this.getQuoteTextEditorElement(controlName);
    if (!editor || !this.form) {
      return;
    }
    const raw = this.form.get(controlName)?.value ?? '';
    const nextHtml = typeof raw === 'string' ? raw : String(raw);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }

  onQuoteTextInput(controlName: 'quotePreface' | 'quoteSuffix' | 'quoteDisclaimer', event: Event): void {
    const element = event.target as HTMLDivElement;
    const control = this.form.get(controlName);
    control?.setValue(element.innerHTML, { emitEvent: false });
    control?.markAsDirty();
    control?.markAsTouched();
  }

  onQuoteTextPaste(controlName: 'quotePreface' | 'quoteSuffix' | 'quoteDisclaimer', event: ClipboardEvent): void {
    const cd = event.clipboardData;
    const htmlRaw = (cd?.getData('text/html') ?? '').trim();
    const plain = cd?.getData('text/plain') ?? '';
    let insert = '';
    if (htmlRaw.length > 0) {
      insert = this.sanitizeQuotePasteHtml(htmlRaw).trim();
    }
    if (!insert && plain.length > 0) {
      insert = this.quotePastePlainToHtml(plain);
    }
    if (!insert) {
      return;
    }
    event.preventDefault();
    document.execCommand('insertHTML', false, insert);
    const editor = this.getQuoteTextEditorElement(controlName);
    if (editor) {
      const control = this.form.get(controlName);
      control?.setValue(editor.innerHTML, { emitEvent: false });
      control?.markAsDirty();
    }
  }

  private sanitizeQuotePasteHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, script, meta, link, title').forEach(e => e.remove());
    this.sanitizeQuotePasteContainer(doc.body);
    return doc.body.innerHTML;
  }

  private sanitizeQuotePasteContainer(container: HTMLElement): void {
    const allowed = new Set([
      'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI'
    ]);
    for (let i = container.childNodes.length - 1; i >= 0; i--) {
      const node = container.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        continue;
      }
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === 'BODY' || tag === 'HTML') {
        this.sanitizeQuotePasteContainer(el);
        while (el.firstChild) {
          container.insertBefore(el.firstChild, el);
        }
        el.remove();
        continue;
      }
      if (!allowed.has(tag)) {
        this.sanitizeQuotePasteContainer(el);
        while (el.firstChild) {
          container.insertBefore(el.firstChild, el);
        }
        el.remove();
        continue;
      }
      for (const a of [
        'style',
        'class',
        'id',
        'face',
        'size',
        'color',
        'bgcolor',
        'align',
        'dir',
        'lang',
        'width',
        'height'
      ]) {
        el.removeAttribute(a);
      }
      this.sanitizeQuotePasteContainer(el);
    }
  }

  private quotePastePlainToHtml(plain: string): string {
    return plain
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n|\r|\n/g, '<br>');
  }

  applyQuoteTextFormat(controlName: 'quotePreface' | 'quoteSuffix' | 'quoteDisclaimer', format: 'bold' | 'italic' | 'underline' | 'paragraph' | 'unorderedList'): void {
    const editor = this.getQuoteTextEditorElement(controlName);
    if (!editor) {
      return;
    }

    editor.focus();
    if (format === 'paragraph') {
      const inserted = document.execCommand('insertParagraph', false);
      if (!inserted) {
        document.execCommand('insertHTML', false, '<p><br></p>');
      }
      this.form.get(controlName)?.setValue(editor.innerHTML);
      return;
    }

    if (format === 'unorderedList') {
      this.applyQuoteTextUnorderedListCommand(editor);
      this.form.get(controlName)?.setValue(editor.innerHTML);
      return;
    }

    document.execCommand(format, false);
    this.form.get(controlName)?.setValue(editor.innerHTML);
  }

  preventEditorToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  applyQuoteTextUnorderedListCommand(editor: HTMLDivElement): void {
    editor.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const listItems = selectedText
      .split(/\r?\n+/)
      .map(item => item.trim())
      .filter(item => !!item);
    if (listItems.length > 0) {
      const listHtml = `<ul>${listItems.map(item => `<li>${this.escapeQuoteTextEditorHtml(item)}</li>`).join('')}</ul>`;
      document.execCommand('insertHTML', false, listHtml);
      return;
    }

    if (!selection || selection.rangeCount === 0) {
      document.execCommand('insertHTML', false, '<ul><li><br></li></ul>');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    document.execCommand('insertHTML', false, '<ul><li><br></li></ul>');
  }

  escapeQuoteTextEditorHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getQuoteTextEditorElement(controlName: 'quotePreface' | 'quoteSuffix' | 'quoteDisclaimer'): HTMLDivElement | null {
    const ref =
      controlName === 'quotePreface'
        ? this.quotePrefaceEditor
        : controlName === 'quoteSuffix'
          ? this.quoteSuffixEditor
          : this.quoteDisclaimerEditor;
    return ref?.nativeElement ?? null;
  }
  //#endregion

  //#region Logo methods
  async upload(event: Event): Promise<void> {
    if (!this.form) return;
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
    if (!this.form) return;
    this.logoPath = null;
    this.fileName = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false; // Reset flag when logo is removed
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload')?.updateValueAndValidity();
  }
  
  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
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

  formatConfigPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('afterHoursPhone'));
  }

  onConfigPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('afterHoursPhone'));
  }
  //#endregion

  // #region Decimal formatting
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  onOfficePercentInput(event: Event, fieldName: 'defaultMarkup' | 'defaultRevenueSplitOwner' | 'defaultRevenueSplitOffice'): void {
    this.formatterService.formatPercentageInput(event, this.form.get(fieldName));
  }

  clearOfficePercentOnFocus(event: FocusEvent, fieldName: 'defaultMarkup' | 'defaultRevenueSplitOwner' | 'defaultRevenueSplitOffice'): void {
    this.formatterService.clearPercentageOnFocus(event, this.form.get(fieldName));
  }

  formatOfficePercentOnBlur(fieldName: 'defaultMarkup' | 'defaultRevenueSplitOwner' | 'defaultRevenueSplitOffice'): void {
    const control = this.form.get(fieldName);
    const raw = (control?.value ?? '').toString().replace('%', '').trim();
    if (raw === '') {
      control?.setValue('', { emitEvent: false });
      return;
    }
    this.formatterService.formatPercentageOnBlur(control, 0);
  }

  formatOfficePercentOnEnter(event: KeyboardEvent, fieldName: 'defaultMarkup' | 'defaultRevenueSplitOwner' | 'defaultRevenueSplitOffice'): void {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.formatOfficePercentOnBlur(fieldName);
    (event.target as HTMLInputElement)?.blur();
  }

  formatOptionalDecimal(fieldName: string): void {
    const control = this.form.get(fieldName);
    const raw = (control?.value ?? '').toString().trim();
    if (raw === '') {
      control?.setValue('', { emitEvent: false });
      return;
    }
    this.formatterService.formatDecimalControl(control);
  }

  formatOptionalOfficePercentage(value: number | null | undefined): string {
    return value == null ? '' : this.formatterService.formatPercentageValue(value, 0);
  }

  parseOptionalOfficePercentage(value: unknown): number | null {
    const raw = (value ?? '').toString().replace('%', '').trim();
    if (raw === '') {
      return null;
    }
    return this.formatterService.parsePercentageValue(value as string | number, 0);
  }

  formatOptionalOfficeDecimal(value: number | null | undefined): string {
    return value == null ? '' : value.toFixed(2);
  }

  parseOptionalOfficeDecimal(value: unknown): number | null {
    const raw = (value ?? '').toString().trim();
    if (raw === '') {
      return null;
    }
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  parseOptionalGuid(value: unknown): string | null {
    const raw = (value ?? '').toString().trim();
    return raw || null;
  }

  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
  }

  toNullableCostCodeId(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  buildValidCostCodeRequest(formValue: Record<string, unknown>): Partial<OfficeRequest> {
    type OfficeCostCodeKey =
      | 'tenantChargeCcId'
      | 'tenantExpenseCcId'
      | 'ownerChargeCcId'
      | 'ownerExpenseCcId'
      | 'furnishedRentChargeCcId'
      | 'furnishedRentExpenseCcId'
      | 'unfurnishedRentChargeCcId'
      | 'unfurnishedRentExpenseCcId'
      | 'maidServiceChargeCcId'
      | 'maidServiceExpenseCcId'
      | 'parkingChargeCcId'
      | 'parkingExpenseCcId'
      | 'departureFeeCcId'
      | 'petFeeCcId'
      | 'securityDepositCcId'
      | 'securityDepositWaiverCcId';

    const costCodeKeys: OfficeCostCodeKey[] = [
      'tenantChargeCcId',
      'tenantExpenseCcId',
      'ownerChargeCcId',
      'ownerExpenseCcId',
      'furnishedRentChargeCcId',
      'furnishedRentExpenseCcId',
      'unfurnishedRentChargeCcId',
      'unfurnishedRentExpenseCcId',
      'maidServiceChargeCcId',
      'maidServiceExpenseCcId',
      'parkingChargeCcId',
      'parkingExpenseCcId',
      'departureFeeCcId',
      'petFeeCcId',
      'securityDepositCcId',
      'securityDepositWaiverCcId'
    ];

    const costCodeValues: Partial<Pick<OfficeRequest, OfficeCostCodeKey>> = {};
    costCodeKeys.forEach((key: OfficeCostCodeKey) => {
      const value = this.toNullableCostCodeId(formValue[key]);
      if (value !== null) {
        costCodeValues[key] = value;
      }
    });

    return costCodeValues;
  }
  //#endregion

  //#region Form Response Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('officeCode'));
  }

  focusFirstField(): void {
    const el = this.firstInputRef?.nativeElement;
    if (el?.focus) {
      el.focus();
    }
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }
 
  onEnterKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const target = ke.target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    if (target?.closest?.('[contenteditable="true"]') || target instanceof HTMLTextAreaElement) {
      return;
    }
    ke.preventDefault();
    if (this.form?.status === 'VALID' && !this.isSubmitting) {
      this.saveOffice();
    }
  }
 //#endregion

  //#region User Access To Office
  syncCurrentUserOfficeAccess(officeId: number, addAccess: boolean): Observable<boolean> {
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return of(false);
    }

    const currentUser = this.authService.getUser();
    const currentUserId = (currentUser?.userId || currentUser?.userGuid || '').trim();
    if (!currentUserId) {
      return of(false);
    }

    return this.userService.getUserByGuid(currentUserId).pipe(take(1),
      switchMap((userResponse: UserResponse) => {
        const normalizedOfficeAccess = (userResponse.officeAccess || [])
          .map(id => Number(id))
          .filter(id => Number.isFinite(id) && id > 0);

        const updatedOfficeAccess = addAccess
          ? Array.from(new Set([...normalizedOfficeAccess, Number(officeId)]))
          : normalizedOfficeAccess.filter(id => id !== Number(officeId));

        const noAccessChange = updatedOfficeAccess.length === normalizedOfficeAccess.length
          && updatedOfficeAccess.every((id, index) => id === normalizedOfficeAccess[index]);
        if (noAccessChange) {
          return of(true);
        }

        const nextDefaultOfficeId = addAccess
          ? (userResponse.defaultOfficeId ?? null)
          : (userResponse.defaultOfficeId === Number(officeId) ? null : (userResponse.defaultOfficeId ?? null));

        const hasProfileFile = !!userResponse.fileDetails?.file;
        const userRequest: UserRequest = {
          userId: userResponse.userId,
          organizationId: userResponse.organizationId,
          firstName: userResponse.firstName,
          lastName: userResponse.lastName,
          email: userResponse.email,
          phone: userResponse.phone || '',
          password: null,
          userGroups: userResponse.userGroups || [],
          officeAccess: updatedOfficeAccess,
          properties: userResponse.properties || [],
          startupPageId: userResponse.startupPageId ?? 0,
          defaultOfficeId: nextDefaultOfficeId,
          agentId: userResponse.agentId ?? null,
          commissionRate: userResponse.commissionRate ?? null,
          isActive: userResponse.isActive,
          fileDetails: hasProfileFile ? userResponse.fileDetails : undefined,
          profilePath: userResponse.profilePath ?? undefined
        };

        return this.userService.updateUser(userRequest).pipe(
          take(1),
          map(() => true)
        );
      }),
      catchError(() => of(false))
    );
  }
  //#endregion

  //#region Utility Methods
  back(): void {
    this.backEvent.emit();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
//#endregion
}

