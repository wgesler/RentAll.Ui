import { AuthService } from '../../../services/auth.service';
import { UserGroups } from '../../users/models/user-enums';

export enum OwnerAuthorization {
  UnauthorizedLead = 0,
  UnauthorizedOwner = 1,
  AuthorizedAdmin = 2
}

export interface OwnerRouteContext {
  token?: string | null;
  propertyCode?: string | null;
  leadOwnerId?: number | null;
}

export function resolveOwnerAuthorization(
  context: OwnerRouteContext,
  authService: AuthService
): OwnerAuthorization {
  const token = String(context.token || '').trim();
  const propertyCode = String(context.propertyCode || '').trim();

  if (token.length > 0) {
    return propertyCode.length > 0
      ? OwnerAuthorization.UnauthorizedLead
      : OwnerAuthorization.UnauthorizedOwner;
  }

  if (!authService.getIsLoggedIn()) {
    return OwnerAuthorization.UnauthorizedOwner;
  }

  if (
    authService.hasRole(UserGroups.SuperAdmin) ||
    authService.hasRole(UserGroups.Admin) ||
    authService.hasRole(UserGroups.OwnerAdmin) ||
    authService.isOwnerAdmin()
  ) {
    return OwnerAuthorization.AuthorizedAdmin;
  }

  return OwnerAuthorization.UnauthorizedOwner;
}

export function isOwnerUnauthorizedLead(authorization: OwnerAuthorization): boolean {
  return authorization === OwnerAuthorization.UnauthorizedLead;
}

export function isOwnerUnauthorizedOwner(authorization: OwnerAuthorization): boolean {
  return authorization === OwnerAuthorization.UnauthorizedOwner;
}

export function isOwnerUnauthorized(authorization: OwnerAuthorization): boolean {
  return isOwnerUnauthorizedLead(authorization) || isOwnerUnauthorizedOwner(authorization);
}

export function isOwnerAuthorizedAdmin(authorization: OwnerAuthorization): boolean {
  return authorization === OwnerAuthorization.AuthorizedAdmin;
}

export function isOwnerAuthorized(authorization: OwnerAuthorization): boolean {
  return isOwnerAuthorizedAdmin(authorization);
}
