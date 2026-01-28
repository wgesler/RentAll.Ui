import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationResponse, ReservationListResponse } from '../../reservation/models/reservation-model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyHtmlService } from '../services/property-html.service';
import { PropertyHtmlRequest, PropertyHtmlResponse } from '../models/property-html.model';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { getTrashPickupDay, getCheckInTime, getCheckOutTime } from '../models/property-enums';
import { BehaviorSubject, Observable, map, finalize, take, filter, forkJoin, of, Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { BuildingService } from '../../organization-configuration/building/services/building.service';
import { BuildingResponse } from '../../organization-configuration/building/models/building.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentType } from '../../documents/models/document.enum';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { MappingService } from '../../../services/mapping.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';

@Component({
  selector: 'app-property-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './property-welcome-letter.component.html',
  styleUrls: ['./property-welcome-letter.component.scss']
})
export class PropertyWelcomeLetterComponent extends BaseDocumentComponent implements OnInit, OnDestroy {
  @Input() propertyId: string;
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
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
  previewIframeStyles: string = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  welcomeLetterReloadSubscription?: Subscription;
  debuggingHtml: boolean = true;
   
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'reservations', 'welcomeLetter', 'propertyLetter', 'organization', 'offices', 'contacts', 'buildings']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyHtmlService: PropertyHtmlService,
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private commonService: CommonService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private authService: AuthService,
    public override toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private buildingService: BuildingService,
    private officeService: OfficeService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private documentReloadService: DocumentReloadService,
    private http: HttpClient,
    documentHtmlService: DocumentHtmlService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr);
    this.form = this.buildForm();
  }

  //#region Welcome Letter
  ngOnInit(): void {
    if (!this.propertyId) {
      const currentSet = this.itemsToLoad$.value;
      currentSet.forEach(item => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, item));
      return;
    }

    this.loadOrganization();
    this.loadContacts();
    this.loadOffices();
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

  reloadWelcomeLetter(): void {
    // Reload property data to get latest information
    if (this.propertyId) {
      this.loadProperty();
    }
    // Reload property letter information to get latest data
    if (this.propertyId) {
      this.loadPropertyLetterInformation();
    }
    // Reload welcome letter HTML
    if (this.propertyId) {
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
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load welcome letter at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveWelcomeLetter(): void {
    if (!this.propertyId) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();

    // Create and initialize PropertyHtmlRequest
    const propertyHtmlRequest: PropertyHtmlRequest = {
      propertyId: this.propertyId,
      organizationId: this.authService.getUser()?.organizationId || '',
      welcomeLetter: formValue.welcomeLetter || '',
      inspectionChecklist: formValue.inspectionChecklist || '',
      lease: this.propertyHtml?.lease || '',
      letterOfResponsibility: this.propertyHtml?.letterOfResponsibility || '',
      noticeToVacate: this.propertyHtml?.noticeToVacate || '',
      creditAuthorization: this.propertyHtml?.creditAuthorization || '',
      creditApplicationBusiness: this.propertyHtml?.creditApplicationBusiness || '',      
      creditApplicationIndividual: this.propertyHtml?.creditApplicationIndividual || '',
      invoice: this.propertyHtml?.invoice || '',
    };

    // Save the HTML using upsert
    this.propertyHtmlService.upsertPropertyHtml(propertyHtmlRequest).pipe(take(1)).subscribe({
      next: (response) => {
        this.propertyHtml = response;
        this.toastr.success('Welcome letter saved successfully', 'Success');
        this.isSubmitting = false;
        this.generatePreviewIframe();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not save welcome letter at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.isSubmitting = false;
      }
    });
  }

  saveWelcomeLetterAsDocument(): void {
    if (!this.selectedOffice) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles
    );
    const reservationCode = this.selectedReservation?.reservationCode?.replace(/-/g, '') || '';
    const fileName = `Letter_${reservationCode}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization.organizationId,
      officeId: this.selectedOffice.officeId,
      officeName: this.selectedOffice.name,
      propertyId: this.propertyId || null,
      reservationId: this.selectedReservation?.reservationId || null,
      documentType: DocumentType.PropertyLetter,
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
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Document generation failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        console.error('Document save error:', err);
        this.isSubmitting = false;
        this.generatePreviewIframe();
      }
    });
  }
  //#endregion

  //#region Form Building Methods
  buildForm(): FormGroup {
    return this.fb.group({
      welcomeLetter: new FormControl(''),
      selectedReservationId: new FormControl(null)
    });
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
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
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
      error: (err: HttpErrorResponse) => {
        this.buildings = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load buildings at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
          this.filterReservations();
          if (this.selectedOffice && this.selectedReservation) {
            this.generatePreviewIframe();
          }
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
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
        if (err.status !== 400 && err.status !== 401) {
          this.toastr.error('Could not load Reservations', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load organization at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadPropertyLetterInformation(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter');
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property letter information at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyLetter');
      }
    });
  }
  //#endregion

  //#region Form Response Functions
  onReservationSelected(reservationId: string | null): void {
    if (!reservationId) {
      this.selectedReservation = null;
      this.generatePreviewIframe();
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
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation details.', CommonMessage.ServiceError);
        }
      }
    });
  }
  
  filterReservations(): void {
    if (!this.selectedOffice) {
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));
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
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
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
        }
      },
      error: () => {
        this.previewIframeHtml = '';
      }
    });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
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
      organization: this.organization,
      selectedOffice: this.selectedOffice,
      selectedReservation: this.selectedReservation || undefined,
      propertyId: this.propertyId || null,
      contacts: this.contacts,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const reservationCode = this.selectedReservation?.reservationCode?.replace(/-/g, '') || '';
    const fileName = `Letter_${reservationCode}_${new Date().toISOString().split('T')[0]}.pdf`;

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
    const emailConfig: EmailConfig = {
      subject: 'Your Upcoming Visit',
      noPreviewMessage: 'Please select an office and reservation to generate the welcome letter',
      noEmailMessage: 'No email address found for this reservation'
    };

    await super.onEmail(emailConfig);
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
