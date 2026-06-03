import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, map, of, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { FileDetails } from '../../documents/models/document.model';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { ManagementFeeType, PropertyLeaseType, normalizeManagementFeeTypeId, normalizePropertyLeaseTypeId } from '../models/property-enums';
import { PropertyAgreementLineRequest, PropertyAgreementRequest, PropertyAgreementResponse } from '../models/property-agreement.model';
import { PropertyAgreementService } from '../services/property-agreement.service';
import { ContactService } from '../../contacts/services/contact.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';

interface AgreementLineDisplay {
  agreementLineId: string | null;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  deposit: string;
  oneTime: string;
  monthly: string;
  daily: string;
}

@Component({
  selector: 'app-property-agreement',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './property-agreement.component.html',
  styleUrl: './property-agreement.component.scss'
})
export class PropertyAgreementComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) propertyId!: string;
  @Input({ required: true }) isAddMode!: boolean;
  @Input({ required: true }) canManageAgreement!: boolean;
  @Input() officeId: number | null = null;
  @Input() isFurnished = true;
  @Input() bedrooms: number | null = null;
  @Input() propertyLeaseTypeId: number | null = null;
  @Input() vendorContactId: string | null = null;

  readonly ManagementFeeType = ManagementFeeType;
  agreementForm: FormGroup | null = null;
  agreementExists = false;
  isAgreementSaving = false;
  offices: OfficeResponse[] = [];
  organizationId = '';
  availableCostCodes: { value: number, label: string }[] = [];
  agreementOfficeId: number | null = null;
  agreementLines: AgreementLineDisplay[] = [];

  agreementW9FileName: string | null = null;
  agreementW9FileDataUrl: string | null = null;
  agreementW9FileContentType: string | null = null;
  agreementW9FileDetails: FileDetails | null = null;
  agreementW9Path: string | null = null;
  agreementHasNewW9Upload = false;
  agreementW9PdfThumbnailUrl: string | null = null;

  agreementInsuranceFileName: string | null = null;
  agreementInsuranceFileDataUrl: string | null = null;
  agreementInsuranceFileContentType: string | null = null;
  agreementInsuranceFileDetails: FileDetails | null = null;
  agreementInsurancePath: string | null = null;
  agreementHasNewInsuranceUpload = false;
  agreementInsurancePdfThumbnailUrl: string | null = null;
  
  agreementDocFileName: string | null = null;
  agreementDocFileDataUrl: string | null = null;
  agreementDocFileContentType: string | null = null;
  agreementDocFileDetails: FileDetails | null = null;
  agreementDocPath: string | null = null;
  agreementHasNewDocUpload = false;
  agreementDocPdfThumbnailUrl: string | null = null;

  vendorContact: ContactResponse | null = null;
  vendorW9FileName: string | null = null;
  vendorW9FileDataUrl: string | null = null;
  vendorW9FileContentType: string | null = null;
  vendorW9FileDetails: FileDetails | null = null;
  vendorW9Path: string | null = null;
  vendorW9PdfThumbnailUrl: string | null = null;

  vendorInsuranceFileName: string | null = null;
  vendorInsuranceFileDataUrl: string | null = null;
  vendorInsuranceFileContentType: string | null = null;
  vendorInsuranceFileDetails: FileDetails | null = null;
  vendorInsurancePath: string | null = null;
  vendorInsurancePdfThumbnailUrl: string | null = null;

  @ViewChild('agreementW9FileInput') agreementW9FileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('agreementInsuranceFileInput') agreementInsuranceFileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('agreementDocFileInput') agreementDocFileInputRef: ElementRef<HTMLInputElement> | null = null;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'propertyAgreement']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private propertyAgreementService: PropertyAgreementService,
    private costCodesService: CostCodesService,
    private pdfThumbnailService: PdfThumbnailService,
    private contactService: ContactService,
    private authService: AuthService,
    private officeService: OfficeService
  ) {}

  //#region Property Agreement
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isPageReady = this.itemsToLoad$.value.size === 0;
    });

    this.buildAgreementForm();
    if (!this.canManageAgreement || !this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      return;
    }

    this.loadCostCodes();
    this.loadOffices();
    if (this.isAddMode) {
      this.agreementExists = false;
      this.resetAgreementForm();
      this.applyOfficeAgreementDefaults();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
    } else {
      this.loadAgreement();
    }
    this.loadVendorContactAttachments();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.agreementForm) {
      return;
    }
    const officeIdChange = changes['officeId'];
    if (officeIdChange && !officeIdChange.firstChange) {
      this.filterCostCodesByOffice();
    }
    const bedroomsChange = changes['bedrooms'] && !changes['bedrooms'].firstChange;
    const furnishedChange = changes['isFurnished'] && !changes['isFurnished'].firstChange;
    if (this.agreementExists) {
      if (bedroomsChange || furnishedChange) {
        this.applyFurnishedAndBedroomDefaults();
      }
    } else {
      const officeDefaultsChange = changes['officeId'] || bedroomsChange || furnishedChange;
      if (officeDefaultsChange) {
        this.applyOfficeAgreementDefaults();
      }
    }
    const leaseTypeChanged = !!(changes['propertyLeaseTypeId'] && !changes['propertyLeaseTypeId'].firstChange);
    const vendorChanged = !!(changes['vendorContactId'] && !changes['vendorContactId'].firstChange);
    if (leaseTypeChanged || vendorChanged) {
      this.loadVendorContactAttachments();
    }
  }

  persistAgreementIfDirty(): Observable<boolean> {
    if (!this.canManageAgreement || !this.agreementForm) {
      return of(true);
    }
    if (!this.agreementForm.dirty) {
      return of(true);
    }
    if (!this.propertyId || this.propertyId === 'new' || this.isAddMode) {
      return of(true);
    }
    if (!this.agreementForm.valid) {
      this.agreementForm.markAllAsTouched();
      this.toastr.warning(
        'Property agreement has validation errors. Fix the fields in Property Agreements, then save the property again.',
        'Agreement Not Saved',
        { timeOut: CommonTimeouts.Extended }
      );
      return of(false);
    }
    const lineValidation = this.validateAgreementLinesForSave();
    if (!lineValidation.isValid) {
      this.toastr.warning(lineValidation.errorMessage || 'Agreement lines are invalid.');
      return of(false);
    }
    const payload = this.buildPropertyAgreementRequest();
    this.isAgreementSaving = true;
    const req$ = this.agreementExists
      ? this.propertyAgreementService.updatePropertyAgreement(payload)
      : this.propertyAgreementService.createPropertyAgreement(payload);
    return req$.pipe(
      take(1),
      map((saved: PropertyAgreementResponse) => {
        this.agreementExists = true;
        this.populatePropertyAgreement(saved);
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
        return true;
      }),
      catchError(() => {
        this.toastr.error('Failed to save property agreement', CommonMessage.Error);
        return of(false);
      }),
      finalize(() => {
        this.isAgreementSaving = false;
      })
    );
  }

  persistAgreementForNewProperty(propertyId: string): Observable<boolean> {
    if (!this.canManageAgreement || !this.agreementForm || !propertyId) {
      return of(true);
    }
    if (!this.agreementForm.dirty) {
      return of(true);
    }
    if (!this.agreementForm.valid) {
      this.agreementForm.markAllAsTouched();
      this.toastr.warning('Property agreement has validation errors. Open Property Agreements, fix the fields, then save.', 'Agreement Not Saved', { timeOut: CommonTimeouts.Extended });
      return of(false);
    }
    const lineValidation = this.validateAgreementLinesForSave();
    if (!lineValidation.isValid) {
      this.toastr.warning(lineValidation.errorMessage || 'Agreement lines are invalid.');
      return of(false);
    }
    const payload: PropertyAgreementRequest = {
      ...this.buildPropertyAgreementRequest(),
      propertyId
    };
    this.isAgreementSaving = true;
    return this.propertyAgreementService.createPropertyAgreement(payload).pipe(take(1),
      map((saved: PropertyAgreementResponse) => {
        this.agreementExists = true;
        this.populatePropertyAgreement(saved);
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
        this.toastr.success('Property agreement saved', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        return true;
      }),
      catchError(() => {
        this.toastr.error('Failed to save property agreement', CommonMessage.Error);
        return of(false);
      }),
      finalize(() => {
        this.isAgreementSaving = false;
      })
    );
  }
  //#endregion

  //#region Form Methods
  buildAgreementForm(): void {
    this.agreementForm = this.fb.group({
      markup: new FormControl<string>(''),
      revenueSplitOwner: new FormControl<string>(''),
      revenueSplitOffice: new FormControl<string>(''),
      workingCapitalBalance: new FormControl<string>(''),
      linenAndTowelFee: new FormControl<string>(''),
      hourlyLaborCost: new FormControl<string>(''),
      bankName: new FormControl(''),
      routingNumber: new FormControl(''),
      accountNumber: new FormControl(''),
      notes: new FormControl(''),
      insuranceExpiration: new FormControl<Date | null>(null),
      managementFeeMode: new FormControl<ManagementFeeType>(ManagementFeeType.FlatRate),
      managementFlatRateAmount: new FormControl<string>(''),
      rentalIncomeCcId: new FormControl<number | null>(null),
      rentalExpenseCcId: new FormControl<number | null>(null)
    });
    this.resetAgreementForm();
    this.agreementForm.get('managementFeeMode')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncManagementAgreementFieldState();
    });
    this.syncManagementAgreementFieldState();
  }

  resetAgreementForm(): void {
    if (!this.agreementForm) {
      return;
    }
    this.agreementExists = false;
    this.agreementOfficeId = this.officeId ?? null;
    this.agreementForm.reset({
      markup: '0%',
      revenueSplitOwner: '0%',
      revenueSplitOffice: '0%',
      workingCapitalBalance: '$0.00',
      linenAndTowelFee: '$0.00',
      hourlyLaborCost: '$0.00',
      bankName: '',
      routingNumber: '',
      accountNumber: '',
      notes: '',
      insuranceExpiration: null,
      managementFeeMode: ManagementFeeType.FlatRate,
      managementFlatRateAmount: '$0.00',
      rentalIncomeCcId: null,
      rentalExpenseCcId: null
    }, { emitEvent: false });
    this.filterCostCodesByOffice();
    this.syncManagementAgreementFieldState();
    this.clearAgreementW9Ui();
    this.clearAgreementInsuranceUi();
    this.clearAgreementDocUi();
    this.agreementLines = [];
  }

  populatePropertyAgreement(data: PropertyAgreementResponse): void {
    if (!this.agreementForm) {
      return;
    }
    const insuranceExpirationDate = this.utilityService.parseDateOnlyStringToDate(data.insuranceExpiration ?? null);
    this.agreementForm.patchValue({
      markup: this.formatterService.formatPercentageValue(data.markup, 25),
      revenueSplitOwner: this.formatAgreementPercentForDisplay(data.revenueSplitOwner),
      revenueSplitOffice: this.formatAgreementPercentForDisplay(data.revenueSplitOffice),
      workingCapitalBalance: this.formatAgreementDecimalForDisplay(data.workingCapitalBalance),
      linenAndTowelFee: this.formatAgreementDecimalForDisplay(data.linenAndTowelFee),
      hourlyLaborCost: this.formatAgreementDecimalForDisplay(data.hourlyLaborCost),
      bankName: data.bankName ?? '',
      routingNumber: data.routingNumber ?? '',
      accountNumber: data.accountNumber ?? '',
      rentalIncomeCcId: data.rentalIncomeCcId ?? null,
      rentalExpenseCcId: data.rentalExpenseCcId ?? null,
      notes: data.notes ?? '',
      insuranceExpiration: insuranceExpirationDate,
      managementFeeMode: this.mappingService.mapManagementFeeTypeIdFromApi(data.managementFeeTypeId),
      managementFlatRateAmount: this.formatAgreementDecimalForDisplay(data.flatRateAmount ?? null)
    }, { emitEvent: false });
    this.agreementOfficeId = data.officeId ?? this.officeId ?? null;
    this.filterCostCodesByOffice();
    this.syncManagementAgreementFieldState();
    this.populateAgreementW9(data);
    this.populateAgreementInsurance(data);
    this.populateAgreementDoc(data);
    this.populateAgreementLines(data);
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1),
      finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');})).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
      });
    });
  }

  loadAgreement(): void {
    this.propertyAgreementService.getPropertyAgreement(this.propertyId).pipe(take(1),finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');})).subscribe({
      next: (data: PropertyAgreementResponse | null) => {
        if (this.hasPersistedAgreement(data)) {
          this.agreementExists = true;
          this.populatePropertyAgreement(data);
          this.applyFurnishedAndBedroomDefaults();
          this.agreementForm?.markAsPristine();
          this.agreementForm?.markAsUntouched();
        } else {
          this.agreementExists = false;
          this.resetAgreementForm();
          this.applyOfficeAgreementDefaults();
          this.agreementForm?.markAsPristine();
          this.agreementForm?.markAsUntouched();
        }
      },
      error: () => {
        this.agreementExists = false;
        this.resetAgreementForm();
        this.applyOfficeAgreementDefaults();
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
      }
    });
  }
  //#endregion

  //#region Get Methods
 get isAgreementDirty(): boolean {
    return !!this.agreementForm?.dirty;
  }

  get managementFlatRateFieldLabel(): string {
    const mode = this.agreementForm?.get('managementFeeMode')?.value;
    return mode === ManagementFeeType.Minimum ? 'Minimum Amount' : 'Flat Rate Amount';
  }

  get isPropertyManagementLease(): boolean {
    return normalizePropertyLeaseTypeId(this.propertyLeaseTypeId) === PropertyLeaseType.PropertyManagement;
  }

  get isVendorAttachmentMode(): boolean {
    return !this.isPropertyManagementLease;
  }

  get displayW9FileName(): string | null {
    return this.isVendorAttachmentMode ? this.vendorW9FileName : this.agreementW9FileName;
  }

  get displayW9FileDataUrl(): string | null {
    return this.isVendorAttachmentMode ? this.vendorW9FileDataUrl : this.agreementW9FileDataUrl;
  }

  get displayW9FileContentType(): string | null {
    return this.isVendorAttachmentMode ? this.vendorW9FileContentType : this.agreementW9FileContentType;
  }

  get displayW9PdfThumbnailUrl(): string | null {
    return this.isVendorAttachmentMode ? this.vendorW9PdfThumbnailUrl : this.agreementW9PdfThumbnailUrl;
  }

  get displayInsuranceFileName(): string | null {
    return this.isVendorAttachmentMode ? this.vendorInsuranceFileName : this.agreementInsuranceFileName;
  }

  get displayInsuranceFileDataUrl(): string | null {
    return this.isVendorAttachmentMode ? this.vendorInsuranceFileDataUrl : this.agreementInsuranceFileDataUrl;
  }

  get displayInsuranceFileContentType(): string | null {
    return this.isVendorAttachmentMode ? this.vendorInsuranceFileContentType : this.agreementInsuranceFileContentType;
  }

  get displayInsurancePdfThumbnailUrl(): string | null {
    return this.isVendorAttachmentMode ? this.vendorInsurancePdfThumbnailUrl : this.agreementInsurancePdfThumbnailUrl;
  }

  get vendorInsuranceExpirationDisplay(): string {
    if (!this.isVendorAttachmentMode) {
      return '';
    }

    const parsedDate = this.utilityService.parseDateOnlyStringToDate(this.vendorContact?.insuranceExpiration ?? null);
    return parsedDate ? this.formatterService.dateOnly(parsedDate) : 'Not provided';
  }
  //#endregion

  //#region Default Mapping Functions
  getAgreementOffice(): OfficeResponse | null {
    const resolvedOfficeId = this.officeId ?? this.agreementOfficeId;
    if (resolvedOfficeId == null || Number.isNaN(Number(resolvedOfficeId))) {
      return null;
    }
    return this.offices.find(o => o.officeId === Number(resolvedOfficeId)) ?? null;
  }

   applyFurnishedAndBedroomDefaults(): void {
    if (!this.agreementForm) {
      return;
    }

    const office = this.getAgreementOffice();
    if (!office) {
      return;
    }

    const patch = this.buildFurnishedAndBedroomDefaultPatch(office);
    if (Object.keys(patch).length === 0) {
      return;
    }

    this.agreementForm.patchValue(patch, { emitEvent: false });
  }

  /** Sync agreement fields from property context (furnished, bedrooms, office). */
  syncFromPropertyContext(markDirty = false): void {
    if (!this.agreementForm) {
      return;
    }
    if (this.agreementExists) {
      this.applyFurnishedAndBedroomDefaults();
    } else {
      this.applyOfficeAgreementDefaults();
    }
    if (markDirty) {
      this.agreementForm.markAsDirty();
    }
  }

  applyOfficeAgreementDefaults(): void {
    if (!this.agreementForm) {
      return;
    }

    const office = this.getAgreementOffice();
    if (!office) {
      return;
    }

    if (this.agreementForm.pristine) {
      const patch = this.buildOfficeAgreementDefaultPatch(office);
      if (Object.keys(patch).length > 0) {
        this.agreementForm.patchValue(patch, { emitEvent: false });
        this.syncManagementAgreementFieldState();
      }
      return;
    }

    const patch = this.buildFurnishedAndBedroomDefaultPatch(office);
    if (Object.keys(patch).length > 0) {
      this.agreementForm.patchValue(patch, { emitEvent: false });
    }
  }

  buildFurnishedAndBedroomDefaultPatch(office: OfficeResponse): Record<string, string | number | null> {
    const patch: Record<string, string | number | null> = {};
    const linenFee = this.resolveLinenTowelFeeFromOffice(office, this.bedrooms);
    if (linenFee != null) {
      patch['linenAndTowelFee'] = this.formatAgreementDecimalForDisplay(linenFee);
    }
    const rentCostCodes = this.getOfficeRentCostCodeDefaults(office);
    if (rentCostCodes.rentalIncomeCcId != null) {
      patch['rentalIncomeCcId'] = rentCostCodes.rentalIncomeCcId;
    }
    if (rentCostCodes.rentalExpenseCcId != null) {
      patch['rentalExpenseCcId'] = rentCostCodes.rentalExpenseCcId;
    }
    return patch;
  }

  getOfficeRentCostCodeDefaults(office: OfficeResponse): { rentalIncomeCcId: number | null; rentalExpenseCcId: number | null } {
    if (this.isFurnished) {
      return {
        rentalIncomeCcId: office.furnishedRentChargeCcId ?? null,
        rentalExpenseCcId: office.furnishedRentExpenseCcId ?? null
      };
    }
    return {
      rentalIncomeCcId: office.unfurnishedRentChargeCcId ?? null,
      rentalExpenseCcId: office.unfurnishedRentExpenseCcId ?? null
    };
  }

  buildOfficeAgreementDefaultPatch(office: OfficeResponse): Record<string, string | number | null> {
    const patch: Record<string, string | number | null> = {};
    if (office.defaultMarkup != null) {
      patch['markup'] = this.formatterService.formatPercentageValue(office.defaultMarkup, 0);
    }
    if (office.defaultRevenueSplitOwner != null) {
      patch['revenueSplitOwner'] = this.formatAgreementPercentForDisplay(office.defaultRevenueSplitOwner);
    }
    if (office.defaultRevenueSplitOffice != null) {
      patch['revenueSplitOffice'] = this.formatAgreementPercentForDisplay(office.defaultRevenueSplitOffice);
    }
    if (office.defaultWorkingCapitalBalance != null) {
      patch['workingCapitalBalance'] = this.formatAgreementDecimalForDisplay(office.defaultWorkingCapitalBalance);
    }
    if (office.defaultHourlyLaborCost != null) {
      patch['hourlyLaborCost'] = this.formatAgreementDecimalForDisplay(office.defaultHourlyLaborCost);
    }
    const linenFee = this.resolveLinenTowelFeeFromOffice(office, this.bedrooms);
    if (linenFee != null) {
      patch['linenAndTowelFee'] = this.formatAgreementDecimalForDisplay(linenFee);
    }
    const rentCostCodes = this.getOfficeRentCostCodeDefaults(office);
    if (rentCostCodes.rentalIncomeCcId != null) {
      patch['rentalIncomeCcId'] = rentCostCodes.rentalIncomeCcId;
    }
    if (rentCostCodes.rentalExpenseCcId != null) {
      patch['rentalExpenseCcId'] = rentCostCodes.rentalExpenseCcId;
    }
    return patch;
  }

  resolveLinenTowelFeeFromOffice(office: OfficeResponse, bedrooms: number | null | undefined): number | null {
    if (!this.isFurnished) {
      return 0;
    }
    const count = Number(bedrooms);
    if (!Number.isFinite(count) || count < 1 || count > 4) {
      return null;
    }
    switch (count) {
      case 1:
        return office.defaultLinenTowelOneBed ?? null;
      case 2:
        return office.defaultLinenTowelTwoBed ?? null;
      case 3:
        return office.defaultLinenTowelThreeBed ?? null;
      case 4:
        return office.defaultLinenTowelFourBed ?? null;
      default:
        return null;
    }
  }
  
  discardAndReloadIfDirty(): void {
    if (this.agreementForm?.dirty) {
      this.loadAgreement();
    }
  }

  buildPropertyAgreementRequest(): PropertyAgreementRequest {
    const v = this.agreementForm?.getRawValue();
    const insExp = this.utilityService.formatDateOnlyForApi(v?.insuranceExpiration);
    return {
      propertyId: this.propertyId,
      w9Path: this.agreementHasNewW9Upload ? undefined : (this.agreementW9Path ?? null),
      w9FileDetails: this.agreementHasNewW9Upload ? (this.agreementW9FileDetails ?? null) : undefined,
      insurancePath: this.agreementHasNewInsuranceUpload ? undefined : (this.agreementInsurancePath ?? null),
      insuranceFileDetails: this.agreementHasNewInsuranceUpload ? (this.agreementInsuranceFileDetails ?? null) : undefined,
      insuranceExpiration: insExp,
      agreementPath: this.agreementHasNewDocUpload ? undefined : (this.agreementDocPath ?? null),
      agreementFileDetails: this.agreementHasNewDocUpload ? (this.agreementDocFileDetails ?? null) : undefined,
      markup: this.formatterService.parsePercentageValue(v?.markup, 0),
      revenueSplitOwner:
        v?.managementFeeMode === ManagementFeeType.Percentage || v?.managementFeeMode === ManagementFeeType.Minimum
          ? this.parseAgreementPercentFromForm(v?.revenueSplitOwner)
          : null,
      revenueSplitOffice:
        v?.managementFeeMode === ManagementFeeType.Percentage || v?.managementFeeMode === ManagementFeeType.Minimum
          ? this.parseAgreementPercentFromForm(v?.revenueSplitOffice)
          : null,
      workingCapitalBalance: this.parseAgreementDecimalFromForm(v?.workingCapitalBalance),
      linenAndTowelFee: this.parseAgreementDecimalFromForm(v?.linenAndTowelFee),
      hourlyLaborCost: this.parseAgreementDecimalFromForm(v?.hourlyLaborCost),
      bankName: (v?.bankName || '').trim() || null,
      routingNumber: (v?.routingNumber || '').trim() || null,
      accountNumber: (v?.accountNumber || '').trim() || null,
      rentalIncomeCcId: v?.rentalIncomeCcId == null ? null : Number(v.rentalIncomeCcId),
      rentalExpenseCcId: v?.rentalExpenseCcId == null ? null : Number(v.rentalExpenseCcId),
      agreementLines: this.mapAgreementLinesToRequest(),
      notes: (v?.notes || '').trim() || null,
      managementFeeTypeId: normalizeManagementFeeTypeId(v?.managementFeeMode),
      flatRateAmount:
        v?.managementFeeMode === ManagementFeeType.Percentage
          ? null
          : this.parseAgreementDecimalFromForm(v?.managementFlatRateAmount)
    };
  }
  //#endregion

  //#region Cost Code Methods
  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe({
        next: (costCodes: CostCodesResponse[]) => {
          this.availableCostCodes = this.mapCostCodeOptions(costCodes || []);
          this.filterCostCodesByOffice();
        },
        error: () => {
          this.availableCostCodes = [];
        }
      });
    });
  }

  filterCostCodesByOffice(): void {
    const resolvedOfficeId = this.officeId ?? this.agreementOfficeId;
    if (!resolvedOfficeId) {
      this.availableCostCodes = [];
      return;
    }
    const officeCostCodes = this.costCodesService.getCostCodesForOffice(resolvedOfficeId)
      .filter(c => c.isActive);
    this.availableCostCodes = this.mapCostCodeOptions(officeCostCodes);
  }

  mapCostCodeOptions(costCodes: CostCodesResponse[]): { value: number, label: string }[] {
    return (costCodes || [])
      .map(c => {
        const parsedId = Number(c.costCodeId);
        if (isNaN(parsedId)) {
          return null;
        }
        return {
          value: parsedId,
          label: `${c.costCode} - ${c.description}`
        };
      })
      .filter((option): option is { value: number, label: string } => option !== null);
  }
  //#endregion

  //#region Agreement Line Methods
  populateAgreementLines(data: PropertyAgreementResponse): void {
    const sourceLines = data.agreementLines || [];
    this.agreementLines = sourceLines.map(line => ({
      agreementLineId: line.agreementLineId ?? null,
      title: (line.title || '').trim(),
      startDate: this.utilityService.parseCalendarDateInput(line.startDate ?? null),
      endDate: this.utilityService.parseCalendarDateInput(line.endDate ?? null),
      deposit: this.formatAgreementDecimalForDisplay(line.deposit),
      oneTime: this.formatAgreementDecimalForDisplay(line.oneTime),
      monthly: this.formatAgreementDecimalForDisplay(line.monthly),
      daily: this.formatAgreementDecimalForDisplay(line.daily)
    }));
  }

  addAgreementLine(): void {
    this.agreementLines.push({
      agreementLineId: null,
      title: '',
      startDate: null,
      endDate: null,
      deposit: '$0.00',
      oneTime: '$0.00',
      monthly: '$0.00',
      daily: '$0.00'
    });
    this.agreementForm?.markAsDirty();
  }

  removeAgreementLine(index: number): void {
    if (index < 0 || index >= this.agreementLines.length) {
      return;
    }
    this.agreementLines.splice(index, 1);
    this.agreementForm?.markAsDirty();
  }

  updateAgreementLineTitle(index: number, value: string): void {
    if (!this.agreementLines[index]) {
      return;
    }
    this.agreementLines[index].title = value || '';
    this.agreementForm?.markAsDirty();
  }

  updateAgreementLineDate(index: number, field: 'startDate' | 'endDate', value: Date | null): void {
    if (!this.agreementLines[index]) {
      return;
    }
    this.agreementLines[index][field] = value ? new Date(value) : null;
    this.agreementForm?.markAsDirty();
  }

  onAgreementLineAmountInput(event: Event, index: number, field: 'deposit' | 'oneTime' | 'monthly' | 'daily'): void {
    if (!this.agreementLines[index]) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const sanitized = (input.value || '').replace(/[^0-9.]/g, '');
    const normalized = sanitized.replace(/(\..*)\./g, '$1');
    input.value = normalized;
    this.agreementLines[index][field] = normalized;
    this.agreementForm?.markAsDirty();
  }

  onAgreementLineAmountFocus(event: Event, index: number, field: 'deposit' | 'oneTime' | 'monthly' | 'daily'): void {
    if (!this.agreementLines[index]) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const parsed = this.parseAgreementDecimalFromForm(this.agreementLines[index][field]);
    const editableValue = parsed == null ? '' : `${parsed}`;
    this.agreementLines[index][field] = editableValue;
    input.value = editableValue;
    input.select();
  }

  onAgreementLineAmountBlur(event: Event, index: number, field: 'deposit' | 'oneTime' | 'monthly' | 'daily'): void {
    if (!this.agreementLines[index]) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const parsed = this.parseAgreementDecimalFromForm(input.value);
    const formatted = this.formatAgreementCurrency(parsed ?? 0);
    this.agreementLines[index][field] = formatted;
    input.value = formatted;
    this.agreementForm?.markAsDirty();
  }

  mapAgreementLinesToRequest(): PropertyAgreementLineRequest[] {
    return (this.agreementLines || [])
      .filter(line => !this.isAgreementLineBlank(line))
      .map(line => ({
        agreementLineId: line.agreementLineId || null,
        title: (line.title || '').trim() || null,
        startDate: this.utilityService.toDateOnlyJsonString(line.startDate) ?? null,
        endDate: this.utilityService.toDateOnlyJsonString(line.endDate) ?? null,
        deposit: this.parseAgreementDecimalFromForm(line.deposit),
        oneTime: this.parseAgreementDecimalFromForm(line.oneTime),
        monthly: this.parseAgreementDecimalFromForm(line.monthly),
        daily: this.parseAgreementDecimalFromForm(line.daily)
      }));
  }

  validateAgreementLinesForSave(): { isValid: boolean; errorMessage?: string } {
    const lines = this.agreementLines || [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isAgreementLineBlank(line)) {
        continue;
      }
      const lineNumber = i + 1;
      if (!(line.title || '').trim()) {
        return { isValid: false, errorMessage: `Agreement Line ${lineNumber}: Title is required.` };
      }
      if (!line.startDate) {
        return { isValid: false, errorMessage: `Agreement Line ${lineNumber}: Start Date is required.` };
      }
      if (line.endDate && line.endDate < line.startDate) {
        return { isValid: false, errorMessage: `Agreement Line ${lineNumber}: End Date must be on or after Start Date.` };
      }
    }
    return { isValid: true };
  }

  isAgreementLineBlank(line: AgreementLineDisplay): boolean {
    const title = (line.title || '').trim();
    const hasDates = !!line.startDate || !!line.endDate;
    const deposit = this.parseAgreementDecimalFromForm(line.deposit) ?? 0;
    const oneTime = this.parseAgreementDecimalFromForm(line.oneTime) ?? 0;
    const monthly = this.parseAgreementDecimalFromForm(line.monthly) ?? 0;
    const daily = this.parseAgreementDecimalFromForm(line.daily) ?? 0;
    const hasAmounts = deposit !== 0 || oneTime !== 0 || monthly !== 0 || daily !== 0;
    return !title && !hasDates && !hasAmounts;
  }
  //#endregion

  //#region Vendor Attachment Methods
  loadVendorContactAttachments(): void {
    if (this.isPropertyManagementLease) {
      this.clearVendorAttachmentUi();
      return;
    }

    const vendorId = (this.vendorContactId || '').trim();
    if (!vendorId) {
      this.clearVendorAttachmentUi();
      return;
    }

    const cachedVendor = this.contactService.getAllContactsValue().find(c => c.contactId === vendorId) || null;
    if (cachedVendor) {
      this.populateVendorAttachmentUi(cachedVendor);
      return;
    }

    this.contactService.getContactByGuid(vendorId).pipe(take(1)).subscribe({
      next: contact => {
        this.populateVendorAttachmentUi(contact || null);
      },
      error: () => {
        this.clearVendorAttachmentUi();
      }
    });
  }

  populateVendorAttachmentUi(contact: ContactResponse | null): void {
    this.vendorContact = contact;

    const vendorW9Details = contact?.w9FileDetails ?? null;
    const vendorW9Path = contact?.w9Path ?? null;
    this.vendorW9FileDetails = vendorW9Details;
    this.vendorW9Path = vendorW9Path;
    this.vendorW9FileDataUrl = this.utilityService.resolveFileDetailsDataUrl(vendorW9Details, vendorW9Path);
    this.vendorW9FileContentType = (this.utilityService.getContentTypeFromDataUrl(this.vendorW9FileDataUrl) || vendorW9Details?.contentType || this.utilityService.getContentTypeFromPath(vendorW9Path) || '').trim() || null;
    this.vendorW9FileName = vendorW9Details?.fileName ?? vendorW9Path?.replace(/^.*[/\\]/, '') ?? null;
    this.setAgreementPdfThumbnail(this.vendorW9FileDataUrl, this.vendorW9FileContentType, u => { this.vendorW9PdfThumbnailUrl = u; });

    const vendorInsuranceDetails = contact?.insuranceFileDetails ?? null;
    const vendorInsurancePath = contact?.insurancePath ?? null;
    this.vendorInsuranceFileDetails = vendorInsuranceDetails;
    this.vendorInsurancePath = vendorInsurancePath;
    this.vendorInsuranceFileDataUrl = this.utilityService.resolveFileDetailsDataUrl(vendorInsuranceDetails, vendorInsurancePath);
    this.vendorInsuranceFileContentType = (this.utilityService.getContentTypeFromDataUrl(this.vendorInsuranceFileDataUrl) || vendorInsuranceDetails?.contentType || this.utilityService.getContentTypeFromPath(vendorInsurancePath) || '').trim() || null;
    this.vendorInsuranceFileName = vendorInsuranceDetails?.fileName ?? vendorInsurancePath?.replace(/^.*[/\\]/, '') ?? null;
    this.setAgreementPdfThumbnail(this.vendorInsuranceFileDataUrl, this.vendorInsuranceFileContentType, u => { this.vendorInsurancePdfThumbnailUrl = u; });
  }

  clearVendorAttachmentUi(): void {
    this.vendorContact = null;
    this.vendorW9FileName = null;
    this.vendorW9FileDataUrl = null;
    this.vendorW9FileContentType = null;
    this.vendorW9FileDetails = null;
    this.vendorW9Path = null;
    this.vendorW9PdfThumbnailUrl = null;
    this.vendorInsuranceFileName = null;
    this.vendorInsuranceFileDataUrl = null;
    this.vendorInsuranceFileContentType = null;
    this.vendorInsuranceFileDetails = null;
    this.vendorInsurancePath = null;
    this.vendorInsurancePdfThumbnailUrl = null;
  }
  //#endregion

  //#region W9 Methods
  populateAgreementW9(data: PropertyAgreementResponse): void {
    const fd = data.w9FileDetails;
    const path = data.w9Path;
    this.agreementHasNewW9Upload = false;
    const hasW9Details = !!(fd?.dataUrl || fd?.file);
    if (hasW9Details) {
      const resolvedDataUrl = this.utilityService.resolveFileDetailsDataUrl(fd, path);
      const resolvedContentType = (this.utilityService.getContentTypeFromDataUrl(resolvedDataUrl) || fd?.contentType || this.utilityService.getContentTypeFromPath(path) || '').trim() || null;
      this.agreementW9FileDetails = fd;
      this.agreementW9Path = path ?? null;
      this.agreementW9FileDataUrl = resolvedDataUrl;
      this.agreementW9FileContentType = resolvedContentType;
      this.agreementW9FileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'W9';
      this.setAgreementPdfThumbnail(this.agreementW9FileDataUrl, this.agreementW9FileContentType, u => { this.agreementW9PdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementW9Path = path;
      this.agreementW9FileDetails = null;
      this.agreementW9FileName = path.replace(/^.*[/\\]/, '') || 'W9';
      this.agreementW9FileDataUrl = null;
      this.agreementW9FileContentType = this.utilityService.getContentTypeFromPath(path);
      this.agreementW9PdfThumbnailUrl = null;
    } else {
      this.clearAgreementW9Ui();
    }
  }

  clearAgreementW9Ui(): void {
    this.agreementW9Path = null;
    this.agreementW9FileDetails = null;
    this.agreementW9FileName = null;
    this.agreementW9FileDataUrl = null;
    this.agreementW9FileContentType = null;
    this.agreementW9PdfThumbnailUrl = null;
    this.agreementHasNewW9Upload = false;
    if (this.agreementW9FileInputRef?.nativeElement) {
      this.agreementW9FileInputRef.nativeElement.value = '';
    }
  }

  getAgreementW9PreviewSource(): string | null {
    if (this.isVendorAttachmentMode) {
      if (this.vendorW9FileDataUrl?.startsWith('data:')) return this.vendorW9FileDataUrl;
      const vendorDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.vendorW9FileDetails, this.vendorW9Path);
      return vendorDataUrl?.startsWith('data:') ? vendorDataUrl : null;
    }
    if (this.agreementW9FileDataUrl?.startsWith('data:')) return this.agreementW9FileDataUrl;
    const detailsDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.agreementW9FileDetails, this.agreementW9Path);
    return detailsDataUrl?.startsWith('data:') ? detailsDataUrl : null;
  }

  onAgreementW9FileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.agreementW9FileName = null;
      this.agreementW9FileDataUrl = null;
      this.agreementW9FileContentType = null;
      this.agreementW9FileDetails = null;
      this.agreementW9PdfThumbnailUrl = null;
      return;
    }
    const file = input.files[0];
    this.agreementW9FileName = file.name;
    this.agreementW9FileContentType = file.type;
    this.agreementW9Path = null;
    this.agreementHasNewW9Upload = true;
    this.agreementW9FileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.agreementW9FileDataUrl = dataUrl;
      if (this.agreementW9FileDetails) {
        this.agreementW9FileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.agreementW9FileDetails.file = base64String ?? '';
      }
      this.setAgreementPdfThumbnail(dataUrl, file.type, u => { this.agreementW9PdfThumbnailUrl = u; });
    };
    reader.readAsDataURL(file);
    this.agreementForm?.markAsDirty();
  }

  openAgreementW9FilePicker(): void {
    this.agreementW9FileInputRef?.nativeElement?.click();
  }

  removeAgreementW9(): void {
    this.clearAgreementW9Ui();
    this.agreementForm?.markAsDirty();
  }

  openAgreementW9Preview(event?: Event): void {
    const imageSrc = this.getAgreementW9PreviewSource();
    this.openAgreementPreview(imageSrc, 'W9', event);
  }
  //#endregion

  //#region Agreement Insurance Methods
  populateAgreementInsurance(data: PropertyAgreementResponse): void {
    const fd = data.insuranceFileDetails;
    const path = data.insurancePath;
    this.agreementHasNewInsuranceUpload = false;
    const hasInsuranceDetails = !!(fd?.dataUrl || fd?.file);
    if (hasInsuranceDetails) {
      const resolvedDataUrl = this.utilityService.resolveFileDetailsDataUrl(fd, path);
      const resolvedContentType = (this.utilityService.getContentTypeFromDataUrl(resolvedDataUrl) || fd?.contentType || this.utilityService.getContentTypeFromPath(path) || '').trim() || null;
      this.agreementInsuranceFileDetails = fd;
      this.agreementInsurancePath = path ?? null;
      this.agreementInsuranceFileDataUrl = resolvedDataUrl;
      this.agreementInsuranceFileContentType = resolvedContentType;
      this.agreementInsuranceFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Insurance';
      this.setAgreementPdfThumbnail(this.agreementInsuranceFileDataUrl, this.agreementInsuranceFileContentType, u => { this.agreementInsurancePdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementInsurancePath = path;
      this.agreementInsuranceFileDetails = null;
      this.agreementInsuranceFileName = path.replace(/^.*[/\\]/, '') || 'Insurance';
      this.agreementInsuranceFileDataUrl = null;
      this.agreementInsuranceFileContentType = this.utilityService.getContentTypeFromPath(path);
      this.agreementInsurancePdfThumbnailUrl = null;
    } else {
      this.clearAgreementInsuranceUi();
    }
  }

  clearAgreementInsuranceUi(): void {
    this.agreementInsurancePath = null;
    this.agreementInsuranceFileDetails = null;
    this.agreementInsuranceFileName = null;
    this.agreementInsuranceFileDataUrl = null;
    this.agreementInsuranceFileContentType = null;
    this.agreementInsurancePdfThumbnailUrl = null;
    this.agreementHasNewInsuranceUpload = false;
    if (this.agreementInsuranceFileInputRef?.nativeElement) {
      this.agreementInsuranceFileInputRef.nativeElement.value = '';
    }
  }

  getAgreementInsurancePreviewSource(): string | null {
    if (this.isVendorAttachmentMode) {
      if (this.vendorInsuranceFileDataUrl?.startsWith('data:')) return this.vendorInsuranceFileDataUrl;
      const vendorDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.vendorInsuranceFileDetails, this.vendorInsurancePath);
      return vendorDataUrl?.startsWith('data:') ? vendorDataUrl : null;
    }
    if (this.agreementInsuranceFileDataUrl?.startsWith('data:')) return this.agreementInsuranceFileDataUrl;
    const detailsDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.agreementInsuranceFileDetails, this.agreementInsurancePath);
    return detailsDataUrl?.startsWith('data:') ? detailsDataUrl : null;
  }

  onAgreementInsuranceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.agreementInsuranceFileName = null;
      this.agreementInsuranceFileDataUrl = null;
      this.agreementInsuranceFileContentType = null;
      this.agreementInsuranceFileDetails = null;
      this.agreementInsurancePdfThumbnailUrl = null;
      return;
    }
    const file = input.files[0];
    this.agreementInsuranceFileName = file.name;
    this.agreementInsuranceFileContentType = file.type;
    this.agreementInsurancePath = null;
    this.agreementHasNewInsuranceUpload = true;
    this.agreementInsuranceFileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.agreementInsuranceFileDataUrl = dataUrl;
      if (this.agreementInsuranceFileDetails) {
        this.agreementInsuranceFileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.agreementInsuranceFileDetails.file = base64String ?? '';
      }
      this.setAgreementPdfThumbnail(dataUrl, file.type, u => { this.agreementInsurancePdfThumbnailUrl = u; });
    };
    reader.readAsDataURL(file);
    this.agreementForm?.markAsDirty();
  }

  openAgreementInsuranceFilePicker(): void {
    this.agreementInsuranceFileInputRef?.nativeElement?.click();
  }

  removeAgreementInsurance(): void {
    this.clearAgreementInsuranceUi();
    this.agreementForm?.markAsDirty();
  }

  openAgreementInsurancePreview(event?: Event): void {
    const imageSrc = this.getAgreementInsurancePreviewSource();
    this.openAgreementPreview(imageSrc, 'Insurance', event);
  }
  //#endregion

  //#region Agreement Doc Methods
  populateAgreementDoc(data: PropertyAgreementResponse): void {
    const fd = data.agreementFileDetails;
    const path = data.agreementPath;
    this.agreementHasNewDocUpload = false;
    const hasDocDetails = !!(fd?.dataUrl || fd?.file);
    if (hasDocDetails) {
      const resolvedDataUrl = this.utilityService.resolveFileDetailsDataUrl(fd, path);
      const resolvedContentType = (this.utilityService.getContentTypeFromDataUrl(resolvedDataUrl) || fd?.contentType || this.utilityService.getContentTypeFromPath(path) || '').trim() || null;
      this.agreementDocFileDetails = fd;
      this.agreementDocPath = path ?? null;
      this.agreementDocFileDataUrl = resolvedDataUrl;
      this.agreementDocFileContentType = resolvedContentType;
      this.agreementDocFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Agreement';
      this.setAgreementPdfThumbnail(this.agreementDocFileDataUrl, this.agreementDocFileContentType, u => { this.agreementDocPdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementDocPath = path;
      this.agreementDocFileDetails = null;
      this.agreementDocFileName = path.replace(/^.*[/\\]/, '') || 'Agreement';
      this.agreementDocFileDataUrl = null;
      this.agreementDocFileContentType = this.utilityService.getContentTypeFromPath(path);
      this.agreementDocPdfThumbnailUrl = null;
    } else {
      this.clearAgreementDocUi();
    }
  }

  clearAgreementDocUi(): void {
    this.agreementDocPath = null;
    this.agreementDocFileDetails = null;
    this.agreementDocFileName = null;
    this.agreementDocFileDataUrl = null;
    this.agreementDocFileContentType = null;
    this.agreementDocPdfThumbnailUrl = null;
    this.agreementHasNewDocUpload = false;
    if (this.agreementDocFileInputRef?.nativeElement) {
      this.agreementDocFileInputRef.nativeElement.value = '';
    }
  }

  getAgreementDocPreviewSource(): string | null {
    if (this.agreementDocFileDataUrl?.startsWith('data:')) return this.agreementDocFileDataUrl;
    const detailsDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.agreementDocFileDetails, this.agreementDocPath);
    return detailsDataUrl?.startsWith('data:') ? detailsDataUrl : null;
  }
  onAgreementDocFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.agreementDocFileName = null;
      this.agreementDocFileDataUrl = null;
      this.agreementDocFileContentType = null;
      this.agreementDocFileDetails = null;
      this.agreementDocPdfThumbnailUrl = null;
      return;
    }
    const file = input.files[0];
    this.agreementDocFileName = file.name;
    this.agreementDocFileContentType = file.type;
    this.agreementDocPath = null;
    this.agreementHasNewDocUpload = true;
    this.agreementDocFileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.agreementDocFileDataUrl = dataUrl;
      if (this.agreementDocFileDetails) {
        this.agreementDocFileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.agreementDocFileDetails.file = base64String ?? '';
      }
      this.setAgreementPdfThumbnail(dataUrl, file.type, u => { this.agreementDocPdfThumbnailUrl = u; });
    };
    reader.readAsDataURL(file);
    this.agreementForm?.markAsDirty();
  }

  removeAgreementDoc(): void {
    this.clearAgreementDocUi();
    this.agreementForm?.markAsDirty();
  }

  openAgreementDocPreview(event?: Event): void {
    const imageSrc = this.getAgreementDocPreviewSource();
    this.openAgreementPreview(imageSrc, 'Agreement', event);
  }
  //#endregion

  //#region Formatting Methods
  onAgreementMarkupInput(event: Event): void {
    this.formatterService.formatPercentageInput(event, this.agreementForm?.get('markup') ?? null);
    this.agreementForm?.markAsDirty();
  }

  clearAgreementMarkupOnFocus(event: FocusEvent): void {
    this.formatterService.clearPercentageOnFocus(event, this.agreementForm?.get('markup') ?? null);
  }

  formatAgreementMarkupOnBlur(): void {
    this.formatterService.formatPercentageOnBlur(this.agreementForm?.get('markup') ?? null, 0);
  }

  formatAgreementMarkupOnEnter(event: KeyboardEvent): void {
    this.formatterService.formatPercentageOnEnter(event, this.agreementForm?.get('markup') ?? null, 0);
  }

  formatAgreementPercentForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '0%';
    }
    const n = Number(String(value).replace(/%\s*$/, ''));
    return isNaN(n) ? '0%' : `${n}%`;
  }

  formatAgreementDecimalForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '$0.00';
    }
    const n = Number(String(value).replace(/[$,]/g, ''));
    return isNaN(n) ? '$0.00' : this.formatAgreementCurrency(n);
  }

  formatAgreementCurrency(n: number): string {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  parseAgreementPercentFromForm(value: string | number | null | undefined): number | null {
    if (value == null || value === '') {
      return 0;
    }
    const s = String(value).replace(/%\s*$/, '').trim();
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  parseAgreementDecimalFromForm(value: string | number | null | undefined): number | null {
    if (value == null || value === '') {
      return 0;
    }
    const s = String(value).replace(/[$,\s]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  syncManagementAgreementFieldState(): void {
    if (!this.agreementForm) {
      return;
    }
    const mode = this.agreementForm.get('managementFeeMode')?.value;
    const flat = this.agreementForm.get('managementFlatRateAmount');
    const owner = this.agreementForm.get('revenueSplitOwner');
    const office = this.agreementForm.get('revenueSplitOffice');
    if (mode === ManagementFeeType.Percentage) {
      flat?.disable({ emitEvent: false });
      owner?.enable({ emitEvent: false });
      office?.enable({ emitEvent: false });
    } else if (mode === ManagementFeeType.Minimum) {
      flat?.enable({ emitEvent: false });
      owner?.enable({ emitEvent: false });
      office?.enable({ emitEvent: false });
    } else {
      flat?.enable({ emitEvent: false });
      owner?.disable({ emitEvent: false });
      office?.disable({ emitEvent: false });
    }
  }

  formatAgreementPercentBlur(controlName: 'revenueSplitOwner' | 'revenueSplitOffice'): void {
    const c = this.agreementForm?.get(controlName);
    const v = c?.value;
    if (v == null || v === '') {
      c?.setValue('0%', { emitEvent: false });
      return;
    }
    const s = String(v).replace(/%\s*$/, '').trim();
    const n = Number(s);
    c?.setValue(isNaN(n) ? '0%' : `${n}%`, { emitEvent: false });
    this.agreementForm?.markAsDirty();
  }

  formatAgreementDecimalBlur(controlName: 'workingCapitalBalance' | 'linenAndTowelFee' | 'managementFlatRateAmount' | 'hourlyLaborCost'): void {
    const c = this.agreementForm?.get(controlName);
    const v = c?.value;
    if (v == null || v === '') {
      c?.setValue('$0.00', { emitEvent: false });
      return;
    }
    const n = this.parseAgreementDecimalFromForm(v);
    c?.setValue(n == null ? '$0.00' : this.formatAgreementCurrency(n), { emitEvent: false });
    this.agreementForm?.markAsDirty();
  }

  allowAgreementNumericOnly(event: KeyboardEvent, allowDecimal: boolean): void {
    const key = event.key;
    if (['Backspace', 'Tab', 'End', 'Home', 'ArrowLeft', 'ArrowRight', 'Delete'].includes(key)) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (['a', 'c', 'v', 'x'].includes(key.toLowerCase())) {
        return;
      }
    }
    const pattern = allowDecimal ? /[0-9.]/ : /[0-9]/;
    if (!pattern.test(key)) {
      event.preventDefault();
    }
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }
  //#endregion

  //#region Utility Methods
  setAgreementPdfThumbnail(dataUrl: string | null, contentType: string | null, setter: (url: string | null) => void): void {
    if (!dataUrl || !contentType?.toLowerCase().includes('pdf')) {
      setter(null);
      return;
    }
    setter(null);
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => setter(url));
  }

  openAgreementPreview(imageSrc: string | null, title: string, event?: Event): void {
    event?.stopPropagation();
    if (!imageSrc || !String(imageSrc).startsWith('data:')) {
      this.toastr.warning('Unable to preview this file because file bytes are unavailable.');
      return;
    }
    const queryParams: Record<string, string> = {
      returnTo: 'propertyAgreement',
      propertyId: this.propertyId
    };
    const currentTab = this.route.snapshot.queryParamMap.get('tab');
    const currentOfficeId = this.route.snapshot.queryParamMap.get('officeId');
    if (currentTab) {
      queryParams['tab'] = currentTab;
    }
    if (currentOfficeId) {
      queryParams['officeId'] = currentOfficeId;
    }
    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.DocumentView, ['inline-preview'])],
      {
        queryParams,
        state: {
          inlineDocument: {
            dataUrl: imageSrc,
            contentType: this.getAgreementAttachmentContentType(title),
            fileName: title
          }
        }
      }
    );
  }

  getAgreementAttachmentContentType(title: string): string | null {
    if (this.isVendorAttachmentMode) {
      const normalizedVendorTitle = title.toLowerCase();
      if (normalizedVendorTitle.includes('insurance')) {
        return this.vendorInsuranceFileContentType
          || this.vendorInsuranceFileDetails?.contentType
          || this.utilityService.getContentTypeFromPath(this.vendorInsurancePath)
          || this.utilityService.getContentTypeFromDataUrl(this.getAgreementInsurancePreviewSource())
          || null;
      }
      return this.vendorW9FileContentType
        || this.vendorW9FileDetails?.contentType
        || this.utilityService.getContentTypeFromPath(this.vendorW9Path)
        || this.utilityService.getContentTypeFromDataUrl(this.getAgreementW9PreviewSource())
        || null;
    }

    const normalized = title.toLowerCase();
    if (normalized.includes('insurance')) {
      return this.agreementInsuranceFileContentType
        || this.agreementInsuranceFileDetails?.contentType
        || this.utilityService.getContentTypeFromPath(this.agreementInsurancePath)
        || this.utilityService.getContentTypeFromDataUrl(this.getAgreementInsurancePreviewSource())
        || null;
    }
    if (normalized.includes('agreement')) {
      return this.agreementDocFileContentType
        || this.agreementDocFileDetails?.contentType
        || this.utilityService.getContentTypeFromPath(this.agreementDocPath)
        || this.utilityService.getContentTypeFromDataUrl(this.getAgreementDocPreviewSource())
        || null;
    }
    return this.agreementW9FileContentType
      || this.agreementW9FileDetails?.contentType
      || this.utilityService.getContentTypeFromPath(this.agreementW9Path)
      || this.utilityService.getContentTypeFromDataUrl(this.getAgreementW9PreviewSource())
      || null;
  }

  hasPersistedAgreement(data: PropertyAgreementResponse | null | undefined): data is PropertyAgreementResponse {
    return !!data && typeof data.propertyId === 'string' && data.propertyId.trim().length > 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
