import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';


@Component({
  selector: 'app-property-letter-information',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-letter-information.component.html',
  styleUrls: ['./property-letter-information.component.scss']
})
export class PropertyLetterInformationComponent implements OnInit {
  @Input() propertyId: string | null = null;
  itemsToLoad: string[] = ['property', 'organization', 'propertyLetter'];
  isServiceError: boolean = false;
  isLoading: boolean = true;
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;

  constructor(
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private organizationService: OrganizationService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }
    // Sequential load: org -> property -> property letter
    this.loadOrganizationSettings(() => {
      this.loadPropertyData(() => {
        this.getPropertyLetter();
      });
    });
  }

 

  getPropertyLetter(): void {
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('propertyLetter') })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.form.patchValue({
            arrivalInstructions: response.arrivalInstructions || '',
            access: response.access || '',
            mailboxInstructions: response.mailboxInstructions || '',
            packageInstructions: response.packageInstructions || '',
            parkingInformation: response.parkingInformation || '',
            amenities: response.amenities || '',
            laundry: response.laundry || '',
            providedFurnishings: response.providedFurnishings || '',
            housekeeping: response.housekeeping || '',
            televisionSource: response.televisionSource || '',
            internetService: response.internetService || '',
            keyReturn: response.keyReturn || '',
            concierge: response.concierge || '',
            emergencyContact: response.emergencyContact || '',
            emergencyContactNumber: response.emergencyContactNumber || '',
            additionalNotes: response.additionalNotes || ''
          });
          this.formatPhone();
          this.applyOrganizationDefaults();
        } else {
          this.populateDefaultsFromProperty();
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.removeLoadItem('propertyLetter')
        this.populateDefaultsFromProperty();
        this.isLoading = false;
      }
    });
  }
    
  savePropertyLetter(): void {
    if (!this.propertyId) {
      console.error('No property ID available');
      return;
    }

    this.isSubmitting = true;

    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const propertyLetterRequest: PropertyLetterRequest = {
      propertyId: this.propertyId,
      organizationId: user?.organizationId || '',
      arrivalInstructions: formValue.arrivalInstructions || undefined,
      access: formValue.access || undefined,
      mailboxInstructions: formValue.mailboxInstructions || undefined,
      packageInstructions: formValue.packageInstructions || undefined,
      parkingInformation: formValue.parkingInformation || undefined,
      amenities: formValue.amenities || undefined,
      laundry: formValue.laundry || undefined,
      providedFurnishings: formValue.providedFurnishings || undefined,
      housekeeping: formValue.housekeeping || undefined,
      televisionSource: formValue.televisionSource || undefined,
      internetService: formValue.internetService || undefined,
      keyReturn: formValue.keyReturn || undefined,
      concierge: formValue.concierge || undefined,
      emergencyContact: formValue.emergencyContact || undefined,
      emergencyContactNumber: formValue.emergencyContactNumber || undefined,
      additionalNotes: formValue.additionalNotes || undefined
    };

    // Check if property letter already exists to determine create vs update
    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1)).subscribe({
      next: () => {
        // Property letter exists, update it
        this.propertyLetterService.updatePropertyLetter(propertyLetterRequest).pipe(take(1)).subscribe({
          next: (response) => {
            console.log('Property letter updated successfully');
            this.isSubmitting = false;
          },
          error: (err) => {
            console.error('Error updating property letter:', err);
            this.isSubmitting = false;
          }
        });
      },
      error: () => {
        // Property letter doesn't exist, create it
        this.propertyLetterService.createPropertyLetter(propertyLetterRequest).pipe(take(1)).subscribe({
          next: (response) => {
            console.log('Property letter created successfully');
            this.isSubmitting = false;
          },
          error: (err) => {
            console.error('Error creating property letter:', err);
            this.isSubmitting = false;
          }
        });
      }
    });
  }
  
  // Load support data
  loadOrganizationSettings(next: () => void): void {
    const orgId = this.authService.getUser()?.organizationId;
    if (!orgId) {
      next();
      return;
    }

    this.organizationService.getOrganizationByGuid(orgId).pipe(take(1), finalize(() => { this.removeLoadItem('organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        this.applyOrganizationDefaults();
        next();
      },
      error: () => {
        this.removeLoadItem('organization');
        next();
      }
    });
  }

  loadPropertyData(next: () => void): void {
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        next();
      },
      error: (err: HttpErrorResponse) => {
        this.removeLoadItem('property');
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        next();
      }
    });
  }

  buildForm(): FormGroup {
    return this.fb.group({
      arrivalInstructions: new FormControl(''),
      access: new FormControl(''),
      mailboxInstructions: new FormControl(''),
      packageInstructions: new FormControl(''),
      parkingInformation: new FormControl(''),
      amenities: new FormControl(''),
      laundry: new FormControl(''),
      providedFurnishings: new FormControl(''),
      housekeeping: new FormControl(''),
      televisionSource: new FormControl(''),
      internetService: new FormControl(''),
      keyReturn: new FormControl(''),
      concierge: new FormControl(''),
      emergencyContact: new FormControl(''),
      emergencyContactNumber: new FormControl(''),
      additionalNotes: new FormControl('')
    });
  }

  // Populate functions
  populateDefaultsFromProperty(): void {
    if (!this.property) return;

    this.form.patchValue({
      laundry: this.property.washerDryer ? 'Washer and Dryer in Unit' : '',
      providedFurnishings: this.property.unfurnished ? 'Unfurnished' : 'Furniture & Households',
      housekeeping: 'NA',
      parkingInformation: (this.property as any).parkingNotes || '',
      televisionSource: this.getTelevisionSourceFromProperty(),
      internetService: this.getInternetServiceFromProperty(),
      keyReturn: '',
      concierge: this.property.phone || '',
      amenities: this.property.amenities || ''
    });

    this.formatPhone();
    this.applyOrganizationDefaults();
  }

  getTelevisionSourceFromProperty(): string {
    const sources: string[] = [];
    if (this.property?.cable) {
      sources.push('Cable');
    }
    if ((this.property as any)?.streaming) {
      sources.push('Streaming');
    }
    return sources.join(' and ') || '';
  }

  getInternetServiceFromProperty(): string {
    if (this.property?.fastInternet) {
      return 'High-Speed Wireless';
    }
    return this.property?.internetPassword ? 'Internet Provided' : '';
  }

  applyOrganizationDefaults(): void {
    if (!this.organization) return;
    const patch: any = {};
    const maintenanceEmail = (this.organization as any).maintenanceEmail;
    const afterHoursPhone = (this.organization as any).afterHoursPhone;

    if (!this.form.get('emergencyContact')?.value && maintenanceEmail) {
      patch.emergencyContact = maintenanceEmail;
    }
    if (!this.form.get('emergencyContactNumber')?.value && afterHoursPhone) {
      patch.emergencyContactNumber = afterHoursPhone;
    }

    if (Object.keys(patch).length) {
      this.form.patchValue(patch);
      this.formatPhone();
    }
  }
  
   // Phone helpers
  stripPhoneFormatting(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  formatPhone(): void {
    const control = this.form.get('emergencyContactNumber');
    if (control && control.value) {
      const digits = control.value.replace(/\D/g, '');
      if (digits.length === 10) {
        const formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        control.setValue(formatted, { emitEvent: false });
      }
    }
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let digits = input.value.replace(/\D/g, '');
    if (digits.length > 10) {
      digits = digits.substring(0, 10);
    }

    let formatted = digits;
    if (digits.length > 6) {
      formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length > 3) {
      formatted = `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    } else if (digits.length > 0) {
      formatted = `(${digits}`;
    } else {
      formatted = '';
    }

    this.form.get('emergencyContactNumber')?.setValue(formatted, { emitEvent: false });
  }


    // Utility Methods
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

