//#region Work-Order Type
export enum WorkOrderType {
  Tenant = 0,
  Owner = 1,
  Organization = 2
}

export function getWorkOrderType(workOrderTypeId: number | undefined): string {
  if (workOrderTypeId === undefined || workOrderTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [WorkOrderType.Tenant]: 'Tenant',
    [WorkOrderType.Owner]: 'Owner',
    [WorkOrderType.Organization]: 'Organization'
  };

  return typeMap[workOrderTypeId] || '';
}

export function getWorkOrderTypes(): { value: number; label: string }[] {
  return Object.keys(WorkOrderType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: WorkOrderType[key as keyof typeof WorkOrderType],
      label: getWorkOrderType(WorkOrderType[key as keyof typeof WorkOrderType])
    }));
}
//#endregion

//#region InspectionType
export enum InspectionType {
  Online = 0,
  MoveIn = 1,
  MoveOut = 2
}

export function getInspectionType(inspectionTypeId: number | undefined | null): string {
  if (inspectionTypeId === undefined || inspectionTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [InspectionType.Online]: 'Online',
    [InspectionType.MoveIn]: 'Move-In',
    [InspectionType.MoveOut]: 'Move-Out'
  };

  return typeMap[inspectionTypeId] || '';
}

export function getInspectionTypes(): { value: number; label: string }[] {
  return Object.keys(InspectionType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: InspectionType[key as keyof typeof InspectionType],
      label: getInspectionType(InspectionType[key as keyof typeof InspectionType])
    }));
}
//#endregion

//#region MaidServiceType
export enum MaidServiceType {
  Online = 0,
  Offline = 1,
  Scheduled = 2,
  Departure = 3
}

export function getMaidServiceType(maidServiceTypeId: number | undefined | null): string {
  if (maidServiceTypeId === undefined || maidServiceTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [MaidServiceType.Online]: 'Online',
    [MaidServiceType.Offline]: 'Offline',
    [MaidServiceType.Scheduled]: 'Scheduled',
    [MaidServiceType.Departure]: 'Departure'
  };

  return typeMap[maidServiceTypeId] || '';
}

export function getMaidServiceTypes(): { value: number; label: string }[] {
  return Object.keys(MaidServiceType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: MaidServiceType[key as keyof typeof MaidServiceType],
      label: getMaidServiceType(MaidServiceType[key as keyof typeof MaidServiceType])
    }));
}
//#endregion
