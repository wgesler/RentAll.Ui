export interface BankCardRequest {
  cardTypeId: number;
  cardName: string;
  cardNumber: string;
  costCodeId: number;
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
  costCodeId: number;
}
