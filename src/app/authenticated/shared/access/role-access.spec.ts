import { RouterToken } from '../../../app.routes.tokens';
import { UserGroups } from '../../users/models/user-enums';
import { canPartnerAccessUrl, canUserAccessUrl, filterNavItemsForPartner, filterSidebarNavItems, getVisibleNavItems, isOwnerOnlyUser } from './role-access';

describe('role-access owner and realtor behavior', () => {
  it('treats owner-only users as owner-only', () => {
    expect(isOwnerOnlyUser([UserGroups.Owner])).toBeTrue();
    expect(isOwnerOnlyUser([UserGroups.Owner, UserGroups.Realtor])).toBeFalse();
  });

  it('limits owner-only users to owner dashboard route', () => {
    expect(canUserAccessUrl([UserGroups.Owner], '/auth/dashboard-owner')).toBeTrue();
    expect(canUserAccessUrl([UserGroups.Owner], '/auth/boards')).toBeFalse();
  });

  it('allows owner+realtor users to access boards and owner dashboard', () => {
    const ownerRealtorGroups = [UserGroups.Owner, UserGroups.Realtor];

    expect(canUserAccessUrl(ownerRealtorGroups, '/auth/dashboard-owner')).toBeTrue();
    expect(canUserAccessUrl(ownerRealtorGroups, '/auth/boards')).toBeTrue();
    expect(canUserAccessUrl(ownerRealtorGroups, '/auth/dashboard')).toBeTrue();
    expect(canUserAccessUrl(ownerRealtorGroups, '/auth/accounting')).toBeFalse();
  });

  it('shows owner dashboard and boards in nav for owner+realtor users', () => {
    const ownerRealtorGroups = [UserGroups.Owner, UserGroups.Realtor];
    const navItems = getVisibleNavItems(ownerRealtorGroups);
    const urls = navItems.map(item => item.url);

    expect(urls).toContain('dashboard-owner');
    expect(urls).toContain('boards');
    expect(urls.length).toBe(2);
  });

  it('limits partner nav to boards, properties, contacts, and settings', () => {
    const partnerAdminOnly = [UserGroups.PartnerAdmin];
    const navItems = filterNavItemsForPartner(getVisibleNavItems(partnerAdminOnly), partnerAdminOnly);
    const urls = navItems.map(item => item.url);

    expect(urls).toEqual(['boards', 'properties', 'contacts', 'settings']);
    expect(canPartnerAccessUrl('/auth/boards', partnerAdminOnly)).toBeTrue();
    expect(canPartnerAccessUrl('/auth/properties/1', partnerAdminOnly)).toBeTrue();
    expect(canPartnerAccessUrl('/auth/logs', partnerAdminOnly)).toBeFalse();
    expect(canPartnerAccessUrl('/auth/accounting', partnerAdminOnly)).toBeFalse();
  });

  it('includes logs in partner nav for org admins only', () => {
    const partnerOrgAdmin = [UserGroups.Admin, UserGroups.PartnerAdmin];
    const navItems = filterNavItemsForPartner(getVisibleNavItems(partnerOrgAdmin), partnerOrgAdmin);
    const urls = navItems.map(item => item.url);

    expect(urls).toEqual(['boards', 'properties', 'contacts', 'settings', 'logs']);
    expect(canPartnerAccessUrl('/auth/logs', partnerOrgAdmin)).toBeTrue();
    expect(canPartnerAccessUrl('/auth/logs', [UserGroups.PartnerAdmin])).toBeFalse();
  });

  it('hides tickets and maintenance when feature flags are off', () => {
    const adminGroups = [UserGroups.Admin];
    const navItems = getVisibleNavItems(adminGroups);
    const filtered = filterSidebarNavItems(navItems, {
      canShowTickets: false,
      canShowMaintenance: false
    });
    const urls = filtered.map(item => item.url);

    expect(urls).not.toContain(RouterToken.TicketList);
    expect(urls).not.toContain(RouterToken.MaintenanceList);
  });

  it('blocks feature-gated routes when the org feature is off', () => {
    const adminGroups = [UserGroups.Admin];
    const featureOptions = {
      canShowLeads: false,
      canShowOwners: false,
      canShowTickets: false,
      canShowMaintenance: false,
      canShowAccounting: false
    };

    expect(canUserAccessUrl(adminGroups, '/auth/leads', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/owner', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/tickets', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/maintenance', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/work-order/1', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/accounting', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/cost-codes', featureOptions)).toBeFalse();
    expect(canUserAccessUrl(adminGroups, '/auth/properties', featureOptions)).toBeTrue();
  });
});
