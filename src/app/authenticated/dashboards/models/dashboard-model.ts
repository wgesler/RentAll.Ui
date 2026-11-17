import { ReservationListDisplay } from '../../reservations/models/reservation-model';
import { PropertyLeaseType } from '../../properties/models/property-enums';
import { DashboardPropertyTurnoverRow, MaintenanceListDisplay, PropertyInProcessDisplay, PropertyVacancyDisplay, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { DashboardCalendarEventKind } from '../services/dashboard-company-data.service';

export interface MonthlyCommissionDisplay extends ReservationListDisplay {
  daysRented: number;
  commission: number;
  commissionDisplay: string;
}

export interface MonthlyCommissionTileRow {
  agentCode: string;
  amount: number;
}

export type DashboardServiceProviderOption = {
  userId: string;
  label: string;
};

export type ScheduleDateCell = {
  text: string;
  emphasis: 'primary' | 'muted' | 'none';
};

export type ArrivalTurnoverRow = ReservationTurnoverEventDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: ArrivalTurnoverRow) => void;
};

export type DepartureTurnoverRow = ReservationTurnoverEventDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: DepartureTurnoverRow) => void;
};

export type OccupiedTurnoverRow = PropertyInProcessDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OccupiedTurnoverRow) => void;
};

export type VacantTurnoverRow = PropertyVacancyDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: VacantTurnoverRow) => void;
};

export type OfflineTabRow = PropertyInProcessDisplay & {
  availableUntilDisplay: string;
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OfflineTabRow) => void;
};

export type OfflineLeaseTypeSection = {
  leaseTypeId: PropertyLeaseType;
  title: string;
  rows: OfflineTabRow[];
};

export type OnlineTurnoverRow = DashboardPropertyTurnoverRow & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OnlineTurnoverRow) => void;
};

export type OnlineLeaseTypeSection = {
  leaseTypeId: PropertyLeaseType;
  title: string;
  rows: OnlineTurnoverRow[];
};

export type DashboardMaintenancePropertyRow = {
  maintenanceItemId: number;
  propertyId: string;
  propertyCode: string;
  name: string;
  lastServiced: string;
  months: string;
  dateDue: string;
  dateDueSortKey: string;
  notes: string;
  needsMaintenance: true;
  needsMaintenanceState: 'red' | 'yellow' | 'green';
};

export type ScheduleDotType = 'blue' | 'purple' | 'green' | 'pink';

export type ScheduleCalendarCell = { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean };

export type ScheduleCalendarMonth = { title: string; cells: ScheduleCalendarCell[] };

export type CalendarDayEvent = {
  propertyCode: string;
  reservationCode: string;
  contactName: string;
  eventLabel: string;
  eventKind: DashboardCalendarEventKind;
  targetTabIndex: number;
  propertyId: string | null;
  reservationId: string | null;
  maintenanceId: string | null;
  dateKey: string;
};
