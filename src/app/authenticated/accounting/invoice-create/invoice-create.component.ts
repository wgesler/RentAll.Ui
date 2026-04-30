import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, firstValueFrom, forkJoin, of, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { EmailService } from '../../email/services/email.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailType } from '../../email/models/email.enum';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentService } from '../../documents/services/document.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyService } from '../../properties/services/property.service';
import { getBillingMethod } from '../../reservations/models/reservation-enum';
import { ReservationListResponse, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { TransactionType } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse, LedgerLineResponse } from '../models/invoice.model';
import { CostCodesService } from '../services/cost-codes.service';
import { InvoiceService } from '../services/invoice.service';

@Component({
    standalone: true,
    selector: 'app-invoice-create',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, TitleBarSelectComponent],
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
  isCompanyRental: boolean = false;

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;

  accountingOffices: AccountingOfficeResponse[] = [];
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  
  accountingOfficeLogo: string = '';
  officeLogo: string = '';
  orgLogo: string = '';
 
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;

  invoices: InvoiceResponse[] = [];
  availableInvoices: { value: InvoiceResponse, label: string }[] = [];
  selectedInvoice: InvoiceResponse | null = null;
  allCostCodes: CostCodesResponse[] = [];
  officeCostCodes: CostCodesResponse[] = [];
  paymentCostCodeIds: Set<number> = new Set<number>();
  costCodesSubscription?: Subscription;
  
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  emailHtml: EmailHtmlResponse | null = null;
  
  companyId: string | null = null; // Store companyId from query params

  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  isSubmitting: boolean = false;
  debuggingHtml: boolean = true;
  shouldAutoPrint: boolean = false;
  autoPrintExecuted: boolean = false;
  isPageReady: boolean = false;
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices', 'organization', 'reservations', 'contacts', 'emailHtml', 'costCodes', 'logo', 'previewHtml']));
  logoSourcesLoaded = { offices: false, accountingOffices: false, organization: false };

  constructor(
    private propertyHtmlService: PropertyHtmlService,
    private accountingService: InvoiceService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private costCodesService: CostCodesService,
    private commonService: CommonService,
    emailService: EmailService,
    private emailHtmlService: EmailHtmlService,
    private contactService: ContactService,
    private http: HttpClient,
    private authService: AuthService,
    private documentReloadService: DocumentReloadService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    private accountingOfficeService: AccountingOfficeService,
    private globalSelectionService: GlobalSelectionService,
    private route: ActivatedRoute,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  //#region Create Invoice Methods
  ngOnInit(): void {
    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.applyOfficeSelection(officeId);
      }
    });

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
      this.shouldAutoPrint = queryParams['autoPrint'] === 'true';
      if (!this.invoiceId) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      }
      
      this.loadOffices();
      this.loadAccountingOffices();
      this.loadReservations();
      this.loadOrganization();
      this.loadContacts();
      this.loadEmailHtml();
      this.loadCostCodes();

      // Single gate: page is ready only after every load-item is resolved (including previewHtml).
      this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
        this.isPageReady = true;
      });

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
        } else {
          const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
          if (globalOfficeId != null && this.offices.length > 0) {
            this.applyOfficeSelection(globalOfficeId);
          } else {
            this.applyOfficeSelection(null);
          }
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      if (newOfficeId !== (this.selectedOffice?.officeId ?? null)) {
        this.applyOfficeSelection(newOfficeId);
      }
    }
    
    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      if (newReservationId !== (this.selectedReservation?.reservationId ?? null)) {
        this.applyReservationSelection(newReservationId);
      }
    }
    
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

      const fileName = this.utilityService.generateDocumentFileName(
        'invoice',
        this.property.propertyCode,
        this.selectedInvoice.invoiceCode || this.selectedInvoice.invoiceId || 'Invoice'
      );

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
    const reservationContactId = this.getPrimaryReservationContactId(reservation);
    if (!this.contact && reservationContactId) {
      const contacts = await firstValueFrom(this.contactService.getAllContacts().pipe(take(1)));
      this.contact = contacts.find(c => c.contactId === reservationContactId) || null;
    }

    // Load accounting office if not provided
    if (!this.selectedAccountingOffice && this.selectedOffice) {
      const accountingOffices = await firstValueFrom(
        this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1))
      );
      this.selectedAccountingOffice = accountingOffices.find(ao => ao.officeId === this.selectedOffice.officeId) || null;
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
    const bindOfficeStream = (): void => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
      });
    };

    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.markLogoSourceLoaded('offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.markLogoSourceLoaded('offices');
    })).subscribe({
      next: () => bindOfficeStream(),
      error: () => { this.offices = []; }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      this.markLogoSourceLoaded('accountingOffices');
    })).subscribe({
      next: (list) => {
        this.accountingOffices = list || [];
      },
      error: () => {
        this.accountingOffices = [];
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
      }
    });
  }

  loadReservation(reservationId?: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservation');
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'); })).subscribe({
      next: (response: ReservationResponse) => {
        this.reservationId = response.reservationId;
        this.selectedReservation = response;
      },
      error: () => {
        this.selectedReservation = null;
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
      }
    });
  }

  loadInvoiceByIdFirst(invoiceId: string): void {
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
      error: () => {
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
      error: () => {
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
      error: () => {
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
      error: () => {
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
            this.clearPreview();
            this.toastr.warning('No invoice HTML template found in assets.', 'No Template');
          }
        },
        error: () => {
          this.clearPreview();
        }
      });
      return;
    }

    // Production mode: load from API
    if (!this.property?.propertyId) {
      this.clearPreview();
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
      error: () => {
        this.clearPreview();
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.markLogoSourceLoaded('organization');
    })).subscribe({
      next: (org: OrganizationResponse | null) => {
        this.organization = org;
        this.updateOrgLogo();
      }
    });
  }

  markLogoSourceLoaded(source: 'offices' | 'accountingOffices' | 'organization'): void {
    this.logoSourcesLoaded[source] = true;
    if (this.logoSourcesLoaded.offices && this.logoSourcesLoaded.accountingOffices && this.logoSourcesLoaded.organization) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'logo');
    }
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.contacts = contacts || [];
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml'); })).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: () => {
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription?.unsubscribe();
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe({
        next: () => {
          this.allCostCodes = this.costCodesService.getAllCostCodesValue();
          this.filterCostCodes();
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        },
        error: () => {
          this.allCostCodes = [];
          this.officeCostCodes = [];
          this.paymentCostCodeIds.clear();
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        }
      });
    });
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
      this.officeCostCodes = [];
      this.paymentCostCodeIds = new Set<number>();
      return;
    }

    this.officeCostCodes = this.allCostCodes.filter(c => c.officeId === this.selectedOffice!.officeId);
    this.paymentCostCodeIds = new Set<number>(
      this.officeCostCodes
        .filter(c => c.transactionTypeId === TransactionType.Payment)
        .map(c => Number(c.costCodeId))
        .filter(id => Number.isFinite(id))
    );
  }

  loadContact(): void {
    const reservationContactId = this.getPrimaryReservationContactId(this.selectedReservation);
    if (!reservationContactId) {
      this.contact = null;
      return;
    }

    this.contact = this.contacts.find(c => c.contactId === reservationContactId) || null;
    if (this.contact && this.contact.entityTypeId === EntityType.Company) {
       this.isCompanyRental = true;
    } else {
      this.isCompanyRental = false;
    }
  }

  getPrimaryReservationContactId(reservation: ReservationResponse | null | undefined): string | null {
    const contactIds = reservation?.contactIds || [];
    const firstContactId = contactIds.find(id => String(id || '').trim().length > 0);
    return firstContactId ? String(firstContactId) : null;
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
  get officeTitleBarOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get reservationTitleBarOptions(): { value: string, label: string }[] {
    return this.availableReservations.map(reservation => ({
      value: reservation.value.reservationId,
      label: reservation.label
    }));
  }

  get invoiceTitleBarOptions(): { value: string, label: string }[] {
    return this.availableInvoices.map(invoice => ({
      value: invoice.value.invoiceId,
      label: invoice.label
    }));
  }

  onTitleBarOfficeChange(value: string | number | null): void {
    this.onOfficeSelected(value == null || value === '' ? null : Number(value));
  }

  onTitleBarReservationChange(value: string | number | null): void {
    this.onReservationSelected(value == null || value === '' ? null : String(value));
  }

  onTitleBarInvoiceChange(value: string | number | null): void {
    this.onInvoiceSelected(value == null || value === '' ? null : String(value));
  }

  onOfficeSelected(officeId: number | null, syncGlobalSelection: boolean = true): void {
    if (syncGlobalSelection) {
      this.globalSelectionService.setSelectedOfficeId(officeId);
    }
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
    this.filterCostCodes();
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
      error: () => {
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
      label: this.utilityService.getReservationDropdownLabel(r, this.contacts.find(c => c.contactId === r.contactId) ?? null)
    }));
  }

  applyOfficeSelection(officeId: number | null): void {
    // Call onOfficeSelected to ensure all logic runs (form control enable/disable, emissions, etc.)
    // But only if offices are loaded, otherwise wait for them to load
    if (this.offices.length > 0) {
      this.onOfficeSelected(officeId, false);
    } else {
      // Offices not loaded yet, wait for them to load
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.onOfficeSelected(officeId, false);
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
        error: () => {
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
      const totals = this.getInvoiceDisplayTotals(this.selectedInvoice);
      result = result.replace(/\{\{invoiceName\}\}/g, this.selectedInvoice.invoiceCode || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '');
      result = result.replace(/\{\{startDate\}\}/g, this.selectedInvoice.startDate ? this.formatterService.formatDateString(this.selectedInvoice.startDate) : '');
      result = result.replace(/\{\{endDate\}\}/g, this.selectedInvoice.endDate ? this.formatterService.formatDateString(this.selectedInvoice.endDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(totals.totalCharges));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(totals.totalPayments));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency(totals.totalDue));
    }

    // Replace reservation placeholders
    if (this.selectedReservation && this.contact) {
      result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, this.getResponsiblePartiesBlock() || '');
    }

    // Replace property placeholders
    if (this.property) {
       result = result.replace(/\{\{propertySideBlock\}\}/g, this.getPropertySideBlock() || '');
    }

    // Replace office placeholders
    if (this.selectedOffice) {
      result = result.replace(/\{\{officeName\}\}/g, this.selectedOffice.name || '');
    }

    // Invoice logo priority: accounting office logo, then organization logo.
    const preferredLogoDataUrl = this.accountingOfficeLogo || this.orgLogo;
    if (preferredLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, preferredLogoDataUrl);
    }

    // Replace organization logo placeholder
    if (this.orgLogo) {
      result = result.replace(/\{\{orgLogoBase64\}\}/g, this.orgLogo);
    }

    // Remove img tags that contain logo placeholders if no logo is available
    if (!preferredLogoDataUrl && !this.orgLogo) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace accounting office placeholders
    if (this.selectedAccountingOffice) {
      result = result.replace(/\{\{accountingOfficeName\}\}/g, this.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.getAccountingOfficeAddress() || '');
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

    result = this.applyInvoiceLedgerSectionPlaceholders(result);

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  applyInvoiceLedgerSectionPlaceholders(html: string): string {
    let result = html;
    const invoice = this.selectedInvoice;
    const emptyRows = '';
    const zeroMoney = this.formatterService.currency(0);

    if (!invoice?.ledgerLines?.length) {
      result = result.replace(/\{\{chargeLedgerLineRows\}\}/g, emptyRows);
      result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, emptyRows);
      result = result.replace(/\{\{totalCharges\}\}/g, zeroMoney);
      result = result.replace(/\{\{totalPayments\}\}/g, zeroMoney);
      const apiBalanceDue = invoice
        ? (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
        : 0;
      result = result.replace(/\{\{invoiceLedgerBalanceDue\}\}/g, this.formatterService.currency(apiBalanceDue));
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
      return result;
    }

    const paymentLines = invoice.ledgerLines.filter(l => this.isPaymentLedgerLine(l));
    const chargeLines = invoice.ledgerLines.filter(l => !this.isPaymentLedgerLine(l));
    const hasPayments = paymentLines.length > 0;

    const chargeRows = chargeLines.map(l => this.formatInvoiceLedgerRowHtml(l)).join('\n');
    const paymentRows = paymentLines.map(l => this.formatInvoiceLedgerRowHtml(l)).join('\n');

    const totalChargesAmount = chargeLines.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalPaymentsAmount = paymentLines.reduce((sum, l) => sum + (l.amount || 0), 0);
    const balanceDueFromLedger = totalChargesAmount - totalPaymentsAmount;

    result = result.replace(/\{\{chargeLedgerLineRows\}\}/g, chargeRows);
    result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, paymentRows);
    result = result.replace(/\{\{totalCharges\}\}/g, this.formatterService.currency(totalChargesAmount));
    result = result.replace(/\{\{totalPayments\}\}/g, this.formatterService.currency(totalPaymentsAmount));
    result = result.replace(/\{\{invoiceLedgerBalanceDue\}\}/g, this.formatterService.currency(balanceDueFromLedger));

    if (hasPayments) {
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, '');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, '');
    } else {
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
    }

    return result;
  }

  formatInvoiceLedgerRowHtml(line: LedgerLineResponse): string {
    const date = this.formatterService.formatDateString(this.selectedInvoice!.invoiceDate) || '';
    const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const amount = this.formatterService.currency(line.amount || 0);
    return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="text-right">${amount}</td>
              </tr>`;
  }

  isPaymentLedgerLine(line: LedgerLineResponse): boolean {
    const costCodeId = Number(line.costCodeId);
    if (Number.isFinite(costCodeId) && this.paymentCostCodeIds.has(costCodeId))
      return true;

    return line.transactionTypeId === TransactionType.Payment;
  }

  getInvoiceDisplayTotals(invoice: InvoiceResponse): { totalCharges: number; totalPayments: number; totalDue: number } {
    if (!invoice?.ledgerLines?.length) {
      const totalCharges = Number(invoice?.totalAmount || 0);
      const totalPayments = Number(invoice?.paidAmount || 0);
      return {
        totalCharges,
        totalPayments,
        totalDue: totalCharges - totalPayments
      };
    }

    const paymentLines = invoice.ledgerLines.filter(line => this.isPaymentLedgerLine(line));
    const chargeLines = invoice.ledgerLines.filter(line => !this.isPaymentLedgerLine(line));
    const totalCharges = chargeLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    const totalPayments = paymentLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    return {
      totalCharges,
      totalPayments,
      totalDue: totalCharges - totalPayments
    };
  }
  
  getResponsiblePartiesBlock(): string {
    const contacts = this.getResponsibleContacts();
    if (contacts.length === 0) {
      return '';
    }

    return contacts.map(contact => {
      var pContact = this.contacts.find(c => c.contactId === this.selectedReservation.companyId) ?? contact;
      const responsibleParty = this.escapeHtml(this.utilityService.getResponsibleParty(this.selectedReservation, pContact));
      const responsiblePartyAddress1Raw = this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, pContact);
      const responsiblePartyAddress2Raw = this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, pContact);
      const responsiblePartyAddress1 = this.escapeHtml(responsiblePartyAddress1Raw);
      const responsiblePartyAddress2 = this.escapeHtml(responsiblePartyAddress2Raw);
      const responsiblePartyAddressSingleLine = [responsiblePartyAddress1, responsiblePartyAddress2].filter(part => part).join(', ');
      const responsiblePartyOccupant = this.escapeHtml(this.selectedReservation.tenantName);
      const responsiblePartyRefNo = this.escapeHtml(this.selectedReservation.referenceNo);
      const useSingleAddressLine = this.utilityService.isAddressSingleLine("Address:", responsiblePartyAddress1Raw, responsiblePartyAddress2Raw);

      return [
        `<span style="font-weight: bold">Client:</span> ${responsibleParty}<br>`,
        useSingleAddressLine
          ? `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddressSingleLine}<br>`
          : `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}<br>`,
        ...(!useSingleAddressLine && responsiblePartyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${responsiblePartyAddress2}<br>`] : []),
        `<span style="font-weight: bold">Occupant:</span> ${responsiblePartyOccupant}<br>`,
        ...(responsiblePartyRefNo ? [`<span style="font-weight: bold">Ref No:</span> ${responsiblePartyRefNo}<br>`] : [])
      ].join('');
    }).join('<br>');
  }

  getPropertySideBlock(): string {
    if (!this.property) 
      return '';
  
    const propertyAddress1Raw = this.getPropertyAddress1();
    const propertyAddress2Raw = this.getPropertyAddress2();
    const propertyAddress1 = this.escapeHtml(propertyAddress1Raw);
    const propertyAddress2 = this.escapeHtml(propertyAddress2Raw);
    const propertyAddressSingleLine = [propertyAddress1, propertyAddress2].filter(part => part).join(', ');
    const propertyCode = this.escapeHtml(this.property.propertyCode || '');
    const billingType = this.escapeHtml(getBillingMethod(this.selectedReservation?.billingMethodId));
    const useSingleAddressLine = this.utilityService.isAddressSingleLine("Property Address:", propertyAddress1Raw, propertyAddress2Raw);

    return [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}<br>`,
      useSingleAddressLine
        ? `<span style="font-weight: bold">Property Address:</span> ${propertyAddressSingleLine}<br>`
        : `<span style="font-weight: bold">Property Address:</span> ${propertyAddress1}<br>`,
      ...(!useSingleAddressLine ? [`&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}<br>`] : []),
      `<span style="font-weight: bold">Billing Type:</span> ${billingType}<br>`
    ].join('');
  }

  getResponsibleParty(): string {
    return this.utilityService.getResponsibleParty(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyAddress1() {
    return this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyAddress2() {
    return this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyPhone() {
    return this.utilityService.getResponsiblePartyPhone(this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyEmail() {
    return this.utilityService.getResponsiblePartyEmail(this.getPrimaryResponsibleContact());
  }

  getPropertyAddress1() {
    if (!this.property) {
      return '';
    }
    return [this.property.address1, this.property.suite]
      .map(part => String(part ?? '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getPropertyAddress2() {
    if (!this.property) {
      return '';
    }
    const city = String(this.property.city ?? '').trim();
    const state = String(this.property.state ?? '').trim();
    const zip = String(this.property.zip ?? '').trim();
    const stateZip = [state, zip].filter(part => part.length > 0).join(' ');
    return [city, stateZip].filter(part => part.length > 0).join(', ');
  }
  
  getPrimaryResponsibleContact(): ContactResponse | null {
    return this.getResponsibleContacts()[0] || null;
  }

  getResponsibleContacts(): ContactResponse[] {
    const selectedContactIds = this.selectedReservation?.contactIds || [];
    const uniqueContactIds = new Set<string>();
    const contacts: ContactResponse[] = [];

    selectedContactIds.forEach(contactId => {
      const normalizedContactId = String(contactId || '').trim();
      if (!normalizedContactId || uniqueContactIds.has(normalizedContactId)) {
        return;
      }
      const reservationContact = this.contacts.find(c => c.contactId === normalizedContactId);
      if (reservationContact) {
        uniqueContactIds.add(normalizedContactId);
        contacts.push(reservationContact);
      }
    });

    if (contacts.length === 0 && this.contact) {
      contacts.push(this.contact);
    }

    return contacts;
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getAccountingOfficeAddress(): string {
    if (!this.selectedAccountingOffice) return '';
    return `${this.selectedAccountingOffice.address1 || ''} ${this.selectedAccountingOffice.suite || ''}`.trim(); 
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
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
    this.iframeKey++; // Force iframe refresh
  }

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
    this.resizePreviewIframeToContent();
    this.tryAutoPrint();

    // Re-check shortly after load so late-rendering content is included.
    window.setTimeout(() => this.resizePreviewIframeToContent(), 150);
    window.setTimeout(() => this.resizePreviewIframeToContent(), 500);
  }

  tryAutoPrint(): void {
    if (!this.shouldAutoPrint || this.autoPrintExecuted) {
      return;
    }

    if (!this.selectedOffice || !this.selectedReservation || !this.selectedInvoice || !this.previewIframeHtml) {
      return;
    }

    this.autoPrintExecuted = true;
    window.setTimeout(() => {
      this.onPrint();
    }, 100);
  }

  resizePreviewIframeToContent(): void {
    const iframe = this.previewIframe?.nativeElement;
    if (!iframe) {
      return;
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      return;
    }

    const body = doc.body;
    const html = doc.documentElement;
    const contentHeight = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      html?.clientHeight || 0,
      html?.scrollHeight || 0,
      html?.offsetHeight || 0
    );

    if (contentHeight > 0) {
      iframe.style.height = `${contentHeight + 12}px`;
    }
  }

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.previewIframeStyles = '';
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
  }

  isPreviewHtmlPending(): boolean {
    return this.itemsToLoad$.value.has('previewHtml');
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
      organizationId: this.organization?.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || '',
      selectedReservationId: this.selectedReservation?.reservationId || null,
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
    const dateStamp = this.utilityService.todayAsCalendarDateString();
    const fileName = `Invoice_${invoiceCode}_${dateStamp}.pdf`;

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
    const toEmail = (this.contact?.entityTypeId === EntityType.Company) ? this.contact?.companyEmail : this.contact?.email;
    const ccEmail = (this.contact?.entityTypeId === EntityType.Company) ? (this.contact?.email || '') : null;
    const ccEmails = [ccEmail];
    const toName = `${this.contact?.fullName || ''}`.trim();
    const salutationName = `${this.contact?.firstName || ''}`.trim();
    const tenantName = `${this.selectedReservation?.tenantName || ''}`.trim();
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const accountingName = this.selectedAccountingOffice?.name;
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';
     const plainTextContent = '';
    const invoiceCode = this.selectedInvoice?.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice?.invoiceId || 'Invoice';
    const attachmentFileName = `Invoice_${invoiceCode}_${this.utilityService.todayAsCalendarDateString()}.pdf`;
    const emailTemplateHtml = (this.contact?.entityTypeId === EntityType.Company) ? (this.emailHtml?.corporateInvoice || '') : (this.emailHtml?.invoice || '');

    const emailSubject = this.emailHtml?.invoiceSubject?.trim()
      .replace(/\{\{invoiceCode\}\}/g, invoiceCode || '');
    const emailBodyHtml = emailTemplateHtml
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{tenantName\}\}/g, tenantName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{accountingName\}\}/g, accountingName || '')
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone || '');

    const emailConfig: EmailConfig = {
      subject: emailSubject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      ccEmails,
      documentType: DocumentType.Invoice,
      emailType: EmailType.Invoice,
      plainTextContent,
      htmlContent: emailBodyHtml,
      fileDetails: {
        fileName: attachmentFileName,
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Utility Methods
  goBack(): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];

    const officeId = this.selectedOffice?.officeId ?? this.officeId ?? null;
    const reservationId = this.selectedReservation?.reservationId ?? this.reservationId ?? null;
    const invoiceId = this.selectedInvoice?.invoiceId ?? this.invoiceId ?? null;

    if (returnTo === 'invoice-edit') {
      const accountingParams: string[] = ['tab=0'];
      if (officeId !== null && officeId !== undefined) {
        accountingParams.push(`officeId=${officeId}`);
      }
      if (this.companyId) {
        accountingParams.push(`companyId=${this.companyId}`);
      }
      const organizationIdParam = queryParams['organizationId'];
      if (organizationIdParam) {
        accountingParams.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
      }
      const accountingUrl = `${RouterUrl.AccountingList}?${accountingParams.join('&')}`;
      this.router.navigateByUrl(accountingUrl);
      return;
    }

    const params: string[] = [];
    if (officeId !== null && officeId !== undefined) {
      params.push(`officeId=${officeId}`);
    }
    if (invoiceId !== null && invoiceId !== undefined && invoiceId !== '') {
      params.push(`invoiceId=${invoiceId}`);
    }

    if (returnTo === 'reservation' && reservationId) {
      if (reservationId !== null && reservationId !== undefined && reservationId !== '') {
        params.push(`reservationId=${reservationId}`);
      }
      params.push(`tab=invoices`);
      const reservationUrl = params.length > 0
        ? RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]) + `?${params.join('&')}`
        : RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
      this.router.navigateByUrl(reservationUrl);
    } else if (returnTo === 'accounting' || !returnTo) {
      const accountingParams: string[] = [];
      if (officeId !== null && officeId !== undefined) {
        accountingParams.push(`officeId=${officeId}`);
      }
      accountingParams.push('tab=0');
      if (this.companyId) {
        accountingParams.push(`companyId=${this.companyId}`);
      }
      const organizationIdParam = queryParams['organizationId'];
      if (organizationIdParam) {
        accountingParams.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
      }
      const accountingUrl = `${RouterUrl.AccountingList}?${accountingParams.join('&')}`;
      this.router.navigateByUrl(accountingUrl);
    } else {
      const accountingParams: string[] = [];
      if (officeId !== null && officeId !== undefined) {
        accountingParams.push(`officeId=${officeId}`);
      }
      accountingParams.push('tab=0');
      if (this.companyId) {
        accountingParams.push(`companyId=${this.companyId}`);
      }
      const organizationIdParam = queryParams['organizationId'];
      if (organizationIdParam) {
        accountingParams.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
      }
      const accountingUrl = `${RouterUrl.AccountingList}?${accountingParams.join('&')}`;
      this.router.navigateByUrl(accountingUrl);
    }
  }
  
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
