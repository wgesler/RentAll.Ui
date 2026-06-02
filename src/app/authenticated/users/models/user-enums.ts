//#region UserGroups
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
  Inspector = 15,
  OwnerAdmin = 16,
  OfficeAdmin = 17
}

export const UserGroupLabels: { value: UserGroups, label: string }[] = [
  { value: UserGroups.SuperAdmin, label: 'Super Admin' },
  { value: UserGroups.Admin, label: 'Admin' },
  { value: UserGroups.Accounting, label: 'Accounting' },
  { value: UserGroups.AccountingAdmin, label: 'Accounting Admin' },
  { value: UserGroups.Agent, label: 'Agent' },
  { value: UserGroups.AgentAdmin, label: 'Agent Admin' },
  { value: UserGroups.PropertyManager, label: 'Property Manager' },
  { value: UserGroups.PropertyManagerAdmin, label: 'Property Manager Admin' },
  { value: UserGroups.Facilities, label: 'Facilities' },
  { value: UserGroups.Housekeeping, label: 'Housekeeping' },
  { value: UserGroups.Company, label: 'Company' },
  { value: UserGroups.Vendor, label: 'Vendor' },
  { value: UserGroups.Tenant, label: 'Tenant' },
  { value: UserGroups.Owner, label: 'Owner' },
  { value: UserGroups.Inspector, label: 'Inspector' },
  { value: UserGroups.OwnerAdmin, label: 'Owner Admin' },
  { value: UserGroups.OfficeAdmin, label: 'Office Admin' },
];

export function getUserGroup(userGroupId: number | undefined): string {
  if (userGroupId === undefined || userGroupId === null) {
    return '';
  }

  const groupMap: { [key: number]: string } = {
    [UserGroups.Unknown]: 'Unknown',
    [UserGroups.SuperAdmin]: 'Super Admin',
    [UserGroups.Admin]: 'Admin',
    [UserGroups.Accounting]: 'Accounting',
    [UserGroups.AccountingAdmin]: 'Accounting Admin',
    [UserGroups.Agent]: 'Agent',
    [UserGroups.AgentAdmin]: 'Agent Admin',
    [UserGroups.PropertyManager]: 'Property Manager',
    [UserGroups.PropertyManagerAdmin]: 'Property Manager Admin',
    [UserGroups.Facilities]: 'Facilities',
    [UserGroups.Housekeeping]: 'Housekeeping',
    [UserGroups.Company]: 'Company',
    [UserGroups.Vendor]: 'Vendor',
    [UserGroups.Tenant]: 'Tenant',
    [UserGroups.Owner]: 'Owner',
    [UserGroups.Inspector]: 'Inspector',
    [UserGroups.OwnerAdmin]: 'Owner Admin',
    [UserGroups.OfficeAdmin]: 'Office Admin',
  };

  return groupMap[userGroupId] || '';
}

export function getUserGroupLabel(userGroupId: number, userGroups?: { value: number, label: string }[]): string {
  if (userGroups && userGroups.length > 0) {
    const found = userGroups.find(group => group.value === userGroupId);
    return found?.label || getUserGroup(userGroupId);
  }

  return getUserGroup(userGroupId) || 'Unknown';
}

export function getUserGroups(): { value: number, label: string }[] {
  return UserGroupLabels.map(group => ({
    value: group.value,
    label: group.label
  }));
}

export function getUserGroupOptions(): { value: string, label: string }[] {
  return Object.keys(UserGroups)
    .filter(key => isNaN(Number(key)))
    .filter(key => UserGroups[key as keyof typeof UserGroups] !== UserGroups.Unknown)
    .map(key => ({
      value: key,
      label: getUserGroup(UserGroups[key as keyof typeof UserGroups])
    }));
}
//#endregion

//#region StartupPage
export enum StartupPage {
  Dashboard = 0,
  Boards = 1,
  Reservations = 2,
  Properties = 3,
  Accounting = 4,
  Organizations = 5
}

export function getStartupPage(startupPage: number | undefined): string {
  if (startupPage === undefined || startupPage === null) {
    return '';
  }

  const pageMap: { [key: number]: string } = {
    [StartupPage.Dashboard]: 'Dashboard',
    [StartupPage.Boards]: 'Boards',
    [StartupPage.Reservations]: 'Reservations',
    [StartupPage.Properties]: 'Properties',
    [StartupPage.Accounting]: 'Accounting',
    [StartupPage.Organizations]: 'Organizations'
  };

  return pageMap[startupPage] || '';
}

export function getStartupPages(): { value: number, label: string }[] {
  return Object.keys(StartupPage)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: StartupPage[key as keyof typeof StartupPage],
      label: getStartupPage(StartupPage[key as keyof typeof StartupPage])
    }));
}
//#endregion
