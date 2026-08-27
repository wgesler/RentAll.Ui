//#region Work-Order Type
export enum WorkOrderType {
  Tenant = 0,
  Owner = 1,
  Company = 2
}

export function getWorkOrderType(workOrderTypeId: number | undefined): string {
  if (workOrderTypeId === undefined || workOrderTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [WorkOrderType.Tenant]: 'Tenant',
    [WorkOrderType.Owner]: 'Owner',
    [WorkOrderType.Company]: 'Company'
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
  Company = 2,
  Departure = 3,
  NonExpense = 4
}

export function getReceiptType(receiptTypeId: number | undefined | null): string {
  if (receiptTypeId === undefined || receiptTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [ReceiptType.Tenant]: 'Tenant',
    [ReceiptType.Owner]: 'Owner',
    [ReceiptType.Company]: 'Company',
    [ReceiptType.Departure]: 'Departure',
    [ReceiptType.NonExpense]: 'Non Expense'
  };

  return typeMap[receiptTypeId] || '';
}

export function getReceiptTypeCode(receiptTypeId: number | undefined | null): string {
  if (receiptTypeId === undefined || receiptTypeId === null) return '';

  const typeCodeMap: { [key: number]: string } = {
    [ReceiptType.Tenant]: 'T',
    [ReceiptType.Owner]: 'O',
    [ReceiptType.Company]: 'C',
    [ReceiptType.Departure]: 'D',
    [ReceiptType.NonExpense]: 'N'
  };

  return typeCodeMap[receiptTypeId] || '';
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
  MoveOut = 0,
  MoveIn = 1,
  Online = 2
}

export function getInspectionType(inspectionTypeId: number | undefined | null): string {
  if (inspectionTypeId === undefined || inspectionTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [InspectionType.MoveOut]: 'Move-Out',
    [InspectionType.MoveIn]: 'Move-In',
    [InspectionType.Online]: 'Online'
  };

  return typeMap[inspectionTypeId] || '';
}

/** Compact segment for draft document paths, e.g. MoveIn / MoveOut / Online. */
export function getInspectionTypeFileSegment(inspectionTypeId: number | undefined | null): string {
  if (inspectionTypeId === undefined || inspectionTypeId === null) {
    return 'Online';
  }

  const typeMap: { [key: number]: string } = {
    [InspectionType.MoveOut]: 'MoveOut',
    [InspectionType.MoveIn]: 'MoveIn',
    [InspectionType.Online]: 'Online'
  };

  return typeMap[inspectionTypeId] || 'Online';
}

export function getInspectionTypes(): { value: number; label: string }[] {
  return [InspectionType.MoveOut, InspectionType.MoveIn, InspectionType.Online].map(value => ({
    value,
    label: getInspectionType(value)
  }));
}
//#endregion
