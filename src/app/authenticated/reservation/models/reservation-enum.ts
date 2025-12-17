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

export enum ClientType {
  Private = 0,
  Corporate = 1,
  Government = 2,
  External = 3
}

export enum BillingType {
  Monthly = 0,
  Daily = 1,
  Nightly = 2
}

export enum Frequency {
  OneTime = 0,
  Weekly = 1,
  BiWeekly = 2,
  Monthly = 3
}