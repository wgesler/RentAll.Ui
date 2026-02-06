import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, SimpleChanges, TemplateRef, ViewChild } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { take } from 'rxjs';
import { FormatterService } from '../../../../app/services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PurposefulAny } from '../../../shared/models/amorphous';
import { SelectionModel } from '@angular/cdk/collections';
import { Status, getStatus } from '../../../enums/status.enum';
import { ColumnData, ColumnSet, defaultColumnData } from './models/column-data';
import { ButtonData } from './models/button-data';
import { TableItem } from './models/table-item';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss'],
})

export class DataTableComponent implements OnChanges, OnInit {
  // Expose Math for use in template
  Math = Math;
  
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
  @Input() hasActionsCopy: boolean = false;
  @Input() hasActionsDelete: boolean = false;
  @Input() hasActionsDownload: boolean = false;
  @Input() hasActionsEdit: boolean = false;
  @Input() hasActionsLock: boolean = false;
  @Input() hasActionsPayable: boolean = false;
  @Input() hasActionsPrint: boolean = false;
  @Input() hasActionsRestore: boolean = false;
  @Input() hasActionsRowClick: boolean = false;
  @Input() hasActionsSave: boolean = false;
  @Input() hasActionsSelect: boolean = false;
  @Input() hasActionsView: boolean = false;

  @Input() isColumnFirstActions: boolean = false;
  @Input() areColumnsUniform: boolean = false;

  @Input() actionTooltipSelect: string = '';

  @Input() buttonDisabledTop: boolean = false;
  @Input() buttonIconTop: string = 'add';
  @Input() buttonTextTop: string = 'Add';
  @Input() buttonColorTop: string = 'accent';
  @Input() buttonToggleTextTop: string = 'Advanced Mode';

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

  @Output() buttonEvent = new EventEmitter<PurposefulAny>();
  @Output() cancelEvent = new EventEmitter<PurposefulAny>();
  @Output() copyEvent = new EventEmitter<PurposefulAny>();
  @Output() deleteEvent = new EventEmitter<PurposefulAny>();
  @Output() downloadEvent = new EventEmitter<PurposefulAny>();
  @Output() dropdownChangeEvent = new EventEmitter<PurposefulAny>();
  @Output() editEvent = new EventEmitter<PurposefulAny>();
  @Output() lockEvent = new EventEmitter<PurposefulAny>();
  @Output() payableEvent = new EventEmitter<PurposefulAny>();
  @Output() printEvent = new EventEmitter<PurposefulAny>();
  @Output() restoreEvent = new EventEmitter<PurposefulAny>();
  @Output() rowClickEvent = new EventEmitter<PurposefulAny>();
  @Output() saveEvent = new EventEmitter<PurposefulAny>();
  @Output() selectEvent = new EventEmitter<PurposefulAny>();
  @Output() viewEvent = new EventEmitter<PurposefulAny>();
  @Output() contactClickEvent = new EventEmitter<PurposefulAny>();
  @Output() topButtonEvent = new EventEmitter<boolean>();
  @Output() topToggleButtonEvent = new EventEmitter<boolean>();

  @Output() selectionSet = new EventEmitter<PurposefulAny>();

  buttons: ButtonData[] = [];
  dataSource = new MatTableDataSource<TableItem>();
  isDataLoaded: boolean = false;
  filterVal: string = null;

  tableColumns: ColumnData[] = [];
  
  getHeaderAlignment(column: ColumnData): string {
    return column.headerAlignment || column.alignment || 'left';
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
    
    const alignment = lastColumn.headerAlignment || lastColumn.alignment || 'left';
    return alignment === 'right';
  }
  
  displayedColumns: string[] = [];

  selection = new SelectionModel<string>(true, []);
  isAllSelected: boolean = false;
  isToggle: boolean = false;
  selectAllToolTip: string = 'Select all visible checks';

