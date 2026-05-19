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
  const sectionOneEmployment = normalizeSectionListItemNumbers(agreementInformation.sectionOneEmployment || agreementInformation.sectionOneEmploymentOfAvenueWest || '');
  const normalizedSectionOneEmployment = sectionOneEmployment.replace(
    /commencing on\s*\./gi,
    'commencing on ______________________.'
  );
  const sectionTwoAgentDuties = normalizeSectionListItemNumbers(agreementInformation.sectionTwoAgentDuties || '');
  const sectionThreeOwnersDuties = normalizeSectionListItemNumbers(agreementInformation.sectionThreeOwnersDuties || '');
  const sectionFourAdvertisingAndPromotion = normalizeSectionListItemNumbers(agreementInformation.sectionFourAdvertisingAndPromotion || '');
  const sectionFiveMaintenanceRepairsAndOperations = normalizeSectionListItemNumbers(agreementInformation.sectionFiveMaintenanceRepairsAndOperations || '');
  const sectionSixReimbursements = normalizeSectionListItemNumbers(agreementInformation.sectionSixReimbursements || '');
  const sectionSevenGovernmentRegulations = normalizeSectionListItemNumbers(agreementInformation.sectionSevenGovernmentRegulations || '');
  const sectionEightInsurance = normalizeSectionListItemNumbers(agreementInformation.sectionEightInsurance || '');
  const sectionNineCollectionOfIncomeAndInstitutionOfLegalAction = normalizeSectionListItemNumbers(agreementInformation.sectionNineCollectionOfIncomeAndInstitutionOfLegalAction || '');
  const sectionTenBankAccounts = normalizeSectionListItemNumbers(agreementInformation.sectionTenBankAccounts || '');
  const sectionElevenRecordsAndReports = normalizeSectionListItemNumbers(agreementInformation.sectionElevenRecordsAndReports || '');
  const sectionTwelveAdditionalDutiesAndRights = normalizeSectionListItemNumbers(
    agreementInformation.sectionTwelveAdditionalDutiesAndRights || agreementInformation.sectionTwelveAdditionalDutiesAndRightsOfAvenueWest || ''
  );
  const sectionThirteenTerminationAndRenewal = normalizeSectionListItemNumbers(agreementInformation.sectionThirteenTerminationAndRenewal || '');
  const sectionFourteenSaleOfPropertyAccess = normalizeSectionListItemNumbers(agreementInformation.sectionFourteenSaleOfPropertyAccess || '');
  const sectionFifteenSummaryOfFees = normalizeSectionListItemNumbers(agreementInformation.sectionFifteenSummaryOfFees || '');
  const sectionSixteenForeignOwnership = normalizeSectionListItemNumbers(agreementInformation.sectionSixteenForeignOwnership || '');
  const sectionSeventeenIndemnity = normalizeSectionListItemNumbers(agreementInformation.sectionSeventeenIndemnity || '');
  const sectionEighteenMiscellaneous = normalizeSectionListItemNumbers(agreementInformation.sectionEighteenMiscellaneous || '');
  const sectionNineteenAdditionalForms = normalizeSectionListItemNumbers(agreementInformation.sectionNineteenAdditionalForms || '');
  const normalizedInWitnessWhereof = (agreementInformation.inWitnessWhereof || '')
    .replace(/Owner Signature Agent/gi, '')
    .replace(/Print Name Date/gi, '')
    .replace(/_{5,}/g, '')
    .replace(/^\s*Date\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return html
    .replace(/\{\{agreementIntroductionSection\}\}/g, agreementInformation.agreementIntroduction || '')
    .replace(/\{\{recitalsSection\}\}/g, agreementInformation.recitals || '')
    .replace(/\{\{sectionOneEmploymentSection\}\}/g, normalizedSectionOneEmployment)
    .replace(/\{\{sectionOneEmploymentOfAvenueWestSection\}\}/g, normalizedSectionOneEmployment)
    .replace(/\{\{sectionTwoAgentDutiesSection\}\}/g, sectionTwoAgentDuties)
    .replace(/\{\{sectionThreeOwnersDutiesSection\}\}/g, sectionThreeOwnersDuties)
    .replace(/\{\{sectionFourAdvertisingAndPromotionSection\}\}/g, sectionFourAdvertisingAndPromotion)
    .replace(/\{\{sectionFiveMaintenanceRepairsAndOperationsSection\}\}/g, sectionFiveMaintenanceRepairsAndOperations)
    .replace(/\{\{sectionSixReimbursementsSection\}\}/g, sectionSixReimbursements)
    .replace(/\{\{sectionSevenGovernmentRegulationsSection\}\}/g, sectionSevenGovernmentRegulations)
    .replace(/\{\{sectionEightInsuranceSection\}\}/g, sectionEightInsurance)
    .replace(/\{\{sectionNineCollectionOfIncomeAndInstitutionOfLegalActionSection\}\}/g, sectionNineCollectionOfIncomeAndInstitutionOfLegalAction)
    .replace(/\{\{sectionTenBankAccountsSection\}\}/g, sectionTenBankAccounts)
    .replace(/\{\{sectionElevenRecordsAndReportsSection\}\}/g, sectionElevenRecordsAndReports)
    .replace(/\{\{sectionTwelveAdditionalDutiesAndRightsSection\}\}/g, sectionTwelveAdditionalDutiesAndRights)
    .replace(/\{\{sectionTwelveAdditionalDutiesAndRightsOfAvenueWestSection\}\}/g, sectionTwelveAdditionalDutiesAndRights)
    .replace(/\{\{sectionThirteenTerminationAndRenewalSection\}\}/g, sectionThirteenTerminationAndRenewal)
    .replace(/\{\{sectionFourteenSaleOfPropertyAccessSection\}\}/g, sectionFourteenSaleOfPropertyAccess)
    .replace(/\{\{sectionFifteenSummaryOfFeesSection\}\}/g, sectionFifteenSummaryOfFees)
    .replace(/\{\{sectionSixteenForeignOwnershipSection\}\}/g, sectionSixteenForeignOwnership)
    .replace(/\{\{sectionSeventeenIndemnitySection\}\}/g, sectionSeventeenIndemnity)
    .replace(/\{\{sectionEighteenMiscellaneousSection\}\}/g, sectionEighteenMiscellaneous)
    .replace(/\{\{sectionNineteenAdditionalFormsSection\}\}/g, sectionNineteenAdditionalForms)
    .replace(/\{\{inWitnessWhereofSection\}\}/g, normalizedInWitnessWhereof);
}

function normalizeSectionListItemNumbers(sectionHtml: string): string {
  if (!sectionHtml) {
    return '';
  }

  return sectionHtml.replace(/(<li[^>]*>\s*)(\d+\.\d+\.\s*)/gi, '$1');
}
