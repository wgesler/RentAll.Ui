export interface WorkOrderRequest {
  workOrderId?: string;
  workOrderCode?: string;
  organizationId: string;
  officeId: number;
  propertyId: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  workOrderTypeId: number;
  description: string;
  workOrderItems: WorkOrderItemRequest[];
  isActive: boolean;
}

export interface WorkOrderResponse {
  workOrderId: string;
  workOrderCode?: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  workOrderTypeId: number;
  description: string;
  workOrderItems: WorkOrderItemResponse[];
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}

export interface WorkOrderDisplayList {
  workOrderId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  reservationCode?: string | null;
  workOrderTypeId: number;
  workOrderType?: string; // display label from WorkOrderType enum
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}

/** Request shape for a work order item. Omit workOrderId and workOrderItemId on create (GUIDs returned in response). */
export interface WorkOrderItemRequest {
  workOrderId?: string;
  workOrderItemId?: string;
  description: string;
  receiptId?: number;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}

export interface WorkOrderItemResponse {
  workOrderItemId: string;
  workOrderId: string;
  description: string;
  receiptId?: number;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}
