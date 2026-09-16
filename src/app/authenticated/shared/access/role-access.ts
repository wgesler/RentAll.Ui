import { RouterToken, RouterUrl } from '../../../app.routes.tokens';
import { OrganizationType } from '../../organizations/models/organization-enum';
import { StartupPage, UserGroups, getStartupPages } from '../../users/models/user-enums';

export interface AccessRule {
  requiredRoles: UserGroups[];
  excludedRoles: UserGroups[];
}
export interface NavItemDefinition extends AccessRule {
  icon: string;
  displayName: string;
  url: string;
}

export type UserGroupInput = Array<string | number> | undefined;

//#region Defined Groups
const COMPANY_ROLES: UserGroups[] = [
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.OfficeAdmin,
  UserGroups.Accounting,
  UserGroups.AccountingAdmin,
  UserGroups.Agent,
  UserGroups.AgentAdmin,
  UserGroups.PropertyManager,
  UserGroups.PropertyManagerAdmin,
  UserGroups.PartnerAdmin
];

const OUTSIDE_ROLES: UserGroups[] = [
  UserGroups.Facilities,
  UserGroups.Housekeeping,
  UserGroups.Company,
  UserGroups.Vendor,
  UserGroups.Tenant,
  UserGroups.Owner,
  UserGroups.Inspector,
  UserGroups.Realtor,
  
];
//#endregion


//#region Access Rules
const superAdminOnly: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin],
  excludedRoles: []
};

const openToAllExceptSuperAdmin: AccessRule = {
  requiredRoles: [],
  excludedRoles: [UserGroups.SuperAdmin]
};

const openToAll: AccessRule = {
  requiredRoles: [],
  excludedRoles: []
};

const ticketAccess: AccessRule = {
  requiredRoles: [],
  excludedRoles: []
};

const accountingStaffOnly: AccessRule = {
  requiredRoles: [UserGroups.Accounting, UserGroups.AccountingAdmin],
  excludedRoles: []
};

/** Sidebar and /auth/accounting route: accounting staff, office admins, and org admins. */
const accountingNavAccess: AccessRule = {
  requiredRoles: [
    UserGroups.Accounting,
    UserGroups.AccountingAdmin,
    UserGroups.OfficeAdmin,
    UserGroups.Admin
  ],
  excludedRoles: []
};

/** Owners, GL, reports, and journal sync/clear: org admins only. */
const accountingFullAccess: AccessRule = {
  requiredRoles: [UserGroups.Admin],
  excludedRoles: []
};

const adminOnly: AccessRule = {
  requiredRoles: [UserGroups.Admin, UserGroups.OfficeAdmin],
  excludedRoles: []
};

const usersAccess: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin, UserGroups.Admin, UserGroups.OfficeAdmin],
  excludedRoles: []
};

const orgAdminOnly: AccessRule = {
  requiredRoles: [UserGroups.Admin],
  excludedRoles: []
};

const logsAccess: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin, UserGroups.Admin],
  excludedRoles: []
};

const leadsAdminAndAgent: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin, UserGroups.Admin, UserGroups.Agent, UserGroups.AgentAdmin],
  excludedRoles: []
};

const settingsAccess: AccessRule = {
  requiredRoles: [
    UserGroups.Admin,
    UserGroups.SuperAdmin,
    UserGroups.OfficeAdmin,
    UserGroups.Agent,
    UserGroups.AgentAdmin,
    UserGroups.PropertyManager,
    UserGroups.PropertyManagerAdmin,
    UserGroups.PartnerAdmin
  ],
  excludedRoles: []
};

const ownerOnly: AccessRule = {
  requiredRoles: [UserGroups.Owner],
  excludedRoles: []
};

const noAccess: AccessRule = {
  requiredRoles: [UserGroups.SuperAdmin],
  excludedRoles: [UserGroups.SuperAdmin]
};
//#endregion

//#region Segment and Nav Definitions
const WORK_ORDER_SEGMENT = RouterToken.MaintenanceWorkOrder.split('/')[0];
const RECEIPT_SEGMENT = RouterToken.MaintenanceReceipt.split('/')[0];

