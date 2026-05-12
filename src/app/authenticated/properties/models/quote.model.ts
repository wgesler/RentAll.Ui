export interface QuoteListingRow {
  propertyId: string;
  propertyCode: string;
  address: string;
  area: string;
  beds: string;
  price: string;
  parking: string;
  petFriendly: string;
  petFee: string;
  url: string;
}

export interface QuotePropertyListingLink extends QuoteListingRow {
  officeId: number | null;
}
