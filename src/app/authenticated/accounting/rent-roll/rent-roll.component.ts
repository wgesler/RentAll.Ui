import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { RentRollPropertyAgreement, RentRollRow, RentRollRowDisplay } from '../models/rent-roll.model';

@Component({
  selector: 'app-rent-roll',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './rent-roll.component.html',
  styleUrl: './rent-roll.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentRollComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
  @Input() refreshTrigger = 0;

  readonly rentRollDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    title: { displayAs: 'Agreement Line', wrap: true, maxWidth: '26ch' },
    vendorName: { displayAs: 'Vendor', wrap: true, maxWidth: '24ch' },
    monthlyAmountDisplay: { displayAs: 'Monthly', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    dailyAmountDisplay: { displayAs: 'Daily', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    totalAmountDisplay: { displayAs: 'Total', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };
  rentRollRows: RentRollRow[] = [];
  rentRollRowsDisplay: RentRollRowDisplay[] = [];
  rentRollTotalAmount = 0;
  isServiceError = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rentRoll']));
  destroy$ = new Subject<void>();
  propertyAgreements: RentRollPropertyAgreement[] = [];

  loadSequence = 0;

  constructor(
    private propertyAgreementService: PropertyAgreementService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private formatter: FormatterService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Rent Roll
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadRentRoll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] || changes['refreshTrigger']) {
      this.loadRentRoll();
      return;
    }

    if (changes['searchDateRange']) {
      this.rebuildRentRollRowsFromCachedAgreements();
    }
  }

  loadRentRoll(): void {
    const currentLoadSequence = ++this.loadSequence;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'rentRoll');
    const daysInMonth = this.resolveDaysInMonth();

    this.propertyAgreementService.getPropertyAgreementRentRollByOfficeIds().pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        if (this.shouldIgnoreLoadResult(currentLoadSequence)) {
          return;
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rentRoll');
        this.markViewForCheck();
      })
    ).subscribe({
      next: propertyAgreements => {
        if (this.shouldIgnoreLoadResult(currentLoadSequence)) {
          return;
        }
        this.propertyAgreements = this.filterPropertyAgreementsByOffice(propertyAgreements || []);
        this.rebuildRentRollRowsFromCachedAgreements(daysInMonth);
        this.markViewForCheck();
      },
      error: () => {
        if (this.shouldIgnoreLoadResult(currentLoadSequence)) {
          return;
        }
        this.isServiceError = true;
        this.propertyAgreements = [];
        this.rentRollRows = [];
        this.rentRollRowsDisplay = [];
        this.rentRollTotalAmount = 0;
        this.markViewForCheck();
      }
    });
  }

  filterPropertyAgreementsByOffice(propertyAgreements: RentRollPropertyAgreement[]): RentRollPropertyAgreement[] {
    if (this.officeId == null) {
      return propertyAgreements;
    }
    return propertyAgreements.filter(propertyAgreement => propertyAgreement.officeId === this.officeId);
  }

  resolveDaysInMonth(): number {
    const referenceDate = this.utilityService.parseDateOnlyStringToDate(this.searchDateRange.endDate)
      || this.utilityService.parseDateOnlyStringToDate(this.searchDateRange.startDate)
      || new Date();
    return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
  }

  rebuildRentRollRowsFromCachedAgreements(daysInMonthOverride?: number): void {
    const daysInMonth = daysInMonthOverride ?? this.resolveDaysInMonth();
    this.rentRollRows = this.mappingService.mapRentRollRowsFromAgreements(this.propertyAgreements, daysInMonth);
    this.rentRollRowsDisplay = this.rentRollRows.map(row => ({
      propertyCode: row.propertyCode || '',
      title: row.title || '—',
      vendorName: row.vendorName || '—',
      monthlyAmountDisplay: this.getRentRollAmountDisplay(row.monthlyAmount),
      dailyAmountDisplay: this.getRentRollAmountDisplay(row.dailyAmount),
      totalAmountDisplay: this.getRentRollAmountDisplay(row.totalAmount)
    }));
    this.rentRollTotalAmount = this.mappingService.sumRentRollTotal(this.rentRollRows);
  }

  get daysInMonth(): number {
    return this.resolveDaysInMonth();
  }

  get hasRentRollRows(): boolean {
    return this.rentRollRows.length > 0;
  }

  getRentRollAmountDisplay(value: number): string {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return '—';
    }
    return this.formatter.currencyUsd(numericValue);
  }

  shouldIgnoreLoadResult(loadSequence: number): boolean {
    return this.loadSequence !== loadSequence;
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
