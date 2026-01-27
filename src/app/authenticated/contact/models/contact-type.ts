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

export function formatContactType(contactTypeId?: number): string {
  if (contactTypeId === undefined || contactTypeId === null) {
    return 'Unknown';
  }
  const typeLabels: { [key: number]: string } = {
    [EntityType.Unknown]: 'Unknown',
    [EntityType.Company]: 'Company',
    [EntityType.Owner]: 'Owner',
    [EntityType.Tenant]: 'Tenant',      
    [EntityType.Vendor]: 'Vendor'
  };
  return typeLabels[contactTypeId] || 'Unknown';
}

