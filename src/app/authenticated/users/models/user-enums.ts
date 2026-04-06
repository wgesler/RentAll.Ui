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

/** Owner / Housekeeping / Inspector / Vendor tabs. If a user's roles are only from this set, they do not appear on the Employees tab. */
export const SPECIALTY_ONLY_TAB_USER_GROUPS: UserGroups[] = [
  UserGroups.Owner,
  UserGroups.Housekeeping,
  UserGroups.Inspector,
  UserGroups.Vendor
];

/** Staff roles for the Employees tab (hasAnyUserGroup). Users with only roles in SPECIALTY_ONLY_TAB_USER_GROUPS are excluded in user-list applyFilters. */
export const EMPLOYEE_USER_GROUPS: UserGroups[] = [
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.Accounting,
  UserGroups.AccountingAdmin,
  UserGroups.Agent,
  UserGroups.AgentAdmin,
  UserGroups.PropertyManager,
  UserGroups.PropertyManagerAdmin,
  UserGroups.Facilities,
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
