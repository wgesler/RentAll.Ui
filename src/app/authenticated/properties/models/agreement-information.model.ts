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

export function replaceAgreementInformationSections(
  html: string,
  agreementInformation: Partial<AgreementInformationRequest> | null | undefined
): string {
  const content = agreementInformation ?? {};
  return html
    .replace(/\{\{agreementIntroductionSection\}\}/g, content.agreementIntroduction || '')
    .replace(/\{\{recitalsSection\}\}/g, content.recitals || '')
    .replace(/\{\{sectionOneEmploymentOfAvenueWestSection\}\}/g, content.sectionOneEmploymentOfAvenueWest || '')
    .replace(/\{\{sectionTwoAgentDutiesSection\}\}/g, content.sectionTwoAgentDuties || '')
    .replace(/\{\{sectionThreeOwnersDutiesSection\}\}/g, content.sectionThreeOwnersDuties || '')
    .replace(/\{\{sectionFourAdvertisingAndPromotionSection\}\}/g, content.sectionFourAdvertisingAndPromotion || '')
    .replace(/\{\{sectionFiveMaintenanceRepairsAndOperationsSection\}\}/g, content.sectionFiveMaintenanceRepairsAndOperations || '')
    .replace(/\{\{sectionSixReimbursementsSection\}\}/g, content.sectionSixReimbursements || '')
    .replace(/\{\{sectionSevenGovernmentRegulationsSection\}\}/g, content.sectionSevenGovernmentRegulations || '')
    .replace(/\{\{sectionEightInsuranceSection\}\}/g, content.sectionEightInsurance || '')
    .replace(/\{\{sectionNineCollectionOfIncomeAndInstitutionOfLegalActionSection\}\}/g, content.sectionNineCollectionOfIncomeAndInstitutionOfLegalAction || '')
    .replace(/\{\{sectionTenBankAccountsSection\}\}/g, content.sectionTenBankAccounts || '')
    .replace(/\{\{sectionElevenRecordsAndReportsSection\}\}/g, content.sectionElevenRecordsAndReports || '')
    .replace(/\{\{sectionTwelveAdditionalDutiesAndRightsOfAvenueWestSection\}\}/g, content.sectionTwelveAdditionalDutiesAndRightsOfAvenueWest || '')
    .replace(/\{\{sectionThirteenTerminationAndRenewalSection\}\}/g, content.sectionThirteenTerminationAndRenewal || '')
    .replace(/\{\{sectionFourteenSaleOfPropertyAccessSection\}\}/g, content.sectionFourteenSaleOfPropertyAccess || '')
    .replace(/\{\{sectionFifteenSummaryOfFeesSection\}\}/g, content.sectionFifteenSummaryOfFees || '')
    .replace(/\{\{sectionSixteenForeignOwnershipSection\}\}/g, content.sectionSixteenForeignOwnership || '')
    .replace(/\{\{sectionSeventeenIndemnitySection\}\}/g, content.sectionSeventeenIndemnity || '')
    .replace(/\{\{sectionEighteenMiscellaneousSection\}\}/g, content.sectionEighteenMiscellaneous || '')
    .replace(/\{\{sectionNineteenAdditionalFormsSection\}\}/g, content.sectionNineteenAdditionalForms || '')
    .replace(/\{\{inWitnessWhereofSection\}\}/g, content.inWitnessWhereof || '');
}
