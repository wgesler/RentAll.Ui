//#region EntityType
export enum EntityType {
  Unknown = 0,
  Organization = 1,
  Reservation = 2,
  Company = 3,
  Owner = 4,
  Tenant = 5,
  Vendor = 6,
  Hoa = 7,
  Ticket = 8,
  Property = 9,
  JournalEntry = 10,
  Receipt = 11,
  Deposit = 12,
  Transfer = 13,
  Payment = 14,
  ReceiptDraft = 15
}

export function getEntityType(entityTypeId: number | undefined): string {
  if (entityTypeId === undefined || entityTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [EntityType.Unknown]: 'Unknown',
    [EntityType.Organization]: 'Organization',
    [EntityType.Reservation]: 'Reservation',
    [EntityType.Company]: 'Company',
    [EntityType.Owner]: 'Owner',
    [EntityType.Tenant]: 'Tenant',
    [EntityType.Vendor]: 'Vendor',
    [EntityType.Hoa]: 'HOA',
    [EntityType.Ticket]: 'Ticket',
    [EntityType.Property]: 'Property',
    [EntityType.JournalEntry]: 'Journal Entry',
    [EntityType.Receipt]: 'Receipt',
    [EntityType.Deposit]: 'Deposit',
    [EntityType.Transfer]: 'Transfer',
    [EntityType.Payment]: 'Payment',
    [EntityType.ReceiptDraft]: 'Receipt Draft'
  };
  
  return typeMap[entityTypeId] || '';
}

export function getContactTypes(): { value: number, label: string }[] {
  const includedTypes = [EntityType.Company, EntityType.Tenant, EntityType.Owner, EntityType.Vendor, EntityType.Hoa];
  return includedTypes
    .map(value => ({
      value: value,
      label: getEntityType(value)
    }));
}
//#endregion

//#region OwnerType
export enum OwnerType {
  Individual = 0,
  Company = 1
}

export function getOwnerType(ownerTypeId: number | undefined): string {
  if (ownerTypeId === undefined || ownerTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [OwnerType.Individual]: 'Individual',
    [OwnerType.Company]: 'Company'
  };

  return typeMap[ownerTypeId] || '';
}

export function getOwnerTypes(): { value: number; label: string }[] {
  return Object.keys(OwnerType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: OwnerType[key as keyof typeof OwnerType],
      label: getOwnerType(OwnerType[key as keyof typeof OwnerType])
    }));
}
//#endregion

//#region OwnerDocumentType
export enum OwnerDocumentType {
  DriversLicense = 0,
  Passport = 1,
  IdCard = 2
}

export function getOwnerDocumentType(ownerDocumentTypeId: number | undefined): string {
  if (ownerDocumentTypeId === undefined || ownerDocumentTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [OwnerDocumentType.DriversLicense]: 'Drivers License',
    [OwnerDocumentType.Passport]: 'Passport',
    [OwnerDocumentType.IdCard]: 'ID Card'
  };

  return typeMap[ownerDocumentTypeId] || '';
}

export function getOwnerDocumentTypes(): { value: number; label: string }[] {
  return Object.keys(OwnerDocumentType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: OwnerDocumentType[key as keyof typeof OwnerDocumentType],
      label: getOwnerDocumentType(OwnerDocumentType[key as keyof typeof OwnerDocumentType])
    }));
}
//#endregion

//#region PropertyManagerType
export enum PropertyManagerType {
  Owner = 0,
  PropertyManagementCompany = 1
}

export function getPropertyManagerType(propertyManagerTypeId: number | undefined): string {
  if (propertyManagerTypeId === undefined || propertyManagerTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [PropertyManagerType.Owner]: 'Owner',
    [PropertyManagerType.PropertyManagementCompany]: 'Property Management Company'
  };

  return typeMap[propertyManagerTypeId] || '';
}

