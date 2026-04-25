export interface WorkOrderRequest {
  workOrderId?: string;
  workOrderCode?: string;
  organizationId: string;
  officeId: number;
  propertyId: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  description: string;
  workOrderTypeId: number;
  applyMarkup: boolean;
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
  description: string;
  workOrderTypeId: number;
  workOrderItems: WorkOrderItemResponse[];
  applyMarkup: boolean;
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
  reservationId?: string | null;
  reservationCode?: string | null;
  description?: string | null;
  amount?: number;
  amountDisplay?: string;
  workOrderTypeId: number;
  workOrderType?: string; 
  applyMarkup: boolean;
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

export type WorkOrderItemSource = 'noReceipt' | 'receipt' | 'inventory';

/** Editable work order item shape used by work-order form UI. */
export type WorkOrderItemEditable =
  Partial<Pick<WorkOrderItemResponse, 'workOrderItemId' | 'workOrderId'>> &
  Pick<WorkOrderItemResponse, 'description' | 'laborHours' | 'laborCost' | 'itemAmount'> & {
    receiptId?: number | null;
    receiptSplitKey?: string | null;
    receiptAmount?: number;
    itemSource?: WorkOrderItemSource;
  };

export interface ReceiptSplitOption {
  key: string;
  receiptId: number;
  splitIndex: number;
  amount: number;
  description: string;
  workOrder: string;
  label: string;
}

export interface WorkOrderItemSnapshot {
  workOrderItemId: string | null;
  description: string;
  receiptId: number | null;
  receiptSplitKey: string | null;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}
