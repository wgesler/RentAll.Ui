import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter } from 'rxjs';
import { CompanyService } from '../services/company.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts, emptyGuid } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { CompanyResponse, CompanyListDisplay, CompanyRequest } from '../models/company.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { ExternalStorageService } from '../../../services/external-storage.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';

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

  constructor(
    public companyService: CompanyService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private externalStorageService: ExternalStorageService,
    private commonService: CommonService,
    private formatterService: FormatterService
  ) {
    this.itemsToLoad.push('company');
    this.loadStates();
  }

  ngOnInit(): void {
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

  buildForm(): void {
    this.form = this.fb.group({
      companyCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      website: new FormControl(''),
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] }),
      isActive: new FormControl(1)
    });
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.CompanyList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

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

  private stripPhoneFormatting(phone: string): string {
    if (!phone) return '';
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  }

  formatPhone(): void {
    const phoneControl = this.form.get('phone');
    if (phoneControl && phoneControl.value) {
      const phone = phoneControl.value.replace(/\D/g, ''); // Remove all non-digits
      if (phone.length === 10) {
        const formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
        phoneControl.setValue(formatted, { emitEvent: false });
      }
    }
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const phone = input.value.replace(/\D/g, ''); // Remove all non-digits
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

  updateLogo(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.value;
    // Strip phone formatting (remove non-digits) before saving
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const company: CompanyRequest = {
      companyId: this.companyId,
      companyCode: formValue.companyCode,
      name: formValue.name,
      address1: formValue.address1,
      address2: formValue.address2 || undefined,
      city: formValue.city,
      state: formValue.state,
      zip: formValue.zip,
      phone: phoneDigits,
      website: formValue.website || undefined,
      logoStorageId: this.logoStorageId || null,
      fileDetails: this.fileDetails || undefined,
      isActive: formValue.isActive || 1
    };

    this.companyService.updateCompanyLogo(this.companyId, company).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: (response: CompanyResponse) => {
        if (this.isUploadingLogo) {
          this.getStoragePublicUrl(response.logoStorageId);
          this.fileName = null;
        }
        this.toastr.success('Company logo updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
      },
      error: (err: HttpErrorResponse) => {
        this.isLoadError = true;
        if (err.status !== 400) {
          this.toastr.error('Update Company logo request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
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

  saveCompany(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    // Strip phone formatting (remove non-digits) before saving
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const companyRequest: CompanyRequest = {
      companyCode: formValue.companyCode,
      name: formValue.name,
      address1: formValue.address1,
      address2: formValue.address2 || undefined,
      city: formValue.city,
      state: formValue.state,
      zip: formValue.zip,
      phone: phoneDigits,
      website: formValue.website || undefined,
      logoStorageId: this.logoStorageId || null,
      fileDetails: this.fileDetails || undefined,
      isActive: formValue.isActive || 1
    };

    if (this.isAddMode) {
      this.companyService.createCompany(companyRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: CompanyResponse) => {
          this.toastr.success('Company created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Company, [response.companyId]));
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create company request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      companyRequest.companyId = this.companyId;
      this.companyService.updateCompany(this.companyId, companyRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: CompanyResponse) => {
          this.toastr.success('Company updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.company = response;
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update company request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  private getCompany(): void {
    this.companyService.getCompanyByGuid(this.companyId).pipe(take(1),
    finalize(() => { this.removeLoadItem('company') })).subscribe({
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

  private populateForm(): void {
    if (this.company && this.form) {
      this.form.patchValue({
        companyCode: this.company.companyCode,
        name: this.company.name,
        address1: this.company.address1,
        address2: this.company.address2 || '',
        city: this.company.city,
        state: this.company.state,
        zip: this.company.zip,
        phone: this.formatterService.phoneNumber(this.company.phone),
        website: this.company.website || '',
        isActive: this.company.isActive
      });
    }
  }

  private loadStates(): void {
    // First check if states are already cached
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      console.log('Company Component - Using cached states:', cachedStates);
      this.states = [...cachedStates]; // Create a new array reference to trigger change detection
      return;
    }
    
    // Subscribe to get states when they're loaded (filter out empty arrays)
    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),
      take(1)
    ).subscribe({
      next: (states) => {
        console.log('Company Component - States loaded from observable:', states);
        this.states = [...states]; // Create a new array reference to trigger change detection
      },
      error: (err) => {
        console.error('Company Component - Error loading states:', err);
      }
    });
  }
}

