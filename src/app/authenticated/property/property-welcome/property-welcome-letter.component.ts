import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { PropertyService } from '../services/property.service';
import { PropertyResponse } from '../models/property.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationResponse } from '../../reservation/models/reservation-model';
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
  itemsToLoad: string[] = ['property', 'reservations', 'welcomeLetter', 'propertyLetter', 'organization'];

  constructor(
    private propertyWelcomeService: PropertyWelcomeService,
    private propertyLetterService: PropertyLetterService,
    private propertyService: PropertyService,
    private organizationService: OrganizationService,
    private reservationService: ReservationService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private formatterService: FormatterService,
    private utilityService: UtilityService
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    if (!this.propertyId) {
      this.isLoading = false;
      return;
    }
    
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
              },
              error: (err) => {
                console.error('Error updating welcome letter with property/organization IDs:', err);
              }
            });
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
      selectedReservationId: new FormControl(null)
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

    // Get tenant email from selected reservation
    const tenantEmail = this.selectedReservation?.contactEmail || '';
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
      result = result.replace(/\{\{building\}\}/g, this.property.buildingCode || 'N/A');
      result = result.replace(/\{\{size\}\}/g, this.property.bedrooms?.toString() || 'N/A');
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
    if (this.organization) {
      const maintenanceEmail = (this.organization as any).maintenanceEmail || this.propertyLetter?.emergencyContact || '';
      const afterHoursPhone = (this.organization as any).afterHoursPhone || this.propertyLetter?.emergencyContactNumber || '';
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
    
    const building = this.property.buildingCode || 'N/A';
    const size = this.property.bedrooms?.toString() || 'N/A';
    const unitFloorLevel = this.property.suite || 'N/A'; // Using suite as unit/floor level, adjust if needed
    
    return `Building: ${building}\t\tSize: ${size}\t\t\tUnit Floor level: ${unitFloorLevel}`;
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
