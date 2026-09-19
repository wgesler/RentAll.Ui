import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { ColumnData, ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListRow } from './mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-list-table',
  imports: [MaterialModule, FormsModule],
  templateUrl: './mobile-list-table.component.html',
  styleUrl: './mobile-list-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileListTableComponent implements OnChanges {
  @Input() rows: MobileListRow[] = [];
  @Input() columns: ColumnSet = {};
  @Input() isPageReady = false;
  @Input() showFilter = false;
  @Input() rowsClickable = false;
  @Input() rowNumberLabel = '#';
  @Input() showAttentionColumn = false;
  @Output() rowClick = new EventEmitter<MobileListRow>();
  private cdr = inject(ChangeDetectorRef);
  private formatter = inject(FormatterService);
  filterText = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows'] || changes['columns'] || changes['isPageReady']) {
      this.cdr.markForCheck();
    }
  }

  get filteredRows(): MobileListRow[] {
    const query = this.filterText.trim().toLowerCase();
    if (!query) {
      return this.rows;
    }
    const columnNames = Object.keys(this.columns);
    return this.rows.filter(row => columnNames.some(name => {
      const raw = String(row[name] ?? '').toLowerCase();
      const display = this.formatter.formatEntityCodeForDisplay(row[name]).toLowerCase();
      return raw.includes(query) || display.includes(query);
    }));
  }

  getColumnEntries(): { name: string; column: ColumnData }[] {
    return Object.entries(this.columns).map(([name, column]) => ({ name, column }));
  }

  getCellValue(row: MobileListRow, name: string): string {
    return this.formatter.formatEntityCodeForDisplay(row[name]);
  }

  hasAttentionDot(row: MobileListRow): boolean {
    return !!row['attentionDot'];
  }

  onFilterChange(): void {
    this.cdr.markForCheck();
  }

  clearFilter(): void {
    this.filterText = '';
    this.cdr.markForCheck();
  }

  onRowClick(row: MobileListRow): void {
    if (!this.rowsClickable) {
      return;
    }
    this.rowClick.emit(row);
  }
}
