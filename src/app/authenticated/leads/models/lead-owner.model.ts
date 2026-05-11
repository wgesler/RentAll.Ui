/** API response JSON (camelCase) for `api/leads/owners`. */
export interface LeadOwnerResponse {
  ownerId: number;
  leadStateId: number;
  agentId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  locationOfProperty: string | null;
  programInterest: string | null;
  whatIsPromptingContact: string | null;
  timeFrame: boolean | null;
  targetRentReadyDate: string | null;
  propertyGoals: string | null;
  tellUsMoreAboutYourGoals: string | null;
  yearsOfExperienceWithRentals: number | null;
  tellUsMoreAboutProperty: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  numberOfBeds: string | null;
  numberOfBaths: string | null;
  approxSqFootage: string | null;
  typeOfProperty: string | null;
  tellUsWhatYouLikeMostAboutYourProperty: string | null;
  tellUsAnyDrawbacks: string | null;
  preferredContactMethod: string | null;
  timeDateForContact: string | null;
  emailPhoneConsent: boolean | null;
  smsConsent: boolean | null;
  isActive?: boolean;
}

/** List row: API fields plus display-only columns for the data table. */
export interface LeadOwnerListDisplay extends LeadOwnerResponse {
  fullName: string;
  leadStateLabel: string;
  isActive: boolean;
}

/** POST `api/leads/owners` body (CreateLeadOwnerDto). */
export interface LeadOwnerCreateRequest {
  leadStateId: number;
  agentId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  locationOfProperty: string | null;
  programInterest: string | null;
  whatIsPromptingContact: string | null;
  timeFrame: boolean | null;
  targetRentReadyDate: string | null;
  propertyGoals: string | null;
  tellUsMoreAboutYourGoals: string | null;
  yearsOfExperienceWithRentals: number | null;
  tellUsMoreAboutProperty: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  numberOfBeds: string | null;
  numberOfBaths: string | null;
  approxSqFootage: string | null;
  typeOfProperty: string | null;
  tellUsWhatYouLikeMostAboutYourProperty: string | null;
  tellUsAnyDrawbacks: string | null;
  preferredContactMethod: string | null;
  timeDateForContact: string | null;
  emailPhoneConsent: boolean | null;
  smsConsent: boolean | null;
  isActive?: boolean;
}

/** PUT `api/leads/owners` body (UpdateLeadOwnerDto). */
export interface LeadOwnerUpdateRequest extends LeadOwnerCreateRequest {
  ownerId: number;
}
