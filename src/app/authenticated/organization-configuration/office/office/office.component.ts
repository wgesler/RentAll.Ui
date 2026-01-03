import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { OfficeService } from '../services/office.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { OfficeResponse, OfficeRequest } from '../models/office.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { CommonService } from '../../../../services/common.service';
import { fileValidator } from '../../../../validators/file-validator';
import { FileDetails } from '../../../../shared/models/fileDetails';

@Component({
  selector: 'app-office',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './office.component.html',
  styleUrl: './office.component.scss'
})

export class OfficeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
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
    this.loadStates();
  }

  ngOnInit(): void {
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get office ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeOfficeId = paramMap.get('id');
          this.isAddMode = this.routeOfficeId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('office');
            this.buildForm();
          } else {
            this.getOffice(this.routeOfficeId);
          }
        }
      });
      if (!this.isAddMode) {
        this.buildForm();
      }
    } else {
      // In embedded mode, use the input id
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload office
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
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

    const officeRequest: OfficeRequest = {
      organizationId: user?.organizationId || '',
      officeCode: formValue.officeCode,
      name: formValue.name,
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
      logoPath: this.hasNewFileUpload ? undefined : this.logoPath,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.officeService.createOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: OfficeResponse) => {
          this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.OfficeList);
          }
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
        return;
      }
      officeRequest.officeId = officeIdNum;
      officeRequest.organizationId = this.office?.organizationId || user?.organizationId || '';
      this.officeService.updateOffice(officeIdNum, officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: OfficeResponse) => {
          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.OfficeList);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update office request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
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
        console.error('Office Component - Error loading states:', err);
      }
    });
  }

  // Form Methods
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
      phone: new FormControl('', [Validators.required, Validators.pattern(/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/)]),
      fax: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4})?$/)]),
      website: new FormControl(''),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.office && this.form) {
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
        isActive: this.office.isActive
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

    // Phone helpers
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

  // Utility Methods
  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ officeCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
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
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.OfficeList);
    }
  }
}

