import type {
  MaintenanceListResponse,
  MaintenanceListStatusDropdownCell,
  MaintenanceListUserDropdownCell
} from '../../maintenance/models/maintenance.model';
import type { PropertyBedDropdownCell, PropertyListDisplay, PropertyListResponse } from '../../properties/models/property.model';
import type { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ServiceType } from './mixed-enums';
import type { CalendarDateString } from '../../../services/utility.service';

export interface PropertyMaintenance {
  propertyId: string;
  propertyCode: string;
  shortAddress: string;
  officeId: number;
  officeName: string;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  propertyStatusId: number;
  availableAfter: string;
  availableUntil: string;
  bed1Text: PropertyBedDropdownCell;
  bed2Text: PropertyBedDropdownCell;
  bed3Text: PropertyBedDropdownCell;
  bed4Text: PropertyBedDropdownCell;

  // Maintenance Field
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;
}

export interface ReservationPropertyMaintenance
{
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  contactId: string;
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  tenantName: string;
  agentCode?: string | null;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  hasPets: boolean;
  maidUserId: string | null;
  maidStartDate: CalendarDateString | null;
  frequencyId: number;
  maidServiceFee: number;

  // Property Fields
  shortAddress: string;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  propertyStatusId: number;
  availableAfter: string;
  availableUntil: string;
  bed1Text: PropertyBedDropdownCell;
  bed2Text: PropertyBedDropdownCell;
  bed3Text: PropertyBedDropdownCell;
  bed4Text: PropertyBedDropdownCell;

  // Maintenance Fields
  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;

  // Calculated Fields
  eventDate: string;
  eventType: ServiceType;
  eventDateSortTime: number;

  /** Table-friendly strings (service dashboard, etc.) */
  maidServiceType: string;
  maintenanceNotes: string;
  cleaningDateFormatted: string;
  carpetDateFormatted: string;
  inspectingDateFormatted: string;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
}

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
  bed1Text: PropertyBedDropdownCell;
  bed2Text: PropertyBedDropdownCell;
  bed3Text: PropertyBedDropdownCell;
  bed4Text: PropertyBedDropdownCell;
  eventDate: string;
  eventDateSortTime: number;
  hasPets: boolean;
  needsMaintenance: boolean;
  needsMaintenanceState: 'red' | 'yellow' | 'green' | 'grey';
}
