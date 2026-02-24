import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { OrganizationRequest, OrganizationResponse } from '../models/organization.model';
import { OrganizationService } from '../services/organization.service';

@Component({
    selector: 'app-organization',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './organization.component.html',
    styleUrl: './organization.component.scss'
})

export class OrganizationComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  organizationId: string;
  organization: OrganizationResponse;
  form: FormGroup;
  fileName: string = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  originalLogoPath: string = null; // Track original logo to detect removal
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organization']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public organizationService: OrganizationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    public formatterService: FormatterService,
    private utilityService: UtilityService
  ) {
  }

  //#region Organization
  ngOnInit(): void {
    this.loadStates();
    const routeId = this.route.snapshot.paramMap.get('id');
    this.organizationId = routeId || '';
    this.isAddMode = this.organizationId === 'new';

    if (this.isAddMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.buildForm();
    } else {
      this.buildForm();
      this.getOrganization();
    }
  }

  getOrganization(): void {
    this.organizationService.getOrganizationByGuid(this.organizationId).pipe(take(1)).subscribe({
      next: (response: OrganizationResponse) => {
        this.organization = response;
        // Load logo from fileDetails if present (contains base64 image data)
        if (response.fileDetails && response.fileDetails.file) {
          this.fileDetails = response.fileDetails;
          // Construct dataUrl from base64 file if not already set
          if (!this.fileDetails.dataUrl && this.fileDetails.contentType && this.fileDetails.file) {
            this.fileDetails.dataUrl = `data:${this.fileDetails.contentType};base64,${this.fileDetails.file}`;
          }
          this.hasNewFileUpload = false; // FileDetails from API, not a new upload
        }
        
        // Always preserve logoPath from response if it exists (even if fileDetails also exists)
        if (response.logoPath) {
          this.logoPath = response.logoPath;
          this.originalLogoPath = response.logoPath; // Track original for removal detection
        }
        this.populateForm();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  saveOrganization(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    // Bulk map: form → request, normalizing optional strings to empty string
    const formValue = this.form.getRawValue();
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone);
    const faxDigits = this.formatterService.stripPhoneFormatting(formValue.fax);

    const isInternational = formValue.isInternational || false;
    const organizationRequest: OrganizationRequest = {
      ...formValue,
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || undefined,
      suite: formValue.suite || undefined,
      city: isInternational ? undefined : (formValue.city || '').trim() || undefined,
      state: isInternational ? undefined : (formValue.state || '').trim() || undefined,
      zip: isInternational ? undefined : (formValue.zip || '').trim() || undefined,
      website: formValue.website || undefined,
      contactName: formValue.contactName || undefined,
      contactEmail: formValue.contactEmail || undefined,
      phone: phoneDigits,
      fax: faxDigits || undefined,
      isInternational: isInternational,
      officeFee: this.parseDecimal(formValue.officeFee),
      userFee: this.parseDecimal(formValue.userFee),
      unit50Fee: this.parseDecimal(formValue.unit50Fee),
      unit100Fee: this.parseDecimal(formValue.unit100Fee),
      unit200Fee: this.parseDecimal(formValue.unit200Fee),
      unit500Fee: this.parseDecimal(formValue.unit500Fee),
      // Send fileDetails if a new file was uploaded OR if fileDetails exists from API (preserve existing logo)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath
    };

    // Defensive guard: required fields must remain non-empty
    // For international addresses, city, state, and zip are not required
    if (!organizationRequest.address1 || !organizationRequest.phone || 
        (!isInternational && (!organizationRequest.city || !organizationRequest.state || !organizationRequest.zip))) {
      this.isSubmitting = false;
      this.form.markAllAsTouched();
      return;
    }

    if (!this.isAddMode) {
      organizationRequest.organizationId = this.organizationId;
      organizationRequest.organizationCode = this.organization?.organizationCode;
    }

    const save$ = this.isAddMode
      ? this.organizationService.createOrganization(organizationRequest)
      : this.organizationService.updateOrganization(organizationRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Organization created successfully' : 'Organization updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.OrganizationList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      name: new FormControl('', [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      fax: new FormControl(''),
      contactName: new FormControl(''),
      contactEmail: new FormControl(''),
      website: new FormControl(''),
      officeFee: new FormControl('0.00', [Validators.required]),
      userFee: new FormControl('0.00', [Validators.required]),
      unit50Fee: new FormControl('0.00', [Validators.required]),
      unit100Fee: new FormControl('0.00', [Validators.required]),
      unit200Fee: new FormControl('0.00', [Validators.required]),
      unit500Fee: new FormControl('0.00', [Validators.required]),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isInternational: new FormControl(false),
      isActive: new FormControl(true)
    });

    // Setup conditional validation for international addresses
    this.setupConditionalFields();
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

  populateForm(): void {
    if (this.organization && this.form) {
      this.form.patchValue({
        name: this.organization.name,
        address1: this.organization.address1,
        address2: this.organization.address2 || '',
        suite: this.organization.suite || '',
        city: this.organization.city,
        state: this.organization.state,
        zip: this.organization.zip,
        phone: this.formatterService.phoneNumber(this.organization.phone),
        fax: this.formatterService.phoneNumber(this.organization.fax) || '',
        contactName: this.organization.contactName || '',
        contactEmail: this.organization.contactEmail || '',
        website: this.organization.website || '',
        officeFee: this.formatDecimalValue(this.organization.officeFee),
        userFee: this.formatDecimalValue(this.organization.userFee),
        unit50Fee: this.formatDecimalValue(this.organization.unit50Fee),
        unit100Fee: this.formatDecimalValue(this.organization.unit100Fee),
        unit200Fee: this.formatDecimalValue(this.organization.unit200Fee),
        unit500Fee: this.formatDecimalValue(this.organization.unit500Fee),
        isInternational: this.organization.isInternational || false,
        isActive: this.organization.isActive
      });
    }
  }
  //#endregion

  //#region Logo Methods
  upload(event: Event): void {
    this.isUploadingLogo = true;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      this.fileName = file.name;
      this.form.patchValue({ fileUpload: file });
      this.form.get('fileUpload').updateValueAndValidity();
      this.logoPath = null; // Clear existing logo path when new file is selected
      this.hasNewFileUpload = true; // Mark that this is a new file upload

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '', dataUrl: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // Convert file to base64 string for preview and upload
        const base64String = btoa(fileReader.result as string);
        this.fileDetails.file = base64String;
        // Construct dataUrl for display
        this.fileDetails.dataUrl = `data:${file.type};base64,${base64String}`;
        this.isUploadingLogo = false;
      };
      fileReader.readAsBinaryString(file);
    }
  }

  removeLogo(): void {
    this.logoPath = null;
    this.fileName = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false; // Reset flag when logo is removed
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload').updateValueAndValidity();
    // Note: originalLogoPath is kept to detect if logo was removed vs never existed
  }
  //#endregion

  //#region Phone Helpers
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

  //#endregion

  //#region Decimal Helpers
  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  onDecimalFocus(event: FocusEvent, fieldName: string): void {
    this.formatterService.clearDefaultDecimalOnFocus(event, this.form.get(fieldName), '0.00');
  }

  onDecimalBlur(fieldName: string): void {
    this.formatterService.formatDecimalOnBlur(this.form.get(fieldName));
  }

  onDecimalEnter(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalOnEnter(event as KeyboardEvent, this.form.get(fieldName));
  }

  private parseDecimal(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    const parsed = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  private formatDecimalValue(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '0.00';
    }
    return value.toFixed(2);
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
        console.error('Organization Component - Error loading states:', err);
      }
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
  //#endregion
}

