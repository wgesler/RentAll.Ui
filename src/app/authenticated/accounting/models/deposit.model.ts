import type { CalendarDateString } from '../../../services/utility.service';

export interface DepositSplit {
  depositSplitId?: number | null;
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

export interface DepositSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  isActive?: boolean | null;
  includeInactive?: boolean;
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
}

export interface DepositRequest {
  depositId?: string;
  organizationId: string;
  officeId: number;
  depositDate: string;
  accountingPeriod: string;
  amount: number;
  description: string;
  propertyId?: string | null;
  bankAccountId?: number | null;
  splits: DepositSplit[];
  journalEntryId?: string | null;
  isActive: boolean;
}

export interface DepositResponse {
  depositId: string;
  depositCode: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyIds: string[];
  depositDate: string;
  accountingPeriod: string;
  description: string;
  amount: number;
  bankAccountId?: number | null;
  bankAccountDisplayName?: string;
  splits: DepositSplit[];
  journalEntryId?: string | null;
  isActive: boolean;
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface DepositDisplayList {
  depositId: string;
  depositCode: string;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  depositDate: string;
  propertyCode?: string;
  reservationCode?: string;
  contactName?: string;
  amount: number;
  amountDisplay?: string;
  splits: DepositSplit[];
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

export interface DepositSelection {
  depositId: string | null;
  officeId: number | null;
  propertyId: string | null;
  deposit?: DepositResponse | null;
}
