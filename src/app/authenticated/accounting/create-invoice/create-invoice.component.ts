import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationListResponse, ReservationResponse } from '../../reservation/models/reservation-model';
import { PropertyHtmlService } from '../../property/services/property-html.service';
import { PropertyHtmlResponse } from '../../property/models/property-html.model';
import { AccountingService } from '../services/accounting.service';
import { InvoiceResponse } from '../models/invoice.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { BehaviorSubject, Observable, map, finalize, take, filter, Subscription, forkJoin, of } from 'rxjs';
import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { UtilityService } from '../../../services/utility.service';
import { FormatterService } from '../../../services/formatter-service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentType } from '../../documents/models/document.enum';
import { CommonService } from '../../../services/common.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { AuthService } from '../../../services/auth.service';
import { PropertyHtmlRequest } from '../../property/models/property-html.model';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { AccountingOfficeService } from '../../organization-configuration/accounting/services/accounting-office.service';
import { AccountingOfficeResponse } from '../../organization-configuration/accounting/models/accounting-office.model';
import { EntityType } from '../../contact/models/contact-enum';
import { CompanyResponse } from '../../company/models/company.model';
import { CompanyService } from '../../company/services/company.service';

@Component({
  selector: 'app-create-invoice',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './create-invoice.component.html',
  styleUrls: ['./create-invoice.component.scss']
})
export class CreateInvoiceComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent

  form: FormGroup;
  organization: OrganizationResponse | null = null;
  contacts: ContactResponse[] = [];
  contact: ContactResponse | null = null;
  company: CompanyResponse | null = null;
  isCompanyRental: boolean = false;

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officesSubscription?: Subscription;

  accountingOffices: AccountingOfficeResponse[] = [];
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  accountingOfficesSubscription?: Subscription;
  
  accountingOfficeLogo: string = '';
  officeLogo: string = '';
  orgLogo: string = '';
 
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;

  invoices: InvoiceResponse[] = [];
  availableInvoices: { value: InvoiceResponse, label: string }[] = [];
  selectedInvoice: InvoiceResponse | null = null;
  
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  isSubmitting: boolean = false;
  debuggingHtml: boolean = true;


  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices', 'reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyHtmlService: PropertyHtmlService,
    private accountingService: AccountingService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private commonService: CommonService,
    private contactService: ContactService,
    private companyService: CompanyService,
    private http: HttpClient,
    private authService: AuthService,
    private documentReloadService: DocumentReloadService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    private accountingOfficeService: AccountingOfficeService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  //#region Create Invoice Methods
  ngOnInit(): void {
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadReservations();
    this.loadOrganization();
    this.loadContacts();
    
    // Wait for all items to load before proceeding
    this.isLoading$.pipe(filter(isLoading => !isLoading),take(1)).subscribe(() => {
      // In debug mode, load HTML from assets immediately
      if (this.debuggingHtml) {
        this.http.get('assets/invoice.html', { responseType: 'text' }).pipe(take(1)).subscribe({
          next: (html: string) => {
            if (html) {
              this.form.patchValue({ invoice: html });
            }
          },
          error: () => {
           }
        });
      }
      
      forkJoin([
        this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)),
        this.accountingOfficeService.areAccountingOfficesLoaded().pipe(filter(loaded => loaded === true), take(1))]).subscribe(() => {
        if (this.officeId !== null) {
          this.applyOfficeSelection(this.officeId);
        }
        // Then wait for reservations to load
        if (this.reservationId !== null) {
          this.reservationService.getReservationList().pipe(take(1)).subscribe(() => {
            this.applyReservationSelection(this.reservationId);
          });
        }
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle officeId changes from parent
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      const newOfficeId = changes['officeId'].currentValue;
      if (newOfficeId !== (this.selectedOffice?.officeId ?? null)) {
        this.applyOfficeSelection(newOfficeId);
      }
    }
    
    // Handle reservationId changes from parent
    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      const newReservationId = changes['reservationId'].currentValue;
      if (newReservationId !== (this.selectedReservation?.reservationId ?? null)) {
        this.applyReservationSelection(newReservationId);
      }
    }
  }

  saveInvoice(): void {
    if (!this.property?.propertyId) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;

    // Create and initialize PropertyHtmlRequest
    const propertyHtmlRequest: PropertyHtmlRequest = {
      propertyId: this.property.propertyId,
      organizationId: this.authService.getUser()?.organizationId || '',
      welcomeLetter: this.propertyHtml?.welcomeLetter || '',
      inspectionChecklist: this.propertyHtml?.inspectionChecklist || '',
      lease: this.propertyHtml?.lease || '',
      letterOfResponsibility: this.propertyHtml?.letterOfResponsibility || '',
      noticeToVacate: this.propertyHtml?.noticeToVacate || '',
      creditAuthorization: this.propertyHtml?.creditAuthorization || '',
      creditApplicationBusiness: this.propertyHtml?.creditApplicationBusiness || '',
      creditApplicationIndividual: this.propertyHtml?.creditApplicationIndividual || '',
      invoice: formValue.invoice || '',
    };

    // Save the HTML using upsert
    this.propertyHtmlService.upsertPropertyHtml(propertyHtmlRequest).pipe(take(1)).subscribe({
      next: (response) => {
        this.propertyHtml = response;
        this.toastr.success('Invoice saved successfully', 'Success');
        this.isSubmitting = false;
        this.iframeKey++; // Force iframe refresh
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not save invoice at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.isSubmitting = false;
      }
    });
  }

  saveInvoiceAsDocument(): void {
    if (!this.selectedOffice) {
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles
    );
    const invoiceCode = this.selectedInvoice?.invoiceName?.replace(/[^a-zA-Z0-9]/g, '') || this.selectedInvoice?.invoiceId || 'Invoice';
    const fileName = `Invoice_${invoiceCode}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization?.organizationId || '',
      officeId: this.selectedOffice.officeId,
      officeName: this.selectedOffice.name,
      propertyId: this.property?.propertyId || null,
      reservationId: this.selectedReservation?.reservationId || null,
      documentType: DocumentType.Other,
      fileName: fileName
    };

    this.documentService.generate(generateDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        this.toastr.success('Document generated successfully', 'Success');
        this.isSubmitting = false;
        this.iframeKey++; // Force iframe refresh
        
        // Trigger document list reload
        this.documentReloadService.triggerReload();
      },
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Document generation failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        console.error('Document save error:', err);
        this.isSubmitting = false;
        this.iframeKey++; // Force iframe refresh
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      selectedOfficeId: new FormControl(null),
      selectedReservationId: new FormControl({ value: null, disabled: true }),
      selectedInvoiceId: new FormControl({ value: null, disabled: true }),
      invoice: new FormControl('')
    });
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');})).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
      });
    });
  }

  loadAccountingOffices(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'accountingOffices');
    this.accountingOfficeService.areAccountingOfficesLoaded().pipe(filter(loaded => loaded === true), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'); })).subscribe(() => {
      this.accountingOffices = this.accountingOfficeService.getAllAccountingOfficesValue();
      this.accountingOfficesSubscription = this.accountingOfficeService.getAllAccountingOffices().subscribe(accountingOffices => {
        this.accountingOffices = accountingOffices || [];
      });
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

  loadInvoicesForReservation(reservationId: string): void {
    if (!this.selectedOffice) {
      this.invoices = [];
      this.availableInvoices = [];
      return;
    }

    // Get all invoices and filter by office and reservation
    this.accountingService.getInvoicesByOffice().pipe(take(1)).subscribe({
      next: (invoices: InvoiceResponse[]) => {
        // Filter invoices by the selected office and reservation
        this.invoices = (invoices || []).filter(inv => 
          inv.officeId === this.selectedOffice.officeId && inv.reservationId === reservationId
        );
        this.availableInvoices = this.invoices.map(inv => ({
          value: inv,
          label: inv.invoiceName || `Invoice ${inv.invoiceId}`
        }));
        
        if (this.invoices.length === 0) {
          this.toastr.info('No invoices found for this reservation.', 'No Invoices');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.invoices = [];
        this.availableInvoices = [];
        if (err.status !== 404 && err.status !== 400) {
          this.toastr.error('Could not load invoices.', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadInvoice(): void {
    if (!this.selectedInvoice?.invoiceId) {
      return;
    }

    this.accountingService.getInvoiceByGuid(this.selectedInvoice.invoiceId).pipe(take(1)).subscribe({
      next: (response: InvoiceResponse) => {
        this.selectedInvoice = response;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load invoice.', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadProperty(propertyId: string): void {
    if (!propertyId) {
      this.property = null;
      return;
    }

    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        if (this.selectedInvoice && this.selectedOffice && this.selectedReservation) {
          this.loadInvoiceHtml();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property info.', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadPropertyHtml(): void {
    if (!this.property) {
      return;
    }

    this.propertyHtmlService.getPropertyHtmlByPropertyId(this.property.propertyId).pipe(take(1)).subscribe({
      next: (response: PropertyHtmlResponse) => {
        this.propertyHtml = response;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load property HTML.', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadInvoiceHtml(): void {
    if (this.debuggingHtml) {
      // Load HTML from assets for faster testing
      this.http.get('assets/invoice.html', { responseType: 'text' }).pipe(take(1)).subscribe({
        next: (html: string) => {
          if (html) {
            // Update form control with raw HTML
            this.form.patchValue({ invoice: html });
            if (this.selectedInvoice && this.selectedOffice && this.selectedReservation) {
              const processedHtml = this.replacePlaceholders(html);
              this.processAndSetHtml(processedHtml);
            }
          } else {
            this.previewIframeHtml = '';
            this.toastr.warning('No invoice HTML template found in assets.', 'No Template');
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not load invoice HTML from assets.', CommonMessage.ServiceError);
          }
          this.clearPreview();
        }
      });
      return;
    }

    // Production mode: load from API
    if (!this.property?.propertyId) {
      this.previewIframeHtml = '';
      return;
    }

    this.propertyHtmlService.getPropertyHtmlByPropertyId(this.property.propertyId).pipe(take(1)).subscribe({
      next: (response: PropertyHtmlResponse) => {
        if (response && response.invoice) {
          this.propertyHtml = response;
          // Update form control with raw HTML
          this.form.patchValue({ invoice: response.invoice });
          const processedHtml = this.replacePlaceholders(response.invoice);
          this.processAndSetHtml(processedHtml);
        } else {
          this.clearPreview();
          this.toastr.warning('No invoice HTML template found for this property.', 'No Template');
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load invoice HTML.', CommonMessage.ServiceError);
        }
        this.previewIframeHtml = '';
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe({
      next: (org: OrganizationResponse | null) => {
        this.organization = org;
        this.updateOrgLogo();
      }
    });
  }

  loadContacts(): void {
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1)).subscribe(contacts => {
        this.contacts = contacts || [];
      });
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
    } else {
      this.company = null;
      this.isCompanyRental = false;
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

  //#region Logo Update Methods
  updateAccountingOfficeLogo(): void {
    if (this.selectedAccountingOffice?.fileDetails?.dataUrl) {
      this.accountingOfficeLogo = this.selectedAccountingOffice.fileDetails.dataUrl;
    } else if (this.selectedAccountingOffice?.fileDetails?.file && this.selectedAccountingOffice?.fileDetails?.contentType) {
      this.accountingOfficeLogo = `data:${this.selectedAccountingOffice.fileDetails.contentType};base64,${this.selectedAccountingOffice.fileDetails.file}`;
    } else {
      this.accountingOfficeLogo = '';
    }
  }

  updateOfficeLogo(): void {
    if (this.selectedOffice?.fileDetails?.dataUrl) {
      this.officeLogo = this.selectedOffice.fileDetails.dataUrl;
    } else if (this.selectedOffice?.fileDetails?.file && this.selectedOffice?.fileDetails?.contentType) {
      this.officeLogo = `data:${this.selectedOffice.fileDetails.contentType};base64,${this.selectedOffice.fileDetails.file}`;
    } else {
      this.officeLogo = '';
    }
  }

  updateOrgLogo(): void {
    if (this.organization?.fileDetails?.dataUrl) {
      this.orgLogo = this.organization.fileDetails.dataUrl;
    } else if (this.organization?.fileDetails?.file && this.organization?.fileDetails?.contentType) {
      this.orgLogo = `data:${this.organization.fileDetails.contentType};base64,${this.organization.fileDetails.file}`;
    } else {
      this.orgLogo = '';
    }
  }
  //#endregion

  //#region Form Response Methods
  onOfficeSelected(officeId: number | null): void {
    if (!officeId) {
      this.selectedOffice = null;
      this.updateOfficeLogo();
      this.selectedAccountingOffice = null;
      this.updateAccountingOfficeLogo();
      this.availableReservations = [];
      this.availableInvoices = [];
      this.selectedReservation = null;
      this.selectedInvoice = null;
      this.form.patchValue({ selectedReservationId: null, selectedInvoiceId: null });
      this.form.get('selectedReservationId')?.disable();
      this.form.get('selectedInvoiceId')?.disable();
      this.clearPreview();
      this.officeIdChange.emit(null);
      return;
    }
    
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    this.updateOfficeLogo();
    this.selectedAccountingOffice = this.accountingOffices.find(ao => ao.officeId === officeId) || null;
    this.updateAccountingOfficeLogo();
    this.filterReservations();
    this.availableInvoices = [];
    this.selectedInvoice = null;
    this.form.patchValue({ selectedInvoiceId: null });
    this.form.get('selectedReservationId')?.enable();
    this.form.get('selectedInvoiceId')?.disable();
    this.previewIframeHtml = '';
    this.officeIdChange.emit(officeId);
  }

  onReservationSelected(reservationId: string | null): void {
    if (!reservationId) {
      this.selectedReservation = null;
      this.contact = null;
      this.availableInvoices = [];
      this.selectedInvoice = null;
      this.form.patchValue({ selectedInvoiceId: null });
      this.form.get('selectedInvoiceId')?.disable();
      this.clearPreview();
      this.reservationIdChange.emit(null);
      return;
    }
    
    // Load full reservation details
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.loadContact(); // Load contact from reservation
        this.loadProperty(reservation.propertyId);
        this.loadInvoicesForReservation(reservationId);
        this.form.get('selectedInvoiceId')?.enable();
        this.reservationIdChange.emit(reservationId);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation details.', CommonMessage.ServiceError);
        }
      }
    });
  }

  onInvoiceSelected(invoiceId: string | null): void {
    if (!invoiceId) {
      this.selectedInvoice = null;
      this.previewIframeHtml = '';
      return;
    }
    
    this.selectedInvoice = this.invoices.find(i => i.invoiceId === invoiceId) || null;
    if (this.selectedInvoice && this.selectedOffice && this.selectedReservation && this.property) {
      // If HTML is already in the form control (from textarea editing), use it
      const formHtml = this.form.value.invoice;
      if (formHtml && formHtml.trim()) {
        const processedHtml = this.replacePlaceholders(formHtml);
        this.processAndSetHtml(processedHtml);
      } else {
        // Otherwise load from API/assets
        this.loadInvoiceHtml();
      }
    }
  }

  filterReservations(): void {
    if (!this.selectedOffice) {
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));
  }

  applyOfficeSelection(officeId: number | null): void {
    if (officeId === null) {
      this.selectedOffice = null;
      this.updateOfficeLogo();
      this.selectedAccountingOffice = null;
      this.updateAccountingOfficeLogo();
      this.form.patchValue({ selectedOfficeId: null }, { emitEvent: false });
      this.availableReservations = [];
      this.availableInvoices = [];
      this.selectedReservation = null;
      this.selectedInvoice = null;
      this.clearPreview();
      return;
    }
    
    const office = this.offices.find(o => o.officeId === officeId);
    if (office) {
      this.selectedOffice = office;
      this.updateOfficeLogo();
      this.selectedAccountingOffice = this.accountingOffices.find(ao => ao.officeId === officeId) || null;
      this.updateAccountingOfficeLogo();
      this.form.patchValue({ selectedOfficeId: officeId }, { emitEvent: false });
      this.filterReservations();
    }
  }

  applyReservationSelection(reservationId: string | null): void {
    if (reservationId === null) {
      this.selectedReservation = null;
      this.form.patchValue({ selectedReservationId: null }, { emitEvent: false });
      this.availableInvoices = [];
      this.selectedInvoice = null;
      this.form.get('selectedInvoiceId')?.disable();
      this.previewIframeHtml = '';
      return;
    }
    
    // Wait for reservations to load if not already loaded
    if (this.reservations.length === 0) {
      this.reservationService.getReservationList().pipe(take(1)).subscribe({
        next: (reservations) => {
          this.reservations = reservations || [];
          this.filterReservations();
          this.applyReservationSelection(reservationId); // Retry after reservations are loaded
        }
      });
      return;
    }
    
    const reservation = this.reservations.find(r => r.reservationId === reservationId);
    if (reservation) {
      // Load full reservation details
      this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
        next: (fullReservation: ReservationResponse) => {
          this.selectedReservation = fullReservation;
          this.loadContact(); // Load contact from reservation
          this.form.patchValue({ selectedReservationId: reservationId }, { emitEvent: false });
          this.form.get('selectedInvoiceId')?.enable();
          if (this.selectedOffice) {
            this.loadInvoicesForReservation(reservationId);
            this.loadProperty(fullReservation.propertyId);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not load reservation details.', CommonMessage.ServiceError);
          }
        }
      });
    }
  }
  //#endregion

  //#region Form Replacement Methods
  replacePlaceholders(html: string): string {
    let result = html;

    // Replace invoice placeholders
    if (this.selectedInvoice) {
      result = result.replace(/\{\{invoiceName\}\}/g, this.selectedInvoice.invoiceName || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '');
      result = result.replace(/\{\{dueDate\}\}/g, this.selectedInvoice.dueDate ? this.formatterService.formatDateString(this.selectedInvoice.dueDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.totalAmount || 0));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.paidAmount || 0));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency((this.selectedInvoice.totalAmount || 0) - (this.selectedInvoice.paidAmount || 0)));
    }

    // Replace reservation placeholders
    if (this.selectedReservation) {
      result = result.replace(/\{\{tenantName\}\}/g, this.selectedReservation.tenantName || '');
      result = result.replace(/\{\{reservationCode\}\}/g, this.selectedReservation.reservationCode || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateString(this.selectedReservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateString(this.selectedReservation.departureDate) || '');
    }

    // Replace contact placeholders
    if (this.contact) {
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
        result = result.replace(/\{\{contactAddress\}\}/g, this.getCompanyAddress() || '');

      } else {
        // Use contact address
        result = result.replace(/\{\{contactAddress1\}\}/g, this.contact.address1 || '');
        result = result.replace(/\{\{contactAddress2\}\}/g, this.contact.address2 || '');
        result = result.replace(/\{\{contactCity\}\}/g, this.contact.city || '');
        result = result.replace(/\{\{contactState\}\}/g, this.contact.state || '');
        result = result.replace(/\{\{contactZip\}\}/g, this.contact.zip || '');
        result = result.replace(/\{\{contactAddress\}\}/g, this.getContactAddress() || '');
      }
    }

    // Replace contact placeholders
    if (this.company) {
       result = result.replace(/\{\{companyName\}\}/g, this.company.name || '');
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, this.property.propertyCode || '');
      result = result.replace(/\{\{propertyAddress\}\}/g, this.getPropertyAddress() || '');
      result = result.replace(/\{\{propertySuite\}\}/g, this.property.suite || '');
    }

    // Replace office placeholders
    if (this.selectedOffice) {
      result = result.replace(/\{\{officeName\}\}/g, this.selectedOffice.name || '');
    }

    // Replace office logo placeholder - prefer accounting office logo, fallback to office logo, then org logo
    const officeLogoDataUrl = this.accountingOfficeLogo || this.officeLogo || this.orgLogo;
    if (officeLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoDataUrl);
    }

    // Replace organization logo placeholder
    if (this.orgLogo) {
      result = result.replace(/\{\{orgLogoBase64\}\}/g, this.orgLogo);
    }

    // Remove img tags that contain logo placeholders if no logo is available
    if (!officeLogoDataUrl && !this.orgLogo) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace accounting office placeholders
    if (this.selectedAccountingOffice) {
      result = result.replace(/\{\{accountingOfficeName\}\}/g, this.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.selectedAccountingOffice.address1 || '');
      result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, this.selectedAccountingOffice.city + ', ' + this.selectedAccountingOffice.state + ' ' + this.selectedAccountingOffice.zip|| '');
      result = result.replace(/\{\{accountingOfficeEmail\}\}/g, this.selectedAccountingOffice.email || '');
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  getCompanyAddress(): string {
    if (!this.company) return '';
      let address = this.company.address1 + ' ' + this.company.city + ', ' +  this.company.state + ' ' +   this.company.zip
      return address
     }

  getContactAddress(): string {
    if (!this.contact) return '';
    let address = this.contact.address1 + ' ' + this.contact.city + ', ' +  this.contact.state + ' ' +   this.contact.zip;
    return address
  }

  getPropertyAddress(): string {
    if (!this.property) return '';
    let address =  this.property.address1 + ' ' + this.property.city + ', ' +  this.property.state + ' ' +   this.property.zip
    return address 
  }
  //#endregion

  //#region Html Processing
  generatePreviewIframe(): void {
    // Only generate preview if both office and reservation are selected
    if (!this.selectedOffice || !this.selectedReservation) {
      this.clearPreview();
      return;
    }

    // Load HTML files and process them
    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => {
        // Always include welcome letter
        const selectedDocuments: string[] = [];

        if (htmlFiles.invoice) {
          selectedDocuments.push(htmlFiles.invoice);
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
          this.clearPreview();
        }
      },
      error: () => {
        this.clearPreview();
      }
    });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(result.processedHtml);
    this.iframeKey++; // Force iframe refresh
  }

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.previewIframeStyles = '';
  }

  stripAndReplace(html: string): string {
    return this.documentHtmlService.stripAndReplace(html);
  }

  loadHtmlFiles(): Observable<{ invoice: string}> {
    if (this.debuggingHtml) {
      // Load HTML from assets for faster testing
      return forkJoin({
        invoice: this.http.get('assets/invoice.html', { responseType: 'text' })
      });
    } else {
      // Read HTML from propertyHtml parameters - always include welcome letter
      return of({
        invoice: this.propertyHtml?.invoice || ''
      });
    }
  }
  //#endregion

  // #region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organization: this.organization,
      selectedOffice: this.selectedOffice,
      selectedReservation: this.selectedReservation || undefined,
      propertyId: this.property?.propertyId || null,
      contacts: this.contacts,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }
 
  override async onDownload(): Promise<void> {
    if (!this.selectedInvoice) {
      this.toastr.warning('Please select an Invoice', 'No Invoice');
      return;
    }

    const invoiceCode = this.selectedInvoice.invoiceName?.replace(/[^a-zA-Z0-9]/g, '') || this.selectedInvoice.invoiceId;
    const fileName = `Invoice_${invoiceCode}_${new Date().toISOString().split('T')[0]}.pdf`;

    const downloadConfig: DownloadConfig = {
      fileName: fileName,
      documentType: DocumentType.Other,
      noPreviewMessage: 'Please select an Office, Reservation, and Invoice to generate the invoice',
      noSelectionMessage: 'Organization, Office, or Invoice not available'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Please select an Office, Reservation, and Invoice to generate the invoice');
  }

  override async onEmail(): Promise<void> {
    const emailConfig: EmailConfig = {
      subject: `Invoice: ${this.selectedInvoice?.invoiceName || 'Invoice'}`,
      noPreviewMessage: 'Please select an Office, Reservation, and Invoice to generate the invoice',
      noEmailMessage: 'No email address found for this reservation'
    };

    await super.onEmail(emailConfig);
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
