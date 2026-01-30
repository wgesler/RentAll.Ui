//#region ReservationStatus
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

export function getReservationStatus(reservationStatusId: number | undefined): string {
  if (reservationStatusId === undefined || reservationStatusId === null) return '';
  
  const statusMap: { [key: number]: string } = {
    [ReservationStatus.PreBooking]: 'Pre-Booking',
    [ReservationStatus.Confirmed]: 'Confirmed',
    [ReservationStatus.CheckedIn]: 'Checked In',
    [ReservationStatus.GaveNotice]: 'Gave Notice',
    [ReservationStatus.FirstRightRefusal]: 'First Right of Refusal',
    [ReservationStatus.Maintenance]: 'Maintenance',
    [ReservationStatus.OwnerBlocked]: 'Owner Blocked',
    [ReservationStatus.ArrivalDeparture]: 'Arrival/Departure' 
  };
  
  return statusMap[reservationStatusId] || '';
}

// Gets the array of reservation status options for dropdowns
export function getReservationStatuses(): { value: number, label: string }[] {
  return [
    { value: ReservationStatus.PreBooking, label: getReservationStatus(ReservationStatus.PreBooking) },
    { value: ReservationStatus.Confirmed, label: getReservationStatus(ReservationStatus.Confirmed) },
    { value: ReservationStatus.CheckedIn, label: getReservationStatus(ReservationStatus.CheckedIn) },
    { value: ReservationStatus.GaveNotice, label: getReservationStatus(ReservationStatus.GaveNotice) },
    { value: ReservationStatus.FirstRightRefusal, label: getReservationStatus(ReservationStatus.FirstRightRefusal) },
    { value: ReservationStatus.Maintenance, label: getReservationStatus(ReservationStatus.Maintenance) },
    { value: ReservationStatus.OwnerBlocked, label: getReservationStatus(ReservationStatus.OwnerBlocked) }
  ];
}
//#endregion

//#region ReservationType
export enum ReservationType {
 	Private = 0,
	Corporate = 1,
	Owner = 2
}

export function getReservationType(reservationTypeId: number | undefined): string {
  if (reservationTypeId === undefined || reservationTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [ReservationType.Private]: 'Private',
    [ReservationType.Corporate]: 'Corporate',
    [ReservationType.Owner]: 'Owner'
  };
  
  return typeMap[reservationTypeId] || '';
}

// Gets the array of reservation type options for dropdowns
export function getReservationTypes(): { value: number, label: string }[] {
  return [
    { value: ReservationType.Private, label: getReservationType(ReservationType.Private) },
    { value: ReservationType.Corporate, label: getReservationType(ReservationType.Corporate) },
    { value: ReservationType.Owner, label: getReservationType(ReservationType.Owner) }
  ];
}
//#endregion

//#region BillingMethod
export enum BillingMethod {
  Invoice = 0,
  CreditCard = 1
}

export function getBillingMethod(billingMethodId: number | undefined): string {
  if (billingMethodId === undefined || billingMethodId === null) return '';
  
  const billingMap: { [key: number]: string } = {
    [BillingMethod.Invoice]: 'Invoice',
    [BillingMethod.CreditCard]: 'Credit Card'
  };
  
  return billingMap[billingMethodId] || '';
}

// Gets the array of billing type options for dropdowns
export function getBillingMethods(): { value: number, label: string }[] {
  return [
    { value: BillingMethod.Invoice, label: getBillingMethod(BillingMethod.Invoice) },
    { value: BillingMethod.CreditCard, label: getBillingMethod(BillingMethod.CreditCard) }
  ];
}
//#endregion

//#region BillingType
export enum BillingType {
  Monthly = 0,
  Daily = 1,
  Nightly = 2
}

export function getBillingType(billingTypeId: number | undefined): string {
  if (billingTypeId === undefined || billingTypeId === null) return '';
  
  const billingMap: { [key: number]: string } = {
    [BillingType.Monthly]: 'Monthly',
    [BillingType.Daily]: 'Daily',
    [BillingType.Nightly]: 'Nightly'
  };
  
  return billingMap[billingTypeId] || '';
}

