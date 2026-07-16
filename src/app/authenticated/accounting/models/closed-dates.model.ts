import type { CalendarDateString } from '../../../services/utility.service';

export interface ClosedDateRequest {
  closedDateId?: number;
  officeId: number;
  startDate: CalendarDateString;
  endDate: CalendarDateString;
  postingStatusId: number;
}

export interface ClosedDateResponse {
  closedDateId: number;
  organizationId: string;
  officeId: number;
  startDate: CalendarDateString;
  endDate: CalendarDateString;
  postingStatusId: number;
}

export interface ClosedDateSearchRequest {
  officeIds: number[];
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
  postingStatusId?: number | null;
}
