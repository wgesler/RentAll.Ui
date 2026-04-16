import type { PropertyListDisplay } from '../../properties/models/property.model';
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
  inspectionCheckList: string;
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  notes?: string | null;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface MaintenanceListResponse {
  maintenanceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyAddress: string;
  inspectionCheckList: string;
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;  
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  needsMaintenance: boolean;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  petsAllowed: boolean;
  lastFilterChangeDate?: string | null;
  smokeDetectors?: string | null;
  lastSmokeChangeDate?: string | null;
  lastBatteryChangeDate?: string | null;
  licenseDate?: string | null;
  hvacServiced?: string | null;
  fireplaceServiced?: string | null;
}

export interface MaintenanceListUserDropdownCell {
  value: string;
  isOverridable: boolean;
  options?: string[];
  panelClass?: string | string[];
  toString: () => string;
}

export interface MaintenanceListBedDropdownCell {
  value: string;
  isOverridable: boolean;
  panelClass?: string | string[];
  toString: () => string;
}

export interface MaintenanceListStatusDropdownCell {
  value: string;
  isOverridable: boolean;
  panelClass?: string | string[];
  toString: () => string;
}

/** Property + maintenance API merge; assignee fields are raw user ids until list display mapping runs. */
export interface MaintenanceListPropertyRow extends PropertyListDisplay {
  propertyAddress: string;
  propertyStatusText: string;
  propertyStatusDropdown: MaintenanceListStatusDropdownCell;
  cleaner: string;
  cleaningDate: string;
  carpet: string;
  carpetDate: string;
  inspector: string;
  inspectingDate: string;
  bed1Text: MaintenanceListBedDropdownCell;
  bed2Text: MaintenanceListBedDropdownCell;
  bed3Text: MaintenanceListBedDropdownCell;
  bed4Text: MaintenanceListBedDropdownCell;
  petsAllowed: boolean;
  needsMaintenance: boolean;
  needsMaintenanceState: 'red' | 'yellow' | 'green' | 'grey';
}

/** Maintenance grid row (data table). */
export interface MaintenanceListDisplay extends PropertyListDisplay {
  propertyAddress: string;
  propertyStatusText: string;
  propertyStatusDropdown: MaintenanceListStatusDropdownCell;
  cleaner: MaintenanceListUserDropdownCell;
  cleanerUserId?: string | null;
  cleaningDate: string;
  carpet: MaintenanceListUserDropdownCell;
  carpetUserId?: string | null;
  carpetDate: string;
  inspector: MaintenanceListUserDropdownCell;
  inspectorUserId?: string | null;
  inspectingDate: string;
  bed1Text: MaintenanceListBedDropdownCell;
  bed2Text: MaintenanceListBedDropdownCell;
  bed3Text: MaintenanceListBedDropdownCell;
  bed4Text: MaintenanceListBedDropdownCell;
  departureDate: CalendarDateString;
  /** Epoch ms at start of checkout day; `Number.MAX_SAFE_INTEGER` when no current stay (sorts last). */
  departureSortTime: number;
  petsAllowed: boolean;
  needsMaintenance: boolean;
  needsMaintenanceState: 'red' | 'yellow' | 'green' | 'grey';
}
