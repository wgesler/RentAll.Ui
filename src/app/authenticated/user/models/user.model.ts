export interface UserRequest {
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userGroups: string[];
  isActive: boolean;
}

export interface UserResponse {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userGroups: string[];
  isActive: boolean;
}

export interface UserListDisplay {
  userId: string;
  fullName: string;
  email: string;
  userGroups: string[];
  userGroupsDisplay: string;
  isActive: boolean;
}

