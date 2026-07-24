import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OwnerStatementMonthLineListDisplay } from '../../models/owner-statement.model';
import { OwnerReportsCacheService } from '../../services/owner-reports-cache.service';

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
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
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
