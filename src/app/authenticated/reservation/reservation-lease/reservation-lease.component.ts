import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ReservationService } from '../services/reservation.service';
import { ReservationResponse } from '../models/reservation-model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { ReservationLeaseService } from '../services/reservation-lease.service';
import { ReservationLeaseRequest, ReservationLeaseResponse } from '../models/reservation-lease.model';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { PropertyLetterService } from '../../property/services/property-letter.service';
import { PropertyLetterResponse } from '../../property/models/property-letter.model';
import { MatDialog } from '@angular/material/dialog';
import { LeasePreviewDialogComponent, LeasePreviewData } from './lease-preview-dialog.component';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';

@Component({
  selector: 'app-reservation-lease',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './reservation-lease.component.html',
  styleUrl: './reservation-lease.component.scss'
})
export class ReservationLeaseComponent implements OnInit {
  @Input() reservationId: string | null = null;
  
  isLoading: boolean = true;
  isSubmitting: boolean = false;
  form: FormGroup;
  reservation: ReservationResponse | null = null;
  lease: ReservationLeaseResponse | null = null;
  property: PropertyResponse | null = null;
  propertyLetter: PropertyLetterResponse | null = null;
  organization: OrganizationResponse | null = null;
  contact: ContactResponse | null = null;

  constructor(
    private reservationLeaseService: ReservationLeaseService,
    private reservationService: ReservationService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private organizationService: OrganizationService,
    private propertyLetterService: PropertyLetterService,
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
    if (!this.reservationId) {
      this.isLoading = false;
      return;
    }
    
    // Load reservation first, then load related data
    this.loadReservation(() => {
      if (this.reservation) {
        this.loadPropertyData(() => {
          this.loadContactData(() => {
            this.loadOrganizationSettings(() => {
              this.loadPropertyLetterInformation(() => {
                this.getLease();
              });
            });
          });
        });
      }
    });
  }

  getLease(): void {
    if (!this.reservationId) {
      this.isLoading = false;
      return;
    }

    this.reservationLeaseService.getLeaseByReservationId(this.reservationId).pipe(
      take(1),
      finalize(() => { this.isLoading = false })
    ).subscribe({
      next: (response: ReservationLeaseResponse) => {
        if (response) {
          this.lease = response;
          this.form.patchValue({
            lease: response.lease || ''
          });
        }
      },
      error: (err) => {
        // If not found, that's okay - form will remain empty
        if (err.status !== 404) {
          console.error('Error loading lease:', err);
        }
      }
    });
  }

  saveLease(): void {
    if (!this.reservationId) {
      console.error('No reservation ID available');
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();

    // If lease exists, update it
    if (this.lease) {
      const updateRequest: ReservationLeaseRequest = {
        reservationId: this.reservationId,
        organizationId: user?.organizationId || '',
        lease: formValue.lease || ''
      };
      
      this.reservationLeaseService.updateLease(updateRequest).pipe(take(1)).subscribe({
        next: (response) => {
          this.toastr.success('Lease saved successfully', 'Success');
          this.lease = response;
          this.isSubmitting = false;
        },
        error: (err) => {
          console.error('Error updating lease:', err);
          this.toastr.error('Could not save lease at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          this.isSubmitting = false;
        }
      });
    } else {
      // Lease doesn't exist, create it
      const createRequest: ReservationLeaseRequest = {
        reservationId: this.reservationId,
        organizationId: user?.organizationId || '',
        lease: formValue.lease || ''
      };
      
      this.reservationLeaseService.createLease(createRequest).pipe(take(1)).subscribe({
        next: (response) => {
          this.toastr.success('Lease saved successfully', 'Success');
          this.lease = response;
          this.isSubmitting = false;
        },
        error: (err) => {
          console.error('Error creating lease:', err);
          this.toastr.error('Could not save lease at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          this.isSubmitting = false;
        }
      });
    }
  }

  buildForm(): FormGroup {
    return this.fb.group({
      lease: new FormControl('')
    });
  }

  loadReservation(next: () => void): void {
    if (!this.reservationId) {
      next();
      return;
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1)).subscribe({
      next: (response: ReservationResponse) => {
        this.reservation = response;
        next();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading reservation:', err);
        next();
      }
    });
  }

  loadPropertyData(next: () => void): void {
    if (!this.reservation?.propertyId) {
      next();
      return;
    }

    this.propertyService.getPropertyByGuid(this.reservation.propertyId).pipe(take(1)).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        next();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading property:', err);
        next();
      }
    });
  }

  loadContactData(next: () => void): void {
    if (!this.reservation?.contactId) {
      next();
      return;
    }

    this.contactService.getContactByGuid(this.reservation.contactId).pipe(take(1)).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        next();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading contact:', err);
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

    this.organizationService.getOrganizationByGuid(orgId).pipe(take(1)).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        next();
      },
      error: () => {
        next();
      }
    });
  }

  loadPropertyLetterInformation(next: () => void): void {
    if (!this.reservation?.propertyId) {
      next();
      return;
    }

    this.propertyLetterService.getPropertyLetterByGuid(this.reservation.propertyId).pipe(take(1)).subscribe({
      next: (response: PropertyLetterResponse) => {
        if (response) {
          this.propertyLetter = response;
        }
        next();
      },
      error: () => {
        next();
      }
    });
  }

  previewLease(): void {
    const formValue = this.form.getRawValue();
    const leaseHtml = formValue.lease || '';
    
    if (!leaseHtml.trim()) {
      this.toastr.warning('Please enter a lease to preview', 'No Content');
      return;
    }

    // Replace placeholders with actual data
    const previewHtml = this.replacePlaceholders(leaseHtml);

    // Get tenant email from contact
    const tenantEmail = this.contact?.email || '';
    const organizationName = this.organization?.name || '';
    const tenantName = this.reservation?.tenantName || '';

    // Open preview dialog
    this.dialog.open(LeasePreviewDialogComponent, {
      width: '90%',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: {
        html: previewHtml,
        email: tenantEmail,
        organizationName: organizationName,
        tenantName: tenantName
      } as LeasePreviewData
    });
  }

  replacePlaceholders(html: string): string {
    let result = html;

    // Replace reservation placeholders
    if (this.reservation) {
      result = result.replace(/\{\{tenantName\}\}/g, this.reservation.tenantName || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.departureDate) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.reservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.reservation.checkOutTimeId) || '');
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
      result = result.replace(/\{\{communityAddress\}\}/g, this.getCommunityAddress() || '');
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getApartmentAddress() || '');
      result = result.replace(/\{\{phone\}\}/g, this.formatterService.phoneNumber(this.property.phone) || 'N/A');
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

    // Handle logo
    const logoDataUrl = this.organization?.fileDetails?.dataUrl;
    if (!logoDataUrl) {
      result = result.replace(/<img[^>]*\{\{logoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace organization placeholders
    if (this.organization) {
      const maintenanceEmail = (this.organization as any).maintenanceEmail || this.propertyLetter?.emergencyContact || '';
      const afterHoursPhone = (this.organization as any).afterHoursPhone || this.propertyLetter?.emergencyContactNumber || '';
      result = result.replace(/\{\{maintenanceEmail\}\}/g, maintenanceEmail);
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(afterHoursPhone) || '');
      if (logoDataUrl) {
        result = result.replace(/\{\{logoBase64\}\}/g, logoDataUrl);
      }
    } else if (this.propertyLetter) {
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
}
