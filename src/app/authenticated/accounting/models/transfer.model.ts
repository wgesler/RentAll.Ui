import type { CalendarDateString } from '../../../services/utility.service';

export interface TransferSplit {
  transferSplitId?: number | null;
  amount: number;
  description: string;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  journalEntryLineId?: string | null;
  chartOfAccountId?: number | null;
  chartOfAccountDisplayName?: string | null;
}

export interface TransferSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  isActive?: boolean | null;
  includeInactive?: boolean;
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
}

export interface TransferRequest {
  transferId?: string;
  organizationId: string;
  officeId: number;
  transferDate: string;
  accountingPeriod: string;
  amount: number;
  description: string;
  propertyId?: string | null;
  bankAccountId?: number | null;
  splits: TransferSplit[];
  journalEntryId?: string | null;
  isActive: boolean;
}

export interface TransferResponse {
  transferId: string;
  transferCode: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyIds: string[];
  transferDate: string;
  accountingPeriod: string;
  description: string;
  amount: number;
  bankAccountId?: number | null;
  bankAccountDisplayName?: string;
  splits: TransferSplit[];
  journalEntryId?: string | null;
  isActive: boolean;
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface TransferDisplayList {
  transferId: string;
  transferCode: string;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  transferDate: string;
  propertyCode?: string;
  amount: number;
  amountDisplay?: string;
  splits: TransferSplit[];
  splitTotalAmount?: number;
  splitTotalDisplay?: string;
  splitSummaryDisplay?: string;
  bankAccountId?: number | null;
  bankAccountDisplay?: string;
  accountDisplay?: string;
  notes?: string;
  isSplitAmountValid?: boolean;
  descriptionDisplay?: string;
  isActive: boolean;
  period?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface TransferSelection {
  transferId: string | null;
  officeId: number | null;
  propertyId: string | null;
}
