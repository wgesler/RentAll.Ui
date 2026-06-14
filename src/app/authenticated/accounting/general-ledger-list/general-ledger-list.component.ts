import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, filter, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountType, SourceTypeLabels } from '../models/accounting-enum';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
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
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() depositCompletedEvent = new EventEmitter<void>();

  selectedJournalEntryLineIds = new Set<string>();
  showDepositSelections = false;
  showDepositForm = false;
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
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
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
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'chartOfAccounts', 'generalLedgerLines']));
  destroy$ = new Subject<void>();

  constructor(
    public generalLedgerService: GeneralLedgerService,
    public mappingService: MappingService,
    public formatter: FormatterService,
    private officeService: OfficeService,
    private chartOfAccountsService: ChartOfAccountsService,
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
    this.loadOffices();
    this.loadChartOfAccounts();
    this.loadJournalEntryLines();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      if (this.showDepositForm) {
        this.cancelDepositForm();
      }
      this.applyLinesDisplay();
    }

    const shouldReloadLines =
      (changes['chartOfAccountId'] && !changes['chartOfAccountId'].firstChange)
      || (changes['undepositedFundsOnly'] && !changes['undepositedFundsOnly'].firstChange)
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
      }
      this.loadJournalEntryLines();
    }
  }

  get showDepositTableSelections(): boolean {
    return this.undepositedFundsOnly && this.showDepositSelections;
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
      if (!row || this.getLineNetAmount(row) <= 0) {
        nextSelectedIds.delete(lineId);
        if (row) {
          row.selected = false;
        }
      }
    }

    this.selectedJournalEntryLineIds = nextSelectedIds;

    if (this.isDepositSelectionMode) {
      this.syncDepositAmountFromLineSelection();
    } else {
      this.applyLinesDisplay();
    }

    this.markViewForCheck();
  }

  onLineSelect(row: JournalEntryLineListDisplay): void {
    if (this.showDepositForm || !row?.journalEntryId) {
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
          this.loadJournalEntryLines();
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
          this.applyLinesDisplay();
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
      }
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'generalLedgerLines');
      this.markViewForCheck();
      return;
    }

    const undepositedFundsAccountIds = this.undepositedFundsOnly
      ? this.resolveUndepositedFundsAccountIds(officeIds)
      : [];

    if (this.undepositedFundsOnly && undepositedFundsAccountIds.length === 0) {
      this.allLines = [];
      this.linesDisplay = [];
      this.isServiceError = false;
      if (this.showDepositForm) {
        this.cancelDepositForm();
      } else {
        this.clearDepositLineSelection();
      }
      this.noActivityMessage = 'No Undeposited Funds account is configured for the selected office.';
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'generalLedgerLines');
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

    this.utilityService.addLoadItem(this.itemsToLoad$, 'generalLedgerLines');
    this.isServiceError = false;

    const chartOfAccountId = this.undepositedFundsOnly
      ? (undepositedFundsAccountIds.length === 1 ? undepositedFundsAccountIds[0] : null)
      : (this.chartOfAccountId != null && this.chartOfAccountId > 0 ? this.chartOfAccountId : null);

    this.generalLedgerService.searchJournalEntryLines({
      officeIds,
      chartOfAccountId,
      propertyId: this.undepositedFundsOnly ? null : (this.propertyId?.trim() || null),
      reservationId: this.undepositedFundsOnly ? null : (this.reservationId?.trim() || null),
      includeVoided: false,
      includeUnposted: true,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'generalLedgerLines')), takeUntil(this.destroy$)).subscribe({
      next: lines => {
        let resolvedLines = lines || [];
        if (this.undepositedFundsOnly && undepositedFundsAccountIds.length > 1) {
          const accountIdSet = new Set(undepositedFundsAccountIds);
          resolvedLines = resolvedLines.filter(line => accountIdSet.has(line.chartOfAccountId));
        }
        this.allLines = resolvedLines;
        this.noActivityMessage = this.undepositedFundsOnly
          ? 'No Undeposited Funds activity for the selected office and date range.'
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
      selected: this.showDepositTableSelections && this.selectedJournalEntryLineIds.has(line.journalEntryLineId),
      disabled: this.showDepositTableSelections && this.getLineNetAmount(line) <= 0
    }));
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

  resolveUndepositedFundsAccountIds(officeIds: number[]): number[] {
    return (this.chartOfAccounts || [])
      .filter(account =>
        officeIds.includes(account.officeId)
        && account.accountTypeId === AccountType.OtherCurrentAsset
        && this.isUndepositedFundsAccount(account))
      .map(account => account.accountId);
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
