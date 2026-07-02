import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerStatementMonthLineListDisplay, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementMonthLineSelection } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-statement-list.component.html',
  styleUrl: './owner-statement-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Output() viewStatement = new EventEmitter<OwnerStatementMonthLineSelection>();

  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No owner statement lines matched the current filters.';
  lines: OwnerStatementMonthLineListDisplay[] = [];
  displayedColumns: string[] = ['view', 'officeName', 'ownerName', 'propertyCode', 'monthDate', 'expected', 'prePaid', 'outstanding', 'income', 'expenses', 'balance', 'workingCapital', 'workingCapitalBalanceDue'];
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatementMonthLines']));
  destroy$ = new Subject<void>();

  constructor(private ownerStatementService: OwnerStatementService, private formatter: FormatterService, private utilityService: UtilityService, private cdr: ChangeDetectorRef) {}

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
    this.viewStatement.emit({
      ownerStatementLineId: row.ownerStatementLineId,
      officeId: row.officeId,
      ownerId: row.ownerId,
      propertyId: row.propertyId,
      monthDate: row.monthDate
    });
  }
  //#endregion

  //#region Data Loading Methods
  buildOwnerStatementMonthLineSearchRequest(): OwnerStatementMonthLineSearchRequest {
    return {
      officeIds: (this.searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: this.searchRequest?.propertyId ?? null,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: this.searchRequest?.endDate ?? null
    };
  }

  loadOwnerStatementList(): void {
    const request = this.buildOwnerStatementMonthLineSearchRequest();
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
        this.lines = this.mapOwnerStatementMonthLineDisplays(rows || []);
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

  mapOwnerStatementMonthLineDisplays(rows: OwnerStatementMonthLineResponse[]): OwnerStatementMonthLineListDisplay[] {
    return (rows || []).map(row => ({
      ownerStatementLineId: (row.ownerStatementLineId || '').trim(),
      officeId: row.officeId,
      ownerId: (row.ownerId || '').trim(),
      propertyId: (row.propertyId || '').trim(),
      officeName: (row.officeName || '').trim(),
      ownerName: (row.ownerName || '').trim(),
      propertyCode: (row.propertyCode || '').trim(),
      monthDate: this.formatter.formatDateString(row.monthDate),
      expected: this.formatter.currencyUsd(Number(row.expected) || 0),
      prePaid: this.formatter.currencyUsd(Number(row.prePaid) || 0),
      outstanding: this.formatter.currencyUsd(Number(row.outstanding) || 0),
      income: this.formatter.currencyUsd(Number(row.income) || 0),
      expenses: this.formatter.currencyUsd(Number(row.expenses) || 0),
      balance: this.formatter.currencyUsd(Number(row.balance) || 0),
      workingCapital: this.formatter.currencyUsd(Number(row.workingCapital) || 0),
      workingCapitalBalanceDue: this.formatter.currencyUsd(Number(row.workingCapitalBalanceDue) || 0)
    }));
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
