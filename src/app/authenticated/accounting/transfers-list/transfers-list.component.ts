import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, merge, switchMap, take, takeUntil } from 'rxjs';
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
import { TransferDisplayList, TransferResponse, TransferSearchRequest, TransferSelection } from '../models/transfer.model';
import { TransferService } from '../services/transfer.service';

@Component({
  standalone: true,
  selector: 'app-transfers-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './transfers-list.component.html',
  styleUrl: './transfers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransfersListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() searchRequest?: TransferSearchRequest | null;
  @Input() embeddedInAccounting = false;
  @Input() refreshTrigger = 0;
  @Output() transferSelect = new EventEmitter<TransferSelection>();
  @Output() journalEntriesChanged = new EventEmitter<void>();

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['transfers']));
  destroy$ = new Subject<void>();
  showInactive = false;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  transfers: TransferResponse[] = [];
  transfersDisplay: TransferDisplayList[] = [];
  allTransfers: TransferDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();
  transfersLoadId = 0;
  lastTransferSearchKey: string | null = null;
  transferSearchInFlightKey: string | null = null;
  private cancelTransfersLoad$ = new Subject<void>();

  readonly transferDisplayedColumns: ColumnSet = {
    transferCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    transferDate: { displayAs: 'Transfer Date', wrap: false, maxWidth: '15ch', alignment: 'center' },
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
    private transferService: TransferService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private authService: AuthService,
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Transfers List
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadPropertyLookup();
    this.loadTransfersForCurrentSearchCriteria();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyTransferDisplayMappings();
      this.applyFilters();
      this.loadTransfersForCurrentSearchCriteria();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadTransfersForCurrentSearchCriteria(true);
    }

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange && this.embeddedInAccounting) {
      this.loadTransfersForCurrentSearchCriteria();
    }
  }

  getTransfers(force = false): void {
    if (this.embeddedInAccounting && !this.canRunAccountingSearch(this.searchRequest)) {
      this.lastTransferSearchKey = null;
      this.transferSearchInFlightKey = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transfers');
      this.markViewForCheck();
      return;
    }

    const searchKey = this.buildTransferSearchKey();
    if (!force && searchKey === this.lastTransferSearchKey) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transfers');
      this.markViewForCheck();
      return;
    }
    if (!force && searchKey === this.transferSearchInFlightKey) {
      return;
    }
    this.transferSearchInFlightKey = searchKey;

    this.cancelTransfersLoad$.next();
    const loadId = ++this.transfersLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'transfers');

    this.transferService.searchTransfers(this.buildSearchRequest()).pipe(
      take(1),
      takeUntil(merge(this.cancelTransfersLoad$, this.destroy$)),
      finalize(() => {
        if (this.transfersLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transfers');
          if (this.transferSearchInFlightKey === searchKey) {
            this.transferSearchInFlightKey = null;
          }
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: (transfers: TransferResponse[]) => {
        if (this.transfersLoadId !== loadId) {
          return;
        }
        this.lastTransferSearchKey = searchKey;
        this.transfers = transfers || [];
        try {
          this.allTransfers = this.mappingService.mapTransferDisplays(this.transfers);
        } catch {
          this.toastr.error('Unable to load transfers.', 'Error');
          this.transfers = [];
          this.allTransfers = [];
          this.transfersDisplay = [];
          this.markViewForCheck();
          return;
        }
        this.applyTransferDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.transfersLoadId !== loadId) {
          return;
        }
        this.toastr.error('Unable to load transfers.', 'Error');
        this.transfers = [];
        this.allTransfers = [];
        this.transfersDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addTransfer(): void {
    this.transferSelect.emit({
      transferId: null,
      officeId: this.officeId ?? null,
      propertyId: (this.property?.propertyId || '').trim() || null
    });
  }

  deleteTransfer(event: TransferDisplayList): void {
    this.transferService.deleteTransfer(event.transferId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Transfer deleted successfully', CommonMessage.Success);
        this.transfers = this.transfers.filter(transfer => transfer.transferId !== event.transferId);
        this.allTransfers = this.mappingService.mapTransferDisplays(this.transfers);
        this.applyTransferDisplayMappings();
        this.applyFilters();
        this.journalEntriesChanged.emit();
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to delete transfer.', 'Error');
        this.markViewForCheck();
      }
    });
  }

  goToTransfer(event: TransferDisplayList): void {
    const selectedPropertyId = (event.propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .find(propertyId => propertyId.length > 0) || null;
    this.transferSelect.emit({
      transferId: event.transferId,
      officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
      propertyId: selectedPropertyId
    });
  }
  //#endregion

  //#region Data Load Methods
  loadTransfersForCurrentSearchCriteria(force = false): void {
    if (!this.embeddedInAccounting) {
      this.getTransfers(force);
      return;
    }

    queueMicrotask(() => {
      if (!this.canRunAccountingSearch(this.searchRequest)) {
        this.lastTransferSearchKey = null;
        this.transferSearchInFlightKey = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transfers');
        this.markViewForCheck();
        return;
      }
      this.getTransfers(force);
    });
  }
  
  loadPropertyLookup(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (properties) => {
        this.propertyCodeLookup = new Map(
          (properties || []).map(property => [property.propertyId, property.propertyCode])
        );
        this.applyTransferDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.propertyCodeLookup = new Map();
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  buildSearchRequest(): TransferSearchRequest {
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

  buildTransferSearchKey(): string {
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

  onTransferCheckboxChange(event: TransferDisplayList): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as TransferDisplayList & { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as TransferDisplayList & { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as TransferDisplayList & { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyTransferIsActiveValue(event.transferId, nextValue);

    this.transferService.getTransferById(event.transferId).pipe(
      take(1),
      switchMap((transfer: TransferResponse) => this.transferService.updateTransfer(
        this.mappingService.mapTransferUpdateRequest(transfer, nextValue)
      ).pipe(take(1))),
      finalize(() => {
        this.applyFilters();
        this.markViewForCheck();
      })
    ).subscribe({
      next: (saved: TransferResponse) => {
        this.replaceTransferInCollections(saved);
        this.applyTransferDisplayMappings();
        this.applyFilters();
        this.toastr.success('Transfer updated.', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.applyTransferIsActiveValue(event.transferId, previousValue);
        this.toastr.error('Unable to update transfer.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.embeddedInAccounting) {
      this.loadTransfersForCurrentSearchCriteria(true);
      return;
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  canRunAccountingSearch(request?: TransferSearchRequest | null): boolean {
    if (!this.embeddedInAccounting || request == null) {
      return false;
    }

    return !!(
      request.startDate
      && request.endDate
      && this.resolveAccountingSearchOfficeIds(request).length > 0
    );
  }

  resolveAccountingSearchOfficeIds(request?: TransferSearchRequest | null): number[] {
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

  applyTransferDisplayMappings(): void {
    this.allTransfers = this.allTransfers.map(row => ({
      ...row,
      propertyCode: this.formatPropertyCodes(row.propertyIds)
    }));
  }

  applyFilters(): void {
    this.transfersDisplay = this.showInactive
      ? this.allTransfers.filter(row => row.isActive === false)
      : this.allTransfers.filter(row => row.isActive !== false);
  }

  formatPropertyCodes(propertyIds: string[] | undefined | null): string {
    const codes = (propertyIds || [])
      .map(propertyId => this.propertyCodeLookup.get(propertyId) || '')
      .filter(code => code.length > 0);
    return codes.join(', ');
  }

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.transferDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  applyTransferIsActiveValue(transferId: string, isActive: boolean): void {
    const updateRow = (row: { transferId: string; isActive: boolean }) => {
      if (row.transferId === transferId) {
        row.isActive = isActive;
      }
    };
    this.allTransfers.forEach(updateRow);
    this.transfers.forEach(updateRow);
    this.applyFilters();
  }

  replaceTransferInCollections(saved: TransferResponse): void {
    const savedId = (saved.transferId || '').trim();
    if (!savedId) {
      return;
    }
    const transferIndex = this.transfers.findIndex(transfer => transfer.transferId === savedId);
    if (transferIndex >= 0) {
      this.transfers = [
        ...this.transfers.slice(0, transferIndex),
        saved,
        ...this.transfers.slice(transferIndex + 1)
      ];
    }
    this.allTransfers = this.mappingService.mapTransferDisplays(this.transfers);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelTransfersLoad$.next();
    this.cancelTransfersLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
