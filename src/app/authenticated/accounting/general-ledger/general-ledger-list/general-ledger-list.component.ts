import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, EMPTY, Subject, catchError, concatMap, finalize, forkJoin, from, map, merge, of, switchMap, take, takeUntil, throwError, toArray } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../../app.routes';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { AuthService } from '../../../../services/auth.service';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DocumentHtmlService } from '../../../../services/document-html.service';
import { PdfThumbnailService } from '../../../../services/pdf-thumbnail.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { AccountType, PostingStatus, SourceType, SourceTypeLabels, getPostingStatusLabel, isJournalEntryHardClosed, isJournalEntryPosted, isJournalEntrySoftClosed, isJournalEntrySourceNavigable, isUserEditableJournalEntry } from '../../models/accounting-enum';
import { OwnerStatementActivityLinkSelection } from '../../models/owner-statement.model';
import { JournalEntrySourceService } from '../../services/journal-entry-source.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { GeneralLedgerEntryDisplay, JournalEntryLineListDisplay, JournalEntryLineSearchResponse, JournalEntryLineSelection, JournalEntryPostingAction, JournalEntryPostingDialogEntry, JournalEntryPostingDialogResult, JournalEntryResponse } from '../../models/journal-entry.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { CheckHtmlService } from '../../services/check-html.service';
import { CheckPrintService } from '../../services/check-print.service';
import { CheckPrintApiService } from '../../services/check-print-api.service';
import { ConfirmCheckNumberDialogComponent, ConfirmCheckNumberDialogData, ConfirmCheckNumberDialogResult } from '../../bank/confirm-check-number-dialog/confirm-check-number-dialog.component';
import { DepositRequest, DepositResponse, DepositSplit } from '../../models/deposit.model';
import { DepositService } from '../../services/deposit.service';
import { TransferDepositAllocationItemRequest, TransferDepositAllocationResponse, TransferRequest, TransferResponse, TransferSplit } from '../../models/transfer.model';
import { TransferService } from '../../services/transfer.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { JournalEntryPostingDialogComponent } from '../journal-entry-posting-dialog/journal-entry-posting-dialog.component';

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
  @Input() reservationContactId: string | null = null;
  @Input() chartOfAccountId: number | null = null;
  @Input() undepositedFundsOnly = false;
  @Input() untransferredFundsOnly = false;
  @Input() transferReportOnly = false;
  @Input() depositsOnly = false;
  @Input() printChecksOnly = false;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<JournalEntryLineSelection>();
  @Output() depositCompletedEvent = new EventEmitter<void>();
  @Output() transferCompletedEvent = new EventEmitter<void>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();
  @Output() createJournalEntryEvent = new EventEmitter<JournalEntryResponse | null>();
  @Output() journalEntryCreatedEvent = new EventEmitter<JournalEntryResponse | undefined>();
  @Output() officeValidationRequiredEvent = new EventEmitter<void>();
  generalLedgerService = inject(GeneralLedgerService);
  mappingService = inject(MappingService);
  formatter = inject(FormatterService);
  private officeService = inject(OfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private checkHtmlService = inject(CheckHtmlService);
  private checkPrintService = inject(CheckPrintService);
  private checkPrintApiService = inject(CheckPrintApiService);
  private pdfThumbnailService = inject(PdfThumbnailService);
  private dialog = inject(MatDialog);
  private documentHtmlService = inject(DocumentHtmlService);
  private sanitizer = inject(DomSanitizer);
  private authService = inject(AuthService);
  private depositService = inject(DepositService);
  private transferService = inject(TransferService);
  private journalEntrySourceService = inject(JournalEntrySourceService);
  private journalEntryService = inject(JournalEntryService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  selectedJournalEntryLineIds = new Set<string>();
  selectedJournalEntryIds = new Set<string>();
  isPostingJournalEntries = false;
  isCreatingRetainedEarningsJournalEntry = false;
  showDepositForm = false;
  showTransferForm = false;
  showCheckPreview = false;
  isLoadingCheckPreview = false;
  checkPreviewTitle = 'Check Preview';
  safeCheckPreviewHtml: SafeHtml | null = null;
  checkPreviewIframeKey = 0;
  @ViewChild('checkPreviewIframe') checkPreviewIframe?: ElementRef<HTMLIFrameElement>;
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
  loadedDeposits: DepositResponse[] = [];
  transferDepositAllocations: TransferDepositAllocationResponse[] = [];
  linesDisplay: JournalEntryLineListDisplay[] = [];
  entriesDisplay: GeneralLedgerEntryDisplay[] = [];
  expandedJournalEntries = new Set<string>();
  isAllExpanded = false;
  showManualOnly = false;
  includeCashOnly = false;
  includeAll = false;
  noActivityMessage = 'No general ledger activity for the selected office and date range.';

  @ViewChild('journalEntryLinesTemplate') journalEntryLinesTemplate?: TemplateRef<unknown>;

  displayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: true, alignment: 'center', headerAlignment: 'center' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    journalEntryCode: { displayAs: 'Entry No', maxWidth: '14ch', sortType: 'natural' },
    source: { displayAs: 'Source', maxWidth: '16ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    account: { displayAs: 'Account', maxWidth: '28ch' },
    description: { displayAs: 'Description', maxWidth: '32ch' },
    debit: { displayAs: 'Debit', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    credit: { displayAs: 'Credit', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' }
  };

  detailLineDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: true, alignment: 'center', headerAlignment: 'center' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    account: { displayAs: 'Account', maxWidth: '42ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '38ch', wrap: true },
    debit: { displayAs: 'Debit', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    credit: { displayAs: 'Credit', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' }
  };

  detailLineSortColumn: string | null = null;
  detailLineSortDirection: 'asc' | 'desc' = 'asc';

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['journalEntryLines']));
  destroy$ = new Subject<void>();
  private readonly journalEntryLinesLoadKey = 'journalEntryLines';
  private journalEntryLinesLoadId = 0;
  private cancelJournalEntryLinesLoad$ = new Subject<void>();

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
    this.loadAccountingOffices();
    this.initializeJournalEntryLines();
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

    const shouldReloadLines = (changes['chartOfAccountId'] && !changes['chartOfAccountId'].firstChange)
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
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.markViewForCheck();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
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
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.markViewForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.markViewForCheck();
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe({
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
      } else if (this.usesUntransferredOpenLinesFilter()) {
        if (this.untransferredFundsOnly && this.showTransferForm) {
          this.cancelTransferForm();
        } else if (this.untransferredFundsOnly) {
          this.clearUntransferredFundsLineSelection();
        }
      } else if (this.printChecksOnly) {
        this.clearPrintCheckLineSelection();
      }
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.journalEntryLinesLoadKey);
      this.markViewForCheck();
      return;
    }

    const undepositedFundsAccountIds = this.undepositedFundsOnly ? this.resolveUndepositedFundsAccountIds(officeIds) : [];
    const untransferredFundsAccountIds = this.usesUntransferredOpenLinesFilter() ? this.resolveUntransferredFundsAccountIds(officeIds) : [];
    const printChecksBankAccountIds = this.printChecksOnly ? this.resolveBankAccountIds(officeIds) : [];
    const depositsBankAccountIds = this.depositsOnly ? this.resolveBankAccountIds(officeIds) : [];
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
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.journalEntryLinesLoadKey);
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
    this.utilityService.addLoadItem(this.itemsToLoad$, this.journalEntryLinesLoadKey);
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
      includeUnposted: true,
      includeCashOnly: this.includeCashOnly,
      showAll: this.includeAll,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(
      takeUntil(loadUntil),
      finalize(() => {
        if (this.journalEntryLinesLoadId !== loadId || this.transferReportOnly) {
          return;
        }

        this.finishJournalEntryLinesLoad(loadId);
      })
    ).subscribe({
      next: (lines) => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        if (this.usesUntransferredOpenLinesFilter()) {
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
            })
          }).pipe(takeUntil(loadUntil)).subscribe({
            next: (result) => {
              if (this.journalEntryLinesLoadId !== loadId) {
                return;
              }

              const refinedLines = this.filterJournalEntryLinesByMode(
                lines || [],
                filteredAccountIds,
                usesFixedAccountFilter,
                result.deposits,
                result.transfers
              );
              this.loadedDeposits = result.deposits || [];
              this.applyLoadedJournalEntryLines(refinedLines, loadId);
            },
            error: () => {
              if (this.journalEntryLinesLoadId !== loadId) {
                return;
              }

              const refinedLines = this.filterJournalEntryLinesByMode(
                lines || [],
                filteredAccountIds,
                usesFixedAccountFilter,
                [],
                []
              );
              this.loadedDeposits = [];
              this.applyLoadedJournalEntryLines(refinedLines, loadId);
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

  //#region General Ledger Support Methods
  initializeJournalEntryLines(): void {
    const offices$ = this.organizationId
      ? this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), catchError(() => of([])))
      : of([]);

    forkJoin({
      offices: offices$,
      chartOfAccounts: this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1), catchError(() => of([]))),
      accountingOffices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), catchError(() => of([])))
    }).pipe(take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.loadJournalEntryLines();
    });
  }
  
  finishJournalEntryLinesLoad(loadId: number): void {
    if (this.journalEntryLinesLoadId !== loadId) {
      return;
    }

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.journalEntryLinesLoadKey);
    this.markViewForCheck();
  }
  onTableLineSelectionSet(): void {
    if (this.showDepositTableSelections) {
      this.onDepositLineSelectionSet();
    } else if (this.showTransferTableSelections) {
      this.onTransferLineSelectionSet();
    } else if (this.showPrintCheckTableSelections) {
      this.onPrintCheckLineSelectionSet();
    } else if (this.showJournalEntryPostSelections) {
      this.onPostJournalEntrySelectionSet();
    }
  }

  postSelectedJournalEntries(): void {
    if (this.isPostingJournalEntries) {
      return;
    }

    if (!this.officeId) {
      this.officeValidationRequiredEvent.emit();
      this.toastr.error('Please correct the highlighted fields before posting.', CommonMessage.Error);
      return;
    }

    this.dialog.open(JournalEntryPostingDialogComponent, {
      width: '95vw',
      maxWidth: '72rem',
      maxHeight: '95vh',
      panelClass: 'accounting-form-dialog-panel',
      data: {
        officeId: this.officeId,
        officeIds: [this.officeId],
        initialEntries: this.buildPostingDialogInitialEntries()
      }
    }).afterClosed().pipe(take(1), takeUntil(this.destroy$)).subscribe((result: JournalEntryPostingDialogResult | undefined) => {
      if (!result) {
        return;
      }
      this.executePostingDialogResult(result);
    });
  }

  executePostingDialogResult(result: JournalEntryPostingDialogResult): void {
    const journalEntryIds = [...new Set(result.journalEntryIds.map(id => id.trim()).filter(id => id.length > 0))];

    if (result.action === 'softClose' || result.action === 'hardClose') {
      this.executeCloseAccountingPeriod(result, journalEntryIds);
      return;
    }

    if (journalEntryIds.length === 0) {
      return;
    }

    const postingDate = this.utilityService.todayAsCalendarDateString();
    if (!postingDate) {
      this.toastr.warning('Accounting period is required.');
      return;
    }

    this.isPostingJournalEntries = true;
    this.markViewForCheck();

    from(journalEntryIds).pipe(
      concatMap(journalEntryId => this.generalLedgerService.postJournalEntry(journalEntryId, postingDate).pipe(
        map(() => ({ journalEntryId, succeeded: true as const })),
        catchError(() => of({ journalEntryId, succeeded: false as const }))
      )),
      toArray(),
      finalize(() => {
        this.isPostingJournalEntries = false;
        this.markViewForCheck();
      }),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe((results: Array<{ journalEntryId: string; succeeded: boolean }>) => {
      const successCount = results.filter(result => result.succeeded).length;
      const failedCount = results.length - successCount;

      this.selectedJournalEntryIds.clear();
      this.syncPostJournalEntrySelectionInPlace();

      if (successCount > 0) {
        this.toastr.success(this.buildPostingSuccessMessage(result.action, successCount), CommonMessage.Success);
        this.journalEntryCreatedEvent.emit();
      }

      if (failedCount > 0) {
        this.toastr.error(this.buildPostingFailureMessage(result.action, failedCount), CommonMessage.Error);
      }

      if (successCount > 0 || failedCount > 0) {
        this.loadJournalEntryLines();
      }

      this.markViewForCheck();
    });
  }

  executeCloseAccountingPeriod(result: JournalEntryPostingDialogResult, journalEntryIds: string[]): void {
    const officeId = result.officeId ?? this.officeId;
    if (!officeId || !result.startDate || !result.endDate) {
      this.toastr.error('Office and date range are required to close an accounting period.', CommonMessage.Error);
      return;
    }

    const postingStatusId = result.action === 'softClose' ? PostingStatus.SoftClosed : PostingStatus.HardClosed;
    this.isPostingJournalEntries = true;
    this.markViewForCheck();

    this.generalLedgerService.closeAccountingPeriod({
      officeId,
      startDate: result.startDate,
      endDate: result.endDate,
      postingStatusId,
      journalEntryIds
    }).pipe(
      finalize(() => {
        this.isPostingJournalEntries = false;
        this.markViewForCheck();
      }),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: closeResult => {
        this.selectedJournalEntryIds.clear();
        this.syncPostJournalEntrySelectionInPlace();

        if (closeResult.closedDateId) {
          if (closeResult.successCount > 0) {
            this.toastr.success(this.buildPostingSuccessMessage(result.action, closeResult.successCount), CommonMessage.Success);
          } else {
            this.toastr.success(this.buildPeriodClosedSuccessMessage(result.action), CommonMessage.Success);
          }
          this.journalEntryCreatedEvent.emit();
        } else if (closeResult.successCount > 0) {
          this.toastr.success(this.buildPostingSuccessMessage(result.action, closeResult.successCount), CommonMessage.Success);
          this.toastr.warning('Journal entries were closed, but the closed date range was not saved.', CommonMessage.Error);
          this.journalEntryCreatedEvent.emit();
        }

        if (closeResult.failedCount > 0) {
          this.toastr.error(this.buildPostingFailureMessage(result.action, closeResult.failedCount), CommonMessage.Error);
        }

        if (closeResult.closedDateId || closeResult.successCount > 0 || closeResult.failedCount > 0) {
          this.loadJournalEntryLines();
        }

        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        const apiMessage = this.utilityService.extractApiErrorMessage(err);
        this.toastr.error(
          apiMessage || (result.action === 'softClose'
            ? 'Unable to soft close the accounting period.'
            : 'Unable to hard close the accounting period.'),
          CommonMessage.Error
        );
      }
    });
  }

  buildPostingDialogInitialEntries(): JournalEntryPostingDialogEntry[] {
    return this.entriesDisplay
      .filter(entry => this.selectedJournalEntryIds.has(entry.journalEntryId))
      .map(entry => this.mapEntryToPostingDialogEntry(entry));
  }

  mapEntryToPostingDialogEntry(entry: GeneralLedgerEntryDisplay): JournalEntryPostingDialogEntry {
    const sourceLine = this.allLines.find(line => line.journalEntryId === entry.journalEntryId);
    const firstLine = entry.journalEntryLines[0];
    const postingStatusId = Number(firstLine?.postingStatusId ?? sourceLine?.postingStatusId ?? PostingStatus.Open);
    return {
      journalEntryId: entry.journalEntryId,
      journalEntryCode: entry.journalEntryCode,
      transactionDate: entry.transactionDate,
      accountingPeriod: this.formatter.formatDateString(sourceLine?.accountingPeriod ?? ''),
      description: entry.description,
      postingStatusId,
      postingStatusLabel: getPostingStatusLabel(postingStatusId)
    };
  }

  buildPostingSuccessMessage(action: JournalEntryPostingAction, count: number): string {
    if (action === 'softClose') {
      return count === 1 ? 'Journal entry soft closed successfully.' : `${count} journal entries soft closed successfully.`;
    }
    if (action === 'hardClose') {
      return count === 1 ? 'Journal entry hard closed successfully.' : `${count} journal entries hard closed successfully.`;
    }
    return count === 1 ? 'Journal entry posted successfully.' : `${count} journal entries posted successfully.`;
  }

  buildPeriodClosedSuccessMessage(action: JournalEntryPostingAction): string {
    return action === 'softClose'
      ? 'Accounting period soft closed successfully.'
      : 'Accounting period hard closed successfully.';
  }

  buildPostingFailureMessage(action: JournalEntryPostingAction, count: number): string {
    if (action === 'softClose') {
      return count === 1 ? 'Unable to soft close one journal entry.' : `Unable to soft close ${count} journal entries.`;
    }
    if (action === 'hardClose') {
      return count === 1 ? 'Unable to hard close one journal entry.' : `Unable to hard close ${count} journal entries.`;
    }
    return count === 1 ? 'Unable to post one journal entry.' : `Unable to post ${count} journal entries.`;
  }

  onPostJournalEntrySelectionSet(): void {
    if (!this.showJournalEntryPostSelections) {
      return;
    }

    const nextSelectedIds = new Set(
      this.entriesDisplay
        .filter(row => !!row.selected && row.journalEntryId)
        .map(row => (row.journalEntryId || '').trim())
        .filter(id => id.length > 0)
    );

    for (const journalEntryId of [...nextSelectedIds]) {
      const entry = this.entriesDisplay.find(item => item.journalEntryId === journalEntryId);
      if (!entry || !this.isPostJournalEntrySelectable(entry)) {
        nextSelectedIds.delete(journalEntryId);
        if (entry) {
          entry.selected = false;
        }
      }
    }

    this.selectedJournalEntryIds = nextSelectedIds;
    this.syncPostJournalEntrySelectionInPlace();
    this.markViewForCheck();
  }

  isPostJournalEntrySelectable(entry: GeneralLedgerEntryDisplay): boolean {
    const firstLine = entry.journalEntryLines?.[0];
    if (!firstLine) {
      return false;
    }

    return !isJournalEntryPosted(firstLine.postingStatusId)
      && !isJournalEntrySoftClosed(firstLine.postingStatusId)
      && !isJournalEntryHardClosed(firstLine.postingStatusId)
      && !entry.disabled;
  }

  isPostJournalEntryLinesPostable(lines: JournalEntryLineListDisplay[]): boolean {
    const firstLine = lines[0];
    if (!firstLine) {
      return false;
    }

    return !isJournalEntryPosted(firstLine.postingStatusId)
      && !isJournalEntrySoftClosed(firstLine.postingStatusId)
      && !isJournalEntryHardClosed(firstLine.postingStatusId)
      && !lines.every(line => line.disabled);
  }

  syncPostJournalEntrySelectionInPlace(): void {
    this.entriesDisplay.forEach(entry => {
      entry.selected = this.selectedJournalEntryIds.has(entry.journalEntryId);
    });
  }

  onLineSelect(row: JournalEntryLineListDisplay | GeneralLedgerEntryDisplay): void {
    this.emitJournalEntryLineSelection(row.journalEntryId, row.journalEntryLineId);
  }

  onDetailLineSelect(entry: GeneralLedgerEntryDisplay, line: JournalEntryLineListDisplay): void {
    this.emitJournalEntryLineSelection(entry.journalEntryId, line.journalEntryLineId);
  }