export function getPropertyManagerTypes(): { value: number; label: string }[] {
  return Object.keys(PropertyManagerType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: PropertyManagerType[key as keyof typeof PropertyManagerType],
      label: getPropertyManagerType(PropertyManagerType[key as keyof typeof PropertyManagerType])
    }));
}
//#endregion

//#region FederalTaxType
export enum FederalTaxType {
  IndividualProprietor = 0,
  CCorporation = 1,
  SCorporation = 2,
  Partnership = 3,
  TrustEstate = 4
}

export function getFederalTaxType(federalTaxTypeId: number | undefined): string {
  if (federalTaxTypeId === undefined || federalTaxTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [FederalTaxType.IndividualProprietor]: 'Individual Proprietor',
    [FederalTaxType.CCorporation]: 'C Corporation',
    [FederalTaxType.SCorporation]: 'S Corporation',
    [FederalTaxType.Partnership]: 'Partnership',
    [FederalTaxType.TrustEstate]: 'Trust Estate'
  };

  return typeMap[federalTaxTypeId] || '';
}

export function getFederalTaxTypes(): { value: number; label: string }[] {
  return Object.keys(FederalTaxType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: FederalTaxType[key as keyof typeof FederalTaxType],
      label: getFederalTaxType(FederalTaxType[key as keyof typeof FederalTaxType])
    }));
}
//#endregion

//#region OwnerIdType
export enum OwnerIdType {
  SocialSecurity = 0,
  EmployerIdentification = 1
}

export function getOwnerIdType(ownerIdTypeId: number | undefined): string {
  if (ownerIdTypeId === undefined || ownerIdTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [OwnerIdType.SocialSecurity]: 'Social Security',
    [OwnerIdType.EmployerIdentification]: 'Employer Identification'
  };

  return typeMap[ownerIdTypeId] || '';
}

export function getOwnerIdTypes(): { value: number; label: string }[] {
  return Object.keys(OwnerIdType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: OwnerIdType[key as keyof typeof OwnerIdType],
      label: getOwnerIdType(OwnerIdType[key as keyof typeof OwnerIdType])
    }));
}
//#endregion

//#region VendorType
export enum VendorType {
  Individual = 0,
  Company = 1
}

export function getVendorType(vendorTypeId: number | undefined): string {
  if (vendorTypeId === undefined || vendorTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [VendorType.Individual]: 'Individual',
    [VendorType.Company]: 'Company'
  };

  return typeMap[vendorTypeId] || '';
}

export function getVendorTypes(): { value: number; label: string }[] {
  return Object.keys(VendorType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: VendorType[key as keyof typeof VendorType],
      label: getVendorType(VendorType[key as keyof typeof VendorType])
    }));
}
//#endregion

//#region TermType
export enum TermType {
  DueOnReceipt = 0,
  Net10 = 1,
  Net15 = 2,
  Net30 = 3,
  Net60 = 4
}

export function getTermType(termTypeId: number | undefined | null): string {
  if (termTypeId === undefined || termTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [TermType.DueOnReceipt]: 'Due on receipt',
    [TermType.Net10]: 'Net 10',
    [TermType.Net15]: 'Net 15',
    [TermType.Net30]: 'Net 30',
    [TermType.Net60]: 'Net 60'
  };

  return typeMap[termTypeId] || '';
}

export function getTermTypes(): { value: number; label: string }[] {
  return Object.keys(TermType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: TermType[key as keyof typeof TermType],
      label: getTermType(TermType[key as keyof typeof TermType])
    }));
}

export function getPaymentTermDays(paymentTermsId: number | undefined | null): number {
  if (paymentTermsId === undefined || paymentTermsId === null) {
    return 0;
  }

  switch (paymentTermsId) {
    case TermType.Net10:
      return 10;
    case TermType.Net15:
      return 15;
    case TermType.Net30:
      return 30;
    case TermType.Net60:
      return 60;
    case TermType.DueOnReceipt:
    default:
      return 0;
  }
}
//#endregion

