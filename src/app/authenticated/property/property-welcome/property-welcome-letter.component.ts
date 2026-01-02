import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationResponse } from '../../reservation/models/reservation-model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyWelcomeService } from '../services/property-welcome.service';
import { PropertyWelcomeRequest, PropertyWelcomeResponse } from '../models/property-welcome.model';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { TrashDays } from '../models/property-enums';
import { MatDialog } from '@angular/material/dialog';
import { WelcomeLetterPreviewDialogComponent, WelcomeLetterPreviewData } from './welcome-letter-preview-dialog.component';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { BuildingService } from '../../organization-configuration/building/services/building.service';
import { BuildingResponse } from '../../organization-configuration/building/models/building.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { OfficeConfigurationService } from '../../organization-configuration/office/services/office-configuration.service';
import { OfficeConfigurationResponse } from '../../organization-configuration/office/models/office-configuration.model';
import { DocumentExportService } from '../../../services/document-export.service';

@Component({
  selector: 'app-property-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-welcome-letter.component.html',
  styleUrls: ['./property-welcome-letter.component.scss']
})
export class PropertyWelcomeLetterComponent implements OnInit {
  @Input() propertyId: string | null = null;
  
  isLoading: boolean = true;
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  welcomeLetter: PropertyWelcomeResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationResponse[] = [];
  selectedReservation: ReservationResponse | null = null;
  contacts: ContactResponse[] = [];
  buildings: BuildingResponse[] = [];
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officeConfiguration: OfficeConfigurationResponse | null = null;
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  itemsToLoad: string[] = ['property', 'reservations', 'welcomeLetter', 'propertyLetter', 'organization', 'offices'];

  constructor(
    private propertyWelcomeService: PropertyWelcomeService,
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private organizationService: OrganizationService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private buildingService: BuildingService,
    private officeService: OfficeService,
    private officeConfigurationService: OfficeConfigurationService,
    private documentExportService: DocumentExportService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    // Load offices on startup
    this.loadOffices();
    
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }
    
    // Load contacts first
    this.loadContacts();
    
    // Load buildings for building code lookup
    this.loadBuildings();
    
