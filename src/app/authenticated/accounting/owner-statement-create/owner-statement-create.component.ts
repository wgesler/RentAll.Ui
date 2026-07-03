import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../shared/base-document.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';
import { DocumentService } from '../../documents/services/document.service';
import { EmailService } from '../../email/services/email.service';

@Component({
  selector: 'app-owner-statement-create',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, TitleBarSelectComponent],
  templateUrl: './owner-statement-create.component.html',
  styleUrl: './owner-statement-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementCreateComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() line: OwnerStatementMonthLineListDisplay | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  form: FormGroup;
  organizationId = '';
  organization: OrganizationResponse | null = null;
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  contacts: ContactResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  ownerContact: ContactResponse | null = null;
  property: PropertyResponse | null = null;
  statementActivityLines: OwnerStatementPropertyActivityLineResponse[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices', 'contacts', 'property', 'previewHtml']));
  destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private commonService: CommonService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private ownerStatementService: OwnerStatementService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentHtmlService: DocumentHtmlService,
    documentService: DocumentService,
    emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.markForCheck();
    });
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadContacts();
    this.loadOrganization();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['line']) {
      return;
    }

    if (!this.line) {
      this.statementActivityLines = [];
      this.clearPreview();
      return;
    }

    this.applyLineSelections();
    this.loadProperty(this.line.propertyId);
    this.loadPropertyActivityLines();
  }

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.applyLineSelections();
      },
      error: () => {
        this.offices = [];
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'))).subscribe({
      next: rows => {
        this.accountingOffices = rows || [];
        this.applyLineSelections();
      },
      error: () => {
        this.accountingOffices = [];
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'))).subscribe({
      next: rows => {
        this.contacts = rows || [];
        this.applyLineSelections();
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOrganization(): void {
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      this.organization = cached;
      return;
    }

    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe(org => {
      this.organization = org;
      this.cdr.markForCheck();
    });
  }

  loadProperty(propertyId: string): void {
    if (!propertyId) {
      this.property = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.tryGeneratePreview();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: row => {
        this.property = row;
        this.tryGeneratePreview();
      },
      error: () => {
        this.property = null;
        this.tryGeneratePreview();
      }
    });
  }

  loadPropertyActivityLines(): void {
    if (!this.line?.propertyId || !this.line?.officeId) {
      this.statementActivityLines = [];
      this.tryGeneratePreview();
      return;
    }

    const monthRange = this.resolveMonthRange(this.line.monthDate);
    this.ownerStatementService.searchOwnerStatementPropertyActivityLines({
      officeIds: [this.line.officeId],
      propertyId: this.line.propertyId,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate
    }).pipe(take(1)).subscribe({
      next: rows => {
        this.statementActivityLines = rows || [];
        this.tryGeneratePreview();
      },
      error: () => {
        this.statementActivityLines = [];
        this.tryGeneratePreview();
      }
    });
  }
  //#endregion

  //#region Preview
  applyLineSelections(): void {
    if (!this.line) {
      return;
    }

    this.selectedOffice = this.offices.find(office => office.officeId === this.line!.officeId) || null;
    this.selectedAccountingOffice = this.accountingOffices.find(office => office.officeId === this.line!.officeId) || null;
    this.ownerContact = this.contacts.find(contact => contact.contactId === this.line!.ownerId) || null;

    this.form.patchValue({
      selectedOfficeId: this.line.officeId,
      ownerName: this.line.ownerName,
      propertyCode: this.line.propertyCode,
      statementMonth: this.line.monthDisplay
    }, { emitEvent: false });

    this.tryGeneratePreview();
  }

  tryGeneratePreview(): void {
    if (!this.line || !this.selectedOffice) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }

    this.loadOwnerStatementHtml();
  }

  loadOwnerStatementHtml(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'previewHtml');
    this.http.get(`assets/owner-statement.html?ts=${Date.now()}`, { responseType: 'text' }).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml'))).subscribe({
      next: html => {
        const processedHtml = this.replacePlaceholders(html || '');
        this.processAndSetHtml(processedHtml);
      },
      error: () => {
        this.clearPreview();
      }
    });
  }

  processAndSetHtml(html: string): void {
    const { processedHtml, extractedStyles } = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = processedHtml;
    this.previewIframeStyles = extractedStyles;
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(processedHtml, extractedStyles);
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(htmlWithStyles);
    this.iframeKey++;
    this.cdr.markForCheck();
  }

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
  }

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.iframeKey++;
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Template Merge
  replacePlaceholders(html: string): string {
    if (!this.line) {
      return html;
    }

    const monthDate = this.utilityService.parseCalendarDateInput(this.line.monthDate);
    const monthYearDisplay = this.formatMonthYear(monthDate);
    const monthDateDisplay = monthYearDisplay || this.line.monthDisplay;
    const lineDateDisplay = monthYearDisplay || this.line.monthDisplay;
    const startingBalance = this.mappingService.parseCurrencyValue(this.line.startingBalance);
    const income = this.mappingService.parseCurrencyValue(this.line.income);
    const expenses = this.mappingService.parseCurrencyValue(this.line.expenses);
    const ownerPayment = this.mappingService.parseCurrencyValue(this.line.ownerPayment);
    const endingBalance = this.mappingService.parseCurrencyValue(this.line.endingBalance);
    const incomeActivityRows = (this.statementActivityLines || [])
      .filter(activity => Number(activity.receivedIncome) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate))
      .map(activity => this.buildChargeRow(this.formatMonthDay(activity.activityDate) || lineDateDisplay, this.buildActivityDescription(activity, 'Income'), Number(activity.receivedIncome) || 0));
    const expenseActivityRows = (this.statementActivityLines || [])
      .filter(activity => Number(activity.expenses) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate))
      .map(activity => this.buildChargeRow(this.formatMonthDay(activity.activityDate) || lineDateDisplay, this.buildActivityDescription(activity, 'Expense'), Number(activity.expenses) || 0));

    const openingBalanceRows = [
      this.buildChargeRow(lineDateDisplay, 'Starting Balance', startingBalance)
    ].join('\n');
    const incomeRows = [
      ...(incomeActivityRows.length > 0 ? incomeActivityRows : [this.buildChargeRow(lineDateDisplay, 'Income', income)])
    ].join('\n');
    const chargesRows = [
      ...(expenseActivityRows.length > 0 ? expenseActivityRows : [this.buildChargeRow(lineDateDisplay, 'Expenses', expenses)])
    ].join('\n');
    const paymentsRows = [
      ...(ownerPayment !== 0 ? [this.buildChargeRow(lineDateDisplay, 'Owner Payment', ownerPayment)] : [])
    ].join('\n');
    const closingBalanceRows = [
      this.buildChargeRow(lineDateDisplay, 'Ending Balance', endingBalance)
    ].join('\n');

    const companyName = this.escapeHtml(this.organization?.name || '');
    const accountingOfficeName = this.escapeHtml(this.selectedAccountingOffice?.name || this.selectedOffice?.name || '');
    const accountingOfficeAddress = this.escapeHtml(this.getAccountingOfficeAddress());
    const accountingOfficeAddressSingleLine = this.escapeHtml(this.getAccountingOfficeAddressSingleLine());
    const accountingOfficeCityStateZip = this.escapeHtml(this.getAccountingOfficeCityStateZip());
    const accountingOfficeEmail = this.escapeHtml(this.selectedAccountingOffice?.email || '');
    const accountingOfficePhone = this.escapeHtml(this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '');
    const accountingOfficeWebsite = this.escapeHtml(this.selectedAccountingOffice?.website || '');
    const accountingOfficeBank = this.escapeHtml(this.selectedAccountingOffice?.bankName || '');
    const accountingOfficeBankRouting = this.escapeHtml(this.selectedAccountingOffice?.bankRouting || '');
    const accountingOfficeBankAccount = this.escapeHtml(this.selectedAccountingOffice?.bankAccount || '');
    const accountingOfficeSwithCode = this.escapeHtml(this.selectedAccountingOffice?.bankSwiftCode || '');
    const accountingOfficeBankAddress = this.escapeHtml(this.selectedAccountingOffice?.bankAddress || '');
    const accountingOfficeBankPhone = this.escapeHtml(this.formatterService.phoneNumber(this.selectedAccountingOffice?.bankPhone) || '');
    const officeLogoBase64 = this.resolveOfficeLogo();
    const responsiblePartiesBlock = this.buildResponsiblePartiesBlock();
    const propertySideBlock = this.buildPropertySideBlock();
    const statementName = this.escapeHtml(`Owner Statement ${this.line.propertyCode} - ${monthDateDisplay}`);

    let result = html;
    result = result.replace(/\{\{statementName\}\}/g, statementName);
    result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, responsiblePartiesBlock);
    result = result.replace(/\{\{propertySideBlock\}\}/g, propertySideBlock);
    result = result.replace(/\{\{openingBalanceLedgerLineRows\}\}/g, openingBalanceRows);
    result = result.replace(/\{\{incomeLedgerLineRows\}\}/g, incomeRows);
    result = result.replace(/\{\{chargesLedgerLineRows\}\}/g, chargesRows);
    result = result.replace(/\{\{paymentsLedgerLineRows\}\}/g, paymentsRows);
    result = result.replace(/\{\{closingBalanceLedgerLineRows\}\}/g, closingBalanceRows);
    result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, '');
    result = result.replace(/\{\{totalCharges\}\}/g, this.formatterService.currency(endingBalance));
    result = result.replace(/\{\{totalPayments\}\}/g, this.formatterService.currency(0));
    result = result.replace(/\{\{statementBalanceDue\}\}/g, this.formatterService.currency(endingBalance));
    result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
    result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{companyName\}\}/g, companyName);
    result = result.replace(/\{\{accountingOfficeName\}\}/g, accountingOfficeName);
    result = result.replace(/\{\{accountingOfficeAddress\}\}/g, accountingOfficeAddress);
    result = result.replace(/\{\{accountingOfficeAddressSingleLine\}\}/g, accountingOfficeAddressSingleLine);
    result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, accountingOfficeCityStateZip);
    result = result.replace(/\{\{accountingOfficeEmail\}\}/g, accountingOfficeEmail);
    result = result.replace(/\{\{accountingOfficePhone\}\}/g, accountingOfficePhone);
    result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, accountingOfficeWebsite);
    result = result.replace(/\{\{accountingOfficeBank\}\}/g, accountingOfficeBank);
    result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, accountingOfficeBankRouting);
    result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, accountingOfficeBankAccount);
    result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, accountingOfficeSwithCode);
    result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, accountingOfficeBankAddress);
    result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, accountingOfficeBankPhone);
    result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoBase64);
    result = result.replace(/\{\{orgLogoBase64\}\}/g, officeLogoBase64);
    result = result.replace(/\{\{startDate\}\}/g, monthDateDisplay || '');
    result = result.replace(/\{\{endDate\}\}/g, monthDateDisplay || '');
    result = result.replace(/\{\{statementDate\}\}/g, this.utilityService.todayAsCalendarDateString());
    result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(0));
    result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency(endingBalance));
    return result.replace(/\{\{[^}]+\}\}/g, '');
  }

  buildChargeRow(date: string, description: string, amount: number): string {
    return `              <tr class="ledger-line-row"><td>${this.escapeHtml(date)}</td><td>${this.escapeHtml(description)}</td><td class="amount-col">${this.formatterService.currency(amount)}</td></tr>`;
  }

  buildActivityDescription(activity: OwnerStatementPropertyActivityLineResponse, fallbackLabel: string): string {
    const documentCode = (activity.documentCode || '').trim();
    const description = (activity.description || '').trim();
    if (documentCode && description) {
      return `${documentCode} - ${description}`;
    }
    if (description) {
      return description;
    }
    if (documentCode) {
      return documentCode;
    }
    return fallbackLabel;
  }

  buildResponsiblePartiesBlock(): string {
    const ownerName = this.escapeHtml(this.line?.ownerName || '');
    const address1 = this.escapeHtml(this.ownerContact?.address1 || '');
    const address2 = this.escapeHtml(this.ownerContact?.address2 || '');
    const cityStateZip = this.escapeHtml(this.formatAddress2(this.ownerContact));
    return [
      `<span style="font-weight: bold">Client:</span> ${ownerName}`,
      address1 ? `<span style="font-weight: bold">Address:</span> ${address1}` : '',
      address2 ? `&nbsp;&nbsp;&nbsp;&nbsp;${address2}` : '',
      cityStateZip ? `&nbsp;&nbsp;&nbsp;&nbsp;${cityStateZip}` : '',
      `<span style="font-weight: bold">Statement Month:</span> ${this.escapeHtml(this.line?.monthDisplay || '')}`
    ].filter(Boolean).join('<br>');
  }

  buildPropertySideBlock(): string {
    const propertyCode = this.escapeHtml(this.line?.propertyCode || '');
    const propertyAddress1 = this.escapeHtml([this.property?.address1, this.property?.suite].filter(part => !!part).join(' '));
    const propertyAddress2 = this.escapeHtml(this.formatPropertyAddress2());
    return [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}`,
      propertyAddress1 ? `<span style="font-weight: bold">Property Address:</span> ${propertyAddress1}` : '',
      propertyAddress2 ? `&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}` : '',
      `<span style="font-weight: bold">Office:</span> ${this.escapeHtml(this.selectedOffice?.name || this.line?.officeName || '')}`
    ].filter(Boolean).join('<br>');
  }
  //#endregion

  //#region Overrides
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organization?.organizationId || this.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || this.line?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || this.line?.officeName || '',
      selectedReservationId: null,
      propertyId: this.line?.propertyId || null,
      contacts: this.contacts,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const propertyCode = (this.line?.propertyCode || 'OwnerStatement').replace(/[^a-zA-Z0-9-]/g, '');
    const month = (this.line?.monthDisplay || '').replace(/[^a-zA-Z0-9-]/g, '');
    const fileName = `OwnerStatement_${propertyCode}_${month || this.utilityService.todayAsCalendarDateString()}.pdf`;
    const config: DownloadConfig = {
      fileName,
      documentType: DocumentType.Other,
      noPreviewMessage: 'Please select an owner statement line first.',
      noSelectionMessage: 'Office or organization is missing.'
    };
    await super.onDownload(config);
  }

  override onPrint(): void {
    super.onPrint('Please select an owner statement line first.');
  }
  //#endregion

  //#region Utility
  buildForm(): FormGroup {
    return this.fb.group({
      selectedOfficeId: new FormControl(null),
      ownerName: new FormControl(''),
      propertyCode: new FormControl(''),
      statementMonth: new FormControl(''),
      ownerStatement: new FormControl('')
    });
  }

  onBack(): void {
    this.backEvent.emit();
  }

  formatAddress2(contact: ContactResponse | null): string {
    if (!contact) {
      return '';
    }
    const city = String(contact.city || '').trim();
    const state = String(contact.state || '').trim();
    const zip = String(contact.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  formatMonthYear(date: Date | null): string {
    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  formatMonthDay(value: string): string {
    const date = this.utilityService.parseCalendarDateInput(value);
    if (!date) {
      return '';
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  }

  resolveMonthRange(monthDate: string): { startDate: string | null; endDate: string | null } {
    const parsed = this.utilityService.parseCalendarDateInput(monthDate);
    if (!parsed) {
      return { startDate: monthDate || null, endDate: monthDate || null };
    }
    const firstDay = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
    return {
      startDate: this.utilityService.formatDateOnlyForApi(firstDay),
      endDate: this.utilityService.formatDateOnlyForApi(lastDay)
    };
  }

  formatPropertyAddress2(): string {
    const city = String(this.property?.city || '').trim();
    const state = String(this.property?.state || '').trim();
    const zip = String(this.property?.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  getAccountingOfficeAddress(): string {
    return [this.selectedAccountingOffice?.address1, this.selectedAccountingOffice?.suite, this.selectedAccountingOffice?.address2]
      .map(part => String(part || '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getAccountingOfficeAddressSingleLine(): string {
    const street = this.getAccountingOfficeAddress();
    const cityStateZip = this.getAccountingOfficeCityStateZip();
    return [street, cityStateZip].filter(part => part.length > 0).join(', ');
  }

  getAccountingOfficeCityStateZip(): string {
    const city = String(this.selectedAccountingOffice?.city || '').trim();
    const state = String(this.selectedAccountingOffice?.state || '').trim();
    const zip = String(this.selectedAccountingOffice?.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  resolveOfficeLogo(): string {
    const details = this.selectedAccountingOffice?.fileDetails || this.selectedOffice?.fileDetails || this.organization?.fileDetails;
    if (!details) {
      return '';
    }
    if (details.dataUrl) {
      return details.dataUrl;
    }
    if (details.file && details.contentType) {
      return `data:${details.contentType};base64,${details.file}`;
    }
    return '';
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
