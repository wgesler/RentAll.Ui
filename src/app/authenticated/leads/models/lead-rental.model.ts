/** API response JSON (camelCase) for `api/leads/rentals`. */
export interface LeadRentalResponse {
  rentalId: number;
  leadStateId: number;
  agentId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  desiredLocation: string | null;
  propertyRefId: string | null;
  estimatedArrivalDate: string | null;
  estimatedDepartureDate: string | null;
  maxMonthlyBudget: number | null;
  minBedrooms: number | null;
  numberOfOccupants: string | null;
  whatBringsYouToTown: string | null;
  howDidYouFindUs: string | null;
  tellUsMoreAboutHowYouFoundUs: string | null;
  petFriendly: boolean | null;
  decisionDate: string | null;
  organizationName: string | null;
  additionalInformation: string | null;
  iNeedAsap: boolean | null;
  emailPhoneConsent: boolean | null;
  smsConsent: boolean | null;
  isActive?: boolean;
}

/** List row: API fields plus display-only columns for the data table. */
export interface LeadRentalListDisplay extends LeadRentalResponse {
  fullName: string;
  leadStateLabel: string;
  isActive: boolean;
}

/** POST `api/leads/rentals` body (CreateLeadRentalDto). */
export interface LeadRentalCreateRequest {
  leadStateId: number;
  agentId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  desiredLocation: string | null;
  propertyRefId: string | null;
  estimatedArrivalDate: string | null;
  estimatedDepartureDate: string | null;
  maxMonthlyBudget: number | null;
  minBedrooms: number | null;
  numberOfOccupants: string | null;
  whatBringsYouToTown: string | null;
  howDidYouFindUs: string | null;
  tellUsMoreAboutHowYouFoundUs: string | null;
  petFriendly: boolean | null;
  decisionDate: string | null;
  organizationName: string | null;
  additionalInformation: string | null;
  iNeedAsap: boolean | null;
  emailPhoneConsent: boolean | null;
  smsConsent: boolean | null;
  isActive?: boolean;
}

/** PUT `api/leads/rentals` body (UpdateLeadRentalDto). */
export interface LeadRentalUpdateRequest extends LeadRentalCreateRequest {
  rentalId: number;
}
