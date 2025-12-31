import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter } from 'rxjs';
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

export class OrganizationComponent implements OnInit {
  itemsToLoad: string[] = [];
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
  isLoadError: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];

  constructor(
    public organizationService: OrganizationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService
  ) {
    this.itemsToLoad.push('organization');
    this.loadStates();
  }

  ngOnInit(): void {
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
    this.organizationService.getOrganizationByGuid(this.organizationId).pipe(take(1),finalize(() => { this.removeLoadItem('organization'); })).subscribe({
      next: (response: OrganizationResponse) => {
        this.organization = response;
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
        if (err.status !== 400) {
          this.toastr.error('Could not load organization info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
    const afterHoursPhoneDigits = this.formatterService.stripPhoneFormatting(formValue.afterHoursPhone);

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
      afterHoursPhone: afterHoursPhoneDigits || undefined,
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
        this.isLoadError = true;
        if (err.status !== 400) {
          const failMessage = this.isAddMode ? 'Create organization request has failed. ' : 'Update organization request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form methods
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
      maintenanceEmail: new FormControl(''),
      afterHoursPhone: new FormControl(''),
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
        maintenanceEmail: this.organization.maintenanceEmail || '',
        afterHoursPhone: this.formatterService.phoneNumber(this.organization.afterHoursPhone) || '',
        isActive: this.organization.isActive
      });
    }
  }

  // Logo methods
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

  // Phone helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  formatAfterHoursPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('afterHoursPhone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  onAfterHoursPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('afterHoursPhone'));
  }

  formatFax(): void {
    this.formatterService.formatPhoneControl(this.form.get('fax'));
  }

  onFaxInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('fax'));
  }

  // Utility helpers
  private loadStates(): void {
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

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
}

