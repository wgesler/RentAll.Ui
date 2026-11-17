export type DataTableStickySortDirection = 'asc' | 'desc' | '';

export interface DataTableStickyState {
  enabled: boolean;
  tableName: string;
  filterText: string;
  sortColumn: string;
  sortDirection: DataTableStickySortDirection;
}
