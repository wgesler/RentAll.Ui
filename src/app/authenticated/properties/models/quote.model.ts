/** Which optional listing columns to show, from office quote-include flags. */
export interface QuoteListingColumnFlags {
  propertyCode: boolean;
  petFee: boolean;
  departureFee: boolean;
  maidFee: boolean;
}

export interface QuoteListingRow {
  propertyId: string;
  propertyCode: string;
  /** Street + optional suite (e.g. `#402`). */
  addressLine1: string;
  /** City, State Zip */
  addressLine2: string;
  area: string;
  beds: string;
  price: string;
  parking: string;
  petFriendly: string;
  petFee: string;
  departureFee: string;
  maidServiceFee: string;
  url: string;
}

export interface QuotePropertyListingLink extends QuoteListingRow {
  officeId: number | null;
}
