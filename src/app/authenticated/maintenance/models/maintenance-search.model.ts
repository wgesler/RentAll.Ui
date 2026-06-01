/** Body for POST maintenance/receipt/search and maintenance/work-order/search. */
export interface MaintenanceListSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  includeInactive?: boolean;
  /** Calendar date (yyyy-MM-dd). */
  startDate?: string | null;
  /** Calendar date (yyyy-MM-dd). */
  endDate?: string | null;
}
