export enum UserGroups {
  Unknown = 0,
  SuperAdmin = 1,
  Admin = 2,
  Accounting = 3,
  Agent = 4,
  PropertyManager = 5,
  Facilities = 6,
  Housekeeping = 7,
  Corporation = 8,
  Client = 9
}

export function getUserGroup(userGroupId: number | undefined): string {
  if (userGroupId === undefined || userGroupId === null) return '';
  
  const groupMap: { [key: number]: string } = {
    [UserGroups.Unknown]: 'Unknown',
    [UserGroups.SuperAdmin]: 'Super Admin',
    [UserGroups.Admin]: 'Admin',
    [UserGroups.Accounting]: 'Accounting',
    [UserGroups.Agent]: 'Agent',
    [UserGroups.PropertyManager]: 'Property Manager',
    [UserGroups.Facilities]: 'Facilities',
    [UserGroups.Housekeeping]: 'Housekeeping',
    [UserGroups.Corporation]: 'Corporation',
    [UserGroups.Client]: 'Client'
  };
  
  return groupMap[userGroupId] || '';
}
