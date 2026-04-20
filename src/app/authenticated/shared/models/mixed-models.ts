import type {
  MaintenanceListResponse,
  MaintenanceListStatusDropdownCell,
  MaintenanceListUserDropdownCell
} from '../../maintenance/models/maintenance.model';
import type { PropertyBedDropdownCell, PropertyListDisplay, PropertyListResponse } from '../../properties/models/property.model';
import type { UserResponse } from '../../users/models/user.model';
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
  availableFrom: CalendarDateString | null;
  availableFromOrdinal: number | null;
  availableFromDisplay: string;
  availableUntil: CalendarDateString | null;
  availableUntilOrdinal: number | null;
  availableUntilDisplay: string;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  bed1Text: PropertyBedDropdownCell;
  bed2Text: PropertyBedDropdownCell;
  bed3Text: PropertyBedDropdownCell;
  bed4Text: PropertyBedDropdownCell;

  onCleanerUserId?: string | null;
  onCleaningDate?: CalendarDateString | null;
  onCleaningDateOrdinal: number | null;
  onCleaningDateDisplay: string;
  onCarpetUserId?: string | null;
  onCarpetDate?: CalendarDateString | null;
  onCarpetDateOrdinal: number | null;
  onCarpetDateDisplay: string;
  onInspectorUserId?: string | null;
  onInspectingDate?: CalendarDateString | null;
  onInspectingDateOrdinal: number | null;
  onInspectingDateDisplay: string;

  offCleanerUserId?: string | null;
  offCleaningDate?: CalendarDateString | null;
  offCleaningDateOrdinal: number | null;
  offCleaningDateDisplay: string;
  offCarpetUserId?: string | null;
  offCarpetDate?: CalendarDateString | null;
  offCarpetDateOrdinal: number | null;
  offCarpetDateDisplay: string;
  offInspectorUserId?: string | null;
  offInspectingDate?: CalendarDateString | null;
  offInspectingDateOrdinal: number | null;
  offInspectingDateDisplay: string;

  maintenanceNotes: string;
  eventType?: ServiceType | null;
  eventTypeDisplay?: string | null;
  eventDate?: CalendarDateString | null;
  eventDateSortTime?: number | null;
}

export interface ReservationPropertyMaintenance extends PropertyMaintenance {
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
  reservationStatusId: number;
  arrivalDate: CalendarDateString;
  arrivalDateOrdinal: number | null;
  arrivalDateDisplay: string;
  departureDate: CalendarDateString;
  departureDateOrdinal: number | null;
  departureDateDisplay: string;
  hasPets: boolean;
  maidUserId: string | null;
  maidStartDate: CalendarDateString | null;
  maidStartDateOrdinal: number | null;
  maidStartDateDisplay: string;
  frequencyId: number;
  maidServiceFee: number;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;
  
  aCleanerUserId?: string | null;
  aCleaningDate?: CalendarDateString | null;
  aCleaningDateOrdinal: number | null;
  acleaningDateDisplay: string;
  aCarpetUserId?: string | null;
  aCarpetDate?: CalendarDateString | null;
  aCarpetDateOrdinal: number | null;
  aCarpetDateDisplay: string;
  aInspectorUserId?: string | null;
  aInspectingDate?: CalendarDateString | null;
  aInspectingDateOrdinal: number | null;
  aInspectingDateDisplay: string;

  dCleanerUserId?: string | null;
  dCleaningDate?: CalendarDateString | null;
  dCleaningDateOrdinal: number | null;
  dCleaningDateDisplay: string;
  dCarpetUserId?: string | null;
  dCarpetDate?: CalendarDateString | null;
  dCarpetDateOrdinal: number | null;
  dCarpetDateDisplay: string;
  dInspectorUserId?: string | null;
  dInspectingDate?: CalendarDateString | null;
  dInspectingDateOrdinal: number | null;
  dInspectingDateDisplay: string;
  rowActive?: boolean;
}

export interface ReservationPropertyMaintenanceDisplayList {
  propertyId: string;
  propertyCode: string;
  reservationId: string;
  reservationCode: string;
  officeId: number;
  officeName: string;
  propertyAddress: string;
  propertyStatusText: string;
  propertyStatusDropdown: MaintenanceListStatusDropdownCell;

  cleaner: MaintenanceListUserDropdownCell;
  cleanerUserId?: string | null;
  cleaningDate: string;
  carpet: MaintenanceListUserDropdownCell;
  carpetUserId?: string | null;
  carpetDate: string;
  inspectorUserId?: string | null;
  inspectingDate: string;
  bed1Text: PropertyBedDropdownCell;
  bed2Text: PropertyBedDropdownCell;
  bed3Text: PropertyBedDropdownCell;
  bed4Text: PropertyBedDropdownCell;
  maidServiceFee: number;

  hasPets: boolean;
  needsMaintenance: boolean;
  needsMaintenanceState: 'red' | 'yellow' | 'green' | 'grey';

  eventType?: ServiceType;
  eventTypeDisplay?: string;
  eventDate: CalendarDateString;
  eventDateSortTime?: number;
}

export interface MaintenanceListDisplay extends PropertyListDisplay {
  maintenanceId?: string;
  reservationId?: string | null;
  eventType?: ServiceType | null;
  propertyAddress: string;
  propertyStatusText: string;
  propertyStatusDropdown: MaintenanceListStatusDropdownCell;
  
  maidUserId?: string | null;
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

export type DashboardPropertyTurnoverRow = PropertyListDisplay & {
  availableAfter: string;
  availableUntil: string;
  cleanerUserId?: string | null;
  carpetUserId?: string | null;
  inspectorUserId?: string | null;
  cleaningDateDisplay?: string;
  carpetDateDisplay?: string;
  inspectingDateDisplay?: string;
};

export type PropertyVacancyDisplay = PropertyListResponse & {
  vacancyDays: number | null;
  vacancyDaysDisplay: string | number;
  lastDepartureDate: string | null;
};

export interface ReservationTurnoverEventDisplay {
  propertyId: string;
  propertyCode: string;
  officeId: number;
  reservationId: string;
  reservationCode: string;
  contactId: string;
  companyName: string;
  agentCode: string | null;
  tenantName: string;
  contactName: string;
  officeName: string;
  arrivalDateDisplay: string;
  departureDateDisplay: string;
  reservationStatusDisplay: string;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;
  cleanerUserId?: string | null;
  carpetUserId?: string | null;
  inspectorUserId?: string | null;
  cleaningDateDisplay?: string;
  carpetDateDisplay?: string;
  inspectingDateDisplay?: string;
}

export type MaintenanceListLoadResponse = {
  properties?: PropertyListResponse[] | null;
  maintenanceList?: MaintenanceListResponse[] | null;
};

export type MaintenanceListCurrentReservationSnapshot = {
  reservationId: string | null;
  hasPets: boolean;
  eventDate: string;
  eventDateSortTime: number;
};

export type MaintenanceListCurrentReservationByPropertyId = Map<string, MaintenanceListCurrentReservationSnapshot>;

export type MaintenanceListMappingContext = {
  housekeepingUsers: UserResponse[];
  carpetUsers: UserResponse[];
  inspectorUsers: UserResponse[];
  housekeepingById: Map<string, string>;
  carpetById: Map<string, string>;
  inspectorById: Map<string, string>;
  currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId;
};
