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
