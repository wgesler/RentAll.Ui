import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationResponse } from '../../reservation/models/reservation-model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyHtmlService } from '../services/property-html.service';
import { PropertyHtmlRequest, PropertyHtmlResponse } from '../models/property-html.model';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { TrashDays } from '../models/property-enums';
import { BehaviorSubject, Observable, map, finalize, take, switchMap, from, filter, forkJoin, of } from 'rxjs';
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
import { Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';

@Component({
  selector: 'app-property-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './property-welcome-letter.component.html',
  styleUrls: ['./property-welcome-letter.component.scss']
})
export class PropertyWelcomeLetterComponent implements OnInit, OnDestroy {
  @Input() propertyId: string;
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationResponse[] = [];
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
  includeWelcomeLetter: boolean = true;
  includeInspectionChecklist: boolean = false;
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
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private buildingService: BuildingService,
    private officeService: OfficeService,
    private documentExportService: DocumentExportService,
    private documentService: DocumentService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private documentReloadService: DocumentReloadService,
    private http: HttpClient
  ) {
    this.form = this.buildForm();
  }

  //#region Welcome Letter
  ngOnInit(): void {
    if (!this.propertyId) {
      const currentSet = this.itemsToLoad$.value;
      currentSet.forEach(item => this.removeLoadItem(item));
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
      this.removeLoadItem('welcomeLetter');
      return;
    }

    this.propertyHtmlService.getPropertyHtmlByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.removeLoadItem('welcomeLetter'); })).subscribe({
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
    const htmlWithStyles = this.getPdfHtmlWithStyles();
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
      selectedReservationId: new FormControl(null),
      includeWelcomeLetter: new FormControl(this.includeWelcomeLetter),
      includeInspectionChecklist: new FormControl(this.includeInspectionChecklist)
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    // Wait for contacts to be loaded initially, then subscribe to changes for updates
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.removeLoadItem('contacts'); })).subscribe(contacts => {
        this.contacts = contacts || [];
       });
    });
  }

  loadProperty(): void {
    if (!this.propertyId) {
      this.removeLoadItem('property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        // Set selected office based on property's officeId
        if (response.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === response.officeId) || null;
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
      this.removeLoadItem('buildings');
      return;
    }

    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.removeLoadItem('buildings'); })).subscribe({
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
          if (this.selectedOffice && this.selectedReservation) {
            this.generatePreviewIframe();
          }
        }
      });
      this.removeLoadItem('offices');
    });
  }

  loadReservations(): void {
    if (!this.propertyId) {
      return;
    }
    
    this.reservationService.getReservationsByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (response: ReservationResponse[]) => {
        this.reservations = response;
        // Sort by tenant name
        this.reservations.sort((a, b) => {
          const nameA = (a.tenantName || '').toLowerCase();
          const nameB = (b.tenantName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservations at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1),finalize(() => { this.removeLoadItem('organization'); })).subscribe({
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
      this.removeLoadItem('propertyLetter');
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('propertyLetter'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property letter information at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('propertyLetter');
      }
    });
  }
  //#endregion

  //#region Form Response Functions
  onReservationSelected(reservationId: string | null): void {
    if (reservationId) {
      this.selectedReservation = this.reservations.find(r => r.reservationId === reservationId) || null;
    } else {
      this.selectedReservation = null;
    }
    this.generatePreviewIframe();
  }
  //#endregion
  
  //#region Form Replacement Functions
  getOrganizationName(): string {
    if (!this.organization) return '';
    if (this.selectedOffice) {
      return this.organization.name + ' ' + this.selectedOffice.name;
    }
    return this.organization.name;
  }

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
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.selectedReservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.selectedReservation.checkOutTimeId) || '');
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
    
    const trashPickupDay = this.getTrashPickupDay(this.property.trashPickupId);
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

  getTrashPickupDay(trashPickupId: number | undefined): string {
    if (!trashPickupId) return '';
    
    const dayMap: { [key: number]: string } = {
      [TrashDays.Monday]: 'Monday',
      [TrashDays.Tuesday]: 'Tuesday',
      [TrashDays.Wednesday]: 'Wednesday',
      [TrashDays.Thursday]: 'Thursday',
      [TrashDays.Friday]: 'Friday',
      [TrashDays.Saturday]: 'Saturday',
      [TrashDays.Sunday]: 'Sunday'
    };
    
    return dayMap[trashPickupId] || '';
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

  //#region Preview, Download, Print, Email Functions
  generatePreviewIframe(): void {
    // Only generate preview if both office and reservation are selected
    if (!this.selectedOffice || !this.selectedReservation) {
      this.previewIframeHtml = '';
      return;
    }

    // Load HTML files and process them
    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => {
        // Get selected documents
        const selectedDocuments: string[] = [];

        if (this.includeWelcomeLetter && htmlFiles.welcomeLetter) {
          selectedDocuments.push(htmlFiles.welcomeLetter);
        }
        if (this.includeInspectionChecklist && htmlFiles.inspectionChecklist) {
          selectedDocuments.push(htmlFiles.inspectionChecklist);
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
    // Extract all <style> tags from the HTML
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const extractedStyles: string[] = [];
    let match;
    
    styleRegex.lastIndex = 0;
    while ((match = styleRegex.exec(html)) !== null) {
      if (match[1]) {
        extractedStyles.push(match[1].trim());
      }
    }

    // Store extracted styles separately (will be injected dynamically)
    this.previewIframeStyles = extractedStyles.join('\n\n');

    // Remove <style> tags from HTML (we'll inject them dynamically)
    let processedHtml = html.replace(styleRegex, '');

    // Remove <title> tag if it exists
    processedHtml = processedHtml.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

    // Fix the logo by adding width attribute directly
    processedHtml = processedHtml.replace(
      /<img([^>]*class=["'][^"']*logo[^"']*["'][^>]*)>/gi,
      (match, attributes) => {
        // Remove existing width and height attributes if they exist
        let newAttributes = attributes.replace(/\s+(width|height)=["'][^"']*["']/gi, '');
        // Add width="180" and height="auto"
        return `<img${newAttributes} width="180" height="auto">`;
      }
    );
    
    // Use the HTML document without style tags (styles will be injected dynamically)
    this.previewIframeHtml = processedHtml;
    
    this.iframeKey++; // Force iframe refresh
  }

  stripAndReplace(html: string): string {
    if (!html) return '';
    
    let result = html;
    
    // Remove DOCTYPE declaration (case insensitive, with any attributes)
    result = result.replace(/<!DOCTYPE\s+[^>]*>/gi, '');
    
    // Remove <html> opening tag (with any attributes)
    result = result.replace(/<html[^>]*>/gi, '');
    
    // Remove </html> closing tag
    result = result.replace(/<\/html>/gi, '');
    
    // Remove <head> section including all content inside (non-greedy match)
    result = result.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    
    // Remove opening <body> tag (with any attributes)
    result = result.replace(/<body[^>]*>/gi, '');
    
    // Remove closing </body> tag
    result = result.replace(/<\/body>/gi, '');
    
    // Trim whitespace and add page break at the beginning
    result = result.trim();
    
    // Add page break if there's content
    if (result) {
      result = '<p class="breakhere"></p>\n' + result;
    }
    
    return result;
  }

  loadHtmlFiles(): Observable<{ welcomeLetter: string; inspectionChecklist: string }> {
    if (this.debuggingHtml) {
      // Load HTML from assets for faster testing
      return forkJoin({
        welcomeLetter: this.includeWelcomeLetter ? this.http.get('assets/welcome-letter.html', { responseType: 'text' }) : of(''),
        inspectionChecklist: this.includeInspectionChecklist ? this.http.get('assets/inspection-checklist.html', { responseType: 'text' }) : of('')
      });
    } else {
      // Read HTML from propertyHtml parameters
      return of({
        welcomeLetter: this.includeWelcomeLetter ? (this.propertyHtml?.welcomeLetter || '') : '',
        inspectionChecklist: this.includeInspectionChecklist ? (this.propertyHtml?.inspectionChecklist || '') : ''
      });
    }
  }

  onIncludeCheckboxChange(): void {
    this.includeWelcomeLetter = this.form.get('includeWelcomeLetter')?.value ?? true;
    this.includeInspectionChecklist = this.form.get('includeInspectionChecklist')?.value ?? false;
    this.generatePreviewIframe();
  }

  injectStylesIntoIframe(): void {
    if (!this.previewIframeStyles) {
      return;
    }

    // Find the iframe element
    const iframe = document.querySelector('iframe.preview-iframe') as HTMLIFrameElement;
    if (!iframe || !iframe.contentDocument || !iframe.contentWindow) {
      // Retry after a short delay if iframe isn't ready yet
      setTimeout(() => this.injectStylesIntoIframe(), 50);
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument;
      const iframeHead = iframeDoc.head || iframeDoc.getElementsByTagName('head')[0];
      
      if (!iframeHead) {
        return;
      }

      // Check if styles are already injected (to avoid duplicates)
      const existingStyle = iframeHead.querySelector('style[data-dynamic-styles]');
      if (existingStyle) {
        existingStyle.textContent = this.previewIframeStyles;
      } else {
        // Create a new style element and inject the styles
        // Place it at the end of head to ensure it has highest priority
        const styleElement = iframeDoc.createElement('style');
        styleElement.setAttribute('data-dynamic-styles', 'true');
        styleElement.setAttribute('type', 'text/css');
        styleElement.textContent = this.previewIframeStyles;
        iframeHead.appendChild(styleElement);
      }
      
      // Force a reflow to ensure styles are applied
      if (iframeDoc.body) {
        iframeDoc.body.offsetHeight;
      }
    } catch (error) {
      // Cross-origin or other security error - this is expected in some cases
      // Silently fail as this is not critical for functionality
    }
  }

  async onDownload(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the welcome letter', 'No Preview');
      return;
    }

    if (!this.organization?.organizationId || !this.selectedOffice) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return;
    }

    this.isDownloading = true;
    
    const htmlWithStyles = this.getPdfHtmlWithStyles();
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

    // Use server-side PDF generation
    this.documentService.generateDownload(generateDto).pipe(take(1)).subscribe({
      next: (pdfBlob: Blob) => {
        // Create download link and trigger download
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
        this.isDownloading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isDownloading = false;
        this.toastr.error('Error generating PDF. Please try again.', 'Error');
        console.error('PDF generation error:', error);
      }
    });
  }

  onPrint(): void {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the welcome letter', 'No Preview');
      return;
    }

    // Get the HTML with styles injected
    const htmlWithStyles = this.getPreviewHtmlWithStyles();
    this.documentExportService.printHTML(htmlWithStyles);
  }

  async onEmail(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the welcome letter', 'No Preview');
      return;
    }

    // Get tenant email by looking up contact from contactId
    let tenantEmail = '';
    if (this.selectedReservation?.contactId) {
      const contact = this.contacts.find(c => c.contactId === this.selectedReservation?.contactId);
      if (contact) {
        tenantEmail = contact.email || '';
      }
    }

    if (!tenantEmail) {
      this.toastr.warning('No email address found for this reservation', 'No Email');
      return;
    }

    try {
      await this.documentExportService.emailWithPDF({
        recipientEmail: tenantEmail,
        subject: 'Your Upcoming Visit',
        organizationName: this.organization?.name,
        tenantName: this.selectedReservation?.tenantName,
        htmlContent: '' // Not used anymore, but keeping for interface compatibility
      });
    } catch (error) {
      this.toastr.error('Error opening email client. Please try again.', 'Error');
    }
  }
  //#endregion

  //#region HTML Generation Functions
  getPreviewHtmlWithStyles(): string {
    const bodyContent = this.extractBodyContent();
    const printStyles = this.getPrintStyles(true);
    return this.buildHtmlDocument(bodyContent, printStyles);
  }

  getPdfHtmlWithStyles(): string {
    const bodyContent = this.extractBodyContent();
    const pdfStyles = this.getPrintStyles(false);
    return this.buildHtmlDocument(bodyContent, pdfStyles);
  }

  extractBodyContent(): string {
    let bodyContent = this.previewIframeHtml;
    
    // Find the opening <body> tag
    const bodyStartMatch = bodyContent.match(/<body[^>]*>/i);
    if (bodyStartMatch) {
      const bodyStartIndex = bodyStartMatch.index + bodyStartMatch[0].length;
      // Extract everything from after <body> to the end (or before </html> if it exists)
      let content = bodyContent.substring(bodyStartIndex);
      
      // Remove all closing </body> tags (for concatenated documents)
      content = content.replace(/<\/body>/gi, '');
      
      // Remove all closing </html> tags if they exist
      content = content.replace(/<\/html>/gi, '');
      
      return content.trim();
    }
    
    // Fallback: remove HTML structure tags
    return bodyContent.replace(/<html[^>]*>|<\/html>/gi, '').replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '').replace(/<body[^>]*>|<\/body>/gi, '');
  }

  getPrintStyles(wrapInMediaQuery: boolean): string {
    const styles = `
      @page {
        size: letter;
        margin: 0.75in;
        margin-bottom: 1in;
      }
      
      body {
        font-size: 11pt !important;
        line-height: 1.4 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      .header {
        position: relative !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        margin-bottom: 1rem !important;
      }
      
      .logo {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        max-height: 100px !important;
        max-width: 200px !important;
        display: block !important;
        margin-bottom: 1rem !important;
      }
      
      .content {
        margin-top: 0 !important;
      }
      
      h1 {
        font-size: 18pt !important;
      }
      
      h2 {
        font-size: 14pt !important;
      }
      
      h3 {
        font-size: 12pt !important;
      }
      
      p {
        margin: 0.3em 0 !important;
      }
      
      p, li {
        orphans: 2;
        widows: 2;
      }
      
      /* Ensure page breaks work for all sections */
      P.breakhere,
      p.breakhere {
        page-break-before: always !important;
        break-before: page !important;
        display: block !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `;
    
    return wrapInMediaQuery ? `@media print {${styles}}` : styles;
  }

  buildHtmlDocument(bodyContent: string, additionalStyles: string): string {
    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
      ${this.previewIframeStyles}
      ${additionalStyles}
        </style>
      </head>
      <body>
      ${bodyContent}
      </body>
      </html>`;
  }
  //#endregion

  //#region Utility Functions
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.welcomeLetterReloadSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
