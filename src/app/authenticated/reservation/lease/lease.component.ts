import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
import { ReservationLeaseRequest, ReservationLeaseResponse } from '../models/lease.model';
import { ReservationLeaseService } from '../services/reservation-lease.service';
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseInformationResponse } from '../models/lease-information.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { finalize, take, of, catchError, Observable, filter, BehaviorSubject, map, Subscription, switchMap, from } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationNotice, BillingType, DepositType } from '../models/reservation-enum';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { OfficeConfigurationService } from '../../organization-configuration/office-configuration/services/office-configuration.service';
import { OfficeConfigurationResponse } from '../../organization-configuration/office-configuration/models/office-configuration.model';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentType, DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { PropertyHtmlRequest, PropertyHtmlResponse } from '../../property/models/property-html.model';
import { PropertyHtmlService } from '../../property/services/property-html.service';

@Component({
  selector: 'app-lease',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './lease.component.html',
  styleUrl: './lease.component.scss'
})
export class LeaseComponent implements OnInit, OnDestroy {
  @Input() reservationId: string = '';
  @Input() propertyId: string = '';
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationResponse[] = [];
  reservation: ReservationResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  leaseInformation: LeaseInformationResponse | null = null;
  contact: ContactResponse | null = null;
  company: CompanyResponse | null = null;
  offices: OfficeResponse[] = [];
  office: OfficeResponse | null = null;
  officeConfiguration: OfficeConfigurationResponse | null = null;
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safeHtml: SafeHtml | null = null;
  iframeKey: number = 0;
  isDownloading: boolean = false;
  showPreview: boolean = false;
  private leaseFormSubscription?: Subscription;
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'organization', 'property', 'leaseInformation', 'reservation', 'lease'])); 
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));


  constructor(
    private reservationService: ReservationService,
    private propertyHtmlService: PropertyHtmlService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private companyService: CompanyService,
    private commonService: CommonService,
    private leaseInformationService: LeaseInformationService,
    private officeService: OfficeService,
    private officeConfigurationService: OfficeConfigurationService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private documentExportService: DocumentExportService,
    private documentService: DocumentService,
    private sanitizer: DomSanitizer
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.loadOffices();
    this.loadOrganization();
    this.loadProperty();
    this.loadLeaseInformation();
    this.loadReservation();
    this.getLease();
    
    // Automatically regenerate preview when lease HTML changes (if both office and reservation are selected)
    this.leaseFormSubscription = this.form.get('lease')?.valueChanges.subscribe(() => {
      if (this.office && this.reservation) {
        this.generatePreviewIframe();
      }
    });
  }


  getLease(): void {
    if (!this.propertyId) {
      this.removeLoadItem('lease');
      return;
    }

     this.propertyHtmlService.getPropertyHtmlByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.removeLoadItem('lease'); })).subscribe({
       next: (response: PropertyHtmlResponse) => {
         if (response) {
           this.propertyHtml = response;
           this.form.patchValue({
             lease: response.lease || ''
           });
           this.generatePreviewIframe();
         }
       },
       error: (err: HttpErrorResponse) => {
         if (err.status !== 400) {
           this.toastr.error('Could not load lease at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
         }
       }
     });
  }

  saveLease(): void {
    if (!this.propertyId) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();

    // Create and initialize PropertyHtmlRequest
    // Preserve welcomeLetter from original response, use form lease for defaultLease
    const propertyHtmlRequest: PropertyHtmlRequest = {
      propertyId: this.propertyId,
      organizationId: this.authService.getUser()?.organizationId || '',
      welcomeLetter: this.propertyHtml?.welcomeLetter || '',
      lease: formValue.lease || ''
    };

    // Save the HTML using upsert
    this.propertyHtmlService.upsertPropertyHtml(propertyHtmlRequest).pipe(take(1)).subscribe({
      next: (response) => {
        this.propertyHtml = response;
        this.toastr.success('Lease saved successfully', 'Success');
        this.isSubmitting = false;
        this.generatePreviewIframe();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not save lease at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.isSubmitting = false;
      }
    });
  }

  saveLeaseAsDocument(): void {
    const formValue = this.form.getRawValue();
    const officeId = formValue.officeId;

    if (!officeId) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Ensure this.office is set
    if (!this.office && officeId) {
      this.office = this.offices.find(o => o.officeId === officeId) || null;
    }

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.getPdfHtmlWithStyles();
    const fileName = `${this.organization?.name}_Lease_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization!.organizationId,
      officeId: this.office!.officeId,
      documentType: DocumentType.ReservationLease,
      fileName: fileName
    };

    this.documentService.generate(generateDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        this.toastr.success('Document generated successfully', 'Success');
        this.isSubmitting = false;
        this.generatePreviewIframe();
      },
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Document generation failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        console.error('Document save error:', err);
        this.isSubmitting = false;
        this.generatePreviewIframe();
      }
    });
  }

  // Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      lease: new FormControl(''),
      officeId: new FormControl<number | null>(null)
    });
  }

  // Form Response Functions
  onOfficeSelected(officeId: number | null): void {
    if (officeId) {
      this.office = this.offices.find(o => o.officeId === officeId) || null;
      this.loadOfficeConfiguration(officeId);
    } else {
      this.office = null;
      this.officeConfiguration = null;
      this.showPreview = false;
    }
    // Automatically show preview when both office and reservation are selected
    if (this.office && this.reservation) {
      // Ensure default template is loaded if form is empty
      const currentLease = this.form.get('lease')?.value || '';
      if (!currentLease.trim()) {
        this.form.patchValue({
          lease: this.getDefaultLeaseTemplate()
        });
      }
      this.generatePreviewIframe();
      this.showPreview = true;
    } else {
      this.showPreview = false;
    }
  }

   // Data Loading Methods 
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
         this.offices = [];
         if (err.status !== 400) {
           this.toastr.error('Could not load offices at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
         this.removeLoadItem('organization');
       }
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
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('property');
      }
    });
  }

  loadLeaseInformation(): void {
    if (!this.propertyId) {
      this.removeLoadItem('leaseInformation');
      return;
    }

    this.leaseInformationService.getLeaseInformationByPropertyId(this.propertyId).pipe( take(1), finalize(() => { this.removeLoadItem('leaseInformation'); }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.removeLoadItem('leaseInformation');
          return of(null);
        }
        if (err.status !== 400) {
          this.toastr.error('Could not load lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('leaseInformation');
        return of(null);
      })
    ).subscribe({
      next: (response: LeaseInformationResponse | null) => {
        this.leaseInformation = response;
      }
    });
  }
  
  loadReservation(): void {
    if (!this.reservationId) {
      this.removeLoadItem('reservation');
      return;
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1), finalize(() => { this.removeLoadItem('reservation'); })).subscribe({
      next: (reservation: ReservationResponse) => {
        this.reservation = reservation;
        // Chain loadContact after reservation loads
        this.loadContact();
        // Automatically show preview when both office and reservation are selected
        if (this.office && this.reservation) {
          this.generatePreviewIframe();
          this.showPreview = true;
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('reservation');
      }
    });
  }

  loadContact(): void {
    if (!this.reservation?.contactId) {
      this.contact = null;
      return;
    }

    this.contactService.getContactByGuid(this.reservation.contactId).pipe(take(1)).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        // Chain loadCompany if contact is a company type
        if (this.contact.entityTypeId === EntityType.Company && this.contact.entityId) {
          this.loadCompany(this.contact.entityId);
        } else {
          this.company = null;
        }
      },
      error: (err: HttpErrorResponse) => {
        this.contact = null;
        if (err.status !== 400) {
          this.toastr.error('Could not load contact info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
 
  loadCompany(companyId: string): void {
    this.companyService.getCompanyByGuid(companyId).pipe(take(1)).subscribe({
      next: (response: CompanyResponse) => {
        this.company = response;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load company info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  
  loadOfficeConfiguration(officeId: number): void {
     this.officeConfigurationService.getOfficeConfigurationByOfficeId(officeId).pipe(take(1)).subscribe({
       next: (config: OfficeConfigurationResponse) => {
         this.officeConfiguration = config;
       },
       error: (err: HttpErrorResponse) => {
         this.officeConfiguration = null;
         if (err.status !== 400) {
           this.toastr.error('Could not load office configuration at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
         }
       }
     });
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
    if (!this.organization) return '';
    if (this.office) {
      return this.organization.name + ' ' + this.office.name;
    }
    return this.organization.name;
  }

  getBillingTypeText(): string {
    if (!this.reservation) return '';
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
    if(!this.contact ) return '';
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
    if(!this.property || !this.officeConfiguration) return '';

    const bedrooms = this.property.bedrooms;
    let utilityFee: number | undefined;

    switch(bedrooms) {
      case 1:
        utilityFee = this.officeConfiguration.utilityOneBed;
        break;
      case 2:
        utilityFee = this.officeConfiguration.utilityTwoBed;
        break;
      case 3:
        utilityFee = this.officeConfiguration.utilityThreeBed;
        break;
      case 4:
        utilityFee = this.officeConfiguration.utilityFourBed;
        break;
      default:
        // For 5+ bedrooms or house, use utilityHouse
        utilityFee = this.officeConfiguration.utilityHouse;
        break;
    }

    if (utilityFee !== null && utilityFee !== undefined) {
      return utilityFee.toFixed(2);
    }
    return '';
  }

  getDefaultMaidServiceFeeText(): string {
    if(!this.property || !this.officeConfiguration) return '';

    const bedrooms = this.property.bedrooms;
    let maidFee: number | undefined;

    switch(bedrooms) {
      case 1:
        maidFee = this.officeConfiguration.maidOneBed;
        break;
      case 2:
        maidFee = this.officeConfiguration.maidTwoBed;
        break;
      case 3:
        maidFee = this.officeConfiguration.maidThreeBed;
        break;
      case 4:
        maidFee = this.officeConfiguration.maidFourBed;
        break;
      default:
        // For 5+ bedrooms, use maidFourBed as fallback
        maidFee = this.officeConfiguration.maidFourBed;
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

    if (this.office) {
      result = result.replace(/\{\{officeDescription\}\}/g, this.office.name || '');
      result = result.replace(/\{\{officePhone\}\}/g, this.formatterService.phoneNumber(this.office.phone) || 'N/A');
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
      result = result.replace(/\{\{miscellaneous\}\}/g, this.replacePlaceholdersInText(this.leaseInformation.miscellaneous || ''));
    }

    // Handle logo
    const logoDataUrl = this.organization?.fileDetails?.dataUrl;
    if (!logoDataUrl) {
      result = result.replace(/<img[^>]*\{\{logoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace organization placeholders
    if (this.organization) {
      result = result.replace(/\{\{organization-office\}\}/g, this.getOrganizationName());
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

    // Replace organization/office name
    if (this.organization) {
      result = result.replace(/\{\{organization-office\}\}/g, this.getOrganizationName());
    }

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

  // Preview, Download, Print, Email Functions
  onPreview(): void {
    if (!this.office || !this.reservation) {
      this.toastr.warning('Please select an office and reservation to generate the preview', 'No Selection');
      return;
    }
    
    if (!this.showPreview) {
      // Generate preview and show it
      this.generatePreviewIframe();
      this.showPreview = true;
    } else {
      // Hide preview and show editor
      this.showPreview = false;
    }
  }

  generatePreviewIframe(): void {
    // Only generate preview if both office and reservation are selected
    if (!this.office || !this.reservation) {
      this.previewIframeHtml = '';
      return;
    }

    // Get lease HTML from form
    const leaseHtml = this.form.get('lease')?.value || '';
    if (!leaseHtml.trim()) {
      this.previewIframeHtml = '';
      this.toastr.warning('Please enter lease HTML content to preview', 'No Content');
      return;
    }

    // Replace placeholders with actual data
    let processedHtml = this.replacePlaceholders(leaseHtml);

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
    this.previewIframeStyles = extractedStyles.join('\n\n');

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
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(processedHtml);
    
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
    } catch (error) {
      // Cross-origin or other security error - this is expected in some cases
      // Silently fail as this is not critical for functionality
    }
  }

  async onDownload(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the lease', 'No Preview');
      return;
    }

    if (!this.organization?.organizationId || !this.office) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return;
    }

    this.isDownloading = true;
    try {
      const htmlWithStyles = this.getPdfHtmlWithStyles();
      const fileName = `${this.reservation?.reservationCode}_Lease_${new Date().toISOString().split('T')[0]}.pdf`;

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: this.organization.organizationId,
        officeId: this.office.officeId,
        documentType: DocumentType.ReservationLease,
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
    } catch (error) {
      this.isDownloading = false;
      this.toastr.error('Error generating PDF. Please try again.', 'Error');
    }
  }

  onPrint(): void {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the lease', 'No Preview');
      return;
    }

    // Get the HTML with styles injected
    const htmlWithStyles = this.getPreviewHtmlWithStyles();
    this.documentExportService.printHTML(htmlWithStyles);
  }

  async onEmail(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please select an office and reservation to generate the lease', 'No Preview');
      return;
    }

    // Get tenant email from contact
    const tenantEmail = this.contact?.email || '';
    if (!tenantEmail) {
      this.toastr.warning('No email address found for this reservation', 'No Email');
      return;
    }

    try {
      await this.documentExportService.emailWithPDF({
        recipientEmail: tenantEmail,
        subject: 'Your Lease Agreement',
        organizationName: this.organization?.name,
        tenantName: this.reservation?.tenantName,
        htmlContent: '' // Not used anymore, but keeping for interface compatibility
      });
    } catch (error) {
      this.toastr.error('Error opening email client. Please try again.', 'Error');
    }
  }

  // HTML Generation Functions
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
    const bodyMatch = bodyContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1].trim();
    }
    return bodyContent.replace(/<html[^>]*>|<\/html>/gi, '').replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  }

  getPrintStyles(wrapInMediaQuery: boolean): string {
    const styles = `
      @page {
        size: letter;
        margin: 0.75in;
      }
      
      body {
        font-size: 10pt !important;
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
        font-size: 10pt !important;
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
      
      /* Ensure all sections are visible in print */
      section,
      .corporate-letter,
      .notice-intent {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: block !important;
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

  getDefaultLeaseTemplate(): string {
    // This is the default lease template with client-side placeholders
    return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
  <title>{{ClientNo}} {{companyName}} {{propertyCode}}</title>

  <meta name="GENERATOR" content="MSHTML 8.00.7600.16766">
  <meta name="viewport" content="width=device-width, initial-scale=1">

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
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      font-family: arial, sans-serif;
      max-width: 8.5in;
      width: 8.5in;
      margin: 0 auto;
      padding: 0;
    }

    p {
      font-size: 10pt;
      line-height: 150%;
    }

    #terms p, #terms li {
      font-size: 10pt;
      margin-top: 0;
      max-width: 100% !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    #terms {
      max-width: 100% !important;
      width: 100% !important;
    }

    #container {
      max-width: 100% !important;
      width: 100% !important;
      border: 1px solid #ddd !important;
      padding: 3px !important;
      background-color: #fff !important;
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
      font-size: 16pt !important;
      font-weight: 600 !important;
      color: #000;
      margin-top: 15px !important;
      margin-bottom: 2px !important;
      padding: 0;
    }

    h1 {
      font-size: 18pt;
      font-weight: 600;
      text-align: center;
      color: #fff;
      margin: 0;
      padding: 5px;
      background-color: #222;
      letter-spacing: -0.5px;
    }

    h2 {
      font-size: 16pt !important;
      font-weight: 600 !important;
      color: #000 !important;
      margin-top: 15px !important;
      margin-bottom: 2px !important;
      padding: 0 !important;
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
<div class="page">
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
        <td width="50%" style="vertical-align: top; padding: 5px; width: 50% !important;">
          <div style="margin-right: 5px; min-height: 300px; display: flex; flex-direction: column;" class="border">
            <h2 style="color: #000 !important;">Tenant Information</h2>
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

        <td width="50%" style="vertical-align: top; padding: 5px; width: 50% !important;">
          <div style="margin-left: 5px; min-height: 300px; display: flex; flex-direction: column;" class="border">
            <h2 style="color: #000 !important;">Rental information</h2>
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
          <h2 style="margin-top: 10px; margin-bottom: 10px; color: #000 !important;" class="border">Property Information</h2>
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
              <p><br><br></p>
              <hr class="grayline" noshade>
              <span style="font-style: italic">{{organization-office}}</span>
            </td>
            <td style="padding-left: 10px" width="40%" align="center">
              <hr class="grayline" noshade>
              <span style="font-style: italic">Date</span>
              <p><br><br></p>
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
                <span style="font-weight: bold">{{organization-office}}</span><br>
                {{organizationAddress}}<br>
                <span>P:</span> {{organizationPhone}} &nbsp;&nbsp;&nbsp; <span>F:</span> {{officePhone}} &nbsp;&nbsp;&nbsp;
                <a style="color: rgb(255,255,255)" href="http://{{organizationWebsite}}">{{organizationWebsite}}</a>
              </td>
            </tr>
          </tbody>
        </table>
      </p>
    </td>
  </tr>
</div>

  <p class="breakhere"></p>

<div class="page">
  <!-- ===================== CORPORATE LETTER OF RESPONSIBILITY ===================== -->
  <style>
      body {
        font-family: arial, sans-serif;
      }

      p {
        font-size: 10pt;
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
        font-size: 18pt;
        font-weight: 600;
        text-align: center;
        color: #fff;
        margin: 0;
        padding: 10px 5px 30px 5px;
        background-color: #222;
        letter-spacing: -0.5px;
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
        font-size: 9pt;
        color: #999;
      }

      #footer {
        background-color: #222;
        font-size: 6pt;
        color: #fff;
        padding: 10px;
      }
    </style>

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
              <strong>To: </strong>{{organization-office}}<br>
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
            <p style="font-size: 10pt">
              <strong>Agreed to and Accepted:</strong>
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" align="center">
              <tr valign="top">
                <td width="50%" style="padding-right: 10px" align="center">
                  <strong>{{responsibleParty}}</strong><br>
                  <i class="smgraytext">(Company)</i>
                  <p><br><br>
                    <hr noshade class="grayline">
                    <i class="smgraytext">Signature</i>
                  </p><br>

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
                  <br>
                </td>
                <td width="50%" style="padding-left: 5px" align="center">
                  <strong>{{organization-office}}</strong><br>
                  <i class="smgraytext">(Property Manager)</i>
                  <p><br><br>
                    <hr noshade class="grayline">
                    <i class="smgraytext">Signature</i>
                  </p><br>
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
          <span style="font-weight: bold">{{organization-office}}</span><br>
          {{organizationAddress}}<br>
            <span>P:</span> {{organizationPhone}} &nbsp;&nbsp;&nbsp; <span>F:</span> {{officePhone}} &nbsp;&nbsp;&nbsp;
            <a style="color: rgb(255,255,255)" href="http://{{organizationWebsite}}">{{organizationWebsite}}</a>
        </td>
      </tr>
    </table>
</div>

  <p class="breakhere"></p>

<div class="page">
  <!-- ===================== NOTICE OF INTENT TO VACATE ===================== -->
  <style>
      body {
        font-family: arial, sans-serif;
      }

      p {
        font-size: 10pt;
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
        font-size: 18pt;
        font-weight: 600;
        text-align: center;
        color: #fff;
        margin: 0;
        padding: 10px 5px 30px 5px;
        background-color: #222;
        letter-spacing: -0.5px;
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
                <span style="font-weight: bold">To: </span>{{organization-office}}<br>
                <span style="font-weight: bold">Property Address:</span> {{apartmentAddress}}
              </p>
            </div>
          </td>
          <td width="50%">
            <div style="margin-left: 5px" class="border">
              <p>
                <span style="font-weight: bold">From:</span> {{responsibleParty}}<br>
                <span style="font-weight: bold">Reservation #:</span> {{reservationCode}}
              </p>
            </div>
          </td>
        </tr>

        <tr valign="top">
          <td colspan="2">
            <div style="margin-top: 10px; margin-bottom: 10px" class="border">
              <br>
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
                I understand that check-out is at {{checkOutTime}} on my departure date. The date given above is a definite date to vacate, and no change in the move-out date will be made without written approval of {{organization-office}}.
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

              <br>
              <p>
                <span style="font-weight: bold">Rent due through end of notice $:</span> <span class="grayline">________________________</span>
              </p>
            </div>
            <br><br>

            <table cellspacing="0" cellpadding="0" width="100%" align="center"><br>
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
                <span style="font-weight: bold">Acknowledged by {{organization-office}}:</span>
              </p>
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
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <table id="footer" cellspacing="0" cellpadding="0" width="648" align="center">
      <tbody>
        <tr valign="top">
          <td align="center">
            <span style="font-weight: bold">{{organization-office}}</span><br>
            {{organizationAddress}}<br>
              <span>P:</span> {{organizationPhone}} &nbsp;&nbsp;&nbsp; <span>F:</span> {{officePhone}} &nbsp;&nbsp;&nbsp;
              <a style="color: rgb(255,255,255)" href="http://{{organizationWebsite}}">{{organizationWebsite}}</a>
          </td>
        </tr>
      </tbody>
    </table>
</div>
`;
  }

  // Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.leaseFormSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
}

