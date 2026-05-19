export interface OwnerFormShareResponse {
  shareId: string;
  ownerId: number;
  token: string;
  expiresOn: string;
}

export interface PublicOwnerFormSubmitRequest {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  locationOfProperty: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  adjustedGrossRentTarget: number | string | null;
  onlineFeeRentReady: number | string | null;
  onlineCleanHourlyFee: number | string | null;
  workingBalanceEscrow: number | string | null;
  annualLinenCustomAmount: number | string | null;
  furnishingFeeAmount: number | string | null;
  offlineFee: number | string | null;
  furnishingKitchenItemsRequested: boolean;
  furnishingKitchenItemsAmount: number | string | null;
  furnishingFullUnitRequested: boolean;
  furnishingFullUnitEstimateAmount: number | string | null;
  annualLinenTierStudio1Bedroom: boolean;
  annualLinenTier2Bedroom: boolean;
  annualLinenTier3Bedroom: boolean;
  numberOfBeds: string | null;
  numberOfBaths: string | null;
  approxSqFootage: string | null;
  propertyTypeId: number | null;
  propertyCode: string | null;
  propertyOffice: string | null;
  propertyGoals: string | null;
  tellUsMoreAboutYourGoals: string | null;
  tellUsMoreAboutProperty: string | null;
  tellUsWhatYouLikeMostAboutYourProperty: string | null;
  tellUsAnyDrawbacks: string | null;
  preferredContactMethod: string | null;
  timeDateForContact: string | null;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  onSiteComplexManagementPhone: string | null;
  keyCount: string | null;
  garageRemoteModelCode: string | null;
  storageAccessDetails: string | null;
  cableSupplier: string | null;
  cablePhone: string | null;
  cableAccountNumber: string | null;
  electricSupplier: string | null;
  electricPhone: string | null;
  electricAccountNumber: string | null;
  internetSupplier: string | null;
  internetPhone: string | null;
  internetAccountNumber: string | null;
  fuseBoxLocation: string | null;
  schoolDistrict: string | null;
  localEmergencyContact: string | null;
  accessInformation: string | null;
}

export interface PublicOwnerFormResponse {
  ownerId: number;
  ownerName: string | null;
  expiresOn: string;
  form: PublicOwnerFormSubmitRequest;
}
