export interface CostCodesRequest {
  costCodeId?: number;
  organizationId: string;
  officeId: number;
  costCode: string;
  transactionTypeId: number;
  description: string;
  isActive: boolean;
}

export interface CostCodesResponse {
  costCodeId: number;
  organizationId: string;
  officeId: number;
  costCode: string;
  transactionTypeId: number;
  description: string;
  isActive: boolean;
}

export interface CostCodesListDisplay {
  costCodeId: number;
  officeId: number;
  officeName: string;
  costCode: string;
  transactionTypeId: number;
  transactionType: string;
  description: string;
  isActive: boolean;
  chartOfAccountDisplay?: string;
  rowColor?: string; // Hidden column for row coloring
}
