import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
export class MobileListTableComponent {
  @Input() rows: MobileListRow[] = [];
  @Input() columns: ColumnSet = {};
  @Input() isPageReady = false;
  @Input() showFilter = false;
  @Input() rowsClickable = false;
  @Input() rowNumberLabel = '#';
  @Input() attentionDotColumn = '';
  @Output() rowClick = new EventEmitter<MobileListRow>();
  private cdr = inject(ChangeDetectorRef);
  filterText = '';

  get filteredRows(): MobileListRow[] {
    const query = this.filterText.trim().toLowerCase();
    if (!query) {
      return this.rows;
    }
    const columnNames = Object.keys(this.columns);
    return this.rows.filter(row => columnNames.some(name => String(row[name] ?? '').toLowerCase().includes(query)));
  }

  getColumnEntries(): { name: string; column: ColumnData }[] {
    return Object.entries(this.columns).map(([name, column]) => ({ name, column }));
  }

  getCellValue(row: MobileListRow, name: string): string {
    return String(row[name] ?? '');
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
