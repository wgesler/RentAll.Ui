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

// Gets the array of contact type options for dropdowns (filtered to specific types)
export function getContactTypes(): { value: number, label: string }[] {
  const includedTypes = [EntityType.Company, EntityType.Tenant, EntityType.Owner, EntityType.Vendor, EntityType.Hoa];
  return includedTypes
    .map(value => ({
      value: value,
      label: getEntityType(value)
    }));
}

