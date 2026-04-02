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
  Housekeeping = 10,
  Company = 11,
  Vendor = 12,
  Tenant = 13,
  Owner = 14,
  Inspector = 15
}

// Employee tab includes every role except Owner, Inspector, and Housekeeping.
export const EMPLOYEE_USER_GROUPS: UserGroups[] = [
  UserGroups.Unknown,
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.Accounting,
  UserGroups.AccountingAdmin,
  UserGroups.Agent,
  UserGroups.AgentAdmin,
  UserGroups.PropertyManager,
  UserGroups.PropertyManagerAdmin,
  UserGroups.Facilities,
  UserGroups.Company,
  UserGroups.Vendor,
  UserGroups.Tenant
];

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
    [UserGroups.Housekeeping]: 'Housekeeping',
    [UserGroups.Company]: 'Company',
    [UserGroups.Vendor]: 'Vendor',
    [UserGroups.Tenant]: 'Tenant',
    [UserGroups.Owner]: 'Owner',
    [UserGroups.Inspector]: 'Inspector'
  };
  
  return groupMap[userGroupId] || '';
}

export enum StartupPage {
  Dashboard = 0,
  Boards = 1,
  Reservations = 2,
  Properties = 3,
  Accounting = 4,
  Organizations = 5
}

export function getStartupPage(startupPage: number | undefined): string {
  if (startupPage === undefined || startupPage === null) return '';
  
  const pageSizeMap: { [key: number]: string } = {
    [StartupPage.Dashboard]: 'Dashboard',
    [StartupPage.Boards]: 'Boards',
    [StartupPage.Reservations]: 'Reservations',
    [StartupPage.Properties]: 'Properties',
    [StartupPage.Accounting]: 'Accounting',
    [StartupPage.Organizations]: 'Organizations'
  };
  
  return pageSizeMap[startupPage] || '';
}
