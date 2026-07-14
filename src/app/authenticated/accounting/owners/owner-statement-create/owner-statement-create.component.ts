import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, catchError, filter, finalize, firstValueFrom, forkJoin, of, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../../app.routes';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { DocumentExportService } from '../../../../services/document-export.service';
import { DocumentHtmlService } from '../../../../services/document-html.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { EntityType } from '../../../contacts/models/contact-enum';
import { EmailType } from '../../../email/models/email.enum';
import { EmailHtmlResponse } from '../../../email/models/email-html.model';
import { EmailCreateDraftService } from '../../../email/services/email-create-draft.service';
import { EmailHtmlService } from '../../../email/services/email-html.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OrganizationResponse } from '../../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { OfficeService } from '../../../organizations/services/office.service';
import { PropertyResponse } from '../../../properties/models/property.model';
import { PropertyHtmlResponse } from '../../../properties/models/property-html.model';
import { PropertyService } from '../../../properties/services/property.service';
import { PropertyHtmlService } from '../../../properties/services/property-html.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../../shared/base-document.component';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from '../../models/owner-statement.model';
import { OwnerStatementService } from '../../services/owner-statement.service';
import { DocumentService } from '../../../documents/services/document.service';
import { EmailService } from '../../../email/services/email.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-owner-statement-create',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './owner-statement-create.component.html',
  styleUrl: './owner-statement-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementCreateComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() line: OwnerStatementMonthLineListDisplay | null = null;
  @Input() shellMode = true;
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
  propertyHtml: PropertyHtmlResponse | null = null;
  statementActivityLines: OwnerStatementPropertyActivityLineResponse[] = [];
  statementAccrualActivityLines: OwnerStatementPropertyActivityLineResponse[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isSubmitting = false;
  debuggingHtml = environment.local || environment.dev;
  emailHtml: EmailHtmlResponse | null = null;
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
    private propertyHtmlService: PropertyHtmlService,
    private ownerStatementService: OwnerStatementService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentHtmlService: DocumentHtmlService,
    documentService: DocumentService,
    emailService: EmailService,
    private documentReloadService: DocumentReloadService,
    private emailHtmlService: EmailHtmlService,
    private emailCreateDraftService: EmailCreateDraftService,
    private router: Router,
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
    this.loadEmailHtml();
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1)).subscribe({
      next: html => {
        this.emailHtml = html;
        this.cdr.markForCheck();
      },
      error: () => {
        this.emailHtml = null;
      }
    });
  }

  async saveOwnerStatement(): Promise<void> {
    if (!this.previewIframeHtml || !this.line) {
      this.toastr.warning('No owner statement preview is available to save.', 'No Preview');
      return;
    }

    this.isSubmitting = true;
    this.cdr.markForCheck();
    try {
      const config = this.getDocumentConfig();
      if (!config.organizationId || !config.selectedOfficeId) {
        this.toastr.warning('Office or organization is not available.', 'Missing Data');
        return;
      }

      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles
      );

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: config.propertyId || null,
        reservationId: null,
        documentTypeId: DocumentType.OwnerStatement,
        fileName: this.getOwnerStatementFileName(),
        generatePdf: true
      };

      await firstValueFrom(this.documentService.generate(generateDto).pipe(take(1)));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
      this.iframeKey++;
    } catch (error) {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(
        detail ? `Document generation failed. ${detail}` : 'Document generation failed. Please try again.',
        'Error'
      );
      this.iframeKey++;
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['line']) {
      return;
    }

    if (!this.line) {
      this.statementActivityLines = [];
      this.statementAccrualActivityLines = [];
      this.clearPreview();
      return;
    }

    this.applyLineSelections();
    this.loadProperty(this.line.propertyId);
    this.loadPropertyActivityLines();
  }

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.applyLineSelections();
      });
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'))).subscribe(() => {
      this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
        this.accountingOffices = accountingOffices || [];
        this.applyLineSelections();
      });
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
      this.propertyHtml = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.tryGeneratePreview();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    forkJoin({
      property: this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)),
      propertyHtml: this.propertyHtmlService.getPropertyHtmlByPropertyId(propertyId).pipe(
        take(1),
        catchError(() => of(null))
      )
    }).pipe(finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: ({ property, propertyHtml }) => {
        this.property = property;
        this.propertyHtml = propertyHtml;
        this.tryGeneratePreview();
      },
      error: () => {
        this.property = null;
        this.propertyHtml = null;
        this.tryGeneratePreview();
      }
    });
  }

  loadPropertyActivityLines(): void {
    if (!this.line?.propertyId || !this.line?.officeId) {
      this.statementActivityLines = [];
      this.statementAccrualActivityLines = [];
      this.tryGeneratePreview();
      return;
    }

    const periodStartDate = (this.line.periodStartDate || this.line.monthDate || '').trim();
    const periodEndDate = (this.line.periodEndDate || this.line.monthDate || periodStartDate).trim();
    const propertyId = this.line.propertyId;
    const searchRequest = {
      officeIds: [this.line.officeId],
      propertyId,
      startDate: periodStartDate || null,
      endDate: periodEndDate || null
    };

    forkJoin({
      cashLines: this.ownerStatementService.searchOwnerStatementPropertyActivityLines(searchRequest),
      accrualLines: this.ownerStatementService.searchOwnerStatementAccrualPropertyActivityLines(searchRequest)
    }).pipe(take(1)).subscribe({
      next: ({ cashLines, accrualLines }) => {
        this.statementActivityLines = cashLines || [];
        this.statementAccrualActivityLines = accrualLines || [];
        this.tryGeneratePreview();
      },
      error: () => {
        this.statementActivityLines = [];
        this.statementAccrualActivityLines = [];
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
      statementMonth: this.getStatementMonthLabel()
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

    if (this.debuggingHtml) {
      this.http.get(`assets/owner-statement.html?ts=${Date.now()}`, { responseType: 'text' }).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml'))).subscribe({
        next: html => {
          const processedHtml = this.replacePlaceholders(html || '');
          this.processAndSetHtml(processedHtml);
        },
        error: () => {
          this.clearPreview();
        }
      });
      return;
    }

    if (!this.property?.propertyId) {
      this.clearPreview();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }

    const templateHtml = (this.propertyHtml?.ownerStatement || '').trim();
    if (templateHtml) {
      const processedHtml = this.replacePlaceholders(templateHtml);
      this.processAndSetHtml(processedHtml);
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }

    this.clearPreview();
    this.toastr.warning('No owner statement HTML template found for this property.', 'No Template');
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
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

    const periodStartDate = (this.line.periodStartDate || this.line.monthDate || '').trim();
    const periodEndDate = (this.line.periodEndDate || this.line.monthDate || '').trim();
    const periodDisplay = this.line.monthDisplay || '';
    const periodTitle = this.mappingService.formatOwnerStatementPeriodTitle(periodStartDate, periodEndDate) || periodDisplay;
    const openingBalanceDate = this.formatPreviousMonthEndDate(periodStartDate);
    const closingBalanceDate = this.formatReportingMonthEndDate(periodEndDate) || this.formatFullDate(periodEndDate);
    const startingBalance = this.mappingService.parseCurrencyValue(this.line.startingBalance);
    const income = this.mappingService.parseCurrencyValue(this.line.income);
    const expenses = this.mappingService.parseCurrencyValue(this.line.expenses);
    const ownerPayment = this.mappingService.parseCurrencyValue(this.line.ownerPayment);
    const endingBalance = this.mappingService.parseCurrencyValue(this.line.endingBalance);
    const incomeActivities = (this.statementActivityLines || [])
      .filter(activity => Number(activity.receivedIncome) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate));
    const expenseActivities = (this.statementActivityLines || [])
      .filter(activity => Number(activity.expenses) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate));

    let runningTotal = startingBalance;
    const openingBalanceRows = [
      this.buildSummaryBalanceRow('Starting Balance', openingBalanceDate, runningTotal, false)
    ].join('\n');

    let incomeRows = '';
    const unpaidIncomeEntries = this.getUnpaidAccrualEntries();
    const incomeLineRows: { sortDate: string; html: string }[] = [];

    if (incomeActivities.length > 0) {
      incomeActivities.forEach(activity => {
        const amount = Number(activity.receivedIncome) || 0;
        runningTotal += amount;
        const { refNo, description } = this.parseActivityRefAndDescription(activity, 'Income');
        incomeLineRows.push({
          sortDate: activity.activityDate,
          html: this.buildChargeRow(
            this.formatActivityDateForStatement(activity, closingBalanceDate),
            refNo,
            description,
            amount,
            runningTotal)
        });
      });
    } else if (income !== 0) {
      runningTotal += income;
      incomeLineRows.push({
        sortDate: periodEndDate,
        html: this.buildChargeRow(closingBalanceDate, '', 'Income', income, runningTotal)
      });
    }

    unpaidIncomeEntries.forEach(entry => {
      const { refNo, description } = this.parseActivityRefAndDescription(entry.line, 'Income');
      incomeLineRows.push({
        sortDate: entry.line.activityDate,
        html: this.buildChargeRow(
          this.formatActivityDateForStatement(entry.line, closingBalanceDate),
          refNo,
          description,
          entry.unpaidAmount,
          runningTotal,
          true)
      });
    });

    incomeLineRows.sort((a, b) => this.utilityService.compareCalendarDateStrings(a.sortDate, b.sortDate));
    incomeRows = incomeLineRows.map(row => row.html).join('\n');
    if (!incomeRows) {
      incomeRows = this.buildBlankLedgerRow();
    }

    let chargesRows = '';
    if (expenseActivities.length > 0) {
      chargesRows = expenseActivities.map(activity => {
        const amount = Number(activity.expenses) || 0;
        runningTotal -= amount;
        const { refNo, description } = this.parseActivityRefAndDescription(activity, 'Expense');
        return this.buildChargeRow(
          this.formatActivityDateForStatement(activity, closingBalanceDate),
          refNo,
          description,
          amount,
          runningTotal);
      }).join('\n');
    } else if (expenses !== 0) {
      runningTotal -= expenses;
      chargesRows = this.buildChargeRow(closingBalanceDate, '', 'Expenses', expenses, runningTotal);
    }
    if (!chargesRows) {
      chargesRows = this.buildBlankLedgerRow();
    }

    let paymentsRows = '';
    if (ownerPayment !== 0) {
      runningTotal -= ownerPayment;
      paymentsRows = this.buildChargeRow(closingBalanceDate, '', 'Owner Payment', ownerPayment, runningTotal);
    }
    if (!paymentsRows) {
      paymentsRows = this.buildBlankLedgerRow();
    }

    const closingBalanceRows = [
      this.buildSummaryBalanceRow('Ending Balance', closingBalanceDate, endingBalance, true)
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
    const statementSubtitle = this.escapeHtml(periodTitle);

    let result = html;
    result = result.replace(/\{\{statementSubtitle\}\}/g, statementSubtitle);
    result = result.replace(/\{\{statementPeriodTitle\}\}/g, this.escapeHtml(periodTitle));
    result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, responsiblePartiesBlock);
    result = result.replace(/\{\{propertySideBlock\}\}/g, propertySideBlock);
    result = result.replace(/\{\{openingBalanceLedgerLineRows\}\}/g, openingBalanceRows);
    result = result.replace(/\{\{incomeLedgerLineRows\}\}/g, incomeRows);
    result = result.replace(/\{\{chargesLedgerLineRows\}\}/g, chargesRows);
    result = result.replace(/\{\{paymentsLedgerLineRows\}\}/g, paymentsRows);
    result = result.replace(/\{\{closingBalanceLedgerLineRows\}\}/g, closingBalanceRows);
    result = result.replace(/\{\{statementNotes\}\}/g, this.buildStatementNotesContent());
    result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, '');
    result = result.replace(/\{\{totalCharges\}\}/g, this.formatterService.currencyUsd(endingBalance));
    result = result.replace(/\{\{totalPayments\}\}/g, this.formatterService.currencyUsd(0));
    result = result.replace(/\{\{statementBalanceDue\}\}/g, this.formatterService.currencyUsd(endingBalance));
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
    result = result.replace(/\{\{startDate\}\}/g, this.escapeHtml(periodTitle) || '');
    result = result.replace(/\{\{endDate\}\}/g, this.escapeHtml(periodTitle) || '');
    result = result.replace(/\{\{statementDate\}\}/g, this.utilityService.todayAsCalendarDateString());
    result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currencyUsd(0));
    result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currencyUsd(endingBalance));
    return result.replace(/\{\{[^}]+\}\}/g, '');
  }

  buildStatementNotesContent(): string {
    const unpaidEntries = this.getUnpaidAccrualEntries();
    const blocks: string[] = [];

    if (unpaidEntries.length > 0) {
      const lines = unpaidEntries.map(({ line, unpaidAmount }, index) => {
        const { description } = this.parseActivityRefAndDescription(line, 'Income');
        const amount = this.formatterService.currencyUsd(unpaidAmount);
        const intro = index === 0 ? `${this.escapeHtml('* Funds not yet collected:')}\t` : '';
        return `<div class="statement-notes-unpaid-line">${intro}${this.escapeHtml(description)}\t${this.escapeHtml(amount)}</div>`;
      }).join('\n');

      blocks.push(`<div class="statement-notes-unpaid-block">${lines}</div>`);
    }

    const manualNotes = (this.line?.notes || '').trim();
    if (manualNotes) {
      blocks.push(`<div class="statement-notes-manual">${this.escapeHtml(manualNotes)}</div>`);
    }

    return blocks.join('\n');
  }

  getUnpaidAccrualEntries(): { line: OwnerStatementPropertyActivityLineResponse; unpaidAmount: number }[] {
    return (this.statementAccrualActivityLines || [])
      .map(line => ({
        line,
        unpaidAmount: Math.max(0, (Number(line.expectedIncome) || 0) - (Number(line.receivedIncome) || 0))
      }))
      .filter(entry => entry.unpaidAmount > 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.line.activityDate, b.line.activityDate));
  }

  buildChargeRow(
    date: string,
    refNo: string,
    description: string,
    amount: number | null,
    total: number | null,
    isUnpaidAmount = false
  ): string {
    const amountCell = amount == null ? '' : this.formatStatementAmount(amount, isUnpaidAmount);
    const totalCell = total == null ? '' : this.formatterService.currencyUsd(total);
    return `              <tr class="ledger-line-row"><td>${this.escapeHtml(date)}</td><td>${this.escapeHtml(refNo)}</td><td>${this.escapeHtml(description)}</td><td class="amount-col">${amountCell}</td><td class="amount-col">${totalCell}</td></tr>`;
  }

  formatStatementAmount(amount: number, isUnpaid = false): string {
    const formatted = this.formatterService.currencyUsd(amount);
    return isUnpaid ? `${formatted} *` : formatted;
  }

  buildBlankLedgerRow(): string {
    return '              <tr class="ledger-line-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="amount-col">&nbsp;</td><td class="amount-col">&nbsp;</td></tr>';
  }

  buildSummaryBalanceRow(label: string, date: string, total: number, isEnding: boolean): string {
    const totalCell = this.formatterService.currencyUsd(total);
    const rowClass = isEnding
      ? 'ledger-line-row ledger-summary-balance-row ledger-summary-balance-row--ending'
      : 'ledger-line-row ledger-summary-balance-row ledger-summary-balance-row--opening';
    return `              <tr class="${rowClass}"><td>${this.escapeHtml(date)}</td><td></td><td>${this.escapeHtml(`${label}:`)}</td><td class="amount-col"></td><td class="amount-col">${totalCell}</td></tr>`;
  }

  parseActivityRefAndDescription(
    activity: OwnerStatementPropertyActivityLineResponse,
    fallbackLabel: string
  ): { refNo: string; description: string } {
    const rawDescription = (activity.description || '').trim();

    if (this.isLinenAndTowelActivity(activity)) {
      return {
        refNo: this.formatTransactionDateAsMonthYear(activity.activityDate),
        description: rawDescription || fallbackLabel
      };
    }

    const sourceRef = (activity.sourceDocumentCode || '').trim();

    if (sourceRef) {
      const prefixPattern = new RegExp(`^${this.escapeRegExp(sourceRef)}\\s*:\\s*`, 'i');
      const description = prefixPattern.test(rawDescription)
        ? rawDescription.replace(prefixPattern, '').trim() || fallbackLabel
        : rawDescription || fallbackLabel;

      return { refNo: sourceRef, description };
    }

    const colonSplitMatch = rawDescription.match(
      /^((?:WO-[A-Za-z0-9-]+|R-\d+(?:-\d+)*|RC[A-Za-z0-9-]*))\s*:\s*(.+)$/i
    );
    if (colonSplitMatch) {
      return {
        refNo: colonSplitMatch[1].trim(),
        description: colonSplitMatch[2].trim()
      };
    }

    return {
      refNo: '',
      description: rawDescription || fallbackLabel
    };
  }

  isLinenAndTowelActivity(activity: OwnerStatementPropertyActivityLineResponse): boolean {
    if ((activity.activityType || '').trim().toLowerCase() === 'linensandtowels') {
      return true;
    }

    return /(Monthly|Annual).*Linen\s*&\s*Towe/i.test((activity.description || '').trim());
  }

  formatTransactionDateAsMonthYear(value: string): string {
    const date = this.utilityService.parseCalendarDateInput(value);
    if (!date) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear() % 100).padStart(2, '0');
    return `${month}.${year}`;
  }

  formatActivityDateForStatement(
    activity: OwnerStatementPropertyActivityLineResponse,
    fallbackDate: string
  ): string {
    const activityDate = this.formatFullDate(activity.activityDate);
    if (activityDate) {
      return activityDate;
    }

    const accountingPeriodDate = this.formatAccountingPeriodAsFullDate(activity.accountingPeriod);
    if (accountingPeriodDate) {
      return accountingPeriodDate;
    }

    return fallbackDate;
  }

  formatAccountingPeriodAsFullDate(accountingPeriod: string | undefined): string {
    const trimmed = (accountingPeriod || '').trim();
    if (!trimmed) {
      return '';
    }

    const monthYearMatch = trimmed.match(/^(\d{2})\.(\d{2})$/);
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1]);
      const year = 2000 + Number(monthYearMatch[2]);
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0);
        return this.formatFullDateFromDate(lastDay);
      }
    }

    return this.formatFullDate(trimmed);
  }

  buildResponsiblePartiesBlock(): string {
    const companyName = (this.line?.companyName || '').trim();
    const ownerNames = (this.line?.ownerNames || this.line?.ownerName || '').trim();
    const address1 = this.escapeHtml(this.ownerContact?.address1 || '');
    const address2 = this.escapeHtml(this.ownerContact?.address2 || '');
    const cityStateZip = this.escapeHtml(this.formatAddress2(this.ownerContact));

    const clientLines: string[] = [];
    if (companyName) {
      clientLines.push(`<span style="font-weight: bold">Client:</span> ${this.escapeHtml(companyName)}`);
      if (ownerNames) {
        clientLines.push(`&nbsp;&nbsp;&nbsp;&nbsp;${this.escapeHtml(ownerNames)}`);
      }
    } else if (ownerNames) {
      clientLines.push(`<span style="font-weight: bold">Client:</span> ${this.escapeHtml(ownerNames)}`);
    }

    return [
      ...clientLines,
      address1 ? `<span style="font-weight: bold">Address:</span> ${address1}` : '',
      address2 ? `&nbsp;&nbsp;&nbsp;&nbsp;${address2}` : '',
      cityStateZip ? `&nbsp;&nbsp;&nbsp;&nbsp;${cityStateZip}` : '',
      `<span style="font-weight: bold">Statement Month:</span> ${this.escapeHtml(this.getStatementMonthLabel())}`
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
      `<span style="font-weight: bold">Working Capital:</span> ${this.escapeHtml(this.line?.workingCapital || this.formatterService.currencyUsd(0))}`
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
    const config: DownloadConfig = {
      fileName: this.getOwnerStatementFileName(),
      documentType: DocumentType.OwnerStatement,
      noPreviewMessage: 'Please select an owner statement line first.',
      noSelectionMessage: 'Office or organization is missing.'
    };
    await super.onDownload(config);
  }

  override async onEmail(): Promise<void> {
    if (!this.line || !this.previewIframeHtml) {
      this.toastr.warning('Please select an owner statement line first.', 'No Statement');
      return;
    }

    const toEmail = this.getOwnerEmail();
    const toName = this.getOwnerName();
    if (!toEmail || !toName) {
      this.toastr.warning('Owner email information is missing.', 'No Email');
      return;
    }

    const salutationName = `${this.ownerContact?.firstName || ''}`.trim() || toName.trim().split(/\s+/)[0] || '';
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const accountingName = this.selectedAccountingOffice?.name || this.selectedOffice?.name || '';
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';
    const propertyCode = (this.line.propertyCode || 'OwnerStatement').replace(/[^a-zA-Z0-9-]/g, '');
    const monthDisplay = this.getStatementMonthLabel();
    const subject = (this.emailHtml?.ownerStatementSubject || 'Owner Statement: {{propertyCode}}')
      .replace(/\{\{propertyCode\}\}/g, propertyCode)
      .replace(/\{\{statementMonth\}\}/g, monthDisplay);
    const body = (this.emailHtml?.ownerStatement || '<p>Please find your owner statement attached.</p>')
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{toName\}\}/g, salutationName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{fromEmail\}\}/g, fromEmail)
      .replace(/\{\{companyName\}\}/g, this.organization?.name || '')
      .replace(/\{\{accountingName\}\}/g, accountingName)
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone)
      .replace(/\{\{statementMonth\}\}/g, monthDisplay);

    const emailConfig: EmailConfig = {
      subject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.OwnerStatement,
      emailType: EmailType.Other,
      plainTextContent: '',
      htmlContent: body,
      fileDetails: {
        fileName: this.getOwnerStatementFileName(),
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
    super.onPrint('Please select an owner statement line first.');
  }

  getOwnerStatementFileName(): string {
    const propertyCode = (this.line?.propertyCode || 'OwnerStatement').replace(/[^a-zA-Z0-9-]/g, '');
    const month = (this.line?.monthDisplay || '').replace(/[^a-zA-Z0-9-]/g, '');
    return `OwnerStatement_${propertyCode}_${month || this.utilityService.todayAsCalendarDateString()}.pdf`;
  }

  getOwnerEmail(): string {
    if (!this.ownerContact) {
      return '';
    }
    return (this.ownerContact.entityTypeId === EntityType.Company
      ? this.ownerContact.companyEmail
      : this.ownerContact.email) || '';
  }

  getOwnerName(): string {
    if (!this.ownerContact) {
      return (this.line?.ownerName || '').trim();
    }
    return (this.ownerContact.entityTypeId === EntityType.Company
      ? this.ownerContact.companyName
      : this.ownerContact.fullName || `${this.ownerContact.firstName || ''} ${this.ownerContact.lastName || ''}`.trim()) || (this.line?.ownerName || '').trim();
  }
  //#endregion

  //#region Utility
  getStatementMonthLabel(): string {
    if (!this.line) {
      return '';
    }

    const periodStartDate = (this.line.periodStartDate || this.line.monthDate || '').trim();
    const periodEndDate = (this.line.periodEndDate || this.line.monthDate || periodStartDate).trim();
    return this.mappingService.formatOwnerStatementPeriodMonthLabel(periodStartDate, periodEndDate)
      || (this.line.monthDisplay || '').trim();
  }

  buildForm(): FormGroup {
    return this.fb.group({
      selectedOfficeId: new FormControl(null),
      ownerName: new FormControl(''),
      propertyCode: new FormControl(''),
      statementMonth: new FormControl(''),
      ownerStatement: new FormControl('')
    });
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

  formatFullDate(value: string): string {
    const date = this.utilityService.parseCalendarDateInput(value);
    if (!date) {
      return '';
    }

    return this.formatFullDateFromDate(date);
  }

  formatFullDateFromDate(date: Date): string {
    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  formatReportingMonthEndDate(value: string): string {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    if (!parsed) {
      return '';
    }

    const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
    return this.formatFullDateFromDate(lastDay);
  }

  formatPreviousMonthEndDate(value: string): string {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    if (!parsed) {
      return '';
    }

    const lastDay = new Date(parsed.getFullYear(), parsed.getMonth(), 0);
    return this.formatFullDateFromDate(lastDay);
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

  escapeRegExp(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
