import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject, Subject, catchError, filter, finalize, forkJoin, of, take, takeUntil } from 'rxjs';
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
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountType, SourceType, SourceTypeLabels } from '../models/accounting-enum';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { CheckHtmlService } from '../services/check-html.service';
import { CheckPrintService } from '../services/check-print.service';
import { GeneralLedgerService } from '../services/general-ledger.service';

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
  @Input() depositsOnly = false;
  @Input() printChecksOnly = false;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() depositCompletedEvent = new EventEmitter<void>();

  selectedJournalEntryLineIds = new Set<string>();
  showDepositSelections = false;
  showDepositForm = false;
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

  isServiceError = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];
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

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (this.printChecksOnly) {
      this.displayedColumns['contactName'].displayAs = 'Vendor';
    }
    this.loadOffices();
    this.loadChartOfAccounts();
    this.loadJournalEntryLines();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      if (this.showDepositForm) {
        this.cancelDepositForm();
      }
      if (this.showCheckPreview) {
        this.closeCheckPreview();
      }
      this.applyLinesDisplay();
    }

    const shouldReloadLines =
      (changes['chartOfAccountId'] && !changes['chartOfAccountId'].firstChange)
      || (changes['undepositedFundsOnly'] && !changes['undepositedFundsOnly'].firstChange)
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
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.loadJournalEntryLines();
    }
  }

  get showDepositTableSelections(): boolean {
    return this.undepositedFundsOnly && this.showDepositSelections;
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

  get isDepositSelectionMode(): boolean {
    return this.showDepositForm && this.showDepositTableSelections;
  }

  get isDepositFormValid(): boolean {
    const hasDepositDate = this.utilityService.toDateOnlyJsonString(this.depositDate) !== null;
    return hasDepositDate
      && !!this.selectedDepositBankChartOfAccountId
      && this.depositAmount !== 0
      && this.selectedJournalEntryLineIds.size > 0;
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

    this.isSubmittingDeposit = true;
    this.generalLedgerService.makeDeposit({
      officeId,
      depositDate,
      chartOfAccountId: this.selectedDepositBankChartOfAccountId!,
      description: (this.depositDescription || '').trim(),
      amount: this.depositAmount,
      journalEntryLineIds: selectedLines.map(line => line.journalEntryLineId)
    }).pipe(
      finalize(() => {
        this.isSubmittingDeposit = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success('Deposit journal entry created.', CommonMessage.Success);
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
    if (this.showDepositForm || this.showCheckPreview || !row?.journalEntryId) {
      return;
    }
    this.lineSelectEvent.emit({
      journalEntryId: row.journalEntryId,
      journalEntryLineId: row.journalEntryLineId
    });
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

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(
      filter(loaded => loaded === true),
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts'))
    ).subscribe({
      next: () => {
        this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
          this.chartOfAccounts = accounts || [];
          this.markViewForCheck();
        });
      },
      error: () => {
        this.chartOfAccounts = [];
        this.markViewForCheck();
      }
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
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.markViewForCheck();
      return;
    }

    const undepositedFundsAccountIds = this.undepositedFundsOnly
      ? this.resolveUndepositedFundsAccountIds(officeIds)
      : [];
    const printChecksBankAccountIds = this.printChecksOnly
      ? this.resolveBankAccountIds(officeIds)
      : [];
    const depositsBankAccountIds = this.depositsOnly
      ? this.resolveBankAccountIds(officeIds)
      : [];
    const filteredAccountIds = undepositedFundsAccountIds.length > 0
      ? undepositedFundsAccountIds
      : depositsBankAccountIds.length > 0
        ? depositsBankAccountIds
        : printChecksBankAccountIds;

    if ((this.undepositedFundsOnly || this.depositsOnly || this.printChecksOnly) && filteredAccountIds.length === 0) {
      this.allLines = [];
      this.linesDisplay = [];
      this.isServiceError = false;
      if (this.showDepositForm) {
        this.cancelDepositForm();
      } else if (this.undepositedFundsOnly) {
        this.clearDepositLineSelection();
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.noActivityMessage = this.undepositedFundsOnly
        ? 'No Undeposited Funds account is configured for the selected office.'
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
    }

    this.isServiceError = false;

    const usesFixedAccountFilter = this.undepositedFundsOnly || this.depositsOnly || this.printChecksOnly;
    const chartOfAccountId = usesFixedAccountFilter
      ? (filteredAccountIds.length === 1 ? filteredAccountIds[0] : null)
      : (this.chartOfAccountId != null && this.chartOfAccountId > 0 ? this.chartOfAccountId : null);

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
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: lines => {
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
        this.allLines = resolvedLines;
        this.noActivityMessage = this.undepositedFundsOnly
          ? 'No Undeposited Funds activity for the selected office and date range.'
          : this.depositsOnly
            ? 'No bank deposit activity for the selected office and date range.'
            : this.printChecksOnly
              ? 'No bill payment bank credits for the selected office and date range.'
              : 'No general ledger activity for the selected filters and date range.';
        this.applyLinesDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
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
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  applyLinesDisplay(): void {
    this.linesDisplay = this.mappingService.mapJournalEntryLineListDisplay(
      this.allLines,
      this.chartOfAccounts,
      SourceTypeLabels
    ).map(line => ({
      ...line,
      selected: (this.showDepositTableSelections || this.showPrintCheckTableSelections)
        && this.selectedJournalEntryLineIds.has(line.journalEntryLineId),
      disabled: (this.showDepositTableSelections && this.getLineNetAmount(line) <= 0)
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

    this.depositBankChartOfAccounts = (this.chartOfAccountsService.getChartOfAccountsForOffice(officeId) || [])
      .filter(account => Number(account.accountTypeId) === AccountType.Bank)
      .sort((left, right) => {
        const leftLabel = `${left.accountNo || ''} ${left.name || ''}`.trim();
        const rightLabel = `${right.accountNo || ''} ${right.name || ''}`.trim();
        return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
      })
      .map(account => ({
        value: Number(account.accountId),
        label: `${account.accountNo}: ${account.name}`
      }));

    if (
      this.selectedDepositBankChartOfAccountId != null
      && !this.depositBankChartOfAccounts.some(account => account.value === this.selectedDepositBankChartOfAccountId)
    ) {
      this.selectedDepositBankChartOfAccountId = null;
      this.depositTransactionType = '';
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

  getLineNetAmount(line: Pick<JournalEntryLineListDisplay, 'debitValue' | 'creditValue'>): number {
    return this.roundCurrencyValue(Number(line.debitValue || 0) - Number(line.creditValue || 0));
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

  getChartOfAccountsForOfficeIds(officeIds: number[]): ChartOfAccountResponse[] {
    if (officeIds.length === 1) {
      return this.chartOfAccountsService.getChartOfAccountsForOffice(officeIds[0]) || [];
    }

    const allAccounts = this.chartOfAccountsService.getAllChartOfAccountsValue() || [];
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
