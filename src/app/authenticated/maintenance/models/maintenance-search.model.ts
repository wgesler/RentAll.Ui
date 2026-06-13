/** Body for POST maintenance/receipt/search and maintenance/work-order/search. */
export interface MaintenanceListSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  includeInactive?: boolean;
  /** Calendar date (yyyy-MM-dd). */
  startDate?: string | null;
  /** Calendar date (yyyy-MM-dd). */
  endDate?: string | null;
  /** Receipt search only: 1 = bills, 2 = card receipts; omit for all. */
  receiptKind?: 1 | 2 | null;
}
