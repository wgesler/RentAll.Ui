import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, catchError, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { AuthService } from '../../../../services/auth.service';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';
import { JournalEntryLineSearchResponse, JournalEntryRecapRowDisplay } from '../../models/journal-entry.model';
import { EscrowReportResult } from '../../models/escrow-report.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { OwnerReportsCacheService } from '../../services/owner-reports-cache.service';
import { ReportService } from '../../services/report.service';

@Component({
  selector: 'app-escrow-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './escrow-report.component.html',
  styleUrls: ['./escrow-report.component.scss', '../../reports/financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EscrowReportComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() asOfDate: string | null = null;
  @Input() searchRequest: MaintenanceListSearchRequest | null = null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;

  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private generalLedgerService = inject(GeneralLedgerService);
  private reportService = inject(ReportService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  hasLoadedOnce = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  reportResult: EscrowReportResult | null = null;
  cushionInput = 0;
  noDataMessage = 'Click Go to load the Escrow report for the selected office, property, and as-of date.';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  destroy$ = new Subject<void>();
  private reportLoadId = 0;

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadReport();
    }

    if (changes['isLoading'] && !changes['isLoading'].firstChange) {
      this.markViewForCheck();
    }

    if ((changes['searchRequest'] || changes['officeId'] || changes['asOfDate']) && this.hasLoadedOnce) {
      this.loadReport();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: offices => {
            this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.markViewForCheck();
      }
    });
  }

  loadReport(): void {
    if (!this.isPageReady) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    const asOfDate = this.asOfDate || this.utilityService.formatDateOnlyForApi(new Date());
    if (officeIds.length === 0) {
      this.reportResult = null;
      this.isServiceError = false;
      this.hasLoadedOnce = true;
      this.noDataMessage = 'Select an office to load the Escrow report.';
      this.markViewForCheck();
      return;
    }

    const loadId = ++this.reportLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'escrowReport');
    this.hasLoadedOnce = true;

    const searchRequest: MaintenanceListSearchRequest = {
      officeIds,
      propertyId: this.searchRequest?.propertyId ?? null,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: asOfDate
    };

    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      switchMap(() => this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1))),
      switchMap(() => {
        const cached = this.ownerReportsCacheService.getAccrualReport();
        const cachedRecap = this.ownerReportsCacheService.getRecapReport();
        const reports$ = cached && cachedRecap
          ? of({ accrual: cached, recap: cachedRecap })
          : this.reportService.searchOwnerReports(
              this.mappingService.mapOwnerReportSearchRequest(searchRequest)
            ).pipe(
              map(bundle => ({ accrual: bundle.accrual, recap: bundle.recap }))
            );

        return reports$.pipe(
          switchMap(({ accrual, recap }) => {
            const bankRequests = officeIds.map(officeId => {
              const accountId = this.resolveEscrowBankAccountId(officeId);
              if (accountId == null) {
                return of({ officeId, accountId: null as number | null, lines: [] as JournalEntryLineSearchResponse[] });
              }

              return this.generalLedgerService.searchJournalEntryLines({
                officeIds: [officeId],
                chartOfAccountId: accountId,
                includeVoided: false,
                includeUnposted: true,
                startDate: null,
                endDate: asOfDate
              }).pipe(
                catchError(() => of([] as JournalEntryLineSearchResponse[])),
                map(lines => ({ officeId, accountId, lines }))
              );
            });

            return forkJoin(bankRequests).pipe(
              map(bankResults => ({ accrual, recap, bankResults }))
            );
          })
        );
      }),
      take(1)
    ).subscribe({
      next: ({ accrual, recap, bankResults }) => {
        if (this.reportLoadId !== loadId) {
          return;
        }

        this.isServiceError = false;
        const escrowBankBalance = this.mappingService.roundFinancialReportAmount(
          bankResults.reduce(
            (sum, result) => sum + this.mappingService.sumEscrowAssetAccountBalance(result.lines),
            0
          )
        );
        const bankLabels = bankResults
          .map(result => this.resolveEscrowBankAccountLabel(result.officeId, result.accountId))
          .filter(label => !!label);
        this.reportResult = this.mappingService.buildEscrowReport({
          accrualRows: accrual?.rows || [],
          recapRows: (recap?.rows || []) as JournalEntryRecapRowDisplay[],
          propertyId: this.searchRequest?.propertyId ?? null,
          asOfDateLabel: this.formatAsOfLabel(asOfDate),
          officeName: this.displayOfficeName,
          cushion: this.cushionInput,
          escrowBankBalance,
          escrowBankAccountLabel: bankLabels[0] || 'Escrow Bank Balance'
        });
        this.cushionInput = this.reportResult.cushion;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (this.reportLoadId !== loadId) {
          return;
        }

        this.reportResult = null;
        this.isServiceError = true;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load Escrow report.';
        this.toastr.error(message, 'Escrow');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');
        this.markViewForCheck();
      }
    });
  }

  onCushionChange(value: number | string | null): void {
    if (!this.reportResult) {
      return;
    }

    const parsed = Number(value);
    this.cushionInput = Number.isFinite(parsed)
      ? this.mappingService.roundFinancialReportAmount(parsed)
      : 0;
    this.reportResult = this.mappingService.recalculateEscrowTransfer(this.reportResult, this.cushionInput);
    this.markViewForCheck();
  }

  formatAmount(value: number): string {
    return this.formatter.currencyUsd(value);
  }

  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }

    const fromSearch = (this.searchRequest?.officeIds || []).filter(id => id > 0);
    if (fromSearch.length > 0) {
      return fromSearch;
    }

    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

resolveEscrowBankAccountId(officeId: number): number | null {
    const accountingOffice = this.accountingOfficeService.getAllAccountingOfficesValue()
      .find(office => Number(office.officeId) === officeId);
    const configuredAccountId = Number(accountingOffice?.defaultEscrowDepositAccountId ?? 0);
    if (configuredAccountId > 0) {
      return configuredAccountId;
    }

    const account1003 = this.chartOfAccountsService.getChartOfAccountsForOffice(officeId).find(account => {
      const accountNo = String(account.accountNo || '').trim().replace(/^0+/, '');
      return accountNo === '1003';
    });
    const fallbackId = Number(account1003?.accountId ?? 0);
    return fallbackId > 0 ? fallbackId : null;
  }

resolveEscrowBankAccountLabel(officeId: number, accountId: number | null): string {
    if (accountId == null) {
      return '';
    }

    const account = this.chartOfAccountsService.getChartOfAccountsForOffice(officeId)
      .find(item => Number(item.accountId) === accountId);
    if (!account) {
      return '';
    }

    return this.utilityService.getChartOfAccountDropdownLabel(account);
  }

formatAsOfLabel(asOfDate: string): string {
    return this.formatter.formatDateString(asOfDate) || asOfDate;
  }

  get displayOfficeName(): string {
    if (this.officeId == null) {
      return 'All Offices';
    }
    return this.offices.find(office => office.officeId === this.officeId)?.name || '';
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
