import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, filter, finalize, firstValueFrom, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { DebugLayoutBandsService } from '../../../services/debug-layout-bands.service';
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
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { TransactionType } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse } from '../models/invoice.model';
import { CostCodesService } from '../services/cost-codes.service';
import { InvoiceHtmlBuilderService } from '../services/invoice-html-builder.service';
import { InvoicePrintContext } from '../models/invoice-print-context.model';
import { InvoiceService } from '../services/invoice.service';

@Component({
    standalone: true,
    selector: 'app-invoice-create',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, TitleBarSelectComponent],
    templateUrl: './invoice-create.component.html',
    styleUrls: ['./invoice-create.component.scss']
})
export class InvoiceCreateComponent extends BaseDocumentComponent implements OnInit, OnDestroy {
  @Input() shellMode = false;
  @Input() invoiceIdInput: string | null = null;
  @Input() officeIdInput: number | null = null;
  @Input() reservationIdInput: string | null = null;
  @Input() companyIdInput: string | null = null;
  @Output() backEvent = new EventEmitter<void>();

  officeId: number | null = null;
  reservationId: string | null = null;
  invoiceId: string | null = null;

  form: FormGroup;
  organization: OrganizationResponse | null = null;
  contacts: ContactResponse[] = [];
  contact: ContactResponse | null = null;
  isCompanyRental: boolean = false;

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;

  accountingOffices: AccountingOfficeResponse[] = [];
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  
  accountingOfficeLogo: string = '';
  officeLogo: string = '';
  orgLogo: string = '';
 
