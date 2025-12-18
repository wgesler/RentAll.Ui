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
	Government = 2,
	External = 3,
	Owner = 4
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
  BiMonthly = 3,
  Monthly = 4
}