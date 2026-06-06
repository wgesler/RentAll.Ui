import { ManagementFeeType, normalizeManagementFeeTypeId } from '../../properties/models/property-enums';

export interface OwnerAgreementInformationRequest {
  ownerAgreementInformationId?: string;
  organizationId: string;
  officeId?: number | null;
  propertyId?: string | null;
  agreementIntroduction?: string | null;
  recitals?: string | null;
  sectionOneEmployment?: string | null;
  sectionOneEmploymentSplit?: string | null;
  sectionOneEmploymentMinimum?: string | null;
  sectionOneEmploymentFlat?: string | null;
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
  sectionOneEmploymentSplit?: string | null;
  sectionOneEmploymentMinimum?: string | null;
  sectionOneEmploymentFlat?: string | null;
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

export interface ReplaceOwnerAgreementInformationOptions {
  managementFeeTypeId?: number | null;
}

const SECTION_ONE_ITEM_FOUR_PLACEHOLDER = /\{\{\s*sectionOneItemFourLi\s*\}\}/i;

const SECTION_ONE_ITEM_FOUR_DEFAULTS: Record<'split' | 'minimum' | 'flat', string> = {
  split: 'Owner is returned {{ownerSplit}} of the adjusted gross rents, with {{companyName}} credited with {{companySplit}} of the adjusted gross rents. Owner\'s return will be prorated based on actual number of days contracted to tenant. Adjusted gross rents shall mean gross rents less applicable taxes, referral fees, maid service fees and other direct costs of booking the unit. {{companyName}} will target an adjusted gross rent of <span class="inline-underline-fill">{{monthlyRent}}</span> monthly.',
  minimum: 'Owner is returned {{ownerSplit}} of the adjusted gross rents, with {{companyName}} credited with {{companySplit}} of the adjusted gross rents. Owner will receive a minimum per month, when rented, of <span class="inline-underline-fill">{{ownerMinimumMonthly}}</span>. Owner\'s return will be prorated based on actual number of days contracted to tenant. Adjusted gross rents shall mean gross rents less applicable taxes, referral fees, maid service fees and other direct costs of booking the unit. {{companyName}} will target an adjusted gross rent of <span class="inline-underline-fill">{{monthlyRent}}</span> monthly.',
  flat: 'Owner is returned <span class="inline-underline-fill">{{ownerFlatMonthly}}</span> per month. Owner\'s return will be prorated based on actual number of days contracted to tenant.'
};

export function replaceOwnerAgreementInformationSections(
  html: string,
  content: Partial<OwnerAgreementInformationRequest> | null | undefined,
  options?: ReplaceOwnerAgreementInformationOptions
): string {
  const agreementInformation = content ?? {};
  const sectionOneEmploymentShell = agreementInformation.sectionOneEmployment || agreementInformation.sectionOneEmploymentOfAvenueWest || '';
  const sectionOneItemFourLi = buildSectionOneItemFourLi(agreementInformation, options?.managementFeeTypeId, sectionOneEmploymentShell);
  let sectionOneEmployment = injectSectionOneItemFourIntoEmploymentShell(sectionOneEmploymentShell, sectionOneItemFourLi);
  sectionOneEmployment = normalizeSectionListItemNumbers(sectionOneEmployment);
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

function buildSectionOneItemFourLi(
  agreementInformation: Partial<OwnerAgreementInformationRequest>,
  managementFeeTypeId: number | null | undefined,
  sectionOneEmploymentShell: string
): string {
  const paragraph = resolveSectionOneItemFourParagraph(agreementInformation, managementFeeTypeId, sectionOneEmploymentShell);
  return wrapSectionOneItemFourAsListItem(normalizeSectionListItemNumbers(paragraph));
}

function resolveSectionOneItemFourParagraph(
  agreementInformation: Partial<OwnerAgreementInformationRequest>,
  managementFeeTypeId: number | null | undefined,
  sectionOneEmploymentShell: string
): string {
  const mode = normalizeManagementFeeTypeId(managementFeeTypeId ?? ManagementFeeType.FlatRate);
  const configured = readConfiguredSectionOneItemFourParagraph(agreementInformation, mode);
  if (configured.trim()) {
    return configured;
  }

  const legacyParagraph = extractLegacySectionOneItemFourParagraph(sectionOneEmploymentShell);
  if (legacyParagraph.trim()) {
    return legacyParagraph;
  }

  if (mode === ManagementFeeType.FlatRate) {
    return SECTION_ONE_ITEM_FOUR_DEFAULTS.flat;
  }
  if (mode === ManagementFeeType.Minimum) {
    return SECTION_ONE_ITEM_FOUR_DEFAULTS.minimum;
  }
  return SECTION_ONE_ITEM_FOUR_DEFAULTS.split;
}

function readConfiguredSectionOneItemFourParagraph(
  agreementInformation: Partial<OwnerAgreementInformationRequest>,
  mode: ManagementFeeType
): string {
  if (mode === ManagementFeeType.FlatRate) {
    return agreementInformation.sectionOneEmploymentFlat || '';
  }
  if (mode === ManagementFeeType.Minimum) {
    return agreementInformation.sectionOneEmploymentMinimum || '';
  }
  return agreementInformation.sectionOneEmploymentSplit || '';
}

function injectSectionOneItemFourIntoEmploymentShell(shell: string, sectionOneItemFourLi: string): string {
  const trimmedShell = String(shell || '').trim();
  if (!trimmedShell) {
    return '';
  }
  if (!String(sectionOneItemFourLi || '').trim()) {
    return trimmedShell.replace(/\{\{\s*sectionOneItemFourLi\s*\}\}/gi, '');
  }
  if (SECTION_ONE_ITEM_FOUR_PLACEHOLDER.test(trimmedShell)) {
    return trimmedShell.replace(/\{\{\s*sectionOneItemFourLi\s*\}\}/gi, sectionOneItemFourLi);
  }

  const replacedFourthLi = replaceLegacySectionOneFourthListItem(trimmedShell, sectionOneItemFourLi);
  if (replacedFourthLi !== trimmedShell) {
    return replacedFourthLi;
  }

  return trimmedShell.replace(/<\/ol>/i, `${sectionOneItemFourLi}</ol>`);
}

function replaceLegacySectionOneFourthListItem(shell: string, sectionOneItemFourLi: string): string {
  const listMatch = shell.match(/<ol\b[^>]*>[\s\S]*?<\/ol>/i);
  if (!listMatch || listMatch.index == null) {
    return shell;
  }
  const listHtml = listMatch[0];
  const listItems = [...listHtml.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)];
  if (listItems.length < 4 || listItems[3].index == null) {
    return shell;
  }

  const fourthItem = listItems[3];
  const updatedListHtml = `${listHtml.slice(0, fourthItem.index)}${sectionOneItemFourLi}${listHtml.slice(fourthItem.index! + fourthItem[0].length)}`;
  return `${shell.slice(0, listMatch.index)}${updatedListHtml}${shell.slice(listMatch.index + listHtml.length)}`;
}

function extractLegacySectionOneItemFourParagraph(shell: string): string {
  if (SECTION_ONE_ITEM_FOUR_PLACEHOLDER.test(shell)) {
    return '';
  }
  const listMatch = shell.match(/<ol\b[^>]*>[\s\S]*?<\/ol>/i);
  if (!listMatch) {
    return '';
  }
  const listItems = [...listMatch[0].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (listItems.length < 4) {
    return '';
  }
  return String(listItems[3][1] || '').trim();
}

function wrapSectionOneItemFourAsListItem(content: string): string {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^<li\b/i.test(trimmed)) {
    return trimmed;
  }
  return `<li>${trimmed}</li>`;
}

function normalizeSectionListItemNumbers(sectionHtml: string): string {
  if (!sectionHtml) {
    return '';
  }

  return sectionHtml.replace(/(<li[^>]*>\s*)(\d+\.\d+\.\s*)/gi, '$1');
}
