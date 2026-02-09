//#region TrashDays
export enum TrashDays {
  None = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
  Sunday = 7
}

export function getTrashPickupDay(trashPickupId: number | undefined): string {
  if (!trashPickupId) return '';
  
  const dayMap: { [key: number]: string } = {
    [TrashDays.None]: 'None',
    [TrashDays.Monday]: 'Monday',
    [TrashDays.Tuesday]: 'Tuesday',
    [TrashDays.Wednesday]: 'Wednesday',
    [TrashDays.Thursday]: 'Thursday',
    [TrashDays.Friday]: 'Friday',
    [TrashDays.Saturday]: 'Saturday',
    [TrashDays.Sunday]: 'Sunday'
  };
  
  return dayMap[trashPickupId] || '';
}
//#endregion

//#region PropertyStyle
export enum PropertyStyle {
  Standard = 0,
  Corporate = 1,
  Vacation = 2
}

export function getPropertyStyle(propertyStyleId: number | undefined): string {
  if (propertyStyleId === undefined || propertyStyleId === null) return '';
  
  const styleMap: { [key: number]: string } = {
    [PropertyStyle.Standard]: 'Standard',
    [PropertyStyle.Corporate]: 'Corporate',
    [PropertyStyle.Vacation]: 'Vacation'
  };
  
  return styleMap[propertyStyleId] || '';
}

// Gets the array of property style options for dropdowns
export function getPropertyStyles(): { value: number, label: string }[] {
  return Object.keys(PropertyStyle)
    .filter(key => isNaN(Number(key))) // Filter out numeric keys
    .map(key => ({
      value: PropertyStyle[key as keyof typeof PropertyStyle],
      label: getPropertyStyle(PropertyStyle[key as keyof typeof PropertyStyle])
    }));
}
//#endregion

//#region PropertyType
export enum PropertyType {
  Unspecified = 0,
  Apartment = 1,
  Bungalow = 2,
  Boat = 3,
  Chalet = 4,
  Condo = 5,
  Cottage = 6,
  Flat = 7,
  House = 8,
  Loft = 9,
  Office = 10,
  Penthouse = 11,
  Room = 12,
  RV = 13,
  Studio = 14,
  Townhouse = 15,
  Villa = 16
}

export function getPropertyType(propertyTypeId: number | undefined): string {
  if (propertyTypeId === undefined || propertyTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [PropertyType.Unspecified]: 'Unspecified',
    [PropertyType.Apartment]: 'Apartment',
    [PropertyType.Bungalow]: 'Bungalow',
    [PropertyType.Boat]: 'Boat',
    [PropertyType.Chalet]: 'Chalet',
    [PropertyType.Condo]: 'Condo',
    [PropertyType.Cottage]: 'Cottage',
    [PropertyType.Flat]: 'Flat',
    [PropertyType.House]: 'House',
    [PropertyType.Loft]: 'Loft',
    [PropertyType.Office]: 'Office',
    [PropertyType.Penthouse]: 'Penthouse',
    [PropertyType.Room]: 'Room',
    [PropertyType.RV]: 'RV',
    [PropertyType.Studio]: 'Studio',
    [PropertyType.Townhouse]: 'Townhouse',
    [PropertyType.Villa]: 'Villa'
  };
  
  return typeMap[propertyTypeId] || '';
}

// Gets the array of property type options for dropdowns
export function getPropertyTypes(): { value: number, label: string }[] {
  return Object.keys(PropertyType)
    .filter(key => isNaN(Number(key))) // Filter out numeric keys
    .map(key => ({
      value: PropertyType[key as keyof typeof PropertyType],
      label: getPropertyType(PropertyType[key as keyof typeof PropertyType])
    }));
}
//#endregion

//#region PropertyStatus
export enum PropertyStatus {
  NotProcessed = 0,
  Cleaned = 1,
  Inspected = 2,
  Ready = 3,
  Occupied = 4,
  Maintenance = 5,
  Offline = 6
}

export function getPropertyStatusLetter(statusId: number): string {
  const statusMap: { [key: number]: string } = {
    [PropertyStatus.NotProcessed]: 'N',
    [PropertyStatus.Cleaned]: 'C',
    [PropertyStatus.Inspected]: 'I',
    [PropertyStatus.Ready]: 'R',
    [PropertyStatus.Occupied]: 'O',
    [PropertyStatus.Maintenance]: 'M',
    [PropertyStatus.Offline]: 'F'
  };
  return statusMap[statusId] || '?';
}

export function getPropertyStatus(propertyStatusId: number | undefined): string {
  if (propertyStatusId === undefined || propertyStatusId === null) return '';
  
  const statusMap: { [key: number]: string } = {
    [PropertyStatus.NotProcessed]: 'Not Processed',
    [PropertyStatus.Cleaned]: 'Cleaned',
    [PropertyStatus.Inspected]: 'Inspected',
    [PropertyStatus.Ready]: 'Ready',
    [PropertyStatus.Occupied]: 'Occupied',
    [PropertyStatus.Maintenance]: 'Maintenance',
    [PropertyStatus.Offline]: 'Offline'
  };
  
  return statusMap[propertyStatusId] || '';
}

