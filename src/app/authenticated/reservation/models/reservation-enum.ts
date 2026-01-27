export enum ReservationStatus {
  PreBooking = 0,
  Confirmed = 1,
  CheckedIn = 2,
  GaveNotice = 3,
  FirstRightRefusal = 4,
  Maintenance = 5,
  OwnerBlocked = 6,
  ArrivalDeparture = 7
}

export enum ReservationType {
 	Private = 0,
	Corporate = 1,
	Owner = 2
}

export enum BillingType {
  Monthly = 0,
  Daily = 1,
  Nightly = 2
}

export enum Frequency {
  NA = 0,
  OneTime = 1,
  Weekly = 2,
  EOW = 3,
  Monthly = 4
}

export enum ReservationNotice {
  ThirtyDays = 0,
  FifteenDays = 1,
  FourteenDays = 2
}

export enum DepositType {
  Deposit = 0,
  CLR = 1,
  SDW = 2
}

export function formatReservationStatus(reservationStatusId?: number): string {
  if (reservationStatusId === undefined || reservationStatusId === null) {
    return 'Unknown';
  }
  const statusLabels: { [key: number]: string } = {
    [ReservationStatus.PreBooking]: 'Pre-Booking',
    [ReservationStatus.Confirmed]: 'Confirmed',
    [ReservationStatus.CheckedIn]: 'Checked In',
    [ReservationStatus.GaveNotice]: 'Gave Notice',
    [ReservationStatus.FirstRightRefusal]: 'First Right of Refusal',
    [ReservationStatus.Maintenance]: 'Maintenance',
    [ReservationStatus.OwnerBlocked]: 'Owner Blocked',
    [ReservationStatus.ArrivalDeparture]: 'Arrival/Departure' 
  };
  return statusLabels[reservationStatusId] || 'Unknown';
}