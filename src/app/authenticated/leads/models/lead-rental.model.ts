import type { LeadStateDropdownCell } from './lead-enums';

export interface LeadRentalRequest {
  rentalId?: number;
  leadStateId: number;
  officeId: number;
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
  notes: string | null;
  quotePath: string | null;
  iNeedAsap: boolean;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadRentalResponse {
  rentalId: number;
  organizationId: string;
  officeId: number;
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
  notes: string | null;
  createdOn: string | null;
  createdBy: string | null;
  modifiedOn: string | null;
  modifiedBy: string | null;
  modifiedByName: string | null;
  quotePath: string | null;
  iNeedAsap: boolean;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadRentalListDisplay extends LeadRentalResponse {
  fullName: string;
  leadAttentionDot?: string;
  leadStateDropdown: LeadStateDropdownCell;
}
