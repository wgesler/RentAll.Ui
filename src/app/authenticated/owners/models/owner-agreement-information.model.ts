export interface OwnerAgreementInformationRequest {
  ownerAgreementInformationId?: string;
  organizationId: string;
  officeId?: number | null;
  propertyId?: string | null;
  agreementIntroduction?: string | null;
  recitals?: string | null;
  sectionOneEmployment?: string | null;
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
  sectionTwelveAdditionalDutiesAndRights?: string | null;
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

export interface OwnerAgreementInformationResponse {
  ownerAgreementInformationId?: string;
  organizationId: string;
  officeId?: number | null;
  propertyId?: string | null;
  agreementIntroduction?: string | null;
  recitals?: string | null;
  sectionOneEmployment?: string | null;
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
  sectionTwelveAdditionalDutiesAndRights?: string | null;
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

export function replaceOwnerAgreementInformationSections(
  html: string,
  content: Partial<OwnerAgreementInformationRequest> | null | undefined
): string {
  const agreementInformation = content ?? {};
  const sectionOneEmployment = agreementInformation.sectionOneEmployment || agreementInformation.sectionOneEmploymentOfAvenueWest || '';
  const normalizedSectionOneEmployment = sectionOneEmployment.replace(
    /commencing on\s*\./gi,
    'commencing on ______________________.'
  );
  const sectionTwelveAdditionalDutiesAndRights = agreementInformation.sectionTwelveAdditionalDutiesAndRights || agreementInformation.sectionTwelveAdditionalDutiesAndRightsOfAvenueWest || '';
  return html
    .replace(/\{\{agreementIntroductionSection\}\}/g, agreementInformation.agreementIntroduction || '')
    .replace(/\{\{recitalsSection\}\}/g, agreementInformation.recitals || '')
    .replace(/\{\{sectionOneEmploymentSection\}\}/g, normalizedSectionOneEmployment)
    .replace(/\{\{sectionOneEmploymentOfAvenueWestSection\}\}/g, normalizedSectionOneEmployment)
    .replace(/\{\{sectionTwoAgentDutiesSection\}\}/g, agreementInformation.sectionTwoAgentDuties || '')
    .replace(/\{\{sectionThreeOwnersDutiesSection\}\}/g, agreementInformation.sectionThreeOwnersDuties || '')
    .replace(/\{\{sectionFourAdvertisingAndPromotionSection\}\}/g, agreementInformation.sectionFourAdvertisingAndPromotion || '')
    .replace(/\{\{sectionFiveMaintenanceRepairsAndOperationsSection\}\}/g, agreementInformation.sectionFiveMaintenanceRepairsAndOperations || '')
    .replace(/\{\{sectionSixReimbursementsSection\}\}/g, agreementInformation.sectionSixReimbursements || '')
    .replace(/\{\{sectionSevenGovernmentRegulationsSection\}\}/g, agreementInformation.sectionSevenGovernmentRegulations || '')
    .replace(/\{\{sectionEightInsuranceSection\}\}/g, agreementInformation.sectionEightInsurance || '')
    .replace(/\{\{sectionNineCollectionOfIncomeAndInstitutionOfLegalActionSection\}\}/g, agreementInformation.sectionNineCollectionOfIncomeAndInstitutionOfLegalAction || '')
    .replace(/\{\{sectionTenBankAccountsSection\}\}/g, agreementInformation.sectionTenBankAccounts || '')
    .replace(/\{\{sectionElevenRecordsAndReportsSection\}\}/g, agreementInformation.sectionElevenRecordsAndReports || '')
    .replace(/\{\{sectionTwelveAdditionalDutiesAndRightsSection\}\}/g, sectionTwelveAdditionalDutiesAndRights)
    .replace(/\{\{sectionTwelveAdditionalDutiesAndRightsOfAvenueWestSection\}\}/g, sectionTwelveAdditionalDutiesAndRights)
    .replace(/\{\{sectionThirteenTerminationAndRenewalSection\}\}/g, agreementInformation.sectionThirteenTerminationAndRenewal || '')
    .replace(/\{\{sectionFourteenSaleOfPropertyAccessSection\}\}/g, agreementInformation.sectionFourteenSaleOfPropertyAccess || '')
    .replace(/\{\{sectionFifteenSummaryOfFeesSection\}\}/g, agreementInformation.sectionFifteenSummaryOfFees || '')
    .replace(/\{\{sectionSixteenForeignOwnershipSection\}\}/g, agreementInformation.sectionSixteenForeignOwnership || '')
    .replace(/\{\{sectionSeventeenIndemnitySection\}\}/g, agreementInformation.sectionSeventeenIndemnity || '')
    .replace(/\{\{sectionEighteenMiscellaneousSection\}\}/g, agreementInformation.sectionEighteenMiscellaneous || '')
    .replace(/\{\{sectionNineteenAdditionalFormsSection\}\}/g, agreementInformation.sectionNineteenAdditionalForms || '')
    .replace(/\{\{inWitnessWhereofSection\}\}/g, agreementInformation.inWitnessWhereof || '');
}
