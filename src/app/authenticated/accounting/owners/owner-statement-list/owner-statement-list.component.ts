import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { PaymentType } from '../../models/accounting-enum';
import { OwnerPaymentsRequest, OwnerStatementMonthLineListDisplay } from '../../models/owner-statement.model';
import { OwnerReportsCacheService } from '../../services/owner-reports-cache.service';
import { OwnerStatementService } from '../../services/owner-statement.service';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './owner-statement-list.component.html',
  styleUrls: ['./owner-statement-list.component.scss', '../owner-report/owner-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() viewStatement = new EventEmitter<OwnerStatementMonthLineListDisplay>();
  @Output() ownersPaid = new EventEmitter<void>();
  private commonService = inject(CommonService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private ownerStatementService = inject(OwnerStatementService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  isPayingOwners = false;
  companyName = '';
  noDataMessage = 'Press Go to run the report.';
  lines: OwnerStatementMonthLineListDisplay[] = [];
  selectedOwnerStatementLines: OwnerStatementMonthLineListDisplay[] = [];
  readonly ownerStatementDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '14ch' },
    ownerName: { displayAs: 'Owner', wrap: false, maxWidth: '35ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    monthDisplay: { displayAs: 'Period', wrap: false, maxWidth: '18ch', alignment: 'center' },
    startingBalance: { displayAs: 'Starting', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    income: { displayAs: 'Income', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    expenses: { displayAs: 'Expenses', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    ownerPayment: { displayAs: 'Payment', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    ownerPaymentPaid: { displayAs: 'Paid', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
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
    if (changes['isLoading'] || changes['refreshTrigger'] || changes['searchRequest']) {
      this.loadOwnerStatementList();
    }
  }

  onViewStatement(row: OwnerStatementMonthLineListDisplay): void {
    this.viewStatement.emit(row);
  }

  onSelectionSet(selection: SelectionModel<unknown>): void {
    this.selectedOwnerStatementLines = (selection?.selected ?? []) as OwnerStatementMonthLineListDisplay[];
    this.markViewForCheck();
  }

  onPayOwners(): void {
    if (this.isPayingOwners || this.selectedOwnerStatementLines.length === 0) {
      return;
    }

    const paymentRequest = this.buildOwnerPaymentsRequest(this.selectedOwnerStatementLines);
    if (!paymentRequest) {
      return;
    }

    this.isPayingOwners = true;
    this.markViewForCheck();
    this.ownerStatementService.applyOwnerPayments(paymentRequest).pipe(
      take(1),
      finalize(() => {
        this.isPayingOwners = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        const paymentCount = paymentRequest.payments.length;
        const paymentLabel = paymentCount === 1 ? 'owner payment' : 'owner payments';
        this.toastr.success(`${paymentCount} ${paymentLabel} applied`, CommonMessage.Success);
        this.selectedOwnerStatementLines = [];
        this.ownersPaid.emit();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        const message = this.utilityService.extractApiErrorMessage(error);
        this.toastr.error(message || 'Failed to apply owner payments', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  buildOwnerPaymentsRequest(lines: OwnerStatementMonthLineListDisplay[]): OwnerPaymentsRequest | null {
    const paymentDate = this.utilityService.toDateOnlyJsonString(this.searchRequest?.endDate)
      ?? this.utilityService.todayAsCalendarDateString();
    const payments = lines
      .map(line => ({
        officeId: line.officeId,
        ownerId: line.ownerId,
        propertyId: line.propertyId,
        paymentTypeId: PaymentType.Ach,
        amount: this.mappingService.parseCurrencyValue(line.ownerPayment)
      }))
      .filter(payment => payment.officeId > 0
        && !!payment.ownerId
        && !!payment.propertyId
        && payment.amount !== 0);

    if (payments.length === 0) {
      this.toastr.warning('Selected lines have no payment amount to apply.', CommonMessage.Error);
      return null;
    }

    return {
      paymentDate,
      payments
    };
  }
  //#endregion

  //#region Data Loading Methods
  clearOwnerStatementDisplay(): void {
    this.lines = [];
    this.selectedOwnerStatementLines = [];
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
      this.markViewForCheck();
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

    if (!this.ownerReportsCacheService.matchesOwnerReportBundleScope(
      this.mappingService.mapOwnerReportSearchRequest(this.searchRequest)
    )) {
      this.lines = [];
      this.noDataMessage = 'Press Go to run the report.';
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    const cashReport = this.ownerReportsCacheService.getCashReport();
    if (!cashReport) {
      this.lines = [];
      this.noDataMessage = 'Press Go to run the report.';
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    this.noDataMessage = 'No owner statement lines matched the current filters.';
    this.isServiceError = false;
    let monthLines = this.mappingService.mapOwnerCashReportToMonthLines(cashReport, request);
    const propertyId = (request.propertyId || '').trim();
    if (propertyId) {
      monthLines = monthLines.filter(line => (line.propertyId || '').trim() === propertyId);
    }
    this.lines = this.mappingService.mapOwnerStatementMonthLineDisplays(monthLines);
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
      ownerPaymentPaid: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('ownerPaymentPaid')),
      endingBalance: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('endingBalance'))
    };
  }

  getOwnerStatementAmountSum(columnName: 'startingBalance' | 'income' | 'expenses' | 'ownerPayment' | 'ownerPaymentPaid' | 'endingBalance'): number {
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