const INSPECTOR_ALLOWED_SEGMENTS = new Set<string>([
  RouterToken.DashboardStaff,
  RouterToken.MaintenanceList,
  WORK_ORDER_SEGMENT,
  RouterToken.WorkOrderCreate,
  RECEIPT_SEGMENT
]);
const REALTOR_ALLOWED_SEGMENTS = new Set<string>([
  RouterToken.Dashboard,
  RouterToken.ReservationBoard
]);
const OWNER_REALTOR_ALLOWED_SEGMENTS = new Set<string>([
  RouterToken.DashboardOwner,
  RouterToken.Dashboard,
  RouterToken.ReservationBoard
]);

export const COMPANY_USERS_NAV_ITEMS: NavItemDefinition[] = [
  { icon: 'dashboard', displayName: 'Dashboard', url: RouterToken.Dashboard, ...openToAllExceptSuperAdmin },
  { icon: 'hub', displayName: 'Leads', url: RouterToken.Leads, ...leadsAdminAndAgent },
  { icon: 'grid_view', displayName: 'Boards', url: RouterToken.ReservationBoard, ...openToAllExceptSuperAdmin },
  { icon: 'handshake', displayName: 'Reservations', url: RouterToken.ReservationList, ...openToAllExceptSuperAdmin },
  { icon: 'home', displayName: 'Properties', url: RouterToken.PropertyList, ...openToAllExceptSuperAdmin },
  { icon: 'confirmation_number', displayName: 'Tickets', url: RouterToken.TicketList, ...ticketAccess },
  { icon: 'build', displayName: 'Maintenance', url: RouterToken.MaintenanceList, ...openToAllExceptSuperAdmin },
  { icon: 'account_balance', displayName: 'Accounting', url: RouterToken.AccountingList, ...accountingNavAccess },
  { icon: 'person', displayName: 'Owners', url: RouterToken.OwnerShell, ...openToAllExceptSuperAdmin },
  { icon: 'mail', displayName: 'Emails', url: RouterToken.EmailList, ...openToAll },
  { icon: 'description', displayName: 'Documents', url: RouterToken.DocumentList, ...openToAllExceptSuperAdmin },
  { icon: 'contacts', displayName: 'Contacts', url: RouterToken.Contacts, ...openToAllExceptSuperAdmin },
  { icon: 'people', displayName: 'Users', url: RouterToken.UserList, ...usersAccess },
  { icon: 'settings', displayName: 'Settings', url: RouterToken.OrganizationConfiguration, ...settingsAccess },
  { icon: 'article', displayName: 'Logs', url: RouterToken.Logs, ...logsAccess }
];

export const SUPER_USER_NAV_ITEMS: NavItemDefinition[] = [
  { icon: 'corporate_fare', displayName: 'Organizations', url: RouterToken.OrganizationList, ...superAdminOnly },
  { icon: 'receipt_long', displayName: 'Billing', url: RouterToken.BillingList, ...superAdminOnly },
  { icon: 'hub', displayName: 'Leads', url: RouterToken.Leads, ...leadsAdminAndAgent },
  { icon: 'person', displayName: 'Owners', url: RouterToken.OwnerShell, ...openToAll },
  { icon: 'contacts', displayName: 'Contacts', url: RouterToken.Contacts, ...openToAll },
  { icon: 'people', displayName: 'Users', url: RouterToken.UserList, ...usersAccess },
  { icon: 'settings', displayName: 'Settings', url: RouterToken.OrganizationConfiguration, ...settingsAccess },
  { icon: 'article', displayName: 'Logs', url: RouterToken.Logs, ...logsAccess }
];

export const SERVICE_PROVIDERS_NAV_ITEMS: NavItemDefinition[] = [
  { icon: 'dashboard', displayName: 'Dashboard', url: RouterToken.DashboardStaff, ...openToAllExceptSuperAdmin }
];

export const NAV_ITEMS_BY_GROUP = {
  SuperUser: SUPER_USER_NAV_ITEMS,
  CompanyUsers: COMPANY_USERS_NAV_ITEMS,
  ServiceProviders: SERVICE_PROVIDERS_NAV_ITEMS
} as const;

//#region Organization SideBar Access
function getCompanyNavItemsByUrls(urls: readonly string[]): NavItemDefinition[] {
  const allowed = new Set(urls);
  return COMPANY_USERS_NAV_ITEMS.filter(item => allowed.has(item.url));
}

