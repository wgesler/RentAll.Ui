import { AsyncPipe, CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, catchError, filter, finalize, forkJoin, map, of, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { EmailService } from '../../email/services/email.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { DocumentService } from '../../documents/services/document.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { getCheckInTime, getCheckOutTime } from '../../properties/models/property-enums';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyService } from '../../properties/services/property.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { LeaseInformationResponse } from '../models/lease-information.model';
import { BillingType, DepositType, ReservationNotice } from '../models/reservation-enum';
import { ReservationListResponse, ReservationResponse } from '../models/reservation-model';
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseReloadService } from '../services/lease-reload.service';
import { ReservationService } from '../services/reservation.service';

@Component({
    selector: 'app-lease',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
    templateUrl: './lease.component.html',
    styleUrl: './lease.component.scss'
})
export class LeaseComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() reservationId: string = '';
  @Input() propertyId: string = '';
  @Input() officeId: number | null = null;
  @Input() lockOfficeSelection: boolean = false;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  organization: OrganizationResponse | null = null;
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  emailHtml: EmailHtmlResponse | null = null;
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
  includeLease: boolean = true;
  includeLetterOfResponsibility: boolean = true;
  includeNoticeToVacate: boolean = true;
  includeCreditCardAuthorization: boolean = false;
  includeBusinessCreditApplication: boolean = false;
  includeRentalCreditApplication: boolean = false;
  isCompanyRental: boolean = true;
  debuggingHtml: boolean = true;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'organization', 'property', 'leaseInformation', 'reservation', 'reservations', 'contacts', 'emailHtml'])); 
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));


  constructor(
    private reservationService: ReservationService,
    private propertyHtmlService: PropertyHtmlService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private companyService: CompanyService,
    private commonService: CommonService,
    emailService: EmailService,
    private emailHtmlService: EmailHtmlService,
    private leaseInformationService: LeaseInformationService,
    private officeService: OfficeService,
    private authService: AuthService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private sanitizer: DomSanitizer,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService,
    private http: HttpClient,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
  }

  //#region Lease
  ngOnInit(): void {
    this.applyOfficeSelectionLockState();
    this.loadOrganization();
    this.loadContacts();
    this.loadEmailHtml();
    this.loadOffices();
    this.loadReservations();
    this.loadReservation();
    this.loadProperty();
    this.loadLeaseInformation();
    
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
    if (changes['lockOfficeSelection']) {
      this.applyOfficeSelectionLockState();
    }

    // When propertyId becomes available, load property and lease information
    if (changes['propertyId'] && changes['propertyId'].currentValue && !changes['propertyId'].previousValue) {
      this.loadProperty();
      this.loadLeaseInformation();
    }
    
    // When officeId changes from parent, set the selected office (don't emit back)
    if (changes['officeId'] && this.offices.length > 0) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Only update if the value actually changed
      if (newOfficeId !== previousOfficeId) {
        if (newOfficeId !== null && newOfficeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
          if (this.selectedOffice) {
            this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId });
            this.filterReservations();
          }
        } else {
          this.selectedOffice = null;
          this.form.patchValue({ selectedOfficeId: null });
          this.filterReservations();
        }
      }
    }
  }

  getLease(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'lease');

    // This loads on add reservation, do nothing
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease');
      return;
    }

     this.propertyHtmlService.getPropertyHtmlByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease'); })).subscribe({
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
    // Build array of observables to wait for
    const reloadObservables: Observable<any>[] = [];
    
    // Reload reservation data to get latest information
    if (this.reservationId) {
      reloadObservables.push(
        this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1),
          map((reservation: ReservationResponse) => {
            this.selectedReservation = reservation;
            this.form.patchValue({ selectedReservationId: reservation.reservationId });
            if (reservation.officeId && this.offices.length > 0) {
              this.selectedOffice = this.offices.find(o => o.officeId === reservation.officeId) || null;
              this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
              this.filterReservations(); // This will filter to only show the selected reservation
            }
            this.loadContact();
            return { type: 'reservation', data: reservation };
          }),
          catchError((err: HttpErrorResponse) => {
            if (err.status !== 400) {
              this.toastr.error('Could not load reservation at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
            return of({ type: 'reservation', data: null });
          })
        )
      );
    }
    
    // Reload lease information to get latest data
    if (this.propertyId) {
      reloadObservables.push(
        this.leaseInformationService.getLeaseInformationByPropertyId(this.propertyId).pipe(take(1),
          map((response: LeaseInformationResponse) => {
            this.leaseInformation = response;
            return { type: 'leaseInformation', data: response };
          }),
          catchError((err: HttpErrorResponse) => {
            this.leaseInformation = null;
            if (err.status !== 400) {
              this.toastr.error('Could not load lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
            return of({ type: 'leaseInformation', data: null });
          })
        )
      );
    }
    
    // Wait for all reloads to complete before regenerating preview
    if (reloadObservables.length > 0) {
      forkJoin(reloadObservables).pipe(take(1)).subscribe({
        next: () => {
          // Regenerate preview after all data is updated
          this.generatePreviewIframe();
        },
        error: () => {
          // Still try to regenerate preview even if there was an error
          this.generatePreviewIframe();
        }
      });
    } else {
      this.generatePreviewIframe();
    }
  }

  saveLease(): void {
    if (!this.selectedOffice || !this.selectedReservation) {
      this.toastr.warning('Please select an office and reservation to generate the lease', 'Missing Selection');
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles,
      { fontSize: '10pt', includeLeaseStyles: true }
    );

    const fileName = this.utilityService.generateDocumentFileName('lease', this.selectedReservation?.reservationCode);
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization!.organizationId,
      officeId: this.selectedOffice!.officeId,
      officeName: this.selectedOffice!.name,
      propertyId: this.propertyId || null,
      reservationId: this.selectedReservation?.reservationId || null,
      documentTypeId: DocumentType.ReservationLease,
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
        this.isSubmitting = false;
        this.generatePreviewIframe();
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    const form = this.fb.group({
      lease: new FormControl(''),
      selectedReservationId: new FormControl({ value: null, disabled: !this.selectedOffice }),
      selectedOfficeId: new FormControl({ value: null, disabled: false }),
      includeLease: new FormControl(this.includeLease),
      includeLetterOfResponsibility: new FormControl(this.includeLetterOfResponsibility),
      includeNoticeToVacate: new FormControl(this.includeNoticeToVacate),
      includeCreditCardAuthorization: new FormControl(this.includeCreditCardAuthorization),
      includeBusinessCreditApplication: new FormControl(this.includeBusinessCreditApplication),
      includeRentalCreditApplication: new FormControl(this.includeRentalCreditApplication)
    });
    return form;
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    if (this.lockOfficeSelection) {
      return;
    }

    const officeId = this.form.get('selectedOfficeId')?.value;
    if (!officeId) {
      this.selectedOffice = null;
      this.filterReservations();
      this.selectedReservation = null;
      this.form.patchValue({ selectedReservationId: null });
      this.generatePreviewIframe();
      this.officeIdChange.emit(null);
      return;
    }
    
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    this.filterReservations();
    this.selectedReservation = null;
    this.form.patchValue({ selectedReservationId: null });
    this.generatePreviewIframe();
    this.officeIdChange.emit(this.selectedOffice?.officeId || null);
  }

  onReservationSelected(reservationId: string | null): void {
    if (!reservationId) {
      this.selectedReservation = null;
      this.form.patchValue({ selectedReservationId: null });
      this.generatePreviewIframe();
      return;
    }
    
    // Load full reservation details when selected from dropdown
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.form.patchValue({ selectedReservationId: reservation.reservationId });
        if (reservation.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === reservation.officeId) || null;
          this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
        }
        this.loadContact();
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
      // Disable the reservation dropdown when no office is selected
      this.form.get('selectedReservationId')?.disable();
      return;
    }
    
    // Enable the reservation dropdown when an office is selected
    this.form.get('selectedReservationId')?.enable();
    
    // Filter reservations by office
    let filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
    
    // If reservationId is provided (coming from reservation), only show that reservation
    if (this.reservationId && this.reservationId !== '') {
      filteredReservations = filteredReservations.filter(r => r.reservationId === this.reservationId);
    }
    
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));
  }

  onIncludeCheckboxChange(): void {
    this.includeLease = this.form.get('includeLease')?.value ?? true;
    this.includeLetterOfResponsibility = this.form.get('includeLetterOfResponsibility')?.value ?? true;
    this.includeNoticeToVacate = this.form.get('includeNoticeToVacate')?.value ?? true;
    this.includeCreditCardAuthorization = this.form.get('includeCreditCardAuthorization')?.value ?? false;
    this.includeBusinessCreditApplication = this.form.get('includeBusinessCreditApplication')?.value ?? false;
    this.includeRentalCreditApplication = this.form.get('includeRentalCreditApplication')?.value ?? false;

    this.generatePreviewIframe();
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

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        if (this.officeId !== null && this.officeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (this.selectedOffice) {
            this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId });
            this.filterReservations();
          }
        } else if (this.selectedReservation?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.selectedReservation.officeId) || null;
          this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
          this.filterReservations();
        } else if (this.reservationId && this.offices.length > 0) {
          // If coming from reservation but no reservation loaded yet, try to find office from reservationId
          // This will be handled when reservation loads
        }
      });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
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
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
      return;
    }
    
    this.leaseInformationService.getLeaseInformationByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation'); })).subscribe({
      next: (response: LeaseInformationResponse) => {
        this.leaseInformation = response;
        this.generatePreviewIframe();
      },
      error: (err: HttpErrorResponse) => {
        this.leaseInformation = null;
        if (err.status !== 400) {
          this.toastr.error('Could not load lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
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

  loadReservation(): void {
    if (!this.reservationId || this.reservationId === 'new') {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
      return;
    }
    
    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'); })).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.form.patchValue({ selectedReservationId: reservation.reservationId });
        if (reservation.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === reservation.officeId) || null;
          this.form.patchValue({ selectedOfficeId: this.selectedOffice?.officeId });
          this.filterReservations(); // This will filter to only show the selected reservation
        }
        this.loadContact();
        this.generatePreviewIframe();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml'); })).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load email template at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
      this.isCompanyRental = true;
      this.form.patchValue({ includeRentalCreditApplication: false });
    } else {
      this.company = null;
      this.isCompanyRental = false;
      this.form.patchValue({ includeBusinessCreditApplication: false });
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
  getContactAddress(): string {
    if (!this.contact) return '';
    const isInternational = (this.contact as any).isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.contact.address1,
        this.contact.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.contact.address1,
        this.contact.city,
        this.contact.state,
        this.contact.zip
      ].filter(p => p);
      return parts.join(', ');
    }
  }

  getCommunityAddress(): string {
    if (!this.property) return '';
    const isInternational = (this.property as any).isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.property.address1,
        this.property.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.property.address1,
        this.property.city,
        this.property.state,
        this.property.zip
      ].filter(p => p);
      return parts.join(', ');
    }
  }

  getApartmentAddress(): string {
    if (!this.property) return '';
    const isInternational = (this.property as any).isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.property.address1,
        this.property.suite ? `#${this.property.suite}` : '',
        this.property.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
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

  getOrganizationAddress(): string {
    if (!this.organization) return '';
    const isInternational = this.organization.isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.organization.address1,
        this.organization.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.organization.address1,
        this.organization.city,
        this.organization.state,
        this.organization.zip
      ].filter(p => p);
      return parts.join(', ');
    }
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
    // Try to get display name from availableReservations, fallback to tenantName
    const reservationListItem = this.availableReservations.find(r => r.value.reservationId === this.selectedReservation.reservationId);
    const displayName = reservationListItem?.value.contactName || this.selectedReservation.tenantName || 'Unnamed Tenant';
    return `${reservationCode}: ${displayName}`;
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
      ? '$' + (this.selectedReservation.petFee || 0).toFixed(2) + '     ' + this.selectedReservation.numberOfPets.toString() + ' pet(s)    ' + 'Type(s):' + this.selectedReservation.petDescription
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

  getOrganizationNameUpper(): string {
    if (!this.organization) return '';
    const name = this.selectedOffice 
      ? this.organization.name + ' ' + this.selectedOffice.name
      : this.organization.name;
    return name.toUpperCase();
  }

  getOrganizationWebsite(): string {
     return this.selectedOffice?.website ?? this.organization?.website ?? '';
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

   getProrateDayText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'day';
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

  getResponsibleNoun(): string {
    if(!this.contact ) return '';
    return (this.contact.entityTypeId === EntityType.Company && this.company) 
      ?  'Company'
      : 'Tenant';
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
    
  getSecurityProrateText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return '$0.00';
    else 
      return '$' + (this.selectedReservation.deposit/30).toFixed(2) + ' per ' + this.getProrateDayText();
  }

  getLetterOfResponsibilityText(): string {
    if (!this.selectedReservation) return '';
     else if (this.selectedReservation.depositTypeId === DepositType.CLR) {
      return 'Corporate Letter of Responsibility';
     }
    else {
      return 'Letter of Responsibility';
    }
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
  
  getDepositLabel(): string{
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return 'Deposit';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return 'Security Deposit Waiver';
    else 
      return 'Deposit';
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

    // LAYER 0: Handle conditional sections (must be done before placeholder replacement)
    result = this.replaceConditionalSections(result);

    // LAYER 1: Replace lease information placeholders first (with their raw text values)
    result = this.replaceLeaseInformationPlaceholders(result);

    // LAYER 2: Replace all other placeholders (reservation, property, contact, organization, etc.)
    result = this.replaceAllOtherPlaceholders(result);

    return result;
  }

  replaceConditionalSections(html: string): string {
    let result = html;

    // Handle conditional section: Security Deposit Waiver (only show if depositType is SDW)
    // Pattern: {{#if depositTypeSDW}}...content...{{#else}}...else content...{{/if}}
    // The content can contain placeholders that will be replaced in later layers
    const depositTypeSDWPattern = /\{\{#if depositTypeSDW\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    result = result.replace(depositTypeSDWPattern, (match, content) => {
      // Check if there's an else clause
      const elsePattern = /\{\{#else\}\}/;
      if (elsePattern.test(content)) {
        const parts = content.split(/\{\{#else\}\}/);
        const ifContent = parts[0] || '';
        const elseContent = parts[1] || '';
        
        if (this.selectedReservation?.depositTypeId === DepositType.SDW) {
          return ifContent;
        } else {
          return elseContent;
        }
      } else {
        // No else clause - use original logic
        if (this.selectedReservation?.depositTypeId === DepositType.SDW) {
          return content;
        } else {
          return '';
        }
      }
    });

    // Handle conditional section: Partial Month Calculation (only show if billingType is Monthly)
    // Pattern: {{#if billingTypeMonthly}}...content...{{#else}}...else content...{{/if}}
    const billingTypeMonthlyPattern = /\{\{#if billingTypeMonthly\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    result = result.replace(billingTypeMonthlyPattern, (match, content) => {
      // Check if there's an else clause
      const elsePattern = /\{\{#else\}\}/;
      if (elsePattern.test(content)) {
        const parts = content.split(/\{\{#else\}\}/);
        const ifContent = parts[0] || '';
        const elseContent = parts[1] || '';
        
        if (this.selectedReservation?.billingTypeId === BillingType.Monthly) {
          return ifContent;
        } else {
          return elseContent;
        }
      } else {
        // No else clause - use original logic
        if (this.selectedReservation?.billingTypeId === BillingType.Monthly) {
          return content;
        } else {
          return '';
        }
      }
    });

    return result;
  }

  replaceLeaseInformationPlaceholders(html: string): string {
    let result = html;

    if (this.leaseInformation) {
      result = result.replace(/\{\{rentalPayment\}\}/g, this.leaseInformation.rentalPayment || '');
      result = result.replace(/\{\{securityDeposit\}\}/g, this.leaseInformation.securityDeposit || '');
      result = result.replace(/\{\{securityDepositWaiver\}\}/g, this.leaseInformation.securityDepositWaiver || '');
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
      result = result.replace(/\{\{responsiblePartyNoun\}\}/g, this.getResponsibleNoun());

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
       result = result.replace(/\{\{contactAddress\}\}/g, this.getContactAddress());
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
      result = result.replace(/\{\{securityProrateText\}\}/g, this.getSecurityProrateText());
      result = result.replace(/\{\{letterOfResponsibilityText\}\}/g, this.getLetterOfResponsibilityText());
      result = result.replace(/\{\{partialMonthText\}\}/g, this.getPartialMonthText());
      result = result.replace(/\{\{depositLabel\}\}/g, this.getDepositLabel());      
      result = result.replace(/\{\{depositText\}\}/g, this.getDepositRequirementText());
      result = result.replace(/\{\{depositText2\}\}/g, this.getDepositRequirementText2());
      result = result.replace(/\{\{reservationDate\}\}/g, this.formatterService.formatDateStringLong(new Date().toISOString()) || '');
      result = result.replace(/\{\{checkInTime\}\}/g, getCheckInTime(this.selectedReservation.checkInTimeId) || '');
      result = result.replace(/\{\{checkOutTime\}\}/g, getCheckOutTime(this.selectedReservation.checkOutTimeId) || '');
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
      result = result.replace(/\{\{daysToRefundDeposit\}\}/g, this.selectedOffice.daysToRefundDeposit.toString() || '0');
   
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
    }

    // Replace organization placeholders
    if (this.organization) {
      result = result.replace(/\{\{organization-office\}\}/g, this.getOrganizationName());
      result = result.replace(/\{\{organization-office-caps\}\}/g, this.getOrganizationNameUpper());
      result = result.replace(/\{\{organizationPhone\}\}/g, this.formatterService.phoneNumber(this.organization.phone) || '');
      result = result.replace(/\{\{organizationAddress\}\}/g, this.getOrganizationAddress());
      result = result.replace(/\{\{organizationWebsite\}\}/g, this.getOrganizationWebsite());
      result = result.replace(/\{\{organizationHref\}\}/g, this.getWebsiteWithProtocol());

      const orgLogoDataUrl = this.organization?.fileDetails?.dataUrl;
      if (orgLogoDataUrl) {
        result = result.replace(/\{\{orgLogoBase64\}\}/g, orgLogoDataUrl);
      }
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }
  //#endregion

  //#region Html Processing
  generatePreviewIframe(): void {
    // Check form control value - if null, show html, else show the lease
    const formReservationId = this.form.get('selectedReservationId')?.value;
    if (!formReservationId) {
      this.previewIframeHtml = '';
      return;
    }

    // If form control has value but missing office or reservation, don't show preview
    if (!this.selectedOffice || !this.selectedReservation) {
      this.previewIframeHtml = '';
      return;
    }

    // Load HTML files and process them
    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => {
        // Get selected checkboxes
        const selectedDocuments: string[] = [];

        if (this.includeLease && htmlFiles.lease) {
          selectedDocuments.push(htmlFiles.lease);
        }
        if (this.includeLetterOfResponsibility && htmlFiles.letterOfResponsibility) {
          selectedDocuments.push(htmlFiles.letterOfResponsibility);
        }
        if (this.includeNoticeToVacate && htmlFiles.noticeToVacate) {
          selectedDocuments.push(htmlFiles.noticeToVacate);
        }
        if (this.includeCreditCardAuthorization && htmlFiles.creditAuthorization) {
          selectedDocuments.push(htmlFiles.creditAuthorization);
        }
        if (this.includeBusinessCreditApplication && htmlFiles.creditApplication) {
          selectedDocuments.push(htmlFiles.creditApplication);
        }
        if (this.includeRentalCreditApplication && htmlFiles.rentalCreditApplication) {
          selectedDocuments.push(htmlFiles.rentalCreditApplication);
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

  stripAndReplace(html: string): string {
    return this.documentHtmlService.stripAndReplace(html);
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(result.processedHtml);
    this.iframeKey++; // Force iframe refresh
  }

  loadHtmlFiles(): Observable<{ lease: string; letterOfResponsibility: string; noticeToVacate: string; creditAuthorization: string; creditApplication: string; rentalCreditApplication: string }> {
    if (this.debuggingHtml) {
      // Load HTML from assets for faster testing
      return forkJoin({
        lease: this.includeLease ? this.http.get('assets/reservation-lease-default.html', { responseType: 'text' }) : of(''),
        letterOfResponsibility: this.includeLetterOfResponsibility ? this.http.get('assets/letter-of-responsibility.html', { responseType: 'text' }) : of(''),
        noticeToVacate: this.includeNoticeToVacate ? this.http.get('assets/notice-to-vacate.html', { responseType: 'text' }) : of(''),
        creditAuthorization: this.includeCreditCardAuthorization ? this.http.get('assets/credit-authorization.html', { responseType: 'text' }) : of(''),
        creditApplication: this.includeBusinessCreditApplication ? this.http.get('assets/credit-application-business.html', { responseType: 'text' }) : of(''),
        rentalCreditApplication: this.includeRentalCreditApplication ? this.http.get('assets/credit-application-individual.html', { responseType: 'text' }) : of('')
      });
    } else {
      // Read HTML from propertyHtml parameters
      return of({
        lease: this.includeLease ? (this.propertyHtml?.lease || '') : '',
        letterOfResponsibility: this.includeLetterOfResponsibility ? (this.propertyHtml?.letterOfResponsibility || '') : '',
        noticeToVacate: this.includeNoticeToVacate ? (this.propertyHtml?.noticeToVacate || '') : '',
        creditAuthorization: this.includeCreditCardAuthorization ? (this.propertyHtml?.creditAuthorization || '') : '',
        creditApplication: this.includeBusinessCreditApplication ? (this.propertyHtml?.creditApplicationBusiness || '') : '',
        rentalCreditApplication: this.includeRentalCreditApplication ? (this.propertyHtml?.creditApplicationIndividual || '') : '',
      });
    }
  }  
  //#endregion 

  //#region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organization: this.organization,
      selectedOffice: this.selectedOffice,
      selectedReservation: this.selectedReservation || undefined,
      propertyId: this.propertyId || null,
      contacts: this.contacts.length > 0 ? this.contacts : (this.contact ? [this.contact] : []),
      isDownloading: this.isDownloading,
      printStyleOptions: { fontSize: '10pt', includeLeaseStyles: true }
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const fileName = this.utilityService.generateDocumentFileName('lease', this.selectedReservation?.reservationCode);
    const downloadConfig: DownloadConfig = {
      fileName: fileName,
      documentType: DocumentType.ReservationLease,
      noPreviewMessage: 'Please select an office and reservation to generate the lease',
      noSelectionMessage: 'Organization or Office not available'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Please select an office and reservation to generate the lease');
  }

  override async onEmail(): Promise<void> {
    const toEmail = this.contact?.email || '';
    const toName = this.contact?.fullName || `${this.contact?.firstName || ''} ${this.contact?.lastName || ''}`.trim();
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const companyName = this.organization?.name;
    const companyPhone = this.formatterService.phoneNumber(this.organization?.phone) || '';
    const plainTextContent = '';
    const attachmentFileName = this.utilityService.generateDocumentFileName('lease', this.selectedReservation?.reservationCode);
    const reservationCode = this.selectedReservation?.reservationCode;

    const emailSubject = this.emailHtml?.leaseSubject?.trim()
       .replace(/\{\{reservationCode\}\}/g, reservationCode || '');
    const emailBodyHtml = (this.emailHtml?.lease || '')
      .replace(/\{\{toName\}\}/g, toName)
      .replace(/\{\{companyName\}\}/g, companyName || '')
      .replace(/\{\{companyPhone\}\}/g, companyPhone || '');

    const emailConfig: EmailConfig = {
      subject: emailSubject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.ReservationLease,
      plainTextContent,
      htmlContent: emailBodyHtml,
      fileDetails: {
        fileName: attachmentFileName,
        contentType: 'application/pdf',
        file: ''
      }
    };

    await super.onEmail(emailConfig);
  }
  //#endregion

  //#region Utility Methods
  get isOfficeSelectionLocked(): boolean {
    return this.lockOfficeSelection;
  }

  private applyOfficeSelectionLockState(): void {
    const officeControl = this.form?.get('selectedOfficeId');
    if (!officeControl) {
      return;
    }

    if (this.lockOfficeSelection) {
      officeControl.disable({ emitEvent: false });
    } else {
      officeControl.enable({ emitEvent: false });
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

