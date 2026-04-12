//#region EntityType
export enum EntityType {
  Unknown = 0,
  Organization = 1,
  Reservation = 2,
  Company = 3,
  Owner = 4,
  Tenant = 5,
  Vendor = 6,
  Hoa = 7
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
    [EntityType.Hoa]: 'HOA'
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