  constructor(private zone: NgZone, private formatter: FormatterService, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    // Use a filterPredicate to make sure the table only filters on visible columns
    this.dataSource.filterPredicate = (item: TableItem, filter: string): boolean =>
      this.displayedColumns.map(column => 
        item[column]?.toString().toLocaleLowerCase() ?? '').some(value => value.includes(filter));   

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
          return value[0]?.toLocaleLowerCase() ?? '';
        default:
          return value;
      }
    };
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
    this.dataSource.filter = this.filterVal.trim().toLocaleLowerCase();
    if (resetPage) this.dataSource?.paginator.firstPage();
  }

  clearFilter(input: HTMLInputElement): void {
    input.value = '';
    this.dataSource.filter = '';
    this.filterVal = '';

    this.dataSource?.paginator.firstPage();
  }

  emitAddEvent(): void {
    this.topButtonEvent.emit(true);
  }

  emitToggleEvent(): void {
    this.topToggleButtonEvent.emit(true);
  }

  emitLockEvent(_event: Event, rowItem: PurposefulAny): void {
    this.lockEvent.emit(rowItem);
  }

  emitPayableEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.payableEvent.emit(rowItem);
  }

  emitPrintEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.printEvent.emit(rowItem);
  }

  emitCopyEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.copyEvent.emit(rowItem);
  }

  emitEditEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.editEvent.emit(rowItem);
  }

  emitRestoreEvent(_event: Event, rowItem: PurposefulAny): void {
    this.restoreEvent.emit(rowItem);
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
    this.deleteEvent.emit(rowItem);
  }
  
  emitCancelEvent(_event: Event, rowItem: PurposefulAny): void {
    this.cancelEvent.emit(rowItem);
  }

  emitViewEvent(event: Event, rowItem: PurposefulAny): void {
    event.stopPropagation();
    this.viewEvent.emit(rowItem);
  }

  emitRowClickEvent(rowItem: PurposefulAny): void {
    // Only emit if row clicks are enabled
    if (this.hasActionsRowClick) {
      this.rowClickEvent.emit(rowItem);
    }
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

  emitDropdownChangeEvent(rowItem: PurposefulAny): void {
    this.dropdownChangeEvent.emit(rowItem);
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
  private naturalSortKey(value: string): string {
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

  private setTableColumns(): void {
    let columns = {} as ColumnSet;
    // order here is important
    if (this.hasActionsSelect)
      columns['select'] = { displayAs: this.columnTextSelect ?? 'Select', sort: false, wrap: false };
    if (this.hasColumnIndex)
      columns['no'] = { displayAs: 'No.', wrap: false, sort: false };

    columns = {...columns, ...this.columns};
    
    if (this.hasActionsEdit || this.hasActionsDelete || this.hasActionsSave || this.hasActionsRestore || this.hasActionsDownload || this.hasActionsView || this.hasActionsPayable || this.hasActionsCopy || this.hasColumnDynamicAction)
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

  private setActions(): void {
    this.buttons = [];
    if (this.hasActionsLock)     this.buttons.push({name: 'lock', callback: (event, rowItem) => this.emitLockEvent(event, rowItem), color: 'accent', tooltip: 'Locked', tooltipPosition: 'before', icon: 'lock', suspendOnUpdate: true});
    if (this.hasActionsView)     this.buttons.push({name: 'view', callback: (event, rowItem) => this.emitViewEvent(event, rowItem), color: '#4CAF50', tooltip: 'View', tooltipPosition: 'before', icon: 'visibility', suspendOnUpdate: false});
    if (this.hasActionsEdit)     this.buttons.push({name: 'edit', callback: (event, rowItem) => this.emitEditEvent(event, rowItem), color: '#7E69B4', tooltip: 'Edit', tooltipPosition: 'before', icon: 'edit', suspendOnUpdate: false});
    if (this.hasActionsCopy)     this.buttons.push({name: 'copy', callback: (event, rowItem) => this.emitCopyEvent(event, rowItem), color: '#1E40AF', tooltip: 'Copy', tooltipPosition: 'before', icon: 'content_copy', suspendOnUpdate: false});
    if (this.hasActionsPayable)  this.buttons.push({name: 'payable', callback: (event, rowItem) => this.emitPayableEvent(event, rowItem), color: '#4CAF50', tooltip: 'Payable', tooltipPosition: 'before', icon: 'attach_money', suspendOnUpdate: false});
    if (this.hasActionsPrint)    this.buttons.push({name: 'print', callback: (event, rowItem) => this.emitPrintEvent(event, rowItem), color: '#2196F3', tooltip: 'Print', tooltipPosition: 'before', icon: 'print', suspendOnUpdate: false});
    if (this.hasActionsRestore)  this.buttons.push({name: 'restore', callback: (event, rowItem) => this.emitRestoreEvent(event, rowItem), color: '#A64D79', tooltip: 'Restore', tooltipPosition: 'before', icon: 'restore', suspendOnUpdate: false});
    if (this.hasActionsSave)     this.buttons.push({name: 'save', callback: (event, rowItem) => this.emitSaveEvent(event, rowItem), color: '#93C47D', tooltip: 'Save', tooltipPosition: 'after', icon: 'save', suspendOnUpdate: false});
    if (this.hasActionsDownload) this.buttons.push({name: 'download', callback: (event, rowItem) => this.emitDownloadEvent(event, rowItem), color: '#E69138', tooltip: 'View / Download', tooltipPosition: 'after', icon: 'download', suspendOnUpdate: false});
    if (this.hasActionsDelete)   this.buttons.push({name: 'delete', callback: (event, rowItem) => this.emitDeleteEvent(event, rowItem), color: '#FA6868', tooltip: 'Delete', tooltipPosition: 'after', icon: 'delete', suspendOnUpdate: false});
    if (this.hasActionsCancel)   this.buttons.push({name: 'cancel', callback: (event, rowItem) => this.emitCancelEvent(event, rowItem), color: '#3F51B5', tooltip: 'Cancel', tooltipPosition: 'after', icon: 'cancel', suspendOnUpdate: false});
  }

  private setTableTools(): void {
    this.isDataLoaded = false;
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      this.setData();
      // Load viewChild components that load separately from rest of component.
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.isDataLoaded = true;
    });
  }

  private setData(): void {
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

