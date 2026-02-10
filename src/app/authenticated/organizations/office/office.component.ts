import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { OfficeService } from '../services/office.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { OfficeResponse, OfficeRequest } from '../models/office.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { CommonService } from '../../../services/common.service';
import { fileValidator } from '../../../validators/file-validator';
import { FileDetails } from '../../../shared/models/fileDetails';

@Component({
  selector: 'app-office',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './office.component.html',
  styleUrl: './office.component.scss'
})

export class OfficeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() organizationId: string | null = null; // Organization ID from parent (for SuperAdmin)
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeOfficeId: string | null = null;
  office: OfficeResponse;
  form: FormGroup;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  originalLogoPath: string = null; // Track original logo to detect removal
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  states: string[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public officeService: OfficeService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,
    private navigationContext: NavigationContextService,
    private commonService: CommonService
  ) {
  }

  //#region Office
  ngOnInit(): void {
    this.loadStates();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new' || this.id === 'new';
      if (this.isAddMode) {
        this.removeLoadItem('office');
        this.buildForm();
      } else {
        this.getOffice(this.id.toString());
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If id changes, reload office
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getOffice(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('office');
        this.buildForm();
      }
    }
  }

  getOffice(id?: string | number): void {
    const idToUse = id || this.id || this.routeOfficeId;
    if (!idToUse || idToUse === 'new') {
      return;
    }

    const officeIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(officeIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid office ID', CommonMessage.Error);
      return;
    }

    this.officeService.getOfficeById(officeIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('office'); })).subscribe({
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
          this.originalLogoPath = response.logoPath; // Track original for removal detection
        }
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load office info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('office');
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
      parkingLowEnd: formValue.parkingLowEnd ? parseFloat(formValue.parkingLowEnd.toString()) : 0,
      parkingHighEnd: formValue.parkingHighEnd ? parseFloat(formValue.parkingHighEnd.toString()) : 0
    };

    if (this.isAddMode) {
      this.officeService.createOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: OfficeResponse) => {
          this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          // Reload offices globally to ensure all components have the latest data
          this.officeService.loadAllOffices();
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Create office request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeOfficeId;
      const officeIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(officeIdNum)) {
        this.toastr.error('Invalid office ID', CommonMessage.Error);
        this.isSubmitting = false;
        return;
      }
      officeRequest.officeId = officeIdNum;
      officeRequest.organizationId = this.organizationId || this.office?.organizationId || user?.organizationId || '';
      this.officeService.updateOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: OfficeResponse) => {
          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          // Reload offices globally to ensure all components have the latest data including fileDetails
          this.officeService.loadAllOffices();
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update office request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
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
      fileUpload: new FormControl(null, { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isInternational: new FormControl(false),
      isActive: new FormControl(true),
      // Configuration fields
      maintenanceEmail: new FormControl<string>('', [Validators.required, Validators.email]),
      afterHoursPhone: new FormControl<string>('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      afterHoursInstructions: new FormControl<string>(''),
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
      parkingLowEnd: new FormControl<string>('0.00', [Validators.required]),
      parkingHighEnd: new FormControl<string>('0.00', [Validators.required])
    });

    // Setup conditional validation for international addresses
    this.setupConditionalFields();
  }

  setupConditionalFields(): void {
    this.form.get('isInternational')?.valueChanges.subscribe(isInternational => {
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
          parkingLowEnd: this.office.parkingLowEnd !== null && this.office.parkingLowEnd !== undefined ? this.office.parkingLowEnd.toFixed(2) : '0.00',
          parkingHighEnd: this.office.parkingHighEnd !== null && this.office.parkingHighEnd !== undefined ? this.office.parkingHighEnd.toFixed(2) : '0.00'
        });
      }, 0);
    }
  }
  //#endregion

  //#region Logo methods
  upload(event: Event): void {
    if (!this.form) return;
    this.isUploadingLogo = true;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      this.fileName = file.name;
      this.form.patchValue({ fileUpload: file });
      this.form.get('fileUpload')?.updateValueAndValidity();
      this.logoPath = null; // Clear existing logo path when new file is selected
      this.hasNewFileUpload = true; // Mark that this is a new file upload

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '', dataUrl: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // readAsDataURL returns a data URL (e.g., "data:image/png;base64,iVBORw0KG...")
        const dataUrl = fileReader.result as string;
        if (this.fileDetails) {
          this.fileDetails.dataUrl = dataUrl;
          // Extract base64 string from data URL for API upload
          // Format: "data:image/png;base64,iVBORw0KG..." -> extract part after comma
          const base64String = dataUrl.split(',')[1];
          this.fileDetails.file = base64String;
        }
        this.isUploadingLogo = false;
      };
      fileReader.readAsDataURL(file);
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
    // Note: originalLogoPath is kept to detect if logo was removed vs never existed
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

  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
  }
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('officeCode'));
  }

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }

//#endregion
}

