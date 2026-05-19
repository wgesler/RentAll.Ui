import type { LeadStateDropdownCell } from './lead-enums';

export interface LeadOwnerRequest {
  officeId: number;
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
  adjustedGrossRentTarget?: number | null;
  onlineFee?: number | null;
  onlineClean?: number | null;
  workingBalance?: number | null;
  annualLinenAmount?: number | null;
  offlineFee?: number | null;
  purchaseKitchenItems?: boolean;
  kitchenBudget?: number | null;
  furnishUnit?: boolean;
  furnishBudget?: number | null;
  oneBedroom?: boolean;
  twoBedroom?: boolean;
  threeBedroom?: boolean;
  numberOfBeds: string | null;
  numberOfBaths: string | null;
  approxSqFootage: string | null;
  propertyTypeId: number | null;
  propertyCode: string | null;
  propertyOffice: string | null;
  tellUsWhatYouLikeMostAboutYourProperty: string | null;
  tellUsAnyDrawbacks: string | null;
  preferredContactMethod: string | null;
  timeDateForContact: string | null;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadOwnerUpdateRequest extends LeadOwnerRequest {
  ownerId: number;
}

export interface LeadOwnerResponse {
  ownerId: number;
  organizationId: string;
  officeId: number;
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
  adjustedGrossRentTarget?: number | null;
  onlineFee?: number | null;
  onlineClean?: number | null;
  workingBalance?: number | null;
  annualLinenAmount?: number | null;
  offlineFee?: number | null;
  purchaseKitchenItems?: boolean;
  kitchenBudget?: number | null;
  furnishUnit?: boolean;
  furnishBudget?: number | null;
  oneBedroom?: boolean;
  twoBedroom?: boolean;
  threeBedroom?: boolean;
  numberOfBeds: string | null;
  numberOfBaths: string | null;
  approxSqFootage: string | null;
  propertyTypeId: number | null;
  propertyCode: string | null;
  propertyOffice: string | null;
  tellUsWhatYouLikeMostAboutYourProperty: string | null;
  tellUsAnyDrawbacks: string | null;
  preferredContactMethod: string | null;
  timeDateForContact: string | null;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadOwnerListDisplay extends LeadOwnerResponse {
  fullName: string;
  leadAttentionDot?: string;
  leadStateDropdown: LeadStateDropdownCell;
}
