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
import { ReservationNotice, BillingType, DepositType } from '../models/reservation-enum';
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

    this.reservationLeaseService.getLeaseByReservationId(this.reservationId).pipe(take(1),finalize(() => { this.isLoading = false })).subscribe({
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

  buildForm(): FormGroup {
    return this.fb.group({
      lease: new FormControl('')
    });
  }


  // Data Loading Helpers
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


  // Field Replacement Helpers
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

  getWebsiteWithProtocol(): string {
    if (!this.organization?.website) return '';
    const website = this.organization.website;
    if (website.startsWith('http://') || website.startsWith('https://')) {
      return website;
    }
    return `http://${website}`;
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

  getExtensionsPossible(): string {
    if (!this.reservation) return 'No';
    return this.reservation.allowExtensions ? 'Yes' : 'No';
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

  getResponsibleParty(): string {
    return (this.contact.entityTypeId === EntityType.Company && this.company) 
      ?  this.company.name 
      : `${this.contact.firstName || ''} ${this.contact.lastName || ''}`.trim();
  }

  getDepositRequirementText(): string {
    if (!this.reservation) return '';
    if (this.reservation.depositTypeId === DepositType.FlatFee) 
      return `See Below`;
    else
      return `Corporate Letter of Responsibility`;
  }

  getDefaultUtilityFeeText(): string {
    if(!this.property || !this.organization) return '';

    const bedrooms = this.property.bedrooms;
    let utilityFee: number | undefined;

    switch(bedrooms) {
      case 1:
        utilityFee = this.organization.utilityOneBed;
        break;
      case 2:
        utilityFee = this.organization.utilityTwoBed;
        break;
      case 3:
        utilityFee = this.organization.utilityThreeBed;
        break;
      case 4:
        utilityFee = this.organization.utilityFourBed;
        break;
      default:
        // For 5+ bedrooms or house, use utilityHouse
        utilityFee = this.organization.utilityHouse;
        break;
    }

    if (utilityFee !== null && utilityFee !== undefined) {
      return utilityFee.toFixed(2);
    }
    return '';
  }

  getDefaultMaidServiceFeeText(): string {
    if(!this.property || !this.organization) return '';

    const bedrooms = this.property.bedrooms;
    let maidFee: number | undefined;

    switch(bedrooms) {
      case 1:
        maidFee = this.organization.maidOneBed;
        break;
      case 2:
        maidFee = this.organization.maidTwoBed;
        break;
      case 3:
        maidFee = this.organization.maidThreeBed;
        break;
      case 4:
        maidFee = this.organization.maidFourBed;
        break;
      default:
        // For 5+ bedrooms, use maidFourBed as fallback
        maidFee = this.organization.maidFourBed;
        break;
    }

    if (maidFee !== null && maidFee !== undefined) {
      return maidFee.toFixed(2);
    }
    return '';
  }

  // Placeholder Replacement Logic
  replacePlaceholders(html: string): string {
    let result = html;

    // Replace contact/company placeholders
    if (this.contact) {
      result = result.replace(/\{\{clientCode\}\}/g, this.contact.contactCode || '');
      result = result.replace(/\{\{responsibleParty\}\}/g, this.getResponsibleParty());

      // Contact information (could be company or individual)
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
      result = result.replace(/\{\{depositText\}\}/g, this.getDepositRequirementText());
      result = result.replace(/\{\{reservationDate\}\}/g, this.formatterService.formatDateStringLong(new Date().toISOString()) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.reservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.reservation.checkOutTimeId) || '');
      result = result.replace(/\{\{reservationNotice\}\}/g, this.getReservationNoticeText());
      result = result.replace(/\{\{departureFee\}\}/g, (this.reservation.departureFee || 0).toFixed(2));
      result = result.replace(/\{\{tenantPets\}\}/g, this.getPetText());
      result = result.replace(/\{\{extensionsPossible\}\}/g, this.getExtensionsPossible());
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
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(this.organization.afterHoursPhone) || '');
      result = result.replace(/\{\{organizationPhone\}\}/g, this.formatterService.phoneNumber(this.organization.phone) || '');
      result = result.replace(/\{\{organizationAddress\}\}/g, this.getOrganizationAddress());
      result = result.replace(/\{\{organizationWebsite\}\}/g, this.organization.website || '');
      result = result.replace(/\{\{organizationHref\}\}/g, this.getWebsiteWithProtocol());
      result = result.replace(/\{\{utilityPenaltyFee\}\}/g, this.getDefaultUtilityFeeText());
      result = result.replace(/\{\{maidServicePenaltyFee\}\}/g, this.getDefaultMaidServiceFeeText());
      if (logoDataUrl) {
        result = result.replace(/\{\{logoBase64\}\}/g, logoDataUrl);
      }
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

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
      result = result.replace(/\{\{billingType\}\}/g,  this.getBillingTypeText());
      result = result.replace(/\{\{billingRate\}\}/g, (this.reservation.billingRate || 0).toFixed(2));
      result = result.replace(/\{\{deposit\}\}/g, (this.reservation.deposit || 0).toFixed(2));
      result = result.replace(/\{\{departureFee\}\}/g, (this.reservation.departureFee || 0).toFixed(2));
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.reservation.departureDate) || '');
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getApartmentAddress() || '');
    }

    return result;
  }

  getDefaultLeaseTemplate(): string {
    // This is the default lease template with client-side placeholders
    return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
  <title>{{ClientNo}} {{companyName}} {{propertyCode}}</title>

  <meta name="GENERATOR" content="MSHTML 8.00.7600.16766">

  <style type="text/css">
    P.breakhere {
      page-break-before: always;
    }

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
  </style>

  <style>
    body {
      background-color: #eee;
      font-family: arial, san-serif;
      max-width: 8.5in;
      width: 8.5in;
      margin: 0 auto;
      padding: 0;
      box-sizing: border-box;
    }

    p {
      font-size: 9pt;
      line-height: 150%;
    }

    #terms p, #terms li {
      font-size: 8.5pt;
      margin-top: 0;
      max-width: 100% !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }

    #terms {
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box;
    }

    #container {
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box;
      border: none;
      padding: 3px;
      background-color: #fff;
    }

    #header {
      max-width: 100% !important;
      width: 100% !important;
      background-color: #222;
    }

    #header img {
      width: 100% !important;
      max-width: 100% !important;
      display: block;
      height: auto;
    }

    #terms h2 {
      font-size: 9pt;
      font-weight: 600;
      color: #000;
      margin-top: 15px !important;
      margin-bottom: 2px !important;
      padding: 0;
    }

    h1 {
      font-size: 15pt;
      font-weight: 600;
      text-align: center;
      color: #fff;
      margin: 0;
      padding: 5px;
    }

    h2 {
      font-size: 9pt;
      font-weight: 600;
      color: #000;
      margin-top: 15px !important;
      margin-bottom: 2px !important;
      padding: 0;
    }

    .border {
      border: none;
      padding: 10px;
    }

    .border p {
      margin: 0;
    }

    .grayline {
      color: #ccc;
    }

    .smgraytext {
      font-size: 8.5pt;
      color: #999;
    }

    #footer {
      max-width: 100% !important;
      width: 100% !important;
      background-color: #222;
      font-size: 6pt;
      color: #fff;
      padding: 10px;
    }
  </style>
