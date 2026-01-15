export interface UserRequest {
  userId?: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userGroups: string[];
  officeAccess: number[];
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
  isActive: boolean;
}

export interface UserListDisplay {
  userId: string;
  organizationName: string;
  fullName: string;
  email: string;
  userGroups: string[];
  userGroupsDisplay: string;
  isActive: boolean;
}