// Gets the array of property status options for dropdowns
export function getPropertyStatuses(): { value: number, label: string }[] {
  return Object.keys(PropertyStatus)
    .filter(key => isNaN(Number(key))) // Filter out numeric keys
    .map(key => ({
      value: PropertyStatus[key as keyof typeof PropertyStatus],
      label: getPropertyStatus(PropertyStatus[key as keyof typeof PropertyStatus])
    }));
}
//#endregion

//#region CheckinTimes
export enum CheckinTimes {
  TwelvePM = 1,
  OnePM = 2,
  TwoPM = 3,
  ThreePM = 4,
  FourPM = 5,
  FivePM = 6
}

// Gets the check-in time label string from a CheckinTimes enum value
export function getCheckInTime(checkInTimeId: number | undefined): string {
  if (!checkInTimeId) return '';
  
  const timeMap: { [key: number]: string } = {
    [CheckinTimes.TwelvePM]: '12:00 PM',
    [CheckinTimes.OnePM]: '1:00 PM',
    [CheckinTimes.TwoPM]: '2:00 PM',
    [CheckinTimes.ThreePM]: '3:00 PM',
    [CheckinTimes.FourPM]: '4:00 PM',
    [CheckinTimes.FivePM]: '5:00 PM'
  };
  
  return timeMap[checkInTimeId] || '';
}

// Gets the array of check-in time options for dropdowns
export function getCheckInTimes(): { value: number, label: string }[] {
  return [
    { value: CheckinTimes.TwelvePM, label: '12:00 PM' },
    { value: CheckinTimes.OnePM, label: '1:00 PM' },
    { value: CheckinTimes.TwoPM, label: '2:00 PM' },
    { value: CheckinTimes.ThreePM, label: '3:00 PM' },
    { value: CheckinTimes.FourPM, label: '4:00 PM' },
    { value: CheckinTimes.FivePM, label: '5:00 PM' }
  ];
}

// Normalizes check-in time ID to a number for API requests (defaults to FourPM if null/undefined)
export function normalizeCheckInTimeId(value: number | null | undefined): number {
  if (value !== null && value !== undefined) {
    return Number(value);
  }
  return CheckinTimes.FourPM;
}
//#endregion

//#region CheckoutTimes
export enum CheckoutTimes {
  EightAM = 1,
  NineAM = 2,
  TenAM = 3,
  ElevenAM = 4,
  TwelvePM = 5,
  OnePM = 6
}

// Gets the check-out time label string from a CheckoutTimes enum value
export function getCheckOutTime(checkOutTimeId: number | undefined): string {
  if (!checkOutTimeId) return '';
  
  const timeMap: { [key: number]: string } = {
    [CheckoutTimes.EightAM]: '8:00 AM',
    [CheckoutTimes.NineAM]: '9:00 AM',
    [CheckoutTimes.TenAM]: '10:00 AM',
    [CheckoutTimes.ElevenAM]: '11:00 AM',
    [CheckoutTimes.TwelvePM]: '12:00 PM',
    [CheckoutTimes.OnePM]: '1:00 PM'
  };
  
  return timeMap[checkOutTimeId] || '';
}

// Gets the array of check-out time options for dropdowns
export function getCheckOutTimes(): { value: number, label: string }[] {
  return [
    { value: CheckoutTimes.EightAM, label: '8:00 AM' },
    { value: CheckoutTimes.NineAM, label: '9:00 AM' },
    { value: CheckoutTimes.TenAM, label: '10:00 AM' },
    { value: CheckoutTimes.ElevenAM, label: '11:00 AM' },
    { value: CheckoutTimes.TwelvePM, label: '12:00 PM' },
    { value: CheckoutTimes.OnePM, label: '1:00 PM' }
  ];
}

// Normalizes check-out time ID to a number for API requests (defaults to ElevenAM if null/undefined)
export function normalizeCheckOutTimeId(value: number | null | undefined): number {
  if (value !== null && value !== undefined) {
    return Number(value);
  }
  return CheckoutTimes.ElevenAM;
}
//#endregion

//#region BedSizeType
export enum BedSizeType
{
    King = 1,
    Queen = 2,
    Double = 3,
    Twin = 4,
    TwoTwins = 5,
    DayBed = 6,
    SofaBed = 7
}

export function getBedSizeType(bedSizeTypeId: number | undefined): string {
  if (bedSizeTypeId === undefined || bedSizeTypeId === null) return '';
  
  const bedSizeMap: { [key: number]: string } = {
    [BedSizeType.King]: 'King',
    [BedSizeType.Queen]: 'Queen',
    [BedSizeType.Double]: 'Double',
    [BedSizeType.Twin]: 'Twin',
    [BedSizeType.TwoTwins]: 'Two Twins',
    [BedSizeType.DayBed]: 'Day Bed',
    [BedSizeType.SofaBed]: 'Sofa Bed'
  };
  
  return bedSizeMap[bedSizeTypeId] || '';
}

// Gets the array of bed size type options for dropdowns
export function getBedSizeTypes(): { value: number, label: string }[] {
  return Object.keys(BedSizeType)
    .filter(key => isNaN(Number(key))) // Filter out numeric keys
    .map(key => ({
      value: BedSizeType[key as keyof typeof BedSizeType],
      label: getBedSizeType(BedSizeType[key as keyof typeof BedSizeType])
    }));
}
//#endregion
