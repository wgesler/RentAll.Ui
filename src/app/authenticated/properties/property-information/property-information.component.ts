import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { finalize, take, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-property-information',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-information.component.html',
  styleUrls: ['./property-information.component.scss']
})
export class PropertyInformationComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId: string | null = null;
  @Input() copiedPropertyInformation: PropertyLetterResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null; // Input to accept propertyCode from parent
  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyInformation: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'organization', 'propertyInformation', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private commonService: CommonService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.loadOffices();
    
    if (!this.propertyId) {
      // If we have copied property information data, populate the form with it
      if (this.copiedPropertyInformation) {
        this.populateFormFromCopiedData();
        // Clear loading items since we're not loading from API
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
        // Still load organization settings for defaults
        this.loadOrganizationSettings();
        return;
      }
      
      const currentSet = this.itemsToLoad$.value;
      currentSet.forEach(item => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, item));
      return;
    }
    
    // Load all data in parallel (no dependencies)
    this.loadOrganizationSettings();
    this.loadPropertyData();
    this.getPropertyLetter();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If propertyId changes from null to a value (property was saved), update the component
    if (changes['propertyId'] && this.propertyId && !changes['propertyId'].firstChange) {
      // Property was just saved, now we can load/save property letter
      this.loadPropertyData();
      this.getPropertyLetter();
    }
    
    // If copiedPropertyInformation is set and we don't have propertyId yet, populate form
    if (changes['copiedPropertyInformation'] && this.copiedPropertyInformation && !this.propertyId) {
      this.populateFormFromCopiedData();
      // Clear loading items since we're not loading from API
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      if (!this.organization) {
        this.loadOrganizationSettings();
      }
    }
    
    // Handle officeId changes - update selectedOffice when officeId input changes
    if (changes['officeId'] && this.offices.length > 0) {
      const newOfficeId = changes['officeId'].currentValue;
      if (newOfficeId) {
        this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
      } else {
        this.selectedOffice = null;
      }
    }
  }

  populateFormFromCopiedData(): void {
    if (!this.copiedPropertyInformation) {
      return;
    }

    this.propertyInformation = this.copiedPropertyInformation;
    this.form.patchValue({
      arrivalInstructions: this.copiedPropertyInformation.arrivalInstructions || '',
      access: this.copiedPropertyInformation.access || '',
      mailboxInstructions: this.copiedPropertyInformation.mailboxInstructions || '',
      packageInstructions: this.copiedPropertyInformation.packageInstructions || '',
      parkingInformation: this.copiedPropertyInformation.parkingInformation || '',
      amenities: this.copiedPropertyInformation.amenities || '',
      laundry: this.copiedPropertyInformation.laundry || '',
      providedFurnishings: this.copiedPropertyInformation.providedFurnishings || '',
      housekeeping: this.copiedPropertyInformation.housekeeping || '',
      televisionSource: this.copiedPropertyInformation.televisionSource || '',
      internetService: this.copiedPropertyInformation.internetService || '',
      keyReturn: this.copiedPropertyInformation.keyReturn || '',
      concierge: this.copiedPropertyInformation.concierge || '',
      emergencyContact: this.copiedPropertyInformation.emergencyContact || '',
      emergencyContactNumber: this.copiedPropertyInformation.emergencyContactNumber || '',
      additionalNotes: this.copiedPropertyInformation.additionalNotes || ''
    });
    this.formatPhone();
  }

  getPropertyLetter(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      return;
    }

    this.propertyLetterService.getPropertyInformationByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyInformation = response;
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      }
    });
  }
    
  savePropertyLetter(): void {
    // Get propertyId from route if not provided as input (for add mode after property is saved)
    if (!this.propertyId) {
      // Try to get propertyId from parent component or route
      // For now, show error if propertyId is not available
      this.toastr.error('Property must be saved first before saving property letter information.', CommonMessage.Error);
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
    this.propertyLetterService.getPropertyInformationByGuid(this.propertyId).pipe(take(1)).subscribe({
      next: () => {
        // Property letter exists, update it
        this.propertyLetterService.updatePropertyLetter(propertyLetterRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property letter updated successfully', CommonMessage.Success);
            // Clear copied data after successful save
            this.copiedPropertyInformation = null;
            // Trigger welcome letter reload event
            this.welcomeLetterReloadService.triggerReload();
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
            // Clear copied data after successful save
            this.copiedPropertyInformation = null;
            // Trigger welcome letter reload event
            this.welcomeLetterReloadService.triggerReload();
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
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        this.applyOrganizationDefaults();
      },
      error: (err: HttpErrorResponse) => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      }
    });
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        
        if (this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        // Set selectedOffice from officeId input if provided, otherwise from property
        if (this.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
        }
      });
    });
  }

  onOfficeChange(): void {
    // Office dropdown is for display/filtering only in property-information
    // Update selectedOffice when user changes dropdown
    // Note: This doesn't change the property's officeId, just the display filter
  }

  loadPropertyData(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        if (response.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === response.officeId) || null;
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
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
      emergencyContact: new FormControl({ value: '', disabled: true }),
      emergencyContactNumber: new FormControl({ value: '', disabled: true }),
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
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
}

