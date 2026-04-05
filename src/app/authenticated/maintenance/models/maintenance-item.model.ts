export interface MaintenanceItemRequest {
  maintenanceItemId?: number
  propertyId: string;
  name: string;
  notes?: string | null;
  monthsBetweenService: number;
  lastServicedOn?: string | null;
}

export interface MaintenanceItemResponse {
  maintenanceItemId: number
  propertyId: string;
  name: string;
  notes?: string | null;
  monthsBetweenService: number;
  lastServicedOn?: string | null;
}