export const PROPERTY_MANAGEMENT_NAV_ITEMS: NavItemDefinition[] = COMPANY_USERS_NAV_ITEMS;
export const PROPERTY_PROVIDER_NAV_ITEMS: NavItemDefinition[] = COMPANY_USERS_NAV_ITEMS;
const PARTNER_BASE_NAV_URLS: readonly string[] = [
  RouterToken.ReservationBoard,
  RouterToken.ReservationBoardSelection,
  RouterToken.PropertyList,
  RouterToken.Contacts,
  RouterToken.OrganizationConfiguration
];

export const PARTNER_NAV_ITEMS: NavItemDefinition[] = getCompanyNavItemsByUrls(PARTNER_BASE_NAV_URLS);

export const NAV_ITEMS_BY_ORGANIZATION_TYPE: Record<number, NavItemDefinition[]> = {
  [OrganizationType.PropertyManagement]: PROPERTY_MANAGEMENT_NAV_ITEMS,
  [OrganizationType.PropertyProvider]: PROPERTY_PROVIDER_NAV_ITEMS,
  [OrganizationType.Partner]: PARTNER_NAV_ITEMS
};

export function isPartnerOrganizationAdmin(userGroups: UserGroupInput): boolean {
  const groups = getUserGroupNumbers(userGroups);
  return groups.includes(UserGroups.Admin) || groups.includes(UserGroups.PartnerAdmin);
}

/** Partner org PartnerAdmin without Org Admin — Users shell Employees tab only. */
export function isPartnerAdminEmployeesOnlyContext(
  organizationTypeId: number | null | undefined,
  userGroups: UserGroupInput
): boolean {
  if (Number(organizationTypeId) !== OrganizationType.Partner) {
    return false;
  }
  const groups = getUserGroupNumbers(userGroups);
  return groups.includes(UserGroups.PartnerAdmin) && !groups.includes(UserGroups.Admin);
}

function canAccessPartnerUsersNav(userGroups: UserGroupInput): boolean {
  return isPartnerOrganizationAdmin(userGroups);
}

function canAccessPartnerLogsNav(userGroups: UserGroupInput): boolean {
  return isOrgAdmin(userGroups);
}

function canAccessPartnerNavUrl(url: string, userGroups: UserGroupInput): boolean {
  if (url === RouterToken.UserList) {
    return canAccessPartnerUsersNav(userGroups);
  }
  if (url === RouterToken.Logs) {
    return canAccessPartnerLogsNav(userGroups);
  }
  return false;
}

function getPartnerAllowedSegments(userGroups: UserGroupInput): Set<string> {
  const allowed = new Set<string>(PARTNER_BASE_NAV_URLS);
  if (canAccessPartnerUsersNav(userGroups)) {
    allowed.add(RouterToken.UserList);
  }
  if (canAccessPartnerLogsNav(userGroups)) {
    allowed.add(RouterToken.Logs);
  }
  return allowed;
}

export function getPartnerSidebarNavItems(userGroups: UserGroupInput): NavItemDefinition[] {
  const allowed = getPartnerAllowedSegments(userGroups);
  return COMPANY_USERS_NAV_ITEMS.filter(item => {
    if (!allowed.has(item.url)) {
      return false;
    }
    if (item.url === RouterToken.UserList || item.url === RouterToken.Logs) {
      return canAccessPartnerNavUrl(item.url, userGroups);
    }
    return hasAccessByRule(userGroups, item);
  });
}
//#endregion

export const NAV_ITEMS: NavItemDefinition[] = COMPANY_USERS_NAV_ITEMS;