// Gets the array of billing type options for dropdowns
export function getBillingTypes(): { value: number, label: string }[] {
  return [
    { value: BillingType.Monthly, label: getBillingType(BillingType.Monthly) },
    { value: BillingType.Daily, label: getBillingType(BillingType.Daily) },
    { value: BillingType.Nightly, label: getBillingType(BillingType.Nightly) }
  ];
}
//#endregion

//#region Frequency
export enum Frequency {
  NA = 0,
  OneTime = 1,
  Weekly = 2,
  EOW = 3,
  Monthly = 4,
  BiAnnually = 5,
  Annually = 6
}

export function getFrequency(frequencyId: number | undefined): string {
  if (frequencyId === undefined || frequencyId === null) return '';
  
  const frequencyMap: { [key: number]: string } = {
    [Frequency.NA]: 'N/A',
    [Frequency.OneTime]: 'One Time',
    [Frequency.Weekly]: 'Weekly',
    [Frequency.EOW]: 'EOW',
    [Frequency.Monthly]: 'Monthly',
    [Frequency.BiAnnually]: 'Bi-Annually',
    [Frequency.Annually]: 'Annually'
  };
  
  return frequencyMap[frequencyId] || '';
}

// Gets the array of frequency options for dropdowns
export function getFrequencies(): { value: number, label: string }[] {
  return [
    { value: Frequency.NA, label: getFrequency(Frequency.NA) },
    { value: Frequency.OneTime, label: getFrequency(Frequency.OneTime) },
    { value: Frequency.Weekly, label: getFrequency(Frequency.Weekly) },
    { value: Frequency.EOW, label: getFrequency(Frequency.EOW) },
    { value: Frequency.Monthly, label: getFrequency(Frequency.Monthly) },
    { value: Frequency.BiAnnually, label: getFrequency(Frequency.BiAnnually) },
    { value: Frequency.Annually, label: getFrequency(Frequency.Annually) }
  ];
}
//#endregion

//#region ReservationNotice
export enum ReservationNotice {
  ThirtyDays = 0,
  FifteenDays = 1,
  FourteenDays = 2
}

export function getReservationNotice(reservationNoticeId: number | undefined): string {
  if (reservationNoticeId === undefined || reservationNoticeId === null) return '';
  
  const noticeMap: { [key: number]: string } = {
    [ReservationNotice.ThirtyDays]: '30 Days',
    [ReservationNotice.FifteenDays]: '15 Days',
    [ReservationNotice.FourteenDays]: '14 Days'
  };
  
  return noticeMap[reservationNoticeId] || '';
}

// Gets the array of reservation notice options for dropdowns
export function getReservationNotices(): { value: number, label: string }[] {
  return [
    { value: ReservationNotice.ThirtyDays, label: getReservationNotice(ReservationNotice.ThirtyDays) },
    { value: ReservationNotice.FifteenDays, label: getReservationNotice(ReservationNotice.FifteenDays) },
    { value: ReservationNotice.FourteenDays, label: getReservationNotice(ReservationNotice.FourteenDays) }
  ];
}
//#endregion

//#region DepositType
export enum DepositType {
  Deposit = 0,
  CLR = 1,
  SDW = 2
}

export function getDepositType(depositTypeId: number | undefined): string {
  if (depositTypeId === undefined || depositTypeId === null) return '';
  
  const depositMap: { [key: number]: string } = {
    [DepositType.Deposit]: 'Deposit',
    [DepositType.CLR]: 'CLR',
    [DepositType.SDW]: 'SDW'
  };
  
  return depositMap[depositTypeId] || '';
}

// Gets the array of deposit type options for dropdowns
export function getDepositTypes(): { value: number, label: string }[] {
  return [
    { value: DepositType.Deposit, label: getDepositType(DepositType.Deposit) },
    { value: DepositType.CLR, label: getDepositType(DepositType.CLR) },
    { value: DepositType.SDW, label: getDepositType(DepositType.SDW) }
  ];
}
//#endregion