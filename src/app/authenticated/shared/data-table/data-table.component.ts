import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, contentChild, EventEmitter, Input, NgZone, AfterViewInit, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { MatDateFormats, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Subject, take, takeUntil } from 'rxjs';
import { effectiveBedTypeIdForPropertySlot, getBedSizeType } from '../../properties/models/property-enums';
import { FormatterService } from '../../../../app/services/formatter-service';
import { AuthService } from '../../../services/auth.service';
import { getStatus } from '../../../enums/status.enum';
import { MaterialModule } from '../../../material.module';
import { GenericModalComponent } from '../modals/generic/generic-modal.component';
import { GenericModalData } from '../modals/generic/models/generic-modal-data';
import { PurposefulAny } from '../../../shared/models/amorphous';
import { ButtonData } from './models/button-data';
import { ColumnData, ColumnSet, defaultColumnData } from './models/column-data';
import { TableItem } from './models/table-item';
import { DataTableFilterActionsDirective } from './data-table-filter-actions.directive';

/** Match list display dates (`MM/dd/yyyy`) used by FormatterService.formatDateString. */
type DataTableStickySortDirection = 'asc' | 'desc' | '';

interface DataTableStickyState {
  enabled: boolean;
  tableName: string;
  filterText: string;
  sortColumn: string;
  sortDirection: DataTableStickySortDirection;
}

const DATA_TABLE_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'MM/dd/yyyy'
  },
  display: {
    dateInput: { year: 'numeric', month: '2-digit', day: '2-digit' },
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' }
  }
};

