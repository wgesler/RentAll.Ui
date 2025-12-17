export interface FranchiseRequest {
  franchiseId?: number;
  organizationId: string;
  franchiseCode: string;
  description: string;
  isActive: boolean;
}

export interface FranchiseResponse {
  franchiseId: number;
  organizationId: string;
  franchiseCode: string;
  description: string;
  isActive: boolean;
}

export interface FranchiseListDisplay {
  franchiseId: number;
  franchiseCode: string;
  description: string;
  isActive: boolean;
}

