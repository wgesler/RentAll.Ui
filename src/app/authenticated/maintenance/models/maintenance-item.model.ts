import type { CalendarDateString } from '../../../services/utility.service';

export interface MaintenanceItemRequest {
  maintenanceItemId?: number
  propertyId: string;
  name: string;
  lastServicedOn: CalendarDateString;
  monthsBetweenService: number;
  notes?: string | null;
}

export interface MaintenanceItemResponse {
  maintenanceItemId: number
  propertyId: string;
  name: string;
  lastServicedOn: CalendarDateString;
  monthsBetweenService: number;
  notes?: string | null;
}
