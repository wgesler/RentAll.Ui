export type LeadType = 'Rental' | 'Owner' | 'General';

export interface UnifiedLeadRow {
  leadType: LeadType;
  officeId: number;
  leadStateId: number;
  agentId: string | null;
  agentLabel: string;
  createdOn: Date | null;
}

export interface FinalStateRow {
  officeName: string;
  leadType: LeadType;
  leadState: string;
  count: number;
}

export interface OfficeLeadStatusRow {
  officeName: string;
  statuses: string;
  rentalCount: number;
  ownerCount: number;
  generalCount: number;
  totalCount: number;
}

export interface AgentBreakdownRow {
  officeName: string;
  agent: string;
  rentalCount: number;
  ownerCount: number;
  generalCount: number;
  openCount: number;
  closedCount: number;
  totalCount: number;
}
