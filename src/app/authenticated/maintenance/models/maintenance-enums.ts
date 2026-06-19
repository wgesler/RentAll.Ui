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

//#region Receipt Type
export enum ReceiptType {
  Tenant = 0,
  Owner = 1,
  Organization = 2,
  Departure = 3
}

export function getReceiptType(receiptTypeId: number | undefined | null): string {
  if (receiptTypeId === undefined || receiptTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [ReceiptType.Tenant]: 'Tenant',
    [ReceiptType.Owner]: 'Owner',
    [ReceiptType.Organization]: 'Organization',
    [ReceiptType.Departure]: 'Tenant (Out of Dept)'
  };

  return typeMap[receiptTypeId] || '';
}

export function getReceiptTypes(): { value: number; label: string }[] {
  return Object.keys(ReceiptType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: ReceiptType[key as keyof typeof ReceiptType],
      label: getReceiptType(ReceiptType[key as keyof typeof ReceiptType])
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
