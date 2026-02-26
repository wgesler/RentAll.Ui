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
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { CompanyRequest, CompanyResponse } from '../models/company.model';
import { CompanyService } from '../services/company.service';

@Component({
    selector: 'app-company',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './company.component.html',
    styleUrl: './company.component.scss'
})

export class CompanyComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  companyId: string;
  company: CompanyResponse;
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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['company']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public companyService: CompanyService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private mappingService: MappingService
  ) {
  }

  //#region Company
  ngOnInit(): void {
    this.loadStates();
    this.loadOffices();
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.companyId = paramMap.get('id');
        this.isAddMode = this.companyId === 'new';
        if (this.isAddMode) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'company');
          this.buildForm();
          // Check if we're copying from another company
          this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
            if (queryParams['copyFrom']) {
              this.copyFromCompany(queryParams['copyFrom']);
            } else {
              // Set officeId from query params after form is built
              this.setOfficeFromQueryParams();
            }
          });
        } else {
          this.getCompany();
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
    
    const officeId = getNumberQueryParam(this.route.snapshot.queryParams, 'officeId');
    if (officeId !== null) {
      const office = this.offices.find(o => o.officeId === officeId);
      if (office) {
        this.form.patchValue({ officeId: office.officeId });
      }
    }
  }

  getCompany(): void {
    this.companyService.getCompanyByGuid(this.companyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'company'); })).subscribe({
      next: (response: CompanyResponse) => {
        this.company = response;
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
        // Use setTimeout to defer form population to avoid ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
          this.populateForm();
        }, 0);
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  copyFromCompany(sourceCompanyId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'company');
    
    // Wait for offices to be loaded before copying
    const officesLoaded$ = this.officeService.areOfficesLoaded().pipe(
      filter(loaded => loaded === true),
      take(1)
    );
    
    // Wait for offices to complete, then load the company to copy
    officesLoaded$.pipe(
      take(1),
      switchMap(() => this.companyService.getCompanyByGuid(sourceCompanyId).pipe(take(1))),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'company'); })
    ).subscribe({
      next: (response: CompanyResponse) => {
        // Temporarily store the source company
        this.company = response;
        // Populate form with all copied values
        if (this.company && this.form) {
          // Don't copy logo - user should upload a new one if needed
          this.fileDetails = null;
          this.logoPath = null;
          this.originalLogoPath = null;
          this.hasNewFileUpload = false;
          // Use setTimeout to defer form population to avoid ExpressionChangedAfterItHasBeenCheckedError
          setTimeout(() => {
            this.populateForm();
            // Clear the company code since this is a new company
            this.form.get('companyCode')?.setValue('');
          }, 0);
        }
        // Clear the company ID reference after populating
        this.company = null;
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'company');
        this.setOfficeFromQueryParams();
      }
    });
  }

  saveCompany(): void {
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
    const companyRequest: CompanyRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      officeId: formValue.officeId || undefined,
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
      // Send fileDetails if a new file was uploaded OR if fileDetails exists from API (preserve existing logo)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath
    };

    // Defensive guard: required fields must remain non-empty
    // For international addresses, city, state, and zip are not required
    if (!companyRequest.address1 || !companyRequest.phone || 
        (!isInternational && (!companyRequest.city || !companyRequest.state || !companyRequest.zip))) {
      this.isSubmitting = false;
      this.form.markAllAsTouched();
      return;
    }

    if (!this.isAddMode) {
      companyRequest.companyId = this.companyId;
      companyRequest.companyCode = this.company?.companyCode;
      companyRequest.organizationId = this.company?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.companyService.createCompany(companyRequest)
      : this.companyService.updateCompany(companyRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Company created successfully' : 'Company updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        
        // Preserve query params (including officeId and tab) when navigating back
        const currentQueryParams = this.route.snapshot.queryParams;
        const queryParams: any = {};
        if (currentQueryParams['officeId']) {
          queryParams.officeId = currentQueryParams['officeId'];
        }
        if (currentQueryParams['tab']) {
          queryParams.tab = currentQueryParams['tab'];
        }
        
        // Navigate back to companies list, preserving query params
        this.router.navigate([RouterUrl.Companies], {
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
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
      error: (err) => {
        console.error('Company Component - Error loading states:', err);
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
      companyCode: new FormControl(''), // Not required - only shown in Edit Mode
      name: new FormControl('', [Validators.required]),
      officeId: new FormControl(null),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      website: new FormControl(''),
      notes: new FormControl(''),
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
    if (this.company && this.form) {
      this.form.patchValue({
        companyCode: this.company.companyCode?.toUpperCase() || '',
        name: this.company.name,
        officeId: this.company.officeId || null,
        address1: this.company.address1,
        address2: this.company.address2 || '',
        suite: this.company.suite || '',
        city: this.company.city,
        state: this.company.state,
        zip: this.company.zip,
        phone: this.formatterService.phoneNumber(this.company.phone),
        website: this.company.website || '',
        notes: this.company.notes || '',
        isInternational: this.company.isInternational || false,
        isActive: this.company.isActive // Convert number to boolean for checkbox
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
    if (!this.company) {
      return '';
    }
    // Use officeName from company response if available, otherwise look it up
    if (this.company.officeName) {
      return this.company.officeName;
    }
    if (this.company.officeId && this.offices && this.offices.length > 0) {
      const office = this.offices.find(o => o.officeId === this.company.officeId);
      return office ? office.name : '';
    }
    return '';
  }

  back(): void {
    // Preserve query params (including officeId and tab) when navigating back
    const currentQueryParams = this.route.snapshot.queryParams;
    const queryParams: any = {};
    if (currentQueryParams['officeId']) {
      queryParams.officeId = currentQueryParams['officeId'];
    }
    if (currentQueryParams['tab']) {
      queryParams.tab = currentQueryParams['tab'];
    }
    
    // Navigate back to companies list, preserving query params
    this.router.navigate([RouterUrl.Companies], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }
  //#endregion
}

