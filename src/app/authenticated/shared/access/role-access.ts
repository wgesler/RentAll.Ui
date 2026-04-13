import { UserGroups } from '../../users/models/user-enums';

export type UserGroupInput = Array<string | number> | undefined;

export interface AccessRule {
  requiredRoles: UserGroups[];
  excludedRoles: UserGroups[];
}

export interface NavItemDefinition extends AccessRule {
  icon: string;
  displayName: string;
  url: string;
}

const ROUTER_TOKEN = {
  Auth: 'auth',
  Dashboard: 'dashboard',
  DashboardOwner: 'dashboard-owner',
  ReservationBoard: 'boards',
  RentalList: 'rentals',
  PropertyList: 'properties',
  MaintenanceList: 'maintenance',
  WorkOrderCreate: 'work-order-create',
  EmailList: 'emails',
  DocumentList: 'documents',
  Contacts: 'contacts',
  AccountingList: 'accounting',
  BillingCreate: 'billing-create',
  InvoiceCreate: 'invoice-create',
  CostCodesList: 'cost-codes',
  OrganizationConfiguration: 'settings',
  OfficeList: 'offices',
  AccountingOfficeList: 'accounting-offices',
  AgentList: 'agents',
  AreaList: 'areas',
  BuildingList: 'buildings',
  RegionList: 'regions',
  ColorList: 'colors',
  UserList: 'users',
  OrganizationList: 'organizations'
} as const;

const openToAllExceptSuperAdmin: AccessRule = {
  requiredRoles: [],
  excludedRoles: [UserGroups.SuperAdmin]
};

const openToAll: AccessRule = {
  requiredRoles: [],
  excludedRoles: []
};

const accountingOnly: AccessRule = {
  requiredRoles: [UserGroups.Accounting, UserGroups.Admin, UserGroups.SuperAdmin],
  excludedRoles: []
};

const adminOnly: AccessRule = {
  requiredRoles: [UserGroups.Admin, UserGroups.SuperAdmin],
  excludedRoles: []
};

const settingsAccess: AccessRule = {
  requiredRoles: [
    UserGroups.Admin,
    UserGroups.SuperAdmin,
    UserGroups.Agent,
    UserGroups.AgentAdmin,
    UserGroups.PropertyManager,
    UserGroups.PropertyManagerAdmin
  ],
  excludedRoles: []
};

const superAdminOnly: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin],
  excludedRoles: []
};

const ownerOnly: AccessRule = {
  requiredRoles: [UserGroups.Owner],
  excludedRoles: []
};

const INSPECTOR_ALLOWED_SEGMENTS = new Set<string>([
  ROUTER_TOKEN.MaintenanceList,
  'work-order',
  ROUTER_TOKEN.WorkOrderCreate,
  'receipt'
]);

export const NAV_ITEMS: NavItemDefinition[] = [
  { icon: 'dashboard', displayName: 'Dashboard', url: ROUTER_TOKEN.Dashboard, ...openToAllExceptSuperAdmin },
  { icon: 'grid_view', displayName: 'Boards', url: ROUTER_TOKEN.ReservationBoard, ...openToAllExceptSuperAdmin },
  { icon: 'handshake', displayName: 'Reservations', url: ROUTER_TOKEN.RentalList, ...openToAllExceptSuperAdmin },
  { icon: 'home', displayName: 'Properties', url: ROUTER_TOKEN.PropertyList, ...openToAllExceptSuperAdmin },
  { icon: 'build', displayName: 'Maintenance', url: ROUTER_TOKEN.MaintenanceList, ...openToAllExceptSuperAdmin },
  { icon: 'account_balance', displayName: 'Accounting', url: ROUTER_TOKEN.AccountingList, ...accountingOnly },
  { icon: 'mail', displayName: 'Emails', url: ROUTER_TOKEN.EmailList, ...openToAll },
  { icon: 'description', displayName: 'Documents', url: ROUTER_TOKEN.DocumentList, ...openToAllExceptSuperAdmin },
  { icon: 'contacts', displayName: 'Contacts', url: ROUTER_TOKEN.Contacts, ...openToAllExceptSuperAdmin },
  { icon: 'corporate_fare', displayName: 'Organizations', url: ROUTER_TOKEN.OrganizationList, ...superAdminOnly },
  { icon: 'people', displayName: 'Users', url: ROUTER_TOKEN.UserList, ...adminOnly },
  { icon: 'settings', displayName: 'Settings', url: ROUTER_TOKEN.OrganizationConfiguration, ...settingsAccess }
];

const routeRulesBySegment: Record<string, AccessRule> = {
  [ROUTER_TOKEN.Dashboard]: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.ReservationBoard]: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.RentalList]: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.PropertyList]: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.MaintenanceList]: openToAllExceptSuperAdmin,
  'work-order': openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.WorkOrderCreate]: openToAllExceptSuperAdmin,
  receipt: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.EmailList]: openToAll,
  [ROUTER_TOKEN.DocumentList]: openToAllExceptSuperAdmin,
  [ROUTER_TOKEN.Contacts]: openToAllExceptSuperAdmin,

  [ROUTER_TOKEN.AccountingList]: accountingOnly,
  billing: accountingOnly,
  [ROUTER_TOKEN.BillingCreate]: accountingOnly,
  [ROUTER_TOKEN.InvoiceCreate]: accountingOnly,
  [ROUTER_TOKEN.CostCodesList]: accountingOnly,

  [ROUTER_TOKEN.OrganizationConfiguration]: settingsAccess,
  [ROUTER_TOKEN.OfficeList]: adminOnly,
  [ROUTER_TOKEN.AccountingOfficeList]: adminOnly,
  [ROUTER_TOKEN.AgentList]: adminOnly,
  [ROUTER_TOKEN.AreaList]: adminOnly,
  [ROUTER_TOKEN.BuildingList]: adminOnly,
  [ROUTER_TOKEN.RegionList]: adminOnly,
  [ROUTER_TOKEN.ColorList]: adminOnly,
  [ROUTER_TOKEN.UserList]: adminOnly,

  [ROUTER_TOKEN.OrganizationList]: superAdminOnly,

  [ROUTER_TOKEN.DashboardOwner]: ownerOnly
};

