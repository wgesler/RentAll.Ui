import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { VendorService } from '../services/vendor.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { VendorResponse, VendorListDisplay, VendorRequest } from '../models/vendor.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-vendor',
  standalone: true,
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
    private mappingService: MappingService
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
          this.removeLoadItem('vendor');
          this.buildForm();
        } else {
          this.getVendor();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getVendor(): void {
    this.vendorService.getVendorByGuid(this.vendorId).pipe(take(1), finalize(() => { this.removeLoadItem('vendor'); })).subscribe({
      next: (response: VendorResponse) => {
        this.vendor = response;
        // Load logo from fileDetails if present (contains base64 image data)
        if (response.fileDetails && response.fileDetails.file) {
          this.fileDetails = response.fileDetails;
          this.hasNewFileUpload = false; // FileDetails from API, not a new upload
        } else if (response.logoPath) {
          // Fallback to logoPath if fileDetails not available
          this.logoPath = response.logoPath;
          this.originalLogoPath = response.logoPath; // Track original for removal detection
        }
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
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

    const vendorRequest: VendorRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || '',
      suite: formValue.suite || '',
      city: (formValue.city || '').trim(),
      state: (formValue.state || '').trim(),
      zip: (formValue.zip || '').trim(),
      website: formValue.website || '',
      notes: formValue.notes || '',
      phone: phoneDigits,
      officeId: formValue.officeId || undefined,
      // Only send fileDetails if a new file was uploaded (not from API response)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      logoPath: this.hasNewFileUpload ? undefined : this.logoPath
    };

    // Defensive guard: required fields must remain non-empty
    if (!vendorRequest.address1 || !vendorRequest.city || !vendorRequest.state || !vendorRequest.zip || !vendorRequest.phone) {
      this.isSubmitting = false;
      this.form.markAllAsTouched();
      return;
    }

    if (!this.isAddMode) {
      vendorRequest.vendorId = this.vendorId;
      vendorRequest.vendorCode = this.vendor?.vendorCode;
      vendorRequest.organizationId = this.vendor?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.vendorService.createVendor(vendorRequest)
      : this.vendorService.updateVendor(this.vendorId, vendorRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Vendor created successfully' : 'Vendor updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.VendorList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
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
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/)]),
      website: new FormControl(''),
      notes: new FormControl(''),
      officeId: new FormControl<number | null>(null),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(true)
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
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.VendorList);
  }
  //#endregion
}

