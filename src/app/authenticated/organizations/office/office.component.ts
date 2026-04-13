import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
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

export class OfficeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() organizationId: string | null = null; // Organization ID from parent (for SuperAdmin)
  @Input() copyFrom: OfficeResponse | null = null; // When set in add mode, form is pre-filled (name cleared)
  @Output() backEvent = new EventEmitter<void>();
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;
  
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
  destroy$ = new Subject<void>();

  constructor(
    public officeService: OfficeService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,
    private navigationContext: NavigationContextService,
    private commonService: CommonService,
    private userService: UserService,
    private utilityService: UtilityService
  ) {
  }

  //#region Office
  ngOnInit(): void {
    this.loadStates();
    // Check for returnTo query parameter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Copy-from state when navigating from list (non-embedded)
    const nav = this.router.getCurrentNavigation();
    if (nav?.extras?.state?.['copyFrom'] && !this.copyFrom) {
      this.copyFrom = nav.extras.state['copyFrom'] as OfficeResponse;
    }

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
          this.originalLogoPath = response.logoPath; // Track original for removal detection
        }
        this.buildForm();
        this.populateForm();
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
      parkingHighEnd: formValue.parkingHighEnd ? parseFloat(formValue.parkingHighEnd.toString()) : 0,
      emailListForReservations: (formValue.emailListForReservations || '').trim() || null
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
              if (orgId) this.officeService.loadAllOffices(orgId);
              this.backEvent.emit();
            },
            error: () => {
              this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
              this.toastr.warning('Office created, but failed to update your office access.', 'Partial Update');
              if (orgId) this.officeService.loadAllOffices(orgId);
              this.backEvent.emit();
            }
          });
        },
        error: (_err: HttpErrorResponse) => {}
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
                if (orgId) this.officeService.loadAllOffices(orgId);
                this.backEvent.emit();
              },
              error: () => {
                this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
                this.toastr.warning('Office updated, but failed to update your office access.', 'Partial Update');
                if (orgId) this.officeService.loadAllOffices(orgId);
                this.backEvent.emit();
              }
            });
            return;
          }

          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (orgId) this.officeService.loadAllOffices(orgId);
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
      parkingHighEnd: new FormControl<string>('0.00', [Validators.required]),
      emailListForReservations: new FormControl<string>('')
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
          parkingHighEnd: this.office.parkingHighEnd !== null && this.office.parkingHighEnd !== undefined ? this.office.parkingHighEnd.toFixed(2) : '0.00',
          emailListForReservations: this.office.emailListForReservations || ''
        });
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
      parkingLowEnd: o.parkingLowEnd != null ? o.parkingLowEnd.toFixed(2) : '0.00',
      parkingHighEnd: o.parkingHighEnd != null ? o.parkingHighEnd.toFixed(2) : '0.00',
      emailListForReservations: o.emailListForReservations || ''
    }, { emitEvent: false });
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
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
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
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
//#endregion
}

