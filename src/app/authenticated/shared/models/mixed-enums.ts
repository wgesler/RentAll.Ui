//#region ServiceType
export enum ServiceType {
  Online = 0,
  Offline = 1,
  Arrival = 2,
  Departure = 3,
  Scheduled = 4,
  ScheduledCarpet = 5,
  ScheduledInspection = 6
}

export function getServiceType(ServiceTypeId: number | undefined | null): string {
  if (ServiceTypeId === undefined || ServiceTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [ServiceType.Online]: 'Online',
    [ServiceType.Offline]: 'Offline',
    [ServiceType.Arrival]: 'Arrival',
    [ServiceType.Departure]: 'Departure',
    [ServiceType.Scheduled]: 'Scheduled',
    [ServiceType.ScheduledCarpet]: 'Scheduled (Carpet)',
    [ServiceType.ScheduledInspection]: 'Scheduled (Inspection)'
  };

  return typeMap[ServiceTypeId] || '';
}

export function getServiceTypes(): { value: number; label: string }[] {
  return Object.keys(ServiceType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: ServiceType[key as keyof typeof ServiceType],
      label: getServiceType(ServiceType[key as keyof typeof ServiceType])
    }));
}
//#endregion