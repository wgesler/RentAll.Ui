import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, switchMap, map } from 'rxjs';
import { CompanyService } from '../services/company.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts, emptyGuid } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { CompanyResponse, CompanyListDisplay, CompanyRequest } from '../models/company.model';
import { ContactResponse, ContactListDisplay } from '../../contact/models/contact.model';
import { ContactService } from '../../contact/services/contact.service';
import { EntityType } from '../../contact/models/contact-type';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { ExternalStorageService } from '../../../services/external-storage.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-company',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './company.component.html',
  styleUrl: './company.component.scss'
})

export class CompanyComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  companyId: string;
  company: CompanyResponse;
  form: FormGroup;
  fileDetails: FileDetails = null;
  fileName: string = null;
  logoImgUrl: string = null;
  logoStorageId?: string = null;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isUploadingLogo: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  companyContacts: ContactListDisplay[] = [];

  constructor(
    public companyService: CompanyService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private externalStorageService: ExternalStorageService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private contactService: ContactService,
    private mappingService: MappingService,
    private authService: AuthService
  ) {
    this.itemsToLoad.push('company');
    this.loadStates();
  }

  ngOnInit(): void {
    // Check if contacts are already loaded, otherwise wait for them
    const contactsLoaded = this.contactService.areContactsLoaded();
    const allContacts = this.contactService.getAllContacts();
    
    // Combine: wait for loaded flag, then get contacts
    contactsLoaded.pipe(
      filter(loaded => loaded === true),
      switchMap(() => allContacts.pipe(take(1))),
      map((allContacts) => {
        console.log('Company Component - All contacts received:', allContacts);
        console.log('Company Component - EntityType.Company value:', EntityType.Company);
        if (allContacts && allContacts.length > 0) {
          console.log('Company Component - All contacts entityTypeIds:', allContacts.map(c => ({ 
            name: `${c.firstName} ${c.lastName}`, 
            entityTypeId: c.entityTypeId 
          })));
        }
        const companyContacts = allContacts.filter(c => c.entityTypeId === EntityType.Company);
        console.log('Company Component - Filtered company contacts:', companyContacts);
        return companyContacts;
      }),
      take(1)
    ).subscribe({
      next: (response: ContactResponse[]) => {
        console.log('Company Component - Company contacts before mapping:', response);
        this.companyContacts = this.mappingService.mapContacts(response || []);
        console.log('Company Component - Company contacts after mapping:', this.companyContacts);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Company Component - Error loading contacts:', err);
        this.companyContacts = [];
      }
    });
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.companyId = paramMap.get('id');
        this.isAddMode = this.companyId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('company');
          this.buildForm();
        } else {
          this.getCompany();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getCompany(): void {
    this.companyService.getCompanyByGuid(this.companyId).pipe(take(1),finalize(() => { this.removeLoadItem('company'); })).subscribe({
      next: (response: CompanyResponse) => {
        this.company = response;
        this.getStoragePublicUrl(this.company.logoStorageId);
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load company info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
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
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const user = this.authService.getUser();

    const companyRequest: CompanyRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      address1: (formValue.address1 || '').trim(),
      address2: formValue.address2 || '',
      suite: formValue.suite || '',
      city: (formValue.city || '').trim(),
      state: (formValue.state || '').trim(),
      zip: (formValue.zip || '').trim(),
      website: formValue.website || '',
      phone: phoneDigits,
      logoStorageId: this.logoStorageId || null,
      fileDetails: this.fileDetails || undefined
    };

    // Defensive guard: required fields must remain non-empty
    if (!companyRequest.address1 || !companyRequest.city || !companyRequest.state || !companyRequest.zip || !companyRequest.phone) {
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
      : this.companyService.updateCompany(this.companyId, companyRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Company created successfully' : 'Company updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.CompanyList);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoadError = true;
        if (err.status !== 400) {
          const failMessage = this.isAddMode ? 'Create company request has failed. ' : 'Update company request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
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
      this.logoStorageId = null;

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        this.fileDetails.file = btoa(fileReader.result as string);
      };
      fileReader.readAsBinaryString(file);
    }
  }

  removeLogo(): void {
    this.logoImgUrl = null;
    this.logoStorageId = null;
    this.fileName = null;
    this.fileDetails = null;
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload').updateValueAndValidity();
  }

  getStoragePublicUrl(fileStorageGuid: string): void {
    if (fileStorageGuid && fileStorageGuid !== null && fileStorageGuid !== '' && fileStorageGuid !== emptyGuid) {
      this.logoStorageId = fileStorageGuid;
      this.externalStorageService.getPublicFileUrl(fileStorageGuid)
        .pipe(take(1), finalize(() => this.removeLoadItem('logo'))).subscribe({
          next: (response: string) => {
            this.logoImgUrl = response;
          },
          error: (err: HttpErrorResponse) => {
            this.isLoadError = true;
            if (err.status !== 400) {
              this.toastr.error('Could not get stored logo.', CommonMessage.ServiceError);
            }
          }
        });
    } else {
      this.removeLoadItem('logo');
    }
  }

    // Form methods
    buildForm(): void {
    this.form = this.fb.group({
      companyCode: new FormControl(''), // Not required - only shown in Edit Mode
      name: new FormControl('', [Validators.required]),
      contactId: new FormControl(null, [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      website: new FormControl(''),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.company && this.form) {
      this.form.patchValue({
        companyCode: this.company.companyCode,
        name: this.company.name,
        contactId: this.company.contactId || null,
        address1: this.company.address1,
        address2: this.company.address2 || '',
        suite: this.company.suite || '',
        city: this.company.city,
        state: this.company.state,
        zip: this.company.zip,
        phone: this.formatterService.phoneNumber(this.company.phone),
        website: this.company.website || '',
        isActive: this.company.isActive // Convert number to boolean for checkbox
      });
    }
  }

  // Phone helpers
  stripPhoneFormatting(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  formatPhone(): void {
    const phoneControl = this.form.get('phone');
    if (phoneControl && phoneControl.value) {
      const phone = phoneControl.value.replace(/\D/g, '');
      if (phone.length === 10) {
        const formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
        phoneControl.setValue(formatted, { emitEvent: false });
      }
    }
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const phone = input.value.replace(/\D/g, '');
    if (phone.length <= 10) {
      let formatted = phone;
      if (phone.length > 6) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
      } else if (phone.length > 3) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3)}`;
      } else if (phone.length > 0) {
        formatted = `(${phone}`;
      }
      this.form.get('phone').setValue(formatted, { emitEvent: false });
    }
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
        console.error('Company Component - Error loading states:', err);
      }
    });
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.CompanyList);
  }

}

