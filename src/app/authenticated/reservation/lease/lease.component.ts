import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
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
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseInformationResponse } from '../models/lease-information.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { finalize, take, Observable, filter, BehaviorSubject, map, Subscription, forkJoin, of } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationNotice, BillingType, DepositType } from '../models/reservation-enum';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentType } from '../../documents/models/document.enum';
import { PropertyHtmlRequest, PropertyHtmlResponse } from '../../property/models/property-html.model';
import { PropertyHtmlService } from '../../property/services/property-html.service';
import { LeaseReloadService } from '../services/lease-reload.service';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-lease',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './lease.component.html',
  styleUrl: './lease.component.scss'
})
export class LeaseComponent implements OnInit, OnDestroy, OnChanges {
  @Input() reservationId: string = '';
  @Input() propertyId: string = '';
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationResponse[] = [];
  selectedReservation: ReservationResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  leaseInformation: LeaseInformationResponse | null = null;
  contacts: ContactResponse[] = [];
  contact: ContactResponse | null = null;
  company: CompanyResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  contactsSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safeHtml: SafeHtml | null = null;
  iframeKey: number = 0;
  isDownloading: boolean = false;
  leaseReloadSubscription?: Subscription;
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'organization', 'property', 'leaseInformation', 'reservation','contacts'])); 
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
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private documentExportService: DocumentExportService,
    private documentService: DocumentService,
    private sanitizer: DomSanitizer,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService
  ) {
    this.form = this.buildForm();
  }

  //#region Lease
  ngOnInit(): void {
    this.loadOrganization();
    this.loadContacts();
    this.loadOffices();
    this.loadReservation();
    
    // Only load property and lease info if propertyId is available
    if (this.propertyId) {
      this.loadProperty();
      this.loadLeaseInformation();
    }
    
    // Load the lease after we have all necessary data
    this.itemsToLoad$.pipe(filter(items => items.size === 0),take(1)).subscribe(() => {
      this.getLease();
    });

    // Subscribe to lease reload events
    this.leaseReloadSubscription = this.leaseReloadService.reloadLease.subscribe(() => {
      this.reloadLease();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When propertyId becomes available, load property and lease information
    if (changes['propertyId'] && changes['propertyId'].currentValue && !changes['propertyId'].previousValue) {
      this.loadProperty();
      this.loadLeaseInformation();
    }
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
           this.form.patchValue({ lease: response.lease || '' });
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

  reloadLease(): void {
    // Reload reservation data to get latest information
    if (this.reservationId) {
      this.loadReservation();
    }
    // Reload lease information to get latest data
    if (this.propertyId) {
      this.loadLeaseInformation();
    }
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
    const officeId = formValue.selectedOfficeId;

    if (!officeId) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Ensure this.selectedOffice is set
    if (!this.selectedOffice && officeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    }

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.getPdfHtmlWithStyles();
    const reservationCode = this.selectedReservation?.reservationCode?.replace(/-/g, '') || '';
    const fileName = `Lease_${reservationCode}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization!.organizationId,
      officeId: this.selectedOffice!.officeId,
      officeName: this.selectedOffice!.name,
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

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      lease: new FormControl(''),
      selectedReservationId: new FormControl(null),
      selectedOfficeId: new FormControl(null)
    });
  }

  onOfficeSelected(officeId: number | null): void {
    if (officeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    } else {
      this.selectedOffice = null;
    }
    this.generatePreviewIframe();
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

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.removeLoadItem('offices');
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
        this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
       }
    });
  }

  loadLeaseInformation(): void {
    if (!this.propertyId) {
      this.removeLoadItem('leaseInformation');
      return;
    }
    
    this.leaseInformationService.getLeaseInformationByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.removeLoadItem('leaseInformation'); })).subscribe({
      next: (response: LeaseInformationResponse) => {
        this.leaseInformation = response;
      },
      error: (err: HttpErrorResponse) => {
        this.leaseInformation = null;
        if (err.status !== 400) {
          this.toastr.error('Could not load lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  
  loadReservation(): void {
    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1), finalize(() => { this.removeLoadItem('reservation'); })).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.loadContact();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadContact(): void {
    if (!this.selectedReservation?.contactId) {
      this.contact = null;
      return;
    }

    this.contact = this.contacts.find(c => c.contactId === this.selectedReservation.contactId) || null;
    if (this.contact && this.contact.entityTypeId === EntityType.Company && this.contact.entityId) {
        this.loadCompany(this.contact.entityId);
    } else {
        this.company = null;
    }
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
    if (!this.selectedReservation) return '';
    const reservationCode = this.selectedReservation.reservationCode || 'N/A';
    const tenantName = this.selectedReservation.tenantName || 'Unnamed Tenant';
    return `${reservationCode}: ${tenantName}`;
  }

  getReservationNoticeText(): string {
    if (this.selectedReservation?.reservationNoticeId === null || this.selectedReservation?.reservationNoticeId === undefined) return '';
    if (this.selectedReservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '(30 day written notice is required)';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FifteenDays) {
      return '(15 day written notice is required)';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '(14 day written notice is required)';
    }
    return '';
  }

  getReservationDayNotice(): string {
    if (this.selectedReservation?.reservationNoticeId === null || this.selectedReservation?.reservationNoticeId === undefined) return '';
    if (this.selectedReservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '30';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FifteenDays) {
      return '15';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '14';
    }
    return '';
  }

  getPetText(): string {
    if (!this.selectedReservation) return '';
    return this.selectedReservation.hasPets 
      ? '$' + (this.selectedReservation.petFee || 0).toFixed(2) + '.     ' + this.selectedReservation.numberOfPets.toString() + ' pet(s).    ' + 'Type(s):' + this.selectedReservation.petDescription
      : 'None';
  }

  getExtensionsPossible(): string {
    if (!this.selectedReservation) return 'No';
    return this.selectedReservation.allowExtensions ? 'Yes' : 'No';
  }

  getOrganizationName(): string {
    if (!this.organization) return '';
    if (this.selectedOffice) {
      return this.organization.name + ' ' + this.selectedOffice.name;
    }
    return this.organization.name;
  }

  getBillingTypeText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'Monthly';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'Daily';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'Nightly';
    }
    return '';
  }

  getBillingDayText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'month';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'day';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'night';
    }
    return '';
  }

  getBillingTypeLowerText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'monthly';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'daily';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'nightly';
    }
    return '';
  }

  getResponsibleParty(): string {
    if(!this.contact ) return '';
    return (this.contact.entityTypeId === EntityType.Company && this.company) 
      ?  this.company.name 
      : `${this.contact.firstName || ''} ${this.contact.lastName || ''}`.trim();
  }

  getSecurityDepositText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return '$0.00';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' per month';
    else 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' ';
  }

  getPartialMonthText(): string {
    if (!this.property) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Daily) 
      return '$' + this.selectedReservation.billingRate.toFixed(2) + ' per day.';
    else if (this.selectedReservation.billingTypeId === BillingType.Nightly) 
      return '$' + this.selectedReservation.billingRate.toFixed(2) + ' per night.';
    else (this.selectedReservation.billingTypeId === BillingType.Monthly) 
      return 'Monthly Rate divided by 30 days.';
  }

  getDepositRequirementText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return 'Corporate Letter of Responsibility';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' per month';
    else 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' ';
  }
  
  getDepositRequirementText2(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return `(Required to reserve unit)`;
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return `(To be included with monthly rent)`;
    else return `(See below)`;
  }

  getDefaultKeyFeeText(): string {
    if (!this.selectedOffice) return '';
    return '$' + this.selectedOffice.defaultKeyFee.toFixed(2);
  }
  
  getDefaultUtilityFeeText(): string {
    if(!this.property || !this.selectedOffice) return '';

    const bedrooms = this.property.bedrooms;
    let utilityFee: number | undefined;

    switch(bedrooms) {
      case 1:
        utilityFee = this.selectedOffice.utilityOneBed;
        break;
      case 2:
        utilityFee = this.selectedOffice.utilityTwoBed;
        break;
      case 3:
        utilityFee = this.selectedOffice.utilityThreeBed;
        break;
      case 4:
        utilityFee = this.selectedOffice.utilityFourBed;
        break;
      default:
        // For 5+ bedrooms or house, use utilityHouse
        utilityFee = this.selectedOffice.utilityHouse;
        break;
    }

    if (utilityFee !== null && utilityFee !== undefined) {
      return utilityFee.toFixed(2);
    }
    return '';
  }

  getDefaultMaidServiceFeeText(): string {
    if(!this.property || !this.selectedOffice) return '';

    const bedrooms = this.property.bedrooms;
    let maidFee: number | undefined;

    switch(bedrooms) {
      case 1:
        maidFee = this.selectedOffice.maidOneBed;
        break;
      case 2:
        maidFee = this.selectedOffice.maidTwoBed;
        break;
      case 3:
        maidFee = this.selectedOffice.maidThreeBed;
        break;
      case 4:
        maidFee = this.selectedOffice.maidFourBed;
        break;
      default:
        // For 5+ bedrooms, use maidFourBed as fallback
        maidFee = this.selectedOffice.maidFourBed;
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

    // LAYER 1: Replace lease information placeholders first (with their raw text values)
    result = this.replaceLeaseInformationPlaceholders(result);

    // LAYER 2: Replace all other placeholders (reservation, property, contact, organization, etc.)
    result = this.replaceAllOtherPlaceholders(result);

    return result;
  }

  replaceLeaseInformationPlaceholders(html: string): string {
    let result = html;

    if (this.leaseInformation) {
      result = result.replace(/\{\{rentalPayment\}\}/g, this.leaseInformation.rentalPayment || '');
      result = result.replace(/\{\{securityDeposit\}\}/g, this.leaseInformation.securityDeposit || '');
      result = result.replace(/\{\{cancellationPolicy\}\}/g, this.leaseInformation.cancellationPolicy || '');
      result = result.replace(/\{\{keyPickUpDropOff\}\}/g, this.leaseInformation.keyPickUpDropOff || '');
      result = result.replace(/\{\{partialMonth\}\}/g, this.leaseInformation.partialMonth || '');
      result = result.replace(/\{\{departureNotification\}\}/g, this.leaseInformation.departureNotification || '');
      result = result.replace(/\{\{holdover\}\}/g, this.leaseInformation.holdover || '');
      result = result.replace(/\{\{departureServiceFee\}\}/g, this.leaseInformation.departureServiceFee || '');
      result = result.replace(/\{\{checkoutProcedure\}\}/g, this.leaseInformation.checkoutProcedure || '');
      result = result.replace(/\{\{parking\}\}/g, this.leaseInformation.parking || '');
      result = result.replace(/\{\{rulesAndRegulations\}\}/g, this.leaseInformation.rulesAndRegulations || '');
      result = result.replace(/\{\{occupyingTenants\}\}/g, this.leaseInformation.occupyingTenants || '');
      result = result.replace(/\{\{utilityAllowance\}\}/g, this.leaseInformation.utilityAllowance || '');
      result = result.replace(/\{\{maidService\}\}/g, this.leaseInformation.maidService || '');
      result = result.replace(/\{\{pets\}\}/g, this.leaseInformation.pets || '');
      result = result.replace(/\{\{smoking\}\}/g, this.leaseInformation.smoking || '');
      result = result.replace(/\{\{emergencies\}\}/g, this.leaseInformation.emergencies || '');
      result = result.replace(/\{\{homeownersAssociation\}\}/g, this.leaseInformation.homeownersAssociation || '');
      result = result.replace(/\{\{indemnification\}\}/g, this.leaseInformation.indemnification || '');
      result = result.replace(/\{\{defaultClause\}\}/g, this.leaseInformation.defaultClause || '');
      result = result.replace(/\{\{attorneyCollectionFees\}\}/g, this.leaseInformation.attorneyCollectionFees || '');
      result = result.replace(/\{\{reservedRights\}\}/g, this.leaseInformation.reservedRights || '');
      result = result.replace(/\{\{propertyUse\}\}/g, this.leaseInformation.propertyUse || '');
      result = result.replace(/\{\{miscellaneous\}\}/g, this.leaseInformation.miscellaneous || '');
    }

    return result;
  }

  replaceAllOtherPlaceholders(html: string): string {
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
    if (this.selectedReservation) {
      result = result.replace(/\{\{reservationCode\}\}/g, this.selectedReservation.reservationCode || '');
      result = result.replace(/\{\{tenantName\}\}/g, this.selectedReservation.tenantName || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateStringLong(this.selectedReservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateStringLong(this.selectedReservation.departureDate) || '');
      result = result.replace(/\{\{numberOfPeople\}\}/g, (this.selectedReservation.numberOfPeople || 0).toString());
      result = result.replace(/\{\{billingType\}\}/g, this.getBillingTypeText());
      result = result.replace(/\{\{billingTypeDay\}\}/g, this.getBillingDayText());
      result = result.replace(/\{\{billingTypeLower\}\}/g, this.getBillingTypeLowerText());
      result = result.replace(/\{\{billingRate\}\}/g, (this.selectedReservation.billingRate || 0).toFixed(2));
      result = result.replace(/\{\{deposit\}\}/g, (this.selectedReservation.deposit || 0).toFixed(2));
      result = result.replace(/\{\{securityText\}\}/g, this.getSecurityDepositText());
      result = result.replace(/\{\{partialMonthText\}\}/g, this.getPartialMonthText());
      result = result.replace(/\{\{depositText\}\}/g, this.getDepositRequirementText());
      result = result.replace(/\{\{depositText2\}\}/g, this.getDepositRequirementText2());
      result = result.replace(/\{\{reservationDate\}\}/g, this.formatterService.formatDateStringLong(new Date().toISOString()) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, this.utilityService.getCheckInTime(this.selectedReservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, this.utilityService.getCheckOutTime(this.selectedReservation.checkOutTimeId) || '');
      result = result.replace(/\{\{reservationNotice\}\}/g, this.getReservationNoticeText());
     result = result.replace(/\{\{reservationNoticeDay\}\}/g, this.getReservationDayNotice());
      result = result.replace(/\{\{departureFee\}\}/g, (this.selectedReservation.departureFee || 0).toFixed(2));
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
      result = result.replace(/\{\{propertyFixedExp\}\}/g, (this.selectedReservation?.departureFee || 0).toFixed(2));
      result = result.replace(/\{\{propertyParking\}\}/g, this.property.parkingNotes || '');
    }

    if (this.selectedOffice) {
      result = result.replace(/\{\{officeDescription\}\}/g, this.selectedOffice.name || '');
      result = result.replace(/\{\{officePhone\}\}/g, this.formatterService.phoneNumber(this.selectedOffice.phone) || 'N/A');
      result = result.replace(/\{\{officeFax\}\}/g, this.formatterService.phoneNumber(this.selectedOffice.fax) || 'N/A');
    }

    if (this.selectedOffice) {
      result = result.replace(/\{\{utilityPenaltyFee\}\}/g, this.getDefaultUtilityFeeText());
      result = result.replace(/\{\{maidServicePenaltyFee\}\}/g, this.getDefaultMaidServiceFeeText());
      result = result.replace(/\{\{defaultKeyFee\}\}/g, '$' + this.selectedOffice.defaultKeyFee.toFixed(2));
      result = result.replace(/\{\{undisclosedPetFee\}\}/g, '$' + this.selectedOffice.undisclosedPetFee.toFixed(2));
      result = result.replace(/\{\{minimumSmokingFee\}\}/g, '$' + this.selectedOffice.minimumSmokingFee.toFixed(2));
      result = result.replace(/\{\{parkingPenaltyLow\}\}/g, '$' + this.selectedOffice.parkingLowEnd.toFixed(2));
      result = result.replace(/\{\{parkingPenaltyHigh\}\}/g, '$' + this.selectedOffice.parkingHighEnd.toFixed(2));
      result = result.replace(/\{\{maintenanceEmail\}\}/g, this.selectedOffice.maintenanceEmail || '');
      result = result.replace(/\{\{afterHoursPhone\}\}/g, this.formatterService.phoneNumber(this.selectedOffice.afterHoursPhone) || '');
      result = result.replace(/\{\{afterHoursInstructions\}\}/g, this.selectedOffice.afterHoursInstructions || '');
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
       if (logoDataUrl) {
        result = result.replace(/\{\{logoBase64\}\}/g, logoDataUrl);
      }
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  //#endregion

  //#region Preview, Download, Print, Email Functions
  generatePreviewIframe(): void {
    if (!this.selectedOffice || !this.selectedReservation || !this.propertyHtml?.lease) {
      this.previewIframeHtml = '';
      return;
    }

    const leaseHtml = this.propertyHtml.lease || '';
    if (!leaseHtml.trim()) {
      this.previewIframeHtml = '';
      return;
    }

    // If both office and reservation are selected, replace placeholders with actual data
    // Otherwise, show raw lease HTML (similar to welcome letter)
    let processedHtml: string;
    if (this.selectedOffice && this.selectedReservation) {
      processedHtml = this.replacePlaceholders(leaseHtml);
    } else {
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

    if (!this.organization?.organizationId || !this.selectedOffice) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return;
    }

    this.isDownloading = true;
    try {
      const htmlWithStyles = this.getPdfHtmlWithStyles();
      const reservationCode = this.selectedReservation?.reservationCode?.replace(/-/g, '') || '';
      const fileName = `Lease_${reservationCode}_${new Date().toISOString().split('T')[0]}.pdf`;

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: this.organization.organizationId,
        officeId: this.selectedOffice.officeId,
        officeName: this.selectedOffice.name,
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
    this.officesSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.leaseReloadSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

