import type { CalendarDateString } from '../../../services/utility.service';

export interface ExternalCalendarImportRequest {
  externalCalendarUrl: string;
}

export interface ExternalCalendarImportEvent {
  uid: string;
  summary: string;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
}

export interface ExternalCalendarImportResponse {
  externalCalendarUrl: string;
  eventCount: number;
  events: ExternalCalendarImportEvent[];
}
