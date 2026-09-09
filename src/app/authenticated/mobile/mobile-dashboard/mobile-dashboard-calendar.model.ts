import { ServiceType } from '../../shared/models/mixed-enums';
import { MaintenanceListDisplay, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { ColumnSet } from '../../shared/data-table/models/column-data';

export type MobileScheduleDateCell = {
  text: string;
  emphasis: 'primary' | 'muted' | 'none';
};

export type MobileScheduleDotType = 'blue' | 'purple' | 'green' | 'pink';

export type MobileScheduleCalendarCell = {
  day: number | null;
  dateKey: string | null;
  isToday: boolean;
  isWeekend: boolean;
};

export type MobileScheduleCalendarMonth = {
  title: string;
  cells: MobileScheduleCalendarCell[];
};

export type MobileCalendarMaintenanceRow = {
  propertyCode: string;
  reservationCode: string | null;
  contactName: string;
  cleaningDate: string;
  carpetDate: string;
  inspectingDate: string;
  eventType: ServiceType | null;
  propertyId: string | null;
  reservationId: string | null;
  maintenanceId: string | null;
};

export type MobileCalendarDayEventKind = 'arrival' | 'departure' | 'cleaning' | 'carpet' | 'inspection' | 'maid';

export type MobileCalendarDayEvent = {
  propertyCode: string;
  reservationCode: string;
  contactName: string;
  eventLabel: string;
  eventKind: MobileCalendarDayEventKind;
  propertyId: string | null;
  reservationId: string | null;
  maintenanceId: string | null;
  dateKey: string;
};

export type MobileDashboardCalendarSnapshot = {
  isReady: boolean;
  arrivalRows: ReservationTurnoverEventDisplay[];
  departureRows: ReservationTurnoverEventDisplay[];
  maintenanceRows: MobileCalendarMaintenanceRow[];
  scheduleCleaningRows: MaintenanceListDisplay[];
  scheduleCleaningColumns: ColumnSet;
  serviceProviderOptions: { userId: string; label: string }[];
};
