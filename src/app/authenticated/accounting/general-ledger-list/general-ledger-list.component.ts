import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject, Subject, catchError, filter, finalize, forkJoin, merge, of, switchMap, take, takeUntil, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountType, isJournalEntrySourceNavigable, SourceType, SourceTypeLabels } from '../models/accounting-enum';
import { OwnerStatementActivityLinkSelection } from '../models/owner-statement.model';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse, TransferReportRowDisplay } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { CheckHtmlService } from '../services/check-html.service';
import { CheckPrintService } from '../services/check-print.service';
import { DepositRequest, DepositResponse, DepositSplit } from '../models/deposit.model';
import { DepositService } from '../services/deposit.service';
import { TransferRequest, TransferResponse, TransferSplit } from '../models/transfer.model';
import { TransferService } from '../services/transfer.service';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { ReportService } from '../services/report.service';

@Component({
  selector: 'app-general-ledger-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './general-ledger-list.component.html',
  styleUrls: ['./general-ledger-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneralLedgerListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() chartOfAccountId: number | null = null;
  @Input() undepositedFundsOnly = false;
  @Input() untransferredFundsOnly = false;
  @Input() transferReportOnly = false;
  @Input() depositsOnly = false;
  @Input() printChecksOnly = false;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() depositCompletedEvent = new EventEmitter<void>();
  @Output() transferCompletedEvent = new EventEmitter<void>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();

  selectedJournalEntryLineIds = new Set<string>();
  showDepositSelections = false;
  showDepositForm = false;
  showTransferSelections = false;
  showTransferForm = false;
  showCheckPreview = false;
  isLoadingCheckPreview = false;
  checkPreviewTitle = 'Check Preview';
  safeCheckPreviewHtml: SafeHtml | null = null;
  checkPreviewIframeKey = 0;
  @ViewChild('checkPreviewIframe') checkPreviewIframe?: ElementRef<HTMLIFrameElement>;
  isManualDepositMode = false;
  isSubmittingDeposit = false;
  depositOfficeId: number | null = null;
  depositBankChartOfAccounts: { value: number; label: string }[] = [];
  selectedDepositBankChartOfAccountId: number | null = null;
  depositTransactionType = '';
  depositDescription = '';
  depositDate: Date | null = new Date();
  depositAmount = 0;
  depositAmountDisplay = '$0.00';

  isSubmittingTransfer = false;
  transferOfficeId: number | null = null;
  transferDate: Date | null = new Date();
  transferAmount = 0;
  transferAmountDisplay = '$0.00';

  isServiceError = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];
  transferReportRows: TransferReportRowDisplay[] = [];
  linesDisplay: JournalEntryLineListDisplay[] = [];
  noActivityMessage = 'No general ledger activity for the selected office and date range.';

  displayedColumns: ColumnSet = {
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    journalEntryCode: { displayAs: 'Entry No', maxWidth: '14ch', sortType: 'natural' },
    source: { displayAs: 'Source', maxWidth: '16ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    account: { displayAs: 'Account', maxWidth: '28ch' },
    description: { displayAs: 'Description', maxWidth: '32ch' },
    debit: { displayAs: 'Debit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    credit: { displayAs: 'Credit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    balance: { displayAs: 'Balance', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'chartOfAccounts']));
  destroy$ = new Subject<void>();
  private journalEntryLinesLoadId = 0;
  private cancelJournalEntryLinesLoad$ = new Subject<void>();

  constructor(
    public generalLedgerService: GeneralLedgerService,
    public mappingService: MappingService,
    public formatter: FormatterService,
    private officeService: OfficeService,
    private chartOfAccountsService: ChartOfAccountsService,
    private accountingOfficeService: AccountingOfficeService,
    private checkHtmlService: CheckHtmlService,
    private checkPrintService: CheckPrintService,
    private documentHtmlService: DocumentHtmlService,
    private sanitizer: DomSanitizer,
    private authService: AuthService,
    private depositService: DepositService,
    private transferService: TransferService,
    private reportService: ReportService,
    private journalEntrySourceService: JournalEntrySourceService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef) {
  }

  //#region General-Ledger-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.itemsToLoad$.pipe(
      filter(items => items.size === 0),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadJournalEntryLines();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (this.printChecksOnly) {
      this.displayedColumns['contactName'].displayAs = 'Vendor';
    }
    this.loadOffices();
    this.loadChartOfAccounts();
    this.loadAccountingOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      if (this.showDepositForm) {
        this.cancelDepositForm();
      }
      if (this.showTransferForm) {
        this.cancelTransferForm();
      }
      if (this.showCheckPreview) {
        this.closeCheckPreview();
      }
      this.applyLinesDisplay();
    }

    const shouldReloadLines =
      (changes['chartOfAccountId'] && !changes['chartOfAccountId'].firstChange)
      || (changes['undepositedFundsOnly'] && !changes['undepositedFundsOnly'].firstChange)
      || (changes['untransferredFundsOnly'] && !changes['untransferredFundsOnly'].firstChange)
      || (changes['transferReportOnly'] && !changes['transferReportOnly'].firstChange)
      || (changes['depositsOnly'] && !changes['depositsOnly'].firstChange)
      || (changes['printChecksOnly'] && !changes['printChecksOnly'].firstChange)
      || (changes['propertyId'] && !changes['propertyId'].firstChange)
      || (changes['reservationId'] && !changes['reservationId'].firstChange)
      || (changes['searchDateRange'] && !changes['searchDateRange'].firstChange)
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)
      || (changes['officeId'] && !changes['officeId'].firstChange);

    if (shouldReloadLines) {
      if (this.undepositedFundsOnly && this.showDepositForm) {
        this.cancelDepositForm();
      } else if (this.undepositedFundsOnly) {
        this.clearDepositLineSelection();
      } else if (this.untransferredFundsOnly && this.showTransferForm) {
        this.cancelTransferForm();
      } else if (this.untransferredFundsOnly) {
        this.clearUntransferredFundsLineSelection();
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.loadJournalEntryLines();
    }
  }

  get showDepositTableSelections(): boolean {
    return this.undepositedFundsOnly && this.showDepositSelections;
  }

  get showTransferTableSelections(): boolean {
    return this.untransferredFundsOnly && this.showTransferSelections;
  }

  private usesUntransferredOpenLinesFilter(): boolean {
    return this.untransferredFundsOnly || this.transferReportOnly;
  }

  private usesFixedBankActivityFilter(): boolean {
    return this.undepositedFundsOnly || this.usesUntransferredOpenLinesFilter() || this.depositsOnly || this.printChecksOnly;
  }

  get showPrintCheckTableSelections(): boolean {
    return this.printChecksOnly;
  }

  get isPrintChecksFormValid(): boolean {
    return this.selectedJournalEntryLineIds.size > 0;
  }

  get resolvedDepositOfficeId(): number | null {
    return this.depositOfficeId ?? this.officeId ?? null;
  }

  get resolvedTransferOfficeId(): number | null {
    return this.transferOfficeId ?? this.officeId ?? null;
  }

  get isDepositSelectionMode(): boolean {
    return this.showDepositForm && this.showDepositTableSelections;
  }

  get isDepositFormValid(): boolean {
    const hasDepositDate = this.utilityService.toDateOnlyJsonString(this.depositDate) !== null;
    return hasDepositDate
      && !!this.selectedDepositBankChartOfAccountId
      && this.depositAmount !== 0
      && (this.depositDescription || '').trim().length > 0
      && this.selectedJournalEntryLineIds.size > 0;
  }

  get isTransferSelectionMode(): boolean {
    return this.showTransferForm && this.showTransferTableSelections;
  }

  get isTransferFormValid(): boolean {
    const hasTransferDate = this.utilityService.toDateOnlyJsonString(this.transferDate) !== null;
    return hasTransferDate && this.transferAmount !== 0;
  }

  openMakeDepositDialog(): void {
    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    this.depositOfficeId = this.officeId;
    this.showDepositSelections = true;
    this.isManualDepositMode = true;
    this.depositDate = this.depositDate ?? new Date();
    this.refreshDepositBankChartOfAccounts();
    this.showDepositForm = true;
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  cancelDepositForm(): void {
    this.showDepositForm = false;
    this.showDepositSelections = false;
    this.isManualDepositMode = false;
    this.clearDepositForm();
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  submitDeposit(): void {
    if (this.isSubmittingDeposit || !this.isDepositFormValid) {
      return;
    }

    const officeId = this.resolvedDepositOfficeId;
    if (!officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    const selectedLines = this.linesDisplay.filter(line =>
      this.selectedJournalEntryLineIds.has(line.journalEntryLineId)
    );
    if (selectedLines.length === 0) {
      this.toastr.warning('Select one or more undeposited funds lines to deposit.');
      return;
    }

    const depositDate = this.utilityService.toDateOnlyJsonString(this.depositDate)
      ?? this.utilityService.todayAsCalendarDateString();
    const description = (this.depositDescription || '').trim();
    if (!description) {
      this.toastr.warning('Description is required.');
      return;
    }

    if (!this.organizationId) {
      this.toastr.warning('Organization is required.');
      return;
    }

    const undepositedFundsAccountIds = this.resolveUndepositedFundsAccountIds([officeId]);
    const undepositedFundsAccountId = undepositedFundsAccountIds.length === 1
      ? undepositedFundsAccountIds[0]
      : null;
    if (!undepositedFundsAccountId) {
      this.toastr.error('Undeposited Funds account is not configured for this office.', CommonMessage.Error);
      return;
    }

    const splits: DepositSplit[] = selectedLines.map(line => ({
      amount: this.getLineNetAmount(line),
      description: (line.description || '').trim(),
      propertyId: (line.propertyId || '').trim() || null,
      reservationId: (line.reservationId || '').trim() || null,
      contactId: (line.contactId || '').trim() || null,
      journalEntryLineId: line.journalEntryLineId,
      chartOfAccountId: undepositedFundsAccountId
    }));

    const payload: DepositRequest = {
      organizationId: this.organizationId,
      officeId,
      depositDate,
      accountingPeriod: depositDate,
      amount: this.depositAmount,
      description,
      bankAccountId: this.selectedDepositBankChartOfAccountId,
      propertyId: splits.find(split => (split.propertyId || '').trim().length > 0)?.propertyId ?? null,
      splits,
      isActive: true
    };

    this.isSubmittingDeposit = true;
    this.depositService.createDeposit(payload).pipe(
      finalize(() => {
        this.isSubmittingDeposit = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success('Deposit created and funds moved to bank.', CommonMessage.Success);
        this.cancelDepositForm();
        this.loadJournalEntryLines();
        this.depositCompletedEvent.emit();
      },
      error: (error: HttpErrorResponse) => {
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.toastr.error(apiMessage || 'Unable to create deposit.', CommonMessage.Error);
      }
    });
  }

  openMakeTransferDialog(): void {
    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    this.transferOfficeId = this.officeId;
    this.showTransferSelections = true;
    this.transferDate = this.transferDate ?? new Date();
    this.showTransferForm = true;
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  cancelTransferForm(): void {
    this.showTransferForm = false;
    this.showTransferSelections = false;
    this.clearTransferForm();
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  submitTransfer(): void {
    if (this.isSubmittingTransfer || !this.isTransferFormValid) {
      return;
    }

    const officeId = this.resolvedTransferOfficeId;
    if (!officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    const selectedLines = this.linesDisplay.filter(line =>
      this.selectedJournalEntryLineIds.has(line.journalEntryLineId)
    );
    if (selectedLines.length === 0) {
      this.toastr.warning('Select one or more untransferred funds lines to transfer.');
      return;
    }

    const transferDate = this.utilityService.toDateOnlyJsonString(this.transferDate)
      ?? this.utilityService.todayAsCalendarDateString();

    if (!this.organizationId) {
      this.toastr.warning('Organization is required.');
      return;
    }

    const escrowDepositAccountId = this.resolveTransferSourceEscrowDepositAccountId(
      officeId,
      selectedLines.map(line => line.journalEntryLineId)
    );
    if (!escrowDepositAccountId) {
      this.toastr.error('Escrow Deposits account is not configured for this office.', CommonMessage.Error);
      return;
    }

    const allocationAccountIds = this.resolveTransferAllocationAccountIds(officeId);
    if (!allocationAccountIds.owners || !allocationAccountIds.bank) {
      this.toastr.error('Owner escrow and bank accounts must be configured for this office.', CommonMessage.Error);
      return;
    }

    const officeIds = [officeId];
    const startDate = this.searchDateRange?.startDate ?? null;
    const endDate = this.searchDateRange?.endDate ?? null;

    this.isSubmittingTransfer = true;
    forkJoin({
      transferReport: this.reportService.searchTransferReport({ officeIds, startDate, endDate }),
      deposits: this.depositService.searchDeposits({
        officeIds,
        isActive: true,
        includeInactive: false
      })
    }).pipe(
      switchMap(({ transferReport, deposits }) => {
        const splits = this.buildTransferSplitsFromRecap(
          selectedLines,
          transferReport.rows || [],
          deposits || [],
          officeId
        );
        const validationMessage = this.validateBuiltTransferSplits(splits, allocationAccountIds);
        if (validationMessage) {
          return throwError(() => new Error(validationMessage));
        }

        const splitTotal = splits.reduce(
          (sum, split) => this.roundCurrencyValue(sum + Number(split.amount || 0)),
          0
        );
        const scaledSplits = this.scaleTransferSplitsToAmount(splits, this.transferAmount, splitTotal);

        const payload: TransferRequest = {
          organizationId: this.organizationId,
          officeId,
          transferDate,
          accountingPeriod: transferDate,
          amount: this.transferAmount,
          description: 'Transfer',
          bankAccountId: escrowDepositAccountId,
          propertyId: scaledSplits.find(split => (split.propertyId || '').trim().length > 0)?.propertyId ?? null,
          splits: scaledSplits,
          isActive: true
        };

        return this.transferService.createTransfer(payload);
      }),
      finalize(() => {
        this.isSubmittingTransfer = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success('Transfer created and funds moved to destination accounts.', CommonMessage.Success);
        this.cancelTransferForm();
        this.loadJournalEntryLines();
        this.transferCompletedEvent.emit();
      },
      error: (error: HttpErrorResponse | Error) => {
        const apiMessage = error instanceof HttpErrorResponse
          ? (typeof error.error === 'string'
            ? error.error
            : error.error?.title || error.error?.message || error.message)
          : error.message;
        this.toastr.error(apiMessage || 'Unable to create transfer.', CommonMessage.Error);
      }
    });
  }

  onDepositLineSelectionSet(selection: SelectionModel<unknown>): void {
    if (!this.showDepositTableSelections) {
      return;
    }

    this.applyLineSelectionSet(selection, line => this.getLineNetAmount(line) > 0);

    if (this.isDepositSelectionMode) {
      this.syncDepositAmountFromLineSelection();
    }

    this.markViewForCheck();
  }

  onTransferLineSelectionSet(selection: SelectionModel<unknown>): void {
    if (!this.showTransferTableSelections) {
      return;
    }

    this.applyLineSelectionSet(selection, line => this.isUntransferredFundsLineSelectable(line));

    if (this.isTransferSelectionMode) {
      this.syncTransferAmountFromLineSelection();
    }

    this.markViewForCheck();
  }

  onPrintCheckLineSelectionSet(selection: SelectionModel<unknown>): void {
    if (!this.showPrintCheckTableSelections) {
      return;
    }

    const previousSelectedIds = new Set(this.selectedJournalEntryLineIds);
    this.applyLineSelectionSet(selection, line => this.isPrintCheckLineSelectable(line));
    const rejectedDifferentVendor = this.rejectPrintCheckRowsWithDifferentVendor(previousSelectedIds);

    if (rejectedDifferentVendor) {
      this.toastr.warning('A single check can only be sent to one vendor at a time.');
    }

    this.syncPrintCheckLineSelectionInPlace();
    this.markViewForCheck();
  }

  onTableLineSelectionSet(selection: SelectionModel<unknown>): void {
    if (this.showDepositTableSelections) {
      this.onDepositLineSelectionSet(selection);
    } else if (this.showTransferTableSelections) {
      this.onTransferLineSelectionSet(selection);
    } else if (this.showPrintCheckTableSelections) {
      this.onPrintCheckLineSelectionSet(selection);
    }
  }

  viewSelectedChecks(): void {
    if (!this.isPrintChecksFormValid) {
      this.toastr.warning('Select one or more checks to view.');
      return;
    }

    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    const selectedLines = this.linesDisplay.filter(line =>
      this.selectedJournalEntryLineIds.has(line.journalEntryLineId)
    );
    if (selectedLines.length === 0) {
      this.toastr.warning('Select one or more checks to view.');
      return;
    }

    this.isLoadingCheckPreview = true;
    forkJoin({
      template: this.checkHtmlService.getCheckHtmlByScope(this.officeId),
      accountingOffice: this.accountingOfficeService.getAccountingOfficeById(this.officeId).pipe(catchError(() => of(null)))
    }).pipe(
      finalize(() => {
        this.isLoadingCheckPreview = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe(({ template, accountingOffice }) => {
      if (!template) {
        this.toastr.error('Check HTML template was not found.', CommonMessage.Error);
        return;
      }

      const mergedHtml = this.checkPrintService.buildMergedChecksHtml(template, selectedLines, accountingOffice);
      const processed = this.documentHtmlService.processHtml(mergedHtml, true);
      const bodyContent = this.documentHtmlService.extractBodyContent(processed.processedHtml);
      const styles = processed.extractedStyles;
      const srcdoc = styles.trim()
        ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style data-dynamic-styles="true">${styles}</style></head><body>${bodyContent}</body></html>`
        : mergedHtml;

      this.safeCheckPreviewHtml = this.sanitizer.bypassSecurityTrustHtml(srcdoc);
      this.checkPreviewTitle = selectedLines.length === 1
        ? `Check ${(selectedLines[0].journalEntryCode || '').trim()}`.trim()
        : `${selectedLines.length} Checks`;
      this.checkPreviewIframeKey++;
      this.showCheckPreview = true;
      this.markViewForCheck();
    });
  }

  closeCheckPreview(): void {
    this.showCheckPreview = false;
    this.safeCheckPreviewHtml = null;
    this.markViewForCheck();
  }

  onCheckPreviewIframeLoad(): void {
    const iframe = this.checkPreviewIframe?.nativeElement;
    if (!iframe) {
      return;
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      return;
    }

    const contentHeight = Math.max(
      doc.body?.scrollHeight || 0,
      doc.body?.offsetHeight || 0,
      doc.documentElement?.scrollHeight || 0,
      doc.documentElement?.offsetHeight || 0
    );

    if (contentHeight > 0) {
      iframe.style.height = `${contentHeight + 12}px`;
    }
  }

  onLineSelect(row: JournalEntryLineListDisplay): void {
    if (this.showDepositForm || this.showTransferForm || this.showCheckPreview || !row?.journalEntryId || row.disabled) {
      return;
    }
    this.lineSelectEvent.emit({
      journalEntryId: row.journalEntryId,
      journalEntryLineId: row.journalEntryLineId
    });
  }

  onSourceClick(row: JournalEntryLineListDisplay): void {
    if (!this.transferReportOnly || !row?.sourceLinkable || row.officeId == null) {
      return;
    }

    const navigate = (activityId: string | null) => {
      this.sourceLinkSelect.emit({
        activityId,
        activityCode: row.source,
        activityType: '',
        officeId: row.officeId,
        propertyId: row.propertyId || ''
      });
    };

    if (
      row.sourceTypeId === SourceType.InvoicePayment
      && isJournalEntrySourceNavigable(row.sourceTypeId)
      && (row.sourceId || '').trim()
    ) {
      this.journalEntrySourceService.resolveSource(row).pipe(take(1)).subscribe({
        next: target => {
          if (target?.kind === 'invoice' && target.invoice?.invoiceId) {
            navigate(target.invoice.invoiceId);
            return;
          }

          navigate(row.sourceId || null);
        },
        error: () => navigate(row.sourceId || null)
      });
      return;
    }

    navigate(row.sourceId || null);
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.markViewForCheck();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe(() => {
      this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
        this.accountingOffices = accountingOffices || [];
        this.markViewForCheck();
      });
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts'))
    ).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.markViewForCheck();
      });
    });
  }

  loadJournalEntryLines(): void {
    const officeIds = this.resolveOfficeIds();

    if (officeIds.length === 0) {
      this.allLines = [];
      this.linesDisplay = [];
      this.isServiceError = false;
      if (this.undepositedFundsOnly) {
        if (this.showDepositForm) {
          this.cancelDepositForm();
        } else {
          this.clearDepositLineSelection();
        }
      } else if (this.usesUntransferredOpenLinesFilter()) {
        if (this.untransferredFundsOnly && this.showTransferForm) {
          this.cancelTransferForm();
        } else if (this.untransferredFundsOnly) {
          this.clearUntransferredFundsLineSelection();
        }
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.markViewForCheck();
      return;
    }

    const undepositedFundsAccountIds = this.undepositedFundsOnly
      ? this.resolveUndepositedFundsAccountIds(officeIds)
      : [];
    const untransferredFundsAccountIds = this.usesUntransferredOpenLinesFilter()
      ? this.resolveUntransferredFundsAccountIds(officeIds)
      : [];
    const printChecksBankAccountIds = this.printChecksOnly
      ? this.resolveBankAccountIds(officeIds)
      : [];
    const depositsBankAccountIds = this.depositsOnly
      ? this.resolveBankAccountIds(officeIds)
      : [];
    const filteredAccountIds = undepositedFundsAccountIds.length > 0
      ? undepositedFundsAccountIds
      : untransferredFundsAccountIds.length > 0
        ? untransferredFundsAccountIds
        : depositsBankAccountIds.length > 0
          ? depositsBankAccountIds
          : printChecksBankAccountIds;

    if (this.usesFixedBankActivityFilter() && filteredAccountIds.length === 0) {
      this.allLines = [];
      this.linesDisplay = [];
      this.isServiceError = false;
      if (this.showDepositForm) {
        this.cancelDepositForm();
      } else if (this.showTransferForm) {
        this.cancelTransferForm();
      } else if (this.undepositedFundsOnly) {
        this.clearDepositLineSelection();
      } else if (this.untransferredFundsOnly) {
        this.clearUntransferredFundsLineSelection();
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.noActivityMessage = this.undepositedFundsOnly
        ? 'No Undeposited Funds account is configured for the selected office.'
        : this.usesUntransferredOpenLinesFilter()
          ? 'No configured escrow deposit account for the selected office.'
          : this.depositsOnly
            ? 'No Bank account is configured for the selected office.'
            : 'No Bank account is configured for the selected office.';
      this.markViewForCheck();
      return;
    }

    if (this.undepositedFundsOnly) {
      if (this.showDepositForm) {
        this.cancelDepositForm();
      } else {
        this.clearDepositLineSelection();
      }
    } else if (this.usesUntransferredOpenLinesFilter()) {
      if (this.untransferredFundsOnly && this.showTransferForm) {
        this.cancelTransferForm();
      } else if (this.untransferredFundsOnly) {
        this.clearUntransferredFundsLineSelection();
      }
    }

    this.isServiceError = false;

    const usesFixedAccountFilter = this.usesFixedBankActivityFilter();
    const chartOfAccountId = usesFixedAccountFilter
      ? (filteredAccountIds.length === 1 ? filteredAccountIds[0] : null)
      : (this.chartOfAccountId != null && this.chartOfAccountId > 0 ? this.chartOfAccountId : null);

    this.cancelJournalEntryLinesLoad$.next();
    const loadId = ++this.journalEntryLinesLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'journalEntryLines');
    const loadUntil = merge(this.cancelJournalEntryLinesLoad$, this.destroy$);

    this.generalLedgerService.searchJournalEntryLines({
      officeIds,
      chartOfAccountId,
      sourceTypeId: this.printChecksOnly
        ? SourceType.BillPayment
        : this.depositsOnly
          ? SourceType.Deposit
          : null,
      propertyId: usesFixedAccountFilter ? null : (this.propertyId?.trim() || null),
      reservationId: usesFixedAccountFilter ? null : (this.reservationId?.trim() || null),
      includeVoided: false,
      includeUnposted: true,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(takeUntil(loadUntil)).subscribe({
      next: (lines) => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        if (this.usesUntransferredOpenLinesFilter()) {
          const startDate = this.searchDateRange?.startDate ?? null;
          const endDate = this.searchDateRange?.endDate ?? null;
          forkJoin({
            transfers: this.transferService.searchTransfers({
              officeIds,
              isActive: true,
              includeInactive: false
            }),
            deposits: this.depositService.searchDeposits({
              officeIds,
              isActive: true,
              includeInactive: false
            }),
            ...(this.transferReportOnly
              ? {
                  transferReport: this.reportService.searchTransferReport({ officeIds, startDate, endDate })
                }
              : {})
          }).pipe(takeUntil(loadUntil)).subscribe({
            next: (result) => {
              if (this.journalEntryLinesLoadId !== loadId) {
                return;
              }

              if (this.transferReportOnly) {
                this.transferReportRows = result.transferReport?.rows || [];
              }

              const refinedLines = this.filterJournalEntryLinesByMode(
                lines || [],
                filteredAccountIds,
                usesFixedAccountFilter,
                result.deposits,
                result.transfers
              );
              this.applyLoadedJournalEntryLines(refinedLines, loadId);
              this.finishJournalEntryLinesLoad(loadId);
            },
            error: () => {
              if (this.journalEntryLinesLoadId !== loadId) {
                return;
              }

              if (this.transferReportOnly) {
                this.transferReportRows = [];
              }

              const refinedLines = this.filterJournalEntryLinesByMode(
                lines || [],
                filteredAccountIds,
                usesFixedAccountFilter,
                [],
                []
              );
              this.applyLoadedJournalEntryLines(refinedLines, loadId);
              this.finishJournalEntryLinesLoad(loadId);
            }
          });
          return;
        }

        const resolvedLines = this.filterJournalEntryLinesByMode(
          lines || [],
          filteredAccountIds,
          usesFixedAccountFilter,
          null,
          null
        );
        this.applyLoadedJournalEntryLines(resolvedLines, loadId);
        this.finishJournalEntryLinesLoad(loadId);

        if (this.undepositedFundsOnly) {
          this.depositService.searchDeposits({
            officeIds,
            isActive: true,
            includeInactive: false
          }).pipe(takeUntil(loadUntil)).subscribe({
            next: (deposits) => {
              if (this.journalEntryLinesLoadId !== loadId) {
                return;
              }

              const refinedLines = this.filterJournalEntryLinesByMode(
                lines || [],
                filteredAccountIds,
                usesFixedAccountFilter,
                deposits,
                null
              );
              this.applyLoadedJournalEntryLines(refinedLines, loadId);
            }
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        console.error('General Ledger List - error loading journal entry lines:', error);
        this.isServiceError = true;
        this.allLines = [];
        this.linesDisplay = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load general ledger activity: ${apiMessage}`
          : 'Unable to load general ledger activity.';
        this.finishJournalEntryLinesLoad(loadId);
      }
    });
  }
  //#endregion

  //#region Utility Methods
  private filterJournalEntryLinesByMode(
    lines: JournalEntryLineSearchResponse[],
    filteredAccountIds: number[],
    usesFixedAccountFilter: boolean,
    deposits: DepositResponse[] | null,
    transfers: TransferResponse[] | null
  ): JournalEntryLineSearchResponse[] {
    let resolvedLines = lines || [];
    if (usesFixedAccountFilter && filteredAccountIds.length > 1) {
      const accountIdSet = new Set(filteredAccountIds);
      resolvedLines = resolvedLines.filter(line => accountIdSet.has(line.chartOfAccountId));
    }
    if (this.printChecksOnly) {
      const bankAccountIdSet = new Set(filteredAccountIds);
      resolvedLines = resolvedLines.filter(line =>
        Number(line.sourceTypeId) === SourceType.BillPayment
        && bankAccountIdSet.has(line.chartOfAccountId)
        && Number(line.credit || 0) > 0);
    }
    if (this.depositsOnly) {
      const bankAccountIdSet = new Set(filteredAccountIds);
      resolvedLines = resolvedLines.filter(line =>
        Number(line.sourceTypeId) === SourceType.Deposit
        && bankAccountIdSet.has(line.chartOfAccountId)
        && Number(line.debit || 0) > 0);
    }
    if (this.undepositedFundsOnly) {
      const depositedLineIds = this.buildDepositedJournalEntryLineIds(deposits || []);
      resolvedLines = this.filterUndepositedFundsOpenLines(resolvedLines, depositedLineIds);
    }
    if (this.usesUntransferredOpenLinesFilter()) {
      const escrowAccountIdSet = new Set(filteredAccountIds);
      resolvedLines = resolvedLines.filter(line =>
        Number(line.sourceTypeId) === SourceType.Deposit
        && escrowAccountIdSet.has(line.chartOfAccountId)
        && Math.abs(this.getLineNetAmountFromSearchLine(line)) > 0.005);
      const enrichedLines = this.enrichUntransferredFundsLinesFromDeposits(resolvedLines, deposits || []);
      resolvedLines = this.filterUntransferredFundsOpenLines(
        enrichedLines,
        transfers || [],
        deposits || [],
        filteredAccountIds
      );
    }
    return resolvedLines;
  }

  private applyLoadedJournalEntryLines(
    resolvedLines: JournalEntryLineSearchResponse[],
    loadId: number
  ): void {
    if (this.journalEntryLinesLoadId !== loadId) {
      return;
    }

    this.allLines = resolvedLines;
    this.noActivityMessage = this.undepositedFundsOnly
      ? 'No Undeposited Funds activity for the selected office and date range.'
      : this.transferReportOnly
        ? 'No transfer report activity for the selected office and date range.'
        : this.untransferredFundsOnly
        ? 'No untransferred funds activity for the selected office and date range.'
        : this.depositsOnly
        ? 'No bank deposit activity for the selected office and date range.'
        : this.printChecksOnly
          ? 'No bill payment bank credits for the selected office and date range.'
          : 'No general ledger activity for the selected filters and date range.';
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  private finishJournalEntryLinesLoad(loadId: number): void {
    if (this.journalEntryLinesLoadId !== loadId) {
      return;
    }

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntryLines');
    this.markViewForCheck();
  }
  applyLinesDisplay(): void {
    const mappedLines = this.mappingService.mapJournalEntryLineListDisplay(
      this.allLines,
      this.chartOfAccounts,
      SourceTypeLabels
    );

    if (this.transferReportOnly) {
      this.linesDisplay = this.buildTransferReportLinesDisplay(mappedLines);
      return;
    }

    this.linesDisplay = mappedLines.map(line => ({
      ...line,
      selected: (this.showDepositTableSelections || this.showTransferTableSelections || this.showPrintCheckTableSelections)
        && this.selectedJournalEntryLineIds.has(line.journalEntryLineId),
      disabled: (this.showDepositTableSelections && this.getLineNetAmount(line) <= 0)
        || (this.showTransferTableSelections && !this.isUntransferredFundsLineSelectable(line))
        || (this.showPrintCheckTableSelections && !this.isPrintCheckLineSelectable(line))
    }));
  }

  applyLineSelectionSet(
    selection: SelectionModel<unknown>,
    isLineSelectable: (line: JournalEntryLineListDisplay) => boolean
  ): void {
    const selectedRows = (selection?.selected ?? []) as JournalEntryLineListDisplay[];
    let nextSelectedIds: Set<string>;

    if (selectedRows.length > 0) {
      nextSelectedIds = new Set(
        selectedRows
          .map(row => String(row.journalEntryLineId ?? '').trim())
          .filter(id => id.length > 0)
      );
    } else {
      const idsFromDisplay = this.linesDisplay
        .filter(row => row.selected && row.journalEntryLineId)
        .map(row => String(row.journalEntryLineId));
      nextSelectedIds = idsFromDisplay.length > 0 ? new Set(idsFromDisplay) : new Set<string>();
    }

    for (const lineId of [...nextSelectedIds]) {
      const row = this.linesDisplay.find(line => line.journalEntryLineId === lineId);
      if (!row || !isLineSelectable(row)) {
        nextSelectedIds.delete(lineId);
        if (row) {
          row.selected = false;
        }
      }
    }

    this.selectedJournalEntryLineIds = nextSelectedIds;
  }

  clearPrintCheckLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
    this.syncPrintCheckLineSelectionInPlace();
  }

  syncPrintCheckLineSelectionInPlace(): void {
    if (!this.showPrintCheckTableSelections) {
      return;
    }

    this.linesDisplay.forEach(row => {
      row.selected = this.selectedJournalEntryLineIds.has(row.journalEntryLineId);
    });
  }

  isPrintCheckLineSelectable(line: Pick<JournalEntryLineListDisplay, 'creditValue'>): boolean {
    return Number(line.creditValue || 0) > 0;
  }

  rejectPrintCheckRowsWithDifferentVendor(previousSelectedIds: Set<string>): boolean {
    const newlySelectedIds = [...this.selectedJournalEntryLineIds].filter(id => !previousSelectedIds.has(id));
    if (newlySelectedIds.length === 0) {
      return false;
    }

    const existingSelectedRows = this.linesDisplay.filter(row =>
      previousSelectedIds.has(row.journalEntryLineId)
    );
    let anchorVendorId: string | null = null;

    if (existingSelectedRows.length > 0) {
      anchorVendorId = this.normalizePrintCheckVendorId(existingSelectedRows[0].contactId);
    } else {
      const firstNewRow = this.linesDisplay.find(row => newlySelectedIds.includes(row.journalEntryLineId));
      anchorVendorId = firstNewRow ? this.normalizePrintCheckVendorId(firstNewRow.contactId) : null;
    }

    if (anchorVendorId === null) {
      return false;
    }

    let rejected = false;
    for (const lineId of newlySelectedIds) {
      const row = this.linesDisplay.find(line => line.journalEntryLineId === lineId);
      if (!row) {
        continue;
      }

      if (this.normalizePrintCheckVendorId(row.contactId) !== anchorVendorId) {
        this.selectedJournalEntryLineIds.delete(lineId);
        row.selected = false;
        rejected = true;
      }
    }

    return rejected;
  }

  normalizePrintCheckVendorId(contactId?: string | null): string {
    return String(contactId ?? '').trim();
  }

  clearDepositLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
  }

  clearUntransferredFundsLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
  }

  clearTransferLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
  }

  clearDepositForm(): void {
    this.selectedDepositBankChartOfAccountId = null;
    this.depositTransactionType = '';
    this.depositDescription = '';
    this.depositDate = new Date();
    this.depositAmount = 0;
    this.depositAmountDisplay = this.formatDepositAmountDisplay(0);
    this.depositOfficeId = null;
    this.clearDepositLineSelection();
  }

  clearTransferForm(): void {
    this.transferDate = new Date();
    this.transferAmount = 0;
    this.transferAmountDisplay = this.formatTransferAmountDisplay(0);
    this.transferOfficeId = null;
    this.clearTransferLineSelection();
  }

  refreshDepositBankChartOfAccounts(): void {
    const officeId = this.resolvedDepositOfficeId;
    if (!officeId) {
      this.depositBankChartOfAccounts = [];
      if (this.selectedDepositBankChartOfAccountId != null) {
        this.selectedDepositBankChartOfAccountId = null;
        this.depositTransactionType = '';
      }
      return;
    }

    const officeAccounts = this.chartOfAccounts.filter(account => account.officeId === officeId);
    const optionById = new Map<number, { value: number; label: string }>();

    officeAccounts
      .filter(account => Number(account.accountTypeId) === AccountType.Bank)
      .forEach(account => {
        optionById.set(Number(account.accountId), {
          value: Number(account.accountId),
          label: `${account.accountNo}: ${account.name}`
        });
      });

    const escrowDepositAccountId = this.getDefaultEscrowDepositAccountId(officeId);
    if (escrowDepositAccountId != null) {
      const escrowDepositAccount = officeAccounts.find(account => Number(account.accountId) === escrowDepositAccountId);
      if (escrowDepositAccount) {
        optionById.set(escrowDepositAccountId, {
          value: escrowDepositAccountId,
          label: this.utilityService.getChartOfAccountDropdownLabel(escrowDepositAccount)
        });
      }
    }

    this.depositBankChartOfAccounts = Array.from(optionById.values())
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

    if (
      this.selectedDepositBankChartOfAccountId != null
      && !this.depositBankChartOfAccounts.some(account => account.value === this.selectedDepositBankChartOfAccountId)
    ) {
      this.selectedDepositBankChartOfAccountId = null;
      this.depositTransactionType = '';
    }

    if (this.selectedDepositBankChartOfAccountId == null && escrowDepositAccountId != null) {
      this.onDepositBankChartOfAccountChange(escrowDepositAccountId);
    }
  }

  onDepositBankChartOfAccountChange(accountId: number | null): void {
    this.selectedDepositBankChartOfAccountId = accountId;
    this.depositTransactionType = accountId == null ? '' : 'Bank';
  }

  syncDepositAmountFromLineSelection(): void {
    let totalAmount = 0;

    this.linesDisplay.forEach(row => {
      const isSelected = this.selectedJournalEntryLineIds.has(row.journalEntryLineId);
      row.selected = isSelected;
      if (isSelected) {
        totalAmount = this.roundCurrencyValue(totalAmount + this.getLineNetAmount(row));
      }
    });

    this.depositAmount = totalAmount;
    this.depositAmountDisplay = this.formatDepositAmountDisplay(totalAmount);
  }

  syncTransferAmountFromLineSelection(): void {
    let totalAmount = 0;
    for (const lineId of this.selectedJournalEntryLineIds) {
      const row = this.linesDisplay.find(line => line.journalEntryLineId === lineId);
      if (row) {
        totalAmount = this.roundCurrencyValue(totalAmount + this.getLineNetAmount(row));
      }
    }

    this.transferAmount = totalAmount;
    this.transferAmountDisplay = this.formatTransferAmountDisplay(totalAmount);
  }

  getLineNetAmount(line: Pick<JournalEntryLineListDisplay, 'debitValue' | 'creditValue'>): number {
    return this.roundCurrencyValue(Number(line.debitValue || 0) - Number(line.creditValue || 0));
  }

  isUntransferredFundsLineSelectable(line: Pick<JournalEntryLineListDisplay, 'debitValue' | 'creditValue'>): boolean {
    return Math.abs(this.getLineNetAmount(line)) > 0.005;
  }

  private getLineNetAmountFromSearchLine(line: Pick<JournalEntryLineSearchResponse, 'debit' | 'credit'>): number {
    return this.roundCurrencyValue(Number(line.debit || 0) - Number(line.credit || 0));
  }

  private filterUndepositedFundsOpenLines(
    lines: JournalEntryLineSearchResponse[],
    depositedLineIds: Set<string> = new Set()
  ): JournalEntryLineSearchResponse[] {
    const openDebits = lines
      .filter(line => this.getLineNetAmountFromSearchLine(line) > 0)
      .sort((left, right) => this.compareUndepositedFundsLines(left, right));
    const credits = lines
      .filter(line => this.getLineNetAmountFromSearchLine(line) < 0)
      .filter(line => Number(line.sourceTypeId) === SourceType.Deposit)
      .sort((left, right) => this.compareUndepositedFundsLines(left, right));

    const settledDebitIds = new Set<string>();

    for (const creditLine of credits) {
      let remainingCredit = Math.abs(this.getLineNetAmountFromSearchLine(creditLine));

      for (const debitLine of openDebits) {
        if (settledDebitIds.has(debitLine.journalEntryLineId)) {
          continue;
        }

        const debitAmount = this.getLineNetAmountFromSearchLine(debitLine);
        if (debitAmount <= 0 || !this.undepositedFundsLinesBalance(debitLine, creditLine)) {
          continue;
        }

        if (Math.abs(debitAmount - remainingCredit) <= 0.005) {
          settledDebitIds.add(debitLine.journalEntryLineId);
          remainingCredit = 0;
          break;
        }
      }
    }

    return openDebits.filter(line =>
      !settledDebitIds.has(line.journalEntryLineId)
      && !depositedLineIds.has(line.journalEntryLineId)
    );
  }

  private filterUntransferredFundsOpenLines(
    lines: JournalEntryLineSearchResponse[],
    transfers: TransferResponse[] = [],
    deposits: DepositResponse[] = [],
    escrowDepositAccountIds: number[] = []
  ): JournalEntryLineSearchResponse[] {
    const openLines = lines
      .filter(line => Math.abs(this.getLineNetAmountFromSearchLine(line)) > 0.005)
      .sort((left, right) => this.compareUndepositedFundsLines(left, right));

    const transferSettledLineIds = this.buildTransferSettledLineIds(
      transfers,
      deposits,
      openLines,
      escrowDepositAccountIds
    );

    return openLines.filter(line => !transferSettledLineIds.has(line.journalEntryLineId));
  }

  private enrichUntransferredFundsLinesFromDeposits(
    lines: JournalEntryLineSearchResponse[],
    deposits: DepositResponse[]
  ): JournalEntryLineSearchResponse[] {
    const contextByDepositId = new Map<string, {
      propertyId: string | null;
      propertyCode: string;
      reservationId: string | null;
      reservationCode: string;
      contactId: string | null;
      contactName: string;
    }>();

    for (const deposit of deposits || []) {
      const depositId = String(deposit.depositId || '').trim();
      if (!depositId) {
        continue;
      }

      const splitWithContext = (deposit.splits || []).find(split =>
        (split.propertyId || '').trim().length > 0
        || (split.propertyCode || '').trim().length > 0
        || (split.reservationId || '').trim().length > 0
        || (split.reservationCode || '').trim().length > 0
        || (split.contactId || '').trim().length > 0
        || (split.contactName || '').trim().length > 0);
      const propertyId = (deposit.propertyId || splitWithContext?.propertyId || '').trim() || null;
      const propertyCode = (splitWithContext?.propertyCode || '').trim();
      const reservationId = (splitWithContext?.reservationId || '').trim() || null;
      const reservationCode = (splitWithContext?.reservationCode || '').trim();
      const contactId = (splitWithContext?.contactId || '').trim() || null;
      const contactName = (splitWithContext?.contactName || '').trim();
      if (propertyId || propertyCode || reservationId || reservationCode || contactId || contactName) {
        contextByDepositId.set(depositId, {
          propertyId,
          propertyCode,
          reservationId,
          reservationCode,
          contactId,
          contactName
        });
      }
    }

    return (lines || []).map(line => {
      const propertyId = String(line.propertyId || '').trim();
      const propertyCode = String(line.propertyCode || '').trim();
      const reservationId = String(line.reservationId || '').trim();
      const reservationCode = String(line.reservationCode || '').trim();
      const contactId = String(line.contactId || '').trim();
      const contactName = String(line.contactName || '').trim();
      if (propertyId || propertyCode || reservationId || reservationCode || contactId || contactName) {
        return line;
      }

      if (Number(line.sourceTypeId) !== SourceType.Deposit) {
        return line;
      }

      const depositContext = contextByDepositId.get(String(line.sourceId || '').trim());
      if (!depositContext) {
        return line;
      }

      return {
        ...line,
        propertyId: depositContext.propertyId ?? line.propertyId,
        propertyCode: depositContext.propertyCode || line.propertyCode,
        reservationId: depositContext.reservationId ?? line.reservationId,
        reservationCode: depositContext.reservationCode || line.reservationCode,
        contactId: depositContext.contactId ?? line.contactId,
        contactName: depositContext.contactName || line.contactName
      };
    });
  }

  private buildDepositedJournalEntryLineIds(deposits: DepositResponse[]): Set<string> {
    const depositedLineIds = new Set<string>();

    for (const deposit of deposits || []) {
      for (const split of deposit.splits || []) {
        const journalEntryLineId = String(split.journalEntryLineId || '').trim();
        if (journalEntryLineId) {
          depositedLineIds.add(journalEntryLineId);
        }
      }
    }

    return depositedLineIds;
  }

  private normalizeJournalEntryLineId(lineId?: string | null): string {
    return String(lineId || '').trim().toLowerCase();
  }

  private buildTransferSettledLineIds(
    transfers: TransferResponse[],
    deposits: DepositResponse[],
    openLines: JournalEntryLineSearchResponse[],
    escrowDepositAccountIds: number[]
  ): Set<string> {
    const settledLineIds = new Set<string>();
    const escrowAccountIdSet = new Set(escrowDepositAccountIds);
    const depositById = new Map<string, DepositResponse>();

    for (const deposit of deposits || []) {
      const depositId = String(deposit.depositId || '').trim().toLowerCase();
      if (depositId) {
        depositById.set(depositId, deposit);
      }
    }

    for (const line of openLines) {
      const lineId = String(line.journalEntryLineId || '').trim();
      const lineNet = this.getLineNetAmountFromSearchLine(line);
      if (!lineId || Math.abs(lineNet) <= 0.005) {
        continue;
      }

      const linkedLineIds = this.buildLinkedLineIdsForOpenLine(line, depositById);

      for (const transfer of transfers || []) {
        if (transfer.isActive === false) {
          continue;
        }

        const transferAmount = Number(transfer.amount || 0);
        if (Math.abs(transferAmount - lineNet) > 0.005) {
          continue;
        }

        const bankAccountId = Number(transfer.bankAccountId || 0);
        if (escrowAccountIdSet.size > 0 && bankAccountId > 0 && !escrowAccountIdSet.has(bankAccountId)) {
          continue;
        }

        const splits = transfer.splits || [];
        if (splits.length === 0) {
          continue;
        }

        const splitTotal = splits.reduce(
          (sum, split) => this.roundCurrencyValue(sum + Number(split.amount || 0)),
          0
        );
        if (Math.abs(splitTotal - transferAmount) > 0.005) {
          continue;
        }

        const splitLineIds = splits
          .map(split => this.normalizeJournalEntryLineId(split.journalEntryLineId))
          .filter(splitLineId => splitLineId.length > 0);
        const hasLineLink = splitLineIds.some(splitLineId => linkedLineIds.has(splitLineId));
        if (hasLineLink) {
          settledLineIds.add(lineId);
          break;
        }

        if (Number(line.sourceTypeId) === SourceType.Deposit) {
          const depositId = String(line.sourceId || '').trim().toLowerCase();
          const deposit = depositById.get(depositId);
          if (deposit && this.transferOverlapsDeposit(transfer, deposit)) {
            settledLineIds.add(lineId);
            break;
          }
        }
      }
    }

    return settledLineIds;
  }

  private buildLinkedLineIdsForOpenLine(
    line: JournalEntryLineSearchResponse,
    depositById: Map<string, DepositResponse>
  ): Set<string> {
    const linkedLineIds = new Set<string>();
    const lineId = this.normalizeJournalEntryLineId(line.journalEntryLineId);
    if (lineId) {
      linkedLineIds.add(lineId);
    }

    if (Number(line.sourceTypeId) === SourceType.Deposit) {
      const depositId = String(line.sourceId || '').trim().toLowerCase();
      const deposit = depositById.get(depositId);
      for (const split of deposit?.splits || []) {
        const splitLineId = this.normalizeJournalEntryLineId(split.journalEntryLineId);
        if (splitLineId) {
          linkedLineIds.add(splitLineId);
        }
      }
    }

    return linkedLineIds;
  }

  private transferOverlapsDeposit(transfer: TransferResponse, deposit: DepositResponse): boolean {
    const transferPropertyIds = new Set(
      (transfer.splits || [])
        .map(split => this.normalizeUndepositedFundsId(split.propertyId))
        .filter(propertyId => propertyId.length > 0)
    );
    const depositPropertyIds = new Set(
      (deposit.splits || [])
        .map(split => this.normalizeUndepositedFundsId(split.propertyId))
        .filter(propertyId => propertyId.length > 0)
    );

    if (transferPropertyIds.size === 0 || depositPropertyIds.size === 0) {
      return false;
    }

    return [...transferPropertyIds].some(propertyId => depositPropertyIds.has(propertyId));
  }

  private compareUndepositedFundsLines(
    left: JournalEntryLineSearchResponse,
    right: JournalEntryLineSearchResponse
  ): number {
    const leftDate = String(left.transactionDate || '');
    const rightDate = String(right.transactionDate || '');
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    const leftCode = String(left.journalEntryCode || '');
    const rightCode = String(right.journalEntryCode || '');
    if (leftCode !== rightCode) {
      return leftCode.localeCompare(rightCode, undefined, { sensitivity: 'base' });
    }

    return String(left.journalEntryLineId || '').localeCompare(String(right.journalEntryLineId || ''));
  }

  private undepositedFundsLinesBalance(
    debitLine: JournalEntryLineSearchResponse,
    creditLine: JournalEntryLineSearchResponse,
    transferCreditMatch = false
  ): boolean {
    const debitAmount = this.getLineNetAmountFromSearchLine(debitLine);
    const creditAmount = Math.abs(this.getLineNetAmountFromSearchLine(creditLine));
    if (Math.abs(debitAmount - creditAmount) > 0.005) {
      return false;
    }

    if (transferCreditMatch) {
      return true;
    }

    if (!this.undepositedFundsLinesShareProperty(debitLine, creditLine)) {
      return false;
    }

    const debitDescription = this.normalizeUndepositedFundsDescription(debitLine);
    const creditDescription = this.normalizeUndepositedFundsDescription(creditLine);
    if (debitDescription && creditDescription && debitDescription !== creditDescription) {
      return false;
    }

    const debitReservationId = this.normalizeUndepositedFundsId(debitLine.reservationId);
    const creditReservationId = this.normalizeUndepositedFundsId(creditLine.reservationId);
    if (debitReservationId && creditReservationId && debitReservationId !== creditReservationId) {
      return false;
    }

    return true;
  }

  private undepositedFundsLinesShareProperty(
    debitLine: JournalEntryLineSearchResponse,
    creditLine: JournalEntryLineSearchResponse
  ): boolean {
    const debitPropertyId = this.normalizeUndepositedFundsId(debitLine.propertyId);
    const creditPropertyId = this.normalizeUndepositedFundsId(creditLine.propertyId);
    if (debitPropertyId && creditPropertyId) {
      return debitPropertyId === creditPropertyId;
    }

    const debitPropertyCode = this.normalizeUndepositedFundsId(debitLine.propertyCode);
    const creditPropertyCode = this.normalizeUndepositedFundsId(creditLine.propertyCode);
    if (debitPropertyCode && creditPropertyCode) {
      return debitPropertyCode === creditPropertyCode;
    }

    return !debitPropertyId && !creditPropertyId && !debitPropertyCode && !creditPropertyCode;
  }

  private normalizeUndepositedFundsDescription(line: JournalEntryLineSearchResponse): string {
    return String(line.memo || line.journalEntryMemo || '').trim().toLowerCase();
  }

  private normalizeUndepositedFundsId(value?: string | null): string {
    return String(value ?? '').trim().toLowerCase();
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  formatDepositAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  onDepositAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;
    const parts = normalizedValue.split('.');
    input.value = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalizedValue;
    this.depositAmountDisplay = input.value;
  }

  onDepositAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = rawValue ? parseFloat(rawValue) : NaN;
    this.depositAmount = isNaN(parsed) ? 0 : parsed;
    this.depositAmountDisplay = this.formatDepositAmountDisplay(this.depositAmount);
    input.value = this.depositAmountDisplay;
  }

  onDepositAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.depositAmount.toString();
    input.select();
  }

  onDepositAmountEnter(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  formatTransferAmountDisplay(amount: number): string {
    return this.formatDepositAmountDisplay(amount);
  }

  onTransferAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;
    const parts = normalizedValue.split('.');
    input.value = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalizedValue;
    this.transferAmountDisplay = input.value;
  }

  onTransferAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = rawValue ? parseFloat(rawValue) : NaN;
    this.transferAmount = isNaN(parsed) ? 0 : parsed;
    this.transferAmountDisplay = this.formatTransferAmountDisplay(this.transferAmount);
    input.value = this.transferAmountDisplay;
  }

  onTransferAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.transferAmount.toString();
    input.select();
  }

  onTransferAmountEnter(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  resolveBankAccountIds(officeIds: number[]): number[] {
    return this.getChartOfAccountsForOfficeIds(officeIds)
      .filter(account => Number(account.accountTypeId) === AccountType.Bank)
      .map(account => Number(account.accountId));
  }

  resolveUndepositedFundsAccountIds(officeIds: number[]): number[] {
    return this.getChartOfAccountsForOfficeIds(officeIds)
      .filter(account =>
        Number(account.accountTypeId) === AccountType.OtherCurrentAsset
        && this.isUndepositedFundsAccount(account))
      .map(account => Number(account.accountId));
  }

  resolveUntransferredFundsAccountIds(officeIds: number[]): number[] {
    const accounts = this.getChartOfAccountsForOfficeIds(officeIds);
    const accountIds = new Set<number>();

    for (const officeId of officeIds) {
      const configuredAccountId = this.getDefaultEscrowDepositAccountId(officeId);
      if (configuredAccountId == null) {
        continue;
      }

      const account = accounts.find(item =>
        Number(item.accountId) === configuredAccountId
        && Number(item.officeId) === officeId);
      if (account) {
        accountIds.add(configuredAccountId);
      }
    }

    return Array.from(accountIds);
  }

  getDefaultEscrowDepositAccountId(officeId: number): number | null {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    const accountId = Number(accountingOffice?.defaultEscrowDepositAccountId ?? 0);
    return accountId > 0 ? accountId : null;
  }

  private resolveTransferSourceEscrowDepositAccountId(
    officeId: number,
    selectedLineIds: string[]
  ): number | null {
    const selectedIdSet = new Set(
      (selectedLineIds || [])
        .map(lineId => String(lineId || '').trim())
        .filter(lineId => lineId.length > 0)
    );
    const accountIds = new Set(
      this.allLines
        .filter(line => selectedIdSet.has(line.journalEntryLineId))
        .map(line => Number(line.chartOfAccountId || 0))
        .filter(accountId => accountId > 0)
    );

    if (accountIds.size === 1) {
      return [...accountIds][0];
    }

    return this.getDefaultEscrowDepositAccountId(officeId)
      ?? (accountIds.size > 0 ? [...accountIds][0] : null);
  }

  private resolveTransferAllocationAccountIds(officeId: number): {
    owners: number | null;
    secDep: number | null;
    sdw: number | null;
    bank: number | null;
  } {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    const toAccountId = (value: number | null | undefined): number | null => {
      const accountId = Number(value ?? 0);
      return accountId > 0 ? accountId : null;
    };

    return {
      owners: toAccountId(accountingOffice?.defaultEscrowOwnersAccountId),
      secDep: toAccountId(accountingOffice?.defaultEscrowSecDepAccountId),
      sdw: toAccountId(accountingOffice?.defaultEscrowSdwAccountId),
      bank: toAccountId(accountingOffice?.defaultBankAccountId)
    };
  }

  private normalizeTransferSourceKey(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
  }

  private extractTransferInvoiceSourceCode(...values: Array<string | null | undefined>): string | null {
    const invoicePattern = /\bR-\d+-\d+\b/i;
    for (const value of values) {
      const text = (value || '').trim();
      if (!text) {
        continue;
      }

      const match = text.match(invoicePattern);
      if (match?.[0]) {
        return match[0].toUpperCase();
      }
    }

    return null;
  }

  private findTransferReportRowByInvoiceSource(
    rows: TransferReportRowDisplay[],
    invoiceSourceCode: string | null
  ): TransferReportRowDisplay | null {
    const normalizedInvoiceSource = this.normalizeTransferSourceKey(invoiceSourceCode);
    if (!normalizedInvoiceSource) {
      return null;
    }

    return rows.find(row => this.normalizeTransferSourceKey(row.source) === normalizedInvoiceSource) ?? null;
  }

  private findTransferReportRowForLine(
    line: JournalEntryLineListDisplay,
    rows: TransferReportRowDisplay[]
  ): TransferReportRowDisplay | null {
    const byInvoiceSource = this.findTransferReportRowByInvoiceSource(
      rows,
      this.extractTransferInvoiceSourceCode(line.description, line.source, line.journalEntryCode)
    );
    if (byInvoiceSource) {
      return byInvoiceSource;
    }

    const lineId = String(line.journalEntryLineId || '').trim();
    if (lineId) {
      const byLineId = rows.find(row => String(row.journalEntryLineId || '').trim() === lineId);
      if (byLineId) {
        return byLineId;
      }
    }

    const journalEntryCode = (line.journalEntryCode || '').trim();
    if (journalEntryCode) {
      const byJournalEntryCode = rows.find(row =>
        this.normalizeTransferSourceKey(row.source) === this.normalizeTransferSourceKey(journalEntryCode)
        || this.normalizeTransferSourceKey(row.journalEntryCode) === this.normalizeTransferSourceKey(journalEntryCode)
      );
      if (byJournalEntryCode) {
        return byJournalEntryCode;
      }
    }

    const sourceKey = this.normalizeTransferSourceKey(line.source);
    if (sourceKey) {
      const bySource = rows.find(row => this.normalizeTransferSourceKey(row.source) === sourceKey);
      if (bySource) {
        return bySource;
      }
    }

    const propertyId = (line.propertyId || '').trim();
    const reservationId = (line.reservationId || '').trim();
    if (propertyId || reservationId) {
      const candidates = rows.filter(row =>
        (!propertyId || (row.propertyId || '').trim() === propertyId)
        && (!reservationId || (row.reservationId || '').trim() === reservationId)
      );
      if (candidates.length === 1) {
        return candidates[0];
      }
    }

    return null;
  }

  private findTransferReportRowForDepositSplit(
    split: DepositSplit,
    rows: TransferReportRowDisplay[],
    journalEntryLines: JournalEntryLineSearchResponse[]
  ): TransferReportRowDisplay | null {
    const byInvoiceSource = this.findTransferReportRowByInvoiceSource(
      rows,
      this.extractTransferInvoiceSourceCode(split.description)
    );
    if (byInvoiceSource) {
      return byInvoiceSource;
    }

    const splitLineId = String(split.journalEntryLineId || '').trim();
    if (splitLineId) {
      const byLineId = rows.find(row => String(row.journalEntryLineId || '').trim() === splitLineId);
      if (byLineId) {
        return byLineId;
      }

      const sourceLine = journalEntryLines.find(line =>
        String(line.journalEntryLineId || '').trim() === splitLineId
      );
      if (sourceLine) {
        const bySourceLineInvoice = this.findTransferReportRowByInvoiceSource(
          rows,
          this.extractTransferInvoiceSourceCode(
            sourceLine.memo,
            sourceLine.journalEntryMemo,
            sourceLine.sourceCode,
            sourceLine.journalEntryCode
          )
        );
        if (bySourceLineInvoice) {
          return bySourceLineInvoice;
        }

        const journalEntryCode = (sourceLine.journalEntryCode || '').trim();
        if (journalEntryCode) {
          const byJournalEntryCode = rows.find(row =>
            this.normalizeTransferSourceKey(row.source) === this.normalizeTransferSourceKey(journalEntryCode)
            || this.normalizeTransferSourceKey(row.journalEntryCode) === this.normalizeTransferSourceKey(journalEntryCode)
          );
          if (byJournalEntryCode) {
            return byJournalEntryCode;
          }
        }
      }
    }

    const propertyId = (split.propertyId || '').trim();
    const reservationId = (split.reservationId || '').trim();
    if (propertyId || reservationId) {
      const candidates = rows.filter(row =>
        (!propertyId || (row.propertyId || '').trim() === propertyId)
        && (!reservationId || (row.reservationId || '').trim() === reservationId)
      );
      if (candidates.length === 1) {
        return candidates[0];
      }
    }

    return null;
  }

  private buildTransferSplitsFromRecap(
    selectedLines: JournalEntryLineListDisplay[],
    transferReportRows: TransferReportRowDisplay[],
    deposits: DepositResponse[],
    officeId: number
  ): TransferSplit[] {
    const accountIds = this.resolveTransferAllocationAccountIds(officeId);
    const splits: TransferSplit[] = [];
    const processedDepositIds = new Set<string>();

    for (const line of selectedLines) {
      if (Number(line.sourceTypeId) === SourceType.Deposit) {
        const depositId = String(line.sourceId || '').trim();
        if (!depositId || processedDepositIds.has(depositId)) {
          continue;
        }
        processedDepositIds.add(depositId);

        const deposit = deposits.find(item => String(item.depositId || '').trim() === depositId);
        const depositSplits = (deposit?.splits || []).filter(split => Number(split.amount || 0) !== 0);
        if (depositSplits.length === 0) {
          const recapRow = this.findTransferReportRowForLine(line, transferReportRows);
          splits.push(...this.buildTransferSplitsForLineAmount(
            recapRow,
            this.getLineNetAmount(line),
            line,
            accountIds
          ));
          continue;
        }

        for (const depositSplit of depositSplits) {
          const recapRow = this.findTransferReportRowForDepositSplit(
            depositSplit,
            transferReportRows,
            this.allLines
          );

          splits.push(...this.buildTransferSplitsForLineAmount(
            recapRow,
            Number(depositSplit.amount || 0),
            line,
            accountIds,
            depositSplit
          ));
        }
        continue;
      }

      const recapRow = this.findTransferReportRowForLine(line, transferReportRows);
      splits.push(...this.buildTransferSplitsForLineAmount(
        recapRow,
        this.getLineNetAmount(line),
        line,
        accountIds
      ));
    }

    return splits;
  }

  private shouldAllocateTransferToBusinessOnly(recapRow: TransferReportRowDisplay | null): boolean {
    if (!recapRow) {
      return true;
    }

    const ownerRent = Number(recapRow.ownerRentActualValue ?? recapRow.ownerRentValue ?? 0);
    const secDep = Number(recapRow.securityDepositValue ?? 0);
    const sdw = Number(recapRow.sdwValue ?? 0);
    return ownerRent === 0 && secDep === 0 && sdw === 0;
  }

  private buildTransferSplitsForLineAmount(
    recapRow: TransferReportRowDisplay | null,
    baseAmount: number,
    contextLine: JournalEntryLineListDisplay,
    accountIds: {
      owners: number | null;
      secDep: number | null;
      sdw: number | null;
      bank: number | null;
    },
    depositSplit?: DepositSplit
  ): TransferSplit[] {
    if (this.shouldAllocateTransferToBusinessOnly(recapRow)) {
      return this.buildBusinessOnlyTransferSplits(baseAmount, contextLine, accountIds, depositSplit);
    }

    return this.buildTransferSplitsFromRecapRow(
      recapRow!,
      baseAmount,
      contextLine,
      accountIds,
      depositSplit
    );
  }

  private buildBusinessOnlyTransferSplits(
    baseAmount: number,
    contextLine: JournalEntryLineListDisplay,
    accountIds: {
      bank: number | null;
    },
    depositSplit?: DepositSplit
  ): TransferSplit[] {
    const amount = this.roundCurrencyValue(baseAmount);
    if (amount === 0 || !accountIds.bank) {
      return [];
    }

    const source = (depositSplit?.description || contextLine.source || contextLine.description || '').trim();
    const description = source ? `Transfer ${source}` : 'Transfer';

    return [{
      amount,
      description,
      propertyId: (depositSplit?.propertyId || contextLine.propertyId || '').trim() || null,
      reservationId: (depositSplit?.reservationId || contextLine.reservationId || '').trim() || null,
      contactId: (depositSplit?.contactId || contextLine.contactId || '').trim() || null,
      journalEntryLineId: (contextLine.journalEntryLineId || depositSplit?.journalEntryLineId || '').trim() || null,
      chartOfAccountId: accountIds.bank
    }];
  }

  private buildTransferSplitsFromRecapRow(
    recapRow: TransferReportRowDisplay,
    baseAmount: number,
    contextLine: JournalEntryLineListDisplay,
    accountIds: {
      owners: number | null;
      secDep: number | null;
      sdw: number | null;
      bank: number | null;
    },
    depositSplit?: DepositSplit
  ): TransferSplit[] {
    const expectedIncome = Number(recapRow.expectedIncomeValue || 0);
    const ownerEscrow = this.scaleTransferAllocationAmount(
      recapRow.ownerRentActualValue ?? recapRow.ownerRentValue,
      baseAmount,
      expectedIncome
    );
    const secDep = this.scaleTransferAllocationAmount(recapRow.securityDepositValue, baseAmount, expectedIncome);
    const sdw = this.scaleTransferAllocationAmount(recapRow.sdwValue, baseAmount, expectedIncome);
    let bank = this.roundCurrencyValue(baseAmount - ownerEscrow - secDep - sdw);

    const drift = this.roundCurrencyValue(baseAmount - (ownerEscrow + secDep + sdw + bank));
    if (drift !== 0) {
      bank = this.roundCurrencyValue(bank + drift);
    }

    const propertyId = (depositSplit?.propertyId || recapRow.propertyId || contextLine.propertyId || '').trim() || null;
    const reservationId = (depositSplit?.reservationId || recapRow.reservationId || contextLine.reservationId || '').trim() || null;
    const contactId = (depositSplit?.contactId || contextLine.contactId || '').trim() || null;
    const journalEntryLineId = (contextLine.journalEntryLineId || depositSplit?.journalEntryLineId || '').trim() || null;
    const source = (recapRow.source || contextLine.source || '').trim();
    const description = source ? `Transfer ${source}` : 'Transfer';

    const allocations: Array<{ amount: number; accountId: number | null }> = [
      { amount: ownerEscrow, accountId: accountIds.owners },
      { amount: secDep, accountId: accountIds.secDep },
      { amount: sdw, accountId: accountIds.sdw },
      { amount: bank, accountId: accountIds.bank }
    ];

    const splits: TransferSplit[] = [];
    for (const allocation of allocations) {
      const amount = this.roundCurrencyValue(allocation.amount);
      if (amount === 0 || !allocation.accountId) {
        continue;
      }

      splits.push({
        amount,
        description,
        propertyId,
        reservationId,
        contactId,
        journalEntryLineId,
        chartOfAccountId: allocation.accountId
      });
    }

    return splits;
  }

  private buildTransferReportLinesDisplay(
    escrowLines: JournalEntryLineListDisplay[]
  ): JournalEntryLineListDisplay[] {
    const expanded: JournalEntryLineListDisplay[] = [];

    for (const line of escrowLines) {
      expanded.push(line);

      const officeId = line.officeId ?? this.officeId ?? 0;
      const recapRow = this.findTransferReportRowForLine(line, this.transferReportRows);
      if (officeId <= 0) {
        continue;
      }

      const accountIds = this.resolveTransferAllocationAccountIds(officeId);
      const projectedSplits = this.buildTransferSplitsForLineAmount(
        recapRow,
        this.getLineNetAmount(line),
        line,
        accountIds
      );

      if (projectedSplits.length === 0) {
        continue;
      }

      for (const split of projectedSplits) {
        const account = this.chartOfAccounts.find(item =>
          Number(item.accountId) === Number(split.chartOfAccountId)
          && Number(item.officeId) === officeId);
        expanded.push(this.buildProjectedTransferLine(line, split, account));
      }
    }

    return expanded;
  }

  private buildProjectedTransferLine(
    contextLine: JournalEntryLineListDisplay,
    split: TransferSplit,
    account: ChartOfAccountResponse | undefined
  ): JournalEntryLineListDisplay {
    const amount = this.roundCurrencyValue(Number(split.amount || 0));
    const accountLabel = account
      ? this.utilityService.getChartOfAccountDropdownLabel(account)
      : '';

    return {
      journalEntryLineId: `transfer-report-projected-${contextLine.journalEntryLineId}-${split.chartOfAccountId}`,
      journalEntryId: '',
      officeId: contextLine.officeId,
      transactionDate: contextLine.transactionDate,
      journalEntryCode: '',
      source: '',
      propertyId: split.propertyId,
      propertyCode: contextLine.propertyCode,
      reservationId: split.reservationId,
      reservationCode: contextLine.reservationCode,
      contactId: split.contactId,
      contactName: contextLine.contactName,
      account: accountLabel,
      description: (split.description || '').trim() || 'Transfer',
      debit: this.formatter.currencyUsd(amount),
      credit: '',
      balance: '',
      debitValue: amount,
      creditValue: 0,
      balanceValue: 0,
      isPosted: false,
      isVoided: false,
      sortDateValue: contextLine.sortDateValue,
      disabled: true
    };
  }

  private scaleTransferAllocationAmount(value: number, baseAmount: number, expectedIncome: number): number {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      return 0;
    }

    if (expectedIncome <= 0) {
      return this.roundCurrencyValue(amount);
    }

    return this.roundCurrencyValue(amount * (baseAmount / expectedIncome));
  }

  private scaleTransferSplitsToAmount(
    splits: TransferSplit[],
    targetAmount: number,
    currentTotal: number
  ): TransferSplit[] {
    const target = this.roundCurrencyValue(targetAmount);
    const current = this.roundCurrencyValue(currentTotal);
    if (current === 0 || target === current) {
      return splits;
    }

    const ratio = target / current;
    const scaled = splits.map(split => ({
      ...split,
      amount: this.roundCurrencyValue(Number(split.amount || 0) * ratio)
    }));
    const scaledTotal = scaled.reduce(
      (sum, split) => this.roundCurrencyValue(sum + Number(split.amount || 0)),
      0
    );
    const drift = this.roundCurrencyValue(target - scaledTotal);
    if (drift !== 0 && scaled.length > 0) {
      const lastSplit = scaled[scaled.length - 1];
      lastSplit.amount = this.roundCurrencyValue(Number(lastSplit.amount || 0) + drift);
    }

    return scaled;
  }

  private validateBuiltTransferSplits(
    splits: TransferSplit[],
    accountIds: {
      owners: number | null;
      secDep: number | null;
      sdw: number | null;
      bank: number | null;
    }
  ): string | null {
    if (splits.length === 0) {
      return 'Unable to resolve transfer allocations for the selected lines.';
    }

    const totals = splits.reduce((acc, split) => {
      const amount = Number(split.amount || 0);
      const accountId = Number(split.chartOfAccountId || 0);
      if (accountId === accountIds.owners) {
        acc.owners += amount;
      } else if (accountId === accountIds.secDep) {
        acc.secDep += amount;
      } else if (accountId === accountIds.sdw) {
        acc.sdw += amount;
      } else if (accountId === accountIds.bank) {
        acc.bank += amount;
      }
      return acc;
    }, { owners: 0, secDep: 0, sdw: 0, bank: 0 });

    if (totals.secDep !== 0 && !accountIds.secDep) {
      return 'Security deposit escrow account is not configured for this office.';
    }
    if (totals.sdw !== 0 && !accountIds.sdw) {
      return 'SDW escrow account is not configured for this office.';
    }
    if (totals.bank !== 0 && !accountIds.bank) {
      return 'Business bank account is not configured for this office.';
    }

    return null;
  }

  getTransferDestinationAccountIds(officeId: number): number[] {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    return [
      Number(accountingOffice?.defaultEscrowSecDepAccountId ?? 0),
      Number(accountingOffice?.defaultEscrowSdwAccountId ?? 0),
      Number(accountingOffice?.defaultEscrowOwnersAccountId ?? 0),
      Number(accountingOffice?.defaultBankAccountId ?? 0)
    ].filter(accountId => accountId > 0);
  }

  getChartOfAccountsForOfficeIds(officeIds: number[]): ChartOfAccountResponse[] {
    if (officeIds.length === 1) {
      return this.chartOfAccounts.filter(account => account.officeId === officeIds[0]);
    }

    const allAccounts = this.chartOfAccounts;
    return allAccounts.filter(account => officeIds.includes(account.officeId));
  }

  isUndepositedFundsAccount(account: ChartOfAccountResponse): boolean {
    const name = (account.name || '').toLowerCase();
    const accountNo = (account.accountNo || '').toLowerCase();
    return name.includes('undeposited') || accountNo.includes('undeposited');
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelJournalEntryLinesLoad$.next();
    this.cancelJournalEntryLinesLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
