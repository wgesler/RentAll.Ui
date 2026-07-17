import { JournalEntryRecapRowDisplay } from './journal-entry.model';
import { OwnerAccrualReportRowResponse } from './owner-report.model';

export interface EscrowReportRow {
  rowId: string;
  ownerName: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  arBalance: number;
  prepaids: number;
  notCollected: number;
  total: number;
  e2: number;
}

export interface EscrowReportResult {
  reportTitle: string;
  periodLabel: string;
  entityLineLabel: string | null;
  rows: EscrowReportRow[];
  totals: {
    arBalance: number;
    prepaids: number;
    notCollected: number;
    total: number;
    e2: number;
  };
  cushion: number;
  escrowBankBalance: number;
  escrowBankAccountLabel: string;
  transfer: number;
}

export interface EscrowReportBuildRequest {
  accrualRows: OwnerAccrualReportRowResponse[];
  recapRows: JournalEntryRecapRowDisplay[];
  propertyId?: string | null;
  asOfDateLabel: string;
  officeName: string | null;
  cushion: number;
  escrowBankBalance: number;
  escrowBankAccountLabel: string;
}

export interface EscrowReportSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  startDate: string | null;
  endDate: string;
  cushion?: number;
}
