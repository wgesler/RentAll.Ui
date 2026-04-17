import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';

export interface MonthlyCommissionDisplay extends ReservationListDisplay {
  daysRented: number;
  commission: number;
  commissionDisplay: string;
}

export interface MonthlyCommissionTileRow {
  agentCode: string;
  amount: number;
}

export interface PropertyMaintenanceReservation {
  //Property Values
  propertyId: string;
  propertyCode: string;
  shortAddress:string;
  officeId: number;  
  officeName: string;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  propertyStatusId: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;

  // Maintenance Values
  cleanerUserId?: string | null;
  cleaningDate?: string | null;
  carpetUserId?: string | null;
  carpetDate?: string | null;
  inspectorUserId?: string | null;
  inspectingDate?: string | null;

  // Reservation Values
  maidServiceFee: number;
  maidUserId: string | null;
  maidStartDate: string | null;
  frequencyId: number;

  // Combination Values
  eventDate: string;
}

export interface ReservationListExtended {
  reservation: ReservationListResponse;
  maidServiceFee?: number | null;
}