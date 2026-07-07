export interface WorkOrderRequest {
  workOrderId?: string;
  workOrderCode?: string;
  organizationId: string;
  officeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  title: string;
  description: string;
  workOrderTypeId: number;
  applyMarkup: boolean;
  workOrderItems: WorkOrderItemRequest[];
  workOrderDate: string;
  useDepartureFee: boolean;
  enteredInQb: boolean;
  isActive: boolean;
}

export interface WorkOrderResponse {
  workOrderId: string;
  workOrderCode?: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  title?: string;
  description: string;
  amount?: number;
  workOrderTypeId: number;
  workOrderItems: WorkOrderItemResponse[];
  applyMarkup: boolean;
  workOrderDate: string;
  useDepartureFee: boolean;
  enteredInQb: boolean;
  isActive: boolean;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface WorkOrderDisplayList {
  workOrderId: string;
  workOrderCode: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  title?: string | null;
  description?: string | null;
  amount?: number;
  amountDisplay?: string;
  workOrderTypeId: number;
  workOrderType?: string; 
  applyMarkup: boolean;
  workOrderDate: string;
  enteredInQb: boolean;
  isActive: boolean;
  createdBy: string;
}

/** Request shape for a work order item. Omit workOrderId and workOrderItemId on create (GUIDs returned in response). */
export interface WorkOrderItemRequest {
  workOrderId?: string;
  workOrderItemId?: string;
  description: string;
  receiptId?: string;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}

export interface WorkOrderItemResponse {
  workOrderItemId: string;
  workOrderId: string;
  description: string;
  receiptId?: string;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}

export type WorkOrderItemSource = 'noReceipt' | 'receipt' | 'inventory';

/** Editable work order item shape used by work-order form UI. */
export type WorkOrderItemEditable =
  Partial<Pick<WorkOrderItemResponse, 'workOrderItemId' | 'workOrderId'>> &
  Pick<WorkOrderItemResponse, 'description' | 'laborHours' | 'laborCost' | 'itemAmount'> & {
    receiptId?: string | null;
    receiptSplitKey?: string | null;
    receiptAmount?: number;
    itemSource?: WorkOrderItemSource;
  };

export interface ReceiptSplitOption {
  key: string;
  receiptId: string;
  receiptSplitId: number | null;
  splitIndex: number;
  amount: number;
  description: string;
  propertyId?: string | null;
  receiptTypeId: number;
  workOrderId?: string | null;
  workOrder: string;
  label: string;
}

export interface WorkOrderItemSnapshot {
  workOrderItemId: string | null;
  workOrderCode: string | null;
  description: string;
  receiptId: string | null;
  receiptSplitKey: string | null;
  laborHours: number;
  laborCost: number;
  itemAmount: number;
}
