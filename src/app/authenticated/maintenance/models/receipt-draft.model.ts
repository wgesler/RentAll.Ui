import { FileDetails } from '../../documents/models/document.model';
import type { CalendarDateString } from '../../../services/utility.service';
import { Split } from './receipt.model';

export enum ReceiptDraftSourceFlags {
  None = 0,
  Upload = 1,
  StatementImport = 2
}

export interface ReceiptDraftSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  isActive?: boolean | null;
  includeInactive?: boolean;
  includePromoted?: boolean;
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
  receiptKind?: number | null;
  vendorId?: string | null;
  draftSourceFlags?: ReceiptDraftSourceFlags | null;
}

export interface ReceiptDraftRequest {
  receiptDraftId?: string;
  organizationId: string;
  officeId?: number | null;
  propertyIds: string[];
  receiptDate?: CalendarDateString | null;
  dueDate?: CalendarDateString | null;
  accountingPeriod?: CalendarDateString | null;
  billNumber?: string | null;
  amount: number;
  description?: string | null;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  paidAmount?: number | null;
  paidDate?: CalendarDateString | null;
  paymentDescription?: string | null;
  splits: Split[];
  agreementLineId?: number | null;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  paymentTypeId?: number;
  checkPrinted?: boolean;
  isUtility?: boolean;
  businessPrivate?: boolean;
  isActive: boolean;
  draftSourceFlags: ReceiptDraftSourceFlags;
  extractionJson?: string | null;
}

export interface ReceiptDraftResponse {
  receiptDraftId: string;
  draftCode: string;
  organizationId: string;
  officeId?: number | null;
  officeName: string;
  propertyIds: string[];
  receiptDate?: CalendarDateString | null;
  dueDate?: CalendarDateString | null;
  accountingPeriod?: CalendarDateString | null;
  billNumber?: string | null;
  amount: number;
  description?: string | null;
  bankCardId?: number | null;
  bankCardDisplayName?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  paidAmount?: number | null;
  paidDate?: CalendarDateString | null;
  paymentDescription?: string | null;
  splits: Split[];
  agreementLineId?: number | null;
  agreementLineNotes?: string | null;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  paymentTypeId?: number;
  checkPrinted?: boolean;
  isUtility?: boolean;
  businessPrivate?: boolean;
  draftSourceFlags: ReceiptDraftSourceFlags;
  hasUploadSource: boolean;
  hasStatementImportSource: boolean;
  promotedReceiptId?: string | null;
  promotedReceiptCode?: string | null;
  promotedOn?: string | null;
  promotedBy?: string | null;
  isPromoted: boolean;
  extractionJson?: string | null;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptDraftDisplayList {
  receiptDraftId: string;
  draftCode: string;
  receiptDate: string;
  description: string;
  amount: string;
  officeName: string;
  bankCardDisplayName: string;
  sourceLabels: string;
  statusLabel: string;
  isPromoted: boolean;
  rowColor?: string;
}

export interface PromoteReceiptDraftResponse {
  draft?: ReceiptDraftResponse | null;
  receipt: {
    receiptId: string;
    receiptCode: string;
    officeId?: number;
    propertyIds?: string[];
  };
}