const routeRulesBySegment: Record<string, AccessRule> = {
  [RouterToken.Dashboard]: openToAllExceptSuperAdmin,
  [RouterToken.DashboardStaff]: openToAllExceptSuperAdmin,
  [RouterToken.ReservationBoard]: openToAllExceptSuperAdmin,
  [RouterToken.ReservationList]: openToAllExceptSuperAdmin,
  [RouterToken.PropertyList]: openToAllExceptSuperAdmin,
  [RouterToken.MaintenanceList]: openToAllExceptSuperAdmin,
  [RouterToken.TicketList]: ticketAccess,
  [WORK_ORDER_SEGMENT]: openToAllExceptSuperAdmin,
  [RouterToken.WorkOrderCreate]: openToAllExceptSuperAdmin,
  [RECEIPT_SEGMENT]: openToAllExceptSuperAdmin,
  [RouterToken.EmailList]: openToAll,
  [RouterToken.DocumentList]: openToAllExceptSuperAdmin,
  [RouterToken.Contacts]: openToAll,

  [RouterToken.AccountingList]: accountingNavAccess,
  [RouterToken.Leads]: leadsAdminAndAgent,
  [RouterToken.OwnerShell]: openToAll,
  [RouterToken.BillingList]: superAdminOnly,
  [RouterToken.BillingCreate]: superAdminOnly,
  [RouterToken.InvoiceCreate]: accountingNavAccess,
  [RouterToken.CostCodesList]: accountingNavAccess,

  [RouterToken.OrganizationConfiguration]: settingsAccess,
  [RouterToken.OfficeList]: adminOnly,
  [RouterToken.AccountingOfficeList]: adminOnly,
  [RouterToken.AgentList]: adminOnly,
  [RouterToken.AreaList]: adminOnly,
  [RouterToken.BuildingList]: adminOnly,
  [RouterToken.RegionList]: adminOnly,
  [RouterToken.ColorList]: orgAdminOnly,
  [RouterToken.UserList]: usersAccess,
  [RouterToken.Logs]: logsAccess,

  [RouterToken.OrganizationList]: superAdminOnly,

  [RouterToken.DashboardOwner]: ownerOnly
};
//#endregion

//#region Role Checks
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

export function isOrgAdmin(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Admin);
}

export function hasOrgAdminAccess(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Admin);
}

export function hasOfficeAdminRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.OfficeAdmin);
}

export function hasAccountingNavAccess(userGroups: UserGroupInput): boolean {
  return hasAccessByRule(userGroups, accountingNavAccess);
}

export function hasAccountingFullAccess(userGroups: UserGroupInput): boolean {
  return hasAccessByRule(userGroups, accountingFullAccess);
}

export function hasAccountingStaffAccess(userGroups: UserGroupInput): boolean {
  return hasAccessByRule(userGroups, accountingStaffOnly);
}

export function hasOwnerRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Owner);
}

export function hasOwnerAndRealtorRoles(userGroups: UserGroupInput): boolean {
  return hasOwnerRole(userGroups) && hasRealtorRole(userGroups);
}

export function isOwnerOnlyUser(userGroups: UserGroupInput): boolean {
  const groups = getUserGroupNumbers(userGroups).filter(group => group !== UserGroups.Unknown);
  return groups.length > 0
    && groups.includes(UserGroups.Owner)
    && !groups.some(group => group !== UserGroups.Owner);
}

export function hasRealtorRole(userGroups: UserGroupInput): boolean {
  return getUserGroupNumbers(userGroups).includes(UserGroups.Realtor);
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

export function hasCompanyRole(userGroups: UserGroupInput): boolean {
  const groups = getUserGroupNumbers(userGroups).filter(group => group !== UserGroups.Unknown);
  return COMPANY_ROLES.some(role => groups.includes(role));
}

/** Users who do not belong on Employees / Owners / Cleaners / Inspectors / Vendors tabs. */
export function belongsOnOtherUsersTab(userGroups: UserGroupInput): boolean {
  return !hasCompanyRole(userGroups)
    && !hasOwnerRole(userGroups)
    && !hasHousekeepingRole(userGroups)
    && !hasInspectorRole(userGroups)
    && !hasVendorRole(userGroups);
}

export function isInspectorOnlyUser(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Inspector);
}

export function isHouseKeeperOnlyUser(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Housekeeping);
}

export function isVendorOnlyUser(userGroups: UserGroupInput): boolean {
  return hasRoleWithoutExcludedRoles(userGroups, UserGroups.Vendor);
}

export function isServiceProvider(userGroups: UserGroupInput): boolean {
  return isInspectorOnlyUser(userGroups) || isHouseKeeperOnlyUser(userGroups) || isVendorOnlyUser(userGroups);
}

