export interface InventoryResponse {
  inventoryId: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  inventoryCheckList?: string | null;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface InventoryDisplayList {
  inventoryId: number;
  officeId: number;
  propertyId: string;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
