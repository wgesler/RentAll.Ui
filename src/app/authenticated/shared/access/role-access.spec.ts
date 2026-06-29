import { UserGroups } from '../../users/models/user-enums';
import { canUserAccessUrl, getVisibleNavItems, isOwnerOnlyUser } from './role-access';

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
});
