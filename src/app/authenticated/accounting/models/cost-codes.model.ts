export interface CostCodesRequest {
  costCodeId?: string;
  organizationId: string;
  officeId: number;
  costCode: string;
  transactionTypeId: number;
  description: string;
  isActive: boolean;
}

export interface CostCodesResponse {
  costCodeId: string;
  organizationId: string;
  officeId: number;
  costCode: string;
  transactionTypeId: number;
  description: string;
  isActive: boolean;
}

export interface CostCodesListDisplay {
  costCodeId: string;
  officeId: number;
  officeName: string;
  costCode: string;
  transactionTypeId: number;
  transactionType: string;
  description: string;
  isActive: boolean;
}
