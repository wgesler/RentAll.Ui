import { AuthService } from '../../services/auth.service';
import { OrganizationType } from '../organizations/models/organization-enum';
import { UserGroups } from '../users/models/user-enums';
import { canShowLeadsNav, type UserGroupInput } from '../shared/access/role-access';

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

/** Partner org hamburger items — matches desktop PARTNER_NAV_ITEMS (board, properties, contacts). */
export const MOBILE_PARTNER_NAV_PATHS = new Set(['home', 'properties', 'contacts']);

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
  let items = MOBILE_NAV_ITEMS;

  if (!canShowLeadsNav(authService)) {
    items = items.filter(item => item.path !== 'leads');
  }

  if (!authService.hasRole(UserGroups.SuperAdmin)
    && Number(organizationTypeId) === OrganizationType.Partner) {
    items = items.filter(item => MOBILE_PARTNER_NAV_PATHS.has(item.path));
  }

  return items;
}

export function canPartnerAccessMobileUrl(url: string, _userGroups?: UserGroupInput): boolean {
  const parts = (url || '').split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (parts[0] !== 'mobile') {
    return true;
  }

  const section = parts[1] ?? 'home';
  if (MOBILE_PARTNER_NAV_PATHS.has(section)) {
    return true;
  }

  // Board opens reservation detail/new; block the reservations list page.
  if (section === 'reservations') {
    return parts.length >= 3 && !!parts[2]?.trim();
  }

  if (section === 'dashboard') {
    return false;
  }

  return false;
}

export function getMobilePartnerFallbackUrl(): string {
  return '/mobile/home';
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
