import { ReservationListDisplay } from '../../reservations/models/reservation-model';

export interface MonthlyCommissionDisplay extends ReservationListDisplay {
  daysRented: number;
  commission: number;
  commissionDisplay: string;
}

export interface MonthlyCommissionTileRow {
  agentCode: string;
  amount: number;
}