import { RouterToken } from '../../app.routes.tokens';
import { AuthService } from '../../services/auth.service';
import { UserGroups } from '../users/models/user-enums';
import {
  canPartnerAccessUrl,
  canShowLeadsNav,
  canUserAccessUrl,
  getFilteredSidebarNavItems,
  isPartnerOrganizationContext,
  type NavItemDefinition,
  type SidebarNavFilterOptions,
  type UserGroupInput
} from '../shared/access/role-access';

export interface MobileNavTab {
  label: string;
  path: string;
}

export interface MobileNavItem {
  icon: string;
  label: string;
  path: string;
  tabs: MobileNavTab[];
}

export const MOBILE_TICKET_BASE_TABS: MobileNavTab[] = [
  { label: 'My Tickets', path: 'my-tickets' },
  { label: 'Others', path: 'others' },
  { label: 'Closed', path: 'closed' }
];

export const MOBILE_TICKET_ADMIN_TABS: MobileNavTab[] = [
  { label: 'RentAll', path: 'rentall' },
  { label: 'Review', path: 'review' },
  { label: 'Complete', path: 'complete' }
];

export const MOBILE_LEADS_TABS: MobileNavTab[] = [
  { label: 'Rental', path: 'rentals' },
  { label: 'General', path: 'general' },
  { label: 'Partner', path: 'partners' }
];

export const MOBILE_LEADS_OWNER_TAB: MobileNavTab = { label: 'Owner', path: 'owners' };

export function getMobileLeadsTabs(isOwnerAdmin: boolean): MobileNavTab[] {
  if (!isOwnerAdmin) {
    return MOBILE_LEADS_TABS;
  }
  return [MOBILE_LEADS_TABS[0], MOBILE_LEADS_OWNER_TAB, ...MOBILE_LEADS_TABS.slice(1)];
}

export function getMobileLeadsTab(tabPath: string | null | undefined, isOwnerAdmin: boolean): MobileNavTab | null {
  const tabs = getMobileLeadsTabs(isOwnerAdmin);
  if (!tabPath) {
    return tabs[0] ?? null;
  }
  return tabs.find(tab => tab.path === tabPath) ?? null;
}

export function getMobileLeadsQueryTab(tabPath: string | null | undefined): string | null {
  switch (tabPath) {
    case 'owners':
      return 'owner';
    case 'general':
      return 'general';
    case 'partners':
      return 'partner';
    default:
      return null;
  }
}

export type MobileTicketFilterMode = 'assignedToMe' | 'allOthers' | 'closed' | 'rentAll' | 'review' | 'complete';

export function getMobileTicketTabs(isAdmin: boolean): MobileNavTab[] {
  return isAdmin ? [...MOBILE_TICKET_BASE_TABS, ...MOBILE_TICKET_ADMIN_TABS] : MOBILE_TICKET_BASE_TABS;
}

export function getMobileTicketTab(tabPath: string | null | undefined, isAdmin: boolean): MobileNavTab | null {
  const tabs = getMobileTicketTabs(isAdmin);
  if (!tabPath) {
    return tabs[0] ?? null;
  }
  return tabs.find(tab => tab.path === tabPath) ?? null;
}

export function isMobileRentAllTicketTab(tabPath: string | null | undefined): boolean {
  return tabPath === 'rentall' || tabPath === 'review' || tabPath === 'complete';
}

export function getMobileTicketFilterMode(tabPath: string | null | undefined): MobileTicketFilterMode {
  if (tabPath === 'others') {
    return 'allOthers';
  }
  if (tabPath === 'closed') {
    return 'closed';
  }
  if (tabPath === 'rentall') {
    return 'rentAll';
  }
  if (tabPath === 'review') {
    return 'review';
  }
  if (tabPath === 'complete') {
    return 'complete';
  }
  return 'assignedToMe';
}

/** Desktop sidebar nav url → mobile hamburger path. */
const DESKTOP_NAV_URL_TO_MOBILE_PATH: Record<string, string> = {
  [RouterToken.Dashboard]: 'dashboard',
  [RouterToken.DashboardStaff]: 'dashboard',
  [RouterToken.DashboardOwner]: 'dashboard',
  [RouterToken.Leads]: 'leads',
  [RouterToken.ReservationBoard]: 'home',
  [RouterToken.ReservationList]: 'reservations',
  [RouterToken.PropertyList]: 'properties',
  [RouterToken.TicketList]: 'tickets',
  [RouterToken.MaintenanceList]: 'maintenance',
  [RouterToken.Contacts]: 'contacts'
};

const MOBILE_PATH_TO_AUTH_SEGMENT: Record<string, string> = {
  dashboard: RouterToken.Dashboard,
  home: RouterToken.ReservationBoard,
  leads: RouterToken.Leads,
  tickets: RouterToken.TicketList,
  maintenance: RouterToken.MaintenanceList,
  reservations: RouterToken.ReservationList,
  properties: RouterToken.PropertyList,
  contacts: RouterToken.Contacts
};

