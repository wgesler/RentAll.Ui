import type { CalendarDateString } from '../../../services/utility.service';

export interface MaintenanceRequest {
  maintenanceId?: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  inspectionCheckList: string;
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  notes?: string | null;
  isActive: boolean;
}

export interface MaintenanceResponse {
  maintenanceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  inspectionCheckList: string;
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  notes?: string | null;
  isActive: boolean;
}

export interface MaintenanceListResponse {
  maintenanceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  propertyAddress: string;
  inspectionCheckList: string;
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;  
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  notes: string;
}

export interface MaintenanceListUserDropdownCell {
  value: string;
  isOverridable: boolean;
  options?: string[];
  panelClass?: string | string[];
  toString: () => string;
}

export interface MaintenanceListStatusDropdownCell {
  value: string;
  isOverridable: boolean;
  panelClass?: string | string[];
  toString: () => string;
}