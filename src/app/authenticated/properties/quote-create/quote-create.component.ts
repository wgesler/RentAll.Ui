import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, Subscription, filter, finalize, firstValueFrom, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailService } from '../../email/services/email.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { PropertyResponse } from '../models/property.model';
import { PropertyService } from '../services/property.service';
import { PropertyListingShareService } from '../services/property-listing-share.service';
import { ToastrService } from 'ngx-toastr';
import { QuoteComponent } from './quote.component';

interface QuotePropertyListingLink {
  propertyId: string;
  propertyCode: string;
  address: string;
  area: string;
  beds: string;
  price: string;
  parking: string;
  url: string;
  officeId: number | null;
}

@Component({
  standalone: true,
  selector: 'app-quote-create',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, QuoteComponent, TitleBarSelectComponent],
  templateUrl: './quote-create.component.html',
  styleUrl: './quote-create.component.scss'
})
export class QuoteCreateComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() propertyIds: string[] = [];
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  readonly quoteSnapshotQueryKeys = { preparedForName: 'qpfn', quoteEmail: 'qem', agentName: 'qag', quoteValidFor: 'qvf'};

  form: FormGroup;
  isLoadingLinks = false;
  isDownloading = false;
  isSubmitting = false;  
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  returnTo: string = 'property-list';
  propertyListingLinks: QuotePropertyListingLink[] = [];
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  officesSubscription?: Subscription;
  accountingOfficesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  queryParamsSubscription?: Subscription;
  formSubscription?: Subscription;
  headerOfficeId: number | null = null;
  firstPropertyOfficeId: number | null = null;
  isViewMode = false;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices', 'quoteTemplate']));

  constructor(
    private fb: FormBuilder,
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private globalSelectionService: GlobalSelectionService,
    private emailCreateDraftService: EmailCreateDraftService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private documentReloadService: DocumentReloadService,
    private propertyService: PropertyService,
    private propertyListingShareService: PropertyListingShareService,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    documentHtmlService: DocumentHtmlService,
    toastr: ToastrService,
    emailService: EmailService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
  }

  //#region Quote-Create
  ngOnInit(): void {
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      this.isPageReady = true;
    });

    this.headerOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.firstPropertyOfficeId === null) {
        this.headerOfficeId = officeId;
        this.applyHeaderOfficeSelection();
      }
    });

    this.loadOffices();
    this.loadAccountingOffices();
    this.loadQuoteTemplate();
    this.queryParamsSubscription?.unsubscribe();
    this.queryParamsSubscription = this.route.queryParams.subscribe(params => {
      this.isViewMode = String(params['view'] || '').toLowerCase() === 'true';
      const queryPropertyIds = String(params['propertyIds'] || '')
        .split(',')
        .map(propertyId => decodeURIComponent(propertyId || '').trim())
        .filter(propertyId => propertyId.length > 0);
      if (queryPropertyIds.length > 0) {
        const mergedPropertyIds = new Set([...(this.propertyIds || []), ...queryPropertyIds]);
        this.propertyIds = Array.from(mergedPropertyIds);
      }
      this.returnTo = String(params['returnTo'] || 'property-list');
      this.patchQuoteSnapshotFromQueryParams(params);
      this.loadPropertyListingLinks();
    });
    this.formSubscription?.unsubscribe();
    this.formSubscription = this.form.valueChanges.subscribe(() => {
      this.refreshQuoteDocumentPreview();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyIds'] && !changes['propertyIds'].firstChange) {
      this.loadPropertyListingLinks();
    }
  }

  loadQuoteTemplate(): void {
    this.http.get('assets/quote.html', { responseType: 'text' }).pipe(take(1),finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'quoteTemplate');})).subscribe({
      next: (html: string) => {
        this.form.patchValue({ quoteHtml: html || '' }, { emitEvent: false });
        this.refreshQuoteDocumentPreview();
      },
      error: () => {
        this.form.patchValue({ quoteHtml: '' }, { emitEvent: false });
        this.refreshQuoteDocumentPreview();
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      quoteHtml: new FormControl<string>(''),
      preparedForName: new FormControl<string>(''),
      quoteEmail: new FormControl<string>(''),
      agentName: new FormControl<string>(this.currentUserFullName),
      quoteValidFor: new FormControl<string>(this.getDefaultQuoteValidUntilDate())
    });
  }

  patchQuoteSnapshotFromQueryParams(params: Params): void {
    const k = this.quoteSnapshotQueryKeys;
    const keys = [k.preparedForName, k.quoteEmail, k.agentName, k.quoteValidFor];
    if (!keys.some(key => params[key] !== undefined && params[key] !== null)) {
      return;
    }

    const cell = (paramKey: string) => String(params[paramKey] ?? '').trim();

    this.form.patchValue({
      preparedForName: cell(k.preparedForName),
      quoteEmail: cell(k.quoteEmail),
      agentName: cell(k.agentName),
      quoteValidFor: cell(k.quoteValidFor)
    }, { emitEvent: true });
  }

  appendQuoteSnapshotQueryParts(queryParams: string[]): void {
    const k = this.quoteSnapshotQueryKeys;
    const enc = (controlName: 'preparedForName' | 'quoteEmail' | 'agentName' | 'quoteValidFor') =>
      encodeURIComponent(String(this.form.get(controlName)?.value ?? '').trim());
    queryParams.push(`${k.preparedForName}=${enc('preparedForName')}`);
    queryParams.push(`${k.quoteEmail}=${enc('quoteEmail')}`);
    queryParams.push(`${k.agentName}=${enc('agentName')}`);
    queryParams.push(`${k.quoteValidFor}=${enc('quoteValidFor')}`);
  }

  listingShareUrlsPresentAndValid(): boolean {
    if (!this.propertyListingLinks.length) {
      return true;
    }
    for (const link of this.propertyListingLinks) {
      const rawUrl = this.getResolvedListingUrl(link);
      if (!rawUrl) {
        this.toastr.error('A property listing link is missing. Reload the quote or check the share-link API.', 'Listing link');
        return false;
      }
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        this.toastr.error('A property listing link is not a valid URL.', 'Listing link');
        return false;
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        this.toastr.error('A property listing link uses an unsupported URL scheme.', 'Listing link');
        return false;
      }
    }
    return true;
  }

  refreshQuoteDocumentPreview(): void {
    const rawTemplate = this.form.get('quoteHtml')?.value?.trim() || '';
    if (!rawTemplate) {
      this.previewIframeHtml = '';
      this.previewIframeStyles = '';
      this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
      this.iframeKey++;
      return;
    }

    const replaced = this.replacePlaceholders(rawTemplate);
    const result = this.documentHtmlService.processHtml(replaced, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(result.processedHtml);
    this.iframeKey++;
  }

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
    this.resizePreviewIframeToContent();
    window.setTimeout(() => this.resizePreviewIframeToContent(), 150);
    window.setTimeout(() => this.resizePreviewIframeToContent(), 500);
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
    const htmlEl = doc.documentElement;
    const contentHeight = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      htmlEl?.clientHeight || 0,
      htmlEl?.scrollHeight || 0,
      htmlEl?.offsetHeight || 0
    );

    if (contentHeight > 0) {
      iframe.style.height = `${contentHeight + 12}px`;
    }
  }

  applyHeaderOfficeSelection(): void {
    this.selectedOffice = this.offices.find(office => office.officeId === this.headerOfficeId) || null;
    this.selectedAccountingOffice = this.accountingOffices.find(office => office.officeId === this.headerOfficeId) || null;
    this.refreshQuoteDocumentPreview();
  }

  onOfficeChanged(officeId: number | null): void {
    this.headerOfficeId = officeId;
    this.applyHeaderOfficeSelection();
  }

  onViewOfficeChange(value: string | number | null): void {
    if (value == null || value === '') {
      this.onOfficeChanged(null);
      return;
    }
    this.onOfficeChanged(Number(value));
  }

  viewQuote(): void {
    const url = `${RouterUrl.QuoteCreate}${this.buildQuoteCreateQueryString(true)}`;
    void this.router.navigateByUrl(url).then(navigated => {
      if (navigated) {
        this.refreshQuoteDocumentPreview();
      }
    });
  }

  buildQuoteCreateQueryString(includeView: boolean): string {
    const selectedPropertyIds = Array.from(new Set((this.propertyIds || []).map(propertyId => String(propertyId || '').trim()).filter(propertyId => propertyId.length > 0)));
    const queryParams: string[] = [];
    if (includeView) {
      queryParams.push('view=true');
    }
    if (selectedPropertyIds.length > 0) {
      queryParams.push(`propertyIds=${selectedPropertyIds.join(',')}`);
    }
    if (this.returnTo) {
      queryParams.push(`returnTo=${encodeURIComponent(this.returnTo)}`);
    }
    this.appendQuoteSnapshotQueryParts(queryParams);
    return queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  }

  async saveQuote(): Promise<void> {
    const rawTemplate = this.form.get('quoteHtml')?.value?.trim() || '';
    if (!rawTemplate || !this.previewIframeHtml) {
      this.toastr.warning('Quote preview is not available.', 'Missing Preview');
      return;
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    const officeId = this.selectedOffice?.officeId ?? this.headerOfficeId ?? this.authService.getUser()?.defaultOfficeId ?? null;
    if (!organizationId || officeId == null) {
      this.toastr.warning('Organization or Office not available', 'Missing Selection');
      return;
    }

    this.isSubmitting = true;
    try {
      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles);
      const fileName = `Quote_${this.utilityService.todayAsCalendarDateString()}.pdf`;

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId,
        officeId,
        officeName: this.selectedOffice?.name || this.companyNameDisplay || '',
        propertyId: this.propertyListingLinks[0]?.propertyId ?? null,
        reservationId: null,
        documentTypeId: Number(DocumentType.Other),
        fileName
      };

      await firstValueFrom(this.documentService.generate(generateDto));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
      this.iframeKey++;
    } catch (err: unknown) {
      console.error('Quote save error:', err);
      this.toastr.error('Error generating quote document.', 'Error');
      this.iframeKey++;
    } finally {
      this.isSubmitting = false;
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    if (!organizationId) {
      this.offices = [];
      this.selectedOffice = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1),finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');})).subscribe({
      next: () => {
        this.officesSubscription?.unsubscribe();
        this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
          this.offices = offices || [];
          this.applyHeaderOfficeSelection();
        });
      },
      error: () => {
        this.offices = [];
        this.selectedOffice = null;
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1),finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');})).subscribe({
      next: () => {
        this.accountingOfficesSubscription?.unsubscribe();
        this.accountingOfficesSubscription = this.accountingOfficeService.getAllAccountingOffices().subscribe(offices => {
          this.accountingOffices = offices || [];
          this.applyHeaderOfficeSelection();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.selectedAccountingOffice = null;
      }
    });
  }

  loadPropertyListingLinks(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'listingLinks');
    const uniquePropertyIds = Array.from(new Set((this.propertyIds || [])
      .map(propertyId => String(propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)));
    if (uniquePropertyIds.length === 0) {
      this.propertyListingLinks = [];
      this.isLoadingLinks = false;
      this.refreshQuoteDocumentPreview();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'listingLinks');
      return;
    }

    this.isLoadingLinks = true;
    const requestedCount = uniquePropertyIds.length;
    Promise.all(uniquePropertyIds.map(async propertyId => {
      try {
        const property = await firstValueFrom(this.propertyService.getPropertyByGuid(propertyId));
        const shareResponse = await firstValueFrom(this.propertyListingShareService.createPropertyShareLink(propertyId));
        const token = shareResponse.token;
        const listingUrl = this.propertyListingShareService.getPublicListingUrl(token);
        if (!listingUrl) {
          console.error('Quote listing URL missing: set publicListingUiOrigin in environment or open RentAll in a normal browser context.', {
            propertyId
          });
          return null;
        }
        return {
          propertyId,
          propertyCode: property.propertyCode || propertyId,
          address: this.getPropertyAddressText(property),
          area: this.getAreaText(property),
          beds: `${property.bedrooms ?? 0}/${property.bathrooms ?? 0}`,
          price: this.getPriceText(property),
          parking: property.parking ? 'Yes' : 'No',
          url: listingUrl,
          officeId: property.officeId ?? null
        } as QuotePropertyListingLink;
      } catch (err: unknown) {
        console.error('Quote listing link failed', { propertyId }, err);
        return null;
      }
    })).then(links => {
      const resolved = links.filter((link): link is QuotePropertyListingLink => link !== null);
      if (resolved.length < requestedCount) {
        this.toastr.warning('Some properties could not generate listing links. Check the API or network.', 'Quote links');
      }
      if (!environment.production && environment.quoteListingHrefLogDebug && resolved.length > 0) {
        console.info('[Quote listing href debug]', resolved.map(l => ({ propertyCode: l.propertyCode, url: l.url })));
      }
      const previousPriceByPropertyId = new Map(this.propertyListingLinks.map(link => [link.propertyId, link.price]));
      this.propertyListingLinks = resolved.map(link => {
        if (previousPriceByPropertyId.has(link.propertyId)) {
          return { ...link, price: previousPriceByPropertyId.get(link.propertyId)! };
        }
        return link;
      });
      this.firstPropertyOfficeId = this.propertyListingLinks[0]?.officeId ?? null;
      this.headerOfficeId = this.firstPropertyOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue();
      this.applyHeaderOfficeSelection();
    }).finally(() => {
      this.isLoadingLinks = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'listingLinks');
    });
  }
  //#endregion

  //#region Get Methods
  get officeTitleBarOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get currentUserFullName(): string {
    const currentUser = this.authService.getUser();
    const fullName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    return fullName || 'Agent';
  }

  get officeLogoUrl(): string | null {
    const fileDetails = this.selectedAccountingOffice?.fileDetails || this.selectedOffice?.fileDetails;
    if (!fileDetails) {
      return null;
    }
    if (fileDetails.dataUrl) {
      return fileDetails.dataUrl;
    }
    if (fileDetails.file) {
      if (fileDetails.file.startsWith('data:')) {
        return fileDetails.file;
      }
      return `data:${fileDetails.contentType || 'image/png'};base64,${fileDetails.file}`;
    }
    return null;
  }

  get companyNameDisplay(): string {
    const organizationName = String((this.authService.getUser() as any)?.organizationName || '').trim() || 'AvenueWest';
    const officeName = this.selectedAccountingOffice?.name?.trim() || this.selectedOffice?.name?.trim() || '';
    if (!officeName) {
      return organizationName;
    }
    if (officeName.toLowerCase().startsWith(organizationName.toLowerCase())) {
      return officeName;
    }
    return `${organizationName} ${officeName}`.trim();
  }

  get companyAddressLine1(): string {
    const address1 = this.selectedAccountingOffice?.address1?.trim() || this.selectedOffice?.address1?.trim() || '';
    const suite = this.selectedAccountingOffice?.suite?.trim() || this.selectedOffice?.suite?.trim() || '';
    return [address1, suite].filter(Boolean).join(' ');
  }

  get companyAddressLine2(): string {
    const city = this.selectedAccountingOffice?.city?.trim() || this.selectedOffice?.city?.trim() || '';
    const state = this.selectedAccountingOffice?.state?.trim() || this.selectedOffice?.state?.trim() || '';
    const zip = this.selectedAccountingOffice?.zip?.trim() || this.selectedOffice?.zip?.trim() || '';
    const stateZip = [state, zip].filter(Boolean).join(' ');
    return [city, stateZip].filter(Boolean).join(', ');
  }

  get currentUserEmail(): string {
    return this.selectedAccountingOffice?.email?.trim() || this.authService.getUser()?.email || '';
  }
  //#endregion

  //#region Formatting Methods
  getPropertyAddressText(property: PropertyResponse): string {
    const address1 = [property.address1, property.suite]
      .map(value => String(value || '').trim())
      .filter(value => value.length > 0)
      .join(' ');
    const city = String(property.city || '').trim();
    const state = String(property.state || '').trim();
    const zip = String(property.zip || '').trim();
    const stateZip = [state, zip].filter(value => value.length > 0).join(' ');
    const address2 = [city, stateZip].filter(value => value.length > 0).join(', ');
    return [address1, address2].filter(value => value.length > 0).join(', ');
  }

  getAreaText(property: PropertyResponse): string {
    return property.neighborhood?.trim() || property.city?.trim() || property.officeName?.trim() || '';
  }

  getPriceText(property: PropertyResponse): string {
    const monthly = Number(property.monthlyRate || 0);
    const daily = Number(property.dailyRate || 0);
    return `$${this.formatWholeCurrency(monthly)}/$${this.formatWholeCurrency(daily)}`;
  }

  formatWholeCurrency(value: number): string {
    const normalized = Number.isFinite(value) ? value : 0;
    return String(Math.round(normalized));
  }

  getDefaultQuoteValidUntilDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toLocaleDateString('en-US');
  }
  //#endregion

  //#region Quote Template Replacement
  escapeHtml(text: string | null | undefined): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  escapeHtmlAttribute(text: string | null | undefined): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  getResolvedListingUrl(link: QuotePropertyListingLink): string {
    const diagnostic = String(environment.quoteListingHrefDiagnostic || '').trim();
    const chosen = diagnostic.length > 0 ? diagnostic : link.url || '';
    return this.stripSurroundingAngleBracketsFromUrl(String(chosen).trim());
  }

  stripSurroundingAngleBracketsFromUrl(url: string): string {
    const trimmed = String(url || '').trim();
    if (trimmed.length >= 2 && trimmed.startsWith('<') && trimmed.endsWith('>')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  replacePlaceholders(html: string): string {
    let result = html;

    const logo = this.officeLogoUrl || '';
    if (logo) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, logo);
    } else {
      result = result.replace(/<img[^>]*src=["']\{\{officeLogoBase64\}\}["'][^>]*\/?>/gi, '');
      result = result.replace(/\{\{officeLogoBase64\}\}/g, '');
    }

    result = result.replace(/\{\{companyNameDisplay\}\}/g, this.escapeHtml(this.companyNameDisplay));
    result = result.replace(/\{\{companyAddressLine1\}\}/g, this.escapeHtml(this.companyAddressLine1));
    result = result.replace(/\{\{companyAddressLine2\}\}/g, this.escapeHtml(this.companyAddressLine2));
    result = result.replace(/\{\{quoteContactEmail\}\}/g, this.escapeHtml(this.currentUserEmail));

    result = result.replace(/\{\{preparedForName\}\}/g, this.escapeHtml(this.form.get('preparedForName')?.value ?? ''));
    result = result.replace(/\{\{quoteEmail\}\}/g, this.escapeHtml(this.form.get('quoteEmail')?.value ?? ''));
    result = result.replace(/\{\{agentName\}\}/g, this.escapeHtml(this.form.get('agentName')?.value ?? ''));
    result = result.replace(/\{\{quoteValidThru\}\}/g, this.escapeHtml(this.form.get('quoteValidFor')?.value ?? ''));

    result = result.replace(/\{\{propertyListingRows\}\}/g, this.buildPropertyListingRowsHtml());

    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }

  buildPropertyListingRowsHtml(): string {
    if (!this.propertyListingLinks.length) {
      return '<tr><td colspan="6">No property listings selected.</td></tr>';
    }
    return this.propertyListingLinks.map(link => {
      const rawUrl = this.getResolvedListingUrl(link);
      const href = this.escapeHtmlAttribute(rawUrl);
      const linkCell = `<td><a href="${href}" class="quote-link" target="_blank" rel="noopener noreferrer">View Listing</a></td>`;
      return `<tr class="ledger-line-row">
        <td>${this.escapeHtml(link.propertyCode)}</td>
        <td>${this.escapeHtml(link.address)}</td>
        <td class="text-center">${this.escapeHtml(link.beds)}</td>
        <td class="text-center">${this.escapeHtml(link.price)}</td>
        <td class="text-center">${this.escapeHtml(link.parking)}</td>
        ${linkCell}
      </tr>`;
    }).join('\n');
  }
  //#endregion

  //#region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    const currentUser = this.authService.getUser();
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: currentUser?.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId ?? this.headerOfficeId ?? currentUser?.defaultOfficeId ?? null,
      selectedOfficeName: this.selectedOffice?.name || this.companyNameDisplay || '',
      selectedReservationId: null,
      propertyId: this.propertyListingLinks[0]?.propertyId ?? null,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onEmail(_emailConfig?: EmailConfig): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Please load quote preview before emailing.', 'No Preview');
      return;
    }

    if (!this.listingShareUrlsPresentAndValid()) {
      return;
    }

    const toEmail = String(this.form.get('quoteEmail')?.value || '').trim();
    const toName = String(this.form.get('preparedForName')?.value || '').trim();

    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    if (!fromEmail || !fromName) {
      this.toastr.warning('Current user email sender information is not available.', 'No Sender');
      return;
    }

    const attachmentFileName = `Quote_${this.utilityService.todayAsCalendarDateString()}.pdf`;
    const salutationFirstName = this.getQuoteEmailRecipientFirstName(toName);
    const helloPlain = salutationFirstName ? `Hello ${salutationFirstName},\n\n` : `Hello,\n\n`;
    const helloHtml = salutationFirstName
      ? `<p>Hello ${this.escapeHtml(salutationFirstName)},</p>`
      : `<p>Hello,</p>`;
    const senderPhoneRaw = String(currentUser?.phone || '').trim();
    const senderPhone = senderPhoneRaw ? (this.formatterService.phoneNumber(senderPhoneRaw) || '').trim() : '';
    const plainTextContent =
      helloPlain +
      `Please find your corporate housing proposal attached.\n\n` +
      `Regards,\n${fromName}` +
      (senderPhone ? `\n${senderPhone}` : '') +
      `\n`;
    const signatureHtml =
      `<p>Regards,<br />${this.escapeHtml(fromName)}` +
      (senderPhone ? `<br />${this.escapeHtml(senderPhone)}` : '') +
      `</p>`;
    const emailBodyHtml =
      helloHtml +
      `<p>Please find your corporate housing proposal attached.</p>` +
      signatureHtml;

    const emailConfig: EmailConfig = {
      subject: 'Corporate Housing Proposal',
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.Other,
      emailType: EmailType.Other,
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

  override onPrint(): void {
    super.onPrint('Please load quote preview before printing.');
  }

  override async onDownload(): Promise<void> {
    const fileName = `Quote_${this.utilityService.todayAsCalendarDateString()}.pdf`;
    const downloadConfig: DownloadConfig = {
      fileName,
      documentType: DocumentType.Other,
      noPreviewMessage: 'Please load quote preview before downloading.',
      noSelectionMessage: 'Organization or Office not available'
    };
    await super.onDownload(downloadConfig);
  }
  //#endregion

  //#region Utility Methods
  getQuoteEmailRecipientFirstName(preparedForDisplayName: string): string {
    const trimmed = String(preparedForDisplayName || '').trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.split(/\s+/)[0] || trimmed;
  }

  back(): void {
    if (this.isViewMode) {
      this.router.navigateByUrl(`${RouterUrl.QuoteCreate}${this.buildQuoteCreateQueryString(false)}`);
      return;
    }

    if (this.returnTo === 'reservation-board') {
      this.router.navigateByUrl(RouterUrl.ReservationBoard);
      return;
    }

    this.router.navigateByUrl(RouterUrl.PropertyList);
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.accountingOfficesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
    this.formSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
