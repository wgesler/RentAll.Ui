import { ReceiptPrefill } from '../../../maintenance/models/receipt.model';

export interface CreditReportSplitResponse {
  workOrderId?: string | null;
  workOrderCode?: string | null;
  receiptTypeId: number;
}

export interface CreditReportLineResponse {
  chargeDate?: string | null;
  amount: number;
  vendorName?: string | null;
  vendorId?: string | null;
  cardLastFour?: string | null;
  bankCardId?: number | null;
  bankCardDisplayName?: string | null;
  cardTypeId?: number | null;
  description?: string | null;
  receiptId?: string | null;
  receiptCode?: string | null;
  receiptDraftId?: string | null;
  draftCode?: string | null;
  isUtility?: boolean;
  splits?: CreditReportSplitResponse[];
}

export interface CreditReportResponse {
  fileName?: string | null;
  completeMatches: CreditReportLineResponse[];
  draftMatches: CreditReportLineResponse[];
  createdDrafts: CreditReportLineResponse[];
  unknownMatches: CreditReportLineResponse[];
  warnings: string[];
}

export interface CreditReportLineEdit {
  receiptId?: string | null;
  receiptDraftId?: string | null;
  lineKey?: string | null;
  prefill?: ReceiptPrefill | null;
}

export interface CreditReportLineDisplay {
  lineKey: string;
  chargeDate: string;
  vendor: string;
  workOrderDisplay: string;
  amount: string;
  bankCardId?: number | null;
  bankCardDropdown?: { value: string; isOverridable: boolean; options: string[]; toString: () => string };
  cardOwner: string;
  documentCode: string;
  description: string;
  isComplete: boolean;
  isDraft: boolean;
  isMissing: boolean;
  isUnknown: boolean;
  receiptId?: string | null;
  receiptDraftId?: string | null;
  sourceLine?: CreditReportLineResponse;
}
