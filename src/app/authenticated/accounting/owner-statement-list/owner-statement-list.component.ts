import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OwnerStatementMonthLineListDisplay } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';
import { OwnerStatementStartingBalanceDialogComponent, OwnerStatementStartingBalanceDialogResult } from './owner-statement-starting-balance-dialog.component';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, DataTableComponent],
  templateUrl: './owner-statement-list.component.html',
  styleUrl: './owner-statement-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Output() viewStatement = new EventEmitter<OwnerStatementMonthLineListDisplay>();

  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No owner statement lines matched the current filters.';
  lines: OwnerStatementMonthLineListDisplay[] = [];
  readonly ownerStatementDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '14ch' },
    ownerName: { displayAs: 'Owner', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    monthDisplay: { displayAs: 'Month', wrap: false, maxWidth: '15ch', alignment: 'center' },
    startingBalance: { displayAs: 'Starting', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    income: { displayAs: 'Income', wrap: false, maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    expenses: { displayAs: 'Expenses', wrap: false, maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    ownerPayment: { displayAs: 'Payment', wrap: false, maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    endingBalance: { displayAs: 'Balance', wrap: false, maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' }
  };
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatementMonthLines']));
  destroy$ = new Subject<void>();

  constructor(
    private ownerStatementService: OwnerStatementService, 
    private propertyAgreementService: PropertyAgreementService, 
    private authService: AuthService, 
    private formatter: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService, 
    private dialog: MatDialog, 
    private toastr: ToastrService, 
    private cdr: ChangeDetectorRef) 
    {}

  //#region Owner-Statement-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOwnerStatementList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['searchRequest'] && !changes['searchRequest'].firstChange) || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
      this.loadOwnerStatementList();
    }
  }

  onViewStatement(row: OwnerStatementMonthLineListDisplay): void {
    this.viewStatement.emit(row);
  }

  openStartingBalanceDialog(row: OwnerStatementMonthLineListDisplay): void {
    this.ownerStatementService.getOwnerStatementStartingBalance(row.officeId, row.ownerId, row.propertyId).pipe(take(1)).subscribe({
      next: existingStartingBalance => {
        const hasExistingStartingBalance = !!existingStartingBalance;
        if (hasExistingStartingBalance && !this.authService.isAdmin()) {
          this.toastr.warning('Only Admin users can change an existing starting balance.', 'Owner Statements');
          return;
        }

        const startingBalanceAmount = existingStartingBalance?.amount ?? this.mappingService.parseCurrencyValue(row.startingBalance);
        if (Math.abs(startingBalanceAmount) > 0.005) {
          this.openStartingBalanceDialogWithAmount(row, existingStartingBalance?.transactionDate ?? null, existingStartingBalance?.amount ?? null, hasExistingStartingBalance, startingBalanceAmount);
          return;
        }

        this.propertyAgreementService.getPropertyAgreement(row.propertyId).pipe(take(1)).subscribe({
          next: agreement => {
            const workingCapital = Number(agreement?.workingCapitalBalance);
            const defaultAmount = Number.isFinite(workingCapital) ? workingCapital : startingBalanceAmount;
            this.openStartingBalanceDialogWithAmount(row, existingStartingBalance?.transactionDate ?? null, existingStartingBalance?.amount ?? null, hasExistingStartingBalance, defaultAmount);
          },
          error: () => {
            this.openStartingBalanceDialogWithAmount(row, existingStartingBalance?.transactionDate ?? null, existingStartingBalance?.amount ?? null, hasExistingStartingBalance, startingBalanceAmount);
          }
        });
      },
      error: () => {
        this.toastr.error('Unable to load current starting balance.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOwnerStatementList(): void {
    const request = this.mappingService.mapOwnerStatementMonthLineSearchRequest(this.searchRequest);
    if (request.officeIds.length === 0) {
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerStatementMonthLines');
    this.ownerStatementService.searchOwnerStatementMonthLines(request).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines'))).subscribe({
      next: rows => {
        this.lines = this.mappingService.mapOwnerStatementMonthLineDisplays(rows || []);
        this.isServiceError = false;
        this.markViewForCheck();
      },
      error: () => {
        this.lines = [];
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  //#endregion

  //#region Total Row Methods
  get totalsRow(): { [key: string]: string } | undefined {
    if (this.lines.length === 0) {
      return undefined;
    }
    return {
      startingBalance: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('startingBalance')),
      income: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('income')),
      expenses: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('expenses')),
      ownerPayment: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('ownerPayment')),
      endingBalance: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('endingBalance'))
    };
  }

  getOwnerStatementAmountSum(columnName: 'startingBalance' | 'income' | 'expenses' | 'ownerPayment' | 'endingBalance'): number {
    return this.lines.reduce((sum, line) => sum + this.mappingService.parseCurrencyValue(line[columnName]), 0);
  }
  //#endregion

  //#region Utility Methods
  openStartingBalanceDialogWithAmount(row: OwnerStatementMonthLineListDisplay, existingTransactionDate: string | null, existingAmount: number | null, hasExistingStartingBalance: boolean, defaultAmount: number | null): void {
    const defaultDateValue = existingTransactionDate || row.monthDate || null;
    const defaultDate = this.utilityService.parseCalendarDateInput(defaultDateValue) ?? new Date();
    this.dialog.open(OwnerStatementStartingBalanceDialogComponent, {
      width: '34rem',
      data: {
        defaultDate,
        defaultAmount,
        existingAmount,
        existingTransactionDate,
        requiresAdminPassword: hasExistingStartingBalance
      }
    }).afterClosed().pipe(take(1)).subscribe((result?: OwnerStatementStartingBalanceDialogResult) => {
      if (!result) {
        return;
      }

      const changedExistingValue = hasExistingStartingBalance
        && ((existingTransactionDate || '') !== result.transactionDate || Math.abs((Number(existingAmount) || 0) - (Number(result.amount) || 0)) > 0.005);
      const currentPassword = String(result.currentPassword || '').trim();
      const createStartingBalance = () => {
        this.ownerStatementService.createOwnerStatementStartingBalance({
          officeId: row.officeId,
          ownerId: row.ownerId,
          propertyId: row.propertyId,
          transactionDate: result.transactionDate,
          amount: result.amount,
          currentPassword: changedExistingValue ? currentPassword : null
        }).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('Starting balance journal entry saved and posted.', CommonMessage.Success);
            this.loadOwnerStatementList();
          },
          error: () => {
            this.toastr.error('Unable to save starting balance journal entry.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      };
      if (!changedExistingValue) {
        createStartingBalance();
        return;
      }

      this.authService.confirmPassword(currentPassword).pipe(take(1)).subscribe({
        next: isConfirmed => {
          if (!isConfirmed) {
            this.toastr.error('Password confirmation failed.', CommonMessage.Error);
            return;
          }
          createStartingBalance();
        },
        error: () => {
          this.toastr.error('Password confirmation failed.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
    });
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
