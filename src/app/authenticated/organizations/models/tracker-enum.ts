export enum TrackerContextType {
  Unknown = 0,
  ReservationArrival = 1,
  ReservationDeparture = 2,
  PropertyOnline = 3,
  PropertyOffline = 4,
  PropertyThirdPartyOnline = 5,
  PropertyThirdPartyOffline = 6,
  PropertyDirectOnline = 7,
  PropertyDirectOffline = 8
}

export function toTrackerContextType(value: number | string | null | undefined): TrackerContextType {
  const normalized = typeof value === 'string' ? Number(value) : value;
  switch (normalized) {
    case TrackerContextType.ReservationArrival:
      return TrackerContextType.ReservationArrival;
    case TrackerContextType.ReservationDeparture:
      return TrackerContextType.ReservationDeparture;
    case TrackerContextType.PropertyOnline:
      return TrackerContextType.PropertyOnline;
    case TrackerContextType.PropertyOffline:
      return TrackerContextType.PropertyOffline;
    case TrackerContextType.PropertyThirdPartyOnline:
      return TrackerContextType.PropertyThirdPartyOnline;
    case TrackerContextType.PropertyThirdPartyOffline:
      return TrackerContextType.PropertyThirdPartyOffline;
    case TrackerContextType.PropertyDirectOnline:
      return TrackerContextType.PropertyDirectOnline;
    case TrackerContextType.PropertyDirectOffline:
      return TrackerContextType.PropertyDirectOffline;
    default:
      return TrackerContextType.Unknown;
  }
}

export function getTrackerContextType(trackerContextId: number | undefined): string {
  if (trackerContextId === undefined || trackerContextId === null) return '';

  const contextType = toTrackerContextType(trackerContextId);
  const contextMap: { [key: number]: string } = {
    [TrackerContextType.ReservationArrival]: 'Reservation Arrival',
    [TrackerContextType.ReservationDeparture]: 'Reservation Departure',
    [TrackerContextType.PropertyOnline]: 'PM Online',
    [TrackerContextType.PropertyOffline]: 'PM Offline',
    [TrackerContextType.PropertyThirdPartyOnline]: '3rd Party Online',
    [TrackerContextType.PropertyThirdPartyOffline]: '3rd Party Offline',
    [TrackerContextType.PropertyDirectOnline]: 'Direct Online',
    [TrackerContextType.PropertyDirectOffline]: 'Direct Offline'
  };

  return contextMap[contextType] || '';
}

export function getTrackerContextCode(trackerContextId: number | undefined): string {
  const contextType = toTrackerContextType(trackerContextId);
  const codeMap: { [key: number]: string } = {
    [TrackerContextType.ReservationArrival]: 'ReservationArrival',
    [TrackerContextType.ReservationDeparture]: 'ReservationDeparture',
    [TrackerContextType.PropertyOnline]: 'PropertyOnline',
    [TrackerContextType.PropertyOffline]: 'PropertyOffline',
    [TrackerContextType.PropertyThirdPartyOnline]: 'PropertyThirdPartyOnline',
    [TrackerContextType.PropertyThirdPartyOffline]: 'PropertyThirdPartyOffline',
    [TrackerContextType.PropertyDirectOnline]: 'PropertyDirectOnline',
    [TrackerContextType.PropertyDirectOffline]: 'PropertyDirectOffline'
  };

  return codeMap[contextType] || '';
}

export function getTrackerContextTypes(): { value: number; label: string }[] {
  return [
    { value: TrackerContextType.ReservationArrival, label: getTrackerContextType(TrackerContextType.ReservationArrival) },
    { value: TrackerContextType.ReservationDeparture, label: getTrackerContextType(TrackerContextType.ReservationDeparture) },
    { value: TrackerContextType.PropertyOnline, label: getTrackerContextType(TrackerContextType.PropertyOnline) },
    { value: TrackerContextType.PropertyOffline, label: getTrackerContextType(TrackerContextType.PropertyOffline) },
    { value: TrackerContextType.PropertyThirdPartyOnline, label: getTrackerContextType(TrackerContextType.PropertyThirdPartyOnline) },
    { value: TrackerContextType.PropertyThirdPartyOffline, label: getTrackerContextType(TrackerContextType.PropertyThirdPartyOffline) },
    { value: TrackerContextType.PropertyDirectOnline, label: getTrackerContextType(TrackerContextType.PropertyDirectOnline) },
    { value: TrackerContextType.PropertyDirectOffline, label: getTrackerContextType(TrackerContextType.PropertyDirectOffline) }
  ];
}
