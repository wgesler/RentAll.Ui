export interface MaintenanceItemRequest {
  maintenanceItemId?: number
  propertyId: string;
  name: string;
  lastServicedOn: string;
  monthsBetweenService: number;
  notes?: string | null;
}

export interface MaintenanceItemResponse {
  maintenanceItemId: number
  propertyId: string;
  name: string;
  lastServicedOn: string;
  monthsBetweenService: number;
  notes?: string | null;
}