@Component({
    standalone: true,
    selector: 'app-data-table',
    imports: [CommonModule, MaterialModule, FormsModule],
    templateUrl: './data-table.component.html',
    styleUrls: ['./data-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideNativeDateAdapter(DATA_TABLE_DATE_FORMATS)]
})

export class DataTableComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input() data: PurposefulAny[];
  @Input() columns: ColumnSet;

  // NOTE: Update ngOnChanges references if you rename any of these.
  @Input() disableSort: boolean = false;
  @Input() hasButtonSelectAll: boolean = false;
  @Input() hasButtonTop: boolean = false;
  @Input() hasButtonTopSecondary: boolean = false;
  @Input() hasColumnDynamicAction: boolean = false;
  @Input() hasColumnIndex: boolean = false;
  @Input() hasFilter: boolean = false;
  @Input() hasSubDescription: boolean = false;
  @Input() hasToggleTop: boolean = false;

  @Input() hasActionsEnabled: boolean = true;
  @Input() hasActionsTopEnabled: boolean = true;

  @Input() hasActionsCancel: boolean = false;
  @Input() hasActionsCamera: boolean = false;
  @Input() hasActionsCalendar: boolean = false;
  @Input() hasActionsCopy: boolean = false;
  @Input() hasActionsLink: boolean = false;
  @Input() hasActionsUser: boolean = false;
  @Input() hasActionsRental: boolean = false;
  @Input() hasActionsOwner: boolean = false;
  @Input() hasActionsDelete: boolean = false;
  @Input() confirmDeleteBeforeEmit: boolean = true;
  @Input() deleteConfirmTitle: string = 'Delete?';
  @Input() deleteConfirmMessage: string = 'Are you sure you want to delete this item?';
  @Input() hasActionsDownload: boolean = false;
  @Input() downloadActionTooltip: string = 'View / Download';
  @Input() downloadActionColor: string = '#7E69B4';
  @Input() hasActionsEdit: boolean = false;
  @Input() hasActionsLock: boolean = false;
  @Input() hasActionsPayable: boolean = false;
  @Input() hasActionsInvoice: boolean = false;
  @Input() hasActionsInfo: boolean = false;
  @Input() userActionTooltip: string = 'Create User';
  @Input() userActionColor: string = '#7B1FA2';
  @Input() invoiceActionTooltip: string = 'Invoices';
  @Input() invoiceActionColor: string = '#2E7D32';
  @Input() payableActionColor: string = '#4CAF50';
  @Input() infoActionColor: string = '#1E88E5';
  @Input() hasActionsPrint: boolean = false;
  @Input() hasActionsQuote: boolean = false;
  @Input() hasActionsRestore: boolean = false;
  @Input() hasActionsClearTracking: boolean = false;
  @Input() hasActionsCheckAll: boolean = false;
  @Input() hasActionsRowClick: boolean = false;
  @Input() hasActionsSave: boolean = false;
  @Input() hasActionsSelect: boolean = false;
  @Input() hasActionsInspect: boolean = false;
  @Input() hasActionsStartingBalance: boolean = false;
  @Input() hasActionsView: boolean = false;

  @Input() isColumnFirstActions: boolean = false;
  @Input() areColumnsUniform: boolean = false;

  @Input() actionTooltipSelect: string = '';

  @Input() buttonDisabledTop: boolean = false;
  @Input() buttonIconTop: string = 'add';
  @Input() buttonTextTop: string = 'Add';
  @Input() buttonColorTop: string = 'accent';
  @Input() buttonDisabledTopSecondary: boolean = false;
  @Input() buttonIconTopSecondary: string = 'add';
  @Input() buttonTextTopSecondary: string = 'Add';
  @Input() buttonColorTopSecondary: string = 'accent';
  @Input() buttonToggleTextTop: string = 'Advanced Mode';
  @Input() hasToggleTop2: boolean = false;
  @Input() buttonToggleTextTop2: string = '';
  @Input() isToggle2Checked: boolean = false;

  @Input() columnTextSelect: string = 'Select';
  @Input() columnTextObfuscate: string = 'Obfuscate Value';

  @Input() itemsPerPage: number = 10;
  @Input() pageSizeOptions: number[] = [10, 20, 50, 100];
  @Input() showCustomRowTooltip: boolean = false;
  @Input() templateTableId: number = 1;
  /** Unique table id for sticky filter/sort localStorage (required to show the pin). */
  @Input() tableName = '';
  @Input() hasDetailRow: boolean = false;
  @Input() detailRowTemplate: TemplateRef<any>;
  @Input() detailRowContext: any;
  @Input() includeDetailRowHeader: boolean = true;
  @Input() rowColorColumn?: string; // Name of hidden column that contains row color
  @Input() defaultRowColor: string = '#fafafa'; // Default row color (light grey)
  @Input() expandAllCallback?: (expanded: boolean) => void; // Callback for expand/collapse all
  @Input() isAllExpanded?: boolean = false; // Track if all rows are expanded
  @Input() isManualApplyMode?: boolean = false; // For manual payment application mode
  @Input() paidAmountChangeCallback?: (item: PurposefulAny, newValue: string) => void; // Callback for paid amount changes
  @Input() paidAmountInputCallback?: (item: PurposefulAny, event: Event) => void; // Callback for paid amount input
  @Input() paidAmountBlurCallback?: (item: PurposefulAny, event: Event) => void; // Callback for paid amount blur
  @Input() paidAmountFocusCallback?: (item: PurposefulAny, event: Event) => void; // Callback for paid amount focus
  @Input() paidAmountEnterCallback?: (item: PurposefulAny, event: Event) => void; // Callback for paid amount enter key
  @Input() applyAmountChangeCallback?: (item: PurposefulAny, newValue: string) => void; // Callback for apply amount changes
  @Input() applyAmountInputCallback?: (item: PurposefulAny, event: Event) => void; // Callback for apply amount input
  @Input() applyAmountBlurCallback?: (item: PurposefulAny, event: Event) => void; // Callback for apply amount blur
  @Input() applyAmountFocusCallback?: (item: PurposefulAny, event: Event) => void; // Callback for apply amount focus
  @Input() applyAmountEnterCallback?: (item: PurposefulAny, event: Event) => void; // Callback for apply amount enter key
  @Input() selectionRowChangedCallback?: (item: PurposefulAny, checked: boolean) => void; // Checkbox toggle in manual apply mode
  @Input() totalsRow?: { [columnName: string]: string }; // Totals data for each column
  @Input() totalsRowAlerts?: Record<string, boolean>;
  @Input() totalsLabel?: string = 'Total'; // Label for the totals row
  @Input() noDataMessage: string = 'No data found...'; // Message when table has no rows
  @Input() initialFilterVal: string = '';
  @Input() suppressRowClickOnDropdownCells: boolean = true;
  @Input() hasPropertyCodeLink: boolean = false;
  @Input() hasReservationCodeLink: boolean = false;
  @Input() hasJournalEntryCodeLink: boolean = false;
  @Input() hasSourceLink: boolean = false;
  @Input() hasContactNameLink: boolean = true;
  @Input() hasWorkOrderCodeLink: boolean = false;
  @Input() subheaderLabel: string = '';
  /** When true, clicking the subheader label toggles visibility of the table body. */
  @Input() subheaderCollapsible = false;
  /** When true, layout-debug orange band wraps only the table/paginator block (below the purple filter row). */
  @Input() dbgBandMainBelowFilter = false;

  @Output() buttonEvent = new EventEmitter<PurposefulAny>();
  @Output() calendarEvent = new EventEmitter<PurposefulAny>();
  @Output() cancelEvent = new EventEmitter<PurposefulAny>();
  @Output() cameraEvent = new EventEmitter<PurposefulAny>();
  @Output() copyEvent = new EventEmitter<PurposefulAny>();
  @Output() linkEvent = new EventEmitter<PurposefulAny>();
  @Output() userEvent = new EventEmitter<PurposefulAny>();
  @Output() rentalEvent = new EventEmitter<PurposefulAny>();
  @Output() ownerEvent = new EventEmitter<PurposefulAny>();
  @Output() deleteEvent = new EventEmitter<PurposefulAny>();
  @Output() downloadEvent = new EventEmitter<PurposefulAny>();
  @Output() dropdownChangeEvent = new EventEmitter<PurposefulAny>();
  @Output() checkboxChangeEvent = new EventEmitter<PurposefulAny>();
  @Output() editEvent = new EventEmitter<PurposefulAny>();
  @Output() lockEvent = new EventEmitter<PurposefulAny>();
  @Output() payableEvent = new EventEmitter<PurposefulAny>();
  @Output() invoiceEvent = new EventEmitter<PurposefulAny>();
  @Output() infoEvent = new EventEmitter<PurposefulAny>();
  @Output() printEvent = new EventEmitter<PurposefulAny>();
  @Output() quoteEvent = new EventEmitter<PurposefulAny>();
  @Output() restoreEvent = new EventEmitter<PurposefulAny>();
  @Output() clearTrackingEvent = new EventEmitter<PurposefulAny>();
  @Output() checkAllEvent = new EventEmitter<PurposefulAny>();
  @Output() rowClickEvent = new EventEmitter<PurposefulAny>();
  @Output() rowClickMouseEvent = new EventEmitter<PurposefulAny>();
  @Output() rowContextMenuEvent = new EventEmitter<PurposefulAny>();
  @Output() saveEvent = new EventEmitter<PurposefulAny>();
  @Output() selectEvent = new EventEmitter<PurposefulAny>();
  @Output() inspectEvent = new EventEmitter<PurposefulAny>();
  @Output() startingBalanceEvent = new EventEmitter<PurposefulAny>();
  @Output() viewEvent = new EventEmitter<PurposefulAny>();
  @Output() attachmentClickEvent = new EventEmitter<PurposefulAny>();
  @Output() quotePathClickEvent = new EventEmitter<PurposefulAny>();
  @Output() contactClickEvent = new EventEmitter<PurposefulAny>();
  @Output() receiptClickEvent = new EventEmitter<PurposefulAny>();
  @Output() propertyCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() reservationCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() journalEntryCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() sourceClickEvent = new EventEmitter<PurposefulAny>();
  @Output() workOrderCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() inlineEditChangeEvent = new EventEmitter<PurposefulAny>();
  @Output() topButtonEvent = new EventEmitter<boolean>();
  @Output() topSecondaryButtonEvent = new EventEmitter<boolean>();
  @Output() topToggleButtonEvent = new EventEmitter<boolean>();
  @Output() topToggle2ButtonEvent = new EventEmitter<boolean>();
  @Output() filterValChangeEvent = new EventEmitter<string>();

  @Output() selectionSet = new EventEmitter<PurposefulAny>();
  private zone = inject(NgZone);
  private formatter = inject(FormatterService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  private readonly clearPinsEventName = 'rentall-clear-pins';
  // Expose Math for use in template
  Math = Math;

  readonly filterActionsSlot = contentChild(DataTableFilterActionsDirective);

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  subheaderSectionCollapsed = false;

  buttons: ButtonData[] = [];
  dataSource = new MatTableDataSource<TableItem>();
  isDataLoaded: boolean = false;
  filterVal: string = null;
  filterSticky = false;
  effectiveItemsPerPage: number = 10;
  effectivePageSizeOptions: number[] = [10, 20, 50, 100];

  tableColumns: ColumnData[] = [];
  private readonly stickyFilterStorageKeyPrefix = 'rentall-datatable-sticky';
  private readonly destroy$ = new Subject<void>();
  private pendingStickySort: { sortColumn: string; sortDirection: DataTableStickySortDirection } | null = null;
  private stickySortApplied = false;
  
  isDateColumn(column: ColumnData): boolean {
    const target = `${column?.name ?? ''} ${column?.displayAs ?? ''}`.toLowerCase();
    // Common date/time naming patterns used across list views.
    return /(date|arrival|departure|check[\s-]?in|check[\s-]?out|start|end|from|until|due|created|updated|expires|expiration|dob|birth)/.test(target);
  }

  getColumnAlignment(column: ColumnData): string {
    if (column.alignment) {
      return column.alignment;
    }
    return this.isDateColumn(column) ? 'center' : 'left';
  }

  getHeaderAlignment(column: ColumnData): string {
    return column.headerAlignment || this.getColumnAlignment(column);
  }

  getColumnMobileLabel(column: ColumnData): string {
    const top = (column.displayAs || '').trim();
    const bottom = (column.headerLine2 || '').trim();
    if (!bottom) {
      return top;
    }

    return `${top} ${bottom}`.trim();
  }

  getFooterAlignment(column: ColumnData): string {
    if (column.alignment) {
      return column.alignment;
    }
    // Keep previous footer behavior (default right), except date columns should center.
    return this.isDateColumn(column) ? 'center' : 'right';
  }

  getTotalsCellColor(column: ColumnData): string | null {
    if (!this.totalsRow || !this.data?.length) {
      return null;
    }

    const columnName = column.name || '';
    if (this.totalsRowAlerts?.[columnName]) {
      return '#d32f2f';
    }

    return '#333';
  }

  isApplyAmountOverDue(item: PurposefulAny): boolean {
    const dueRaw = Number(item?.originalDueAmountValue ?? 0);
    const applyRaw = Number(item?.applyAmountValue ?? 0);
    if (!Number.isFinite(dueRaw) || !Number.isFinite(applyRaw) || dueRaw <= 0) {
      return false;
    }

    const due = Math.round(dueRaw * 100) / 100;
    const appliedMagnitude = applyRaw < 0 ? -applyRaw : applyRaw;
    const applied = Math.round(appliedMagnitude * 100) / 100;
    return applied > (due + 0.005);
  }

  getColumnByName(colName: string): ColumnData | undefined {
    return this.tableColumns.find(col => col.name === colName);
  }
  
  isLastColumnBeforeActionsRightAligned(): boolean {
    const actionsIndex = this.displayedColumns.indexOf('actions');
    if (actionsIndex <= 0) return false;
    
    const lastColumnName = this.displayedColumns[actionsIndex - 1];
    const lastColumn = this.tableColumns.find(col => col.name === lastColumnName);
    if (!lastColumn) return false;
    
    const alignment = lastColumn.headerAlignment || this.getColumnAlignment(lastColumn);
    return alignment === 'right';
  }

  isLastColumnBeforeActionsDropdown(): boolean {
    const actionsIndex = this.displayedColumns.indexOf('actions');
    if (actionsIndex <= 0) return false;

    const lastColumnName = this.displayedColumns[actionsIndex - 1];
    const lastColumn = this.tableColumns.find(col => col.name === lastColumnName);
    if (!lastColumn) return false;

    return !!(lastColumn.isMultiSelect || (lastColumn.options?.length ?? 0) > 0);
  }

  getActionsColumnPaddingLeft(): string | null {
    if (this.isLastColumnBeforeActionsDropdown()) {
      return '50px';
    }
    if (this.isLastColumnBeforeActionsRightAligned()) {
      return '50px';
    }
    return null;
  }

  getActionsFooterPaddingLeft(): string {
    return this.getActionsColumnPaddingLeft() || '10px';
  }
  
  displayedColumns: string[] = [];

  selection = new SelectionModel<string>(true, []);
  isAllSelected: boolean = false;
  isToggle: boolean = false;
  selectAllToolTip: string = 'Select all visible checks';
  private pendingMultiSelectColumnsByRow = new WeakMap<PurposefulAny, Set<string>>();
  private dateCellModelsByRow = new WeakMap<PurposefulAny, Map<string, Date | null>>();
  private dropdownSearchTextByRow = new WeakMap<PurposefulAny, Map<string, string>>();

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  toggleSubheaderSection(event?: Event): void {
    if (!this.subheaderCollapsible) {
      return;
    }
    event?.stopPropagation();
    event?.preventDefault();
    this.subheaderSectionCollapsed = !this.subheaderSectionCollapsed;
    this.markViewForCheck();
  }

  onSubheaderSectionKeydown(event: KeyboardEvent): void {
    if (!this.subheaderCollapsible) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleSubheaderSection(event);
    }
  }

  ngOnInit(): void {
    this.authService.jwtChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updatePageSizeState();
      this.markViewForCheck();
    });

    this.updatePageSizeState();
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    // Use a filterPredicate to make sure the table only filters on visible columns
    this.dataSource.filterPredicate = (item: TableItem, filter: string): boolean =>
      this.displayedColumns
        .map(column => this.getFilterableColumnValue(item, column))
        .some(value => value.includes(filter));

    // Return sortable data from each column
    this.dataSource.sortingDataAccessor = (item: TableItem, column: string): string | number => {
      const columnData = this.columns[column];
      const value = item[column];
      
      // Check if this column should use natural sorting (for codes with numbers)
      if (columnData?.sortType === 'natural' && typeof value === 'string') {
        return this.naturalSortKey(value);
      }
      
      // For status columns, use the numeric ID if available (e.g., reservationStatusId)
      // This ensures proper ordering by enum value rather than alphabetically
      if (column === 'reservationStatus' && item['reservationStatusId'] !== undefined) {
        return item['reservationStatusId'] ?? 999; // Use high number for undefined/null
      }
      
      const currencyCheck = isNaN(value) ? value?.toString().replace('$','').replace(',','') : value;
      const dateCheck = new Date(value).valueOf();
      if (!isNaN(currencyCheck)) return Number(currencyCheck);
      if (!isNaN(dateCheck)) return dateCheck;
      if (!isNaN(value)) return Number(value);
      switch (typeof value) {
        case 'string':
          return value.toLocaleLowerCase();
        case 'object':
          if (value && typeof value === 'object' && typeof value['value'] === 'string') {
            return value['value'].toLocaleLowerCase();
          }
          return value[0]?.toLocaleLowerCase() ?? '';
        default:
          return value;
      }
    };

    if (!this.applyStickyFilterAndSortFromStorage()) {
      const initialFilter = this.normalizeFilterValue(this.initialFilterVal);
      if (initialFilter) {
        this.filterVal = initialFilter;
        this.applyFilter(false);
      }
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClearPins = (): void => {
    if (!this.filterSticky) {
      return;
    }
    this.filterSticky = false;
    this.markViewForCheck();
  };

  ngAfterViewInit(): void {
    this.zone.onStable.pipe(take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.attachTableSortAndPaginator();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['itemsPerPage'] || changes['pageSizeOptions']) {
      this.updatePageSizeState();
    }

    let updateActions, updateTools, updateColumns, updateData, updateFilter;
    for (const key in changes) {
      if (!updateColumns && (key === 'columns' || key.startsWith('hasColumn') || key === 'hasActionsSelect' || key === 'hasButtonSelectAll')) {
        updateColumns = true;
      } else if (!updateActions && ['hasActions'].some(prefix => key.startsWith(prefix))) {
        updateActions = true;
      } else if (!updateTools && ['hasButton', 'hasFilter', 'hasToggle'].some(prefix => key.startsWith(prefix))) {
        updateTools = true;
      } else if (key === 'data') {
        updateData = true;
      }
    }

    // only update what changed
    if (updateFilter && this.filterVal) this.applyFilter();
    if (updateActions) this.setActions();
    if (updateColumns) {
      this.setTableColumns();
      this.zone.onStable.pipe(take(1)).subscribe(() => {
        this.attachTableSortAndPaginator();
        this.markViewForCheck();
      });
    }
    if (updateTools) this.setTableTools();
    else if (updateData) this.setData();
  }

  applyFilter(resetPage: boolean = true, persistSticky: boolean = true): void {
    this.filterVal = this.normalizeFilterValue(this.filterVal);
    this.dataSource.filter = this.filterVal;
    this.filterValChangeEvent.emit(this.filterVal);
    if (resetPage) this.dataSource?.paginator.firstPage();
    if (this.filterSticky && persistSticky) {
      this.persistStickyFilterAndSort();
    }
  }

  clearFilter(input: HTMLInputElement): void {
    input.value = '';
    this.dataSource.filter = '';
    this.filterVal = '';
    this.filterValChangeEvent.emit('');

    this.dataSource?.paginator.firstPage();
    if (this.filterSticky) {
      this.persistStickyFilterAndSort();
    }
  }

  onFilterModelChange(value: string): void {
    this.filterVal = value ?? '';
    this.filterValChangeEvent.emit(this.normalizeFilterValue(this.filterVal));
  }

  emitAddEvent(): void {
    this.topButtonEvent.emit(true);
  }

  emitSecondaryAddEvent(): void {
    this.topSecondaryButtonEvent.emit(true);
  }

  emitToggleEvent(): void {
    this.topToggleButtonEvent.emit(true);
  }

  emitToggle2Event(): void {
    this.topToggle2ButtonEvent.emit(!this.isToggle2Checked);
  }

  emitLockEvent(_event: Event, rowItem: PurposefulAny): void {
    this.lockEvent.emit(rowItem);
  }

  emitPayableEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.payableEvent.emit(rowItem);
  }

  emitInvoiceEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.invoiceEvent.emit(rowItem);
  }

  emitInfoEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.infoEvent.emit(rowItem);
  }

  getButtonTooltip(buttonName: string, buttonTooltip: string, item: PurposefulAny): string {
    if (buttonName === 'view' && item?.canView === false) {
      return 'This document type cannot be previewed';
    }
    if (buttonName === 'camera' && !item?.documentPath) {
      return 'No document available';
    }
    if (buttonName === 'info') {
      const notes = String(item?.notes ?? item?.agreementLineNotes ?? '').trim();
      return notes || 'No notes';
    }
    return item?.customTooltip || buttonTooltip || buttonName;
  }

  emitPrintEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.printEvent.emit(rowItem);
  }

  emitQuoteEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.quoteEvent.emit(rowItem);
  }

  emitCopyEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.copyEvent.emit(rowItem);
  }

  emitLinkEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.linkEvent.emit(rowItem);
  }

  emitUserEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.userEvent.emit(rowItem);
  }

  emitRentalEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.rentalEvent.emit(rowItem);
  }

  emitOwnerEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.ownerEvent.emit(rowItem);
  }

  emitCalendarEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.calendarEvent.emit(rowItem);
  }

  emitEditEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.editEvent.emit(rowItem);
  }

  emitRestoreEvent(_event: Event, rowItem: PurposefulAny): void {
    this.restoreEvent.emit(rowItem);
  }

  emitClearTrackingEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.clearTrackingEvent.emit(rowItem);
  }

  emitCheckAllEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.checkAllEvent.emit(rowItem);
  }

  emitSaveEvent(_event: Event, rowItem: PurposefulAny): void {
    this.saveEvent.emit(rowItem);
  }

  emitDownloadEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.downloadEvent.emit(rowItem);
  }

  emitDeleteEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    if (!this.confirmDeleteBeforeEmit) {
      this.deleteEvent.emit(rowItem);
      return;
    }

    const dialogData: GenericModalData = {
      title: this.deleteConfirmTitle,
      message: this.deleteConfirmMessage,
      icon: 'warning' as any,
      iconColor: 'warn',
      no: 'Cancel',
      yes: 'Delete',
      callback: (dialogRef, result) => {
        dialogRef.close(result);
        if (result) {
          this.deleteEvent.emit(rowItem);
        }
      },
      useHTML: false,
      hideClose: true
    };
    this.dialog.open(GenericModalComponent, { data: dialogData, width: '35rem' });
  }
  
  emitCancelEvent(_event: Event, rowItem: PurposefulAny): void {
    this.cancelEvent.emit(rowItem);
  }

  emitCameraEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.cameraEvent.emit(rowItem);
  }

  emitViewEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.viewEvent.emit(rowItem);
  }

  emitInspectEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.inspectEvent.emit(rowItem);
  }

  emitStartingBalanceEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.startingBalanceEvent.emit(rowItem);
  }

  emitRowClickEvent(rowItem: PurposefulAny, event?: MouseEvent): void {
    // Only emit if row clicks are enabled
    if (!this.hasActionsRowClick) {
      return;
    }

    if (event && this.isSelectColumnInteraction(event)) {
      return;
    }

    // Shift+click is reserved for multi-select flows; do not trigger standard row-click handlers.
    if (event?.shiftKey) {
      this.rowClickMouseEvent.emit({ rowItem, mouseEvent: event });
      return;
    }

    this.rowClickEvent.emit(rowItem);
    this.rowClickMouseEvent.emit({ rowItem, mouseEvent: event || null });
  }

  emitRowContextMenuEvent(event: MouseEvent, rowItem: PurposefulAny): void {
    if (!this.hasActionsRowClick) {
      return;
    }
    event.preventDefault();
    this.rowContextMenuEvent.emit({ rowItem, mouseEvent: event });
  }

  onEmailClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    if (this.hasActionsRowClick) {
      this.emitRowClickEvent(rowItem);
    } else if (this.hasActionsEdit) {
      this.emitEditEvent(event, rowItem);
    }
  }

  onContactClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    // Check for contactId (for companies) or owner1Id (for properties)
    if (rowItem.contactId || rowItem.owner1Id) {
      this.contactClickEvent.emit(rowItem);
    }
  }

  onAttachmentClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.attachmentClickEvent.emit(rowItem);
  }

  onQuotePathClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.quotePathClickEvent.emit(rowItem);
  }

  onReceiptClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.receiptClickEvent.emit(rowItem);
  }

  onPropertyCodeClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.propertyCodeClickEvent.emit(rowItem);
  }

  onReservationCodeClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.reservationCodeClickEvent.emit(rowItem);
  }

  onJournalEntryCodeClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.journalEntryCodeClickEvent.emit(rowItem);
  }

  onSourceClick(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.sourceClickEvent.emit(rowItem);
  }

  onWorkOrderCodeClick(event: Event, rowItem: PurposefulAny, workOrderCode: string): void {
    event.stopPropagation();
    this.workOrderCodeClickEvent.emit({ rowItem, workOrderCode });
  }

  getDelimitedValues(value: unknown): string[] {
    return String(value ?? '')
      .split(',')
      .map(token => token.trim())
      .filter(token => token.length > 0);
  }

  emitSelectEvent(event: MatCheckboxChange, rowItem: PurposefulAny): void {
    if (event.checked && (rowItem?.disabled || rowItem?.updating)) {
      rowItem.selected = false;
      if (this.hasButtonSelectAll) {
        this.selection.deselect(rowItem);
        this.isAllSelected = this.setIsAllSelected();
      }
      return;
    }

    rowItem.selected = event.checked;
    if (this.isManualApplyMode && this.selectionRowChangedCallback) {
      this.selectionRowChangedCallback(rowItem, event.checked);
    }
    if (this.hasButtonSelectAll) {
      event.checked ? this.selection.select(rowItem) : this.selection.deselect(rowItem);
      this.selectionSet.emit(this.selection);
      this.isAllSelected = this.setIsAllSelected();
    } else {
      this.selectEvent.emit(rowItem);
    }
  }

  emitDropdownChangeEvent(rowItem: PurposefulAny, columnName?: string): void {
    if (columnName && rowItem[columnName]?.dropdownReadOnly) {
      const id = this.getBedColumnSourceId(rowItem, columnName);
      if (id !== undefined) {
        rowItem[columnName].value = getBedSizeType(id);
      }
      return;
    }
    if (columnName) {
      rowItem.__changedDropdownColumn = columnName;
    }
    this.dropdownChangeEvent.emit(rowItem);
  }

  onDatatableSelectModelChange(rowItem: PurposefulAny, columnName: string | undefined, value: unknown): void {
    if (!columnName) {
      return;
    }
    if (this.isMultiSelectColumnForItem(rowItem, columnName)) {
      const selectedCount = Array.isArray(value)
        ? value.filter(option => option !== null && option !== undefined && `${option}`.trim() !== '').length
        : (value === null || value === undefined || `${value}`.trim() === '' ? 0 : 1);
      if (rowItem?.[columnName] && typeof rowItem[columnName] === 'object') {
        rowItem[columnName].optionsSelected = selectedCount;
      }
      this.markPendingMultiSelectChange(rowItem, columnName);
      return;
    }
    this.emitDropdownChangeEvent(rowItem, columnName);
  }

  onDatatableSelectOpenedChange(isOpen: boolean, rowItem: PurposefulAny, columnName: string | undefined): void {
    if (!columnName) {
      return;
    }
    if (isOpen) {
      this.clearDropdownSearchText(rowItem, columnName);
    }
    if (!this.isMultiSelectColumnForItem(rowItem, columnName)) {
      return;
    }
    if (isOpen) {
      this.clearPendingMultiSelectChange(rowItem, columnName);
      return;
    }
    if (this.hasPendingMultiSelectChange(rowItem, columnName)) {
      this.clearPendingMultiSelectChange(rowItem, columnName);
      this.emitDropdownChangeEvent(rowItem, columnName);
    }
  }

  isMultiSelectColumnForItem(rowItem: PurposefulAny, columnName: string): boolean {
    return !!(rowItem?.[columnName]?.isMultiSelect || this.getColumnByName(columnName)?.isMultiSelect);
  }

  isDropdownSearchEnabled(rowItem: PurposefulAny, column: ColumnData): boolean {
    const columnName = column?.name || '';
    if (!columnName || this.isMultiSelectColumnForItem(rowItem, columnName)) {
      return false;
    }
    return rowItem?.[columnName]?.searchableDropdown === true || column.searchableDropdown === true;
  }

  getDropdownSearchPlaceholder(rowItem: PurposefulAny, column: ColumnData): string {
    const columnName = column?.name || '';
    return rowItem?.[columnName]?.dropdownSearchPlaceholder
      || column.dropdownSearchPlaceholder
      || 'Type to filter...';
  }

  getDropdownSearchText(rowItem: PurposefulAny, columnName: string): string {
    const searchMap = this.dropdownSearchTextByRow.get(rowItem);
    return searchMap?.get(columnName) || '';
  }

  setDropdownSearchText(rowItem: PurposefulAny, columnName: string, value: string): void {
    const searchMap = this.dropdownSearchTextByRow.get(rowItem) || new Map<string, string>();
    searchMap.set(columnName, (value || '').toString());
    this.dropdownSearchTextByRow.set(rowItem, searchMap);
  }

  clearDropdownSearchText(rowItem: PurposefulAny, columnName: string): void {
    const searchMap = this.dropdownSearchTextByRow.get(rowItem);
    if (!searchMap) {
      return;
    }
    searchMap.delete(columnName);
    if (searchMap.size === 0) {
      this.dropdownSearchTextByRow.delete(rowItem);
    }
  }

  getFilteredDropdownOptions(rowItem: PurposefulAny, column: ColumnData): string[] {
    const columnName = column?.name || '';
    const options = rowItem?.[columnName]?.options ?? column.options ?? [];
    if (!Array.isArray(options)) {
      return [];
    }
    if (!this.isDropdownSearchEnabled(rowItem, column)) {
      return options;
    }
    const query = this.getDropdownSearchText(rowItem, columnName).trim().toLowerCase();
    if (!query) {
      return options;
    }
    return options.filter(option => String(option ?? '').toLowerCase().includes(query));
  }

  onDatatableSelectKeydown(
    event: KeyboardEvent,
    rowItem: PurposefulAny,
    column: ColumnData,
    dropdown: { panelOpen?: boolean } | undefined
  ): void {
    if (!this.isDropdownSearchEnabled(rowItem, column) || !dropdown?.panelOpen) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const columnName = column?.name || '';
    if (!columnName) {
      return;
    }
    if (event.key === 'Backspace') {
      const current = this.getDropdownSearchText(rowItem, columnName);
      this.setDropdownSearchText(rowItem, columnName, current.slice(0, -1));
      event.preventDefault();
      return;
    }
    if (event.key.length === 1) {
      const current = this.getDropdownSearchText(rowItem, columnName);
      this.setDropdownSearchText(rowItem, columnName, `${current}${event.key}`);
      event.preventDefault();
    }
  }

  markPendingMultiSelectChange(rowItem: PurposefulAny, columnName: string): void {
    const pending = this.pendingMultiSelectColumnsByRow.get(rowItem) || new Set<string>();
    pending.add(columnName);
    this.pendingMultiSelectColumnsByRow.set(rowItem, pending);
  }

  hasPendingMultiSelectChange(rowItem: PurposefulAny, columnName: string): boolean {
    const pending = this.pendingMultiSelectColumnsByRow.get(rowItem);
    return !!pending?.has(columnName);
  }

  clearPendingMultiSelectChange(rowItem: PurposefulAny, columnName: string): void {
    const pending = this.pendingMultiSelectColumnsByRow.get(rowItem);
    if (!pending) {
      return;
    }
    pending.delete(columnName);
    if (pending.size === 0) {
      this.pendingMultiSelectColumnsByRow.delete(rowItem);
    }
  }

  getMultiSelectSelectedCount(rowItem: PurposefulAny, columnName: string): number {
    const optionsSelected = Number(rowItem?.[columnName]?.optionsSelected);
    if (Number.isFinite(optionsSelected)) {
      return Math.max(0, optionsSelected);
    }
    const value = rowItem?.[columnName]?.value;
    if (Array.isArray(value)) {
      return value.filter(option => option !== null && option !== undefined && `${option}`.trim() !== '').length;
    }
    if (value === null || value === undefined || `${value}`.trim() === '') {
      return 0;
    }
    return 1;
  }

  getMultiSelectOptionCount(rowItem: PurposefulAny, columnName: string, columnOptions: unknown): number {
    const options = rowItem?.[columnName]?.options ?? columnOptions;
    return Array.isArray(options) ? options.length : 0;
  }

  getMultiSelectVisualState(rowItem: PurposefulAny, columnName: string, columnOptions: unknown): 'none' | 'partial' | 'all' {
    const selectedCount = this.getMultiSelectSelectedCount(rowItem, columnName);
    if (selectedCount <= 0) {
      return 'none';
    }
    const optionCount = this.getMultiSelectOptionCount(rowItem, columnName, columnOptions);
    if (optionCount > 0 && selectedCount >= optionCount) {
      return 'all';
    }
    return 'partial';
  }

  emitCheckboxChangeEvent(event: MatCheckboxChange, rowItem: PurposefulAny, columnName: string): void {
    if (!this.getColumnByName(columnName)?.checkboxEditable) {
      return;
    }
    const previousValue = !!rowItem[columnName];
    rowItem[columnName] = event.checked;
    rowItem.__changedCheckboxColumn = columnName;
    rowItem.__previousCheckboxValue = previousValue;
    rowItem.__checkboxValue = event.checked;
    this.checkboxChangeEvent.emit(rowItem);
  }

  emitInlineEditChangeEvent(rowItem: PurposefulAny, columnName: string, value: string): void {
    rowItem[columnName] = value;
    rowItem.__changedInlineColumn = columnName;
    rowItem.__inlineValue = value;
    this.inlineEditChangeEvent.emit(rowItem);
  }

  shouldSuppressRowClickForCell(item: PurposefulAny, column: ColumnData): boolean {
    const columnName = column?.name || '';
    if (!columnName) {
      return false;
    }
    if (columnName === 'select') {
      return true;
    }
    if (column.suppressRowClick === true) {
      return true;
    }
    return !!(this.suppressRowClickOnDropdownCells && (item[columnName]?.options?.length || column.options?.length));
  }

  isSelectColumnInteraction(event: MouseEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }
    return !!target.closest('.mat-column-select, mat-checkbox, .mdc-checkbox, .mdc-form-field');
  }

  onTableCellClick(event: MouseEvent, item: PurposefulAny, column: ColumnData): void {
    if (!this.shouldSuppressRowClickForCell(item, column)) {
      return;
    }
    event.stopPropagation();
    if (column.editableType !== 'date' || item[(column.name ?? '') + 'ReadOnly'] === true) {
      return;
    }
    const currentTarget = event.currentTarget as HTMLElement | null;
    const dateInput = currentTarget?.querySelector('input.datatable-editable-date-input') as HTMLInputElement | null;
    if (!dateInput) {
      return;
    }
    dateInput.focus();
    dateInput.select();
  }

  onTableCellMouseDown(event: MouseEvent, item: PurposefulAny, column: ColumnData): void {
    if (!this.shouldSuppressRowClickForCell(item, column)) {
      return;
    }
    event.stopPropagation();
  }

  getDateInputValue(value: unknown): string {
    const parsed = this.parseDateValue(value);
    if (!parsed) {
      return '';
    }
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getDateCellModel(rowItem: PurposefulAny, columnName: string): Date | null {
    const rowMap = this.dateCellModelsByRow.get(rowItem) || new Map<string, Date | null>();
    if (!this.dateCellModelsByRow.has(rowItem)) {
      this.dateCellModelsByRow.set(rowItem, rowMap);
    }
    if (rowMap.has(columnName)) {
      return rowMap.get(columnName) ?? null;
    }
    const parsed = this.parseDateValue(rowItem?.[columnName]);
    rowMap.set(columnName, parsed);
    return parsed;
  }

  onInlineDateModelChange(rowItem: PurposefulAny, columnName: string, value: unknown): void {
    const rowMap = this.dateCellModelsByRow.get(rowItem) || new Map<string, Date | null>();
    this.dateCellModelsByRow.set(rowItem, rowMap);
    const parsedDate = this.parseDateValue(value);
    rowMap.set(columnName, parsedDate);
  }

  commitInlineDateModelChange(rowItem: PurposefulAny, columnName: string, value: unknown): void {
    const parsedDate = this.parseDateValue(value);
    const nextDate = parsedDate ? this.getDateInputValue(parsedDate) : '';
    const currentDate = this.getDateInputValue(rowItem?.[columnName]);
    if (nextDate === currentDate) {
      return;
    }
    this.emitInlineEditChangeEvent(rowItem, columnName, nextDate);
  }

  selectDateInputText(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }
    input.select();
  }

  private parseDateValue(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    const datePart = raw.split('T')[0]?.split(' ')[0] ?? '';
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }
      return new Date(year, month - 1, day);
    }

    const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(datePart);
    if (usMatch) {
      const month = Number(usMatch[1]);
      const day = Number(usMatch[2]);
      const yearToken = usMatch[3];
      const year = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  openDropdown(event: Event, dropdown: { open: () => void } | undefined): void {
    event.stopPropagation();
    dropdown?.open();
  }

  onDatatableDropdownTriggerClick(
    event: Event,
    dropdown: { open: () => void } | undefined,
    item: PurposefulAny,
    columnName: string | undefined
  ): void {
    event.stopPropagation();
    if (!columnName || item[columnName]?.dropdownReadOnly) {
      return;
    }
    dropdown?.open();
  }

  getBedColumnSourceId(row: PurposefulAny, column: string): number | undefined {
    const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
    const bedrooms = n(row.bedrooms);
    switch (column) {
      case 'bed1Text':
        return effectiveBedTypeIdForPropertySlot(1, bedrooms, n(row.bedroomId1));
      case 'bed2Text':
        return effectiveBedTypeIdForPropertySlot(2, bedrooms, n(row.bedroomId2));
      case 'bed3Text':
        return effectiveBedTypeIdForPropertySlot(3, bedrooms, n(row.bedroomId3));
      case 'bed4Text':
        return effectiveBedTypeIdForPropertySlot(4, bedrooms, n(row.bedroomId4));
      case 'sofabedText':
        return n(row.sofabed);
      default:
        return undefined;
    }
  }

  emitButtonEvent(rowItem: PurposefulAny): void {
    this.buttonEvent.emit(rowItem);
  }

  setColumnNameCasing(columnName: string | undefined | null): string {
    if (!columnName) {
      return '';
    }
    const newColumnName = columnName[0].toUpperCase() + columnName.substring(1);
    return newColumnName.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  getStatusText(status: number): string {
    return getStatus(status);
  }

  obfuscateValue(value: string): string {
    return this.formatter.obfuscator(value);
  }

  /**
   * Converts a string with numbers into a natural sort key.
   * This ensures proper sorting of codes like "CODE1", "CODE2", "CODE10"
   * by padding numeric parts with zeros.
   * Example: "CODE1" -> "CODE0000000001", "CODE10" -> "CODE0000000010"
   */
  naturalSortKey(value: string): string {
    if (!value) return '';
    
    // Split the string into text and number parts
    // This regex matches: text parts and number parts
    const parts = value.match(/(\d+|\D+)/g) || [];
    
    return parts.map(part => {
      // If it's a number, pad it with zeros to ensure proper sorting
      if (/^\d+$/.test(part)) {
        return part.padStart(10, '0'); // Pad to 10 digits
      }
      // If it's text, convert to lowercase for case-insensitive sorting
      return part.toLowerCase();
    }).join('');
  }

  private getFilterableColumnValue(item: TableItem, column: string): string {
    return this.normalizeFilterValue(this.flattenFilterSourceValue(item?.[column]));
  }

  private flattenFilterSourceValue(value: unknown): string {
    if (value == null) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map(v => this.flattenFilterSourceValue(v)).join(' ');
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record['value'] === 'string' || typeof record['value'] === 'number') {
        return String(record['value']);
      }

      return Object.values(record)
        .map(v => this.flattenFilterSourceValue(v))
        .join(' ');
    }

    return String(value);
  }

  private normalizeFilterValue(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase();
  }

  /** Shown left of the row-number column when `hasColumnIndex` is true. */
  private static readonly leadingColumnsBeforeIndex = ['ticketAttentionDot', 'leadAttentionDot'];

  setTableColumns(): void {
    let columns = {} as ColumnSet;
    // order here is important
    if (this.hasActionsSelect)
      columns['select'] = { displayAs: this.columnTextSelect ?? 'Select', sort: false, wrap: false, maxWidth: '5ch', alignment: 'center', headerAlignment: 'center' };

    const leading: ColumnSet = {};
    const rest: ColumnSet = {};
    for (const name in this.columns) {
      if (DataTableComponent.leadingColumnsBeforeIndex.includes(name))
        leading[name] = this.columns[name];
      else
        rest[name] = this.columns[name];
    }
    columns = { ...columns, ...leading };
    const userNoColumn = rest['no'];
    if (userNoColumn) {
      delete rest['no'];
    }
    if (this.hasColumnIndex) {
      columns['no'] = {
        displayAs: 'No',
        wrap: false,
        sort: false,
        maxWidth: '5ch',
        ...userNoColumn
      };
    }
    columns = { ...columns, ...rest };
    
    if (this.hasActionsEdit || this.hasActionsDelete || this.hasActionsSave || this.hasActionsRestore || this.hasActionsDownload || this.hasActionsView || this.hasActionsInspect || this.hasActionsCamera || this.hasActionsPayable || this.hasActionsInvoice || this.hasActionsInfo || this.hasActionsCopy || this.hasActionsLink || this.hasActionsUser || this.hasActionsRental || this.hasActionsOwner || this.hasActionsCalendar || this.hasActionsQuote || this.hasActionsClearTracking || this.hasActionsCheckAll || this.hasActionsStartingBalance || this.hasColumnDynamicAction)
      columns['actions'] = { displayAs: 'Actions', sort: false, wrap: false };
    
    this.tableColumns = [];
    this.displayedColumns = [];

    // string object keys insertion order is preserved
    for (const name in columns) {
      const column = columns[name];
      // Skip the row color column from being displayed (it's hidden but still in data)
      if (this.rowColorColumn && name === this.rowColorColumn) {
        continue;
      }
      this.tableColumns.push({
        // Handle default data overrides. Lookup 'JS spread syntax' if this still doesn't make sense.
        ...defaultColumnData,
        ...column,
        // override any user-input values
        name: name,
        displayAs: column?.displayAs || this.setColumnNameCasing(name) || '',
      });
      this.displayedColumns.push(name);
    }
  }

  setActions(): void {
    this.buttons = [];
    const placeInfoBeforeDelete = this.tableName === 'receipts-list';
    if (this.hasActionsStartingBalance) this.buttons.push({name: 'startingBalance', callback: (event, rowItem) => this.emitStartingBalanceEvent(event, rowItem), color: '#2E7D32', tooltip: 'Enter Starting Balance', tooltipPosition: 'before', icon: 'SB', suspendOnUpdate: false});
    if (this.hasActionsLock)     this.buttons.push({name: 'lock', callback: (event, rowItem) => this.emitLockEvent(event, rowItem), color: 'accent', tooltip: 'Locked', tooltipPosition: 'before', icon: 'lock', suspendOnUpdate: true});
    if (this.hasActionsCamera)   this.buttons.push({name: 'camera', callback: (event, rowItem) => this.emitCameraEvent(event, rowItem), color: '#2196F3', tooltip: 'Open Document', tooltipPosition: 'before', icon: 'photo_camera', suspendOnUpdate: false});
    if (this.hasActionsEdit)     this.buttons.push({name: 'edit', callback: (event, rowItem) => this.emitEditEvent(event, rowItem), color: '#7E69B4', tooltip: 'Edit', tooltipPosition: 'before', icon: 'edit', suspendOnUpdate: false});
    if (this.hasActionsInspect)  this.buttons.push({name: 'inspect', callback: (event, rowItem) => this.emitInspectEvent(event, rowItem), color: '#4CAF50', tooltip: 'Open Inspection', tooltipPosition: 'before', icon: 'search', suspendOnUpdate: false});
    if (this.hasActionsCalendar) this.buttons.push({name: 'calendar', callback: (event, rowItem) => this.emitCalendarEvent(event, rowItem), color: '#00897B', tooltip: 'Calendar', tooltipPosition: 'before', icon: 'calendar_month', suspendOnUpdate: false});
    if (this.hasActionsQuote)    this.buttons.push({name: 'quote', callback: (event, rowItem) => this.emitQuoteEvent(event, rowItem), color: '#2E7D32', tooltip: 'Generate Quote', tooltipPosition: 'before', icon: 'request_quote', suspendOnUpdate: false});
    if (this.hasActionsCopy)     this.buttons.push({name: 'copy', callback: (event, rowItem) => this.emitCopyEvent(event, rowItem), color: '#2196F3', tooltip: 'Copy', tooltipPosition: 'before', icon: 'file_copy', suspendOnUpdate: false});
    if (this.hasActionsLink)     this.buttons.push({name: 'link', callback: (event, rowItem) => this.emitLinkEvent(event, rowItem), color: '#FF9800', tooltip: 'Copy Owner Link', tooltipPosition: 'before', icon: 'link', suspendOnUpdate: false});
    if (this.hasActionsUser)     this.buttons.push({name: 'user', callback: (event, rowItem) => this.emitUserEvent(event, rowItem), color: this.userActionColor, tooltip: this.userActionTooltip, tooltipPosition: 'before', icon: 'person_add', suspendOnUpdate: false});
    if (this.hasActionsRental)   this.buttons.push({name: 'rental', callback: (event, rowItem) => this.emitRentalEvent(event, rowItem), color: '#1976D2', tooltip: 'Convert to Rental Lead', tooltipPosition: 'before', icon: 'home_work', suspendOnUpdate: false});
    if (this.hasActionsOwner)    this.buttons.push({name: 'owner', callback: (event, rowItem) => this.emitOwnerEvent(event, rowItem), color: '#7B1FA2', tooltip: 'Convert Lead to Owner', tooltipPosition: 'before', icon: 'person', suspendOnUpdate: false});
    if (this.hasActionsPayable)  this.buttons.push({name: 'payable', callback: (event, rowItem) => this.emitPayableEvent(event, rowItem), color: this.payableActionColor, tooltip: 'Create Bill & Pay', tooltipPosition: 'before', icon: 'attach_money', suspendOnUpdate: false});
    if (this.hasActionsInvoice)  this.buttons.push({name: 'invoice', callback: (event, rowItem) => this.emitInvoiceEvent(event, rowItem), color: this.invoiceActionColor, tooltip: this.invoiceActionTooltip, tooltipPosition: 'before', icon: 'receipt_long', suspendOnUpdate: false});
    if (this.hasActionsInfo && !placeInfoBeforeDelete) this.buttons.push({name: 'info', callback: (event, rowItem) => this.emitInfoEvent(event, rowItem), color: this.infoActionColor, tooltip: 'Info', tooltipPosition: 'before', icon: 'info', suspendOnUpdate: false});
    if (this.hasActionsView)     this.buttons.push({name: 'view', callback: (event, rowItem) => this.emitViewEvent(event, rowItem), color: '#FF9800', tooltip: 'View', tooltipPosition: 'before', icon: 'visibility', suspendOnUpdate: false});
    if (this.hasActionsPrint)    this.buttons.push({name: 'print', callback: (event, rowItem) => this.emitPrintEvent(event, rowItem), color: '#2196F3', tooltip: 'Print', tooltipPosition: 'before', icon: 'print', suspendOnUpdate: false});
    if (this.hasActionsRestore)  this.buttons.push({name: 'restore', callback: (event, rowItem) => this.emitRestoreEvent(event, rowItem), color: '#A64D79', tooltip: 'Restore', tooltipPosition: 'before', icon: 'restore', suspendOnUpdate: false});
    if (this.hasActionsCheckAll) this.buttons.push({name: 'checkAll', callback: (event, rowItem) => this.emitCheckAllEvent(event, rowItem), color: '#2E7D32', tooltip: 'Check All', tooltipPosition: 'before', icon: 'done', suspendOnUpdate: false});
    if (this.hasActionsClearTracking) this.buttons.push({name: 'clearTracking', callback: (event, rowItem) => this.emitClearTrackingEvent(event, rowItem), color: '#1E88E5', tooltip: 'Clear Tracking', tooltipPosition: 'before', icon: 'restart_alt', suspendOnUpdate: false});
    if (this.hasActionsSave)     this.buttons.push({name: 'save', callback: (event, rowItem) => this.emitSaveEvent(event, rowItem), color: '#93C47D', tooltip: 'Save', tooltipPosition: 'after', icon: 'save', suspendOnUpdate: false});
    if (this.hasActionsDownload) this.buttons.push({name: 'download', callback: (event, rowItem) => this.emitDownloadEvent(event, rowItem), color: this.downloadActionColor, tooltip: this.downloadActionTooltip, tooltipPosition: 'after', icon: 'download', suspendOnUpdate: false});
    if (this.hasActionsInfo && placeInfoBeforeDelete) this.buttons.push({name: 'info', callback: (event, rowItem) => this.emitInfoEvent(event, rowItem), color: this.infoActionColor, tooltip: 'Info', tooltipPosition: 'before', icon: 'info', suspendOnUpdate: false});
    if (this.hasActionsDelete)   this.buttons.push({name: 'delete', callback: (event, rowItem) => this.emitDeleteEvent(event, rowItem), color: '#FA6868', tooltip: 'Delete', tooltipPosition: 'after', icon: 'delete', suspendOnUpdate: false});
    if (this.hasActionsCancel)   this.buttons.push({name: 'cancel', callback: (event, rowItem) => this.emitCancelEvent(event, rowItem), color: '#3F51B5', tooltip: 'Cancel', tooltipPosition: 'after', icon: 'cancel', suspendOnUpdate: false});
  }

  setTableTools(): void {
    this.isDataLoaded = false;
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      this.setData();
      this.attachTableSortAndPaginator();
      this.isDataLoaded = true;
      this.markViewForCheck();
    });
  }

  //#region Sticky Filter And Sort
  onStickyFilterToggle(): void {
    if (!this.tableName?.trim()) {
      return;
    }

    this.filterSticky = !this.filterSticky;
    if (this.filterSticky) {
      this.persistStickyFilterAndSort();
    } else {
      this.clearStickyStorage();
    }
    this.markViewForCheck();
  }

  onMatSortChange(_event: Sort): void {
    if (this.filterSticky) {
      this.persistStickyFilterAndSort();
    }
  }

  applyStickyFilterAndSortFromStorage(): boolean {
    const stored = this.readStickyFromStorage();
    if (!stored?.enabled) {
      this.filterSticky = false;
      return false;
    }

    this.filterSticky = true;
    this.filterVal = stored.filterText ?? '';
    this.applyFilter(false, false);
    if (stored.sortColumn && stored.sortDirection) {
      this.pendingStickySort = {
        sortColumn: stored.sortColumn,
        sortDirection: stored.sortDirection
      };
    }
    return true;
  }

  persistStickyFilterAndSort(): void {
    if (!this.filterSticky || !this.tableName?.trim()) {
      return;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return;
    }

    const sortState = this.getSortState();
    const payload: DataTableStickyState = {
      enabled: true,
      tableName: this.tableName.trim(),
      filterText: this.filterVal ?? '',
      sortColumn: sortState.sortColumn,
      sortDirection: sortState.sortDirection
    };

    localStorage.setItem(this.getStickyStorageKey(userId), JSON.stringify(payload));
  }

  readStickyFromStorage(): DataTableStickyState | null {
    if (typeof localStorage === 'undefined' || !this.tableName?.trim()) {
      return null;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return null;
    }

    const rawValue = localStorage.getItem(this.getStickyStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<DataTableStickyState>;
      if (parsed?.enabled !== true || parsed.tableName !== this.tableName.trim()) {
        return null;
      }
      const sortDirection = parsed.sortDirection;
      const normalizedDirection: DataTableStickySortDirection =
        sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : '';
      return {
        enabled: true,
        tableName: this.tableName.trim(),
        filterText: String(parsed.filterText ?? ''),
        sortColumn: String(parsed.sortColumn ?? ''),
        sortDirection: normalizedDirection
      };
    } catch {
      return null;
    }
  }

  clearStickyStorage(): void {
    if (typeof localStorage === 'undefined' || !this.tableName?.trim()) {
      return;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return;
    }

    localStorage.removeItem(this.getStickyStorageKey(userId));
  }

  getStickyStorageKey(userId: string): string {
    return `${this.stickyFilterStorageKeyPrefix}-${userId}-${this.tableName.trim()}`;
  }

  private getSortState(): { sortColumn: string; sortDirection: DataTableStickySortDirection } {
    const sortColumn = this.sort?.active?.trim() ?? '';
    const sortDirection = this.sort?.direction;
    if (!sortColumn || (sortDirection !== 'asc' && sortDirection !== 'desc')) {
      return { sortColumn: '', sortDirection: '' };
    }
    return { sortColumn, sortDirection };
  }

  private attachTableSortAndPaginator(): void {
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    if (!this.sort) {
      return;
    }

    this.dataSource.sort = this.sort;
    this.applyStickySortIfNeeded();
  }

  private applyStickySortIfNeeded(): void {
    if (this.stickySortApplied || !this.pendingStickySort?.sortColumn || !this.pendingStickySort.sortDirection) {
      return;
    }
    if (!this.sort || !this.displayedColumns.includes(this.pendingStickySort.sortColumn)) {
      return;
    }

    const { sortColumn, sortDirection } = this.pendingStickySort;
    this.stickySortApplied = true;
    this.pendingStickySort = null;
    this.sort.sort({
      id: sortColumn,
      start: sortDirection,
      disableClear: false
    });
    this.dataSource.sort = this.sort;
    if (this.filterSticky) {
      this.persistStickyFilterAndSort();
    }
  }
  //#endregion

  setData(): void {
    this.dataSource.data = this.data;
    this.attachTableSortAndPaginator();
    this.selection.clear();
    this.selectionSet.emit(this.selection);
    this.isAllSelected = false;
  }

  /** Re-render rows without clearing checkbox selection (e.g. after programmatic apply-amount updates). */
  refreshDisplayedData(): void {
    if (!this.data) {
      return;
    }
    this.dataSource.data = [...this.data];
    this.markViewForCheck();
  }

  setIsAllSelected(): boolean {
    const selectableItems = this.getCurrentPageItems().filter(item => !item?.disabled && !item?.updating);
    if (selectableItems.length === 0) {
      return false;
    }
    return selectableItems.every(item => !!item?.selected);
  }

  toggleAllRows(event: MatCheckboxChange): void {
    const currentPageItems = this.getCurrentPageItems();
    if (this.isAllSelected) {
      this.selection.clear();
      this.selectAllToolTip = 'Select all visible checks';
      currentPageItems.forEach((i) => { this.emitSelectEvent({ ...event, checked: false }, i); });
      return;
    }

    const selectableItems = currentPageItems.filter(item => !item?.disabled && !item?.updating);
    this.selection.clear();
    this.selection.select(...selectableItems);
    this.selectAllToolTip = 'Unselect all visible checks';
    currentPageItems.forEach((i) => {
      const checked = !i?.disabled && !i?.updating;
      this.emitSelectEvent({ ...event, checked }, i);
    });
  }

  getCurrentPageItems(): PurposefulAny[] {
    const start = this.paginator.pageSize * this.paginator.pageIndex;
    const end = start + this.paginator.pageSize;
    const currentPageItems = this.dataSource.data.slice(start, end);
    return currentPageItems;
  }

  onPageChange(): void {
    const currentPageItems = this.getCurrentPageItems();
    const checkEvent = new MatCheckboxChange;
    this.selection.clear();
    this.selectAllToolTip = 'Select all visible checks';
    currentPageItems.forEach((i) => { this.emitSelectEvent(checkEvent, i) });
  }


  isMainRowVisible = (_row?: PurposefulAny): boolean => {
    return true;
  }

  isRowExpanded = (row: PurposefulAny): boolean => {
    let actualRow: PurposefulAny;
    
    if (typeof row === 'number') {
      if (!this.dataSource || !this.dataSource.data || this.dataSource.data.length === 0) {
        return false;
      }
      const dataArray = this.dataSource.filteredData || this.dataSource.data;
      if (row < 0 || row >= dataArray.length) {
        return false;
      }
      actualRow = dataArray[row];
    } else {
      actualRow = row;
    }
    
    if (!actualRow) {
      return false;
    }
    
    return actualRow['expanded'] === true;
  }

  getDetailRowContext(row: PurposefulAny): any {
    const baseContext = this.detailRowContext || {};
    return {
      $implicit: row,
      ...baseContext,
      includeDetailRowHeader: this.includeDetailRowHeader
    };
  }

  getRowColor(row: PurposefulAny): string {
    if (!this.rowColorColumn || !row) {
      return this.defaultRowColor;
    }
    const color = row[this.rowColorColumn];
    return color && typeof color === 'string' ? color : this.defaultRowColor;
  }

  toggleExpandAll(): void {
    if (this.expandAllCallback) {
      const newState = !this.isAllExpanded;
      this.isAllExpanded = newState;
      this.expandAllCallback(newState);
    }
  }

  private updatePageSizeState(): void {
    const userDefaultRaw = Number(this.authService.getUser()?.defaultPageSize);
    const userDefaultPageSize = Number.isFinite(userDefaultRaw) && userDefaultRaw > 0
      ? Math.trunc(userDefaultRaw)
      : 10;

    this.effectiveItemsPerPage = userDefaultPageSize;

    const sanitizedOptions = (this.pageSizeOptions || [])
      .map(option => Number(option))
      .filter(option => Number.isFinite(option) && option > 0)
      .map(option => Math.trunc(option));

    const mergedOptions = [...sanitizedOptions, this.effectiveItemsPerPage];
    this.effectivePageSizeOptions = Array.from(new Set(mergedOptions)).sort((a, b) => a - b);

    if (this.paginator) {
      this.paginator.pageSize = this.effectiveItemsPerPage;
    }
  }
}

