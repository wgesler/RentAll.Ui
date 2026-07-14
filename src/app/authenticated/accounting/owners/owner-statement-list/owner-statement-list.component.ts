import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { AuthService } from '../../../../services/auth.service';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';
import { PropertyAgreementService } from '../../../properties/services/property-agreement.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OwnerStatementMonthLineListDisplay } from '../../models/owner-statement.model';
import { OwnerStatementService } from '../../services/owner-statement.service';
import { OwnerReportsCacheService } from '../../services/owner-reports-cache.service';
import { OwnerStatementStartingBalanceDialogComponent, OwnerStatementStartingBalanceDialogResult } from './owner-statement-starting-balance-dialog.component';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './owner-statement-list.component.html',
  styleUrls: ['./owner-statement-list.component.scss', '../owner-report/owner-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() viewStatement = new EventEmitter<OwnerStatementMonthLineListDisplay>();
  private commonService = inject(CommonService);
  private ownerStatementService = inject(OwnerStatementService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private propertyAgreementService = inject(PropertyAgreementService);
  private authService = inject(AuthService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private dialog = inject(MatDialog);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  companyName = '';
  noDataMessage = 'No owner statement lines matched the current filters.';
  lines: OwnerStatementMonthLineListDisplay[] = [];
  readonly ownerStatementDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '14ch' },
    ownerName: { displayAs: 'Owner', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    monthDisplay: { displayAs: 'Period', wrap: false, maxWidth: '18ch', alignment: 'center' },
    startingBalance: { displayAs: 'Starting', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    income: { displayAs: 'Income', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    expenses: { displayAs: 'Expenses', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    ownerPayment: { displayAs: 'Payment', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    endingBalance: { displayAs: 'Balance', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' }
  };
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  //#region Owner-Statement-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOrganization();
    this.loadOwnerStatementList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading'] || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
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
  clearOwnerStatementDisplay(): void {
    this.lines = [];
    this.isServiceError = false;
    this.markViewForCheck();
  }

  loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.companyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.companyName = organization?.name?.trim() || '';
      this.markViewForCheck();
    });
  }

  loadOwnerStatementList(): void {
    if (this.isLoading) {
      this.clearOwnerStatementDisplay();
      return;
    }

    const request = this.mappingService.mapOwnerStatementMonthLineSearchRequest(this.searchRequest);
    if (request.officeIds.length === 0) {
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    const cashReport = this.ownerReportsCacheService.getCashReport();
    if (!cashReport) {
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.lines = this.mappingService.mapOwnerStatementMonthLineDisplays(
      this.mappingService.mapOwnerCashReportToMonthLines(cashReport, request)
    );
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
    this.markViewForCheck();
  }

  //#endregion

  get reportTitle(): string {
    return 'Owner Statements';
  }

  get headerEntityLine(): string {
    const officeLabel = this.getHeaderOfficeLabel();
    return [this.companyName, officeLabel].filter(label => !!label).join(' ');
  }

  get headerPeriodLine(): string {
    const startDate = this.searchRequest?.startDate ?? null;
    const endDate = this.searchRequest?.endDate ?? null;
    const periodLabel = this.mappingService.buildFinancialReportPeriodLabel(startDate, endDate, false);
    return periodLabel || 'All Dates';
  }

  getHeaderOfficeLabel(): string {
    const officeNames = [...new Set(
      this.lines
        .map(line => (line.officeName || '').trim())
        .filter(name => !!name)
    )];
    if (officeNames.length === 1) {
      return officeNames[0];
    }
    if (officeNames.length > 1) {
      return 'All Offices';
    }
    const requestedOfficeCount = (this.searchRequest?.officeIds || []).filter(id => id > 0).length;
    if (requestedOfficeCount > 1) {
      return 'All Offices';
    }
    return '';
  }

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
