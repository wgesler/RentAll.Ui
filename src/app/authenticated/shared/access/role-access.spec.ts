import { UserGroups } from '../../users/models/user-enums';
import { canPartnerAccessUrl, canUserAccessUrl, filterNavItemsForPartner, getVisibleNavItems, isOwnerOnlyUser } from './role-access';

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
    const navItems = filterNavItemsForPartner(getVisibleNavItems([UserGroups.Admin]));
    const urls = navItems.map(item => item.url);

    expect(urls).toEqual(['boards', 'properties', 'contacts', 'settings']);
    expect(canPartnerAccessUrl('/auth/boards')).toBeTrue();
    expect(canPartnerAccessUrl('/auth/properties/1')).toBeTrue();
    expect(canPartnerAccessUrl('/auth/accounting')).toBeFalse();
  });
});