function hasRoleWithoutExcludedRoles(userGroups: UserGroupInput, requiredRole: UserGroups): boolean {
  const groups = getUserGroupNumbers(userGroups).filter(group => group !== UserGroups.Unknown);
  if (!groups.includes(requiredRole)) {
    return false;
  }
  return !COMPANY_ROLES.some(role => groups.includes(role));
}
//#endregion

//#region Access Helpers
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

  const authIndex = parts.indexOf(RouterToken.Auth);
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

export type SidebarNavFilterOptions = {
  canShowLeads?: boolean;
  canShowOwners?: boolean;
  canShowTickets?: boolean;
  canShowMaintenance?: boolean;
  canShowAccounting?: boolean;
  isPartnerOrg?: boolean;
};

type FeatureGateKey = keyof Pick<
  SidebarNavFilterOptions,
  'canShowLeads' | 'canShowOwners' | 'canShowTickets' | 'canShowMaintenance' | 'canShowAccounting'
>;

const FEATURE_GATED_ROUTE_SEGMENTS: Record<string, FeatureGateKey> = {
  [RouterToken.Leads]: 'canShowLeads',
  [RouterToken.OwnerShell]: 'canShowOwners',
  [RouterToken.TicketList]: 'canShowTickets',
  [RouterToken.MaintenanceList]: 'canShowMaintenance',
  [WORK_ORDER_SEGMENT]: 'canShowMaintenance',
  [RouterToken.WorkOrderCreate]: 'canShowMaintenance',
  [RECEIPT_SEGMENT]: 'canShowMaintenance',
  [RouterToken.AccountingList]: 'canShowAccounting',
  [RouterToken.InvoiceCreate]: 'canShowAccounting',
  [RouterToken.CostCodesList]: 'canShowAccounting',
  [RouterToken.AccountingOfficeList]: 'canShowAccounting'
};

function hasFeatureAccessForUrl(url: string, featureOptions?: SidebarNavFilterOptions): boolean {
  if (!featureOptions) {
    return true;
  }

  const segment = getPrimaryAuthSegment(url);
  if (!segment) {
    return true;
  }

  const gateKey = FEATURE_GATED_ROUTE_SEGMENTS[segment];
  if (!gateKey) {
    return true;
  }

  return featureOptions[gateKey] !== false;
}

function passesRoleAndFeatureAccess(
  roleAllowed: boolean,
  url: string,
  featureOptions?: SidebarNavFilterOptions
): boolean {
  return roleAllowed && hasFeatureAccessForUrl(url, featureOptions);
}
//#endregion

//#region Navigation and Routing
export function canUserAccessUrl(
  userGroups: UserGroupInput,
  url: string,
  featureOptions?: SidebarNavFilterOptions
): boolean {
  const segment = getPrimaryAuthSegment(url);
  if (segment === RouterToken.UserGuide) {
    return true;
  }
  if (featureOptions?.isPartnerOrg) {
    return canPartnerAccessUrl(url, userGroups);
  }
  if (hasOwnerAndRealtorRoles(userGroups)) {
    return passesRoleAndFeatureAccess(
      segment !== null && OWNER_REALTOR_ALLOWED_SEGMENTS.has(segment),
      url,
      featureOptions
    );
  }
  if (isOwnerOnlyUser(userGroups)) {
    return passesRoleAndFeatureAccess(segment === RouterToken.DashboardOwner, url, featureOptions);
  }
  if (hasRealtorRole(userGroups)) {
    return passesRoleAndFeatureAccess(
      segment !== null && REALTOR_ALLOWED_SEGMENTS.has(segment),
      url,
      featureOptions
    );
  }
  if (isInspectorOnlyUser(userGroups)) {
    return passesRoleAndFeatureAccess(
      segment !== null && INSPECTOR_ALLOWED_SEGMENTS.has(segment),
      url,
      featureOptions
    );
  }

  const rule = getRouteRuleForUrl(url);
  if (!rule) {
    return hasFeatureAccessForUrl(url, featureOptions);
  }
  return passesRoleAndFeatureAccess(hasAccessByRule(userGroups, rule), url, featureOptions);
}