</head>

<body>
  <!-- ===================== HEADER ===================== -->
  <table id="header" cellspacing="0" cellpadding="0" width="100%" align="center">
    <tbody>
      <img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg" align="center">
      <tr valign="top">
        <td>
          <h1>Month to Month Rental Agreement</h1>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ===================== MAIN CONTENT ===================== -->
  <table id="container" cellspacing="0" cellpadding="0" width="100%" align="center">
    <tbody>
      <tr valign="top">
        <td width="50%" style="vertical-align: top; padding: 5px;">
          <div style="margin-right: 5px; min-height: 300px; display: flex; flex-direction: column;" class="border">
            <h2>Tenant Information</h2>
            <p>
              <span style="font-weight: bold">Reservation #:</span> {{reservationCode}}<br>
              <span style="font-weight: bold">Name(s):</span> {{responsibleParty}}<br>
              <span style="font-weight: bold">Address:</span> {{contactAddress1}} {{contactAddress2}}, {{contactCity}}, {{contactState}} {{contactZip}}<br>
              <span style="font-weight: bold">Phone:</span> {{contactPhone}}<br>
              <span style="font-weight: bold">Email:</span> {{contactEmail}}<br>
              <span style="font-weight: bold">Occupant: {{contactName}}</span><br>
              <span style="font-weight: bold">Occupant #:</span> {{numberOfPeople}}<br>
            </p>
          </div>
        </td>

        <td width="50%" style="vertical-align: top; padding: 5px;">
          <div style="margin-left: 5px; min-height: 300px; display: flex; flex-direction: column;" class="border">
            <h2>Rental information</h2>
            <p>
              <span style="font-weight: bold">Arrival Date:</span> {{arrivalDate}}<br>
              <span style="font-weight: bold">Departure Date:</span> {{departureDate}} ({{reservationNotice}} written notice is required)<br>
              <span style="font-weight: bold">Check-in Time:</span> {{checkInTime}}<br>
              <span style="font-weight: bold">Check-out Time:</span> {{checkOutTime}}<br>
              <span style="font-weight: bold">Extensions Possible:</span> {{extensionsPossible}}<br>
              <span style="font-weight: bold">Deposit:</span> {{depositText}} <span style="font-style: italic">(Required to reserve unit)</span><br>
              <span style="font-weight: bold">{{billingType}} Rate:</span> \${{billingRate}} <span style="font-style: italic">(1st month's rent payable in advance)</span><br>
              <span style="font-weight: bold">Departure Fee:</span> \${{departureFee}} <span style="font-style: italic">(Payable upon move-in)</span><br>
              <span style="font-weight: bold">Pets:</span> {{tenantPets}}
            </p>
          </div>
        </td>
      </tr>

      <tr valign="top">
        <td colspan="2" style="padding: 5px;">
          <h2 style="margin-top: 10px; margin-bottom: 10px" class="border">Property Information</h2>
          <div style="margin-top: 10px; margin-bottom: 10px" class="border">
            <span style="font-weight: bold">Property Address:</span> {{apartmentAddress}}
          </div>
          <div style="margin-top: 10px; margin-bottom: 10px" class="border">
            <span style="font-weight: bold">Property Phone:</span> {{propertyPhone}}
          </div>
          <div style="margin-top: 10px; margin-bottom: 10px" class="border">
            <span style="font-weight: bold">Parking:</span> {{propertyParking}}
          </div>
          <div style="margin-top: 10px; margin-bottom: 10px" class="border">
            <span style="font-weight: bold">Unit Size:</span> {{propertyBedrooms}} Bedroom(s)/{{propertyBathrooms}} Bathroom(s)
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <br>

  <!-- ===================== TERMS ===================== -->
  <tr valign="top">
    <td id="terms" colspan="2">
      <h2>Rental Payments</h2>
      <p>{{rentalPayment}}</p>

      <h2>Security Deposit/Credit Card Authorizations</h2>
      <p>{{securityDeposit}}</p>

      <h2>Cancellation Policy</h2>
      <p>{{cancellationPolicy}}</p>

      <h2>Key Pick-up and drop-off</h2>
      <p>{{keyPickUpDropOff}}</p>

      <h2>Partial Month Calculation</h2>
      <p>{{partialMonth}}</p>

      <h2>Departure Notification/Extensions</h2>
      <p>{{departureNotification}}</p>

      <h2>Holdover</h2>
      <p>{{holdover}}</p>

      <h2>Departure Service Fee</h2>
      <p>{{departureServiceFee}}</p>

      <h2>Checkout Procedure</h2>
      <p>{{checkoutProcedure}}</p>

      <h2>Parking</h2>
      <p>{{parking}}</p>

      <h2>Rules & Regulations</h2>
      <p>{{rulesAndRegulations}}</p>

      <h2>Occupying Tenants</h2>
      <p>{{occupyingTenants}}</p>

      <h2>Utility Allowance</h2>
      <p>{{utilityAllowance}}</p>

      <h2>Maid Service</h2>
      <p>{{maidService}}</p>

      <h2>Pets</h2>
      <p>{{pets}}</p>

      <h2>Smoking in unit</h2>
      <p>{{smoking}}</p>

      <h2>Emergencies</h2>
      <p>{{emergencies}}</p>

      <h2>Homeowner's Association</h2>
      <p>{{homeownersAssociation}}</p>

      <h2>Indemnification</h2>
      <p>{{indemnification}}</p>

      <h2>Default</h2>
      <p>{{defaultClause}}</p>

      <h2>Attorneys'/Collection Fees</h2>
      <p>{{attorneyCollectionFees}}</p>

      <h2>Reserved Rights</h2>
      <p>{{reservedRights}}</p>

      <h2>Use</h2>
      <p>{{propertyUse}}</p>

      <h2>Miscellaneous</h2>
      {{miscellaneous}}<br><br>

      <table cellspacing="0" cellpadding="0" width="100%" align="center">
        <tbody>
          <tr valign="top">
            <td style="padding-right: 10px" width="60%" align="center">
              <hr class="grayline" noshade>
              <span style="font-style: italic">Tenant Signature</span>
              <p><br></p>
              <hr class="grayline" noshade>
              <span style="font-style: italic">{{organization-franchise}}</span>
            </td>
            <td style="padding-left: 10px" width="40%" align="center">
              <hr class="grayline" noshade>
              <span style="font-style: italic">Date</span>
              <p><br></p>
              <hr class="grayline" noshade>
              <span style="font-style: italic">Date</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p><br></p>
      <p>
        <table id="footer" cellspacing="0" cellpadding="0" width="100%" align="center">
          <tbody>
            <tr valign="top">
              <td align="center">
                <span style="font-weight: bold">{{organization-franchise}}</span><br>
                {{organizationAddress}}<br>
                <span>P:</span> {{organizationPhone}} <span>F:</span> {{franchisePhone}}
                <a style="color: rgb(255,255,255)" href="http://{{organizationWebsite}}">{{organizationWebsite}}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </p>
    </td>
  </tr>

  <p class="breakhere"></p>

  <!-- ===================== CORPORATE LETTER OF RESPONSIBILITY ===================== -->
  <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
  <html>
  <head>
    <title>Corporate Letter of Responsibility</title>
    <style>
      body {
        background-color: #eee;
        font-family: arial, san-serif;
      }

      p {
        font-size: 8pt;
        line-height: 150%;
      }

      #container {
        border: 2px solid #ddd;
        padding: 10px;
        background-color: #fff;
      }

      #header {
        background-color: #222;
      }

      h1 {
        font-size: 9pt;
        font-weight: 600;
        text-align: center;
        color: #fff;
        margin: 0;
        padding: 5px;
      }

      .border {
        border: 1px solid #ddd;
        padding: 10px;
      }

      .border p {
        margin: 0;
      }

      .grayline {
        color: #ccc;
      }

      .smgraytext {
        font-size: 8pt;
        color: #999;
      }

      #footer {
        background-color: #222;
        font-size: 6pt;
        color: #fff;
        padding: 10px;
      }
    </style>
  </head>

  <body>
    <table width="648" cellpadding="0" cellspacing="0" id="header" align="center">
      <img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg" align="center">
      <tr valign="top">
        <td>
          <h1>Corporate Letter of Responsibility</h1>
        </td>
      </tr>
    </table>

    <table width="650" cellpadding="0" cellspacing="0" id="container" align="center">
      <tr valign="top">
        <td>
          <div class="border">
            <p>
              <strong>Date: </strong>{{reservationDate}}<br>
              <strong>To: </strong>{{organization-franchise}}<br>
              <strong>From: </strong>{{responsibleParty}}<br>
            </p>
          </div>

          <div class="border">
            <p>
              {{responsibleParty}} will be responsible for the payment of rent, departure fee and additional fees incurred in connection to reservation number <b>#{{reservationCode}}</b>. This agreement shall remain in effect for the duration of our occupancy. In addition, we will be responsible for the payment, if applicable, of excessive cleaning or damage above wear in connection to the rental property listed below.
            </p>
          </div>

          <div class="border">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr valign="top">
                <td width="35%">
                  <p>
                    <strong>Complex:</strong><br>
                    <strong>Unit Address:</strong><br>
                    <strong>Reservation Number:</strong><br>
                    <strong>Arrival Date:</strong><br>
                    <strong>Departure Date:</strong><br>
                    <strong>{{billingType}} Rent:</strong><br>
                    <strong>Deposit:</strong><br>
                    <strong>Departure Fees:</strong><br>
                    <strong>Name of Occupant(s):</strong>
                  </p>
                </td>
                <td>
                  <p>
                    {{propertyCode}}<br>
                    {{apartmentAddress}}<br>
                    {{reservationCode}}<br>
                    {{arrivalDate}}<br>
                    {{departureDate}}<br>
                    \${{billingRate}}<br>
                    \${{deposit}}<br>
                    \${{departureFee}}<br>
                    {{tenantName}}<br>
                  </p>
                </td>
              </tr>
            </table>
          </div>

          <div class="border">
            <p>
              <strong>{{responsibleParty}}</strong> will be named as the responsible party on the rental of the above listed property, and will make all rental payments. Upon lease execution Tenant will be invoiced the 1st month's rent. Each subsequent monthly rent will be invoiced in advance and is due on the 1st of each month and is late on the 5th of each month.
            </p>
            <p>
              <b>{{responsibleParty}}</b> will be responsible for the payment of additional phone or cable fees billed to the unit and for utility usage above the following amount: {{utilityPenaltyFee}}
            </p>
            <p>
              <b>{{responsibleParty}}</b> will accept responsibility for any undue damage beyond normal wear and tear.
            </p>
          </div>

          <div class="border">
            <p style="font-size: 8.5pt">
              <strong>Agreed to and Accepted:</strong>
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" align="center">
              <tr valign="top">
                <td width="50%" style="padding-right: 10px" align="center">
                  <strong>{{responsibleParty}}</strong><br>
                  <i class="smgraytext">(Company)</i>
                  <p><br>
                    <hr noshade class="grayline">
                    <i class="smgraytext">Signature</i>
                  </p>

                  <table width="50%" cellpadding="0" cellspacing="0" align="center">
                    <tr valign="top">
                      <td width="50%" align="center">
                        <hr noshade class="grayline">
                        <i class="smgraytext">Title</i>
                      </td>
                      <td style="padding-left: 10px" align="center">
                        <hr noshade class="grayline">
                        <i class="smgraytext">Date</i>
                      </td>
                    </tr>
                  </table>
                  <br>
                </td>
                <td width="50%" style="padding-left: 5px" align="center">
                  <strong>{{organization-franchise}}</strong><br>
                  <i class="smgraytext">(Property Manager)</i>
                  <p><br>
                    <hr noshade class="grayline">
                    <i class="smgraytext">Signature</i>
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" align="center">
                    <tr valign="top">
                      <td width="60%" align="center">
                        <hr noshade class="grayline">
                        <i class="smgraytext">Title</i>
                      </td>
                      <td style="padding-left: 10px" align="center">
                        <hr noshade class="grayline">
                        <i class="smgraytext">Date</i>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>

    <table width="648" cellpadding="0" cellspacing="0" id="footer" align="center">
      <tr valign="top">
        <td align="center">
          <span style="font-weight: bold">{{organization-franchise}}</span><br>
          {{organizationAddress}}<br>
        <span>P:</span> {{organizationPhone}} <span>F:</span> {{franchisePhone}}
          <a style="color: rgb(255,255,255)" href="{{organizationHref}}">{{organizationWebsite}}</a>
        </td>
      </tr>
    </table>
  </body>
  </html>

  <p class="breakhere"></p>

  <!-- ===================== NOTICE OF INTENT TO VACATE ===================== -->
  <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
  <html>
  <head>
    <title>{{reservationNotice}} Notice of Intent to Vacate</title>
    <style>
      body {
        background-color: #eee;
        font-family: arial, san-serif;
      }

      p {
        font-size: 9pt;
        line-height: 150%;
        margin-bottom: 12px;
      }

      #container {
        border: 2px solid #ddd;
        padding: 10px;
        background-color: #fff;
      }

      #header {
        background-color: #222;
      }

      h1 {
        font-size: 11pt;
        font-weight: 600;
        text-align: center;
        color: #fff;
        margin: 0;
        padding: 5px;
      }

      .border {
        border: 1px solid #ddd;
        padding: 10px;
      }

      .border p {
        margin: 0;
        margin-bottom: 12px;
      }

      .grayline {
        color: #ccc;
      }

      .smgraytext {
        font-size: 9pt;
        color: #999;
      }

      #footer {
        background-color: #222;
        font-size: 9pt;
        color: #fff;
        padding: 10px;
      }
    </style>

    <meta name="GENERATOR" content="MSHTML 8.00.6001.19019">
  </head>

  <body>
    <table id="header" cellspacing="0" cellpadding="0" width="648" align="center">
      <tbody>
        <img src="http://www.aaxsys.com/members/awch-dn/New_Website_Logo_DN_2.jpg" align="center">
        <tr valign="top">
          <td>
            <h1>{{reservationNotice}} Notice of Intent to Vacate</h1>
          </td>
        </tr>
      </tbody>
    </table>

    <table id="container" cellspacing="0" cellpadding="0" width="650" align="center">
      <tbody>
        <tr valign="top">
          <td width="50%">
            <div style="margin-right: 5px" class="border">
              <p>
                <span style="font-weight: bold">To: </span>{{organization-franchise}}<br>
                <span style="font-weight: bold">Property Address:</span> {{apartmentAddress}}
              </p>
            </div>
          </td>
          <td width="50%">
            <div style="margin-left: 5px" class="border">
              <p>
                <span style="font-weight: bold">From:</span> {{companyName}}<br>
                <span style="font-weight: bold">Reservation #:</span> {{reservationCode}}
              </p>
            </div>
          </td>
        </tr>

        <tr valign="top">
          <td colspan="2">
            <div style="margin-top: 10px; margin-bottom: 10px" class="border">
              <p>
                <span style="font-weight: bold">Today's Date:</span> <span class="grayline">__________________</span><br>
              </p>
            </div>
          </td>
        </tr>

        <tr valign="top">
          <td colspan="2">
            <div class="border">
              <p>
                In accordance with the terms of our lease agreement, I am hereby giving {{reservationNotice}} written notice of termination of our lease on the above mentioned property.
              </p>
              <p>
                <span style="font-weight: bold">My departure date will be:</span> <span class="grayline">________________________</span>
              </p>
              <p>
                I understand that check-out is at {{checkOutTime}} on my departure date. The date given above is a definite date to vacate, and no change in the move-out date will be made without written approval of {{organization-franchise}}.
              </p>
              <p>
                <span style="font-weight: bold">Forwarding address:</span> <span style="font-style: italic"> (Needed for deposit refund)</span>
              </p>
              <br>
              <hr class="grayline" noshade>
              <br>
              <hr class="grayline" noshade>
              <br>
              <hr class="grayline" noshade>

              <p>
                <span style="font-weight: bold">Rent due through end of notice $:</span> <span class="grayline">________________________</span>
              </p>
            </div>
            <br><br>

            <table cellspacing="0" cellpadding="0" width="100%" align="center">
              <tbody>
                <tr valign="top">
                  <td style="padding-right: 10px" width="60%" align="center">
                    <hr class="grayline" noshade>
                    <span style="font-style: italic">Signature</span>
                  </td>
                  <td style="padding-left: 10px" width="40%" align="center">
                    <hr class="grayline" noshade>
                    <span style="font-style: italic">Date</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <br><br>

            <div class="border">
              <p>
                <span style="font-weight: bold">Acknowledged by {{organization-franchise}}:</span>
              </p>
              <br>
              <table cellspacing="0" cellpadding="0" width="100%" align="center">
                <tbody>
                  <tr valign="top">
                    <td style="padding-right: 10px" width="60%" align="center">
                      <hr class="grayline" noshade>
                      <span style="font-style: italic">Signature</span>
                    </td>
                    <td style="padding-left: 10px" width="40%" align="center">
                      <hr class="grayline" noshade>
                      <span style="font-style: italic">Date</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <table id="footer" cellspacing="0" cellpadding="0" width="648" align="center">
      <tbody>
        <tr valign="top">
          <td align="center">
            <span style="font-weight: bold">{{organization-franchise}}</span><br>
            {{organizationAddress}}<br>
            <span>P:</span> {{organizationPhone}} <span>F:</span> {{franchisePhone}}
            <a style="color: rgb(255,255,255)" href="{{organizationHref}}">{{organizationWebsite}}</a>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
  </html>

</body>
</html>`;
  }
}
