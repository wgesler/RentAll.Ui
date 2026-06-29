import { FileDetails } from '../../../shared/models/fileDetails';

export interface UserRequest {
  userId?: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string | null;
  userGroups: string[];
  officeAccess: number[];
  properties: string[];
  profilePath?: string;
  fileDetails?: FileDetails;
  startupPageId: number;
  defaultPageSize: number;
  defaultOfficeId: number | null;
  agentId?: string | null;
  commissionRate?: number | null;
  contactId?: string | null;
  lastLoginOn?: string | null;
  lastSeenOn?: string | null;
  lastLogoutOn?: string | null;
  isLoggedIn?: boolean;
  isActive: boolean;
}

export interface UserResponse {
  userId: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  userGroups: string[];
  officeAccess: number[];
  properties: string[];
  profilePath?: string;
  fileDetails?: FileDetails;
  startupPageId: number;
  defaultPageSize: number;
  defaultOfficeId: number | null;
  agentId?: string | null;
  commissionRate?: number | null;
  contactId?: string | null;
  lastLoginOn?: string | null;
  lastSeenOn?: string | null;
  lastLogoutOn?: string | null;
  isLoggedIn?: boolean;
  isActive: boolean;
}

export interface UserListDisplay {
  userId: string;
  organizationName: string;
  officeAccess: number[];
  fullName: string;
  email: string;
  phone: string;
  startupPageDisplay: string;
  defaultOfficeId?: number | null;
  defaultOffice: string;
  userGroups: string[];
  userGroupsDisplay: string;
  isLoggedInDisplay: string;
  lastLoginOnDisplay: string;
  isActive: boolean;
}

export interface UserActivityResponse {
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  isLoggedIn: boolean;
  lastLoginOn?: string | null;
  lastSeenOn?: string | null;
  lastLogoutOn?: string | null;
}

export interface UserAuditListDisplay {
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  isLoggedIn: boolean;
  isLoggedInDisplay: string;
  lastLoginOnDisplay: string;
  lastSeenOnDisplay: string;
  lastLogoutOnDisplay: string;
}

