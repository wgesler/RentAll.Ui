import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, catchError, filter, finalize, map, of, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { FileDetails } from '../../documents/models/document.model';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { ManagementFeeType, normalizeManagementFeeTypeId } from '../models/property-enums';
import { PropertyAgreementRequest, PropertyAgreementResponse } from '../models/property-agreement.model';
import { PropertyAgreementService } from '../services/property-agreement.service';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';

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
  @Input({ required: true }) isAdmin!: boolean;
  @Input() officeId: number | null = null;

  readonly ManagementFeeType = ManagementFeeType;
  agreementForm: FormGroup | null = null;
  agreementExists = false;
  isAgreementLoading = false;
  isAgreementSaving = false;
  availableCostCodes: { value: number, label: string }[] = [];
  agreementOfficeId: number | null = null;

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
  
  destroy$ = new Subject<void>();

  @ViewChild('agreementW9FileInput') agreementW9FileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('agreementInsuranceFileInput') agreementInsuranceFileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('agreementDocFileInput') agreementDocFileInputRef: ElementRef<HTMLInputElement> | null = null;

  get isAgreementDirty(): boolean {
    return !!this.agreementForm?.dirty;
  }

  get managementFlatRateFieldLabel(): string {
    const mode = this.agreementForm?.get('managementFeeMode')?.value;
    return mode === ManagementFeeType.Minimum ? 'Minimum Amount' : 'Flat Rate Amount';
  }

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private propertyAgreementService: PropertyAgreementService,
    private costCodesService: CostCodesService,
    private pdfThumbnailService: PdfThumbnailService,
    private dialog: MatDialog
  ) {}

  //#region Property Agreement
  ngOnInit(): void {
    this.buildAgreementForm();
    this.loadCostCodes();
    this.loadPropertyAgreement();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.agreementForm) {
      return;
    }
    const id = changes['propertyId'];
    const add = changes['isAddMode'];
    const adm = changes['isAdmin'];
    const shouldReload =
      (id && !id.firstChange) ||
      (add && !add.firstChange) ||
      (adm && !adm.firstChange);
    const office = changes['officeId'];
    if (office && !office.firstChange) {
      this.filterCostCodesByOffice();
    }
    if (shouldReload) {
      this.loadPropertyAgreement();
    }
  }

  saveAgreement(): void {
    if (!this.propertyId || this.propertyId === 'new' || this.isAddMode || !this.isAdmin || !this.agreementForm) {
      return;
    }
    if (!this.agreementForm.valid) {
      this.agreementForm.markAllAsTouched();
      return;
    }

    this.isAgreementSaving = true;
    const payload = this.buildPropertyAgreementRequest();
    const req$ = this.agreementExists
      ? this.propertyAgreementService.updatePropertyAgreement(payload)
      : this.propertyAgreementService.createPropertyAgreement(payload);
    req$.pipe(take(1), finalize(() => { this.isAgreementSaving = false; })).subscribe({
      next: (saved: PropertyAgreementResponse) => {
        this.toastr.success('Property agreement saved', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.agreementExists = true;
        this.populatePropertyAgreement(saved);
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
      },
      error: () => {
        this.toastr.error('Failed to save property agreement', CommonMessage.Error);
      }
    });
  }

  persistAgreementForNewProperty(propertyId: string): Observable<boolean> {
    if (!this.isAdmin || !this.agreementForm || !propertyId) {
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
    const payload: PropertyAgreementRequest = {
      ...this.buildPropertyAgreementRequest(),
      propertyId
    };
    this.isAgreementSaving = true;
    return this.propertyAgreementService.createPropertyAgreement(payload).pipe(
      take(1),
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
    const d = this.getAgreementFormDefaultValues();
    this.agreementForm = this.fb.group({
      markup: new FormControl(d.markup),
      revenueSplitOwner: new FormControl<string>(d.revenueSplitOwner),
      revenueSplitOffice: new FormControl<string>(d.revenueSplitOffice),
      workingCapitalBalance: new FormControl<string>(d.workingCapitalBalance),
      linenAndTowelFee: new FormControl<string>(d.linenAndTowelFee),
      bankName: new FormControl(d.bankName),
      routingNumber: new FormControl(d.routingNumber),
      accountNumber: new FormControl(d.accountNumber),
      notes: new FormControl(d.notes),
      insuranceExpiration: new FormControl<Date | null>(d.insuranceExpiration),
      managementFeeMode: new FormControl<ManagementFeeType>(d.managementFeeMode),
      managementFlatRateAmount: new FormControl<string>(d.managementFlatRateAmount),
      rentalIncomeCcId: new FormControl<number | null>(d.rentalIncomeCcId),
      rentalExpenseCcId: new FormControl<number | null>(d.rentalExpenseCcId)
    });
    this.agreementForm.get('managementFeeMode')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncManagementAgreementFieldState();
    });
    this.syncManagementAgreementFieldState();
  }

  populatePropertyAgreement(data: PropertyAgreementResponse): void {
    if (!this.agreementForm) {
      return;
    }
    const insuranceExpirationDate = this.utilityService.parseApiDateOnlyToDate(data.insuranceExpiration ?? null);
    this.agreementForm.patchValue({
      markup: this.formatterService.formatPercentageValue(data.markup, 25),
      revenueSplitOwner: this.formatAgreementPercentForDisplay(data.revenueSplitOwner),
      revenueSplitOffice: this.formatAgreementPercentForDisplay(data.revenueSplitOffice),
      workingCapitalBalance: this.formatAgreementDecimalForDisplay(data.workingCapitalBalance),
      linenAndTowelFee: this.formatAgreementDecimalForDisplay(data.linenAndTowelFee),
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
  }
  //#endregion

  //#region Property Agreement Methods
  loadPropertyAgreement(): void {
    if (!this.propertyId || !this.isAdmin || !this.agreementForm) {
      return;
    }
    if (this.isAddMode) {
      this.resetAgreementToDefaults();
      this.agreementForm.markAsPristine();
      this.agreementForm.markAsUntouched();
      return;
    }
    this.isAgreementLoading = true;
    this.propertyAgreementService.getPropertyAgreement(this.propertyId).pipe(take(1), finalize(() => { this.isAgreementLoading = false; })).subscribe({
      next: (data: PropertyAgreementResponse | null) => {
        if (!this.hasPersistedAgreement(data)) {
          this.agreementExists = false;
          this.resetAgreementToDefaults();
          this.agreementForm?.markAsPristine();
          this.agreementForm?.markAsUntouched();
          return;
        }
        this.agreementExists = true;
        this.populatePropertyAgreement(data);
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
      },
      error: (err: HttpErrorResponse) => {
        this.agreementExists = false;
        if (err.status !== 404 && err.status !== 200 && err.status !== 204) {
          this.toastr.error('Failed to load property agreement', CommonMessage.Error);
        }
        this.resetAgreementToDefaults();
        this.agreementForm?.markAsPristine();
        this.agreementForm?.markAsUntouched();
      }
    });
  }

  resetAgreementToDefaults(): void {
    if (!this.agreementForm) {
      return;
    }
    this.agreementExists = false;
    this.agreementOfficeId = this.officeId ?? null;
    this.agreementForm.reset(this.getAgreementFormDefaultValues(), { emitEvent: false });
    this.filterCostCodesByOffice();
    this.syncManagementAgreementFieldState();
    this.clearAgreementW9Ui();
    this.clearAgreementInsuranceUi();
    this.clearAgreementDocUi();
  } 
  
  discardAndReloadIfDirty(): void {
    if (this.agreementForm?.dirty) {
      this.loadPropertyAgreement();
    }
  }

  getAgreementFormDefaultValues(): {
    markup: string;
    revenueSplitOwner: string;
    revenueSplitOffice: string;
    workingCapitalBalance: string;
    linenAndTowelFee: string;
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    notes: string;
    insuranceExpiration: null;
    managementFeeMode: ManagementFeeType;
    managementFlatRateAmount: string;
    rentalIncomeCcId: null;
    rentalExpenseCcId: null;
  } {
    return {
      markup: '0%',
      revenueSplitOwner: '0%',
      revenueSplitOffice: '0%',
      workingCapitalBalance: '$0.00',
      linenAndTowelFee: '$0.00',
      bankName: '',
      routingNumber: '',
      accountNumber: '',
      notes: '',
      insuranceExpiration: null,
      managementFeeMode: ManagementFeeType.FlatRate,
      managementFlatRateAmount: '$0.00',
      rentalIncomeCcId: null,
      rentalExpenseCcId: null
    };
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
      bankName: (v?.bankName || '').trim() || null,
      routingNumber: (v?.routingNumber || '').trim() || null,
      accountNumber: (v?.accountNumber || '').trim() || null,
      rentalIncomeCcId: v?.rentalIncomeCcId == null ? null : Number(v.rentalIncomeCcId),
      rentalExpenseCcId: v?.rentalExpenseCcId == null ? null : Number(v.rentalExpenseCcId),
      notes: (v?.notes || '').trim() || null,
      managementFeeTypeId: normalizeManagementFeeTypeId(v?.managementFeeMode),
      flatRateAmount:
        v?.managementFeeMode === ManagementFeeType.Percentage
          ? null
          : this.parseAgreementDecimalFromForm(v?.managementFlatRateAmount)
    };
  }
  //#endregion

  //#region Data Loading Methods
  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1), takeUntil(this.destroy$)).subscribe(() => {
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

  //#region W9 Methods
  populateAgreementW9(data: PropertyAgreementResponse): void {
    const fd = data.w9FileDetails;
    const path = data.w9Path;
    this.agreementHasNewW9Upload = false;
    if (fd?.file && fd?.contentType) {
      this.agreementW9FileDetails = fd;
      this.agreementW9Path = path ?? null;
      this.agreementW9FileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.agreementW9FileContentType = fd.contentType;
      this.agreementW9FileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'W9';
      this.setAgreementPdfThumbnail(this.agreementW9FileDataUrl, fd.contentType, u => { this.agreementW9PdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementW9Path = path;
      this.agreementW9FileDetails = null;
      this.agreementW9FileName = path.replace(/^.*[/\\]/, '') || 'W9';
      this.agreementW9FileDataUrl = null;
      this.agreementW9FileContentType = null;
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

  removeAgreementW9(): void {
    this.clearAgreementW9Ui();
    this.agreementForm?.markAsDirty();
  }

  openAgreementW9Preview(event?: Event): void {
    const imageSrc = this.agreementW9FileContentType?.startsWith('image/')
      ? this.agreementW9FileDataUrl
      : this.agreementW9PdfThumbnailUrl;
    this.openAgreementPreview(imageSrc, 'W9', event);
  }
  //#endregion

  //#region Agreement Insurance Methods
  populateAgreementInsurance(data: PropertyAgreementResponse): void {
    const fd = data.insuranceFileDetails;
    const path = data.insurancePath;
    this.agreementHasNewInsuranceUpload = false;
    if (fd?.file && fd?.contentType) {
      this.agreementInsuranceFileDetails = fd;
      this.agreementInsurancePath = path ?? null;
      this.agreementInsuranceFileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.agreementInsuranceFileContentType = fd.contentType;
      this.agreementInsuranceFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Insurance';
      this.setAgreementPdfThumbnail(this.agreementInsuranceFileDataUrl, fd.contentType, u => { this.agreementInsurancePdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementInsurancePath = path;
      this.agreementInsuranceFileDetails = null;
      this.agreementInsuranceFileName = path.replace(/^.*[/\\]/, '') || 'Insurance';
      this.agreementInsuranceFileDataUrl = null;
      this.agreementInsuranceFileContentType = null;
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

  removeAgreementInsurance(): void {
    this.clearAgreementInsuranceUi();
    this.agreementForm?.markAsDirty();
  }

  openAgreementInsurancePreview(event?: Event): void {
    const imageSrc = this.agreementInsuranceFileContentType?.startsWith('image/')
      ? this.agreementInsuranceFileDataUrl
      : this.agreementInsurancePdfThumbnailUrl;
    this.openAgreementPreview(imageSrc, 'Insurance', event);
  }
  //#endregion

  //#region Agreement Doc Methods
  populateAgreementDoc(data: PropertyAgreementResponse): void {
    const fd = data.agreementFileDetails;
    const path = data.agreementPath;
    this.agreementHasNewDocUpload = false;
    if (fd?.file && fd?.contentType) {
      this.agreementDocFileDetails = fd;
      this.agreementDocPath = path ?? null;
      this.agreementDocFileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.agreementDocFileContentType = fd.contentType;
      this.agreementDocFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Agreement';
      this.setAgreementPdfThumbnail(this.agreementDocFileDataUrl, fd.contentType, u => { this.agreementDocPdfThumbnailUrl = u; });
    } else if (path) {
      this.agreementDocPath = path;
      this.agreementDocFileDetails = null;
      this.agreementDocFileName = path.replace(/^.*[/\\]/, '') || 'Agreement';
      this.agreementDocFileDataUrl = null;
      this.agreementDocFileContentType = null;
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
    const imageSrc = this.agreementDocFileContentType?.startsWith('image/')
      ? this.agreementDocFileDataUrl
      : this.agreementDocPdfThumbnailUrl;
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

  formatAgreementDecimalBlur(controlName: 'workingCapitalBalance' | 'linenAndTowelFee' | 'managementFlatRateAmount'): void {
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
    if (!imageSrc) {
      return;
    }
    const data: ImageViewDialogData = { imageSrc, title };
    this.dialog.open(ImageViewDialogComponent, { data, width: '70vw', maxWidth: '520px' });
  }

  hasPersistedAgreement(data: PropertyAgreementResponse | null | undefined): data is PropertyAgreementResponse {
    return !!data && typeof data.propertyId === 'string' && data.propertyId.trim().length > 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
