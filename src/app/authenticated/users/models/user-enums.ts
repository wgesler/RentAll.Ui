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
  OwnerAdmin = 16
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