    // Load organization, property, reservations, welcome letter, and property letter information
    this.loadOrganizationSettings(() => {
      this.loadPropertyData(() => {
        this.loadReservations(() => {
          this.getWelcomeLetter();
          this.loadPropertyLetterInformation();
        });
      });
    });
  }

  getWelcomeLetter(): void {
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }

    this.propertyWelcomeService.getPropertyWelcomeByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.removeLoadItem('welcomeLetter'); })).subscribe({
      next: (response: PropertyWelcomeResponse) => {
        if (response) {
          this.welcomeLetter = response;
          this.form.patchValue({
            welcomeLetter: response.welcomeLetter || ''
          });

          // Check if organizationId or propertyId is empty GUID (default letter)
          const emptyGuid = '00000000-0000-0000-0000-000000000000';
          const hasEmptyGuid = response.propertyId === emptyGuid ||  response.organizationId === emptyGuid ||
                              (this.property && response.propertyId !== this.propertyId);
          
          if (hasEmptyGuid && this.property) {
            // Update with actual propertyId (backend will set organizationId from property)
            const updateRequest: PropertyWelcomeRequest = {
              propertyId: this.propertyId,
              organizationId: this.organization?.organizationId || '',
              welcomeLetter: response.welcomeLetter || ''
            };
            
            this.propertyWelcomeService.updatePropertyWelcome(updateRequest).pipe(take(1)).subscribe({
              next: (updatedResponse) => {
                this.welcomeLetter = updatedResponse;
                this.generatePreviewIframe();
              },
              error: (err) => {
                console.error('Error updating welcome letter with property/organization IDs:', err);
              }
            });
          } else {
            this.generatePreviewIframe();
          }
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.removeLoadItem('welcomeLetter');
        this.isLoading = false;
      }
    });
  }

  saveWelcomeLetter(): void {
    if (!this.propertyId) {
      console.error('No property ID available');
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();

    // If welcome letter exists, update it
    if (this.welcomeLetter) {
      const updateRequest: PropertyWelcomeRequest = {
        propertyId: this.propertyId,
        organizationId: this.organization?.organizationId || '',
        welcomeLetter: formValue.welcomeLetter || ''
      };
      
      this.propertyWelcomeService.updatePropertyWelcome(updateRequest).pipe(take(1)).subscribe({
        next: (response) => {
          this.toastr.success('Welcome letter saved successfully', 'Success');
          this.welcomeLetter = response;
          this.isSubmitting = false;
        },
        error: (err) => {
          console.error('Error updating welcome letter:', err);
          this.toastr.error('Could not save welcome letter at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          this.isSubmitting = false;
        }
      });
    } else {
      // Welcome letter doesn't exist, create it
      const createRequest: PropertyWelcomeRequest = {
        propertyId: this.propertyId,
        organizationId: this.organization?.organizationId || '',
        welcomeLetter: formValue.welcomeLetter || ''
      };
      
      this.propertyWelcomeService.createPropertyWelcome(createRequest).pipe(take(1)).subscribe({
        next: (response) => {
          this.toastr.success('Welcome letter saved successfully', 'Success');
          this.welcomeLetter = response;
          this.isSubmitting = false;
        },
        error: (err) => {
          console.error('Error creating welcome letter:', err);
          this.toastr.error('Could not save welcome letter at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          this.isSubmitting = false;
        }
      });
    }
  }

  // Form building function
  buildForm(): FormGroup {
    return this.fb.group({
      welcomeLetter: new FormControl(''),
      selectedReservationId: new FormControl(null),
      selectedOfficeId: new FormControl(null)
    });
  }

  // Load property, reservations, and property letter data
  loadPropertyData(next: () => void): void {
    if (!this.propertyId) {
      next();
      return;
    }

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

  loadContacts(): void {
    this.contactService.getContacts().pipe(take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts || [];
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Welcome Letter Component - Error loading contacts:', err);
        this.contacts = [];
      }
    });
  }

  loadBuildings(): void {
    const orgId = this.authService.getUser()?.organizationId;
    if (!orgId) {
      return;
    }

    this.buildingService.getBuildings().pipe(take(1)).subscribe({
      next: (buildings: BuildingResponse[]) => {
        this.buildings = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Welcome Letter Component - Error loading buildings:', err);
        this.buildings = [];
      }
    });
  }

  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId;
    if (!orgId) {
      this.removeLoadItem('offices');
      return;
    }

    this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === orgId && o.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Welcome Letter Component - Error loading offices:', err);
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('offices');
      }
    });
  }

  onOfficeSelected(officeId: number | null): void {
    if (officeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.loadOfficeConfiguration(officeId);
    } else {
      this.selectedOffice = null;
      this.officeConfiguration = null;
    }
    this.generatePreviewIframe();
  }

  loadOfficeConfiguration(officeId: number): void {
    this.officeConfigurationService.getOfficeConfigurationByOfficeId(officeId).pipe(take(1)).subscribe({
      next: (config: OfficeConfigurationResponse) => {
        this.officeConfiguration = config;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Welcome Letter Component - Error loading office configuration:', err);
        this.officeConfiguration = null;
        if (err.status !== 400) {
          this.toastr.error('Could not load office configuration at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadReservations(next: () => void): void {
    this.reservationService.getReservations().pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (response: ReservationResponse[]) => {
        // Filter reservations by propertyId
        if (this.propertyId) {
          this.reservations = response.filter(r => r.propertyId === this.propertyId);
          // Sort by tenant name
          this.reservations.sort((a, b) => {
            const nameA = (a.tenantName || '').toLowerCase();
            const nameB = (b.tenantName || '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
        }
        next();
      },
      error: (err: HttpErrorResponse) => {
        this.removeLoadItem('reservations');
        if (err.status !== 400) {
          this.toastr.error('Could not load reservations at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        next();
      }
    });
  }


  loadOrganizationSettings(next: () => void): void {
    const orgId = this.authService.getUser()?.organizationId;
    if (!orgId) {
      next();
      return;
    }

    this.organizationService.getOrganizationByGuid(orgId).pipe(take(1), finalize(() => { this.removeLoadItem('organization'); })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        next();
      },
      error: () => {
        this.removeLoadItem('organization');
        next();
      }
    });
  }

  loadPropertyLetterInformation(): void {
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('propertyLetter'); })).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.removeLoadItem('propertyLetter');
        this.isLoading = false;
      }
    });
  }

  onReservationSelected(reservationId: string | null): void {
    if (reservationId) {
      this.selectedReservation = this.reservations.find(r => r.reservationId === reservationId) || null;
    } else {
      this.selectedReservation = null;
    }
    this.generatePreviewIframe();
  }

  previewWelcomeLetter(): void {
    const formValue = this.form.getRawValue();
    const welcomeLetterHtml = formValue.welcomeLetter || '';
    
    if (!welcomeLetterHtml.trim()) {
      this.toastr.warning('Please enter a welcome letter to preview', 'No Content');
      return;
    }

    // Replace placeholders with actual data
    const previewHtml = this.replacePlaceholders(welcomeLetterHtml);

    // Get tenant email by looking up contact from contactId
    let tenantEmail = '';
    if (this.selectedReservation?.contactId) {
      const contact = this.contacts.find(c => c.contactId === this.selectedReservation?.contactId);
      if (contact) {
        tenantEmail = contact.email || '';
      }
    }
    // Get organization name
    const organizationName = this.organization?.name || '';
    // Get tenant name
    const tenantName = this.selectedReservation?.tenantName || '';

    // Open preview dialog
    this.dialog.open(WelcomeLetterPreviewDialogComponent, {
      width: '90%',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: {
        html: previewHtml,
        email: tenantEmail,
        organizationName: organizationName,
        tenantName: tenantName
      } as WelcomeLetterPreviewData
    });
  }

  replacePlaceholders(html: string): string {
    let result = html;

    if (this.organization) {    
      result = result.replace(/\{\{organizationName\}\}/g, this.organization?.name || '');
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

    // Handle logo first - remove img tag if no logo exists, before other replacements
    const logoDataUrl = this.organization?.fileDetails?.dataUrl;
    if (!logoDataUrl) {
      // Remove img tags that contain the logoBase64 placeholder (before replacement)
      result = result.replace(/<img[^>]*\{\{logoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace organization placeholders
    if (this.officeConfiguration) {
      const maintenanceEmail = (this.officeConfiguration as any).maintenanceEmail || '';
      const afterHoursPhone = (this.officeConfiguration as any).afterHoursPhone || '';
      result = result.replace(/\{\{maintenanceEmail\}\}/g, maintenanceEmail);
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(afterHoursPhone) || '');
      // Replace logo placeholder with dataUrl if it exists
      if (logoDataUrl) {
        result = result.replace(/\{\{logoBase64\}\}/g, logoDataUrl);
      }
    } else if (this.propertyLetter) {
      // Fallback to property letter if organization not loaded
      result = result.replace(/\{\{maintenanceEmail\}\}/g, this.propertyLetter.emergencyContact || '');
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(this.propertyLetter.emergencyContactNumber) || '');
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

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  generatePreviewIframe(): void {
    // Only generate preview if both office and reservation are selected and welcome letter exists
    if (!this.selectedOffice || !this.selectedReservation || !this.welcomeLetter?.welcomeLetter) {
      this.previewIframeHtml = '';
      return;
    }

    const welcomeLetterHtml = this.welcomeLetter.welcomeLetter || '';
    if (!welcomeLetterHtml.trim()) {
      this.previewIframeHtml = '';
      return;
    }

    // Replace placeholders with actual data - same as preview dialog
    let processedHtml = this.replacePlaceholders(welcomeLetterHtml);

    // Extract all <style> tags from the HTML
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const extractedStyles: string[] = [];
    let match;
    
    styleRegex.lastIndex = 0;
    while ((match = styleRegex.exec(processedHtml)) !== null) {
      if (match[1]) {
        extractedStyles.push(match[1].trim());
      }
    }

    // Store extracted styles separately (will be injected dynamically)
    let consolidatedStyles = extractedStyles.join('\n\n');
    
    // Match preview dialog styling exactly
    // Remove max-width constraint
    consolidatedStyles = consolidatedStyles.replace(
      /(body\s*\{[^}]*?)max-width:\s*[^;]+;?/gi,
      '$1'
    );
    // Override body padding to match preview dialog: padding: 2rem 2rem 2rem 4rem
    // Replace any existing padding with the preview dialog's padding
    consolidatedStyles = consolidatedStyles.replace(
      /(body\s*\{[^}]*?)padding:\s*[^;]+;?/gi,
      '$1'
    );
    // Add the preview dialog's exact padding
    consolidatedStyles = consolidatedStyles.replace(
      /(body\s*\{)/gi,
      '$1\n      padding: 2rem 2rem 2rem 4rem !important;'
    );
    
    // Fix duplicate .label rules - extract font-weight from standalone .label rule and apply to combined rule
    const standaloneLabelMatch = consolidatedStyles.match(/\.label\s*\{[^}]*font-weight:\s*(\d+)\s*!important[^}]*\}/i);
    if (standaloneLabelMatch && (consolidatedStyles.includes('.label, .separator-label') || consolidatedStyles.includes('.label,.separator-label'))) {
      const fontWeightValue = standaloneLabelMatch[1];
      // Update the combined rule to use the same font-weight as the standalone rule
      // Use a more precise regex that preserves all other properties including margins
      consolidatedStyles = consolidatedStyles.replace(
        /(\.label\s*,\s*\.separator-label\s*\{[^}]*?)(font-weight:\s*)\d+(\s*!important;?)([^}]*\})/gi,
        `$1$2${fontWeightValue}$3$4`
      );
    }
    
    this.previewIframeStyles = consolidatedStyles;

    // Remove <style> tags from HTML (we'll inject them dynamically)
    processedHtml = processedHtml.replace(styleRegex, '');

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
    } catch (e) {
      // Cross-origin or other security error - this is expected in some cases
      console.warn('Could not inject styles into iframe:', e);
    }
  }

  async onDownload(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the welcome letter', 'No Preview');
      return;
    }

    this.isDownloading = true;
    
    try {
      // Get the HTML with print styles applied directly (for PDF generation)
      const htmlWithStyles = this.getPdfHtmlWithStyles();
      
      // Generate filename
      const companyName = (this.organization?.name || 'WelcomeLetter').replace(/[^a-z0-9]/gi, '_');
      const fileName = `${companyName}_WelcomeLetter_${new Date().toISOString().split('T')[0]}.pdf`;

      // Use the service to download PDF
      await this.documentExportService.downloadPDF(
        htmlWithStyles,
        fileName
      );
      
      this.isDownloading = false;
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.isDownloading = false;
      this.toastr.error('Error generating PDF. Please try again.', 'Error');
    }
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
      // Get the HTML with print styles applied directly (for PDF generation)
      const htmlWithStyles = this.getPdfHtmlWithStyles();
      
      await this.documentExportService.emailWithPDF({
        recipientEmail: tenantEmail,
        subject: 'Your Upcoming Visit',
        organizationName: this.organization?.name,
        tenantName: this.selectedReservation?.tenantName,
        htmlContent: htmlWithStyles
      });
    } catch (error) {
      console.error('Error sending email:', error);
      this.toastr.error('Error generating PDF for email. Please try the Download button first, then attach it manually to your email.', 'Error');
    }
  }

  private getPreviewHtmlWithStyles(): string {
    // Extract body content from previewIframeHtml (it's already a complete HTML document)
    // The previewIframeHtml already has the styles removed, so we need to add them back
    let bodyContent = this.previewIframeHtml;
    
    // If it's a complete document, extract just the body content
    const bodyMatch = bodyContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      bodyContent = bodyMatch[1].trim();
    } else {
      // If it's not a complete document, it might already be just body content
      // Remove any html/head tags if present
      bodyContent = bodyContent.replace(/<html[^>]*>|<\/html>/gi, '').replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    }

    // Add print-specific styles to fix print/PDF issues
    const printStyles = `
      /* Print and PDF specific styles */
      @media print {
        /* Ensure proper margins for printing - let text flow naturally to bottom */
        /* @page applies to ALL pages, including second page and beyond */
        @page {
          size: letter;
          margin: 0.75in;
        }
        
        body {
          margin: 0;
          font-size: 11pt !important;
          line-height: 1.4 !important;
          padding: 0 !important;
        }
        
        /* Logo positioning for print - ensure it's at the top */
        /* No padding/margin at top - logo starts at page margin */
        .header {
          position: relative !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
          margin-bottom: 1rem !important;
        }
        
        /* Ensure content on subsequent pages starts at the top margin */
        .content {
          margin-top: 0 !important;
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
        
        /* Adjust content margin for print - remove the large top margin since logo is now relative */
        .content {
          margin-top: 0 !important;
        }
        
        /* Adjust heading sizes for print */
        h1 {
          font-size: 18pt !important;
        }
        
        h2 {
          font-size: 14pt !important;
        }
        
        h3 {
          font-size: 12pt !important;
        }
        
        /* Adjust paragraph spacing for print */
        p {
          margin: 0.3em 0 !important;
        }
        
        /* Prevent widows and orphans - but allow natural page breaks */
        p, li {
          orphans: 2;
          widows: 2;
        }
      }
      
    `;

    // Combine the HTML with the styles to create a complete document
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${this.previewIframeStyles}
${printStyles}
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  private getPdfHtmlWithStyles(): string {
    // Extract body content from previewIframeHtml
    let bodyContent = this.previewIframeHtml;
    
    const bodyMatch = bodyContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      bodyContent = bodyMatch[1].trim();
    } else {
      bodyContent = bodyContent.replace(/<html[^>]*>|<\/html>/gi, '').replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    }

    // Apply print styles directly (not in media query) for PDF generation
    // PDF generators often don't respect @media print, so we apply styles directly
    const pdfStyles = `
      /* PDF styles - applied directly to match print output exactly */
      body {
        font-size: 11pt !important;
        line-height: 1.4 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      /* Page margins for PDF */
      @page {
        size: letter;
        margin: 0.75in;
      }
      
      /* Logo positioning for PDF - ensure it's at the top */
      /* No padding/margin at top - logo starts at page margin */
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
      
      /* Adjust content margin for PDF - remove the large top margin since logo is now relative */
      .content {
        margin-top: 0 !important;
      }
      
      /* Adjust heading sizes for PDF */
      h1 {
        font-size: 18pt !important;
      }
      
      h2 {
        font-size: 14pt !important;
      }
      
      h3 {
        font-size: 12pt !important;
      }
      
      /* Adjust paragraph spacing for PDF */
      p {
        margin: 0.3em 0 !important;
      }
      
      /* Prevent widows and orphans - but allow natural page breaks */
      p, li {
        orphans: 2;
        widows: 2;
      }
    `;

    // Combine the HTML with the styles to create a complete document for PDF
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${this.previewIframeStyles}
${pdfStyles}
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }
}