function desktopNavUrlsToMobilePaths(urls: readonly string[]): Set<string> {
  const paths = new Set<string>();
  for (const url of urls) {
    const mobilePath = DESKTOP_NAV_URL_TO_MOBILE_PATH[url];
    if (mobilePath) {
      paths.add(mobilePath);
    }
  }
  return paths;
}

export function getMobileSidebarFilterOptions(
  authService: AuthService,
  organizationTypeId?: number | null
): SidebarNavFilterOptions {
  return {
    canShowLeads: canShowLeadsNav(authService),
    canShowOwners: authService.isOwnerAdmin() && authService.hasAccessToOwners(),
    isPartnerOrg: isPartnerOrganizationContext(
      organizationTypeId,
      authService.hasRole(UserGroups.SuperAdmin)
    )
  };
}

function getAllowedMobilePaths(
  userGroups: UserGroupInput,
  filterOptions: SidebarNavFilterOptions
): Set<string> {
  return desktopNavUrlsToMobilePaths(
    getFilteredSidebarNavItems(userGroups, filterOptions).map(item => item.url)
  );
}

function buildMobileNavItemsFromDesktop(desktopItems: readonly NavItemDefinition[]): MobileNavItem[] {
  const result: MobileNavItem[] = [];
  const seenPaths = new Set<string>();

  for (const desktopItem of desktopItems) {
    const mobilePath = DESKTOP_NAV_URL_TO_MOBILE_PATH[desktopItem.url];
    if (!mobilePath || seenPaths.has(mobilePath)) {
      continue;
    }

    const template = MOBILE_NAV_ITEMS.find(item => item.path === mobilePath);
    if (!template) {
      continue;
    }

    result.push({
      ...template,
      icon: desktopItem.icon,
      label: desktopItem.displayName
    });
    seenPaths.add(mobilePath);
  }

  return result;
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: 'dashboard', tabs: [] },
  { icon: 'hub', label: 'Leads', path: 'leads', tabs: MOBILE_LEADS_TABS },
  { icon: 'grid_view', label: 'Reservation Board', path: 'home', tabs: [] },
  { icon: 'confirmation_number', label: 'Tickets', path: 'tickets', tabs: MOBILE_TICKET_BASE_TABS },
  { icon: 'build', label: 'Maintenance', path: 'maintenance', tabs: [
    { label: 'Inspection', path: 'inspection' },
    { label: 'Maintenance', path: 'maintenance' },
    { label: 'Receipts', path: 'receipts' },
    { label: 'Work Orders', path: 'work-orders' }
  ] },
  { icon: 'handshake', label: 'Reservations', path: 'reservations', tabs: [] },
  { icon: 'home', label: 'Properties', path: 'properties', tabs: [] },
  { icon: 'contacts', label: 'Contacts', path: 'contacts', tabs: [
    { label: 'Tenants', path: 'tenants' },
    { label: 'Companies', path: 'companies' },
    { label: 'Owners', path: 'owners' },
    { label: 'Vendors', path: 'vendors' }
  ] }
];

export const MOBILE_PROPERTY_DETAIL_TABS: MobileNavTab[] = [
  { label: 'Property', path: 'property' },
  { label: 'Welcome Letter', path: 'welcome-letter' },
  { label: 'Departure Letter', path: 'departure-letter' }
];

export function getMobileNavItems(
  authService: AuthService,
  organizationTypeId?: number | null
): MobileNavItem[] {
  const userGroups = authService.getUser()?.userGroups as UserGroupInput;
  if (!userGroups?.length) {
    return [];
  }

  const filterOptions = getMobileSidebarFilterOptions(authService, organizationTypeId);
  const visibleDesktopItems = getFilteredSidebarNavItems(userGroups, filterOptions);
  return buildMobileNavItemsFromDesktop(visibleDesktopItems);
}

export function mobileUrlToAuthUrl(url: string): string {
  const parts = (url || '').split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (parts[0] !== RouterToken.Mobile) {
    return url;
  }

  const section = parts[1] ?? '';
  const segment = MOBILE_PATH_TO_AUTH_SEGMENT[section];
  if (!segment) {
    return `/${RouterToken.Auth}/unknown`;
  }

  const rest = parts.slice(2).join('/');
  return rest ? `/${RouterToken.Auth}/${segment}/${rest}` : `/${RouterToken.Auth}/${segment}`;
}

export function canUserAccessMobileUrl(
  userGroups: UserGroupInput,
  url: string,
  filterOptions: SidebarNavFilterOptions
): boolean {
  const parts = (url || '').split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (parts[0] !== RouterToken.Mobile) {
    return true;
  }

  const section = parts[1] ?? '';
  const isPartnerOrg = filterOptions.isPartnerOrg === true;
  const allowedPaths = getAllowedMobilePaths(userGroups, filterOptions);

  if (isPartnerOrg && section === 'reservations') {
    return parts.length >= 3 && !!parts[2]?.trim();
  }

  if (section === 'dashboard') {
    if (!allowedPaths.has('dashboard')) {
      return false;
    }
    return canUserAccessUrl(userGroups, `/${RouterToken.Auth}/${RouterToken.Dashboard}`)
      || canUserAccessUrl(userGroups, `/${RouterToken.Auth}/${RouterToken.DashboardStaff}`)
      || canUserAccessUrl(userGroups, `/${RouterToken.Auth}/${RouterToken.DashboardOwner}`);
  }

  if (section && !allowedPaths.has(section)) {
    return false;
  }

  if (!section) {
    return allowedPaths.size > 0;
  }

  if (isPartnerOrg) {
    return canPartnerAccessUrl(mobileUrlToAuthUrl(url), userGroups);
  }

  return canUserAccessUrl(userGroups, mobileUrlToAuthUrl(url));
}

