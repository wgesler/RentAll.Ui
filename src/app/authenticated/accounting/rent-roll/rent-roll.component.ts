import { CommonModule } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { ReceiptResponse, ReceiptSelection } from '../../maintenance/models/receipt.model';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { PropertyAgreementLineResponse } from '../../properties/models/property-agreement.model';
import { PropertyAgreementLineRequest, PropertyAgreementRequest } from '../../properties/models/property-agreement.model';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { ManagementFeeType } from '../../properties/models/property-enums';
import { RentRollCreateBillRequest, RentRollPropertyAgreement, RentRollRow, RentRollRowDisplay } from '../models/rent-roll.model';
import { RentRollEditLineDialogComponent, RentRollEditLineDialogData, RentRollEditLineDialogResult } from './rent-roll-edit-line-dialog.component';

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
  @Output() createBill = new EventEmitter<RentRollCreateBillRequest>();
  @Output() createBills = new EventEmitter<RentRollCreateBillRequest[]>();
  @Output() openBill = new EventEmitter<ReceiptSelection>();
  isAdmin = false;

  readonly rentRollDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    vendorName: { displayAs: 'Vendor', wrap: true, maxWidth: '25ch' },
    chartOfAccountDisplay: { displayAs: 'Chart of Account', wrap: true, maxWidth: '25ch' },
    isRent: { displayAs: 'Is Rent', wrap: false, maxWidth: '10ch', alignment: 'center', headerAlignment: 'center', sort: false, isCheckbox: true, checkboxEditable: false },
    billDateDisplay: { displayAs: 'Bill Date', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    dueDateDisplay: { displayAs: 'Due Date', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    depositAmountDisplay: { displayAs: 'Deposit', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    oneTimeAmountDisplay: { displayAs: 'One Time', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    monthlyAmountDisplay: { displayAs: 'Monthly', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    dailyAmountDisplay: { displayAs: 'Daily', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    totalAmountDisplay: { displayAs: 'Total', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };
  rentRollRows: RentRollRow[] = [];
  rentRollRowsDisplayAll: RentRollRowDisplay[] = [];
  rentRollRowsDisplay: RentRollRowDisplay[] = [];
  selectedRentRollRows: RentRollRowDisplay[] = [];
  showCreatedBills = false;
  rentRollTotalAmount = 0;
  isServiceError = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rentRoll']));
  destroy$ = new Subject<void>();
  propertyAgreements: RentRollPropertyAgreement[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  existingBillByMatchKey = new Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }>();
  existingBillByAgreementLinePeriodKey = new Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }>();

  loadSequence = 0;

  constructor(
    private authService: AuthService,
    private propertyAgreementService: PropertyAgreementService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private formatter: FormatterService,
    private chartOfAccountsService: ChartOfAccountsService,
    private receiptService: ReceiptService,
    private dialog: MatDialog,
    private toastr: ToastrService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Rent Roll
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    if (this.rentRollDisplayedColumns['isRent']) {
      this.rentRollDisplayedColumns['isRent'].checkboxEditable = this.isAdmin;
    }
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.initializeChartOfAccounts();
    this.loadRentRoll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] || changes['refreshTrigger']) {
      this.loadRentRoll();
      return;
    }

    if (changes['searchDateRange']) {
      this.rebuildRentRollRowsFromCachedAgreements();
      this.loadExistingBillsForDateRange(this.loadSequence);
    }
  }

  loadRentRoll(): void {
    const currentLoadSequence = ++this.loadSequence;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'rentRoll');

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
        this.rebuildRentRollRowsFromCachedAgreements();
        this.loadExistingBillsForDateRange(currentLoadSequence);
        this.markViewForCheck();
      },
      error: () => {
        if (this.shouldIgnoreLoadResult(currentLoadSequence)) {
          return;
        }
        this.isServiceError = true;
        this.propertyAgreements = [];
        this.rentRollRows = [];
        this.rentRollRowsDisplayAll = [];
        this.rentRollRowsDisplay = [];
        this.existingBillByMatchKey.clear();
        this.existingBillByAgreementLinePeriodKey.clear();
        this.selectedRentRollRows = [];
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

  rebuildRentRollRowsFromCachedAgreements(): void {
    this.rentRollRows = this.mappingService.mapRentRollRowsFromAgreements(this.propertyAgreements, this.searchDateRange);
    this.rentRollRowsDisplayAll = this.rentRollRows.map(row => ({
      propertyId: row.propertyId,
      agreementLineId: row.agreementLineId,
      billDate: row.billDate,
      propertyCode: row.propertyCode || '',
      vendorName: row.vendorName || '—',
      chartOfAccountDisplay: this.getChartOfAccountDisplay(row),
      terms: row.terms || '—',
      billDateDisplay: this.getBillDateDisplayForRow(row),
      dueDateDisplay: this.getDueDateDisplayForRow(row),
      depositAmountDisplay: this.getRentRollAmountDisplay(row.depositAmount),
      oneTimeAmountDisplay: this.getRentRollAmountDisplay(row.oneTimeAmount),
      monthlyAmountDisplay: this.getRentRollAmountDisplay(row.monthlyAmount),
      dailyAmountDisplay: this.getRentRollAmountDisplay(row.dailyAmount),
      totalAmountDisplay: this.getRentRollAmountDisplay(row.totalAmount),
      depositAmountValue: Number(row.depositAmount || 0),
      oneTimeAmountValue: Number(row.oneTimeAmount || 0),
      monthlyAmountValue: Number(row.monthlyAmount || 0),
      dailyAmountValue: Number(row.dailyAmount || 0),
      totalAmountValue: Number(row.totalAmount || 0),
      isRent: !!row.isRent,
      notes: row.notes || '',
      hasExistingBill: this.hasExistingBillForRow(row),
      invoiceDisabled: false
    }));
    this.applyCreatedBillVisibilityFilter();
    this.rentRollTotalAmount = this.mappingService.sumRentRollTotal(this.rentRollRows);
  }

  get hasRentRollRows(): boolean {
    return this.getVisibleRentRollRows().length > 0;
  }

  get rentRollTotalsRow(): { [columnName: string]: string } | undefined {
    const visibleRows = this.getVisibleRentRollDisplayRows();
    if (visibleRows.length === 0) {
      return undefined;
    }
    const visibleTotalAmount = visibleRows.reduce((sum, row) => sum + Number(row.totalAmountValue || 0), 0);
    return {
      propertyCode: 'Grand Total',
      totalAmountDisplay: this.getRentRollAmountDisplay(visibleTotalAmount)
    };
  }

  getRentRollAmountDisplay(value: number): string {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return '—';
    }
    return this.formatter.currencyUsd(numericValue);
  }

  onCreateBill(rowDisplay: RentRollRowDisplay): void {
    const row = this.resolveRentRollRow(rowDisplay);
    if (!row) {
      return;
    }
    if (!this.hasAgreementLineIdentifier(row)) {
      this.toastr.error('Unable to create bill: missing agreement line identifier.', 'Error');
      return;
    }
    const existingBill = this.getExistingBillMatchForRow(row);
    if (existingBill?.receiptId) {
      this.openBill.emit({
        receiptId: existingBill.receiptId,
        officeId: existingBill.officeId ?? row.officeId ?? null,
        propertyId: existingBill.propertyId || row.propertyId || null,
        agreementLineId: this.toAgreementLineIdNumber(row.agreementLineId),
        notes: (row.notes || '').trim() || null
      });
      return;
    }
    const request = this.buildCreateBillRequest(row, rowDisplay);
    if (!request) {
      return;
    }
    this.createBill.emit(request);
  }

  onSelectionSet(selection: SelectionModel<unknown> | null | undefined): void {
    const selected = Array.isArray(selection?.selected) ? selection.selected : [];
    this.selectedRentRollRows = selected
      .filter(item => !!item)
      .map(item => item as RentRollRowDisplay);
    this.markViewForCheck();
  }

  onCreateSelectedBills(): void {
    const selectedRows = this.selectedRentRollRows
      .map(rowDisplay => ({ rowDisplay, row: this.resolveRentRollRow(rowDisplay) }))
      .filter((item): item is { rowDisplay: RentRollRowDisplay; row: RentRollRow } => !!item.row)
      .filter(item => !this.hasExistingBillForRow(item.row));

    const uniqueAgreementLines = new Set<string>();
    let skippedMissingAgreementLineCount = 0;
    const requests: RentRollCreateBillRequest[] = [];

    selectedRows.forEach(item => {
      if (!this.hasAgreementLineIdentifier(item.row)) {
        skippedMissingAgreementLineCount++;
        return;
      }
      const agreementLineSelectionKey = this.buildAgreementLineSelectionKey(item.row);
      if (uniqueAgreementLines.has(agreementLineSelectionKey)) {
        return;
      }
      uniqueAgreementLines.add(agreementLineSelectionKey);
      const request = this.buildCreateBillRequest(item.row, item.rowDisplay);
      if (request) {
        requests.push(request);
      }
    });

    if (skippedMissingAgreementLineCount > 0) {
      this.toastr.warning(
        `Skipped ${skippedMissingAgreementLineCount} selected row${skippedMissingAgreementLineCount === 1 ? '' : 's'} with no agreement line id.`,
        'Create Bills'
      );
    }

    if (requests.length === 0) {
      this.toastr.info('All selected rows already have bills in the selected date range.', 'No New Bills');
      return;
    }
    this.createBills.emit(requests);
  }

  onAddAgreementLineFromTop(): void {
    const selectedRow = this.selectedRentRollRows.length > 0
      ? this.resolveRentRollRow(this.selectedRentRollRows[0])
      : null;
    const fallbackRow = this.rentRollRowsDisplay.length > 0
      ? this.resolveRentRollRow(this.rentRollRowsDisplay[0])
      : null;
    this.openAddAgreementLineDialog(selectedRow || fallbackRow);
  }

  get isCreateBillsTopButtonDisabled(): boolean {
    if (this.selectedRentRollRows.length === 0) {
      return true;
    }
    return !this.selectedRentRollRows.some(rowDisplay => {
      const row = this.resolveRentRollRow(rowDisplay);
      return !!row && !this.hasExistingBillForRow(row);
    });
  }

  onToggleShowCreatedBills(): void {
    this.showCreatedBills = !this.showCreatedBills;
    this.applyCreatedBillVisibilityFilter();
    this.markViewForCheck();
  }

  onEditAgreementLine(rowDisplay: RentRollRowDisplay): void {
    const row = this.resolveRentRollRow(rowDisplay);
    if (!row) {
      return;
    }
    const dialogRef = this.dialog.open(RentRollEditLineDialogComponent, {
      width: '88rem',
      data: {
        propertyCode: row.propertyCode,
        officeId: row.officeId,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        terms: row.terms,
        chartOfAccountId: row.chartOfAccountId,
        startDate: row.startDate,
        endDate: row.endDate,
        depositAmount: row.depositAmount,
        oneTimeAmount: row.oneTimeAmount,
        monthlyAmount: row.monthlyAmount,
        dailyAmount: row.dailyAmount,
        isRent: row.isRent,
        notes: row.notes
      }
    });

    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (!result) {
        return;
      }
      this.updateAgreementLine(row, {
        vendorId: result.vendorId,
        chartOfAccountId: result.chartOfAccountId,
        startDate: result.startDate,
        endDate: result.endDate,
        deposit: result.deposit,
        oneTime: result.oneTime,
        monthly: result.monthly,
        daily: result.daily,
        isRent: result.isRent,
        notes: result.notes,
        title: null
      }, {
        vendorName: result.vendorName,
        terms: result.terms
      });
    });
  }

  openAddAgreementLineDialog(row: RentRollRow | null): void {
    const dialogRef = this.dialog.open(RentRollEditLineDialogComponent, {
      width: '88rem',
      data: {
        propertyId: row?.propertyId ?? null,
        propertyCode: row?.propertyCode || '',
        allowPropertySelection: true,
        officeId: row?.officeId ?? this.officeId ?? null,
        vendorId: null,
        vendorName: '',
        terms: 'Due on receipt',
        chartOfAccountId: null,
        startDate: null,
        endDate: null,
        depositAmount: 0,
        oneTimeAmount: 0,
        monthlyAmount: 0,
        dailyAmount: 0,
        isRent: false,
        notes: ''
      } as RentRollEditLineDialogData
    });

    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (!result) {
        return;
      }
      this.createAgreementLine(result);
    });
  }

  createAgreementLine(result: RentRollEditLineDialogResult): void {
    const propertyId = (result.propertyId || '').trim();
    if (!propertyId) {
      this.toastr.error('Unable to add agreement line: missing property.', 'Error');
      return;
    }

    this.propertyAgreementService.getPropertyAgreement(propertyId).pipe(take(1)).subscribe({
      next: agreement => {
        const newLine: PropertyAgreementLineRequest = {
          agreementLineId: null,
          title: null,
          vendorId: result.vendorId ?? null,
          chartOfAccountId: result.chartOfAccountId ?? null,
          startDate: result.startDate ?? null,
          endDate: result.endDate ?? null,
          deposit: result.deposit ?? 0,
          oneTime: result.oneTime ?? 0,
          monthly: result.monthly ?? 0,
          daily: result.daily ?? 0,
          isRent: !!result.isRent,
          notes: (result.notes || '').trim() || null
        };

        if (!agreement) {
          const createPayload: PropertyAgreementRequest = {
            propertyId,
            managementFeeTypeId: ManagementFeeType.FlatRate,
            flatRateAmount: 0,
            agreementLines: [newLine]
          };
          this.propertyAgreementService.createPropertyAgreement(createPayload).pipe(take(1)).subscribe({
            next: () => {
              this.toastr.success('Agreement line added.', 'Success');
              this.loadRentRoll();
            },
            error: () => {
              this.toastr.error('Unable to create property agreement and add line.', 'Error');
            }
          });
          return;
        }

        const existingLines = [...(agreement.agreementLines || [])];
        const updatePayload: PropertyAgreementRequest = {
          ...agreement,
          agreementLines: [...existingLines, newLine]
        };

        this.propertyAgreementService.updatePropertyAgreement(updatePayload).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('Agreement line added.', 'Success');
            this.loadRentRoll();
          },
          error: () => {
            this.toastr.error('Unable to add agreement line.', 'Error');
          }
        });
      },
      error: () => {
        this.toastr.error('Unable to load property agreement.', 'Error');
      }
    });
  }

  onRentRollCheckboxChange(event: RentRollRowDisplay & { __changedCheckboxColumn?: string; __checkboxValue?: boolean }): void {
    if (!this.isAdmin) {
      return;
    }
    const changedCheckboxColumn = String(event.__changedCheckboxColumn || '').trim();
    if (changedCheckboxColumn !== 'isRent') {
      return;
    }
    const row = this.resolveRentRollRow(event);
    if (!row) {
      return;
    }
    const nextIsRent = event.__checkboxValue === true;
    if (nextIsRent === !!row.isRent) {
      return;
    }
    this.updateAgreementLine(row, {
      vendorId: row.vendorId,
      chartOfAccountId: row.chartOfAccountId,
      startDate: row.startDate,
      endDate: row.endDate,
      deposit: row.depositAmount,
      oneTime: row.oneTimeAmount,
      monthly: row.monthlyAmount,
      daily: row.dailyAmount,
      isRent: nextIsRent,
      notes: row.notes || null,
      title: row.title || null
    }, {
      vendorName: row.vendorName,
      terms: row.terms
    });
  }

  onDeleteAgreementLine(rowDisplay: RentRollRowDisplay): void {
    const row = this.resolveRentRollRow(rowDisplay);
    if (!row) {
      return;
    }
    this.deleteAgreementLine(row);
  }

  onPropertyCodeClick(rowDisplay: RentRollRowDisplay): void {
    const propertyId = (rowDisplay?.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [propertyId]));
  }

  resolveRentRollRow(rowDisplay: RentRollRowDisplay): RentRollRow | null {
    const propertyId = (rowDisplay?.propertyId || '').trim();
    const agreementLineId = rowDisplay?.agreementLineId;
    const billDate = (rowDisplay?.billDate || '').trim() || null;
    const match = this.rentRollRows.find(row =>
      row.propertyId === propertyId
      && (row.agreementLineId ?? null) === (agreementLineId ?? null)
      && ((row.billDate || '').trim() || null) === billDate
    );
    return match || null;
  }

  buildCreateBillRequest(row: RentRollRow, rowDisplay?: RentRollRowDisplay): RentRollCreateBillRequest | null {
    const description = (row.vendorName || '').trim() || `Rent Roll - ${row.propertyCode}`;
    const dueDate = this.resolveDueDateForRow(row);
    const amount = Number(rowDisplay?.totalAmountValue ?? row.totalAmount ?? 0);
    return {
      propertyId: row.propertyId,
      officeId: row.officeId,
      agreementLineId: row.agreementLineId,
      notes: row.notes || null,
      billDate: row.billDate,
      dueDate,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      chartOfAccountId: row.chartOfAccountId,
      terms: row.terms,
      description,
      amount: Number.isFinite(amount) ? amount : Number(row.totalAmount || 0)
    };
  }

  initializeChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
      this.chartOfAccounts = accounts || [];
      this.rebuildRentRollRowsFromCachedAgreements();
      this.markViewForCheck();
    });
  }

  getChartOfAccountDisplay(row: RentRollRow): string {
    if (row.chartOfAccountId == null) {
      return '—';
    }
    const matchingAccount = this.chartOfAccounts.find(account =>
      account.accountId === row.chartOfAccountId
      && (row.officeId == null || account.officeId === row.officeId)
    ) || this.chartOfAccounts.find(account => account.accountId === row.chartOfAccountId);
    return this.utilityService.getChartOfAccountDropdownLabel(matchingAccount ?? null, row.chartOfAccountId) || '—';
  }

  applyCreatedBillVisibilityFilter(): void {
    this.rentRollRowsDisplay = this.showCreatedBills
      ? [...this.rentRollRowsDisplayAll]
      : this.rentRollRowsDisplayAll.filter(row => !row.hasExistingBill);
    this.selectedRentRollRows = [];
  }

  getVisibleRentRollRows(): RentRollRow[] {
    return this.showCreatedBills
      ? this.rentRollRows
      : this.rentRollRows.filter(row => !this.hasExistingBillForRow(row));
  }

  getVisibleRentRollDisplayRows(): RentRollRowDisplay[] {
    return this.showCreatedBills
      ? this.rentRollRowsDisplayAll
      : this.rentRollRowsDisplayAll.filter(row => !row.hasExistingBill);
  }

  loadExistingBillsForDateRange(loadSequence: number): void {
    const request = this.buildBillSearchRequest();
    if (!request) {
      this.existingBillByMatchKey.clear();
      this.existingBillByAgreementLinePeriodKey.clear();
      this.rebuildRentRollRowsFromCachedAgreements();
      this.markViewForCheck();
      return;
    }

    this.receiptService.searchReceipts(request).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: receipts => {
        if (this.shouldIgnoreLoadResult(loadSequence)) {
          return;
        }
        this.existingBillByMatchKey = this.buildExistingBillMatchKeys(receipts || []);
        this.existingBillByAgreementLinePeriodKey = this.buildExistingBillByAgreementLinePeriodKeys(receipts || []);
        this.rebuildRentRollRowsFromCachedAgreements();
        this.markViewForCheck();
      },
      error: () => {
        if (this.shouldIgnoreLoadResult(loadSequence)) {
          return;
        }
        this.existingBillByMatchKey.clear();
        this.existingBillByAgreementLinePeriodKey.clear();
        this.rebuildRentRollRowsFromCachedAgreements();
        this.markViewForCheck();
      }
    });
  }

  buildBillSearchRequest(): MaintenanceListSearchRequest | null {
    const officeIds = this.resolveOfficeIdsForBillSearch();
    if (officeIds.length === 0) {
      return null;
    }
    return {
      officeIds,
      startDate: this.searchDateRange.startDate ?? null,
      endDate: this.searchDateRange.endDate ?? null,
      includeInactive: false,
      receiptKind: 1
    };
  }

  resolveOfficeIdsForBillSearch(): number[] {
    const explicitOfficeId = Number(this.officeId || 0);
    if (Number.isFinite(explicitOfficeId) && explicitOfficeId > 0) {
      return [explicitOfficeId];
    }
    const officeIds = new Set<number>();
    (this.propertyAgreements || []).forEach(agreement => {
      const officeId = Number(agreement.officeId || 0);
      if (Number.isFinite(officeId) && officeId > 0) {
        officeIds.add(officeId);
      }
    });
    return Array.from(officeIds.values());
  }

  buildExistingBillMatchKeys(receipts: ReceiptResponse[]): Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }> {
    const keys = new Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }>();
    (receipts || []).forEach(receipt => {
      const vendorId = (receipt.vendorId || '').trim().toLowerCase();
      const propertyIds = (receipt.propertyIds || []).map(propertyId => (propertyId || '').trim()).filter(id => !!id);
      if (!vendorId || propertyIds.length === 0) {
        return;
      }

      (receipt.splits || []).forEach(split => {
        const chartOfAccountId = Number(split.chartOfAccountId || 0);
        const amountCents = Math.round(Number(split.amount || 0) * 100);
        const billPeriod = this.resolveBillMatchPeriod(receipt.receiptDate);
        if (!Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0 || !Number.isFinite(amountCents) || amountCents <= 0) {
          return;
        }
        if (!billPeriod) {
          return;
        }
        propertyIds.forEach(propertyId => {
          const key = this.buildBillMatchKey(propertyId, vendorId, chartOfAccountId, amountCents, billPeriod);
          if (!keys.has(key)) {
            keys.set(key, {
              billDate: receipt.receiptDate ?? null,
              dueDate: receipt.dueDate ?? null,
              receiptId: receipt.receiptId ?? null,
              officeId: receipt.officeId ?? null,
              propertyId: propertyId ?? null
            });
          }
        });
      });
    });
    return keys;
  }

  hasExistingBillForRow(row: RentRollRow): boolean {
    const agreementLineMatch = this.getExistingBillByAgreementLineMatchForRow(row);
    if (agreementLineMatch) {
      return true;
    }

    const propertyId = (row.propertyId || '').trim();
    const vendorId = (row.vendorId || '').trim().toLowerCase();
    const chartOfAccountId = Number(row.chartOfAccountId || 0);
    const amountCents = Math.round(Number(row.totalAmount || 0) * 100);
    const billPeriod = this.resolveBillMatchPeriod(row.billDate) || this.resolveBillMatchPeriod(this.resolveDefaultBillDateForDisplay());
    if (!propertyId || !vendorId || chartOfAccountId <= 0 || amountCents <= 0 || !billPeriod) {
      return false;
    }
    const key = this.buildBillMatchKey(propertyId, vendorId, chartOfAccountId, amountCents, billPeriod);
    return this.existingBillByMatchKey.has(key);
  }

  buildBillMatchKey(propertyId: string, vendorId: string, chartOfAccountId: number, amountCents: number, billPeriod: string): string {
    return `${propertyId.trim().toLowerCase()}|${vendorId.trim().toLowerCase()}|${chartOfAccountId}|${amountCents}|${billPeriod.trim()}`;
  }

  getBillDateDisplayForRow(row: RentRollRow): string {
    const match = this.getExistingBillMatchForRow(row);
    const rawDate = match?.billDate ?? row.billDate ?? this.resolveDefaultBillDateForDisplay();
    return this.formatter.formatDateString(rawDate) || '—';
  }

  getDueDateDisplayForRow(row: RentRollRow): string {
    const match = this.getExistingBillMatchForRow(row);
    const rawDate = match?.dueDate ?? this.resolveDueDateForRow(row);
    return this.formatter.formatDateString(rawDate) || '—';
  }

  getExistingBillMatchForRow(row: RentRollRow): { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null } | null {
    const agreementLineMatch = this.getExistingBillByAgreementLineMatchForRow(row);
    if (agreementLineMatch) {
      return agreementLineMatch;
    }

    const propertyId = (row.propertyId || '').trim();
    const vendorId = (row.vendorId || '').trim().toLowerCase();
    const chartOfAccountId = Number(row.chartOfAccountId || 0);
    const amountCents = Math.round(Number(row.totalAmount || 0) * 100);
    const billPeriod = this.resolveBillMatchPeriod(row.billDate) || this.resolveBillMatchPeriod(this.resolveDefaultBillDateForDisplay());
    if (!propertyId || !vendorId || chartOfAccountId <= 0 || amountCents <= 0 || !billPeriod) {
      return null;
    }
    const key = this.buildBillMatchKey(propertyId, vendorId, chartOfAccountId, amountCents, billPeriod);
    return this.existingBillByMatchKey.get(key) || null;
  }

  buildExistingBillByAgreementLinePeriodKeys(receipts: ReceiptResponse[]): Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }> {
    const keys = new Map<string, { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null }>();
    (receipts || []).forEach(receipt => {
      const agreementLineId = this.toAgreementLineIdNumber(receipt.agreementLineId);
      const billPeriod = this.resolveBillMatchPeriod(receipt.receiptDate);
      const propertyIds = (receipt.propertyIds || []).map(propertyId => (propertyId || '').trim()).filter(id => !!id);
      if (!agreementLineId || !billPeriod || propertyIds.length === 0) {
        return;
      }

      propertyIds.forEach(propertyId => {
        const key = this.buildAgreementLinePeriodKey(propertyId, agreementLineId, billPeriod);
        if (!keys.has(key)) {
          keys.set(key, {
            billDate: receipt.receiptDate ?? null,
            dueDate: receipt.dueDate ?? null,
            receiptId: receipt.receiptId ?? null,
            officeId: receipt.officeId ?? null,
            propertyId: propertyId ?? null
          });
        }
      });
    });
    return keys;
  }

  getExistingBillByAgreementLineMatchForRow(row: RentRollRow): { billDate: string | null; dueDate: string | null; receiptId: string | null; officeId: number | null; propertyId: string | null } | null {
    const propertyId = (row.propertyId || '').trim();
    const agreementLineId = this.toAgreementLineIdNumber(row.agreementLineId);
    const billPeriod = this.resolveBillMatchPeriod(row.billDate) || this.resolveBillMatchPeriod(this.resolveDefaultBillDateForDisplay());
    if (!propertyId || !agreementLineId || !billPeriod) {
      return null;
    }

    const key = this.buildAgreementLinePeriodKey(propertyId, agreementLineId, billPeriod);
    return this.existingBillByAgreementLinePeriodKey.get(key) || null;
  }

  buildAgreementLinePeriodKey(propertyId: string, agreementLineId: number, billPeriod: string): string {
    return `${propertyId.trim().toLowerCase()}|${agreementLineId}|${billPeriod.trim()}`;
  }

  resolveDefaultBillDateForDisplay(): string | null {
    return this.searchDateRange.endDate || this.searchDateRange.startDate || this.utilityService.formatDateOnlyForApi(new Date());
  }

  resolveDueDateForRow(row: RentRollRow): string | null {
    const billDate = this.normalizeDateOnlyString(row.billDate) || this.normalizeDateOnlyString(this.resolveDefaultBillDateForDisplay());
    if (!billDate) {
      return null;
    }
    if (row.isRent) {
      const billDateValue = this.utilityService.parseDateOnlyStringToDate(billDate);
      if (!billDateValue) {
        return billDate;
      }
      const startDate = this.utilityService.parseDateOnlyStringToDate(row.startDate);
      const isMoveInMonth = !!startDate
        && startDate.getFullYear() === billDateValue.getFullYear()
        && startDate.getMonth() === billDateValue.getMonth();
      if (isMoveInMonth && startDate.getDate() > 1) {
        return billDate;
      }
      const firstOfMonth = new Date(billDateValue.getFullYear(), billDateValue.getMonth(), 1);
      return this.utilityService.formatDateOnlyForApi(firstOfMonth) || billDate;
    }
    const netDays = this.resolveNetDaysFromTerms(row.terms);
    if (netDays <= 0) {
      return billDate;
    }
    const billDateValue = this.utilityService.parseDateOnlyStringToDate(billDate);
    if (!billDateValue) {
      return billDate;
    }
    const dueDateValue = this.utilityService.addCalendarDaysToDate(billDateValue, netDays);
    return this.utilityService.formatDateOnlyForApi(dueDateValue || billDateValue) || billDate;
  }

  resolveNetDaysFromTerms(terms: string | null | undefined): number {
    const normalizedTerms = String(terms || '').trim();
    if (!normalizedTerms) {
      return 0;
    }
    const netMatch = /\bnet\s*-?\s*(\d+)\b/i.exec(normalizedTerms);
    if (!netMatch) {
      return 0;
    }
    const days = Number(netMatch[1]);
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    return Math.trunc(days);
  }

  normalizeDateOnlyString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(value);
    if (!parsed) {
      return null;
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
  }

  toAgreementLineIdNumber(value: string | number | null | undefined): number | null {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.trunc(parsed);
  }

  hasAgreementLineIdentifier(row: RentRollRow): boolean {
    const agreementLineId = String(row?.agreementLineId || '').trim();
    return agreementLineId.length > 0;
  }

  buildAgreementLineSelectionKey(row: RentRollRow): string {
    const propertyId = String(row?.propertyId || '').trim().toLowerCase();
    const agreementLineId = String(row?.agreementLineId || '').trim().toLowerCase();
    return `${propertyId}|${agreementLineId}`;
  }

  resolveBillMatchPeriod(value: string | null | undefined): string | null {
    const normalizedDate = this.normalizeDateOnlyString(value);
    if (!normalizedDate) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(normalizedDate);
    if (!match) {
      return null;
    }
    return `${match[1]}-${match[2]}`;
  }

  updateAgreementLine(
    row: RentRollRow,
    updates: PropertyAgreementLineRequest,
    optimisticDisplayUpdates?: { vendorName?: string; terms?: string }
  ): void {
    const propertyId = (row.propertyId || '').trim();
    const agreementLineId = row.agreementLineId;
    if (!propertyId || !agreementLineId) {
      return;
    }

    const propertyAgreementsSnapshot = this.clonePropertyAgreements();
    this.applyOptimisticAgreementLineUpdate(row, updates, optimisticDisplayUpdates);

    this.propertyAgreementService.getPropertyAgreement(propertyId).pipe(take(1)).subscribe({
      next: agreement => {
        if (!agreement) {
          this.restorePropertyAgreementsFromSnapshot(propertyAgreementsSnapshot);
          return;
        }
        const lines = [...(agreement.agreementLines || [])];
        const lineIndex = lines.findIndex(line => (line.agreementLineId || null) === agreementLineId);
        if (lineIndex < 0) {
          this.restorePropertyAgreementsFromSnapshot(propertyAgreementsSnapshot);
          return;
        }
        lines[lineIndex] = {
          ...lines[lineIndex],
          ...updates
        };
        const payload: PropertyAgreementRequest = {
          ...agreement,
          agreementLines: lines
        };
        this.propertyAgreementService.updatePropertyAgreement(payload).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('Agreement line updated.', 'Success');
          },
          error: () => {
            this.restorePropertyAgreementsFromSnapshot(propertyAgreementsSnapshot);
            this.toastr.error('Unable to update agreement line.', 'Error');
          }
        });
      },
      error: () => {
        this.restorePropertyAgreementsFromSnapshot(propertyAgreementsSnapshot);
        this.toastr.error('Unable to update agreement line.', 'Error');
      }
    });
  }

  deleteAgreementLine(row: RentRollRow): void {
    const propertyId = (row.propertyId || '').trim();
    const agreementLineId = row.agreementLineId;
    if (!propertyId || !agreementLineId) {
      return;
    }

    this.propertyAgreementService.getPropertyAgreement(propertyId).pipe(take(1)).subscribe({
      next: agreement => {
        if (!agreement) {
          return;
        }
        const lines = [...(agreement.agreementLines || [])]
          .filter(line => (line.agreementLineId || null) !== agreementLineId);
        const payload: PropertyAgreementRequest = {
          ...agreement,
          agreementLines: lines
        };
        this.propertyAgreementService.updatePropertyAgreement(payload).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('Agreement line deleted.', 'Success');
            this.loadRentRoll();
          },
          error: () => {
            this.toastr.error('Unable to delete agreement line.', 'Error');
          }
        });
      }
    });
  }

  shouldIgnoreLoadResult(loadSequence: number): boolean {
    return this.loadSequence !== loadSequence;
  }

  clonePropertyAgreements(): RentRollPropertyAgreement[] {
    return (this.propertyAgreements || []).map(propertyAgreement => ({
      ...propertyAgreement,
      agreementLines: (propertyAgreement.agreementLines || []).map(line => ({ ...line }))
    }));
  }

  restorePropertyAgreementsFromSnapshot(snapshot: RentRollPropertyAgreement[]): void {
    this.propertyAgreements = snapshot;
    this.rebuildRentRollRowsFromCachedAgreements();
    this.markViewForCheck();
  }

  applyOptimisticAgreementLineUpdate(
    row: RentRollRow,
    updates: PropertyAgreementLineRequest,
    optimisticDisplayUpdates?: { vendorName?: string; terms?: string }
  ): void {
    const propertyId = (row.propertyId || '').trim();
    const agreementLineId = row.agreementLineId;
    if (!propertyId || !agreementLineId) {
      return;
    }

    const propertyAgreement = (this.propertyAgreements || []).find(item => (item.propertyId || '').trim() === propertyId);
    const agreementLines = propertyAgreement?.agreementLines || [];
    const line = agreementLines.find(item => (item.agreementLineId || null) === agreementLineId) as PropertyAgreementLineResponse | undefined;
    if (!line) {
      return;
    }

    line.vendorId = updates.vendorId ?? null;
    line.chartOfAccountId = updates.chartOfAccountId ?? null;
    line.startDate = updates.startDate ?? null;
    line.endDate = updates.endDate ?? null;
    line.deposit = updates.deposit ?? 0;
    line.oneTime = updates.oneTime ?? 0;
    line.monthly = updates.monthly ?? 0;
    line.daily = updates.daily ?? 0;
    line.isRent = updates.isRent ?? false;
    line.notes = updates.notes ?? null;
    line.title = updates.title ?? null;
    if (optimisticDisplayUpdates?.vendorName != null) {
      line.vendorName = optimisticDisplayUpdates.vendorName;
    }
    if (optimisticDisplayUpdates?.terms != null) {
      line.terms = optimisticDisplayUpdates.terms;
    }

    this.rebuildRentRollRowsFromCachedAgreements();
    this.markViewForCheck();
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
