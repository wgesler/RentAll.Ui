import { CommonModule, AsyncPipe } from '@angular/common';
import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ReservationListResponse, ReservationResponse } from '../../reservations/models/reservation-model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { AccountingService } from '../services/accounting.service';
import { InvoiceResponse } from '../models/invoice.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { BehaviorSubject, Observable, map, finalize, take, filter, Subscription, forkJoin, of, firstValueFrom } from 'rxjs';
import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { UtilityService } from '../../../services/utility.service';
import { FormatterService } from '../../../services/formatter-service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentType } from '../../documents/models/document.enum';
import { CommonService } from '../../../services/common.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { ContactService } from '../../contacts/services/contact.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { AuthService } from '../../../services/auth.service';
import { PropertyHtmlRequest } from '../../properties/models/property-html.model';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';
import { getBillingMethod } from '../../reservations/models/reservation-enum';
import { RouterUrl } from '../../../app.routes';

@Component({
  selector: 'app-invoice-create',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe],
  templateUrl: './invoice-create.component.html',
  styleUrls: ['./invoice-create.component.scss']
})
export class InvoiceCreateComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Input() invoiceId: string | null = null; // Input to accept invoiceId from parent
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
  
  companyId: string | null = null; // Store companyId from query params

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
    private accountingOfficeService: AccountingOfficeService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  //#region Create Invoice Methods
  ngOnInit(): void {
    // Read query params if component is used standalone (not via @Input)
    // Use forkJoin to ensure query params are read before proceeding
    forkJoin({
      queryParams: this.route.queryParams.pipe(take(1))
    }).subscribe(({ queryParams }) => {
      if (queryParams['officeId'] && this.officeId === null) {
        const officeId = parseInt(queryParams['officeId'], 10);
        if (!isNaN(officeId)) {
          this.officeId = officeId;
        }
      }

      if (queryParams['companyId']) {
        this.companyId = queryParams['companyId'];
      }
      if (queryParams['reservationId'] && this.reservationId === null) {
        this.reservationId = queryParams['reservationId'];
      }
      if (queryParams['invoiceId'] && this.invoiceId === null) {
        this.invoiceId = queryParams['invoiceId'];
      }
      
      this.loadOffices();
      this.loadAccountingOffices();
      this.loadReservations();
      this.loadOrganization();
      this.loadContacts();
      
      // Wait for all items to load before proceeding
      this.isLoading$.pipe(filter(isLoading => !isLoading),take(1)).subscribe(() => {
      // In debug mode, load HTML from assets immediately ONLY if we don't have all 3 parameters
      const hasAllParams = this.officeId !== null && this.reservationId !== null && this.invoiceId !== null;
      if (this.debuggingHtml && !hasAllParams) {
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
            // After reservation is selected, if invoiceId is provided, select it
            if (this.invoiceId !== null) {
              setTimeout(() => {
                this.selectInvoiceAfterDataLoad(this.invoiceId);
              }, 500);
            }
          });
        } else if (this.invoiceId !== null) {
          // InvoiceId provided but no reservationId - need to get invoice first to find reservation
          this.loadInvoiceByIdFirst(this.invoiceId);
        }
      });
    });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle officeId changes from parent (including first change for initial sync)
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      if (newOfficeId !== (this.selectedOffice?.officeId ?? null)) {
        this.applyOfficeSelection(newOfficeId);
      }
    }
    
    // Handle reservationId changes from parent (including first change for initial sync)
    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      if (newReservationId !== (this.selectedReservation?.reservationId ?? null)) {
        this.applyReservationSelection(newReservationId);
      }
    }
    
    // Handle invoiceId changes from parent (including first change for initial sync)
    if (changes['invoiceId']) {
      const newInvoiceId = changes['invoiceId'].currentValue;
      if (newInvoiceId && newInvoiceId !== (this.selectedInvoice?.invoiceId ?? null)) {
        // Ensure office and reservation are loaded first, then load invoices, then select invoice
        this.selectInvoiceAfterDataLoad(newInvoiceId);
      }
    }
  }

  async saveInvoice(): Promise<void> {
    if (!this.selectedOffice || !this.selectedReservation || !this.selectedInvoice) {
      this.toastr.warning('Please select an office, reservation, and invoice to generate the invoice', 'Missing Selection');
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;
    try {
      // Ensure we have all required data
      await this.ensureAllDataLoaded();

      // Check if we have property HTML template
      if (!this.propertyHtml?.invoice) {
        throw new Error('Property does not have invoice template');
      }

      // Process HTML and replace placeholders
      const processedHtml = this.replacePlaceholders(this.propertyHtml.invoice);
      const processed = this.documentHtmlService.processHtml(processedHtml, true);
      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(processed.processedHtml, processed.extractedStyles);

      // Generate file name
      const invoiceCode = this.selectedInvoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice.invoiceId || 'Invoice';
      const fileName = this.utilityService.generateDocumentFileName('invoice', invoiceCode);

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: this.organization?.organizationId || '',
        officeId: this.selectedOffice.officeId,
        officeName: this.selectedOffice.name,
        propertyId: this.property?.propertyId || null,
        reservationId: this.selectedReservation.reservationId || null,
        documentTypeId: Number(DocumentType.Invoice),
        fileName: fileName
      };

      const documentResponse = await firstValueFrom(this.documentService.generate(generateDto));
      this.toastr.success('Document generated successfully', 'Success');
      this.isSubmitting = false;
      this.iframeKey++; // Force iframe refresh
      
      // Trigger document list reload
      this.documentReloadService.triggerReload();
    } catch (err: any) {
      this.toastr.error('Document generation failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
      console.error('Document save error:', err);
      this.isSubmitting = false;
      this.iframeKey++; // Force iframe refresh
    }
  }

  async ensureAllDataLoaded(): Promise<void> {
    // Load full reservation if we only have list response
    if (!('propertyId' in this.selectedReservation!) || !this.selectedReservation.propertyId) {
      const fullReservation = await firstValueFrom(
        this.reservationService.getReservationByGuid(this.selectedReservation!.reservationId).pipe(take(1))
      );
      this.selectedReservation = fullReservation;
    }

    const reservation = this.selectedReservation as ReservationResponse;

    // Load property if not provided
    if (!this.property && reservation.propertyId) {
      this.property = await firstValueFrom(
        this.propertyService.getPropertyByGuid(reservation.propertyId).pipe(take(1))
      );
    }

    // Load property HTML if not provided
    if (!this.propertyHtml && reservation.propertyId) {
      this.propertyHtml = await firstValueFrom(
        this.propertyHtmlService.getPropertyHtmlByPropertyId(reservation.propertyId).pipe(take(1))
      );
    }

    // Load contact if not provided
    if (!this.contact && reservation.contactId) {
      const contacts = await firstValueFrom(this.contactService.getAllContacts().pipe(take(1)));
      this.contact = contacts.find(c => c.contactId === reservation.contactId) || null;
    }

    // Load company if contact is a company
    if (this.contact && this.contact.entityTypeId === EntityType.Company && this.contact.entityId && !this.company) {
      this.company = await firstValueFrom(this.companyService.getCompanyByGuid(this.contact.entityId).pipe(take(1)));
    }

    // Load accounting office if not provided
    if (!this.selectedAccountingOffice) {
      const accountingOffices = await firstValueFrom(this.accountingOfficeService.getAllAccountingOffices().pipe(take(1)));
      this.selectedAccountingOffice = accountingOffices.find(ao => ao.officeId === this.selectedOffice!.officeId) || null;
      this.updateAccountingOfficeLogo();
    }

    // Load organization if not provided
    if (!this.organization) {
      this.organization = await firstValueFrom(this.commonService.getOrganization().pipe(take(1)));
      this.updateOrgLogo();
    }

    // Ensure logos are updated
    if (!this.officeLogo) {
      this.updateOfficeLogo();
    }
    if (!this.accountingOfficeLogo && this.selectedAccountingOffice) {
      this.updateAccountingOfficeLogo();
    }
    if (!this.orgLogo && this.organization) {
      this.updateOrgLogo();
    }
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

    // Get invoices by office and filter by reservation
    if (!this.selectedOffice?.officeId) {
      this.availableInvoices = [];
      return;
    }
    this.accountingService.getInvoicesByOffice(this.selectedOffice.officeId).pipe(take(1)).subscribe({
      next: (invoices: InvoiceResponse[]) => {
        // Filter invoices by the selected reservation
        this.invoices = (invoices || []).filter(inv => 
          inv.reservationId === reservationId
        );
        this.availableInvoices = this.invoices.map(inv => ({
          value: inv,
          label: inv.invoiceCode || `Invoice ${inv.invoiceId}`
        }));
        
        // After loading invoices, if invoiceId is provided, select it
        if (this.invoiceId && this.invoices.length > 0) {
          const invoiceToSelect = this.invoices.find(i => i.invoiceId === this.invoiceId);
          if (invoiceToSelect) {
            this.onInvoiceSelected(this.invoiceId);
          }
        }
        
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

  loadInvoiceByIdFirst(invoiceId: string): void {
    // Load invoice first to get office and reservation info
    this.accountingService.getInvoiceByGuid(invoiceId).pipe(take(1)).subscribe({
      next: (invoice: InvoiceResponse) => {
        // Set office and reservation from invoice
        if (invoice.officeId && !this.selectedOffice) {
          this.applyOfficeSelection(invoice.officeId);
        }
        if (invoice.reservationId && !this.selectedReservation) {
          // Wait for reservations to load, then select
          this.reservationService.getReservationList().pipe(take(1)).subscribe(() => {
            this.applyReservationSelection(invoice.reservationId);
            // After reservation is selected, select the invoice
            setTimeout(() => {
              this.selectInvoiceAfterDataLoad(invoiceId);
            }, 500);
          });
        } else if (invoice.reservationId) {
          // Reservation already selected, just select invoice
          setTimeout(() => {
            this.selectInvoiceAfterDataLoad(invoiceId);
          }, 500);
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Could not load invoice.', CommonMessage.ServiceError);
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
        // Regenerate preview with ledger lines if all required data is available
        if (this.selectedOffice && this.selectedReservation && this.property) {
          const formHtml = this.form.value.invoice;
          if (formHtml && formHtml.trim()) {
            const processedHtml = this.replacePlaceholders(formHtml);
            this.processAndSetHtml(processedHtml);
          } else {
            this.loadInvoiceHtml();
          }
        }
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
      this.form.patchValue({ selectedOfficeId: null, selectedReservationId: null, selectedInvoiceId: null }, { emitEvent: false });
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
    // Update form control to sync dropdown (emitEvent: false to avoid triggering selectionChange event)
    this.form.patchValue({ selectedOfficeId: officeId }, { emitEvent: false });
    this.filterReservations();
    this.availableInvoices = [];
    this.selectedInvoice = null;
    this.form.patchValue({ selectedInvoiceId: null });
    this.form.get('selectedReservationId')?.enable();
    this.form.get('selectedInvoiceId')?.disable();
    this.previewIframeHtml = '';
    this.officeIdChange.emit(officeId);
    
    // After office is selected, if we have reservationId and invoiceId, ensure they're loaded
    if (this.reservationId && this.invoiceId && this.selectedReservation) {
      // Reservation is already selected, load invoices and select invoice
      setTimeout(() => {
        if (this.invoices.length === 0 && this.selectedReservation) {
          this.loadInvoicesForReservation(this.selectedReservation.reservationId);
        } else if (this.invoices.length > 0) {
          this.onInvoiceSelected(this.invoiceId);
        }
      }, 300);
    }
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
      this.clearPreview();
      return;
    }
    
    // Find invoice from list first
    this.selectedInvoice = this.invoices.find(i => i.invoiceId === invoiceId) || null;
    
    // Update form control
    if (this.selectedInvoice) {
      this.form.patchValue({ selectedInvoiceId: invoiceId }, { emitEvent: false });
      this.form.get('selectedInvoiceId')?.enable();
    }
    
    // Load full invoice details including ledger lines
    if (this.selectedInvoice) {
      this.loadInvoice();
    }
  }

  selectInvoiceAfterDataLoad(invoiceId: string): void {
    // If we have office and reservation, try to load invoices and select
    if (this.selectedOffice && this.selectedReservation) {
      // Check if invoices are already loaded
      if (this.invoices.length > 0) {
        this.onInvoiceSelected(invoiceId);
      } else {
        // Load invoices for this reservation, then select
        this.loadInvoicesForReservation(this.selectedReservation.reservationId);
        // Wait a moment for invoices to load, then select
        setTimeout(() => {
          if (this.invoices.length > 0) {
            this.onInvoiceSelected(invoiceId);
          } else {
            // If still not loaded, try again after a longer delay
            setTimeout(() => {
              if (this.invoices.length > 0) {
                this.onInvoiceSelected(invoiceId);
              }
            }, 1000);
          }
        }, 500);
      }
    } else if (this.selectedOffice && !this.selectedReservation) {
      // Have office but not reservation - wait for reservation to be selected
      // This will be handled by the reservation selection logic
      setTimeout(() => {
        if (this.selectedReservation) {
          this.selectInvoiceAfterDataLoad(invoiceId);
        }
      }, 500);
    } else {
      // Don't have office yet - wait for it
      setTimeout(() => {
        if (this.selectedOffice) {
          this.selectInvoiceAfterDataLoad(invoiceId);
        }
      }, 500);
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
    // Call onOfficeSelected to ensure all logic runs (form control enable/disable, emissions, etc.)
    // But only if offices are loaded, otherwise wait for them to load
    if (this.offices.length > 0) {
      this.onOfficeSelected(officeId);
    } else {
      // Offices not loaded yet, wait for them to load
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.onOfficeSelected(officeId);
      });
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
      result = result.replace(/\{\{invoiceName\}\}/g, this.selectedInvoice.invoiceCode || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '');
      result = result.replace(/\{\{startDate\}\}/g, this.selectedInvoice.startDate ? this.formatterService.formatDateString(this.selectedInvoice.startDate) : '');
      result = result.replace(/\{\{endDate\}\}/g, this.selectedInvoice.endDate ? this.formatterService.formatDateString(this.selectedInvoice.endDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.totalAmount || 0));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.paidAmount || 0));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency((this.selectedInvoice.totalAmount || 0) - (this.selectedInvoice.paidAmount || 0)));
    }

    // Replace reservation placeholders
    if (this.selectedReservation) {
      result = result.replace(/\{\{billingMethod\}\}/g, getBillingMethod(this.selectedReservation.billingMethodId) || '');
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
      result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatterService.phoneNumber(this.selectedAccountingOffice.phone) || '');
      result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, this.selectedAccountingOffice.website || '');
      result = result.replace(/\{\{accountingOfficeBank\}\}/g, this.selectedAccountingOffice.bankName || '');
      result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, this.selectedAccountingOffice.bankRouting || '');
      result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, this.selectedAccountingOffice.bankAccount || '');
      result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, this.selectedAccountingOffice.bankSwiftCode || '');
      result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, this.selectedAccountingOffice.bankAddress || '');
      result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, this.formatterService.phoneNumber(this.selectedAccountingOffice.bankPhone) || '');
    }

    // Replace ledger lines placeholder
    const ledgerLinesRows = this.generateLedgerLinesRows();
    result = result.replace(/\{\{ledgerLinesRows\}\}/g, ledgerLinesRows);

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  generateLedgerLinesRows(): string {
    if (!this.selectedInvoice?.ledgerLines || this.selectedInvoice.ledgerLines.length === 0) {
      return '';
    }

    const rows = this.selectedInvoice.ledgerLines.map((line, index) => {
      const date = this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '';
      const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const amount = this.formatterService.currency(line.amount || 0);
      
      return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="text-right">${amount}</td>
              </tr>`;
      }).join('\n');

    return rows;
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

  //#region Abstract BaseDocumentComponent
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

    const invoiceCode = this.selectedInvoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice.invoiceId;
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
      subject: `Invoice: ${this.selectedInvoice?.invoiceCode || 'Invoice'}`,
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

  goBack(): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];
    
    // Build query parameters from selected values or input values
    const params: string[] = [];
    
    // Use selectedOffice/selectedReservation/selectedInvoice if available, otherwise fall back to input values
    const officeId = this.selectedOffice?.officeId || this.officeId;
    const reservationId = this.selectedReservation?.reservationId || this.reservationId;
    const invoiceId = this.selectedInvoice?.invoiceId || this.invoiceId;
    
    if (officeId !== null && officeId !== undefined) {
      params.push(`officeId=${officeId}`);
    }
    if (invoiceId !== null && invoiceId !== undefined && invoiceId !== '') {
      params.push(`invoiceId=${invoiceId}`);
    }
    
    // Navigate back based on where we came from
    if (returnTo === 'reservation' && reservationId) {
      if (reservationId !== null && reservationId !== undefined && reservationId !== '') 
        params.push(`reservationId=${reservationId}`);
     params.push(`tab=invoices`);
      const reservationUrl = params.length > 0 
        ? RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]) + `?${params.join('&')}`
        : RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
      this.router.navigateByUrl(reservationUrl);
    } else if (returnTo === 'accounting' || !returnTo) {
      if (this.companyId) {
        params.push(`companyId=${this.companyId}`);
      }
      const accountingUrl = params.length > 0 
        ? `${RouterUrl.AccountingList}?${params.join('&')}`
        : RouterUrl.AccountingList;
      this.router.navigateByUrl(accountingUrl);
    } else {
      // Fallback to accounting list with all parameters
      if (this.companyId) {
        params.push(`companyId=${this.companyId}`);
      }
      const accountingUrl = params.length > 0 
        ? `${RouterUrl.AccountingList}?${params.join('&')}`
        : RouterUrl.AccountingList;
      this.router.navigateByUrl(accountingUrl);
    }
  }
 //#endregion
}
