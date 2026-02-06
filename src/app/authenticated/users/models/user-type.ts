export enum UserGroups {
  Unknown = 0,
  SuperAdmin = 1,
  Admin = 2,
  Accounting = 3,
  AccountingAdmin = 4,
  Agent = 5,
  AgentAdmin = 6,
  PropertyManager = 7,
  PropertyManagerAdmin = 8,
  Facilities = 9,
  FacilitiesAdmin = 10,
  Housekeeping = 11,
  HousekeepingAdmin = 12,
  Corporation = 13,
  CorporationAdmin = 14,
  Vendor = 15,
  VendorAdmin = 16,
  Client = 17
}

export function getUserGroup(userGroupId: number | undefined): string {
  if (userGroupId === undefined || userGroupId === null) return '';
  
  const groupMap: { [key: number]: string } = {
    [UserGroups.Unknown]: 'Unknown',
    [UserGroups.SuperAdmin]: 'SuperAdmin',
    [UserGroups.Admin]: 'Admin',
    [UserGroups.Accounting]: 'Accounting',
    [UserGroups.AccountingAdmin]: 'Accounting-Admin',
    [UserGroups.Agent]: 'Agent',
    [UserGroups.AgentAdmin]: 'Agent-Admin',
    [UserGroups.PropertyManager]: 'PropertyManager',
    [UserGroups.PropertyManagerAdmin]: 'PropertyManager-Admin',
    [UserGroups.Facilities]: 'Facilities',
    [UserGroups.FacilitiesAdmin]: 'Facilities-Admin',
    [UserGroups.Housekeeping]: 'Housekeeping',
    [UserGroups.HousekeepingAdmin]: 'Housekeeping-Admin',
    [UserGroups.Corporation]: 'Corporation',
    [UserGroups.CorporationAdmin]: 'Corporation-Admin',
    [UserGroups.Vendor]: 'Vendor',
    [UserGroups.VendorAdmin]: 'Vendor-Admin',
    [UserGroups.Client]: 'Client'
  };
  
  return groupMap[userGroupId] || '';
}