emitJournalEntryLineSelection(journalEntryId: string | null | undefined, journalEntryLineId: string | null | undefined): void {
    const resolvedJournalEntryId = (journalEntryId || '').trim();
    if (this.showDepositForm || this.showTransferForm || this.showCheckPreview || !resolvedJournalEntryId) {
      return;
    }

    this.lineSelectEvent.emit({
      journalEntryId: resolvedJournalEntryId,
      journalEntryLineId: (journalEntryLineId || '').trim()
    });
  }

  editJournalEntryLine(row: JournalEntryLineListDisplay | GeneralLedgerEntryDisplay): void {
    this.onLineSelect(row);
  }

  copyJournalEntry(row: JournalEntryLineListDisplay | GeneralLedgerEntryDisplay): void {
    const journalEntryId = (row?.journalEntryId || '').trim();
    if (!journalEntryId) {
      return;
    }

    if (!this.officeId) {
      this.officeValidationRequiredEvent.emit();
      return;
    }

    this.generalLedgerService.getJournalEntryById(journalEntryId).pipe(take(1)).subscribe({
      next: journalEntry => {
        if (!journalEntry?.journalEntryId) {
          this.toastr.error('Unable to copy journal entry.', 'Error');
          this.markViewForCheck();
          return;
        }

        this.createJournalEntryEvent.emit(journalEntry);
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to copy journal entry.', 'Error');
        this.markViewForCheck();
      }
    });
  }

  deleteJournalEntryLine(row: JournalEntryLineListDisplay | GeneralLedgerEntryDisplay): void {
    const journalEntryId = (row?.journalEntryId || '').trim();
    if (!journalEntryId) {
      return;
    }

    if (row.deleteDisabled) {
      return;
    }

    this.journalEntryService.confirmDeleteIfAllowed(row.postingStatusId, 'Journal Entry').pipe(
      take(1),
      switchMap(canProceed => {
        if (!canProceed) {
          return EMPTY;
        }

        return this.generalLedgerService.deleteJournalEntry(journalEntryId).pipe(take(1));
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Journal entry deleted successfully', CommonMessage.Success);
        this.journalEntryCreatedEvent.emit();
        this.loadJournalEntryLines();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        const message = this.utilityService.extractApiErrorMessage(error);
        this.toastr.error(message || 'Unable to delete journal entry.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  openBlankCreateJournalEntry(): void {
    this.createJournalEntryEvent.emit(null);
    this.markViewForCheck();
  }

  toggleManualOnly(): void {
    this.showManualOnly = !this.showManualOnly;
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  toggleIncludeCashOnly(): void {
    this.includeCashOnly = !this.includeCashOnly;
    this.loadJournalEntryLines();
  }

  toggleIncludeAll(): void {
    this.includeAll = !this.includeAll;
    this.loadJournalEntryLines();
    this.markViewForCheck();
  }

  resolveJournalEntryActionFlags(line: Pick<JournalEntryLineListDisplay, 'sourceTypeId' | 'journalEntryKindId' | 'postingStatusId' | 'isManual'>): {
    isManual: boolean;
    editDisabled: boolean;
    deleteDisabled: boolean;
  } {
    const isManual = isUserEditableJournalEntry(line.sourceTypeId, line.journalEntryKindId);
    return {
      isManual,
      editDisabled: !isManual,
      deleteDisabled: !this.journalEntryService.canDeleteJournalEntry(line.postingStatusId)
    };
  }

  createRetainedEarningsJournalEntryFor2024(): void {
    if (!this.officeId) {
      this.officeValidationRequiredEvent.emit();
      return;
    }

    if (this.isCreatingRetainedEarningsJournalEntry) {
      return;
    }

    this.isCreatingRetainedEarningsJournalEntry = true;
    this.generalLedgerService.previewRetainedEarningsJournalEntry(this.officeId, 2024).pipe(
      take(1),
      finalize(() => {
        this.isCreatingRetainedEarningsJournalEntry = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: journalEntry => {
        const preview = {
          ...journalEntry,
          officeId: Number(journalEntry?.officeId || this.officeId || 0),
          journalEntryId: '',
          journalEntryCode: ''
        };
        this.createJournalEntryEvent.emit(preview);
      },
      error: (error: HttpErrorResponse) => {
        const message = typeof error?.error === 'string'
          ? error.error
          : error?.error?.message || 'Unable to preview retained earnings journal entry.';
        this.toastr.error(message, 'Retained Earnings');
      }
    });
  }

  usesUntransferredOpenLinesFilter(): boolean {
    return this.untransferredFundsOnly || this.transferReportOnly;
  }

  usesFixedBankActivityFilter(): boolean {
    return this.undepositedFundsOnly || this.usesUntransferredOpenLinesFilter() || this.depositsOnly || this.printChecksOnly;
  }

  filterJournalEntryLinesByMode(
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
        && Number(line.credit || 0) > 0
        && !(line.checkNumber || '').trim());
    }
    if (this.depositsOnly) {
      const bankAccountIdSet = new Set(filteredAccountIds);
      resolvedLines = resolvedLines.filter(line =>
        Number(line.sourceTypeId) === SourceType.Deposit
        && bankAccountIdSet.has(line.chartOfAccountId)
        && Number(line.debit || 0) > 0);
    }
    if (this.undepositedFundsOnly) {
      const depositedLineIds = this.filterDepositedJournalEntryLineIds(deposits || []);
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

  applyLoadedJournalEntryLines(
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

    if (this.transferReportOnly) {
      this.loadTransferDepositAllocationsForPreview(loadId);
      return;
    }

    this.transferDepositAllocations = [];
    this.applyLinesDisplay();
    this.finishJournalEntryLinesLoad(loadId);
    this.markViewForCheck();
  }

  loadTransferDepositAllocationsForPreview(loadId: number): void {
    const officeId = this.officeId ?? this.allLines[0]?.officeId ?? 0;
    if (officeId <= 0 || this.allLines.length === 0) {
      this.transferDepositAllocations = [];
      this.applyLinesDisplay();
      this.finishJournalEntryLinesLoad(loadId);
      this.markViewForCheck();
      return;
    }

    const mappedLines = this.mappingService.mapJournalEntryLineListDisplay(
      this.allLines,
      this.chartOfAccounts,
      SourceTypeLabels
    );

    let items: TransferDepositAllocationItemRequest[];
    try {
      items = this.buildTransferDepositAllocationItems(mappedLines);
    } catch {
      this.transferDepositAllocations = [];
      this.applyLinesDisplay();
      this.finishJournalEntryLinesLoad(loadId);
      this.markViewForCheck();
      return;
    }

    if (items.length === 0) {
      this.transferDepositAllocations = [];
      this.applyLinesDisplay();
      this.finishJournalEntryLinesLoad(loadId);
      this.markViewForCheck();
      return;
    }

    this.transferService.resolveTransferDepositAllocations({ officeId, items }).pipe(
      take(1),
      takeUntil(merge(this.cancelJournalEntryLinesLoad$, this.destroy$)),
      finalize(() => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        this.finishJournalEntryLinesLoad(loadId);
      })
    ).subscribe({
      next: allocations => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        this.transferDepositAllocations = allocations || [];
        this.applyLinesDisplay();
        this.finishJournalEntryLinesLoad(loadId);
        this.markViewForCheck();
      },
      error: () => {
        if (this.journalEntryLinesLoadId !== loadId) {
          return;
        }

        this.transferDepositAllocations = [];
        this.applyLinesDisplay();
        this.finishJournalEntryLinesLoad(loadId);
        this.markViewForCheck();
      }
    });
  }

  applyLinesDisplay(): void {
    const mappedLines = this.mappingService.mapJournalEntryLineListDisplay(
      this.allLines,
      this.chartOfAccounts,
      SourceTypeLabels
    );

    if (this.transferReportOnly) {
      this.linesDisplay = this.buildTransferReportLinesDisplay(mappedLines);
      this.entriesDisplay = [];
      return;
    }

    this.linesDisplay = mappedLines.map(line => ({
      ...line,
      ...this.buildDocumentLinkInfoFields(line),
      selected: (this.showDepositTableSelections || this.showTransferTableSelections || this.showPrintCheckTableSelections)
        && this.selectedJournalEntryLineIds.has(line.journalEntryLineId),
      disabled: (this.showDepositTableSelections && this.getLineNetAmount(line) <= 0)
        || (this.showTransferTableSelections && !this.isUntransferredFundsLineSelectable(line))
        || (this.showPrintCheckTableSelections && !this.isPrintCheckLineSelectable(line))
    }));

    if (this.usesGroupedJournalEntryDisplay) {
      this.entriesDisplay = this.buildJournalEntryGroups(this.linesDisplay);
      if (this.showManualOnly) {
        this.entriesDisplay = this.entriesDisplay.filter(entry => entry.isManual);
      }
      if (this.showGroupedTableLineSelections) {
        this.syncGroupedLineSelectionInPlace(line => this.isSelectableActionLine(line));
      }
      this.updateIsAllExpanded();
      return;
    }

    this.entriesDisplay = [];
  }

  buildJournalEntryGroups(lines: JournalEntryLineListDisplay[]): GeneralLedgerEntryDisplay[] {
    const groupedLines = new Map<string, JournalEntryLineListDisplay[]>();
    for (const line of lines) {
      const journalEntryId = (line.journalEntryId || '').trim();
      if (!journalEntryId) {
        continue;
      }

      const existing = groupedLines.get(journalEntryId) ?? [];
      existing.push(line);
      groupedLines.set(journalEntryId, existing);
    }

    return Array.from(groupedLines.entries()).map(([journalEntryId, entryLines]) => {
      const firstLine = entryLines[0];
      const actionFlags = this.resolveJournalEntryActionFlags(firstLine);
      const totalDebit = entryLines.reduce((sum, line) => sum + Number(line.debitValue || 0), 0);
      const totalCredit = entryLines.reduce((sum, line) => sum + Number(line.creditValue || 0), 0);
      const lastLine = entryLines[entryLines.length - 1];

      return {
        journalEntryId,
        journalEntryLineId: firstLine.journalEntryLineId,
        transactionDate: firstLine.transactionDate,
        transactionDateSortKey: firstLine.transactionDateSortKey ?? '',
        journalEntryCreatedOnSortKey: firstLine.journalEntryCreatedOnSortKey ?? '',
        journalEntryCode: firstLine.journalEntryCode,
        source: firstLine.source,
        propertyCode: this.summarizeGroupedField(entryLines.map(line => line.propertyCode)),
        reservationCode: this.summarizeGroupedField(entryLines.map(line => line.reservationCode)),
        contactName: this.summarizeGroupedField(entryLines.map(line => line.contactName)),
        account: this.summarizeGroupedField(entryLines.map(line => (line.account || '').trim()).filter(account => account.length > 0)),
        description: (firstLine.journalEntryMemo || '').trim() || '—',
        debit: this.formatGroupedAmount(totalDebit),
        credit: this.formatGroupedAmount(totalCredit),
        balance: lastLine.balance,
        debitValue: totalDebit,
        creditValue: totalCredit,
        isManual: actionFlags.isManual,
        postingStatusId: firstLine.postingStatusId,
        editDisabled: actionFlags.editDisabled,
        deleteDisabled: actionFlags.deleteDisabled,
        infoTooltip: this.buildDocumentLinkInfoTooltip(firstLine),
        disabled: this.showGroupedTableLineSelections
          ? !this.hasSelectableGroupedEntryLines(entryLines)
          : this.showJournalEntryPostSelections
          ? !this.isPostJournalEntryLinesPostable(entryLines)
          : entryLines.every(line => line.disabled),
        selected: this.showGroupedTableLineSelections
          ? this.isGroupedEntrySelected(entryLines)
          : this.showJournalEntryPostSelections && this.selectedJournalEntryIds.has(journalEntryId),
        journalEntryLines: entryLines,
        expand: journalEntryId,
        expanded: this.expandedJournalEntries.has(journalEntryId),
        expandClick: (event: Event, item: GeneralLedgerEntryDisplay) => {
          event.stopPropagation();
          if (this.expandedJournalEntries.has(item.journalEntryId)) {
            this.expandedJournalEntries.delete(item.journalEntryId);
          } else {
            this.expandedJournalEntries.add(item.journalEntryId);
          }
          this.applyLinesDisplay();
        }
      };
    });
  }

  summarizeGroupedField(values: string[]): string {
    const uniqueValues = [...new Set(
      values
        .map(value => (value || '').trim())
        .filter(value => value.length > 0 && value !== '—')
    )];

    if (uniqueValues.length === 0) {
      return '—';
    }

    if (uniqueValues.length === 1) {
      return uniqueValues[0];
    }

    return 'Various';
  }

  formatGroupedAmount(amount: number): string {
    const normalized = this.roundCurrencyValue(Number(amount) || 0);
    if (Math.abs(normalized) < 0.005) {
      return '';
    }

    const formatted = this.formatter.currency(Math.abs(normalized));
    return normalized < 0 ? `-$${formatted}` : `$${formatted}`;
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      this.entriesDisplay.forEach(entry => this.expandedJournalEntries.add(entry.journalEntryId));
    } else {
      this.expandedJournalEntries.clear();
    }
    this.applyLinesDisplay();
  }

  updateIsAllExpanded(): void {
    if (!this.usesGroupedJournalEntryDisplay || this.entriesDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }

    this.isAllExpanded = this.entriesDisplay.every(entry => this.expandedJournalEntries.has(entry.journalEntryId));
  }

  getDetailLineColumnNames(): string[] {
    return Object.keys(this.activeDetailLineDisplayedColumns);
  }

  getDetailLineColumnWidth(columnName: string): string | null {
    if (this.isDetailLineGrowColumn(columnName)) {
      return null;
    }

    return this.activeDetailLineDisplayedColumns[columnName]?.maxWidth ?? null;
  }

  isDetailLineGrowColumn(columnName: string): boolean {
    return columnName === 'description';
  }

  getDetailLineColumnMinWidth(columnName: string): string | null {
    if (this.isDetailLineGrowColumn(columnName)) {
      return this.activeDetailLineDisplayedColumns[columnName]?.maxWidth ?? '38ch';
    }

    return this.getDetailLineColumnWidth(columnName);
  }

  get activeDetailLineDisplayedColumns(): ColumnSet {
    return this.detailLineDisplayedColumns;
  }

  getDetailLineColumnValue(line: JournalEntryLineListDisplay, columnName: string, lineIndex: number): string {
    switch (columnName) {
      case 'lineNo':
        return String(lineIndex + 1);
      case 'propertyCode':
        return line.propertyCode || '—';
      case 'reservationCode':
        return line.reservationCode || '—';
      case 'contactName':
        return line.contactName || '—';
      case 'account':
        return line.account || '—';
      case 'description':
        return line.description || '—';
      case 'debit':
        return line.debit || '';
      case 'credit':
        return line.credit || '';
      default:
        return '—';
    }
  }

  onDetailLineColumnSort(columnName: string): void {
    if (this.detailLineSortColumn === columnName) {
      this.detailLineSortDirection = this.detailLineSortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    this.detailLineSortColumn = columnName;
    this.detailLineSortDirection = 'asc';
  }

  getDetailLineSortIndicator(columnName: string): string {
    if (this.detailLineSortColumn !== columnName) {
      return '';
    }

    return this.detailLineSortDirection === 'asc' ? '▲' : '▼';
  }

  getSortedDetailLines(lines: JournalEntryLineListDisplay[]): JournalEntryLineListDisplay[] {
    if (!this.detailLineSortColumn || !lines?.length) {
      return lines ?? [];
    }

    const direction = this.detailLineSortDirection === 'asc' ? 1 : -1;
    const columnName = this.detailLineSortColumn;

    return [...lines].sort((left, right) => {
      if (columnName === 'lineNo') {
        return (lines.indexOf(left) - lines.indexOf(right)) * direction;
      }

      const leftValue = this.getDetailLineSortValue(left, columnName);
      const rightValue = this.getDetailLineSortValue(right, columnName);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }

  private getDetailLineSortValue(line: JournalEntryLineListDisplay, columnName: string): string | number {
    switch (columnName) {
      case 'lineNo':
        return 0;
      case 'propertyCode':
        return line.propertyCode || '';
      case 'reservationCode':
        return line.reservationCode || '';
      case 'contactName':
        return line.contactName || '';
      case 'account':
        return line.account || '';
      case 'description':
        return line.description || '';
      case 'debit':
        return line.debitValue ?? 0;
      case 'credit':
        return line.creditValue ?? 0;
      default:
        return '';
    }
  }

  isSelectableActionLine(line: JournalEntryLineListDisplay): boolean {
    if (this.showDepositTableSelections) {
      return this.getLineNetAmount(line) > 0;
    }

    if (this.showTransferTableSelections) {
      return this.isUntransferredFundsLineSelectable(line);
    }

    if (this.showPrintCheckTableSelections) {
      return this.isPrintCheckLineSelectable(line);
    }

    return false;
  }

  syncLineSelectionFromGroupedEntries(
    isLineSelectable: (line: JournalEntryLineListDisplay) => boolean
  ): void {
    const nextSelectedIds = new Set<string>();

    for (const entry of this.entriesDisplay) {
      if (!entry.selected) {
        continue;
      }

      const selectableLines = (entry.journalEntryLines || []).filter(isLineSelectable);
      if (selectableLines.length === 0) {
        entry.selected = false;
        continue;
      }

      for (const line of selectableLines) {
        nextSelectedIds.add(line.journalEntryLineId);
      }
    }

    this.selectedJournalEntryLineIds = nextSelectedIds;
    this.syncGroupedLineSelectionInPlace(isLineSelectable);
  }

  syncLineSelectionFromFlatLines(
    isLineSelectable: (line: JournalEntryLineListDisplay) => boolean
  ): void {
    const nextSelectedIds = new Set<string>();

    for (const line of this.linesDisplay) {
      if (!line.selected) {
        continue;
      }

      if (!isLineSelectable(line)) {
        line.selected = false;
        continue;
      }

      nextSelectedIds.add(line.journalEntryLineId);
    }

    this.selectedJournalEntryLineIds = nextSelectedIds;
    this.linesDisplay.forEach(line => {
      line.selected = this.selectedJournalEntryLineIds.has(line.journalEntryLineId);
    });
  }

  getSelectableGroupedEntryLines(lines: JournalEntryLineListDisplay[]): JournalEntryLineListDisplay[] {
    return lines.filter(line => this.isSelectableActionLine(line));
  }

  hasSelectableGroupedEntryLines(lines: JournalEntryLineListDisplay[]): boolean {
    return this.getSelectableGroupedEntryLines(lines).length > 0;
  }

  isGroupedEntrySelected(lines: JournalEntryLineListDisplay[]): boolean {
    const selectableLines = this.getSelectableGroupedEntryLines(lines);
    return selectableLines.length > 0
      && selectableLines.every(line => this.selectedJournalEntryLineIds.has(line.journalEntryLineId));
  }

  syncGroupedLineSelectionInPlace(isLineSelectable: (line: JournalEntryLineListDisplay) => boolean): void {
    this.entriesDisplay.forEach(entry => {
      const selectableLines = (entry.journalEntryLines || []).filter(isLineSelectable);
      entry.selected = selectableLines.length > 0
        && selectableLines.every(line => this.selectedJournalEntryLineIds.has(line.journalEntryLineId));
    });

    this.linesDisplay.forEach(line => {
      line.selected = this.selectedJournalEntryLineIds.has(line.journalEntryLineId);
    });
  }

  getLineNetAmount(line: Pick<JournalEntryLineListDisplay, 'debitValue' | 'creditValue'>): number {
    return this.roundCurrencyValue(Number(line.debitValue || 0) - Number(line.creditValue || 0));
  }

  getLineNetAmountFromSearchLine(line: Pick<JournalEntryLineSearchResponse, 'debit' | 'credit'>): number {
    return this.roundCurrencyValue(Number(line.debit || 0) - Number(line.credit || 0));
  }

  compareJournalEntryLinesByTransaction(
    left: JournalEntryLineSearchResponse,
    right: JournalEntryLineSearchResponse
  ): number {
    return this.mappingService.compareJournalEntryLinesForListDisplay(left, right, false);
  }

  normalizeLineContextId(value?: string | null): string {
    return String(value ?? '').trim().toLowerCase();
  }

  normalizeJournalEntryLineId(lineId?: string | null): string {
    return String(lineId || '').trim().toLowerCase();
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

  getChartOfAccountsForOfficeIds(officeIds: number[]): ChartOfAccountResponse[] {
    if (officeIds.length === 1) {
      return this.chartOfAccounts.filter(account => account.officeId === officeIds[0]);
    }

    const allAccounts = this.chartOfAccounts;
    return allAccounts.filter(account => officeIds.includes(account.officeId));
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }
  //#endregion

  //#region Undeposited Funds Methods
  filterUndepositedFundsOpenLines(lines: JournalEntryLineSearchResponse[], depositedLineIds: Set<string> = new Set()): JournalEntryLineSearchResponse[] {
    const openDebits = lines
      .filter(line => this.getLineNetAmountFromSearchLine(line) > 0)
      .sort((left, right) => this.compareJournalEntryLinesByTransaction(left, right));
    const credits = lines
      .filter(line => this.getLineNetAmountFromSearchLine(line) < 0)
      .filter(line => Number(line.sourceTypeId) === SourceType.Deposit)
      .sort((left, right) => this.compareJournalEntryLinesByTransaction(left, right));

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

  filterDepositedJournalEntryLineIds(deposits: DepositResponse[]): Set<string> {
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

  undepositedFundsLinesBalance(
    debitLine: JournalEntryLineSearchResponse,
    creditLine: JournalEntryLineSearchResponse
  ): boolean {
    const debitAmount = this.getLineNetAmountFromSearchLine(debitLine);
    const creditAmount = Math.abs(this.getLineNetAmountFromSearchLine(creditLine));
    if (Math.abs(debitAmount - creditAmount) > 0.005) {
      return false;
    }

    if (!this.undepositedFundsLinesShareProperty(debitLine, creditLine)) {
      return false;
    }

    const debitDescription = this.normalizeUndepositedFundsDescription(debitLine);
    const creditDescription = this.normalizeUndepositedFundsDescription(creditLine);
    if (debitDescription && creditDescription && debitDescription !== creditDescription) {
      return false;
    }

    const debitReservationId = this.normalizeLineContextId(debitLine.reservationId);
    const creditReservationId = this.normalizeLineContextId(creditLine.reservationId);
    if (debitReservationId && creditReservationId && debitReservationId !== creditReservationId) {
      return false;
    }

    return true;
  }

  undepositedFundsLinesShareProperty(
    debitLine: JournalEntryLineSearchResponse,
    creditLine: JournalEntryLineSearchResponse
  ): boolean {
    const debitPropertyId = this.normalizeLineContextId(debitLine.propertyId);
    const creditPropertyId = this.normalizeLineContextId(creditLine.propertyId);
    if (debitPropertyId && creditPropertyId) {
      return debitPropertyId === creditPropertyId;
    }

    const debitPropertyCode = this.normalizeLineContextId(debitLine.propertyCode);
    const creditPropertyCode = this.normalizeLineContextId(creditLine.propertyCode);
    if (debitPropertyCode && creditPropertyCode) {
      return debitPropertyCode === creditPropertyCode;
    }

    return !debitPropertyId && !creditPropertyId && !debitPropertyCode && !creditPropertyCode;
  }

  normalizeUndepositedFundsDescription(line: JournalEntryLineSearchResponse): string {
    return String(line.memo || line.journalEntryMemo || '').trim().toLowerCase();
  }

  resolveUndepositedFundsAccountIds(officeIds: number[]): number[] {
    return this.getChartOfAccountsForOfficeIds(officeIds)
      .filter(account =>
        Number(account.accountTypeId) === AccountType.OtherCurrentAsset
        && this.isUndepositedFundsAccount(account))
      .map(account => Number(account.accountId));
  }

  isUndepositedFundsAccount(account: ChartOfAccountResponse): boolean {
    const name = (account.name || '').toLowerCase();
    const accountNo = (account.accountNo || '').toLowerCase();
    return name.includes('undeposited') || accountNo.includes('undeposited');
  }
  //#endregion

  //#region Deposit Dialog Methods
  onDepositLineSelectionSet(): void {
    if (!this.showDepositTableSelections) {
      return;
    }

    this.syncLineSelectionFromGroupedEntries(line => this.getLineNetAmount(line) > 0);

    if (this.isDepositSelectionMode) {
      this.syncDepositAmountFromLineSelection();
    }

    this.markViewForCheck();
  }

  openMakeDepositDialog(): void {
    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    this.depositOfficeId = this.officeId;
    this.depositDate = this.depositDate ?? new Date();
    this.refreshDepositBankChartOfAccounts();
    this.showDepositForm = true;
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  cancelDepositForm(): void {
    this.showDepositForm = false;
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
        const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(error);
        if (closedPeriodMessage) {
          this.toastr.error(closedPeriodMessage, CommonMessage.Error);
          return;
        }
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.toastr.error(apiMessage || 'Unable to create deposit.', CommonMessage.Error);
      }
    });
  }

  formatDepositAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  onDepositAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.-]/g, '');
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

  clearDepositLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
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

    const escrowDepositAccountId = this.getUntransferredFundsEscrowAccountId(officeId);
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
  //#endregion

  //#region Untransferred Funds Methods
  resolveUntransferredFundsAccountIds(officeIds: number[]): number[] {
    const accounts = this.getChartOfAccountsForOfficeIds(officeIds);
    const accountIds = new Set<number>();

    for (const officeId of officeIds) {
      const configuredAccountId = this.getUntransferredFundsEscrowAccountId(officeId);
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

  getUntransferredFundsEscrowAccountId(officeId: number): number | null {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    const accountId = Number(accountingOffice?.defaultEscrowDepositAccountId ?? 0);
    return accountId > 0 ? accountId : null;
  }

  filterUntransferredFundsOpenLines(
    lines: JournalEntryLineSearchResponse[],
    transfers: TransferResponse[] = [],
    deposits: DepositResponse[] = [],
    escrowDepositAccountIds: number[] = []
  ): JournalEntryLineSearchResponse[] {
    const openLines = lines
      .filter(line => Math.abs(this.getLineNetAmountFromSearchLine(line)) > 0.005)
      .sort((left, right) => this.compareJournalEntryLinesByTransaction(left, right));

    const transferredLineIds = this.filterTransferredJournalEntryLineIds(transfers);
    const transferSettledLineIds = this.buildTransferSettledLineIds(
      transfers,
      deposits,
      openLines,
      escrowDepositAccountIds
    );

    return openLines.filter(line =>
      !transferredLineIds.has(line.journalEntryLineId)
      && !transferSettledLineIds.has(line.journalEntryLineId)
    );
  }

  filterTransferredJournalEntryLineIds(transfers: TransferResponse[]): Set<string> {
    const transferredLineIds = new Set<string>();

    for (const transfer of transfers || []) {
      if (transfer.isActive === false) {
        continue;
      }

      for (const split of transfer.splits || []) {
        const journalEntryLineId = String(split.journalEntryLineId || '').trim();
        if (journalEntryLineId) {
          transferredLineIds.add(journalEntryLineId);
        }
      }
    }

    return transferredLineIds;
  }

  enrichUntransferredFundsLinesFromDeposits(lines: JournalEntryLineSearchResponse[], deposits: DepositResponse[]): JournalEntryLineSearchResponse[] {
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

  buildTransferSettledLineIds(
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

  buildLinkedLineIdsForOpenLine(
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

  transferOverlapsDeposit(transfer: TransferResponse, deposit: DepositResponse): boolean {
    const transferPropertyIds = new Set(
      (transfer.splits || [])
        .map(split => this.normalizeLineContextId(split.propertyId))
        .filter(propertyId => propertyId.length > 0)
    );
    const depositPropertyIds = new Set(
      (deposit.splits || [])
        .map(split => this.normalizeLineContextId(split.propertyId))
        .filter(propertyId => propertyId.length > 0)
    );

    if (transferPropertyIds.size === 0 || depositPropertyIds.size === 0) {
      return false;
    }

    return [...transferPropertyIds].some(propertyId => depositPropertyIds.has(propertyId));
  }
  //#endregion

  //#region Transfer Dialog Methods
  isUntransferredFundsLineSelectable(line: Pick<JournalEntryLineListDisplay, 'debitValue' | 'creditValue'>): boolean {
    return Math.abs(this.getLineNetAmount(line)) > 0.005;
  }

  clearUntransferredFundsLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
  }

  openMakeTransferDialog(): void {
    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return;
    }

    this.transferOfficeId = this.officeId;
    this.transferDate = this.transferDate ?? new Date();
    this.showTransferForm = true;
    this.applyLinesDisplay();
    this.markViewForCheck();
  }

  cancelTransferForm(): void {
    this.showTransferForm = false;
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

    this.isSubmittingTransfer = true;
    this.transferService.resolveTransferDepositAllocations({
      officeId,
      items: this.buildTransferDepositAllocationItems(selectedLines)
    }).pipe(
      switchMap(allocations => {
        const splits = this.buildTransferSplitsFromDepositAllocations(
          selectedLines,
          allocations || [],
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

        const payload: TransferRequest = {
          organizationId: this.organizationId,
          officeId,
          transferDate,
          accountingPeriod: transferDate,
          amount: splitTotal,
          description: 'Transfer to Escrow Accounts',
          bankAccountId: escrowDepositAccountId,
          propertyId: splits.find(split => (split.propertyId || '').trim().length > 0)?.propertyId ?? null,
          splits,
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
        const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(error);
        if (closedPeriodMessage) {
          this.toastr.error(closedPeriodMessage, CommonMessage.Error);
          return;
        }
        const apiMessage = error instanceof HttpErrorResponse
          ? (typeof error.error === 'string'
            ? error.error
            : error.error?.title || error.error?.message || error.message)
          : error.message;
        this.toastr.error(apiMessage || 'Unable to create transfer.', CommonMessage.Error);
      }
    });
  }

  onTransferLineSelectionSet(): void {
    if (!this.showTransferTableSelections) {
      return;
    }

    this.syncLineSelectionFromGroupedEntries(line => this.isUntransferredFundsLineSelectable(line));

    if (this.isTransferSelectionMode) {
      this.syncTransferAmountFromLineSelection();
    }

    this.markViewForCheck();
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

  clearTransferLineSelection(): void {
    this.selectedJournalEntryLineIds.clear();
  }

  clearTransferForm(): void {
    this.transferDate = new Date();
    this.transferAmount = 0;
    this.transferAmountDisplay = this.formatTransferAmountDisplay(0);
    this.transferOfficeId = null;
    this.clearTransferLineSelection();
  }

  formatTransferAmountDisplay(amount: number): string {
    return this.formatDepositAmountDisplay(amount);
  }

  onTransferAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.-]/g, '');
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

  buildTransferSplitsFromDepositAllocations(selectedLines: JournalEntryLineListDisplay[], allocations: TransferDepositAllocationResponse[], officeId: number): TransferSplit[] {
    const accountIds = this.resolveTransferAllocationAccountIds(officeId);
    const allocationByKey = new Map(
      (allocations || []).map(item => [this.buildTransferAllocationMatchKey(item.depositId, item.escrowAmount, item.journalEntryLineId), item] as const)
    );
    const splits: TransferSplit[] = [];
    const processedKeys = new Set<string>();

    for (const workItem of this.buildTransferAllocationWorkItems(selectedLines)) {
      const depositId = this.resolveDepositIdFromLine(workItem.contextLine);
      if (!depositId) {
        throw new Error('Each selected line must belong to a journal entry linked to a deposit.');
      }

      const resolvedAllocations = this.resolveTransferDepositAllocationsForWorkItem(
        workItem,
        depositId,
        allocationByKey,
        allocations || []
      );
      if (resolvedAllocations.length === 0) {
        throw new Error('Unable to resolve deposit allocation for the selected line.');
      }

      for (const resolved of resolvedAllocations) {
        const matchKey = this.buildTransferAllocationMatchKey(
          depositId,
          resolved.escrowAmount,
          resolved.allocation.journalEntryLineId
        );
        const contextKey = `${String(workItem.contextLine.journalEntryLineId || '').trim()}|${matchKey}`;
        if (!matchKey || processedKeys.has(contextKey)) {
          continue;
        }
        processedKeys.add(contextKey);

        splits.push(...this.buildTransferSplitsFromAllocation(
          resolved.allocation,
          resolved.escrowAmount,
          workItem.contextLine,
          accountIds,
          resolved.depositSplit
        ));
      }
    }

    return splits;
  }

  resolveTransferDepositAllocationsForWorkItem(
    workItem: {
      contextLine: JournalEntryLineListDisplay;
      allocationJournalEntryLineId: string;
      escrowAmount: number;
      depositSplit?: DepositSplit;
    },
    depositId: string,
    allocationByKey: Map<string, TransferDepositAllocationResponse>,
    allocations: TransferDepositAllocationResponse[]
  ): Array<{ allocation: TransferDepositAllocationResponse; depositSplit?: DepositSplit; escrowAmount: number }> {
    const matchKey = this.buildTransferAllocationMatchKey(
      depositId,
      workItem.escrowAmount,
      workItem.allocationJournalEntryLineId
    );
    const directMatch = allocationByKey.get(matchKey);
    if (directMatch) {
      return [{
        allocation: directMatch,
        depositSplit: workItem.depositSplit,
        escrowAmount: workItem.escrowAmount
      }];
    }

    const depositAllocations = allocations.filter(item =>
      String(item.depositId || '').trim().toLowerCase() === depositId.toLowerCase()
    );
    if (depositAllocations.length <= 1) {
      return directMatch
        ? [{ allocation: directMatch, depositSplit: workItem.depositSplit, escrowAmount: workItem.escrowAmount }]
        : [];
    }

    const workAmount = this.roundCurrencyValue(workItem.escrowAmount);
    const allocationTotal = this.roundCurrencyValue(
      depositAllocations.reduce((sum, item) => sum + Number(item.escrowAmount || 0), 0)
    );
    if (Math.abs(workAmount - allocationTotal) > 0.005) {
      return [];
    }

    const deposit = this.loadedDeposits.find(item =>
      String(item.depositId || '').trim().toLowerCase() === depositId.toLowerCase()
    );

    return depositAllocations.map(allocation => {
      const escrowAmount = this.roundCurrencyValue(Number(allocation.escrowAmount || 0));
      const depositSplit = (deposit?.splits || []).find(split =>
        Math.abs(this.roundCurrencyValue(Number(split.amount || 0)) - escrowAmount) <= 0.005
        || String(split.journalEntryLineId || '').trim() === String(allocation.journalEntryLineId || '').trim()
      );

      return {
        allocation,
        depositSplit,
        escrowAmount
      };
    });
  }

  buildTransferAllocationMatchKey(depositId: string, escrowAmount: number, journalEntryLineId?: string | null): string {
    const normalizedDepositId = String(depositId || '').trim().toLowerCase();
    const normalizedLineId = String(journalEntryLineId || '').trim().toLowerCase();
    const normalizedAmount = this.roundCurrencyValue(Number(escrowAmount || 0));
    return normalizedLineId
      ? `${normalizedDepositId}|${normalizedAmount}|${normalizedLineId}`
      : `${normalizedDepositId}|${normalizedAmount}`;
  }

  buildTransferDepositAllocationItems(selectedLines: JournalEntryLineListDisplay[]): TransferDepositAllocationItemRequest[] {
    return this.buildTransferAllocationWorkItems(selectedLines)
      .map(workItem => {
        const depositId = this.resolveDepositIdFromLine(workItem.contextLine);
        if (!depositId) {
          throw new Error('Each selected line must belong to a journal entry linked to a deposit.');
        }

        const escrowAmount = this.roundCurrencyValue(workItem.escrowAmount);
        if (escrowAmount === 0) {
          return null;
        }

        const allocationJournalEntryLineId = String(workItem.allocationJournalEntryLineId || '').trim();

        return {
          depositId,
          journalEntryLineId: allocationJournalEntryLineId || null,
          escrowAmount
        };
      })
      .filter((item): item is TransferDepositAllocationItemRequest => item != null);
  }

  buildTransferAllocationWorkItems(selectedLines: JournalEntryLineListDisplay[]): Array<{
    contextLine: JournalEntryLineListDisplay;
    allocationJournalEntryLineId: string;
    escrowAmount: number;
    depositSplit?: DepositSplit;
  }> {
    const workItems: Array<{
      contextLine: JournalEntryLineListDisplay;
      allocationJournalEntryLineId: string;
      escrowAmount: number;
      depositSplit?: DepositSplit;
    }> = [];

    for (const line of selectedLines) {
      const depositId = this.resolveDepositIdFromLine(line);
      const deposit = depositId
        ? this.loadedDeposits.find(item => String(item.depositId || '').trim().toLowerCase() === depositId.toLowerCase())
        : undefined;
      const paymentSplits = (deposit?.splits || []).filter(split =>
        Math.abs(this.roundCurrencyValue(Number(split.amount || 0))) > 0.005);

      const lineAmount = this.roundCurrencyValue(this.getLineNetAmount(line));
      const depositAmount = deposit ? this.roundCurrencyValue(Number(deposit.amount || 0)) : 0;
      const shouldExpandToPaymentSplits = paymentSplits.length > 1 && (
        Number(line.sourceTypeId) === SourceType.Deposit
        || (depositAmount > 0 && Math.abs(lineAmount - depositAmount) <= 0.005)
      );

      if (shouldExpandToPaymentSplits) {
        for (const split of paymentSplits) {
          const escrowAmount = this.roundCurrencyValue(Number(split.amount || 0));
          if (escrowAmount === 0) {
            continue;
          }

          workItems.push({
            contextLine: line,
            allocationJournalEntryLineId: String(split.journalEntryLineId || '').trim(),
            escrowAmount,
            depositSplit: split
          });
        }
        continue;
      }

      const allocationJournalEntryLineId = String(line.journalEntryLineId || '').trim();
      const escrowAmount = this.roundCurrencyValue(this.getLineNetAmount(line));
      if (!allocationJournalEntryLineId || escrowAmount === 0) {
        continue;
      }

      const matchingSplit = paymentSplits.find(split =>
        Math.abs(this.roundCurrencyValue(Number(split.amount || 0)) - escrowAmount) <= 0.005
        || String(split.journalEntryLineId || '').trim() === allocationJournalEntryLineId);

      workItems.push({
        contextLine: line,
        allocationJournalEntryLineId: String(matchingSplit?.journalEntryLineId || allocationJournalEntryLineId).trim(),
        escrowAmount: matchingSplit ? this.roundCurrencyValue(Number(matchingSplit.amount || 0)) : escrowAmount,
        depositSplit: matchingSplit
      });
    }

    return workItems;
  }

  extractTransferSourceLabel(description?: string | null): string {
    const normalized = String(description || '').trim();
    if (!normalized) {
      return '';
    }

    const colonIndex = normalized.indexOf(':');
    return colonIndex > 0 ? normalized.slice(0, colonIndex).trim() : normalized;
  }

  resolveDepositIdFromLine(line: JournalEntryLineListDisplay): string {
    const fromLine = String(line.depositId || '').trim();
    if (fromLine) {
      return fromLine;
    }

    if (Number(line.sourceTypeId) === SourceType.Deposit) {
      const fromSource = String(line.sourceId || '').trim();
      if (fromSource) {
        return fromSource;
      }
    }

    const lineId = String(line.journalEntryLineId || '').trim();
    const sourceLine = lineId
      ? this.allLines.find(item => String(item.journalEntryLineId || '').trim() === lineId)
      : undefined;

    if (Number(sourceLine?.sourceTypeId) === SourceType.Deposit) {
      const fromSearchSource = String(sourceLine?.sourceId || '').trim();
      if (fromSearchSource) {
        return fromSearchSource;
      }
    }

    return String(sourceLine?.depositId || '').trim();
  }

  buildTransferSplitsFromAllocation(allocation: TransferDepositAllocationResponse, baseAmount: number, contextLine: JournalEntryLineListDisplay, accountIds: { owners: number | null; secDep: number | null; sdw: number | null; bank: number | null }, depositSplit?: DepositSplit): TransferSplit[] {
    const ownerEscrow = this.roundCurrencyValue(Number(allocation.ownerEscrow || 0));
    const secDep = this.roundCurrencyValue(Number(allocation.secDep || 0));
    const sdw = this.roundCurrencyValue(Number(allocation.sdw || 0));
    const business = this.roundCurrencyValue(Number(allocation.business || 0));

    const propertyId = (depositSplit?.propertyId || allocation.propertyId || contextLine.propertyId || '').trim() || null;
    const reservationId = (depositSplit?.reservationId || allocation.reservationId || contextLine.reservationId || '').trim() || null;
    const contactId = (depositSplit?.contactId || allocation.contactId || contextLine.contactId || '').trim() || null;
    const journalEntryLineId = (contextLine.journalEntryLineId || '').trim() || null;
    const source = (allocation.description || this.extractTransferSourceLabel(depositSplit?.description) || contextLine.source || contextLine.description || '').trim();
    const description = source ? `Transfer to Escrow Accounts - ${source}` : 'Transfer to Escrow Accounts';

    const allocations: Array<{ amount: number; accountId: number | null }> = [
      { amount: ownerEscrow, accountId: accountIds.owners },
      { amount: secDep, accountId: accountIds.secDep },
      { amount: sdw, accountId: accountIds.sdw },
      { amount: business, accountId: accountIds.bank }
    ];

    const splits: TransferSplit[] = [];
    for (const item of allocations) {
      const amount = this.roundCurrencyValue(item.amount);
      if (amount === 0 || !item.accountId) {
        continue;
      }

      splits.push({
        amount,
        description,
        propertyId,
        reservationId,
        contactId,
        journalEntryLineId,
        chartOfAccountId: item.accountId
      });
    }

    return splits;
  }

  buildTransferReportLinesDisplay(
    escrowLines: JournalEntryLineListDisplay[]
  ): JournalEntryLineListDisplay[] {
    const expanded: JournalEntryLineListDisplay[] = [];
    const officeId = this.officeId ?? escrowLines[0]?.officeId ?? 0;
    const accountIds = officeId > 0 ? this.resolveTransferAllocationAccountIds(officeId) : null;

    for (const line of escrowLines) {
      expanded.push(line);

      if (!accountIds || !this.transferDepositAllocations.length) {
        continue;
      }

      let projectedSplits: TransferSplit[];
      try {
        projectedSplits = this.buildTransferSplitsFromDepositAllocations(
          [line],
          this.transferDepositAllocations,
          officeId
        );
      } catch {
        continue;
      }

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

  buildProjectedTransferLine(
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
      description: (split.description || '').trim() || 'Transfer to Escrow Accounts',
      journalEntryMemo: contextLine.journalEntryMemo,
      debit: this.formatter.currencyUsd(amount),
      credit: '',
      balance: '',
      debitValue: amount,
      creditValue: 0,
      balanceValue: 0,
      postingStatusId: PostingStatus.Open,
      sortDateValue: contextLine.sortDateValue,
      disabled: true,
      infoHidden: true
    };
  }

  buildDocumentLinkInfoTooltip(line: Pick<JournalEntryLineListDisplay, 'paymentCode' | 'depositCode' | 'transferCode'>): string {
    const payment = (line.paymentCode || '').trim() || '—';
    const deposit = (line.depositCode || '').trim() || '—';
    const transfer = (line.transferCode || '').trim() || '—';
    return `Payment: ${payment}\nDeposit: ${deposit}\nTransfer: ${transfer}`;
  }

  buildDocumentLinkInfoFields(line: Pick<JournalEntryLineListDisplay, 'paymentCode' | 'depositCode' | 'transferCode' | 'journalEntryLineId'>): Pick<JournalEntryLineListDisplay, 'infoTooltip' | 'infoHidden'> {
    const lineId = (line.journalEntryLineId || '').trim();
    if (lineId.startsWith('transfer-report-projected-')) {
      return { infoTooltip: '', infoHidden: true };
    }

    return {
      infoTooltip: this.buildDocumentLinkInfoTooltip(line),
      infoHidden: false
    };
  }

  validateBuiltTransferSplits(
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

  goToProperty(row: JournalEntryLineListDisplay): void {
    const propertyId = (row?.propertyId || '').trim();
    if (!propertyId) {
      return;
    }

    void this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Property, [propertyId])}`);
  }

  goToReservation(row: JournalEntryLineListDisplay): void {
    const reservationId = (row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    void this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}`);
  }

  onTransferReportSourceClick(row: JournalEntryLineListDisplay): void {
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

  resolveTransferSourceEscrowDepositAccountId(
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

    return this.getUntransferredFundsEscrowAccountId(officeId)
      ?? (accountIds.size > 0 ? [...accountIds][0] : null);
  }

  resolveTransferAllocationAccountIds(officeId: number): { owners: number | null; secDep: number | null; sdw: number | null; bank: number | null; } {
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
  //#endregion

  //#region Check Form Methods
  onPrintCheckLineSelectionSet(): void {
    if (!this.showPrintCheckTableSelections) {
      return;
    }

    const previousSelectedIds = new Set(this.selectedJournalEntryLineIds);
    this.syncLineSelectionFromFlatLines(line => this.isPrintCheckLineSelectable(line));
    const rejectedDifferentVendor = this.rejectPrintCheckRowsWithDifferentVendor(previousSelectedIds);

    if (rejectedDifferentVendor) {
      this.toastr.warning('A single check can only be sent to one vendor at a time.');
    }

    this.syncPrintCheckLineSelectionInPlace();
    this.markViewForCheck();
  }

  viewSelectedChecks(): void {
    this.previewSelectedChecks(this.resolveSelectedCheckLines(), null);
  }

  printSelectedChecks(): void {
    const selectedLines = this.resolveSelectedCheckLines();
    if (!selectedLines) {
      return;
    }

    const accountingOffice = this.accountingOffices.find(office => office.officeId === this.officeId) ?? null;
    const startingCheckNumber = accountingOffice?.currentCheckNumber ?? 1;
    const dialogRef = this.dialog.open<ConfirmCheckNumberDialogComponent, ConfirmCheckNumberDialogData, ConfirmCheckNumberDialogResult | undefined>(
      ConfirmCheckNumberDialogComponent,
      {
        width: '28rem',
        panelClass: 'accounting-form-dialog-panel',
        data: {
          startingCheckNumber,
          checkCount: selectedLines.length
        }
      }
    );

    dialogRef.afterClosed().pipe(take(1), takeUntil(this.destroy$)).subscribe(result => {
      if (!result) {
        return;
      }

      const journalEntryIds = [...new Set(selectedLines.map(line => line.journalEntryId))];
      this.isLoadingCheckPreview = true;
      this.checkPrintApiService.assignCheckNumbers({
        officeId: this.officeId!,
        startingCheckNumber: result.startingCheckNumber,
        journalEntryIds
      }).pipe(
        switchMap(assignResult => {
          const checkNumberByJournalEntryId = new Map(
            assignResult.assignments.map(assignment => [assignment.journalEntryId, assignment.checkNumber])
          );
          const office = this.accountingOffices.find(item => item.officeId === this.officeId);
          if (office) {
            office.currentCheckNumber = assignResult.nextCheckNumber;
          }

          return forkJoin({
            template: this.checkHtmlService.getCheckHtmlByScope(this.officeId),
            accountingOffice: this.accountingOfficeService.getAccountingOfficeById(this.officeId!).pipe(catchError(() => of(null))),
            checkNumberByJournalEntryId: of(checkNumberByJournalEntryId)
          });
        }),
        finalize(() => {
          this.isLoadingCheckPreview = false;
          this.markViewForCheck();
        }),
        takeUntil(this.destroy$)
      ).subscribe({
        next: ({ template, accountingOffice, checkNumberByJournalEntryId }) => {
          const linesWithNumbers = this.applyCheckNumbersToLines(selectedLines, checkNumberByJournalEntryId, result.startingCheckNumber);
          this.renderCheckPreview(template, accountingOffice, linesWithNumbers, true, null);
          this.clearPrintCheckLineSelection();
          this.loadJournalEntryLines();
        },
        error: () => {
          this.toastr.error('Unable to assign check numbers.', CommonMessage.Error);
        }
      });
    });
  }

resolveSelectedCheckLines(): JournalEntryLineListDisplay[] | null {
    if (!this.isPrintChecksFormValid) {
      this.toastr.warning('Select one or more checks to view.');
      return null;
    }

    if (!this.officeId) {
      this.toastr.warning('Please select an office first');
      return null;
    }

    const selectedLines = this.linesDisplay.filter(line =>
      this.selectedJournalEntryLineIds.has(line.journalEntryLineId)
    );
    if (selectedLines.length === 0) {
      this.toastr.warning('Select one or more checks to view.');
      return null;
    }

    return selectedLines;
  }

applyCheckNumbersToLines(
    selectedLines: JournalEntryLineListDisplay[],
    checkNumberByJournalEntryId: Map<string, string> | null,
    startingCheckNumber: number
  ): JournalEntryLineListDisplay[] {
    let nextNumber = startingCheckNumber;
    const assignedByJournalEntryId = new Map<string, string>();

    return selectedLines.map(line => {
      let checkNumber = checkNumberByJournalEntryId?.get(line.journalEntryId) || assignedByJournalEntryId.get(line.journalEntryId);
      if (!checkNumber) {
        checkNumber = String(nextNumber);
        assignedByJournalEntryId.set(line.journalEntryId, checkNumber);
        nextNumber += 1;
      }

      return {
        ...line,
        checkNumber
      };
    });
  }

previewSelectedChecks(
    selectedLines: JournalEntryLineListDisplay[] | null,
    startingCheckNumber: number | null
  ): void {
    if (!selectedLines) {
      return;
    }

    const draftStartingNumber = startingCheckNumber
      ?? this.accountingOffices.find(office => office.officeId === this.officeId)?.currentCheckNumber
      ?? 1;

    this.isLoadingCheckPreview = true;
    forkJoin({
      template: this.checkHtmlService.getCheckHtmlByScope(this.officeId),
      checkHtml: this.checkHtmlService.getCheckHtmlResponseByScope(this.officeId).pipe(catchError(() => of(null))),
      accountingOffice: this.accountingOfficeService.getAccountingOfficeById(this.officeId!).pipe(catchError(() => of(null)))
    }).pipe(
      switchMap(({ template, checkHtml, accountingOffice }) => {
        const officeOwnedStock = checkHtml && Number(checkHtml.officeId) === Number(this.officeId)
          ? checkHtml.checkStockFileDetails
          : null;
        const pdfDataUrl = this.resolveCheckStockPdfDataUrl(officeOwnedStock);
        if (!pdfDataUrl) {
          return of({ template, accountingOffice, stockImageUrl: null as string | null });
        }

        return from(this.pdfThumbnailService.getFirstPageDataUrl(pdfDataUrl, 2550, 3)).pipe(
          map(stockImageUrl => ({ template, accountingOffice, stockImageUrl })),
          catchError(() => of({ template, accountingOffice, stockImageUrl: null as string | null }))
        );
      }),
      finalize(() => {
        this.isLoadingCheckPreview = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe(({ template, accountingOffice, stockImageUrl }) => {
      const linesWithNumbers = this.applyCheckNumbersToLines(selectedLines, null, draftStartingNumber);
      this.renderCheckPreview(template, accountingOffice, linesWithNumbers, false, stockImageUrl);
    });
  }

resolveCheckStockPdfDataUrl(fileDetails: { file?: string; dataUrl?: string; contentType?: string } | null | undefined): string | null {
    if (!fileDetails?.file && !fileDetails?.dataUrl) {
      return null;
    }

    if (fileDetails.dataUrl?.trim()) {
      return fileDetails.dataUrl;
    }

    if (!fileDetails.file) {
      return null;
    }

    if (fileDetails.file.startsWith('data:')) {
      return fileDetails.file;
    }

    return `data:${fileDetails.contentType || 'application/pdf'};base64,${fileDetails.file}`;
  }

renderCheckPreview(
    template: string,
    accountingOffice: AccountingOfficeResponse | null,
    linesWithNumbers: JournalEntryLineListDisplay[],
    printAfterPreview: boolean,
    stockImageUrl: string | null
  ): void {
    if (!template) {
      this.toastr.error('Check HTML template was not found.', CommonMessage.Error);
      return;
    }

    let mergedHtml = this.checkPrintService.buildMergedChecksHtml(template, linesWithNumbers, accountingOffice);
    if (stockImageUrl && !printAfterPreview) {
      mergedHtml = this.checkPrintService.applyCheckStockBackground(mergedHtml, stockImageUrl);
    }

    const processed = this.documentHtmlService.processHtml(mergedHtml, true);
    const bodyContent = this.documentHtmlService.extractBodyContent(processed.processedHtml);
    const styles = processed.extractedStyles;
    const srcdoc = styles.trim()
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style data-dynamic-styles="true">${styles}</style></head><body>${bodyContent}</body></html>`
      : mergedHtml;

    this.safeCheckPreviewHtml = this.sanitizer.bypassSecurityTrustHtml(srcdoc);
    this.checkPreviewTitle = linesWithNumbers.length === 1
      ? `Check ${(linesWithNumbers[0].checkNumber || '').trim()}`.trim()
      : `${linesWithNumbers.length} Checks`;
    this.checkPreviewIframeKey++;
    this.showCheckPreview = true;
    this.markViewForCheck();

    if (printAfterPreview) {
      setTimeout(() => this.triggerCheckPrint(), 250);
    }
  }

triggerCheckPrint(): void {
    const iframe = this.checkPreviewIframe?.nativeElement;
    const printWindow = iframe?.contentWindow;
    if (!printWindow) {
      this.toastr.warning('Check preview is not ready to print yet.');
      return;
    }

    printWindow.focus();
    printWindow.print();
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
  //#endregion

  //#region Get Methods
  get showJournalEntryPostSelections(): boolean {
    return this.showGeneralLedgerRowActions && this.usesGroupedJournalEntryDisplay;
  }

  get showDepositTableSelections(): boolean {
    return this.undepositedFundsOnly;
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
      && (this.depositDescription || '').trim().length > 0
      && this.selectedJournalEntryLineIds.size > 0;
  }

  get showTransferTableSelections(): boolean {
    return this.untransferredFundsOnly;
  }

  get resolvedTransferOfficeId(): number | null {
    return this.transferOfficeId ?? this.officeId ?? null;
  }

  get isTransferSelectionMode(): boolean {
    return this.showTransferForm && this.showTransferTableSelections;
  }

  get isTransferFormValid(): boolean {
    const hasTransferDate = this.utilityService.toDateOnlyJsonString(this.transferDate) !== null;
    return hasTransferDate && this.transferAmount !== 0;
  }

  get showPrintCheckTableSelections(): boolean {
    return this.printChecksOnly;
  }

  get isPrintChecksFormValid(): boolean {
    return this.selectedJournalEntryLineIds.size > 0;
  }

  get showGeneralLedgerAddButton(): boolean {
    return this.showGeneralLedgerRowActions;
  }

  get showGeneralLedgerRetainedEarningsButton(): boolean {
    return this.showGeneralLedgerRowActions;
  }

  get showGeneralLedgerRowEditAction(): boolean {
    return this.usesGroupedJournalEntryDisplay;
  }

  get showGeneralLedgerRowCopyAction(): boolean {
    return this.showGeneralLedgerRowEditAction;
  }

  get showGeneralLedgerRowDeleteAction(): boolean {
    return !this.undepositedFundsOnly
      && !this.untransferredFundsOnly
      && !this.transferReportOnly
      && !this.depositsOnly
      && !this.printChecksOnly;
  }

  get showGeneralLedgerRowActions(): boolean {
    return this.showGeneralLedgerRowDeleteAction;
  }

  get usesGroupedJournalEntryDisplay(): boolean {
    return !this.transferReportOnly && !this.depositsOnly && !this.printChecksOnly;
  }

  get tableDisplayData(): Array<JournalEntryLineListDisplay | GeneralLedgerEntryDisplay> {
    return this.usesGroupedJournalEntryDisplay ? this.entriesDisplay : this.linesDisplay;
  }

  get tableRowCount(): number {
    return this.tableDisplayData.length;
  }

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.linesDisplay.length === 0) {
      return undefined;
    }

    const totalDebit = this.linesDisplay.reduce(
      (sum, line) => this.roundCurrencyValue(sum + Number(line.debitValue || 0)),
      0
    );
    const totalCredit = this.linesDisplay.reduce(
      (sum, line) => this.roundCurrencyValue(sum + Number(line.creditValue || 0)),
      0
    );

    return {
      description: 'Totals:',
      debit: this.formatGroupedAmount(totalDebit),
      credit: this.formatGroupedAmount(totalCredit)
    };
  }

  get activeDisplayedColumns(): ColumnSet {
    if (!this.usesGroupedJournalEntryDisplay) {
      return this.displayedColumns;
    }

    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.displayedColumns
    };
  }

  get showTableLineSelections(): boolean {
    return this.showDepositTableSelections || this.showTransferTableSelections || this.showPrintCheckTableSelections;
  }

  get showGroupedTableLineSelections(): boolean {
    return this.showTableLineSelections && this.usesGroupedJournalEntryDisplay;
  }

  get hasActionsSelectInTable(): boolean {
    return this.showTableLineSelections || this.showJournalEntryPostSelections;
  }

  get hasButtonSelectAllInTable(): boolean {
    return this.hasActionsSelectInTable;
  }
  //#endregion

  //#region Utility methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  
  ngOnDestroy(): void {
    this.cancelJournalEntryLinesLoad$.next();
    this.cancelJournalEntryLinesLoad$.complete();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.journalEntryLinesLoadKey);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
