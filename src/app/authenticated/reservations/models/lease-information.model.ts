export interface LeaseInformationRequest {
  leaseInformationId?: string;
  organizationId: string;
  propertyId: string;
  contactId: string;
  rentalPayment?: string | null;
  securityDeposit?: string | null;
  securityDepositWaiver?: string | null;
  cancellationPolicy?: string | null;
  keyPickUpDropOff?: string | null;
  partialMonth?: string | null;
  departureNotification?: string | null;
  holdover?: string | null;
  departureServiceFee?: string | null;
  checkoutProcedure?: string | null;
  parking?: string | null;
  rulesAndRegulations?: string | null;
  occupyingTenants?: string | null;
  utilityAllowance?: string | null;
  maidService?: string | null;
  pets?: string | null;
  smoking?: string | null;
  emergencies?: string | null;
  homeownersAssociation?: string | null;
  indemnification?: string | null;
  defaultClause?: string | null;
  attorneyCollectionFees?: string | null;
  reservedRights?: string | null;
  propertyUse?: string | null;
  miscellaneous?: string | null;
}

export interface LeaseInformationResponse {
  leaseInformationId: string;
  organizationId: string;
  propertyId: string;
  contactId: string;
  rentalPayment?: string | null;
  securityDeposit?: string | null;
  securityDepositWaiver?: string | null;
  cancellationPolicy?: string | null;
  keyPickUpDropOff?: string | null;
  partialMonth?: string | null;
  departureNotification?: string | null;
  holdover?: string | null;
  departureServiceFee?: string | null;
  checkoutProcedure?: string | null;
  parking?: string | null;
  rulesAndRegulations?: string | null;
  occupyingTenants?: string | null;
  utilityAllowance?: string | null;
  maidService?: string | null;
  pets?: string | null;
  smoking?: string | null;
  emergencies?: string | null;
  homeownersAssociation?: string | null;
  indemnification?: string | null;
  defaultClause?: string | null;
  attorneyCollectionFees?: string | null;
  reservedRights?: string | null;
  propertyUse?: string | null;
  miscellaneous?: string | null;
}

