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
  officeConfigurations: OfficeConfigurationResponse[] = [];
  officeConfiguration: OfficeConfigurationResponse | null = null;
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safeHtml: SafeHtml | null = null;
  iframeKey: number = 0;
  isDownloading: boolean = false;
  showPreview: boolean = false;
  private leaseFormSubscription?: Subscription;
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'officeConfigurations', 'organization', 'property', 'leaseInformation', 'reservation', 'lease'])); 
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

  //#region Lease
  ngOnInit(): void {
    this.loadOffices();
    this.loadOfficeConfigurations();
    this.loadOrganization();
    this.loadReservation();
    this.loadProperty();
    this.loadLeaseInformation();
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
           // If office and reservation are not selected, show the raw lease HTML preview (similar to welcome letter)
           if (!this.office || !this.reservation) {
             this.showPreview = true;
           }
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
  //#endregion

  // Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      lease: new FormControl(''),
      officeId: new FormControl<number | null>(null)
    });
  }

  onOfficeSelected(officeId: number | null): void {
    if (officeId) {
      this.office = this.offices.find(o => o.officeId === officeId) || null;
      this.officeConfiguration = this.officeConfigurations.find(o => o.officeId === officeId) || null;
    } else {
      this.office = null;
      this.officeConfiguration = null;
      this.showPreview = false;
    }
    // Automatically show preview when both office and reservation are selected
    if (this.office && this.reservation) {
      this.generatePreviewIframe();
      this.showPreview = true;
    } else {
      this.showPreview = false;
    }
  }
  //#endregion

   //#region Data Loading Methods 
  loadOffices(): void {
     this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
       next: (offices: OfficeResponse[]) => {
        this.offices = offices;
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadOfficeConfigurations(): void {
    this.officeConfigurationService.getAllOfficeConfigurations().pipe(take(1), finalize(() => { this.removeLoadItem('officeConfigurations'); })).subscribe({
      next: (configs: OfficeConfigurationResponse[]) => {
        this.officeConfigurations = configs;
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
        this.office = this.offices.find(o => o.officeId === this.property.officeId) || null;
        this.officeConfiguration = this.officeConfigurations.find(o => o.officeId === this.property.officeId) || null;
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
  //#endregion

  //#region Field Replacement Helpers
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
    if (this.reservation?.reservationNoticeId === null || this.reservation?.reservationNoticeId === undefined) return '';
    if (this.reservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '(30 day written notice is required)';
    } else if (this.reservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '(14 day written notice is required)';
    }
    return '';
  }

  getPetText(): string {
    if (!this.reservation) return '';
    return this.reservation.hasPets 
      ? '$' + (this.reservation.petFee || 0).toFixed(2) + '.     ' + this.reservation.numberOfPets.toString() + ' pet(s).    ' + 'Type(s):' + this.reservation.petDescription
      : 'None';
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
    if (this.reservation.depositTypeId === DepositType.CLR) 
      return `Corporate Letter of Responsibility`;
    else if (this.reservation.depositTypeId === DepositType.SDW) 
      return '$' + this.reservation.deposit.toFixed(2) + ' per month';
    else 
      return '$' + this.reservation.deposit.toFixed(2) + ' ';

  }
  
  getDepositRequirementText2(): string {
    if (!this.reservation) return '';
    if (this.reservation.depositTypeId === DepositType.CLR) 
      return `(Required to reserve unit)`;
    else if (this.reservation.depositTypeId === DepositType.SDW) 
      return `(To be included with monthly rent)`;
    else return `(See below)`;
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
  //#endregion

  //#region Placeholder Replacement Logic
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
      result = result.replace(/\{\{depositText2\}\}/g, this.getDepositRequirementText2());
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
  //#endregion

  //#region Preview, Download, Print, Email Functions
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
    // Get lease HTML from form
    const leaseHtml = this.form.get('lease')?.value || '';
    if (!leaseHtml.trim()) {
      this.previewIframeHtml = '';
      return;
    }

    let processedHtml: string;

    // If both office and reservation are selected, replace placeholders with actual data
    if (this.office && this.reservation) {
      processedHtml = this.replacePlaceholders(leaseHtml);
    } else {
      // If office or reservation are not selected, display raw lease HTML (similar to welcome letter)
      processedHtml = leaseHtml;
    }

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
  //#endregion

  //#region Utility Methods
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
  //#endregion
}

