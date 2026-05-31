export interface AgreementInformationRequest {
  agreementInformationId?: string;
  organizationId: string;
  officeId?: number | null;
  propertyId?: string | null;
  agreementIntroduction?: string | null;
  recitals?: string | null;
  sectionOneEmploymentOfAvenueWest?: string | null;
  sectionTwoAgentDuties?: string | null;
  sectionThreeOwnersDuties?: string | null;
  sectionFourAdvertisingAndPromotion?: string | null;
  sectionFiveMaintenanceRepairsAndOperations?: string | null;
  sectionSixReimbursements?: string | null;
  sectionSevenGovernmentRegulations?: string | null;
  sectionEightInsurance?: string | null;
  sectionNineCollectionOfIncomeAndInstitutionOfLegalAction?: string | null;
  sectionTenBankAccounts?: string | null;
  sectionElevenRecordsAndReports?: string | null;
  sectionTwelveAdditionalDutiesAndRightsOfAvenueWest?: string | null;
  sectionThirteenTerminationAndRenewal?: string | null;
  sectionFourteenSaleOfPropertyAccess?: string | null;
  sectionFifteenSummaryOfFees?: string | null;
  sectionSixteenForeignOwnership?: string | null;
  sectionSeventeenIndemnity?: string | null;
  sectionEighteenMiscellaneous?: string | null;
  sectionNineteenAdditionalForms?: string | null;
  inWitnessWhereof?: string | null;
}

export interface AgreementInformationResponse {
  agreementInformationId: string;
  organizationId: string;
  officeId?: number | null;
  propertyId?: string | null;
  agreementIntroduction?: string | null;
  recitals?: string | null;
  sectionOneEmploymentOfAvenueWest?: string | null;
  sectionTwoAgentDuties?: string | null;
  sectionThreeOwnersDuties?: string | null;
  sectionFourAdvertisingAndPromotion?: string | null;
  sectionFiveMaintenanceRepairsAndOperations?: string | null;
  sectionSixReimbursements?: string | null;
  sectionSevenGovernmentRegulations?: string | null;
  sectionEightInsurance?: string | null;
  sectionNineCollectionOfIncomeAndInstitutionOfLegalAction?: string | null;
  sectionTenBankAccounts?: string | null;
  sectionElevenRecordsAndReports?: string | null;
  sectionTwelveAdditionalDutiesAndRightsOfAvenueWest?: string | null;
  sectionThirteenTerminationAndRenewal?: string | null;
  sectionFourteenSaleOfPropertyAccess?: string | null;
  sectionFifteenSummaryOfFees?: string | null;
  sectionSixteenForeignOwnership?: string | null;
  sectionSeventeenIndemnity?: string | null;
  sectionEighteenMiscellaneous?: string | null;
  sectionNineteenAdditionalForms?: string | null;
  inWitnessWhereof?: string | null;
}