export function getUserGuideNavItems(userGroups: UserGroupInput): NavItemDefinition[] {
  const rawItems = getUserGroupNumbers(userGroups).includes(UserGroups.SuperAdmin)
    ? collapseUserGuideNavItems([...COMPANY_USERS_NAV_ITEMS, ...SUPER_USER_NAV_ITEMS])
    : collapseUserGuideNavItems(getVisibleNavItems(userGroups));
  const seen = new Set<string>();
  return rawItems.filter(item => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

function collapseUserGuideNavItems(items: NavItemDefinition[]): NavItemDefinition[] {
  const dashboardUrls = new Set<string>([RouterToken.Dashboard, RouterToken.DashboardStaff, RouterToken.DashboardOwner]);
  const companyDashboard = COMPANY_USERS_NAV_ITEMS.find(item => item.url === RouterToken.Dashboard);
  let insertedDashboard = false;
  const collapsed: NavItemDefinition[] = [];
  for (const item of items) {
    if (!dashboardUrls.has(item.url)) {
      collapsed.push(item);
      continue;
    }
    if (insertedDashboard) {
      continue;
    }
    collapsed.push(companyDashboard ? { ...companyDashboard } : { ...item, url: RouterToken.Dashboard, displayName: 'Dashboard' });
    insertedDashboard = true;
  }
  return collapsed;
}

export function filterNavItemsForPartner(_items: NavItemDefinition[], userGroups?: UserGroupInput): NavItemDefinition[] {
  return getPartnerSidebarNavItems(userGroups);
}

export function canPartnerAccessUrl(url: string, userGroups?: UserGroupInput): boolean {
  const segment = getPrimaryAuthSegment(url);
  if (segment === RouterToken.UserGuide) {
    return true;
  }
  const allowed = getPartnerAllowedSegments(userGroups);
  return segment !== null && allowed.has(segment);
}

export function getPartnerFallbackUrl(): string {
  return `/${RouterToken.Auth}/${RouterToken.ReservationBoard}`;
}

export function getVisibleNavItems(userGroups: UserGroupInput): NavItemDefinition[] {
  if (hasOwnerAndRealtorRoles(userGroups)) {
    const ownerDashboardItem = COMPANY_USERS_NAV_ITEMS.find(item => item.url === RouterToken.Dashboard);
    const realtorItems = COMPANY_USERS_NAV_ITEMS.filter(item => item.url === RouterToken.ReservationBoard);
    return [
      ...(ownerDashboardItem ? [{ ...ownerDashboardItem, url: RouterToken.DashboardOwner }] : []),
      ...realtorItems
    ];
  }
  if (isOwnerOnlyUser(userGroups)) {
    const dashboardItem = COMPANY_USERS_NAV_ITEMS.find(item => item.url === RouterToken.Dashboard);
    return dashboardItem ? [{ ...dashboardItem, url: RouterToken.DashboardOwner }] : [];
  }
  if (hasRealtorRole(userGroups)) {
    return COMPANY_USERS_NAV_ITEMS.filter(item => item.url === RouterToken.ReservationBoard);
  }
  if (getUserGroupNumbers(userGroups).includes(UserGroups.SuperAdmin)) {
    return SUPER_USER_NAV_ITEMS.filter(item => hasAccessByRule(userGroups, item));
  }
  if (isServiceProvider(userGroups)) {
    let items = SERVICE_PROVIDERS_NAV_ITEMS.filter(item => hasAccessByRule(userGroups, item));
    if (isInspectorOnlyUser(userGroups)) {
      const maintenanceItem = COMPANY_USERS_NAV_ITEMS.find(item => item.url === RouterToken.MaintenanceList);
      if (maintenanceItem) {
        items = [...items, maintenanceItem];
      }
    }
    return items;
  }

  return COMPANY_USERS_NAV_ITEMS.filter(item => hasAccessByRule(userGroups, item));
}

export function filterSidebarNavItems(
  items: NavItemDefinition[],
  options: SidebarNavFilterOptions & { userGroups?: UserGroupInput }
): NavItemDefinition[] {
  let filtered = items;

  if (options.canShowLeads === false) {
    filtered = filtered.filter(item => {
      const url = String(item.url || '');
      return url !== RouterToken.Leads && !url.startsWith(`${RouterToken.Leads}/`);
    });
  }

  if (options.canShowOwners === false) {
    filtered = filtered.filter(item => {
      const url = String(item.url || '');
      return url !== RouterToken.OwnerShell && !url.startsWith(`${RouterToken.OwnerShell}/`);
    });
  }

  if (options.canShowTickets === false) {
    filtered = filtered.filter(item => {
      const url = String(item.url || '');
      return url !== RouterToken.TicketList && !url.startsWith(`${RouterToken.TicketList}/`);
    });
  }

  if (options.canShowMaintenance === false) {
    filtered = filtered.filter(item => {
      const url = String(item.url || '');
      return url !== RouterToken.MaintenanceList && !url.startsWith(`${RouterToken.MaintenanceList}/`);
    });
  }

  if (options.canShowAccounting === false) {
    filtered = filtered.filter(item => {
      const url = String(item.url || '');
      return url !== RouterToken.AccountingList && !url.startsWith(`${RouterToken.AccountingList}/`);
    });
  }

  return filtered;
}

export function getFilteredSidebarNavItems(
  userGroups: UserGroupInput,
  options: SidebarNavFilterOptions
): NavItemDefinition[] {
  if (options.isPartnerOrg) {
    return getPartnerSidebarNavItems(userGroups);
  }
  return filterSidebarNavItems(getVisibleNavItems(userGroups), {
    ...options,
    userGroups
  });
}

export function isPartnerOrganizationContext(
  organizationTypeId: number | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return !isSuperAdmin && Number(organizationTypeId) === OrganizationType.Partner;
}

export function canShowLeadsNav(authService: {
  hasRole: (group: UserGroups) => boolean;
  hasAccessToLeads: () => boolean;
}): boolean {
  return (
    authService.hasRole(UserGroups.Admin) ||
    authService.hasRole(UserGroups.Agent) ||
    authService.hasRole(UserGroups.AgentAdmin)
  ) && authService.hasAccessToLeads();
}

export function canShowOwnersNav(authService: {
  isOwnerAdmin: () => boolean;
  hasAccessToOwners: () => boolean;
}): boolean {
  return authService.isOwnerAdmin() && authService.hasAccessToOwners();
}

export function canShowTicketsNav(authService: {
  hasTicketingAccess: () => boolean;
}): boolean {
  return authService.hasTicketingAccess();
}

export function canShowMaintenanceNav(authService: {
  hasAccessToManagement: () => boolean;
}): boolean {
  return authService.hasAccessToManagement();
}

export function canShowAccountingNav(authService: {
  hasAccountingNavAccess: () => boolean;
  hasAccountingAccess: () => boolean;
}): boolean {
  return authService.hasAccountingNavAccess() && authService.hasAccountingAccess();
}

export function getSidebarFilterOptions(
  authService: {
    hasRole: (group: UserGroups) => boolean;
    hasAccessToLeads: () => boolean;
    isOwnerAdmin: () => boolean;
    hasAccessToOwners: () => boolean;
    hasTicketingAccess: () => boolean;
    hasAccessToManagement: () => boolean;
    hasAccountingNavAccess: () => boolean;
    hasAccountingAccess: () => boolean;
  },
  organizationTypeId?: number | null
): SidebarNavFilterOptions {
  return {
    canShowLeads: canShowLeadsNav(authService),
    canShowOwners: canShowOwnersNav(authService),
    canShowTickets: canShowTicketsNav(authService),
    canShowMaintenance: canShowMaintenanceNav(authService),
    canShowAccounting: canShowAccountingNav(authService),
    isPartnerOrg: isPartnerOrganizationContext(
      organizationTypeId,
      authService.hasRole(UserGroups.SuperAdmin)
    )
  };
}

export type OrganizationFeatureNavAccess = {
  hasAccessToLeads: boolean;
  hasAccessToOwners: boolean;
  hasTicketingAccess: boolean;
  hasAccessToManagement: boolean;
  hasAccountingAccess: boolean;
};

const STARTUP_PAGE_NAV_SEGMENTS: Record<StartupPage, readonly string[]> = {
  [StartupPage.Dashboard]: [RouterToken.Dashboard, RouterToken.DashboardOwner, RouterToken.DashboardStaff],
  [StartupPage.Boards]: [RouterToken.ReservationBoard],
  [StartupPage.Reservations]: [RouterToken.ReservationList],
  [StartupPage.Properties]: [RouterToken.PropertyList],
  [StartupPage.Accounting]: [RouterToken.AccountingList],
  [StartupPage.Organizations]: [RouterToken.OrganizationList]
};

export function getSidebarFilterOptionsForUser(
  userGroups: UserGroupInput,
  organizationTypeId: number | null | undefined,
  featureAccess: OrganizationFeatureNavAccess
): SidebarNavFilterOptions {
  const groups = getUserGroupNumbers(userGroups);
  const isSuperAdmin = groups.includes(UserGroups.SuperAdmin);
  const hasLeadsRole = groups.some(group =>
    [UserGroups.Admin, UserGroups.Agent, UserGroups.AgentAdmin].includes(group)
  );

  return {
    canShowLeads: hasLeadsRole && featureAccess.hasAccessToLeads,
    canShowOwners: groups.includes(UserGroups.OwnerAdmin) && featureAccess.hasAccessToOwners,
    canShowTickets: featureAccess.hasTicketingAccess,
    canShowMaintenance: featureAccess.hasAccessToManagement,
    canShowAccounting: hasAccountingNavAccess(userGroups) && featureAccess.hasAccountingAccess,
    isPartnerOrg: isPartnerOrganizationContext(organizationTypeId, isSuperAdmin)
  };
}

function isStartupPageAllowed(
  startupPageId: number,
  userGroups: UserGroupInput,
  options: SidebarNavFilterOptions
): boolean {
  const segments = STARTUP_PAGE_NAV_SEGMENTS[startupPageId as StartupPage];
  if (!segments) {
    return false;
  }
  const navUrls = new Set(getFilteredSidebarNavItems(userGroups, options).map(item => item.url));
  return segments.some(segment => navUrls.has(segment));
}

export function getAllowedStartupPages(
  userGroups: UserGroupInput,
  options: SidebarNavFilterOptions
): { value: number; label: string }[] {
  return getStartupPages().filter(page => isStartupPageAllowed(page.value, userGroups, options));
}

export function resolveStartupPageId(
  startupPageId: number | null | undefined,
  userGroups: UserGroupInput,
  options: SidebarNavFilterOptions
): number {
  const requested = startupPageId ?? StartupPage.Dashboard;
  if (isStartupPageAllowed(requested, userGroups, options)) {
    return requested;
  }
  const allowed = getAllowedStartupPages(userGroups, options);
  if (allowed.length > 0) {
    return allowed[0].value;
  }
  return StartupPage.Boards;
}

export function getStartupPageUrlForUser(
  startupPageId: number | null | undefined,
  userGroups: UserGroupInput,
  options: SidebarNavFilterOptions
): string {
  const resolved = resolveStartupPageId(startupPageId, userGroups, options);
  switch (resolved) {
    case StartupPage.Dashboard:
      if (hasOwnerRole(userGroups)) {
        return RouterUrl.DashboardOwner;
      }
      if (isServiceProvider(userGroups)) {
        return RouterUrl.DashboardStaff;
      }
      return RouterUrl.Dashboard;
    case StartupPage.Boards:
      return RouterUrl.ReservationBoard;
    case StartupPage.Reservations:
      return RouterUrl.ReservationList;
    case StartupPage.Properties:
      return RouterUrl.PropertyList;
    case StartupPage.Accounting:
      return RouterUrl.AccountingList;
    case StartupPage.Organizations:
      return RouterUrl.OrganizationList;
    default:
      return getAuthorizedFallbackUrl(userGroups, options).replace(/^\//, '');
  }
}

export function getAuthorizedFallbackUrl(
  userGroups: UserGroupInput,
  featureOptions?: SidebarNavFilterOptions
): string {
  if (isInspectorOnlyUser(userGroups)) {
    return `/${RouterToken.Auth}/${RouterToken.DashboardStaff}`;
  }
  const firstVisibleItem = featureOptions
    ? getFilteredSidebarNavItems(userGroups, featureOptions)[0]
    : getVisibleNavItems(userGroups)[0];
  const token = firstVisibleItem?.url || RouterToken.Dashboard;
  return `/${RouterToken.Auth}/${token}`;
}
//#endregion
