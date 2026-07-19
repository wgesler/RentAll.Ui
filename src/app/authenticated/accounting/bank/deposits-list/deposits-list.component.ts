import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, merge, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { MappingService } from '../../../../services/mapping.service';
import { PropertyResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { DepositDisplayList, DepositResponse, DepositSearchRequest, DepositSelection, DepositSplit } from '../../models/deposit.model';
import { DepositService } from '../../services/deposit.service';

@Component({
  standalone: true,
  selector: 'app-deposits-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './deposits-list.component.html',
  styleUrl: './deposits-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepositsListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() searchRequest?: DepositSearchRequest | null;
  @Input() embeddedInAccounting = false;
  @Input() refreshTrigger = 0;
  @Output() depositSelect = new EventEmitter<DepositSelection>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  private depositService = inject(DepositService);
  private mappingService = inject(MappingService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('depositSplitsTemplate') depositSplitsTemplate?: TemplateRef<unknown>;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['deposits']));
  destroy$ = new Subject<void>();
  showInactive = false;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  deposits: DepositResponse[] = [];
  depositsDisplay: DepositDisplayList[] = [];
  allDeposits: DepositDisplayList[] = [];
  expandedDeposits = new Set<string>();
  isAllExpanded = false;
  propertyCodeLookup = new Map<string, string>();
  depositsLoadId = 0;
  lastDepositSearchKey: string | null = null;
  depositSearchInFlightKey: string | null = null;
  private cancelDepositsLoad$ = new Subject<void>();

  readonly depositDisplayedColumns: ColumnSet = {
    depositDate: { displayAs: 'Deposit Date', wrap: false, maxWidth: '15ch', alignment: 'center' },
    depositCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    contactName: { displayAs: 'Contact', wrap: false, maxWidth: '20ch' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    bankAccountDisplay: { displayAs: 'Bank Account', wrap: true, maxWidth: '25ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '20ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '18ch', alignment: 'right', headerAlignment: 'right' },
    createdBy: { displayAs: 'Created By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  readonly depositSplitDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: false, alignment: 'center', headerAlignment: 'center' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', wrap: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', wrap: false },
    contactName: { displayAs: 'Contact', maxWidth: '20ch', wrap: false },
    account: { displayAs: 'Account', maxWidth: '28ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '38ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '18ch', wrap: false, alignment: 'right', headerAlignment: 'right', sort: false }
  };

  //#region Deposits List
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadPropertyCodes();
    this.loadDepositsForCurrentSearchCriteria();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyDepositDisplayMappings();
      this.applyFilters();
      this.loadDepositsForCurrentSearchCriteria();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadDepositsForCurrentSearchCriteria(true);
    }

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange && this.embeddedInAccounting) {
      this.loadDepositsForCurrentSearchCriteria();
    }
  }

  getDeposits(force = false): void {
    if (this.embeddedInAccounting && !this.canRunAccountingSearch(this.searchRequest)) {
      this.lastDepositSearchKey = null;
      this.depositSearchInFlightKey = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposits');
      this.markViewForCheck();
      return;
    }

    const searchKey = this.buildDepositSearchKey();
    if (!force && searchKey === this.lastDepositSearchKey) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposits');
      this.markViewForCheck();
      return;
    }
    if (!force && searchKey === this.depositSearchInFlightKey) {
      return;
    }
    this.depositSearchInFlightKey = searchKey;

    this.cancelDepositsLoad$.next();
    const loadId = ++this.depositsLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'deposits');

    this.depositService.searchDeposits(this.buildSearchRequest()).pipe(
      take(1),
      takeUntil(merge(this.cancelDepositsLoad$, this.destroy$)),
      finalize(() => {
        if (this.depositsLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposits');
          if (this.depositSearchInFlightKey === searchKey) {
            this.depositSearchInFlightKey = null;
          }
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: (deposits: DepositResponse[]) => {
        if (this.depositsLoadId !== loadId) {
          return;
        }
        this.lastDepositSearchKey = searchKey;
        this.deposits = deposits || [];
        try {
          this.allDeposits = this.mappingService.mapDepositDisplays(this.deposits);
        } catch {
          this.toastr.error('Unable to load deposits.', 'Error');
          this.deposits = [];
          this.allDeposits = [];
          this.depositsDisplay = [];
          this.markViewForCheck();
          return;
        }
        this.applyDepositDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.depositsLoadId !== loadId) {
          return;
        }
        this.toastr.error('Unable to load deposits.', 'Error');
        this.deposits = [];
        this.allDeposits = [];
        this.depositsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addDeposit(): void {
    this.depositSelect.emit({
      depositId: 'new',
      officeId: this.officeId ?? null,
      propertyId: (this.property?.propertyId || '').trim() || null
    });
  }

  deleteDeposit(event: DepositDisplayList): void {
    this.depositService.deleteDeposit(event.depositId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Deposit deleted successfully', CommonMessage.Success);
        this.deposits = this.deposits.filter(deposit => deposit.depositId !== event.depositId);
        this.allDeposits = this.mappingService.mapDepositDisplays(this.deposits);
        this.applyDepositDisplayMappings();
        this.applyFilters();
        this.journalEntriesChanged.emit();
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to delete deposit.', 'Error');
        this.markViewForCheck();
      }
    });
  }

  goToDeposit(event: DepositDisplayList): void {
    const selectedPropertyId = (event.propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .find(propertyId => propertyId.length > 0) || null;
    const deposit = this.deposits.find(item => item.depositId === event.depositId) ?? null;
    this.depositSelect.emit({
      depositId: event.depositId,
      officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
      propertyId: selectedPropertyId,
      deposit
    });
  }
  //#endregion

  //#region Data Load Methods
  loadDepositsForCurrentSearchCriteria(force = false): void {
    if (!this.embeddedInAccounting) {
      this.getDeposits(force);
      return;
    }

    queueMicrotask(() => {
      if (!this.canRunAccountingSearch(this.searchRequest)) {
        this.lastDepositSearchKey = null;
        this.depositSearchInFlightKey = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposits');
        this.markViewForCheck();
        return;
      }
      this.getDeposits(force);
    });
  }
  
  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: (properties) => {
            this.propertyCodeLookup = new Map(
              (properties || []).map(property => [property.propertyId, property.propertyCode])
            );
            this.applyDepositDisplayMappings();
            this.applyFilters();
            this.markViewForCheck();
          },
          error: () => {
            this.propertyCodeLookup = new Map();
            this.markViewForCheck();
          }
        });
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  buildSearchRequest(): DepositSearchRequest {
    const request = this.searchRequest ?? { officeIds: [] };
    return {
      ...request,
      officeIds: this.resolveAccountingSearchOfficeIds(request),
      propertyId: request.propertyId ?? this.property?.propertyId ?? null,
      isActive: this.showInactive ? false : true,
      includeInactive: false,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    };
  }

  buildDepositSearchKey(): string {
    const request = this.buildSearchRequest();
    return JSON.stringify({
      officeIds: request.officeIds,
      propertyId: request.propertyId,
      isActive: request.isActive,
      includeInactive: request.includeInactive,
      startDate: request.startDate,
      endDate: request.endDate
    });
  }

  onDepositCheckboxChange(event: DepositDisplayList): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as DepositDisplayList & { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as DepositDisplayList & { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as DepositDisplayList & { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyDepositIsActiveValue(event.depositId, nextValue);

    this.depositService.getDepositById(event.depositId).pipe(
      take(1),
      switchMap((deposit: DepositResponse) => this.depositService.updateDeposit(
        this.mappingService.mapDepositUpdateRequest(deposit, nextValue)
      ).pipe(take(1))),
      finalize(() => {
        this.applyFilters();
        this.markViewForCheck();
      })
    ).subscribe({
      next: (saved: DepositResponse) => {
        this.replaceDepositInCollections(saved);
        this.applyDepositDisplayMappings();
        this.applyFilters();
        this.toastr.success('Deposit updated.', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.applyDepositIsActiveValue(event.depositId, previousValue);
        this.toastr.error('Unable to update deposit.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.embeddedInAccounting) {
      this.loadDepositsForCurrentSearchCriteria(true);
      return;
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  canRunAccountingSearch(request?: DepositSearchRequest | null): boolean {
    if (!this.embeddedInAccounting || request == null) {
      return false;
    }

    return !!(
      request.startDate
      && request.endDate
      && this.resolveAccountingSearchOfficeIds(request).length > 0
    );
  }

  resolveAccountingSearchOfficeIds(request?: DepositSearchRequest | null): number[] {
    const fromShell = (request?.officeIds ?? this.searchRequest?.officeIds ?? []).filter(id => id > 0);
    if (fromShell.length > 0) {
      return fromShell;
    }

    const scopedOfficeId = this.officeId;
    if (scopedOfficeId != null && Number.isFinite(Number(scopedOfficeId)) && Number(scopedOfficeId) > 0) {
      return [Number(scopedOfficeId)];
    }

    return [];
  }

  applyDepositDisplayMappings(): void {
    this.allDeposits = this.allDeposits.map(row => ({
      ...row,
      propertyCode: this.formatPropertyCodes(row.propertyIds)
    }));
  }

  applyFilters(): void {
    const filtered = this.showInactive
      ? this.allDeposits.filter(row => row.isActive === false)
      : this.allDeposits.filter(row => row.isActive !== false);

    this.depositsDisplay = filtered.map(deposit => ({
      ...deposit,
      expand: deposit.depositId,
      expanded: this.expandedDeposits.has(deposit.depositId),
      expandClick: (event: Event, item: DepositDisplayList) => {
        event.stopPropagation();
        if (this.expandedDeposits.has(item.depositId)) {
          this.expandedDeposits.delete(item.depositId);
        } else {
          this.expandedDeposits.add(item.depositId);
        }
        this.applyFilters();
        this.markViewForCheck();
      }
    }));

    this.updateIsAllExpanded();
  }

  get activeDepositDisplayedColumns(): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.depositDisplayedColumns
    };
  }

  getDepositSplitColumnNames(): string[] {
    return Object.keys(this.depositSplitDisplayedColumns);
  }

  getDepositSplitColumnWidth(columnName: string): string | null {
    if (this.isDepositSplitGrowColumn(columnName)) {
      return null;
    }

    return this.depositSplitDisplayedColumns[columnName]?.maxWidth ?? null;
  }

  getDepositSplitColumnMinWidth(columnName: string): string | null {
    if (this.isDepositSplitGrowColumn(columnName)) {
      return this.depositSplitDisplayedColumns[columnName]?.maxWidth ?? '38ch';
    }

    return this.getDepositSplitColumnWidth(columnName);
  }

  isDepositSplitGrowColumn(columnName: string): boolean {
    return columnName === 'description';
  }

  getDepositSplitColumnValue(split: DepositSplit, columnName: string, lineIndex: number): string {
    switch (columnName) {
      case 'lineNo':
        return String(lineIndex + 1);
      case 'propertyCode':
        return this.getSplitPropertyCode(split);
      case 'reservationCode':
        return (split.reservationCode || '').trim() || '—';
      case 'contactName':
        return (split.contactName || '').trim() || '—';
      case 'account':
        return (split.chartOfAccountDisplayName || '').trim() || '—';
      case 'description':
        return (split.description || '').trim() || '—';
      case 'amount':
        return this.formatter.currencyUsd(Number(split.amount) || 0);
      default:
        return '—';
    }
  }

  getSplitPropertyCode(split: DepositSplit): string {
    const code = (split.propertyCode || '').trim();
    if (code.length > 0) {
      return code;
    }

    const propertyId = (split.propertyId || '').trim();
    if (propertyId.length > 0) {
      return this.propertyCodeLookup.get(propertyId) || '—';
    }

    return '—';
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      this.depositsDisplay.forEach(deposit => this.expandedDeposits.add(deposit.depositId));
    } else {
      this.expandedDeposits.clear();
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  updateIsAllExpanded(): void {
    if (this.depositsDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }

    this.isAllExpanded = this.depositsDisplay.every(deposit => this.expandedDeposits.has(deposit.depositId));
  }

  formatPropertyCodes(propertyIds: string[] | undefined | null): string {
    const codes = (propertyIds || [])
      .map(propertyId => this.propertyCodeLookup.get(propertyId) || '')
      .filter(code => code.length > 0);
    return codes.join(', ');
  }

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.depositDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  applyDepositIsActiveValue(depositId: string, isActive: boolean): void {
    const updateRow = (row: { depositId: string; isActive: boolean }) => {
      if (row.depositId === depositId) {
        row.isActive = isActive;
      }
    };
    this.allDeposits.forEach(updateRow);
    this.deposits.forEach(updateRow);
    this.applyFilters();
  }

  replaceDepositInCollections(saved: DepositResponse): void {
    const savedId = (saved.depositId || '').trim();
    if (!savedId) {
      return;
    }
    const depositIndex = this.deposits.findIndex(deposit => deposit.depositId === savedId);
    if (depositIndex >= 0) {
      this.deposits = [
        ...this.deposits.slice(0, depositIndex),
        saved,
        ...this.deposits.slice(depositIndex + 1)
      ];
    }
    this.allDeposits = this.mappingService.mapDepositDisplays(this.deposits);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelDepositsLoad$.next();
    this.cancelDepositsLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
