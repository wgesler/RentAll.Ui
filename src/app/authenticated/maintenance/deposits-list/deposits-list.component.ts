import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { DepositDisplayList, DepositResponse, DepositSelection } from '../models/deposit.model';
import { DepositService } from '../services/deposit.service';

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
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() embeddedInAccounting = false;
  @Input() refreshTrigger = 0;
  @Output() depositSelect = new EventEmitter<DepositSelection>();
  @Output() journalEntriesChanged = new EventEmitter<void>();

  isPageReady = false;
  isServiceError = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['deposits']));
  destroy$ = new Subject<void>();
  showInactive = false;
  deposits: DepositResponse[] = [];
  depositsDisplay: DepositDisplayList[] = [];
  allDeposits: DepositDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();
  depositsLoadId = 0;
  lastDepositSearchKey: string | null = null;
  depositSearchInFlightKey: string | null = null;

  readonly depositDisplayedColumns: ColumnSet = {
    depositCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    depositDate: { displayAs: 'Deposit Date', wrap: false, maxWidth: '15ch', alignment: 'center' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    bankAccountDisplay: { displayAs: 'Bank Account', wrap: true, maxWidth: '25ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    accountDisplay: { displayAs: 'Account', wrap: true, maxWidth: '20ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '25ch' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    createdBy: { displayAs: 'Created By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  constructor(
    private depositService: DepositService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private authService: AuthService,
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Deposits List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadPropertyLookup();
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

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange) {
      this.loadDepositsForCurrentSearchCriteria();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDepositsForCurrentSearchCriteria(force = false): void {
    this.getDeposits(force);
  }

  getDeposits(force = false): void {
    if (!this.canRunSearch()) {
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

    const loadId = ++this.depositsLoadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'deposits');

    this.depositService.searchDeposits(this.buildSearchRequest()).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposits');
        if (this.depositSearchInFlightKey === searchKey) {
          this.depositSearchInFlightKey = null;
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
        this.allDeposits = this.mappingService.mapDepositDisplays(this.deposits);
        this.applyDepositDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.depositsLoadId !== loadId) {
          return;
        }
        this.isServiceError = true;
        this.deposits = [];
        this.allDeposits = [];
        this.depositsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addDeposit(): void {
    this.depositSelect.emit({
      depositId: null,
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
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  goToDeposit(event: DepositDisplayList): void {
    const selectedPropertyId = (event.propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .find(propertyId => propertyId.length > 0) || null;
    this.depositSelect.emit({
      depositId: event.depositId,
      officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
      propertyId: selectedPropertyId
    });
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
    this.markViewForCheck();
  }

  private canRunSearch(): boolean {
    const officeIds = this.buildSearchRequest().officeIds ?? [];
    return officeIds.length > 0;
  }

  private buildSearchRequest(): MaintenanceListSearchRequest {
    const officeIds = (this.searchRequest?.officeIds ?? [])
      .filter(id => id > 0);
    const resolvedOfficeIds = officeIds.length > 0
      ? officeIds
      : (this.officeId != null && this.officeId > 0 ? [this.officeId] : []);
    return {
      officeIds: resolvedOfficeIds,
      propertyId: this.searchRequest?.propertyId ?? this.property?.propertyId ?? null,
      isActive: this.showInactive ? null : true,
      includeInactive: this.showInactive,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: this.searchRequest?.endDate ?? null
    };
  }

  private buildDepositSearchKey(): string {
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

  private loadPropertyLookup(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
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

  private applyDepositDisplayMappings(): void {
    this.allDeposits = this.allDeposits.map(row => ({
      ...row,
      propertyCode: this.formatPropertyCodes(row.propertyIds)
    }));
  }

  private applyFilters(): void {
    this.depositsDisplay = this.allDeposits.filter(row => this.showInactive || row.isActive);
  }

  private formatPropertyCodes(propertyIds: string[] | undefined | null): string {
    const codes = (propertyIds || [])
      .map(propertyId => this.propertyCodeLookup.get(propertyId) || '')
      .filter(code => code.length > 0);
    return codes.join(', ');
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion
}
