import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { getBillingMethod } from '../../reservations/models/reservation-enum';
import { ReservationResponse } from '../../reservations/models/reservation-model';
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
export class InvoiceCreateComponent extends BaseDocumentComponent implements OnInit, OnDestroy {
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

    this.applyRouteParams(this.route.snapshot.queryParamMap);

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
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
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
    const normalizedHtml = this.normalizeInvoiceLayoutHtml(html);
    const result = this.documentHtmlService.processHtml(normalizedHtml, true);
    this.previewIframeHtml = result.processedHtml;
    const allStyles = result.extractedStyles;
    this.previewIframeStyles = allStyles;
    const bodyContent = this.documentHtmlService.extractBodyContent(result.processedHtml);
    const bodyClass = this.debuggingLayoutColors ? 'dbg-invoice-layout-on' : '';
    const bodyOpenTag = bodyClass ? `<body class="${bodyClass}">` : '<body>';
    const srcdoc = allStyles.trim()
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style data-dynamic-styles="true">${allStyles}</style></head>${bodyOpenTag}${bodyContent}</body></html>`
      : result.processedHtml;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(srcdoc);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
    this.iframeKey++;
    this.cdr.markForCheck();
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
    if (this.selectedReservation) {
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
      result = result.replace(/\{\{companyName\}\}/g, this.organization?.name || '');
      result = result.replace(/\{\{accountingOfficeName\}\}/g, this.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.getAccountingOfficeAddress() || '');
      result = result.replace(/\{\{accountingOfficeAddressSingleLine\}\}/g, this.getAccountingOfficeAddressSingleLine() || '');
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
      return this.applyInvoiceLayoutClass(result, 0);
    }

    const paymentLines = invoice.ledgerLines.filter(l => this.isPaymentLedgerLine(l));
    const chargeLines = invoice.ledgerLines.filter(l => !this.isPaymentLedgerLine(l));
    const totalLedgerLines = chargeLines.length + paymentLines.length;
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

    return this.applyInvoiceLayoutClass(result, totalLedgerLines);
  }

  applyInvoiceLayoutClass(html: string, totalLedgerLines: number): string {
    const layoutClasses: string[] = [];
    if (totalLedgerLines > 2) {
      layoutClasses.push('rentall-ledger-lines-many');
    }
    if (totalLedgerLines >= 5) {
      layoutClasses.push('rentall-ledger-lines-dense');
    }
    return html.replace(/<div class="page([^"]*)">/i, (_match, extraClasses: string) => {
      const cleaned = extraClasses
        .replace(/\s*rentall-ledger-lines-(?:sparse|many|dense)\s*/g, ' ')
        .trim();
      const classes = ['page', cleaned, ...layoutClasses].filter(part => part.length > 0).join(' ');
      return `<div class="${classes}">`;
    });
  }

  formatInvoiceLedgerRowHtml(line: LedgerLineResponse): string {
    const date = this.formatterService.formatDateString(line.ledgerLineDate || this.selectedInvoice!.invoiceDate) || '';
    const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const amount = this.formatterService.currency(line.amount || 0);
    return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="amount-col">${amount}</td>
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
      const pContact = this.contacts.find(c => c.contactId === this.selectedReservation.companyId) ?? contact;
      const responsibleParty = this.escapeHtml(this.utilityService.getResponsibleParty(this.selectedReservation, pContact));
      const responsiblePartyAddress1Raw = this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, pContact);
      const responsiblePartyAddress2Raw = this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, pContact);
      const responsiblePartyAddress1 = this.escapeHtml(responsiblePartyAddress1Raw);
      const responsiblePartyAddress2 = this.escapeHtml(responsiblePartyAddress2Raw);
      const responsiblePartyAddressSingleLine = [responsiblePartyAddress1, responsiblePartyAddress2].filter(part => part).join(', ');
      const responsiblePartyOccupant = this.escapeHtml(this.selectedReservation.tenantName);
      const responsiblePartyRefNo = this.escapeHtml(this.selectedReservation.referenceNo);
      const useSingleAddressLine = this.utilityService.isAddressSingleLine("Address:", responsiblePartyAddress1Raw, responsiblePartyAddress2Raw);

      const lines = [
        `<span style="font-weight: bold">Client:</span> ${responsibleParty}`,
        useSingleAddressLine
          ? `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddressSingleLine}`
          : `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}`,
        ...(!useSingleAddressLine && responsiblePartyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${responsiblePartyAddress2}`] : []),
        `<span style="font-weight: bold">Occupant:</span> ${responsiblePartyOccupant}`,
        ...(responsiblePartyRefNo ? [`<span style="font-weight: bold">Ref No:</span> ${responsiblePartyRefNo}`] : [])
      ];
      return lines.join('<br>');
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

    const lines = [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}`,
      useSingleAddressLine
        ? `<span style="font-weight: bold">Property Address:</span> ${propertyAddressSingleLine}`
        : `<span style="font-weight: bold">Property Address:</span> ${propertyAddress1}`,
      ...(!useSingleAddressLine ? [`&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}`] : []),
      `<span style="font-weight: bold">Billing Type:</span> ${billingType}`
    ];
    return lines.join('<br>');
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
    return this.getAccountingOfficeStreetLine(this.selectedAccountingOffice);
  }

  getAccountingOfficeAddressSingleLine(): string {
    if (!this.selectedAccountingOffice) return '';
    const street = this.getAccountingOfficeStreetLine(this.selectedAccountingOffice);
    const cityStateZip = this.getAccountingOfficeCityStateZip(this.selectedAccountingOffice);
    return [street, cityStateZip].filter(part => part.length > 0).join(', ');
  }

  getAccountingOfficeStreetLine(office: AccountingOfficeResponse): string {
    return [office.address1, office.suite, office.address2]
      .map(part => String(part || '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getAccountingOfficeCityStateZip(office: AccountingOfficeResponse): string {
    const city = String(office.city || '').trim();
    const state = String(office.state || '').trim();
    const zip = String(office.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => part.length > 0).join(' ');
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

  //#region Invoice layout diagnostics
  normalizeInvoiceLayoutHtml(html: string): string {
    let result = this.tagInvoiceFooterDiagnostics(this.tagInvoiceHeaderDiagnostics(html));

    if (/rentall-row-client/i.test(result)) {
      return result;
    }

    const containerBounds = this.findContainerTableBounds(result);
    if (!containerBounds) {
      return result;
    }

    const containerHtml = result.substring(containerBounds.start, containerBounds.end);
    const tbodyMatch = containerHtml.match(/<tbody[^>]*>([\s\S]*)<\/tbody>/i);
    if (!tbodyMatch) {
      return result;
    }

    let rows = this.extractDirectTbodyRows(tbodyMatch[1]).filter((row) => !/rentall-section-gap/i.test(row));
    if (rows.length > 0) {
      rows[0] = this.tagInvoiceRow(rows[0], 'rentall-row-client');
      rows[0] = this.tagInvoiceZone(rows[0], 'rentall-zone-client', 0);
      rows[0] = this.tagInvoiceZone(rows[0], 'rentall-zone-property', 1);
    }
    if (rows.length > 1) {
      rows[1] = this.tagInvoiceRow(rows[1], 'rentall-row-charges');
      rows[1] = this.tagInvoiceSubzone(rows[1], 'invoice-payments-section', 'rentall-zone-payments');
      rows[1] = this.tagInvoiceSubzone(rows[1], 'invoice-balance-due-bottom', 'rentall-zone-balance');
      rows[1] = this.tagInvoiceZone(rows[1], 'rentall-zone-charges', 0);
    }
    if (rows.length > 2) {
      rows[2] = this.tagInvoiceRow(rows[2], 'rentall-row-payment');
      rows[2] = this.tagInvoiceZone(rows[2], 'rentall-zone-payment', 0);
      rows[2] = this.tagInvoicePaymentBankZones(rows[2]);
      rows[2] = rows[2].replace(
        /<h3([^>]*style=["'][^"']*padding-left:\s*15px[^"']*["'][^>]*)>/i,
        '<h3 class="rentall-payment-indent">'
      );
      rows[2] = rows[2].replace(
        /<p([^>]*style=["']padding-left:\s*15px[^"']*["'][^>]*)>\s*(?!Thank you)/gi,
        '<p class="rentall-payment-indent">'
      );
      rows[2] = rows[2].replace(
        /<p(?![^>]*rentall-thank-you)([^>]*)>\s*Thank you/i,
        '<p class="rentall-payment-indent rentall-thank-you">Thank you'
      );
    }

    const rebuiltContainer = containerHtml.replace(
      /<tbody[^>]*>[\s\S]*<\/tbody>/i,
      `<tbody>${rows.join('')}</tbody>`
    );
    return result.substring(0, containerBounds.start) + rebuiltContainer + result.substring(containerBounds.end);
  }

  tagInvoiceHeaderDiagnostics(html: string): string {
    let result = html;

    result = result.replace(
      /<div class="header-row([^"]*)">/i,
      (match) => /rentall-header-row/i.test(match) ? match : match.replace('header-row', 'header-row rentall-header-row')
    );
    result = result.replace(
      /<div class="logo-container([^"]*)">/i,
      (match) => /rentall-zone-header-left/i.test(match) ? match : match.replace('logo-container', 'logo-container rentall-zone-header-left')
    );
    result = result.replace(
      /<div class="accounting-office-container([^"]*)">/i,
      (match) => /rentall-zone-office/i.test(match) ? match : match.replace('accounting-office-container', 'accounting-office-container rentall-zone-office')
    );
    result = result.replace(
      /class="accounting-office-logo-cell([^"]*)"/i,
      (match) => /rentall-zone-logo/i.test(match) ? match : match.replace('accounting-office-logo-cell', 'accounting-office-logo-cell rentall-zone-logo')
    );
    if (!/accounting-office-logo-wrap/i.test(result)) {
      result = result.replace(
        /(<td class="accounting-office-logo-cell[^"]*">)\s*(<img\b[^>]*>)/i,
        '$1<div class="accounting-office-logo-wrap">$2</div>'
      );
    }
    result = result.replace(
      /class="accounting-office-info-cell([^"]*)"/i,
      (match) => /rentall-zone-office-info/i.test(match) ? match : match.replace('accounting-office-info-cell', 'accounting-office-info-cell rentall-zone-office-info')
    );
    result = result.replace(
      /<div class="invoice-info-header([^"]*)">/i,
      (match) => /rentall-zone-header-right/i.test(match) ? match : match.replace('invoice-info-header', 'invoice-info-header rentall-zone-header-right')
    );

    if (!/rentall-invoice-title-block/i.test(result)) {
      result = result.replace(
        /<\/div>\s*(<!-- =+ MAIN CONTENT =+ -->)?\s*<h3([^>]*text-align:\s*center[^>]*)>\s*<span class="label">Client Invoice #:<\/span>/i,
        '</div>\n\n  <!-- ===================== MAIN CONTENT ===================== -->\n  <div class="rentall-invoice-title-block">\n    <h3$1 style="text-align: center;"><span class="label">Client Invoice #:</span>'
      );
      result = result.replace(
        /(<div class="rentall-invoice-title-block">\s*<h3[^>]*>\s*<span class="label">Client Invoice #:<\/span>[^<]*<\/span>\s*\{\{invoiceName\}\}\s*<\/h3>)(?!\s*<\/div>)/i,
        '$1\n  </div>'
      );
    }

    return result;
  }

  tagInvoiceFooterDiagnostics(html: string): string {
    let result = html;

    result = result.replace(
      /<table([^>]*\bid=["']footer["'])([^>]*)>/i,
      (match, idPart: string, rest: string) => /rentall-footer/i.test(match) ? match : `<table${idPart} class="rentall-footer"${rest}>`
    );
    result = result.replace(
      /(<table[^>]*\bid=["']footer["'][^>]*>[\s\S]*?<tbody>[\s\S]*?<tr)([^>]*)(>)/i,
      (match, prefix: string, trAttrs: string, suffix: string) => /rentall-footer-row/i.test(match) ? match : `${prefix}${trAttrs} class="rentall-footer-row"${suffix}`
    );
    result = result.replace(
      /(<table[^>]*\bid=["']footer["'][^>]*>[\s\S]*?<tr[^>]*>[\s\S]*?<td)([^>]*)(>)/i,
      (match, prefix: string, tdAttrs: string, suffix: string) => /rentall-zone-footer/i.test(match) ? match : `${prefix}${tdAttrs} class="rentall-zone-footer"${suffix}`
    );

    return result;
  }

  findContainerTableBounds(html: string): { start: number; end: number } | null {
    const startMatch = html.match(/<table[^>]*\bid=["']container["'][^>]*>/i);
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }

    const start = startMatch.index;
    let depth = 1;
    let pos = start + startMatch[0].length;
    const lower = html.toLowerCase();

    while (pos < html.length && depth > 0) {
      const nextOpen = lower.indexOf('<table', pos);
      const nextClose = lower.indexOf('</table>', pos);
      if (nextClose === -1) {
        return null;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 6;
        continue;
      }

      depth--;
      if (depth === 0) {
        return { start, end: nextClose + 8 };
      }
      pos = nextClose + 8;
    }

    return null;
  }

  extractDirectTbodyRows(tbodyHtml: string): string[] {
    const rows: string[] = [];
    let pos = 0;

    while (pos < tbodyHtml.length) {
      const trStart = tbodyHtml.toLowerCase().indexOf('<tr', pos);
      if (trStart === -1) {
        break;
      }

      const before = tbodyHtml.substring(0, trStart);
      const openTables = (before.match(/<table\b/gi) ?? []).length;
      const closeTables = (before.match(/<\/table>/gi) ?? []).length;
      if (openTables > closeTables) {
        pos = trStart + 3;
        continue;
      }

      let depth = 1;
      let scan = trStart + 3;
      let trEnd = -1;
      const lower = tbodyHtml.toLowerCase();

      while (scan < tbodyHtml.length) {
        const nextOpen = lower.indexOf('<tr', scan);
        const nextClose = lower.indexOf('</tr>', scan);
        if (nextClose === -1) {
          break;
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          scan = nextOpen + 3;
          continue;
        }

        depth--;
        if (depth === 0) {
          trEnd = nextClose + 5;
          break;
        }

        scan = nextClose + 5;
      }

      if (trEnd === -1) {
        break;
      }

      rows.push(tbodyHtml.substring(trStart, trEnd));
      pos = trEnd;
    }

    return rows;
  }

  tagInvoiceRow(rowHtml: string, classNames: string): string {
    if (/class=["']/i.test(rowHtml)) {
      return rowHtml.replace(/<tr([^>]*?)class=["']([^"']*)["']/i, (match, prefix: string, existing: string) => {
        const additions = classNames.split(/\s+/).filter((name) => name && !existing.includes(name));
        if (additions.length === 0) {
          return match;
        }
        return `<tr${prefix}class="${existing} ${additions.join(' ')}"`;
      });
    }
    return rowHtml.replace(/<tr/i, `<tr class="${classNames}"`);
  }

  addClassToElementTag(tagHtml: string, className: string): string {
    if (new RegExp(`\\b${className}\\b`).test(tagHtml)) {
      return tagHtml;
    }
    if (/class=["']/i.test(tagHtml)) {
      return tagHtml.replace(/class=["']([^"']*)["']/i, (_match, existing: string) => `class="${existing} ${className}"`);
    }
    return tagHtml.replace(/<(\w+)/i, `<$1 class="${className}"`);
  }

  tagInvoiceZone(rowHtml: string, zoneClass: string, zoneIndex: number): string {
    const pattern = /<div class="[^"]*\bborder\b[^"]*"/gi;
    let matchIndex = 0;
    return rowHtml.replace(pattern, (match) => {
      if (matchIndex !== zoneIndex) {
        matchIndex++;
        return match;
      }
      matchIndex++;
      return this.addClassToElementTag(match, zoneClass);
    });
  }

  tagInvoiceSubzone(rowHtml: string, subzoneClass: string, rentallClass: string): string {
    const pattern = new RegExp(`<div class="([^"]*\\b${subzoneClass}\\b[^"]*)"`, 'i');
    return rowHtml.replace(pattern, (match) => this.addClassToElementTag(match, rentallClass));
  }

  tagInvoicePaymentBankZones(rowHtml: string): string {
    const pattern = /<div class="[^"]*\bborder\b[^"]*"/gi;
    let bankIndex = 0;
    return rowHtml.replace(pattern, (match) => {
      if (/rentall-zone-payment/i.test(match)) {
        return match;
      }
      const zoneClass = bankIndex === 0 ? 'rentall-zone-bank-left' : 'rentall-zone-bank-right';
      bankIndex++;
      return this.addClassToElementTag(match, zoneClass);
    });
  }
  //#endregion

  //#region Utility Methods
  goBack(): void {
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
