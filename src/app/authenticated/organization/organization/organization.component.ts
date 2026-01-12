import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { OrganizationService } from '../services/organization.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { OrganizationResponse, OrganizationRequest } from '../models/organization.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { fileValidator } from '../../../validators/file-validator';
import { FileDetails } from '../../../shared/models/fileDetails';

@Component({
  selector: 'app-organization',
  standalone: true,
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

  constructor(
    public organizationService: OrganizationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService
  ) {
  }

  ngOnInit(): void {
    this.loadStates();
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.organizationId = paramMap.get('id');
        this.isAddMode = this.organizationId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('organization');
          this.buildForm();
        } else {
          this.getOrganization();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getOrganization(): void {
    this.organizationService.getOrganizationByGuid(this.organizationId).pipe(take(1), finalize(() => { this.removeLoadItem('organization'); })).subscribe({
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
        if (err.status !== 400) {
          this.toastr.error('Could not load organization info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('organization');
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

    const organizationRequest: OrganizationRequest = {
      ...formValue,
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || '',
      suite: formValue.suite || '',
      city: (formValue.city || '').trim(),
      state: (formValue.state || '').trim(),
      zip: (formValue.zip || '').trim(),
      website: formValue.website || '',
      phone: phoneDigits,
      fax: faxDigits || undefined,
      // Only send fileDetails if a new file was uploaded (not from API response)
      // Otherwise: send logoPath (existing path, or null if logo was removed)
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      logoPath: this.hasNewFileUpload ? undefined : this.logoPath
    };

    // Defensive guard: required fields must remain non-empty
    if (!organizationRequest.address1 || !organizationRequest.city || !organizationRequest.state || !organizationRequest.zip || !organizationRequest.phone) {
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
      : this.organizationService.updateOrganization(this.organizationId, organizationRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Organization created successfully' : 'Organization updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.OrganizationList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          const failMessage = this.isAddMode ? 'Create organization request has failed. ' : 'Update organization request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form Methods
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
      website: new FormControl(''),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(true)
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
        website: this.organization.website || '',
        isActive: this.organization.isActive
      });
    }
  }

  // Logo Methods
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

  // Phone Helpers
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

  // Data Loading Methods
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

  // Utility Methods
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
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
}

