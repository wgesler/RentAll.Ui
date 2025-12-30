import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ReservationService } from '../services/reservation.service';
import { ReservationResponse } from '../models/reservation-model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { EntityType } from '../../contact/models/contact-type';
import { CompanyService } from '../../company/services/company.service';
import { CompanyResponse } from '../../company/models/company.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { ReservationLeaseService } from '../services/reservation-lease.service';
import { ReservationLeaseRequest, ReservationLeaseResponse } from '../models/reservation-lease.model';
import { ReservationLeaseInformationService } from '../services/reservation-lease-information.service';
import { LeaseInformationResponse } from '../models/lease-information.model';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { MatDialog } from '@angular/material/dialog';
import { LeasePreviewDialogComponent, LeasePreviewData } from './lease-preview-dialog.component';
import { finalize, take, switchMap, forkJoin, of, EMPTY, catchError, Observable } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationNotice, BillingType } from '../models/reservation-enum';
import { FranchiseService } from '../../organization-configuration/franchise/services/franchise.service';
import { FranchiseResponse } from '../../organization-configuration/franchise/models/franchise.model';

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
  organization: OrganizationResponse | null = null;
  contact: ContactResponse | null = null;
  company: CompanyResponse | null = null;
  leaseInformation: LeaseInformationResponse | null = null;
  franchise: FranchiseResponse | null = null;
  organizationName: string | null = null;

  constructor(
    private reservationLeaseService: ReservationLeaseService,
    private reservationService: ReservationService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private companyService: CompanyService,
    private organizationService: OrganizationService,
    private leaseInformationService: ReservationLeaseInformationService,
    private franchiseService: FranchiseService,
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
    
    // Load reservation first, then load related data using RxJS operators
    this.reservationService.getReservationByGuid(this.reservationId).pipe(
      take(1),
      switchMap((reservation: ReservationResponse) => {
        this.reservation = reservation;
        
        if (!reservation) {
          return EMPTY;
        }

        // Load all independent data in parallel
        const property$ = reservation.propertyId 
          ? this.propertyService.getPropertyByGuid(reservation.propertyId).pipe(take(1))
          : of(null);
        
        const contact$ = reservation.contactId
          ? this.contactService.getContactByGuid(reservation.contactId).pipe(take(1))
          : of(null);
        
        const orgId = this.authService.getUser()?.organizationId;
        const organization$ = orgId
          ? this.organizationService.getOrganizationByGuid(orgId).pipe(take(1))
          : of(null);
        
        const leaseInformation$ = reservation.propertyId
          ? this.leaseInformationService.getLeaseInformationByPropertyId(reservation.propertyId).pipe(
              take(1),
              // Handle 404 errors gracefully - lease information might not exist
              catchError((err: HttpErrorResponse) => {
                if (err.status === 404) {
                  return of(null);
                }
                console.error('Error loading lease information:', err);
                return of(null);
              })
            )
          : of(null);

        return forkJoin({
          property: property$,
          contact: contact$,
          organization: organization$,
          leaseInformation: leaseInformation$
        });
      }),
      switchMap(({ property, contact, organization, leaseInformation }) => {
        this.property = property;
        this.contact = contact;
        this.organization = organization;
        this.leaseInformation = leaseInformation;

        // Load company if contact is Company type
        if (contact && contact.entityTypeId === EntityType.Company && contact.entityId) {
          return this.companyService.getCompanyByGuid(contact.entityId).pipe(
            take(1),
            switchMap((company: CompanyResponse) => {
              this.company = company;
              // Load franchise after company is loaded
              return this.loadFranchiseData();
            })
          );
        }
        // Load franchise if no company to load
        return this.loadFranchiseData();
      }),
      finalize(() => {
        this.isLoading = false;
        this.getLease();
      })
    ).subscribe({
      error: (err: HttpErrorResponse) => {
        console.error('Error loading reservation data:', err);
        this.isLoading = false;
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
        if (response && response.lease) {
          this.lease = response;
          this.form.patchValue({
            lease: response.lease
          });
        } else {
          // If no lease exists, set default template
          this.form.patchValue({
            lease: this.getDefaultLeaseTemplate()
          });
        }
      },
      error: (err) => {
        // If not found, set default template
        if (err.status === 404) {
          this.form.patchValue({
            lease: this.getDefaultLeaseTemplate()
          });
        } else {
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

  loadCompanyData(next: () => void): void {
    // Only load company if contact is a Company type
    if (!this.contact || this.contact.entityTypeId !== EntityType.Company || !this.contact.entityId) {
      next();
      return;
    }

    this.companyService.getCompanyByGuid(this.contact.entityId).pipe(take(1)).subscribe({
      next: (response: CompanyResponse) => {
        this.company = response;
        next();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading company:', err);
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

  loadFranchiseData(): Observable<null> {
    if (!this.property || !this.property.franchiseId) {
      this.franchise = null;
      return of(null);
    }

    return this.franchiseService.getFranchiseById(this.property.franchiseId).pipe(
      take(1),
      switchMap((franchise: FranchiseResponse) => {
        this.franchise = franchise;
        return of(null);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Error loading franchise:', err);
        this.franchise = null;
        return of(null);
      })
    );
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

    // Replace contact/company placeholders
    if (this.contact) {
      result = result.replace(/\{\{clientCode\}\}/g, this.contact.contactCode || '');
      
      // companyName = CompanyName (only if Contact EntityType is Company)
      const companyName = (this.contact.entityTypeId === EntityType.Company && this.company) ? this.company.name : this.contact.firstName + ' ' + this.contact.lastName;
      result = result.replace(/\{\{companyName\}\}/g, companyName);
      
      // Contact information
      result = result.replace(/\{\{contactName\}\}/g, `${this.contact.firstName || ''} ${this.contact.lastName || ''}`.trim());
      result = result.replace(/\{\{contactPhone\}\}/g, this.formatterService.phoneNumber(this.contact.phone) || '');
      result = result.replace(/\{\{contactEmail\}\}/g, this.contact.email || '');
      
      // Contact address fields
      if (this.contact.entityTypeId === EntityType.Company && this.company) {
        // Use company address if contact is a company
        result = result.replace(/\{\{contactAddress1\}\}/g, this.company.address1 || '');
        result = result.replace(/\{\{contactAddress2\}\}/g, this.company.address2 || '');
        result = result.replace(/\{\{contactCity\}\}/g, this.company.city || '');
        result = result.replace(/\{\{contactState\}\}/g, this.company.state || '');
        result = result.replace(/\{\{contactZip\}\}/g, this.company.zip || '');
      } else {
        // Use contact address
        result = result.replace(/\{\{contactAddress1\}\}/g, this.contact.address1 || '');
        result = result.replace(/\{\{contactAddress2\}\}/g, this.contact.address2 || '');
        result = result.replace(/\{\{contactCity\}\}/g, this.contact.city || '');
        result = result.replace(/\{\{contactState\}\}/g, this.contact.state || '');
        result = result.replace(/\{\{contactZip\}\}/g, this.contact.zip || '');
      }
    }

    // Replace reservation placeholders
    if (this.reservation) {
      result = result.replace(/\{\{reservationCode\}\}/g, this.reservation.reservationCode || '');
      result = result.replace(/\{\{tenantName\}\}/g, this.reservation.tenantName || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.departureDate) || '');
      result = result.replace(/\{\{numberOfPeople\}\}/g, (this.reservation.numberOfPeople || 0).toString());
      result = result.replace(/\{\{billingType\}\}/g, this.getBillingTypeText());
      result = result.replace(/\{\{billingRate\}\}/g, (this.reservation.billingRate || 0).toFixed(2));
      result = result.replace(/\{\{deposit\}\}/g, (this.reservation.deposit || 0).toFixed(2));
      result = result.replace(/\{\{depositType\}\}/g, (this.reservation.depositTypeId === 1) ? 'Flat Fee' : (this.reservation.depositTypeId === 2) ? 'Included In Rent' : ''  ); 
      result = result.replace(/\{\{reservationDate\}\}/g, this.formatterService.formatDateStringLong(new Date().toISOString()) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.reservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.reservation.checkOutTimeId) || '');
      result = result.replace(/\{\{reservationNotice\}\}/g, this.getReservationNoticeText());
      result = result.replace(/\{\{tenantPets\}\}/g, this.getPetText());
     }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
      result = result.replace(/\{\{communityAddress\}\}/g, this.getCommunityAddress() || '');
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getApartmentAddress() || '');
      result = result.replace(/\{\{propertyPhone\}\}/g, this.formatterService.phoneNumber(this.property.phone) || 'N/A');
      result = result.replace(/\{\{propertyAddress1\}\}/g, this.property.address1 || '');
      result = result.replace(/\{\{propertyCity\}\}/g, this.property.city || '');
      result = result.replace(/\{\{propertyState\}\}/g, this.property.state || '');
      result = result.replace(/\{\{propertyZip\}\}/g, this.property.zip || '');
      result = result.replace(/\{\{propertyBedrooms\}\}/g, (this.property.bedrooms || 0).toString());
      result = result.replace(/\{\{propertyBathrooms\}\}/g, (this.property.bathrooms || 0).toString());
      result = result.replace(/\{\{propertyFixedExp\}\}/g, (this.reservation?.departureFee || 0).toFixed(2));
      result = result.replace(/\{\{propertyParking\}\}/g, this.property.parkingNotes || '');
    }

    if (this.franchise) {
      result = result.replace(/\{\{franchiseDescription\}\}/g, this.franchise.description || '');
      result = result.replace(/\{\{franchisePhone\}\}/g, this.formatterService.phoneNumber(this.franchise.phone) || 'N/A');
    } 

    // Replace lease information placeholders
    if (this.leaseInformation) {
      // Process each leaseInformation field to replace nested placeholders
      result = result.replace(/\{\{rentalPayment\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.rentalPayment || ''));
      result = result.replace(/\{\{securityDeposit\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.securityDeposit || ''));
      result = result.replace(/\{\{cancellationPolicy\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.cancellationPolicy || ''));
      result = result.replace(/\{\{keyPickUpDropOff\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.keyPickUpDropOff || ''));
      result = result.replace(/\{\{partialMonth\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.partialMonth || ''));
      result = result.replace(/\{\{departureNotification\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.departureNotification || ''));
      result = result.replace(/\{\{holdover\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.holdover || ''));
      result = result.replace(/\{\{departureServiceFee\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.departureServiceFee || ''));
      result = result.replace(/\{\{checkoutProcedure\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.checkoutProcedure || ''));
      result = result.replace(/\{\{parking\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.parking || ''));
      result = result.replace(/\{\{rulesAndRegulations\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.rulesAndRegulations || ''));
      result = result.replace(/\{\{occupyingTenants\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.occupyingTenants || ''));
      result = result.replace(/\{\{utilityAllowance\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.utilityAllowance || ''));
      result = result.replace(/\{\{maidService\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.maidService || ''));
      result = result.replace(/\{\{pets\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.pets || ''));
      result = result.replace(/\{\{smoking\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.smoking || ''));
      result = result.replace(/\{\{emergencies\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.emergencies || ''));
      result = result.replace(/\{\{homeownersAssociation\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.homeownersAssociation || ''));
      result = result.replace(/\{\{indemnification\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.indemnification || ''));
      result = result.replace(/\{\{defaultClause\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.defaultClause || ''));
      result = result.replace(/\{\{attorneyCollectionFees\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.attorneyCollectionFees || ''));
      result = result.replace(/\{\{reservedRights\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.reservedRights || ''));
      result = result.replace(/\{\{propertyUse\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.propertyUse || ''));
      
      // Convert miscellaneous list items to paragraphs
      let miscellaneousText = this.leaseInformation.miscellaneous || '';
      if (miscellaneousText) {
        // First, handle HTML list items if present
        miscellaneousText = miscellaneousText.replace(/<LI[^>]*>/gi, '<P>');
        miscellaneousText = miscellaneousText.replace(/<\/LI>/gi, '</P>');
        miscellaneousText = miscellaneousText.replace(/<\/?OL[^>]*>/gi, '');
        miscellaneousText = miscellaneousText.replace(/<\/?UL[^>]*>/gi, '');
        miscellaneousText = miscellaneousText.replace(/<\/?SPAN[^>]*>/gi, '');
        
        // Handle plain text with letter prefixes (I., J., K., L., M., etc.)
        // Split on pattern: letter + period + space at start of line or after newline
        // This handles both single-line and multi-line formats
        if (!miscellaneousText.includes('<P>') && !miscellaneousText.includes('<LI>')) {
          // Only process if not already HTML formatted
          // Split on uppercase letter followed by period and space (at start or after newline)
          const items = miscellaneousText.split(/(?=[A-Z]\.\s)/);
          if (items.length > 1) {
            miscellaneousText = items
              .filter(item => item.trim().length > 0)
              .map(item => {
                const trimmed = item.trim();
                // Match the letter prefix (I., J., etc.) and the rest
                const match = trimmed.match(/^([A-Z]\.)\s+(.+)$/s);
                if (match) {
                  return `<P><strong>${match[1]}</strong> ${match[2].trim()}</P>`;
                }
                return `<P>${trimmed}</P>`;
              })
              .join('\n');
          }
        }
      }
      result = result.replace(/\{\{miscellaneous\}\}/g, this.replacePlaceholdersInText(miscellaneousText));
    }

    // Handle logo
    const logoDataUrl = this.organization?.fileDetails?.dataUrl;
    if (!logoDataUrl) {
      result = result.replace(/<img[^>]*\{\{logoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace organization placeholders
    if (this.organization) {
      result = result.replace(/\{\{organization-franchise\}\}/g, this.getOrganizationName());
      result = result.replace(/\{\{maintenanceEmail\}\}/g, this.organization.maintenanceEmail || '');
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(this.organization.phone) || '');
      result = result.replace(/\{\{organizationAddress\}\}/g, this.getOrganizationAddress());
      result = result.replace(/\{\{organizationWebsite\}\}/g, this.organization.website || '');
      if (logoDataUrl) {
        result = result.replace(/\{\{logoBase64\}\}/g, logoDataUrl);
      }
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

    getOrganizationAddress(): string {
    if (!this.organization) return '';
    const parts = [
      this.organization.address1,
      this.organization.city,
      this.organization.state,
      this.organization.zip
    ].filter(p => p);
    return parts.join(', ');
  }

  getReservationDisplay(): string {
    if (!this.reservation) return '';
    const reservationCode = this.reservation.reservationCode || 'N/A';
    const tenantName = this.reservation.tenantName || 'Unnamed Tenant';
    return `${reservationCode}: ${tenantName}`;
  }

  getReservationNoticeText(): string {
    if (!this.reservation?.reservationNoticeId) return '';
    if (this.reservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '30 Days';
    } else if (this.reservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '14 Days';
    }
    return '';
  }

  getPetText(): string {
    if (!this.reservation) return '';
    return this.reservation.hasPets ? this.reservation.numberOfPets.toString() + ' ' + this.reservation.petDescription : 'None';
  }

  getOrganizationName(): string {  
    this.organizationName = this.organization.name;
    if(this.franchise) 
      this.organizationName = this.organization.name + ' ' + this.franchise.description;
    return this.organizationName;
  }

  getBillingTypeText(): string {
    if (!this.reservation?.billingTypeId && this.reservation?.billingTypeId !== 0) return '';
    if (this.reservation.billingTypeId === BillingType.Monthly) {
      return 'Monthly';
    } else if (this.reservation.billingTypeId === BillingType.Daily) {
      return 'Daily';
    } else if (this.reservation.billingTypeId === BillingType.Nightly) {
      return 'Nightly';
    }
    return '';
  }

  /**
   * Replaces placeholders within a text string (used for leaseInformation fields that may contain nested placeholders)
   */
  replacePlaceholdersInText(text: string): string {
    if (!text) return '';
    let result = text;

    // Replace organization/franchise name
    const organizationName = this.organization?.name || '';
    result = result.replace(/\{\{organization-franchise\}\}/g, organizationName);

    // Replace reservation placeholders
    if (this.reservation) {
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.reservation.checkOutTimeId) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.reservation.checkInTimeId) || '');
      result = result.replace(/\{\{reservationNotice\}\}/g, this.getReservationNoticeText());
      result = result.replace(/\{\{billingRate\}\}/g, (this.reservation.billingRate || 0).toFixed(2));
      result = result.replace(/\{\{deposit\}\}/g, (this.reservation.deposit || 0).toFixed(2));
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.departureDate) || '');
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getApartmentAddress() || '');
    }

    // Replace contact/company placeholders
    if (this.contact) {
      const companyName = (this.contact.entityTypeId === EntityType.Company && this.company) ? this.company.name : `${this.contact.firstName || ''} ${this.contact.lastName || ''}`.trim();
      result = result.replace(/\{\{companyName\}\}/g, companyName);
      result = result.replace(/\{\{contactName\}\}/g, `${this.contact.firstName || ''} ${this.contact.lastName || ''}`.trim());
    }

    return result;
  }

    getDefaultLeaseTemplate(): string {
    // This is the default lease template with client-side placeholders
    return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><HTML><HEAD><STYLE TYPE="text/css">
     P.breakhere {page-break-before: always}
     @media print {
       @page {
         margin: 0.75in;
         size: letter;
       }
       body {
         margin: 0;
         padding: 0;
         -webkit-print-color-adjust: exact;
         print-color-adjust: exact;
         color-adjust: exact;
       }
       #header, #footer {
         -webkit-print-color-adjust: exact;
         print-color-adjust: exact;
         color-adjust: exact;
         background-color: #222 !important;
         color: #fff !important;
       }
       #header h1, #footer {
         color: #fff !important;
       }
     }
</STYLE> <TITLE>{{ClientNo}} {{companyName}} {{propertyCode}}</TITLE>
<STYLE><!--body {background-color: #eee; font-family: arial, san-serif; max-width: 8.5in; width: 8.5in; margin: 0 auto; padding: 0; box-sizing: border-box}p {font-size: 9pt; line-height: 150%}#terms p,#terms li {font-size: 8.5pt; margin-top: 0; max-width: 100% !important; word-wrap: break-word; overflow-wrap: break-word; box-sizing: border-box}
#terms {max-width: 100% !important; width: 100% !important; box-sizing: border-box}
#container {max-width: 100% !important; width: 100% !important; box-sizing: border-box; border: none; padding: 3px; background-color: #fff}#header {max-width: 100% !important; width: 100% !important; background-color: #222}
#header img {width: 100% !important; max-width: 100% !important; display: block; height: auto}#terms h2 {font-size: 9pt; font-weight: 600; color: #000; margin-top: 15px !important; margin-bottom: 2px !important; padding: 0}h1 {font-size: 15pt; font-weight: 600; text-align: center; color: #fff; margin: 0; padding: 5px}h2 {font-size: 9pt; font-weight: 600; color: #000; margin-top: 15px !important; margin-bottom: 2px !important; padding: 0}.border {border: none; padding: 10px}.border p {margin: 0}.grayline {color: #ccc}.smgraytext {font-size: 8.5pt; color: #999}#footer {max-width: 100% !important; width: 100% !important; background-color: #222; font-size: 6pt; color: #fff; padding: 10px}--></STYLE>
<META name=GENERATOR content="MSHTML 8.00.7600.16766"></HEAD>
<BODY>
<TABLE id=header cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>
<img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg" align="center">
<TR vAlign=top>
<TD>
<H1>Month to Month Rental Agreement</H1></TD></TR></TBODY></TABLE>
<TABLE id=container cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>

<TR vAlign=top>
<TD width="50%" style="vertical-align: top; padding: 5px;">
<DIV style="MARGIN-RIGHT: 5px; min-height: 300px; display: flex; flex-direction: column;" class=border>
<H2>Tenant Information</H2>
<P><SPAN style="FONT-WEIGHT: bold">Reservation #:</SPAN> {{reservationCode}}<BR><SPAN style="FONT-WEIGHT: bold">Name(s):</SPAN> {{companyName}}<BR><SPAN style="FONT-WEIGHT: bold">Address:</SPAN> {{contactAddress1}} {{contactAddress2}}, {{contactCity}}, {{contactState}} {{contactZip}}<BR><SPAN style="FONT-WEIGHT: bold">Phone:</SPAN> {{contactPhone}}<BR><SPAN style="FONT-WEIGHT: bold">Email:</SPAN> {{contactEmail}}<BR><SPAN style="FONT-WEIGHT: bold">Occupant: {{contactName}} </SPAN> <BR><SPAN style="FONT-WEIGHT: bold">Occupant #:</SPAN> {{numberOfPeople}}<BR><SPAN style="FONT-WEIGHT: bold"></SPAN></P></DIV></TD>
<TD width="50%" style="vertical-align: top; padding: 5px;">
<DIV style="MARGIN-LEFT: 5px; min-height: 300px; display: flex; flex-direction: column;" class=border>
<H2>Rental information</H2>
<P><SPAN style="FONT-WEIGHT: bold">Arrival Date:</SPAN> {{arrivalDate}}<BR><SPAN style="FONT-WEIGHT: bold">Departure Date:</SPAN> {{departureDate}} ({{reservationNotice}} written notice is required)<BR><SPAN style="FONT-WEIGHT: bold">Check-in Time:</SPAN> 4:00PM<BR><SPAN style="FONT-WEIGHT: bold">Check-out Time:</SPAN> 11:00AM<BR><SPAN style="FONT-WEIGHT: bold">Extensions Possible:</SPAN> No <BR> <SPAN style="FONT-WEIGHT: bold">Deposit:</SPAN> Corporate Letter of Responsibility <SPAN style="FONT-STYLE: italic">(Required to reserve unit)</SPAN> <BR><SPAN style="FONT-WEIGHT: bold">Monthly Rate:</SPAN> ${'$'}{{billingRate}} <SPAN style="FONT-STYLE: italic">(1st month's rent payable in advance)</SPAN> <BR><SPAN style="FONT-WEIGHT: bold">Departure Fee:</SPAN> ${'$'}{{propertyFixedExp}} <SPAN style="FONT-STYLE: italic">(Payable upon move-in)</SPAN><BR><SPAN style="FONT-WEIGHT: bold">Pets:</SPAN> {{tenantPets}} </P></DIV></TD></TR>
<TR vAlign=top>
<TD colSpan=2 style="padding: 5px;">
<H2 style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border>Property Information</H2>
<DIV style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border><SPAN style="FONT-WEIGHT: bold">Property Address:</SPAN> {{propertyAddress1}}, {{propertyCity}}, {{propertyState}} {{propertyZip}}</DIV>
<DIV style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border><SPAN style="FONT-WEIGHT: bold">Property Phone:</SPAN> {{propertyPhone}}</DIV>
<DIV style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border><SPAN style="FONT-WEIGHT: bold">Parking:</SPAN> {{propertyParking}} </DIV>
<DIV style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border><SPAN style="FONT-WEIGHT: bold">Unit Size:</SPAN> {{propertyBedrooms}} Bedroom(s)/{{propertyBathrooms}} Bathroom(s)</DIV></TD></TR></TABLE>
<br>
<TR vAlign=top>
<TD id=terms colSpan=2>
<H2>Rental Payments</H2>
<P>{{rentalPayment}}</P>
<H2>Security Deposit/Credit Card Authorizations</H2>
<P>{{securityDeposit}}</P>
<H2>Cancellation Policy</H2>
<P>{{cancellationPolicy}}</P>
<H2>Key Pick-up and drop-off</H2>
<P>{{keyPickUpDropOff}}</P>
<H2>Partial Month Calculation</H2>
<P>{{partialMonth}}</P>
<H2>Departure Notification/Extensions</H2>
<P>{{departureNotification}}</P>
<H2>Holdover</H2>
<P>{{holdover}}</P>
<H2>Departure Service Fee</H2>
<P>{{departureServiceFee}}</P>
<H2>Checkout Procedure</H2>
<P>{{checkoutProcedure}}</P>
<H2>Parking</H2>
<P>{{parking}}</P>
<H2>Rules & Regulations</H2>
<P>{{rulesAndRegulations}}</P>
<H2>Occupying Tenants</H2>
<P>{{occupyingTenants}}</P>
<H2>Utility Allowance</H2>
<P>{{utilityAllowance}}</P>
<H2>Maid Service</H2>
<P>{{maidService}}</P>

<H2>Pets</H2>
<P>{{pets}}</P>
<H2>Smoking in unit</H2>
<P>{{smoking}}</P>
<H2>Emergencies</H2>
<P>{{emergencies}}</P>
<H2>Homeowner's Association</H2>
<P>{{homeownersAssociation}}</P>
<H2>Indemnification</H2>
<P>{{indemnification}}</P>
<H2>Default</H2>
<P>{{defaultClause}}</P>
<H2>Attorneys'/Collection Fees</H2>
<P>{{attorneyCollectionFees}}</P>
<H2>Reserved Rights</H2>
<P>{{reservedRights}}</P>
<H2>Use</H2>
<P>{{propertyUse}}</P>
<H2>Miscellaneous</H2>
{{miscellaneous}}<BR><BR>
<TABLE cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>
<TR vAlign=top>
<TD style="PADDING-RIGHT: 10px" width="60%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Tenant Signature</SPAN> 
<P><BR></P>
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">{{organization-franchise}}</SPAN></TD>
<TD style="PADDING-LEFT: 10px" width="40%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Date</SPAN> 
<P><BR></P>
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Date</SPAN> </TD></TR></TBODY></TABLE>
<P><BR></P>
<P>
<TABLE id=footer cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>
<TR vAlign=top>
<TD align="center"><SPAN style="FONT-WEIGHT: bold">{{organization-franchise}}</SPAN><BR>{{organizationAddress}}<BR><SPAN>P:</SPAN> {{organizationPhone}}<SPAN>F:</SPAN> {{franchisePhone}} <A style="COLOR: rgb(255,255,255)" href="http://{{organizationWebsite}}">{{organizationWebsite}}</A></TD></TR></TBODY></TABLE><BR></BODY></HTML>
<P CLASS="breakhere"></P>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
<title>Corporate Letter of Responsibility</title>
<style>
body {background-color: #eee; font-family: arial, san-serif}
p {font-size: 8pt; line-height: 150%}
#container {border: 2px solid #ddd; padding: 10px; background-color: #fff}
#header {background-color: #222}
h1 {font-size: 9pt; font-weight: 600; text-align: center; color: #fff; margin: 0; padding: 5px}
.border {border: 1px solid #ddd; padding: 10px}
.border p {margin: 0}
.grayline {color: #ccc}
.smgraytext {font-size: 8pt; color: #999}
#footer {background-color: #222; font-size: 6pt; color: #fff; padding: 10px}
</style>
</head>
<body>
<table width="648" cellpadding="0" cellspacing="0" id="header" align="center"><img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg"" align="center">
<tr valign="top"><td>
<h1>Corporate Letter of Responsibility</h1>
</td></tr></table>
<table width="650" cellpadding="0" cellspacing="0" id="container" align="center"><tr valign="top"><td><div class="border">
<p><STRONG>Date: </STRONG>{{reservationDate}} <br/>
<STRONG>To: </STRONG>AvenueWest Denver  <br/>
<STRONG>From: </STRONG>{{companyName}}</p>
</DIV>
<div class="border">
<p>
{{companyName}} will be responsible for the payment of rent, departure fee and additional fees incurred in connection to reservation number <b>#{{reservationCode}}</b>. This agreement shall remain in effect for the duration of our occupancy. In addition, we will be responsible for the payment, if applicable, of excessive cleaning or damage above wear in connection to the rental property listed below.</p>
</div>
<div class="border">
<table width="100%" cellpadding="0" cellspacing="0"><tr valign="top"><td width="35%">
<p>
<STRONG>Complex:</STRONG><br/>
<STRONG>Unit Address:</STRONG><br/>
<STRONG>Reservation Number:</STRONG><br/>
<STRONG>Arrival Date:</STRONG><br/>
<STRONG>Departure Date:</STRONG><br/>
<STRONG>Monthly Rent:</STRONG><br/>
<STRONG>Deposit:</STRONG><br/>
<STRONG>Departure Fees:</STRONG><br/>
<STRONG>Name of Occupant(s):</STRONG>
</td><td><p>
{{propertyCode}}<br/>
{{apartmentAddress}},{{propertyCity}},{{propertyState}}{{propertyZip}}<br/>
{{reservationCode}}<br/>
{{arrivalDate}}<br/>
{{departureDate}}<br/>
${'$'}{{billingRate}}<br/>
${'$'}{{deposit}}<br/>
${'$'}{{propertyFixedExp}}<br/>
{{contactName}}<br/>

</p></td></tr></table>
</div>

<div class="border">
<p><STRONG>{{companyName}} </STRONG>will be named as the responsible party on the rental of the above listed property, and will make all rental payments.  Upon lease execution Tenant will be invoiced the 1st month's rent.  Each subsequent monthly rent will be invoiced in advance and is due on the 1st of each month and is late on the 5th of each month.</p>
<p><b>{{companyName}}</b> will be responsible for the payment of additional phone or cable fees billed to the unit and for utility usage above the following amounts:<p>
<p><table width="100%" cellpadding="0" cellspacing="0" class="border"><tr valign="top"><td width="34%">
<input type="checkbox"> $100 (studios/1 bdrm)<br/>
<input type="checkbox"> $175 (4 bdrm)
</td><td width="33%">
<input type="checkbox"> $125 (2 bdrm)<br/>
<input type="checkbox"> $250 (House)
</td><td>
<input type="checkbox"> $150 (3 bdrm)
</td></tr></tr></table></p>
<p><b>{{companyName}}</b> will accept responsibility for any undue damage beyond normal wear and tear.</p>
</div>
<div class="border">
<p style="FONT-SIZE: 8.5pt"><STRONG>Agreed to and Accepted:</STRONG></p>
<table width="100%" cellpadding="0" cellspacing="0" align="center"><tr valign="top"><td width="50%" style="padding-right: 10px" align="center">
<STRONG>{{companyName}}</STRONG><br/>
<i class="smgraytext">(Company)</i>                                                                  <p><br/><hr noshade class="grayline" />
<i class="smgraytext">Signature</i></p>                                                                 

<table width="50%" cellpadding="0" cellspacing="0" align="center"><tr valign="top"><td width="50%" align="center">
<hr noshade class="grayline" />
<i class="smgraytext">Title</i>
</td><td style="padding-left: 10px" align="center">
<hr noshade class="grayline" />
<i class="smgraytext">Date</i>
</td></tr></table>
<br/>
</td><td width="50%" style="padding-left: 5px" align="center">
<STRONG>AvenueWest Denver</STRONG><br/>
<i class="smgraytext">(Property Manager)</i>                                                                  <p><br/><hr noshade class="grayline" />
<i class="smgraytext">Signature</i></p>                                                                 
<table width="100%" cellpadding="0" cellspacing="0" align="center"><tr valign="top"><td width="60%" align="center">
<hr noshade class="grayline" />
<i class="smgraytext">Title</i>
</td><td style="padding-left: 10px" align="center">
<hr noshade class="grayline" />
<i class="smgraytext">Date</i>
</td></tr></table>
</td></tr></table>
</div>
</td></tr></table>
<table width="648" cellpadding="0" cellspacing="0" id="footer" align="center"><tr valign="top"><td align="center">
<TD align="center"><SPAN style="FONT-WEIGHT: bold">AvenueWest Denver</SPAN><BR>1045 Santa Fe Dr, Denver, CO 80204<BR><SPAN>P:</SPAN> 303-825-0000 <SPAN>F:</SPAN> 303-825-7624 </SPAN><A style="COLOR: rgb(255,255,255)" href="http://www.Denver.AvenueWest.com">www.Denver.AvenueWest.com</A></TD></TR></TBODY></TABLE><BR></BODY><P CLASS="breakhere"></P></HTML>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><HTML><HEAD><TITLE>{{reservationNotice}} Notice of Intent to Vacate</TITLE>
<STYLE><!--body {background-color: #eee; font-family: arial, san-serif}p {font-size: 9pt; line-height: 150%; margin-bottom: 12px}#container {border: 2px solid #ddd; padding: 10px; background-color: #fff}#header {background-color: #222}h1 {font-size: 11pt; font-weight: 600; text-align: center; color: #fff; margin: 0; padding: 5px}.border {border: 1px solid #ddd; padding: 10px}.border p {margin: 0; margin-bottom: 12px}.grayline {color: #ccc}.smgraytext {font-size: 9pt; color: #999}#footer {background-color: #222; font-size: 9pt; color: #fff; padding: 10px}--></STYLE>

<META name=GENERATOR content="MSHTML 8.00.6001.19019"></HEAD>
<BODY>
<TABLE id=header cellSpacing=0 cellPadding=0 width=648 align=center>
<TBODY>
<img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg" align="center">
<TR vAlign=top>
<TD>
<H1>{{reservationNotice}} Notice of Intent to Vacate</H1></TD></TR></TBODY></TABLE>
<TABLE id=container cellSpacing=0 cellPadding=0 width=650 align=center>
<TBODY>
<TR vAlign=top>
<TD width="50%">
<DIV style="MARGIN-RIGHT: 5px" class=border>
<P><SPAN style="FONT-WEIGHT: bold">To: </SPAN>AvenueWest Denver<BR>

<SPAN style="FONT-WEIGHT: bold">Property Address:</Span> {{propertyAddress1}}
<TD width="50%">
<DIV style="MARGIN-LEFT: 5px" class=border>
<P><SPAN style="FONT-WEIGHT: bold">From:</Span> {{companyName}}<BR><SPAN style="FONT-WEIGHT: bold">Reservation #:</Span> {{reservationCode}}</P></DIV></TD></TR>
<TR vAlign=top>
<TD colSpan=2>
<DIV style="MARGIN-TOP: 10px; MARGIN-BOTTOM: 10px" class=border>
<P><SPAN style="FONT-WEIGHT: bold">Today's Date:</SPAN> <SPAN class=grayline>__________________</SPAN><BR></P></DIV></TD></TR>
<TR vAlign=top>
<TD colSpan=2>
<div class="border">
<P>In accordance with the terms of our lease agreement, I am hereby giving {{reservationNotice}} written notice of termination of our lease on the above mentioned property. </P>
<P><SPAN style="FONT-WEIGHT: bold">My departure date will be:</SPAN> <SPAN class=grayline>________________________</SPAN></P>
<P>I understand that check-out is at {{checkOutTime}} on my departure date.  The date given above is a definite date to vacate, and no change in the move-out date will be made without written approval of {{organization-franchise}}.</P>
<P><SPAN style="FONT-WEIGHT: bold">Forwarding address:</SPAN> <SPAN style="FONT-STYLE: italic"> (Needed for deposit refund)</SPAN></P>
<HR class=grayline noShade>
<BR>
<HR class=grayline noShade>
<BR>
<HR class=grayline noShade>

<P><SPAN style="FONT-WEIGHT: bold">Rent due through end of notice $:</SPAN> <SPAN class=grayline>________________________</SPAN></P>
</div>
<BR><BR>
<TABLE cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>
<TR vAlign=top>
<TD style="PADDING-RIGHT: 10px" width="60%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Signature </SPAN></TD>
<TD style="PADDING-LEFT: 10px" width="40%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Date</SPAN></TD></TR></TBODY></TABLE><BR><BR>
<div class="border">
<P><SPAN style="FONT-WEIGHT: bold">Acknowledged by {{organization-franchise}}:</SPAN></P><BR>
<TABLE cellSpacing=0 cellPadding=0 width="100%" align=center>
<TBODY>
<TR vAlign=top>
<TD style="PADDING-RIGHT: 10px" width="60%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Signature </SPAN></TD>
<TD style="PADDING-LEFT: 10px" width="40%" align="center">
<HR class=grayline noShade>
<SPAN style="FONT-STYLE: italic">Date</SPAN></TD></TR></TBODY></TABLE>
</div></TD></TR></TBODY></TABLE>
<TABLE id=footer cellSpacing=0 cellPadding=0 width=648 align=center>
<TBODY>
<TR vAlign=top>
<TD align="center"><SPAN style="FONT-WEIGHT: bold">{{organization-franchise}}</SPAN><BR>1045 Santa Fe Dr, Denver, CO 80204<BR><SPAN>P:</SPAN> 303-825-0000 <SPAN>F:</SPAN> 303-825-7624 </SPAN><A style="COLOR: rgb(255,255,255)" href="http://www.Denver.AvenueWest.com">www.Denver.AvenueWest.com</A></TD></TR></TBODY></TABLE><BR></BODY></HTML>`;
  }
}
