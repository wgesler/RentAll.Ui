import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { AccountingOfficeService } from '../services/accounting-office.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { AccountingOfficeResponse, AccountingOfficeRequest } from '../models/accounting-office.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { CommonService } from '../../../../services/common.service';
import { fileValidator } from '../../../../validators/file-validator';
import { FileDetails } from '../../../../shared/models/fileDetails';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';
import { MappingService } from '../../../../services/mapping.service';
import { Subscription } from 'rxjs';
import { UtilityService } from '../../../../services/utility.service';

@Component({
  selector: 'app-accounting-office',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './accounting-office.component.html',
  styleUrl: './accounting-office.component.scss'
})

export class AccountingOfficeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeOfficeId: string | null = null;
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
  accountingOffice: AccountingOfficeResponse;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['office', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public accountingOfficeService: AccountingOfficeService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private formatterService: FormatterService,
    private navigationContext: NavigationContextService,
    private commonService: CommonService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region Office
  ngOnInit(): void {
    this.loadStates();
    this.loadOffices();

    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Wait for offices to be loaded before loading accounting office data
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (!this.embeddedMode) {
        this.route.paramMap.subscribe((paramMap: ParamMap) => {
          if (paramMap.has('id')) {
            this.routeOfficeId = paramMap.get('id');
            this.isAddMode = this.routeOfficeId === 'new';
            if (this.isAddMode) {
              this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
              this.buildForm();
              this.setupOfficeSelectionHandler();
            } else {
              this.getAccountingOffice(this.routeOfficeId);
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
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
            this.buildForm();
            this.setupOfficeSelectionHandler();
          } else {
            this.getAccountingOffice(this.id.toString());
          }
        }
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload office
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      // Wait for offices to be loaded before getting accounting office
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        if (newId && newId !== 'new') {
          this.getAccountingOffice(newId.toString());
        } else if (newId === 'new') {
          this.isAddMode = true;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
          this.buildForm();
          this.setupOfficeSelectionHandler();
        }
      });
    }
  }

  getAccountingOffice(id?: string | number): void {
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

    this.accountingOfficeService.getAccountingOfficeById(officeIdNum).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office'); })).subscribe({
      next: (response: AccountingOfficeResponse) => {
        this.accountingOffice = response;
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'office');
      }
    });
  }

  saveOffice(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.value;
    const user = this.authService.getUser();
    
    // Validate required fields
    if (!user?.organizationId) {
      this.toastr.error('Organization ID is missing', CommonMessage.Error);
      return;
    }
    
    // Validate that linkedOfficeId is provided for create mode
    if (this.isAddMode && !formValue.linkedOfficeId) {
      this.toastr.error('Please select an office', CommonMessage.Error);
      this.form.get('linkedOfficeId')?.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone);
    const faxDigits = formValue.fax ? this.formatterService.stripPhoneFormatting(formValue.fax) : '';
    const bankPhoneDigits = formValue.bankPhone ? this.formatterService.stripPhoneFormatting(formValue.bankPhone) : '';

    const linkedOfficeIdNum = formValue.linkedOfficeId ? Number(formValue.linkedOfficeId) : undefined;
    
    if (this.isAddMode && (!linkedOfficeIdNum || linkedOfficeIdNum === 0)) {
      this.toastr.error('Please select a valid office', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }
    
    const officeRequest: AccountingOfficeRequest = {
      organizationId: user.organizationId,
      officeId: this.isAddMode ? linkedOfficeIdNum! : 0, // Will be set correctly in update mode below
      name: formValue.name,
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2?.trim() || undefined,
      suite: formValue.suite?.trim() || undefined,
      city: (formValue.city || '').trim(),
      state: (formValue.state || '').trim(),
      zip: (formValue.zip || '').trim(),
      phone: phoneDigits,
      fax: faxDigits,
      bankName: formValue.bankName || '',
      bankRouting: formValue.bankRouting || '',
      bankAccount: formValue.bankAccount || '',
      bankSwiftCode: formValue.bankSwiftCode || '',
      bankAddress: formValue.bankAddress || '',
      bankPhone: bankPhoneDigits,
      email: formValue.email || '',
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath,
      isActive: formValue.isActive
    };

    console.log('=== Accounting Office Save Request ===');
    console.log('Is Add Mode:', this.isAddMode);
    console.log('Linked Office ID:', linkedOfficeIdNum);
    console.log('Organization ID:', user.organizationId);
    console.log('Request Object:', officeRequest);
    console.log('Request JSON:', JSON.stringify(officeRequest, null, 2));
    console.log('=====================================');

    if (this.isAddMode) {
      this.accountingOfficeService.createAccountingOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AccountingOfficeResponse) => {
          this.toastr.success('Office created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AccountingOfficeList);
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
        this.isSubmitting = false;
        return;
      }
      officeRequest.officeId = officeIdNum;
      officeRequest.organizationId = this.accountingOffice?.organizationId || user?.organizationId || '';
      
      console.log('=== Accounting Office Update Request ===');
      console.log('Office ID:', officeIdNum);
      console.log('Organization ID:', officeRequest.organizationId);
      console.log('Request Object:', officeRequest);
      console.log('Request JSON:', JSON.stringify(officeRequest, null, 2));
      console.log('========================================');
      
      this.accountingOfficeService.updateAccountingOffice(officeRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AccountingOfficeResponse) => {
          this.toastr.success('Office updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AccountingOfficeList);
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
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    });
  }

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
        console.error('Accounting Office Component - Error loading states:', err);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      linkedOfficeId: new FormControl(null),
      name: new FormControl('', [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/)]),
      fax: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4})?$/)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      bankName: new FormControl('', [Validators.required]),
      bankRouting: new FormControl('', [Validators.required]),
      bankAccount: new FormControl('', [Validators.required]),
      bankSwiftCode: new FormControl('', [Validators.required]),
      bankAddress: new FormControl('', [Validators.required]),
      bankPhone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4})?$/)]),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.accountingOffice && this.form) {
      this.form.patchValue({
        linkedOfficeId: this.accountingOffice.linkedOfficeId || null,
        name: this.accountingOffice.name,
        address1: this.accountingOffice.address1,
        address2: this.accountingOffice.address2 || '',
        suite: this.accountingOffice.suite || '',
        city: this.accountingOffice.city,
        state: this.accountingOffice.state,
        zip: this.accountingOffice.zip,
        phone: this.formatterService.phoneNumber(this.accountingOffice.phone),
        fax: this.accountingOffice.fax ? this.formatterService.phoneNumber(this.accountingOffice.fax) : '',
        email: this.accountingOffice.email || '',
        bankName: this.accountingOffice.bankName || '',
        bankRouting: this.accountingOffice.bankRouting || '',
        bankAccount: this.accountingOffice.bankAccount || '',
        bankSwiftCode: this.accountingOffice.bankSwiftCode || '',
        bankAddress: this.accountingOffice.bankAddress || '',
        bankPhone: this.accountingOffice.bankPhone ? this.formatterService.phoneNumber(this.accountingOffice.bankPhone) : '',
        isActive: this.accountingOffice.isActive
      }, { emitEvent: false });
    }
  }

  setupOfficeSelectionHandler(): void {
    // Only populate from office selection in add mode
    if (this.isAddMode) {
      this.form.get('linkedOfficeId')?.valueChanges.subscribe(linkedOfficeId => {
        if (linkedOfficeId && this.offices.length > 0) {
          const selectedOffice = this.offices.find(o => o.officeId === linkedOfficeId);
          if (selectedOffice) {
            // Populate form fields with office data (excluding bank fields)
            this.form.patchValue({
              name: selectedOffice.name || '',
              address1: selectedOffice.address1 || '',
              address2: selectedOffice.address2 || '',
              suite: selectedOffice.suite || '',
              city: selectedOffice.city || '',
              state: selectedOffice.state || '',
              zip: selectedOffice.zip || '',
              phone: selectedOffice.phone ? this.formatterService.phoneNumber(selectedOffice.phone) : '',
              fax: selectedOffice.fax ? this.formatterService.phoneNumber(selectedOffice.fax) : ''
            }, { emitEvent: false });
          }
        }
      });
    }
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

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '', dataUrl: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // readAsDataURL returns a data URL (e.g., "data:image/png;base64,iVBORw0KG...")
        const dataUrl = fileReader.result as string;
        this.fileDetails.dataUrl = dataUrl;
        // Extract base64 string from data URL for API upload
        // Format: "data:image/png;base64,iVBORw0KG..." -> extract part after comma
        const base64String = dataUrl.split(',')[1];
        this.fileDetails.file = base64String;
        this.isUploadingLogo = false;
      };
      fileReader.readAsDataURL(file);
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

  formatBankPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('bankPhone'));
  }

  onBankPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('bankPhone'));
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
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.AccountingOfficeList);
    }
  }

//#endregion
}