  availableReservations: { value: ReservationResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;

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
  /** Tied to header Layout debug toggle (DebugLayoutBandsService). */
  debuggingLayoutColors: boolean = false;
  private previewHtmlBeforeIframe: string = '';
  shouldAutoPrint: boolean = false;
  autoPrintExecuted: boolean = false;
  shouldAutoDownload: boolean = false;
  autoDownloadExecuted: boolean = false;
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  isPageReady: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices', 'contacts', 'reservation', 'property', 'emailHtml', 'invoice', 'previewHtml']));
    destroy$ = new Subject<void>();

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
    private documentReloadService: DocumentReloadService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    private accountingOfficeService: AccountingOfficeService,
    private route: ActivatedRoute,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService,
    private debugLayoutBandsService: DebugLayoutBandsService,
    private invoiceHtmlBuilder: InvoiceHtmlBuilderService,
    private cdr: ChangeDetectorRef
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  //#region Invoice Create
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.debuggingLayoutColors = this.debugLayoutBandsService.isEnabled();
    this.debugLayoutBandsService.enabled$.pipe(takeUntil(this.destroy$)).subscribe((on) => {
      this.debuggingLayoutColors = on;
      if (this.previewHtmlBeforeIframe) {
        this.processAndSetHtml(this.previewHtmlBeforeIframe);
      }
      this.cdr.markForCheck();
    });

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.markForCheck();
    });

    this.itemsToLoad$.pipe(filter(items => items.size === 1 && items.has('previewHtml')),take(1),takeUntil(this.destroy$)).subscribe(() => {
      this.applyRouteOfficeSelection();
      this.loadContact();
      this.tryGeneratePreview();
    });

    if (this.shellMode) {
      this.applyShellInputs();
    } else {
      this.applyRouteParams(this.route.snapshot.queryParamMap);
    }

    this.initializeInvoicePreview();
  }

  private applyShellInputs(): void {
    this.invoiceId = (this.invoiceIdInput || '').trim() || null;
    this.reservationId = (this.reservationIdInput || '').trim() || null;
    this.officeId = this.officeIdInput ?? null;
    this.companyId = (this.companyIdInput || '').trim() || null;
  }

  private initializeInvoicePreview(): void {
    if (this.officeId == null || !this.reservationId?.trim() || !this.invoiceId?.trim()) {
      this.toastr.error('officeId, reservationId, and invoiceId are required.', 'Missing Parameters');
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.loadOffices();
    this.loadAccountingOffices();
    this.loadOrganization();
    this.loadContacts();
    this.loadEmailHtml();
    this.loadCostCodes();
    this.loadReservation(this.reservationId);
    this.loadInvoice(this.invoiceId);
  }

  applyRouteParams(paramMap: { get: (key: string) => string | null }): void {
    const officeIdRaw = paramMap.get('officeId')?.trim() ?? '';
    if (officeIdRaw) {
      const officeId = parseInt(officeIdRaw, 10);
      if (!isNaN(officeId)) {
        this.officeId = officeId;
      }
    }

    const companyId = paramMap.get('companyId')?.trim();
    if (companyId) {
      this.companyId = companyId;
    }

    const reservationId = paramMap.get('reservationId')?.trim();
    if (reservationId) {
      this.reservationId = reservationId;
    }

    const invoiceId = paramMap.get('invoiceId')?.trim();
    if (invoiceId) {
      this.invoiceId = invoiceId;
    }

    this.shouldAutoPrint = paramMap.get('autoPrint') === 'true';
    this.shouldAutoDownload = paramMap.get('autoDownload') === 'true';
  }

  applyRouteOfficeSelection(): void {
    if (this.officeId == null) {
      return;
    }

    this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
    this.updateOfficeLogo();
    this.selectedAccountingOffice = this.accountingOffices.find(ao => ao.officeId === this.officeId) || null;
    this.updateAccountingOfficeLogo();
    this.filterCostCodes();
    this.form.patchValue({ selectedOfficeId: this.officeId }, { emitEvent: false });
    if (this.selectedReservation) {
      this.form.patchValue({ selectedReservationId: this.selectedReservation.reservationId }, { emitEvent: false });
      this.syncAvailableReservationsFromSelected();
    }
    if (this.selectedInvoice) {
      this.form.patchValue({ selectedInvoiceId: this.selectedInvoice.invoiceId }, { emitEvent: false });
      this.syncAvailableInvoicesFromSelected();
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
    const reservation = this.selectedReservation;
    if (!reservation) {
      return;
    }

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
    if (!this.contact) {
      this.loadContact();
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
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');})).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
      },
      error: () => {
        this.offices = [];
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');})).subscribe({
      next: (list) => {
        this.accountingOffices = list || [];
      },
      error: () => {
        this.accountingOffices = [];
      }
    });
  }

  loadOrganization(): void {
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      this.organization = cached;
      this.updateOrgLogo();
      return;
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim();
    if (!organizationId) {
      this.organization = null;
      return;
    }

    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(
      filter(org => org !== null),
      take(1)
    ).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
        this.updateOrgLogo();
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');})).subscribe({
      next: (contacts) => {
        this.contacts = contacts || [];
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml');})).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: () => {
        this.emailHtml = null;
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.costCodesSubscription?.unsubscribe();
        this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe({
          next: () => {
            this.allCostCodes = this.costCodesService.getAllCostCodesValue();
            this.filterCostCodes();
          },
          error: () => {
            this.allCostCodes = [];
            this.officeCostCodes = [];
            this.paymentCostCodeIds.clear();
          }
        });
      },
      error: () => {
        this.allCostCodes = [];
        this.officeCostCodes = [];
        this.paymentCostCodeIds.clear();
      }
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

  loadReservation(reservationId: string): void {
    const id = reservationId.trim();
    if (!id) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
      return;
    }

    this.reservationService.getReservationByGuid(id).pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');})).subscribe({
      next: (response: ReservationResponse) => {
        this.applyLoadedReservation(response);
      },
      error: () => {
        this.selectedReservation = null;
        this.availableReservations = [];
      }
    });
  }

  applyLoadedReservation(fullReservation: ReservationResponse): void {
    this.reservationId = fullReservation.reservationId;
    this.selectedReservation = fullReservation;
    this.syncAvailableReservationsFromSelected();
    this.form.patchValue({ selectedReservationId: fullReservation.reservationId }, { emitEvent: false });

    this.loadProperty(fullReservation.propertyId);
  }

  loadInvoice(invoiceId: string): void {
    const id = invoiceId.trim();
    if (!id) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');
      return;
    }

    this.accountingService.getInvoiceByGuid(id).pipe(take(1),finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');})).subscribe({
      next: (response: InvoiceResponse) => {
        this.selectedInvoice = response;
        this.invoiceId = response.invoiceId;
        this.syncAvailableInvoicesFromSelected();
        this.form.patchValue({ selectedInvoiceId: response.invoiceId }, { emitEvent: false });
      },
      error: () => {
        this.clearPreview();
      }
    });
  }

  loadProperty(propertyId: string): void {
    if (!propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.property = null;
      return;
    }

    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');})).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
      },
      error: () => {
        this.property = null;
      }
    });
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

  //#region Preview Methods
  tryGeneratePreview(): void {
    if (!this.selectedOffice || !this.selectedReservation || !this.selectedInvoice) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }

    this.loadContact();

    // Always reload template when available so assets/DB edits and layout normalization apply.
    if (this.debuggingHtml || this.property?.propertyId) {
      this.loadInvoiceHtml();
      return;
    }

    const formHtml = this.form.value.invoice;
    if (formHtml && formHtml.trim()) {
      const processedHtml = this.replacePlaceholders(formHtml);
      this.processAndSetHtml(processedHtml);
      return;
    }

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
  }

  loadInvoiceHtml(): void {
    if (this.debuggingHtml) {
      this.http.get(`assets/invoice.html?ts=${Date.now()}`, { responseType: 'text' }).pipe(take(1)).subscribe({
        next: (html: string) => {
          if (html) {
            this.form.patchValue({ invoice: html });
            const processedHtml = this.replacePlaceholders(html);
            this.processAndSetHtml(processedHtml);
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

  processAndSetHtml(html: string): void {
    this.previewHtmlBeforeIframe = html;
    const { processedHtml, extractedStyles } = this.invoiceHtmlBuilder.buildProcessedPreview(html, this.buildPrintContext());
    this.previewIframeHtml = processedHtml;
    const allStyles = extractedStyles;
    this.previewIframeStyles = allStyles;
    const bodyContent = this.documentHtmlService.extractBodyContent(processedHtml);
    const bodyClass = this.debuggingLayoutColors ? 'dbg-invoice-layout-on' : '';
    const bodyOpenTag = bodyClass ? `<body class="${bodyClass}">` : '<body>';
    const srcdoc = allStyles.trim()
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style data-dynamic-styles="true">${allStyles}</style></head>${bodyOpenTag}${bodyContent}</body></html>`
      : processedHtml;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(srcdoc);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
    this.iframeKey++;
    this.cdr.markForCheck();
  }

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
    this.resizePreviewIframeToContent();
    this.tryAutoPrint();
    this.tryAutoDownload();

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

  tryAutoDownload(): void {
    if (!this.shouldAutoDownload || this.autoDownloadExecuted) {
      return;
    }

    if (!this.selectedOffice || !this.selectedReservation || !this.selectedInvoice || !this.previewIframeHtml) {
      return;
    }

    this.autoDownloadExecuted = true;
    window.setTimeout(() => {
      void this.onDownload();
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

  //#region Title Bar Methods
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

  syncAvailableInvoicesFromSelected(): void {
    if (!this.selectedInvoice) {
      this.availableInvoices = [];
      return;
    }

    this.availableInvoices = [{
      value: this.selectedInvoice,
      label: this.selectedInvoice.invoiceCode || `Invoice ${this.selectedInvoice.invoiceId}`
    }];
  }

  syncAvailableReservationsFromSelected(): void {
    if (!this.selectedReservation) {
      this.availableReservations = [];
      return;
    }

    if (this.selectedOffice && this.selectedReservation.officeId !== this.selectedOffice.officeId) {
      this.availableReservations = [];
      return;
    }

    const reservationContactId = this.getPrimaryReservationContactId(this.selectedReservation);
    const contact = reservationContactId
      ? this.contacts.find(c => c.contactId === reservationContactId) ?? null
      : null;
    this.availableReservations = [{
      value: this.selectedReservation,
      label: this.utilityService.getReservationDropdownLabel(this.selectedReservation, contact)
    }];
  }
  //#endregion

  //#region Form Replacement Methods
  replacePlaceholders(html: string): string {
    return this.invoiceHtmlBuilder.replacePlaceholders(html, this.buildPrintContext());
  }

  buildPrintContext(): InvoicePrintContext {
    if (!this.selectedInvoice || !this.selectedReservation || !this.selectedOffice) {
      throw new Error('Invoice print context is incomplete');
    }

    const reservationContactId = this.getPrimaryReservationContactId(this.selectedReservation);
    const contact = reservationContactId
      ? this.contacts.find(c => c.contactId === reservationContactId) ?? null
      : null;

    return {
      invoice: this.selectedInvoice,
      reservation: this.selectedReservation,
      property: this.property,
      contact,
      contacts: this.contacts,
      selectedOffice: this.selectedOffice,
      selectedAccountingOffice: this.selectedAccountingOffice,
      organization: this.organization,
      accountingOfficeLogo: this.accountingOfficeLogo,
      orgLogo: this.orgLogo,
      paymentCostCodeIds: this.paymentCostCodeIds
    };
  }
  //#endregion

  //#region Base Class Overrides
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
    const toName =  (this.contact?.entityTypeId === EntityType.Company) ? `${this.contact?.companyName || ''}`.trim() : `${this.contact?.fullName || ''}`.trim();
    const ccEmail = (this.contact?.entityTypeId === EntityType.Company) ? (this.contact?.email || '') : null;
    const ccEmails = [ccEmail];
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
      .replace(/\{\{companyName\}\}/g, this.organization?.name || '')
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
    if (this.shellMode) {
      this.backEvent.emit();
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];
    const originReturnTo = queryParams['originReturnTo'] || 'accounting';

    const officeId = this.selectedOffice?.officeId ?? this.officeId ?? null;
    const reservationId = this.selectedReservation?.reservationId ?? this.reservationId ?? null;
    const invoiceId = this.selectedInvoice?.invoiceId ?? this.invoiceId ?? null;

    if (returnTo === 'invoice-edit') {
      if (originReturnTo === 'reservation' && reservationId) {
        this.navigateToReservationShell(reservationId, officeId, invoiceId, queryParams['organizationId']);
        return;
      }

      const accountingParams: string[] = ['tab=0'];
      if (officeId !== null && officeId !== undefined) {
        accountingParams.push(`officeId=${officeId}`);
      }
      if (reservationId) {
        accountingParams.push(`reservationId=${reservationId}`);
      }
      if (this.companyId) {
        accountingParams.push(`companyId=${this.companyId}`);
      }
      const organizationIdParam = queryParams['organizationId'];
      if (organizationIdParam) {
        accountingParams.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
      }
      this.router.navigateByUrl(`${RouterUrl.AccountingList}?${accountingParams.join('&')}`);
      return;
    }

    if (returnTo === 'reservation' && reservationId) {
      this.navigateToReservationShell(reservationId, officeId, null, queryParams['organizationId']);
      return;
    }

    const accountingParams: string[] = ['tab=0'];
    if (officeId !== null && officeId !== undefined) {
      accountingParams.push(`officeId=${officeId}`);
    }
    if (reservationId) {
      accountingParams.push(`reservationId=${reservationId}`);
    }
    if (this.companyId) {
      accountingParams.push(`companyId=${this.companyId}`);
    }
    const organizationIdParam = queryParams['organizationId'];
    if (organizationIdParam) {
      accountingParams.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
    }
    this.router.navigateByUrl(`${RouterUrl.AccountingList}?${accountingParams.join('&')}`);
  }

  navigateToReservationShell(
    reservationId: string,
    officeId: number | null,
    invoiceId: string | null,
    organizationId: string | null | undefined
  ): void {
    const reservationParams: string[] = ['tab=invoices'];
    if (officeId !== null && officeId !== undefined) {
      reservationParams.push(`officeId=${officeId}`);
    }
    reservationParams.push(`reservationId=${reservationId}`);
    if (invoiceId) {
      reservationParams.push(`invoiceId=${invoiceId}`);
    }
    if (this.companyId) {
      reservationParams.push(`companyId=${this.companyId}`);
    }
    if (organizationId) {
      reservationParams.push(`organizationId=${encodeURIComponent(organizationId)}`);
    }
    const reservationUrl = `${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}?${reservationParams.join('&')}`;
    this.router.navigateByUrl(reservationUrl);
  }
  
  ngOnDestroy(): void {
    this.costCodesSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
