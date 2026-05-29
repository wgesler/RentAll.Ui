import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { PropertyInformationRequest, PropertyInformationResponse } from '../models/property-information.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyInformationService } from '../services/property-information.service';
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
  @Input() copiedPropertyInformation: PropertyInformationResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() hideOfficeAndPropertyCode: boolean = false;

  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'propertyInformation', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private propertyInformationService: PropertyInformationService,
    private propertyService: PropertyService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private utilityService: UtilityService
  ) {
    this.form = this.buildForm();
  }

  //#region Property-Information
  ngOnInit(): void {
    this.loadOffices();
    
    if (!this.hasPersistedPropertyId()) {
      if (this.copiedPropertyInformation) 
        this.populateFormFromCopiedData();
      this.applyAddModeOfficeDefaults();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      return;
    }

    this.loadPropertyData();
    this.getPropertyInformation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId'] && this.hasPersistedPropertyId() && !changes['propertyId'].firstChange) {
      this.loadPropertyData();
      this.getPropertyInformation();
    }
    
    if (changes['copiedPropertyInformation'] && this.copiedPropertyInformation && !this.hasPersistedPropertyId()) {
      this.populateFormFromCopiedData();
      this.applyAddModeOfficeDefaults();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
    }
    
    if (changes['officeId'] && this.offices.length > 0) {
      this.onTitleBarOfficeIdUpdate(changes['officeId'].currentValue as number | null);
    }
  }
  
  getPropertyInformation(): void {
    if (!this.hasPersistedPropertyId()) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      return;
    }

    this.propertyInformationService.getPropertyInformationByGuid(this.propertyId as string).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation'); })).subscribe({
      next: (response: PropertyInformationResponse) => {
        if (response) {
          this.populateForm(response);
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
    
  savePropertyInformation(): void {
    if (!this.hasPersistedPropertyId()) {
      this.toastr.error('Property must be saved first before saving property information.', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;

    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const propertyInformationRequest: PropertyInformationRequest = {
      propertyId: this.propertyId as string,
      organizationId: user?.organizationId || '',
      arrivalInstructions: formValue.arrivalInstructions || undefined,
      access: formValue.access || undefined,
      mailboxInstructions: formValue.mailboxInstructions || undefined,
      packageInstructions: formValue.packageInstructions || undefined,
      parkingInformation: formValue.parkingInformation || undefined,
      laundry: formValue.laundry || undefined,
      providedFurnishings: formValue.providedFurnishings || undefined,
      housekeeping: formValue.housekeeping || undefined,
      televisionSource: formValue.televisionSource || undefined,
      internetService: formValue.internetService || undefined,
      keyReturn: formValue.keyReturn || undefined,
      concierge: formValue.concierge || undefined,
      maintenanceEmail: formValue.maintenanceEmail || undefined,
      emergencyPhone: formValue.emergencyPhone ? this.formatterService.stripPhoneFormatting(formValue.emergencyPhone) : undefined,
      additionalNotes: formValue.additionalNotes || undefined
    };

    this.propertyInformationService.getPropertyInformationByGuid(this.propertyId as string).pipe(take(1)).subscribe({
      next: () => {
        this.propertyInformationService.updatePropertyInformation(propertyInformationRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property information updated successfully', CommonMessage.Success);
            this.copiedPropertyInformation = null;
            this.welcomeLetterReloadService.triggerReload();
          },
          error: () => {}
        });
      },
      error: () => {
        this.propertyInformationService.createPropertyInformation(propertyInformationRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
          next: () => {
            this.toastr.success('Property information created successfully', CommonMessage.Success);
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
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.globalSelectionService.getOfficeUiState$(this.offices).pipe(take(1)).subscribe({
          next: uiState => {
            this.selectedOffice = uiState.selectedOffice;
            this.showOfficeDropdown = uiState.showOfficeDropdown;
          }
        });
        
        if (this.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
        }

        this.applyAddModeOfficeDefaults();
      });
    });
  }

  loadPropertyData(): void {
    if (!this.hasPersistedPropertyId()) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId as string).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
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
      laundry: new FormControl(''),
      providedFurnishings: new FormControl(''),
      housekeeping: new FormControl(''),
      televisionSource: new FormControl(''),
      internetService: new FormControl(''),
      keyReturn: new FormControl(''),
      concierge: new FormControl(''),
      maintenanceEmail: new FormControl(''),
      emergencyPhone: new FormControl(''),
      additionalNotes: new FormControl('')
    });
  }

  populateForm(response: PropertyInformationResponse): void {
    this.form.patchValue({
      arrivalInstructions: response.arrivalInstructions || '',
      access: response.access || '',
      mailboxInstructions: response.mailboxInstructions || '',
      packageInstructions: response.packageInstructions || '',
      parkingInformation: response.parkingInformation || '',
      laundry: response.laundry || '',
      providedFurnishings: response.providedFurnishings || '',
      housekeeping: response.housekeeping || '',
      televisionSource: response.televisionSource || '',
      internetService: response.internetService || '',
      keyReturn: response.keyReturn || '',
      concierge: response.concierge || '',
      maintenanceEmail: response.maintenanceEmail || '',
      emergencyPhone: response.emergencyPhone ? this.formatterService.phoneNumber(response.emergencyPhone) : '',
      additionalNotes: response.additionalNotes || ''
    });
    this.formatPhone();
  }
 
  populateFormFromCopiedData(): void {
    if (!this.copiedPropertyInformation) {
      return;
    }

    this.form.patchValue({
      arrivalInstructions: this.copiedPropertyInformation.arrivalInstructions || '',
      access: this.copiedPropertyInformation.access || '',
      mailboxInstructions: this.copiedPropertyInformation.mailboxInstructions || '',
      packageInstructions: this.copiedPropertyInformation.packageInstructions || '',
      parkingInformation: this.copiedPropertyInformation.parkingInformation || '',
      laundry: this.copiedPropertyInformation.laundry || '',
      providedFurnishings: this.copiedPropertyInformation.providedFurnishings || '',
      housekeeping: this.copiedPropertyInformation.housekeeping || '',
      televisionSource: this.copiedPropertyInformation.televisionSource || '',
      internetService: this.copiedPropertyInformation.internetService || '',
      keyReturn: this.copiedPropertyInformation.keyReturn || '',
      concierge: this.copiedPropertyInformation.concierge || '',
      maintenanceEmail: this.copiedPropertyInformation.maintenanceEmail || '',
      emergencyPhone: this.copiedPropertyInformation.emergencyPhone ? this.formatterService.phoneNumber(this.copiedPropertyInformation.emergencyPhone) : '',
      additionalNotes: this.copiedPropertyInformation.additionalNotes || ''
    });
    this.formatPhone();
    this.applyAddModeOfficeDefaults();
  }

  populateDefaultsFromProperty(): void {
    if (!this.property) return;

    const laundryText = this.property.washerDryerInUnit
      ? 'Washer and Dryer in Unit'
      : (this.property.washerDryerInBldg ? 'Washer and Dryer in Building' : '');

    this.form.patchValue({
      laundry: laundryText,
      housekeeping: 'NA',
      parkingInformation: this.property.parkingNotes || '',
      televisionSource: this.getTelevisionSourceFromProperty(),
      internetService: this.getInternetServiceFromProperty(),
      keyReturn: '',
      concierge: this.property.phone || ''
    });

    this.formatPhone();
    this.applyAddModeOfficeDefaults();
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

  applyAddModeOfficeDefaults(): void {
    if (this.hasPersistedPropertyId()) return;
    if (!this.selectedOffice) return;

    const patch: any = {};
    const maintenanceEmail = this.selectedOffice.maintenanceEmail;
    const afterHoursPhone = this.selectedOffice.afterHoursPhone;

    if (!this.form.get('maintenanceEmail')?.value && maintenanceEmail) {
      patch.maintenanceEmail = maintenanceEmail;
    }
    if (!this.form.get('emergencyPhone')?.value && afterHoursPhone) {
      patch.emergencyPhone = this.formatterService.phoneNumber(afterHoursPhone);
    }

    if (Object.keys(patch).length) {
      this.form.patchValue(patch);
      this.formatPhone();
    }
  }
  //#endregion
  
  //#region Title Bar Updates
  onTitleBarOfficeIdUpdate(newOfficeId: number | null): void {
    if (newOfficeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
    } else {
      this.selectedOffice = null;
    }
    this.applyAddModeOfficeDefaults();
  }
  //#endregion

  //#region Utility Methods
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('emergencyPhone'));
  }

  hasPersistedPropertyId(): boolean {
    return !!this.propertyId && this.propertyId !== 'new';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

