import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { finalize, take, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';


@Component({
  selector: 'app-property-letter-information',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-letter-information.component.html',
  styleUrls: ['./property-letter-information.component.scss']
})
export class PropertyLetterInformationComponent implements OnInit, OnDestroy {
  @Input() propertyId: string | null = null;
  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'organization', 'propertyLetter']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private commonService: CommonService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    if (!this.propertyId) {
      const currentSet = this.itemsToLoad$.value;
      currentSet.forEach(item => this.removeLoadItem(item));
      return;
    }
    
    // Load all data in parallel (no dependencies)
    this.loadOrganizationSettings();
    this.loadPropertyData();
    this.getPropertyLetter();
  }

  getPropertyLetter(): void {
    if (!this.propertyId) {
      this.removeLoadItem('propertyLetter');
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('propertyLetter'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
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
      },
      error: (err: HttpErrorResponse) => {
        this.populateDefaultsFromProperty();
        this.removeLoadItem('propertyLetter');
      }
    });
  }
    
  savePropertyLetter(): void {
    if (!this.propertyId) {
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
        this.propertyLetterService.updatePropertyLetter(propertyLetterRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property letter updated successfully', CommonMessage.Success);
          },
          error: (err: HttpErrorResponse) => {
            if (err.status !== 400) {
              this.toastr.error('Could not update property letter. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
      },
      error: () => {
        // Property letter doesn't exist, create it
        this.propertyLetterService.createPropertyLetter(propertyLetterRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property letter created successfully', CommonMessage.Success);
          },
          error: (err: HttpErrorResponse) => {
            if (err.status !== 400) {
              this.toastr.error('Could not create property letter. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
      }
    });
  }
  
  // Data Loading Methods
  loadOrganizationSettings(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.removeLoadItem('organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        this.applyOrganizationDefaults();
      },
      error: (err: HttpErrorResponse) => {
        this.removeLoadItem('organization');
      }
    });
  }

  loadPropertyData(): void {
    if (!this.propertyId) {
      this.removeLoadItem('property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('property');
      }
    });
  }

  // Form Methods
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

  // Populate Functions
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
  
   // Phone Helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('emergencyContactNumber'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('emergencyContactNumber'));
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
}

