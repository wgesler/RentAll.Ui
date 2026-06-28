/** Body for POST maintenance/receipt/search and maintenance/work-order/search. */
export interface MaintenanceListSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  isActive?: boolean | null;
  includeInactive?: boolean;
  /** Work-order search only: when true, return only inactive records. */
  inactiveOnly?: boolean;
  /** Calendar date (yyyy-MM-dd). */
  startDate?: string | null;
  /** Calendar date (yyyy-MM-dd). */
  endDate?: string | null;
  /** Receipt search only: 1 = bills, 2 = card receipts; omit for all. */
  receiptKind?: 1 | 2 | null;
}
