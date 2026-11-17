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

export interface MaintenanceItemListResponse {
  maintenanceItemId: number;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  name: string;
  lastServicedOn: CalendarDateString;
  monthsBetweenService: number;
  notes?: string | null;
}

export interface MaintenanceItemEditRow {
  rowId: number;
  maintenanceItemId?: number;
  name: string;
  notes: string;
  monthsBetweenService: number | null;
  lastServicedOn: Date | null;
}
