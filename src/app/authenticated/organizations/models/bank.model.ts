import { FileDetails } from '../../../shared/models/fileDetails';

export interface BankCardRequest {
  bankCardId?: number;
  cardTypeId: number;
  cardName: string;
  cardNumber: string;
  chartOfAccountId?: number | null;
}

export interface BankCardResponse {
  bankCardId: number;
  organizationId: string;
  officeId: number;
  cardTypeId: number;
  cardName: string;
  displayName: string;
  cardNumber: string;
  rawCardNumber?: string;
  lastFour: string;
  chartOfAccountId?: number | null;
}

export interface BankCardPanResponse {
  cardNumber: string;
}

export interface BankAccountRequest {
  bankName: string;
  bankPhone?: string | null;
  bankRouting?: string | null;
  bankSwiftCode?: string | null;
  bankAddress?: string | null;
  accountNo?: string | null;
  accountNoLastFour?: string | null;
  currentCheckNumber: number;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
  checkHtml?: string | null;
  useOnInvoices: boolean;
}

export interface BankAccountResponse {
  bankAccountId: number;
  organizationId: string;
  officeId: number;
  bankName: string;
  bankPhone?: string | null;
  bankRouting?: string | null;
  bankSwiftCode?: string | null;
  bankAddress?: string | null;
  accountNo?: string | null;
  accountNoLastFour?: string | null;
  currentCheckNumber: number;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
  checkStockPreviewDataUrl?: string | null;
  checkStockPdfThumbnailUrl?: string | null;
  checkStockFileName?: string | null;
  hasNewCheckStockUpload?: boolean;
  checkStockRemoved?: boolean;
  checkHtml?: string | null;
  useOnInvoices: boolean;
  bankAccountVisible?: boolean;
  bankAccountFocused?: boolean;
}
