/** What the pay-request page shows (GET api/reservation/external/pay-request/{token}). */
export interface PayRequestResponse {
  reservationCode: string;
  organizationName: string;
  displayName: string;
  officeName: string;
  logoUrl?: string | null;
  tenantName: string;
  expiresOn: string;
  isCompleted: boolean;
  hasCardOnFile: boolean;
  cardAvailable: boolean;
  bankAvailable: boolean;
}

/** A fresh EasyPay form to show in the iFrame (POST .../pay-request/{token}/card-form). */
export interface PayRequestFormResponse {
  formUrl: string;
}

/** What happened with EasyPay's result (GET api/reservation/external/pay-response/{token}?TXID=..&CID=..). */
export interface PayResponseResponse {
  saved: boolean;
  consentId: number;
  reservationCode?: string | null;
  cardType?: string | null;
  lastFour?: string | null;
  expirationDate?: string | null;
  message: string;
  website?: string | null;
}

export type PayMethodChoice = 'card' | 'bank' | 'both';

/** Message the pay-response page (inside the iFrame) posts to the pay-request page. */
export const PayResponseMessageType = 'rentall-pay-response';
export interface PayResponseMessage {
  type: typeof PayResponseMessageType;
  result: PayResponseResponse;
}

/** The ACH Debit form (POST .../pay-request/{token}/ach, PayRequestAchRequestDto). Numbers go straight to EasyPay. */
export interface PayRequestAchRequest {
  routingNumber: string;
  accountNumber: string;
  confirmAccountNumber: string;
  /** 1 Personal Checking, 2 Personal Savings, 3 Business Checking, 4 Business Savings. */
  accountType: number;
  nameOnAccount: string;
  bankName: string;
  authorized: boolean;
}

/** PayRequestAchResponseDto. */
export interface PayRequestAchResponse {
  saved: boolean;
  consentId: number;
  accountLast4?: string | null;
  accountType?: string | null;
  nameOnAccount?: string | null;
  message: string;
  easyPayCode: number;
  easyPayMessage?: string | null;
}