export function getMobileFallbackUrl(
  userGroups: UserGroupInput,
  filterOptions: SidebarNavFilterOptions
): string {
  const firstMobileItem = buildMobileNavItemsFromDesktop(getFilteredSidebarNavItems(userGroups, filterOptions))[0];
  return firstMobileItem ? getMobilePrimaryLink(firstMobileItem) : '/mobile/home';
}

function mapAuthStartupUrlToMobile(authStartupUrl: string): string | null {
  const parts = (authStartupUrl || '').split('?')[0].split('/').filter(Boolean);
  const segment = parts[0] === RouterToken.Auth ? parts[1] : parts[0];
  if (!segment) {
    return null;
  }

  const mobilePath = DESKTOP_NAV_URL_TO_MOBILE_PATH[segment];
  return mobilePath ? `/${RouterToken.Mobile}/${mobilePath}` : null;
}

/** Mobile post-login URL from the user's startup page (same rules as desktop), with role/nav fallback. */
export function getMobileStartupUrl(
  authService: AuthService,
  organizationTypeId?: number | null
): string {
  const userGroups = authService.getUser()?.userGroups as UserGroupInput;
  const filterOptions = getMobileSidebarFilterOptions(authService, organizationTypeId);
  const mobileFromStartup = mapAuthStartupUrlToMobile(authService.getStartupPageUrl());

  if (mobileFromStartup && canUserAccessMobileUrl(userGroups, mobileFromStartup, filterOptions)) {
    return mobileFromStartup;
  }

  return getMobileFallbackUrl(userGroups, filterOptions);
}

export function getMobileNavItem(sectionPath: string | null | undefined): MobileNavItem | null {
  if (!sectionPath) {
    return null;
  }
  return MOBILE_NAV_ITEMS.find(item => item.path === sectionPath) ?? null;
}

export function getMobilePrimaryLink(item: MobileNavItem): string {
  if (item.tabs.length === 0) {
    return `/mobile/${item.path}`;
  }
  return `/mobile/${item.path}/${item.tabs[0].path}`;
}

export function getMobileTab(item: MobileNavItem, tabPath: string | null | undefined): MobileNavTab | null {
  if (!tabPath) {
    return item.tabs[0] ?? null;
  }
  return item.tabs.find(tab => tab.path === tabPath) ?? null;
}

export function getMobileRouteParts(url: string): { sectionPath: string | null; tabPath: string | null; id: string } {
  const parts = (url || '').split('?')[0].split('/').filter(Boolean);
  const sectionPath = parts[1] ?? null;
  const section = getMobileNavItem(sectionPath);
  if (section && section.tabs.length === 0) {
    return {
      sectionPath,
      tabPath: parts[3] ?? null,
      id: parts[2]?.trim() ?? ''
    };
  }
  return {
    sectionPath,
    tabPath: parts[2] ?? null,
    id: parts[3]?.trim() ?? ''
  };
}

export type MobileReturnTo = 'board' | 'list';
export type MobileReservationReturnTo = MobileReturnTo;
export type MobilePropertyReturnTo = MobileReturnTo;

export function resolveMobileReturnTo(url: string): MobileReturnTo {
  const query = (url || '').split('?')[1] ?? '';
  return new URLSearchParams(query).get('returnTo') === 'board' ? 'board' : 'list';
}

export function resolveMobileReservationReturnTo(url: string): MobileReservationReturnTo {
  return resolveMobileReturnTo(url);
}

export function resolveMobilePropertyReturnTo(url: string): MobilePropertyReturnTo {
  return resolveMobileReturnTo(url);
}

export function getMobileReservationBackUrl(returnTo: MobileReservationReturnTo): string {
  return returnTo === 'board' ? '/mobile/home' : '/mobile/reservations';
}

export function getMobilePropertyBackUrl(returnTo: MobilePropertyReturnTo): string {
  return returnTo === 'board' ? '/mobile/home' : '/mobile/properties';
}

export function buildMobileLeadReturnUrl(tabPath: string, leadId: string | number | null | undefined): string {
  const tab = String(tabPath || 'rentals').trim() || 'rentals';
  const id = String(leadId ?? '').trim();
  if (id) {
    return `/mobile/leads/${tab}/${id}`;
  }
  return `/mobile/leads/${tab}`;
}

export function resolveMobileBoardReturnUrl(url: string): string | null {
  const query = (url || '').split('?')[1] ?? '';
  const returnUrl = String(new URLSearchParams(query).get('returnUrl') || '').trim();
  return returnUrl || null;
}
