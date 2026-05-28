import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { Component, contentChild, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, SimpleChanges, TemplateRef, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { take } from 'rxjs';
import { effectiveBedTypeIdForPropertySlot, getBedSizeType } from '../../properties/models/property-enums';
import { FormatterService } from '../../../../app/services/formatter-service';
import { getStatus } from '../../../enums/status.enum';
import { MaterialModule } from '../../../material.module';
import { GenericModalComponent } from '../modals/generic/generic-modal.component';
import { GenericModalData } from '../modals/generic/models/generic-modal-data';
import { PurposefulAny } from '../../../shared/models/amorphous';
import { ButtonData } from './models/button-data';
import { ColumnData, ColumnSet, defaultColumnData } from './models/column-data';
import { TableItem } from './models/table-item';
import { DataTableFilterActionsDirective } from './data-table-filter-actions.directive';

@Component({
    standalone: true,
    selector: 'app-data-table',
    imports: [CommonModule, MaterialModule, FormsModule],
    templateUrl: './data-table.component.html',
    styleUrls: ['./data-table.component.scss']
})

export class DataTableComponent implements OnChanges, OnInit {
  // Expose Math for use in template
  Math = Math;

  readonly filterActionsSlot = contentChild(DataTableFilterActionsDirective);

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @Input() data: PurposefulAny[];
  @Input() columns: ColumnSet;

  // NOTE: Update ngOnChanges references if you rename any of these.
  @Input() disableSort: boolean = false;
  @Input() hasButtonSelectAll: boolean = false;
  @Input() hasButtonTop: boolean = false;
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
  @Input() hasActionsRental: boolean = false;
  @Input() hasActionsOwner: boolean = false;
  @Input() hasActionsDelete: boolean = false;
  @Input() confirmDeleteBeforeEmit: boolean = true;
  @Input() deleteConfirmTitle: string = 'Delete?';
  @Input() deleteConfirmMessage: string = 'Are you sure you want to delete this item?';
  @Input() hasActionsDownload: boolean = false;
  @Input() hasActionsEdit: boolean = false;
  @Input() hasActionsLock: boolean = false;
  @Input() hasActionsPayable: boolean = false;
  @Input() hasActionsInvoice: boolean = false;
  @Input() hasActionsPrint: boolean = false;
  @Input() hasActionsQuote: boolean = false;
  @Input() hasActionsRestore: boolean = false;
  @Input() hasActionsClearTracking: boolean = false;
  @Input() hasActionsCheckAll: boolean = false;
  @Input() hasActionsRowClick: boolean = false;
  @Input() hasActionsSave: boolean = false;
  @Input() hasActionsSelect: boolean = false;
  @Input() hasActionsInspect: boolean = false;
  @Input() hasActionsView: boolean = false;

  @Input() isColumnFirstActions: boolean = false;
  @Input() areColumnsUniform: boolean = false;

  @Input() actionTooltipSelect: string = '';

  @Input() buttonDisabledTop: boolean = false;
  @Input() buttonIconTop: string = 'add';
  @Input() buttonTextTop: string = 'Add';
  @Input() buttonColorTop: string = 'accent';
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
  @Input() totalsRow?: { [columnName: string]: string }; // Totals data for each column
  @Input() totalsLabel?: string = 'Total'; // Label for the totals row
  @Input() noDataMessage: string = 'No data found...'; // Message when table has no rows
  @Input() initialFilterVal: string = '';
  @Input() suppressRowClickOnDropdownCells: boolean = true;
  @Input() hasPropertyCodeLink: boolean = false;
  @Input() hasReservationCodeLink: boolean = false;
  @Input() hasWorkOrderCodeLink: boolean = false;
  @Input() subheaderLabel: string = '';
  /** When true, layout-debug orange band wraps only the table/paginator block (below the purple filter row). */
  @Input() dbgBandMainBelowFilter = false;

  @Output() buttonEvent = new EventEmitter<PurposefulAny>();
  @Output() calendarEvent = new EventEmitter<PurposefulAny>();
  @Output() cancelEvent = new EventEmitter<PurposefulAny>();
  @Output() cameraEvent = new EventEmitter<PurposefulAny>();
  @Output() copyEvent = new EventEmitter<PurposefulAny>();
  @Output() linkEvent = new EventEmitter<PurposefulAny>();
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
  @Output() viewEvent = new EventEmitter<PurposefulAny>();
  @Output() attachmentClickEvent = new EventEmitter<PurposefulAny>();
  @Output() quotePathClickEvent = new EventEmitter<PurposefulAny>();
  @Output() contactClickEvent = new EventEmitter<PurposefulAny>();
  @Output() receiptClickEvent = new EventEmitter<PurposefulAny>();
  @Output() propertyCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() reservationCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() workOrderCodeClickEvent = new EventEmitter<PurposefulAny>();
  @Output() inlineEditChangeEvent = new EventEmitter<PurposefulAny>();
  @Output() topButtonEvent = new EventEmitter<boolean>();
  @Output() topToggleButtonEvent = new EventEmitter<boolean>();
  @Output() topToggle2ButtonEvent = new EventEmitter<boolean>();
  @Output() filterValChangeEvent = new EventEmitter<string>();

  @Output() selectionSet = new EventEmitter<PurposefulAny>();

  buttons: ButtonData[] = [];
  dataSource = new MatTableDataSource<TableItem>();
  isDataLoaded: boolean = false;
  filterVal: string = null;

  tableColumns: ColumnData[] = [];
  
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

  getFooterAlignment(column: ColumnData): string {
    if (column.alignment) {
      return column.alignment;
    }
    // Keep previous footer behavior (default right), except date columns should center.
    return this.isDateColumn(column) ? 'center' : 'right';
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

  constructor(
    private zone: NgZone,
    private formatter: FormatterService,    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
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

    const initialFilter = this.normalizeFilterValue(this.initialFilterVal);
    if (initialFilter) {
      this.filterVal = initialFilter;
      this.applyFilter(false);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    let updateActions, updateTools, updateColumns, updateData, updateFilter;
    for (const key in changes) {
      if (!updateActions && ['hasActions'].some(prefix => key.startsWith(prefix))) {
        updateActions = true;
      } else if (!updateTools && ['hasButton', 'hasFilter', 'hasToggle'].some(prefix => key.startsWith(prefix))) {
        updateTools = true;
      } else if (!updateColumns && ['columns', 'hasColumn'].some(prefix => key.startsWith(prefix))) {
        updateColumns = true;
      } else if (key === 'data') {
        updateData = true;
      }
    }

    // only update what changed
    if (updateFilter && this.filterVal) this.applyFilter();
    if (updateActions) this.setActions();
    if (updateColumns) this.setTableColumns();
    if (updateTools) this.setTableTools();
    else if (updateData) this.setData();
  }

  applyFilter(resetPage: boolean = true): void {
    this.filterVal = this.normalizeFilterValue(this.filterVal);
    this.dataSource.filter = this.filterVal;
    this.filterValChangeEvent.emit(this.filterVal);
    if (resetPage) this.dataSource?.paginator.firstPage();
  }

  clearFilter(input: HTMLInputElement): void {
    input.value = '';
    this.dataSource.filter = '';
    this.filterVal = '';
    this.filterValChangeEvent.emit('');

    this.dataSource?.paginator.firstPage();
  }

  onFilterModelChange(value: string): void {
    this.filterVal = value ?? '';
    this.filterValChangeEvent.emit(this.normalizeFilterValue(this.filterVal));
  }

  emitAddEvent(): void {
    this.topButtonEvent.emit(true);
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

  emitRowClickEvent(rowItem: PurposefulAny, event?: MouseEvent): void {
    // Only emit if row clicks are enabled
    if (!this.hasActionsRowClick) {
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
    rowItem.selected = event.checked;
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
    if (column.suppressRowClick === true) {
      return true;
    }
    return !!(this.suppressRowClickOnDropdownCells && (item[columnName]?.options?.length || column.options?.length));
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
    if (!parsedDate) {
      return;
    }
    const nextDate = this.getDateInputValue(parsedDate);
    const currentDate = this.getDateInputValue(rowItem?.[columnName]);
    if (!nextDate || nextDate === currentDate) {
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

  setTableColumns(): void {
    let columns = {} as ColumnSet;
    // order here is important
    if (this.hasActionsSelect)
      columns['select'] = { displayAs: this.columnTextSelect ?? 'Select', sort: false, wrap: false };
    if (this.hasColumnIndex)
      columns['no'] = { displayAs: 'No.', wrap: false, sort: false, maxWidth: '5ch' };

    columns = {...columns, ...this.columns};
    
    if (this.hasActionsEdit || this.hasActionsDelete || this.hasActionsSave || this.hasActionsRestore || this.hasActionsDownload || this.hasActionsView || this.hasActionsInspect || this.hasActionsCamera || this.hasActionsPayable || this.hasActionsInvoice || this.hasActionsCopy || this.hasActionsLink || this.hasActionsRental || this.hasActionsOwner || this.hasActionsCalendar || this.hasActionsQuote || this.hasActionsClearTracking || this.hasActionsCheckAll || this.hasColumnDynamicAction)
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
    if (this.hasActionsLock)     this.buttons.push({name: 'lock', callback: (event, rowItem) => this.emitLockEvent(event, rowItem), color: 'accent', tooltip: 'Locked', tooltipPosition: 'before', icon: 'lock', suspendOnUpdate: true});
    if (this.hasActionsCamera)   this.buttons.push({name: 'camera', callback: (event, rowItem) => this.emitCameraEvent(event, rowItem), color: '#2196F3', tooltip: 'Open Document', tooltipPosition: 'before', icon: 'photo_camera', suspendOnUpdate: false});
    if (this.hasActionsEdit)     this.buttons.push({name: 'edit', callback: (event, rowItem) => this.emitEditEvent(event, rowItem), color: '#7E69B4', tooltip: 'Edit', tooltipPosition: 'before', icon: 'edit', suspendOnUpdate: false});
    if (this.hasActionsInspect)  this.buttons.push({name: 'inspect', callback: (event, rowItem) => this.emitInspectEvent(event, rowItem), color: '#4CAF50', tooltip: 'Open Inspection', tooltipPosition: 'before', icon: 'search', suspendOnUpdate: false});
    if (this.hasActionsCalendar) this.buttons.push({name: 'calendar', callback: (event, rowItem) => this.emitCalendarEvent(event, rowItem), color: '#00897B', tooltip: 'Calendar', tooltipPosition: 'before', icon: 'calendar_month', suspendOnUpdate: false});
    if (this.hasActionsQuote)    this.buttons.push({name: 'quote', callback: (event, rowItem) => this.emitQuoteEvent(event, rowItem), color: '#2E7D32', tooltip: 'Generate Quote', tooltipPosition: 'before', icon: 'request_quote', suspendOnUpdate: false});
    if (this.hasActionsCopy)     this.buttons.push({name: 'copy', callback: (event, rowItem) => this.emitCopyEvent(event, rowItem), color: '#2196F3', tooltip: 'Copy', tooltipPosition: 'before', icon: 'file_copy', suspendOnUpdate: false});
    if (this.hasActionsLink)     this.buttons.push({name: 'link', callback: (event, rowItem) => this.emitLinkEvent(event, rowItem), color: '#FF9800', tooltip: 'Copy Owner Link', tooltipPosition: 'before', icon: 'link', suspendOnUpdate: false});
    if (this.hasActionsRental)   this.buttons.push({name: 'rental', callback: (event, rowItem) => this.emitRentalEvent(event, rowItem), color: '#1976D2', tooltip: 'Convert to Rental Lead', tooltipPosition: 'before', icon: 'home_work', suspendOnUpdate: false});
    if (this.hasActionsOwner)    this.buttons.push({name: 'owner', callback: (event, rowItem) => this.emitOwnerEvent(event, rowItem), color: '#7B1FA2', tooltip: 'Convert Lead to Owner', tooltipPosition: 'before', icon: 'person', suspendOnUpdate: false});
    if (this.hasActionsPayable)  this.buttons.push({name: 'payable', callback: (event, rowItem) => this.emitPayableEvent(event, rowItem), color: '#4CAF50', tooltip: 'Pay', tooltipPosition: 'before', icon: 'attach_money', suspendOnUpdate: false});
    if (this.hasActionsInvoice)  this.buttons.push({name: 'invoice', callback: (event, rowItem) => this.emitInvoiceEvent(event, rowItem), color: '#2E7D32', tooltip: 'Invoices', tooltipPosition: 'before', icon: 'receipt_long', suspendOnUpdate: false});
    if (this.hasActionsView)     this.buttons.push({name: 'view', callback: (event, rowItem) => this.emitViewEvent(event, rowItem), color: '#FF9800', tooltip: 'View', tooltipPosition: 'before', icon: 'visibility', suspendOnUpdate: false});
    if (this.hasActionsPrint)    this.buttons.push({name: 'print', callback: (event, rowItem) => this.emitPrintEvent(event, rowItem), color: '#2196F3', tooltip: 'Print', tooltipPosition: 'before', icon: 'print', suspendOnUpdate: false});
    if (this.hasActionsRestore)  this.buttons.push({name: 'restore', callback: (event, rowItem) => this.emitRestoreEvent(event, rowItem), color: '#A64D79', tooltip: 'Restore', tooltipPosition: 'before', icon: 'restore', suspendOnUpdate: false});
    if (this.hasActionsCheckAll) this.buttons.push({name: 'checkAll', callback: (event, rowItem) => this.emitCheckAllEvent(event, rowItem), color: '#2E7D32', tooltip: 'Check All', tooltipPosition: 'before', icon: 'done', suspendOnUpdate: false});
    if (this.hasActionsClearTracking) this.buttons.push({name: 'clearTracking', callback: (event, rowItem) => this.emitClearTrackingEvent(event, rowItem), color: '#1E88E5', tooltip: 'Clear Tracking', tooltipPosition: 'before', icon: 'restart_alt', suspendOnUpdate: false});
    if (this.hasActionsSave)     this.buttons.push({name: 'save', callback: (event, rowItem) => this.emitSaveEvent(event, rowItem), color: '#93C47D', tooltip: 'Save', tooltipPosition: 'after', icon: 'save', suspendOnUpdate: false});
    if (this.hasActionsDownload) this.buttons.push({name: 'download', callback: (event, rowItem) => this.emitDownloadEvent(event, rowItem), color: '#7E69B4', tooltip: 'View / Download', tooltipPosition: 'after', icon: 'download', suspendOnUpdate: false});
    if (this.hasActionsDelete)   this.buttons.push({name: 'delete', callback: (event, rowItem) => this.emitDeleteEvent(event, rowItem), color: '#FA6868', tooltip: 'Delete', tooltipPosition: 'after', icon: 'delete', suspendOnUpdate: false});
    if (this.hasActionsCancel)   this.buttons.push({name: 'cancel', callback: (event, rowItem) => this.emitCancelEvent(event, rowItem), color: '#3F51B5', tooltip: 'Cancel', tooltipPosition: 'after', icon: 'cancel', suspendOnUpdate: false});
  }

  setTableTools(): void {
    this.isDataLoaded = false;
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      this.setData();
      // Load viewChild components that load separately from rest of component.
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.isDataLoaded = true;
    });
  }

  setData(): void {
    this.dataSource.data = this.data;
    this.selection.clear();
    this.selectionSet.emit(this.selection);
    this.isAllSelected = false;
  }

  setIsAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.paginator.pageSize;
    return numSelected === numRows;
  }

  toggleAllRows(event: MatCheckboxChange): void {
    const currentPageItems = this.getCurrentPageItems();
    if (this.isAllSelected) {
      this.selection.clear();
      this.selectAllToolTip = 'Select all visible checks';
    } else {
      this.selection.select(...currentPageItems);
      this.selectAllToolTip = 'Unselect all visible checks';
    }
    currentPageItems.forEach((i) => { this.emitSelectEvent(event, i) });
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
}

