/** Body for POST reservation/billed/rebuild and billed/search — matches API GetBilledMatchupDto. */
export interface BilledMatchupSearchRequest {
  officeIds: number[];
}

export interface BilledMatchupResponse {
  billedId: number;
  organizationId: string;
  officeId: number;
  reservationId: string;
  reservationCode: string;
  startDate: string;
  endDate: string;
  invoiceStart: string;
  billingType: number;
  monthStart: string;
  monthEnd: string;
  periodStart: string;
  periodEnd: string;
  daysStayed: number;
  daysBilled: number;
  rentalFeeLines: string[];
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}
