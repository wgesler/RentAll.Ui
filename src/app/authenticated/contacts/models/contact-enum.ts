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
  Receipt = 11
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
    [EntityType.Receipt]: 'Receipt'
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
  Trust = 1,
  Business = 2,
  Corporation = 3
}

export function getOwnerType(ownerTypeId: number | undefined): string {
  if (ownerTypeId === undefined || ownerTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [OwnerType.Individual]: 'Individual',
    [OwnerType.Trust]: 'Trust',
    [OwnerType.Business]: 'Business',
    [OwnerType.Corporation]: 'Corporation'
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

