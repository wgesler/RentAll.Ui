import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';


@Component({
    standalone: true,
    selector: 'app-property-information',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './property-information.component.html',
    styleUrls: ['./property-information.component.scss']
})
export class PropertyInformationComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId: string | null = null;
  @Input() copiedPropertyInformation: PropertyLetterResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() hideOfficeAndPropertyCode: boolean = false;
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

  //#region Property-Information
  ngOnInit(): void {
    this.loadOffices();
    
    if (!this.propertyId) {
      if (this.copiedPropertyInformation) {
        this.populateFormFromCopiedData();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
        this.loadOrganizationSettings();
        return;
      }
      
      const currentSet = this.itemsToLoad$.value;
      currentSet.forEach(item => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, item));
      return;
    }
    
    this.loadOrganizationSettings();
    this.loadPropertyData();
    this.getPropertyLetter();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId'] && this.propertyId && !changes['propertyId'].firstChange) {
      this.loadPropertyData();
      this.getPropertyLetter();
    }
    
    if (changes['copiedPropertyInformation'] && this.copiedPropertyInformation && !this.propertyId) {
      this.populateFormFromCopiedData();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      if (!this.organization) {
        this.loadOrganizationSettings();
      }
    }
    
    if (changes['officeId'] && this.offices.length > 0) {
      const newOfficeId = changes['officeId'].currentValue;
      if (newOfficeId) {
        this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
      } else {
        this.selectedOffice = null;
      }
    }
  }

  onOfficeChange(): void {
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
            emergencyContactNumber: response.emergencyContactNumber ? this.formatterService.phoneNumber(response.emergencyContactNumber) : '',
            additionalNotes: response.additionalNotes || ''
          });
          this.formatPhone();
          this.applyOrganizationDefaults();
        } else {
          this.populateDefaultsFromProperty();
        }
      },
      error: () => {
        this.populateDefaultsFromProperty();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      }
    });
  }
    
  savePropertyLetter(): void {
    if (!this.propertyId) {
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
      emergencyContactNumber: formValue.emergencyContactNumber ? this.formatterService.stripPhoneFormatting(formValue.emergencyContactNumber) : undefined,
      additionalNotes: formValue.additionalNotes || undefined
    };

    this.propertyLetterService.getPropertyInformationByGuid(this.propertyId).pipe(take(1)).subscribe({
      next: () => {
        this.propertyLetterService.updatePropertyLetter(propertyLetterRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property letter updated successfully', CommonMessage.Success);
            this.copiedPropertyInformation = null;
            this.welcomeLetterReloadService.triggerReload();
          },
          error: () => {}
        });
      },
      error: () => {
        this.propertyLetterService.createPropertyLetter(propertyLetterRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property letter created successfully', CommonMessage.Success);
            this.copiedPropertyInformation = null;
            this.welcomeLetterReloadService.triggerReload();
          },
          error: () => {}
        });
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizationSettings(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        this.applyOrganizationDefaults();
      },
      error: () => {
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
        
        if (this.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
        }
      });
    });
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
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }
  //#endregion

  //#region Form Methods
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
      emergencyContactNumber: this.copiedPropertyInformation.emergencyContactNumber ? this.formatterService.phoneNumber(this.copiedPropertyInformation.emergencyContactNumber) : '',
      additionalNotes: this.copiedPropertyInformation.additionalNotes || ''
    });
    this.formatPhone();
  }

  populateDefaultsFromProperty(): void {
    if (!this.property) return;

    const laundryText = this.property.washerDryerInUnit
      ? 'Washer and Dryer in Unit'
      : (this.property.washerDryerInBldg ? 'Washer and Dryer in Building' : '');

    this.form.patchValue({
      laundry: laundryText,
      providedFurnishings: this.property.unfurnished ? 'Unfurnished' : 'Furniture & Households',
      housekeeping: 'NA',
      parkingInformation: this.property.parkingNotes || '',
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
      patch.emergencyContactNumber = this.formatterService.phoneNumber(afterHoursPhone);
    }

    if (Object.keys(patch).length) {
      this.form.patchValue(patch);
      this.formatPhone();
    }
  }
  //#endregion

  //#region Phone Helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('emergencyContactNumber'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('emergencyContactNumber'));
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

