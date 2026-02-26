import { AsyncPipe, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, forkJoin, map, of, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { EmailService } from '../../email/services/email.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailType } from '../../email/models/email.enum';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { DocumentService } from '../../documents/services/document.service';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { BuildingService } from '../../organizations/services/building.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { getCheckInTime, getCheckOutTime, getTrashPickupDay } from '../models/property-enums';
import { PropertyHtmlResponse } from '../models/property-html.model';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyHtmlService } from '../services/property-html.service';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { EntityType } from '../../contacts/models/contact-enum';

@Component({
    selector: 'app-property-welcome-letter',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
    templateUrl: './property-welcome-letter.component.html',
    styleUrls: ['./property-welcome-letter.component.scss']
})
export class PropertyWelcomeLetterComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId: string;
  @Input() externalReservationId: string | null = null; // Input to accept reservationId from parent
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() propertyCode: string | null = null; // Input to accept propertyCode from parent
  @Output() reservationSelected = new EventEmitter<string | null>();
  @Output() officeIdChange = new EventEmitter<number | null>(); // Output to emit officeId changes to parent
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  emailHtml: EmailHtmlResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;
  contacts: ContactResponse[] = [];
  buildings: BuildingResponse[] = [];
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  contactsSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  previewIframeHtml: string = '';
  safeHtml: SafeHtml = '';
  previewIframeStyles: string = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  welcomeLetterReloadSubscription?: Subscription;
  debuggingHtml: boolean = true;
   
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'reservations', 'welcomeLetter', 'propertyLetter', 'organization', 'offices', 'contacts', 'buildings', 'emailHtml']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyHtmlService: PropertyHtmlService,
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private commonService: CommonService,
    emailService: EmailService,
    private emailHtmlService: EmailHtmlService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private authService: AuthService,
    private fb: FormBuilder,
    private sanitizer: DomSanitizer,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private buildingService: BuildingService,
    private officeService: OfficeService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private documentReloadService: DocumentReloadService,
    private http: HttpClient,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
  }

  //#region Welcome Letter
  ngOnInit(): void {
    // Always load offices, even in Add mode (when propertyId is null)
    this.loadOffices();
    this.loadEmailHtml();
    this.loadUser();
    
    if (!this.propertyId) {
      // In Add mode, still load organization and contacts for defaults
      this.loadOrganization();
      this.loadContacts();
      const currentSet = this.itemsToLoad$.value;
      // Remove items that won't be loaded in Add mode
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'welcomeLetter');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
      return;
    }

    this.loadOrganization();
    this.loadContacts();
    this.loadBuildings();
    this.loadReservations();
    this.loadPropertyLetterInformation();
    this.loadProperty();
    this.getWelcomeLetter();
    
    
    // Subscribe to welcome letter reload events
    this.welcomeLetterReloadSubscription = this.welcomeLetterReloadService.reloadWelcomeLetter.subscribe(() => {
      this.reloadWelcomeLetter();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle external reservationId changes from Documents tab
    if (changes['externalReservationId']) {
      const newReservationId = changes['externalReservationId'].currentValue;
      const previousReservationId = changes['externalReservationId'].previousValue;
      
      // Only update if the value actually changed
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        // Update the form control and trigger selection logic
        if (newReservationId) {
          // Set the form control value without triggering the selection change event
          // to avoid circular updates
          this.form.get('selectedReservationId')?.setValue(newReservationId, { emitEvent: false });
          // Call onReservationSelected to load the full reservation details
          // Pass skipEmit=true to prevent emitting back to Documents (avoid circular update)
          this.onReservationSelected(newReservationId, true);
        } else {
          // Clear the selection
          this.form.get('selectedReservationId')?.setValue(null, { emitEvent: false });
          this.selectedReservation = null;
          this.generatePreviewIframe();
        }
      }
    }
    
    // When officeId changes from parent, set the selected office (don't emit back)
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Only update if the value actually changed
      if (newOfficeId !== previousOfficeId) {
        // If offices are already loaded, update immediately
        if (this.offices.length > 0) {
          if (newOfficeId !== null && newOfficeId !== undefined) {
            this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
            if (this.selectedOffice) {
              this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId });
              this.filterReservations();
            }
          } else {
            this.selectedOffice = null;
            this.form.patchValue({ selectedOfficeId: null });
            this.filterReservations();
          }
        }
        // If offices aren't loaded yet, loadOffices() will handle initialization when offices arrive
        // The officeId is already set, so loadOffices() will pick it up
      }
    }
    
    // Handle propertyCode changes from parent - regenerate preview if reservation is selected
    if (changes['propertyCode']) {
      const newPropertyCode = changes['propertyCode'].currentValue;
      const previousPropertyCode = changes['propertyCode'].previousValue;
      
      // Only update if the value actually changed and we have a reservation selected
      if (newPropertyCode !== previousPropertyCode && this.selectedReservation) {
        this.generatePreviewIframe();
      }
    }
  }

  reloadWelcomeLetter(): void {
    if (this.propertyId) {
      this.loadProperty();
      this.loadPropertyLetterInformation();
      this.getWelcomeLetter();
    }
  }

  getWelcomeLetter(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'welcomeLetter');
      return;
    }

    this.propertyHtmlService.getPropertyHtmlByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'welcomeLetter'); })).subscribe({
      next: (response: PropertyHtmlResponse) => {
        if (response) {
          this.propertyHtml = response;
          this.form.patchValue({  welcomeLetter: response.welcomeLetter || '' });
          this.generatePreviewIframe();
        }
      },
      error: () => {}
    });
  }

  saveWelcomeLetter(): void {
    if (!this.selectedOffice || !this.selectedReservation) {
      this.toastr.warning('Please select an office and reservation to generate the welcome letter', 'Missing Selection');
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles
    );

    const fileName = this.utilityService.generateDocumentFileName('welcomeLetter', this.selectedReservation?.reservationCode);
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization.organizationId,
      officeId: this.selectedOffice.officeId,
      officeName: this.selectedOffice.name,
      propertyId: this.propertyId || null,
      reservationId: this.selectedReservation?.reservationId || null,
      documentTypeId: Number(DocumentType.PropertyLetter),
      fileName: fileName
    };

    this.documentService.generate(generateDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        this.toastr.success('Document generated successfully', 'Success');
        this.isSubmitting = false;
        this.generatePreviewIframe();
        
        // Trigger document list reload
        this.documentReloadService.triggerReload();
      },
      error: () => {
        this.isSubmitting = false;
        this.generatePreviewIframe();
      }
    });
  }
  //#endregion

  //#region Form Building Methods
  buildForm(): FormGroup {
    const form = this.fb.group({
      welcomeLetter: new FormControl(''),
      selectedReservationId: new FormControl({ value: null, disabled: !this.selectedOffice }),
      selectedOfficeId: new FormControl({ value: null, disabled: false })
    });
    return form;
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe(contacts => {
        this.contacts = contacts || [];
       });
    });
  }

  loadProperty(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        // Set selected office based on property's officeId
        if (response.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === response.officeId) || null;
          this.filterReservations();
          // Generate preview if reservation is already selected
          if (this.selectedOffice && this.selectedReservation) {
            this.generatePreviewIframe();
          }
        }
      },
      error: () => {}
    });
  }

  loadBuildings(): void {
    const orgId = this.authService.getUser()?.organizationId;
    if (!orgId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
      return;
    }

    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (buildings: BuildingResponse[]) => {
        this.buildings = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
      },
      error: () => {
        this.buildings = [];
      }
    });
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        if (this.officeId !== null && this.officeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (this.selectedOffice) {
            this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId });
            this.filterReservations();
          }
        } else if (this.selectedReservation?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.selectedReservation.officeId) || null;
          this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
          this.filterReservations();
        } else if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
          this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
          this.filterReservations();
        }
      });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    });
  }

  loadReservations(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
      },
      error: () => {}
    });
  }

  loadPropertyLetterInformation(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter');
      return;
    }

    this.propertyLetterService.getPropertyInformationByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
        }
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter');
      }
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml'); })).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: () => {}
    });
  }

  loadUser(): void {
    
  }
  //#endregion

  //#region Form Response Functions
  onReservationSelected(reservationId: string | null, skipEmit: boolean = false): void {
    if (!reservationId) {
      this.selectedReservation = null;
      this.generatePreviewIframe();
      // Emit null to clear reservation in Documents tab (unless this is an external update)
      if (!skipEmit) {
        this.reservationSelected.emit(null);
      }
      return;
    }
    
    // Load full reservation details when selected from dropdown
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        if (reservation.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === reservation.officeId) || null;
        }
        this.generatePreviewIframe();
        // Emit reservationId to update Documents tab (unless this is an external update)
        if (!skipEmit) {
          this.reservationSelected.emit(reservationId);
        }
      },
      error: () => {}
    });
  }
  
  filterReservations(): void {
    if (!this.selectedOffice) {
      this.availableReservations = [];
      // Disable the reservation dropdown when no office is selected
      this.form.get('selectedReservationId')?.disable();
      return;
    }
    
    // Enable the reservation dropdown when an office is selected
    this.form.get('selectedReservationId')?.enable();
    
    // Filter reservations by the selected office
    if (this.reservations && this.reservations.length > 0) {
      const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
      this.availableReservations = filteredReservations.map(r => ({
        value: r,
        label: this.utilityService.getReservationLabel(r)
      }));
    } else {
      // If reservations haven't loaded yet, clear available reservations
      this.availableReservations = [];
    }
  }

  onOfficeChange(): void {
    const officeId = this.form.get('selectedOfficeId')?.value;
    if (!officeId) {
      this.selectedOffice = null;
      this.filterReservations();
      this.selectedReservation = null;
      this.form.patchValue({ selectedReservationId: null });
      this.generatePreviewIframe();
      this.officeIdChange.emit(null);
      return;
    }
    
    // Find and set the selected office
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    
    // Filter reservations by the selected office
    this.filterReservations();
    
    // Clear selected reservation when office changes
    this.selectedReservation = null;
    this.form.patchValue({ selectedReservationId: null });
    this.generatePreviewIframe();
    
    // Emit office change to parent
    this.officeIdChange.emit(this.selectedOffice?.officeId || null);
  }
  //#endregion
  
  //#region Form Replacement Functions
  replacePlaceholders(html: string): string {
    let result = html;

    if (this.organization) {    
      result = result.replace(/\{\{organizationName\}\}/g, this.getOrganizationName());
    }

    // Replace reservation placeholders
    if (this.selectedReservation) {
      result = result.replace(/\{\{tenantName\}\}/g, this.selectedReservation.tenantName || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.selectedReservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.selectedReservation.departureDate) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, getCheckInTime(this.selectedReservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, getCheckOutTime(this.selectedReservation.checkOutTimeId) || '');
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.propertyCode || this.property?.propertyCode || '');
      result = result.replace(/\{\{communityAddress\}\}/g, this.getCommunityAddress() || '');
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getApartmentAddress() || '');
      result = result.replace(/\{\{building\}\}/g, this.getBuildingDescription() || 'N/A');
      result = result.replace(/\{\{size\}\}/g,  `${this.property.bedrooms}/${this.property.bathrooms}` || 'N/A');
      result = result.replace(/\{\{unitFloorLevel\}\}/g, this.property.suite || 'N/A');
      result = result.replace(/\{\{buildingInfo\}\}/g, this.getBuildingInfo());
      result = result.replace(/\{\{phone\}\}/g, this.formatterService.phoneNumber(this.property.phone) || 'N/A');
      result = result.replace(/\{\{trashLocation\}\}/g, this.getTrashLocation());
      result = result.replace(/\{\{internetNetwork\}\}/g, this.property.internetNetwork || 'N/A');
      result = result.replace(/\{\{internetPassword\}\}/g, this.property.internetPassword || 'N/A');
      result = result.replace(/\{\{keypadAccess\}\}/g, this.property.tenantKeyCode || '');
      result = result.replace(/\{\{alarmCode\}\}/g, this.property.alarmCode || '');

    }

    // Replace property letter placeholders
    if (this.propertyLetter) {
      result = result.replace(/\{\{arrivalInstructions\}\}/g, this.propertyLetter.arrivalInstructions || '');
      result = result.replace(/\{\{mailboxInstructions\}\}/g, this.propertyLetter.mailboxInstructions || '');
      result = result.replace(/\{\{packageInstructions\}\}/g, this.propertyLetter.packageInstructions || '');
      result = result.replace(/\{\{parkingInformation\}\}/g, this.propertyLetter.parkingInformation || '');
      result = result.replace(/\{\{access\}\}/g, this.propertyLetter.access || '');
      result = result.replace(/\{\{amenities\}\}/g, this.propertyLetter.amenities || '');
      result = result.replace(/\{\{laundry\}\}/g, this.propertyLetter.laundry || '');
      result = result.replace(/\{\{providedFurnishings\}\}/g, this.propertyLetter.providedFurnishings || '');
      result = result.replace(/\{\{housekeeping\}\}/g, this.propertyLetter.housekeeping || '');
      result = result.replace(/\{\{televisionSource\}\}/g, this.propertyLetter.televisionSource || '');
      result = result.replace(/\{\{internetService\}\}/g, this.propertyLetter.internetService || '');
      result = result.replace(/\{\{keyReturn\}\}/g, this.propertyLetter.keyReturn || '');
      result = result.replace(/\{\{concierge\}\}/g, this.propertyLetter.concierge || '');
    }

    // Replace organization placeholders
    if (this.selectedOffice) {
      const maintenanceEmail = this.selectedOffice.maintenanceEmail || '';
      const afterHoursPhone = this.selectedOffice.afterHoursPhone || '';
      result = result.replace(/\{\{maintenanceEmail\}\}/g, maintenanceEmail);
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(afterHoursPhone) || '');
      
      // Get office logo - construct dataUrl if needed
      let officeLogoDataUrl = this.selectedOffice?.fileDetails?.dataUrl;
      if (!officeLogoDataUrl && this.selectedOffice?.fileDetails?.file) {
        const fileDetails = this.selectedOffice.fileDetails;
        const contentType = fileDetails.contentType || 'image/png';
        // Check if file already includes data URL prefix
        if (fileDetails.file.startsWith('data:')) {
          officeLogoDataUrl = fileDetails.file;
        } else {
          // Construct dataUrl from base64 string
          officeLogoDataUrl = `data:${contentType};base64,${fileDetails.file}`;
        }
      }
      
      // Fallback to organization logo if office logo is not available
      if (!officeLogoDataUrl && this.organization?.fileDetails?.dataUrl) {
        officeLogoDataUrl = this.organization.fileDetails.dataUrl;
      }
      
      if (officeLogoDataUrl) {
        result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoDataUrl);
      }
    } else if (this.propertyLetter) {
      // Fallback to property letter if organization not loaded
      result = result.replace(/\{\{maintenanceEmail\}\}/g, this.propertyLetter.emergencyContact || '');
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(this.propertyLetter.emergencyContactNumber) || '');
    }

    // Replace organization logo placeholder
    if (this.organization) {
      const orgLogoDataUrl = this.organization?.fileDetails?.dataUrl;
      if (orgLogoDataUrl) {
        result = result.replace(/\{\{orgLogoBase64\}\}/g, orgLogoDataUrl);
      }
    }
    
    // Remove img tags that contain logo placeholders if no logo is available
    if (!this.selectedOffice?.fileDetails?.dataUrl && !this.selectedOffice?.fileDetails?.file && !this.organization?.fileDetails?.dataUrl) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  getOrganizationName(): string {
    if (!this.organization) return '';
    if (this.selectedOffice) {
      return this.organization.name + ' ' + this.selectedOffice.name;
    }
    return this.organization.name;
  }

  getCommunityAddress(): string {
    if (!this.property) return '';
    const parts = [
      this.property.address1,
      this.property.city,
      this.property.state,
      this.property.zip
    ].filter(p => p);
    return parts.join(', ');
  }

  getApartmentAddress(): string {
    if (!this.property) return '';
    const parts = [
      this.property.address1,
      this.property.suite ? `#${this.property.suite}` : '',
      this.property.city,
      this.property.state,
      this.property.zip
    ].filter(p => p);
    return parts.join(', ');
  }

  getTrashLocation(): string {
    if (!this.property) return 'N/A';
    
    const trashPickupDay = getTrashPickupDay(this.property.trashPickupId);
    const removalLocation = this.property.trashRemoval || 'N/A';
    
    if (trashPickupDay && removalLocation !== 'N/A') {
      return `Trash is picked up on ${trashPickupDay}. The Location is: ${removalLocation}.`;
    } else if (trashPickupDay) {
      return `Trash is picked up on ${trashPickupDay}.`;
    } else if (removalLocation !== 'N/A') {
      return `The Removal location is: ${removalLocation}.`;
    }
    
    return 'N/A';
  }

  getBuildingInfo(): string {
    if (!this.property) return 'Building: N/A\t\tSize: N/A\t\t\tUnit Floor level: N/A';
    
    const building = this.getBuildingDescription() || 'N/A';
    const size = this.property.bedrooms && this.property.bathrooms ? `${this.property.bedrooms}/${this.property.bathrooms}` : 'N/A';
    const unitFloorLevel = this.property.suite || 'N/A'; // Using suite as unit/floor level, adjust if needed
    
    return `Building: ${building}\t\tSize: ${size}\t\t\tUnit Floor level: ${unitFloorLevel}`;
  }

  getBuildingDescription(): string | null {
    if (!this.property?.buildingId || !this.buildings || this.buildings.length === 0) {
      return null;
    }

    const building = this.buildings.find(b => b.buildingId === this.property.buildingId);
    return building?.name || null;
  }
  //#endregion

  //#region Html Processing
  generatePreviewIframe(): void {
    // Only generate preview if both office and reservation are selected
    if (!this.selectedOffice || !this.selectedReservation) {
      this.previewIframeHtml = '';
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml('');
      return;
    }

    // Load HTML files and process them
    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => {
        // Always include welcome letter
        const selectedDocuments: string[] = [];

        if (htmlFiles.welcomeLetter) {
          selectedDocuments.push(htmlFiles.welcomeLetter);
        }

        // If no documents selected, show empty
        if (selectedDocuments.length === 0) {
      this.previewIframeHtml = '';
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml('');
      return;
    }

        try {
          // If only one document selected, use it as-is
          if (selectedDocuments.length === 1) {
            let processedHtml = this.replacePlaceholders(selectedDocuments[0]);
            this.processAndSetHtml(processedHtml);
            return;
          }

          // Multiple documents: process first as base, strip and concatenate the rest
          // Process first document as base (full HTML)
          let combinedHtml = this.replacePlaceholders(selectedDocuments[0]);
          
          // Extract and merge styles from all documents before stripping
          const allExtractedStyles: string[] = [];
          const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
          
          // Extract styles from first document
          let match;
          styleRegex.lastIndex = 0;
          while ((match = styleRegex.exec(combinedHtml)) !== null) {
            if (match[1]) {
              let styleContent = match[1].trim();
              // Override gray text colors to black
              styleContent = styleContent.replace(/color:\s*#ccc\s*;/gi, 'color: #000 !important;');
              styleContent = styleContent.replace(/color:\s*#999\s*;/gi, 'color: #000 !important;');
              allExtractedStyles.push(styleContent);
            }
          }
          
          // Process and strip remaining documents, extracting their styles first
          for (let i = 1; i < selectedDocuments.length; i++) {
            if (selectedDocuments[i]) {
              const processed = this.replacePlaceholders(selectedDocuments[i]);
              
              // Extract styles from this document before stripping
              styleRegex.lastIndex = 0;
              while ((match = styleRegex.exec(processed)) !== null) {
                if (match[1]) {
                  let styleContent = match[1].trim();
                  // Override gray text colors to black
                  styleContent = styleContent.replace(/color:\s*#ccc\s*;/gi, 'color: #000 !important;');
                  styleContent = styleContent.replace(/color:\s*#999\s*;/gi, 'color: #000 !important;');
                  allExtractedStyles.push(styleContent);
                }
              }
              
              const stripped = this.stripAndReplace(processed);
              combinedHtml += stripped;
            }
          }
          
          // Remove existing style tags from combinedHtml (they'll be re-injected)
          combinedHtml = combinedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
          
          // Combine all extracted styles and inject them into the combined HTML
          if (allExtractedStyles.length > 0) {
            const combinedStyles = allExtractedStyles.join('\n\n');
            // Insert styles into the head section if it exists, otherwise create one
            if (combinedHtml.includes('<head>')) {
              combinedHtml = combinedHtml.replace(/<head[^>]*>/i, `$&<style>${combinedStyles}</style>`);
            } else {
              // If no head exists, add one before the body or at the start
              if (combinedHtml.includes('<body>')) {
                combinedHtml = combinedHtml.replace(/<body[^>]*>/i, `<head><style>${combinedStyles}</style></head>$&`);
              } else {
                combinedHtml = `<head><style>${combinedStyles}</style></head>${combinedHtml}`;
              }
            }
          }

          this.processAndSetHtml(combinedHtml);
        } catch (error) {
          this.previewIframeHtml = '';
          this.safeHtml = this.sanitizer.bypassSecurityTrustHtml('');
        }
      },
      error: () => {
        this.previewIframeHtml = '';
        this.safeHtml = this.sanitizer.bypassSecurityTrustHtml('');
      }
    });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(result.processedHtml);
    this.previewIframeStyles = result.extractedStyles;
    this.iframeKey++; // Force iframe refresh
  }

  stripAndReplace(html: string): string {
    return this.documentHtmlService.stripAndReplace(html);
  }

  loadHtmlFiles(): Observable<{ welcomeLetter: string; inspectionChecklist: string }> {
    if (this.debuggingHtml) {
      // Load HTML from assets for faster testing
      return forkJoin({
        welcomeLetter: this.http.get('assets/welcome-letter.html', { responseType: 'text' }),
        inspectionChecklist: of('')
      });
    } else {
      // Read HTML from propertyHtml parameters - always include welcome letter
      return of({
        welcomeLetter: this.propertyHtml?.welcomeLetter || '',
        inspectionChecklist: ''
      });
    }
  }
  //#endregion

  // #region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organization?.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || '',
      selectedReservationId: this.selectedReservation?.reservationId || null,
      propertyId: this.propertyId || null,
      contacts: this.contacts,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const fileName = this.utilityService.generateDocumentFileName('welcomeLetter', this.selectedReservation?.reservationCode);

    const downloadConfig: DownloadConfig = {
      fileName: fileName,
      documentType: DocumentType.PropertyLetter,
      noPreviewMessage: 'Please select an office and reservation to generate the welcome letter',
      noSelectionMessage: 'Organization or Office not available'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Please select an office and reservation to generate the welcome letter');
  }

  override async onEmail(): Promise<void> {
    const recipientContact = this.contacts.find(c => c.contactId === this.selectedReservation?.contactId) || null;
    const toEmail = recipientContact?.email || '';

    let toName = recipientContact?.fullName || `${recipientContact?.firstName || ''} ${recipientContact?.lastName || ''}`.trim();
    let contactName = '';
    if(recipientContact.entityTypeId == EntityType.Company) {
      toName = this.selectedReservation.tenantName || '';
      contactName = recipientContact?.fullName || `${recipientContact?.firstName || ''} ${recipientContact?.lastName || ''}`.trim();
    }

    const currentUser = this.authService.getUser();
    const agentName = currentUser.firstName + ' ' + currentUser.lastName;
    const agentPhone = this.formatterService.phoneNumber(currentUser?.phone || '') || '';
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const plainTextContent = '';
    const attachmentFileName = this.utilityService.generateDocumentFileName('welcomeLetter', this.selectedReservation?.reservationCode);
  
    const emailSubject = this.emailHtml?.letterSubject?.trim() || 'Your Upcoming Visit';
    const emailTemplateHtml = recipientContact?.entityTypeId == EntityType.Company
      ? (this.emailHtml?.corporateLetter || '')
      : (this.emailHtml?.welcomeLetter || '');

    const emailBodyHtml = emailTemplateHtml
      .replace(/\{\{toName\}\}/g, toName)
      .replace(/\{\{agentName\}\}/g, agentName || '')
      .replace(/\{\{agentPhone\}\}/g, agentPhone || '')
      .replace(/\{\{contactName\}\}/g, contactName || '');

    const emailConfig: EmailConfig = {
      subject: emailSubject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.PropertyLetter,
      emailType: EmailType.PropertyLetter,
      plainTextContent,
      htmlContent: emailBodyHtml,
      fileDetails: {
        fileName: attachmentFileName,
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Utility Functions
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.welcomeLetterReloadSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
