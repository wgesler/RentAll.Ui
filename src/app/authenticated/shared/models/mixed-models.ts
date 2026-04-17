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

  cleanerUserId?: string | null;
  cleaningDate?: CalendarDateString | null;
  cleaningDateOrdinal: number | null;
  cleaningDateDisplay: string;
  carpetUserId?: string | null;
  carpetDate?: CalendarDateString | null;
  carpetDateOrdinal: number | null;
  carpetDateDisplay: string;
  inspectorUserId?: string | null;
  inspectingDate?: CalendarDateString | null;
  inspectingDateOrdinal: number | null;
  inspectingDateDisplay: string;
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
  inspector: MaintenanceListUserDropdownCell;
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

export type DashboardPropertyTurnoverRow = PropertyListDisplay & {
  availableAfter: string;
  availableUntil: string;
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
}

export type MaintenanceListLoadResponse = {
  properties?: PropertyListResponse[] | null;
  maintenanceList?: MaintenanceListResponse[] | null;
};

export type MaintenanceListCurrentReservationSnapshot = {
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
  isVendorView: boolean;
  vendorRestrictedPropertyIds: Set<string>;
  currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId;
};
