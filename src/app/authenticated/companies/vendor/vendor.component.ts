import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { VendorRequest, VendorResponse } from '../models/vendor.model';
import { VendorService } from '../services/vendor.service';

@Component({
    selector: 'app-vendor',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './vendor.component.html',
    styleUrl: './vendor.component.scss'
})

export class VendorComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  vendorId: string;
  vendor: VendorResponse;
  form: FormGroup;
  fileDetails: FileDetails = null;
  fileName: string = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  logoPath: string = null;
  originalLogoPath: string = null; // Track original logo to detect removal
  isSubmitting: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['vendor']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public vendorService: VendorService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private authService: AuthService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region Vendors
  ngOnInit(): void {
    this.loadStates();
    this.loadOffices();

    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.vendorId = paramMap.get('id');
        this.isAddMode = this.vendorId === 'new';
        if (this.isAddMode) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendor');
          this.buildForm();
          // Check if we're copying from another vendor
          this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
            if (queryParams['copyFrom']) {
              this.copyFromVendor(queryParams['copyFrom']);
            } else {
              // Set officeId from query params after form is built
              this.setOfficeFromQueryParams();
            }
          });
        } else {
          this.getVendor();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }
  
  setOfficeFromQueryParams(): void {
    // Wait for offices to be loaded, then set officeId from query params
    if (!this.form) {
      return;
    }
    
    // If offices are already loaded, set immediately
    if (this.offices && this.offices.length > 0) {
      this.applyOfficeFromQueryParams();
    } else {
      // Otherwise wait for offices to load
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe(offices => {
          this.offices = offices || [];
          this.applyOfficeFromQueryParams();
        });
      });
    }
  }
  
  applyOfficeFromQueryParams(): void {
    if (!this.form || !this.offices || this.offices.length === 0) {
      return;
    }
    
    const officeIdFromParams = this.route.snapshot.queryParams['officeId'];
    if (officeIdFromParams) {
      const officeId = parseInt(officeIdFromParams, 10);
      if (!isNaN(officeId)) {
        const office = this.offices.find(o => o.officeId === officeId);
        if (office) {
          this.form.patchValue({ officeId: office.officeId });
        }
      }
    }
  }

  getVendor(): void {
    this.vendorService.getVendorByGuid(this.vendorId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendor'); })).subscribe({
      next: (response: VendorResponse) => {
        this.vendor = response;
        // Load logo from fileDetails if present (contains base64 image data)
        if (response.fileDetails && response.fileDetails.file) {
          this.fileDetails = response.fileDetails;
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
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  copyFromVendor(sourceVendorId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'vendor');
    
    // Wait for offices to be loaded before copying
    const officesLoaded$ = this.officeService.areOfficesLoaded().pipe(
      filter(loaded => loaded === true),
      take(1)
    );
    
    // Wait for offices to complete, then load the vendor to copy
    officesLoaded$.pipe(
      take(1),
      switchMap(() => this.vendorService.getVendorByGuid(sourceVendorId).pipe(take(1))),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendor'); })
    ).subscribe({
      next: (response: VendorResponse) => {
        // Temporarily store the source vendor
        this.vendor = response;
        // Populate form with all copied values
        if (this.vendor && this.form) {
          this.populateForm();
          // Clear the vendor code since this is a new vendor
          this.form.get('vendorCode')?.setValue('');
          // Don't copy logo - user should upload a new one if needed
          this.fileDetails = null;
          this.logoPath = null;
          this.originalLogoPath = null;
          this.hasNewFileUpload = false;
        }
        // Clear the vendor ID reference after populating
        this.vendor = null;
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendor');
        this.setOfficeFromQueryParams();
      }
    });
  }

  saveVendor(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    // Bulk map: form → request, normalizing optional strings to empty string
    const formValue = this.form.getRawValue();
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone);
    const user = this.authService.getUser();

    const isInternational = formValue.isInternational || false;
    const vendorRequest: VendorRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || undefined,
      suite: formValue.suite || undefined,
      city: isInternational ? undefined : (formValue.city || '').trim() || undefined,
      state: isInternational ? undefined : (formValue.state || '').trim() || undefined,
      zip: isInternational ? undefined : (formValue.zip || '').trim() || undefined,
      website: formValue.website || undefined,
      notes: formValue.notes || undefined,
      isInternational: isInternational,
      phone: phoneDigits,
      officeId: formValue.officeId || undefined,
      // Send fileDetails if a new file was uploaded OR if fileDetails exists from API (preserve existing logo)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath
    };


    if (!this.isAddMode) {
      vendorRequest.vendorId = this.vendorId;
      vendorRequest.vendorCode = this.vendor?.vendorCode;
      vendorRequest.organizationId = this.vendor?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.vendorService.createVendor(vendorRequest)
      : this.vendorService.updateVendor(vendorRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Vendor created successfully' : 'Vendor updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        
        // Preserve query params (including officeId and tab) when navigating back
        const currentQueryParams = this.route.snapshot.queryParams;
        const queryParams: any = { tab: '1' }; // Default to vendors tab
        if (currentQueryParams['officeId']) {
          queryParams.officeId = currentQueryParams['officeId'];
        }
        
        // Navigate back to companies list, preserving query params
        this.router.navigate([RouterUrl.Companies], {
          queryParams: queryParams
        });
      },
      error: () => {}
    });
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
      error: (err: HttpErrorResponse) => {
        // States are handled globally, just handle gracefully
      }
    });
  }

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        
        // If in add mode and form is built, set office from query params
        if (this.isAddMode && this.form) {
          this.applyOfficeFromQueryParams();
        }
      });
    });
  }
  //#endregion

  //#region Logo methods
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

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // Convert file to base64 string for preview and upload
        this.fileDetails.file = btoa(fileReader.result as string);
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

  //#region Form methods
  buildForm(): void {
    this.form = this.fb.group({
      vendorCode: new FormControl(''), // Not required - only shown in Edit Mode
      name: new FormControl('', [Validators.required]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      phone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]),
      website: new FormControl(''),
      notes: new FormControl(''),
      officeId: new FormControl<number | null>(null),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isInternational: new FormControl(false),
      isActive: new FormControl(true)
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
        // Note: City, State, Zip are optional for vendors, so no validators needed
      }

      cityControl?.updateValueAndValidity({ emitEvent: false });
      stateControl?.updateValueAndValidity({ emitEvent: false });
      zipControl?.updateValueAndValidity({ emitEvent: false });
    });
  }

  populateForm(): void {
    if (this.vendor && this.form) {
      this.form.patchValue({
        vendorCode: this.vendor.vendorCode?.toUpperCase() || '',
        name: this.vendor.name,
        address1: this.vendor.address1,
        address2: this.vendor.address2 || '',
        suite: this.vendor.suite || '',
        city: this.vendor.city,
        state: this.vendor.state,
        zip: this.vendor.zip,
        phone: this.formatterService.phoneNumber(this.vendor.phone),
        website: this.vendor.website || '',
        notes: this.vendor.notes || '',
        officeId: this.vendor.officeId || null,
        isInternational: this.vendor.isInternational || false,
        isActive: this.vendor.isActive // Convert number to boolean for checkbox
      });
    }
  }
  //#endregion

  //#region Phone helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  getOfficeName(): string {
    if (!this.vendor) {
      return '';
    }
    // Use officeName from vendor response if available, otherwise look it up
    if (this.vendor.officeName) {
      return this.vendor.officeName;
    }
    if (this.vendor.officeId && this.offices && this.offices.length > 0) {
      const office = this.offices.find(o => o.officeId === this.vendor.officeId);
      return office ? office.name : '';
    }
    return '';
  }

  back(): void {
    // Preserve query params (including officeId and tab) when navigating back
    const currentQueryParams = this.route.snapshot.queryParams;
    const queryParams: any = { tab: '1' }; // Default to vendors tab
    if (currentQueryParams['officeId']) {
      queryParams.officeId = currentQueryParams['officeId'];
    }
    
    // Navigate back to companies list, preserving query params
    this.router.navigate([RouterUrl.Companies], {
      queryParams: queryParams
    });
  }
  //#endregion
}