export function getUserGroupNumbers(userGroups: UserGroupInput): number[] {
  return (userGroups || [])
    .map(group => {
      if (typeof group === 'number') {
        return group;
      }

      const enumValue = (UserGroups as unknown as Record<string, number | string>)[group];
      if (typeof enumValue === 'number') {
        return enumValue;
      }

      const parsed = parseInt(group, 10);
      return !isNaN(parsed) ? parsed : null;
    })
    .filter((value): value is number => value !== null);
}

export function hasOwnerRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Owner);
}

export function hasInspectorRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Inspector);
}

export function hasHousekeepingRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Housekeeping);
}

export function hasVendorRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Vendor);
}

const ONLY_ROLE_EXCLUSIONS: UserGroups[] = [
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.Accounting,
  UserGroups.AccountingAdmin,
  UserGroups.Agent,
  UserGroups.AgentAdmin,
  UserGroups.PropertyManager,
  UserGroups.PropertyManagerAdmin
];

export function hasMainRole(userGroups: UserGroupInput): boolean {
  const groups = getUserGroupNumbers(userGroups).filter(group => group !== UserGroups.Unknown);
  return ONLY_ROLE_EXCLUSIONS.some(role => groups.includes(role));
}

function hasRoleWithoutExcludedRoles(userGroups: UserGroupInput, requiredRole: UserGroups): boolean {
  const groups = getUserGroupNumbers(userGroups).filter(group => group !== UserGroups.Unknown);
  if (!groups.includes(requiredRole)) {
    return false;
  }
  return !ONLY_ROLE_EXCLUSIONS.some(role => groups.includes(role));
}

export function hasInspectorOnlyRole(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Inspector);
}

export function hasHouseKeeperOnlyRole(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Housekeeping);
}

export function hasVendorOnlyRole(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Vendor);
}

function isInspectorOnlyUser(userGroups: UserGroupInput): boolean {
  return hasInspectorOnlyRole(userGroups);
}

export function hasAccessByRule(userGroups: UserGroupInput, rule: AccessRule): boolean {
  const userGroupNumbers = getUserGroupNumbers(userGroups);

  if (rule.excludedRoles.length > 0 && rule.excludedRoles.some(role => userGroupNumbers.includes(role))) {
    return false;
  }

  if (rule.requiredRoles.length === 0) {
    return true;
  }

  return rule.requiredRoles.some(role => userGroupNumbers.includes(role));
}

function getPrimaryAuthSegment(url: string): string | null {
  const cleanedUrl = url.split('?')[0].split('#')[0];
  const parts = cleanedUrl.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const authIndex = parts.indexOf(ROUTER_TOKEN.Auth);
  if (authIndex >= 0) {
    return parts[authIndex + 1] ?? null;
  }

  return parts[0] ?? null;
}

export function getRouteRuleForUrl(url: string): AccessRule | null {
  const segment = getPrimaryAuthSegment(url);
  if (!segment) {
    return null;
  }
  return routeRulesBySegment[segment] ?? null;
}

export function canUserAccessUrl(userGroups: UserGroupInput, url: string): boolean {
  const segment = getPrimaryAuthSegment(url);
  if (hasOwnerRole(userGroups)) {
    return segment === ROUTER_TOKEN.DashboardOwner;
  }
  if (isInspectorOnlyUser(userGroups)) {
    return segment !== null && INSPECTOR_ALLOWED_SEGMENTS.has(segment);
  }

  const rule = getRouteRuleForUrl(url);
  if (!rule) {
    return true;
  }
  return hasAccessByRule(userGroups, rule);
}

export function getVisibleNavItems(userGroups: UserGroupInput): NavItemDefinition[] {
  if (hasOwnerRole(userGroups)) {
    const dashboardItem = NAV_ITEMS.find(item => item.url === ROUTER_TOKEN.Dashboard);
    return dashboardItem ? [{ ...dashboardItem, url: ROUTER_TOKEN.DashboardOwner }] : [];
  }
  if (isInspectorOnlyUser(userGroups)) {
    const maintenanceItem = NAV_ITEMS.find(item => item.url === ROUTER_TOKEN.MaintenanceList);
    return maintenanceItem ? [{ ...maintenanceItem }] : [];
  }

  const visibleItems = NAV_ITEMS.filter(item => hasAccessByRule(userGroups, item));
  const userGroupNumbers = getUserGroupNumbers(userGroups);

  if (userGroupNumbers.includes(UserGroups.SuperAdmin)) {
    const organizationsItem = visibleItems.find(item => item.url === ROUTER_TOKEN.OrganizationList);
    const otherItems = visibleItems.filter(item => item.url !== ROUTER_TOKEN.OrganizationList);
    return organizationsItem ? [organizationsItem, ...otherItems] : otherItems;
  }

  return visibleItems;
}

export function getAuthorizedFallbackUrl(userGroups: UserGroupInput): string {
  if (isInspectorOnlyUser(userGroups)) {
    return `/${ROUTER_TOKEN.Auth}/${ROUTER_TOKEN.MaintenanceList}`;
  }
  const firstVisibleItem = getVisibleNavItems(userGroups)[0];
  const token = firstVisibleItem?.url || ROUTER_TOKEN.Dashboard;
  return `/${ROUTER_TOKEN.Auth}/${token}`;
}
