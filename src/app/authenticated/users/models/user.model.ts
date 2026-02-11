import { FileDetails } from '../../../shared/models/fileDetails';

export interface UserRequest {
  userId?: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string | null;
  userGroups: string[];
  officeAccess: number[];
  profilePath?: string;
  fileDetails?: FileDetails;
  startupPageId: number;
  agentId?: string | null;
  commissionRate?: number | null;
  isActive: boolean;
}

export interface UserResponse {
  userId: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userGroups: string[];
  officeAccess: number[];
  profilePath?: string;
  fileDetails?: FileDetails;
  startupPageId: number;
  agentId?: string | null;
  commissionRate?: number | null;
  isActive: boolean;
}

export interface UserListDisplay {
  userId: string;
  organizationName: string;
  officeAccess: number[];
  fullName: string;
  email: string;
  startupPageDisplay: string;
  userGroups: string[];
  userGroupsDisplay: string;
  isActive: boolean;
}

