//#region Email Type
export enum EmailType {
  Other = 0,
  PropertyLetter = 1,
  ReservationLease = 2,
  Invoice = 3,
  WorkOrder = 4,
  Inspection = 5,
  InspectionIssues = 6,
  Alert = 7
}

export function getEmailType(emailTypeId: number | undefined): string {
  if (emailTypeId === undefined || emailTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [EmailType.Other]: 'Other',
    [EmailType.PropertyLetter]: 'Welcome Letter',
    [EmailType.ReservationLease]: 'Reservation Lease',
    [EmailType.Invoice]: 'Invoice',
    [EmailType.WorkOrder]: 'Work Order',
    [EmailType.Inspection]: 'Inspection',
    [EmailType.InspectionIssues]: 'Inspection Issues',
    [EmailType.Alert]: 'Alert'
  };

  return typeMap[emailTypeId] || '';
}

export function getEmailTypeLabel(emailType: EmailType): string {
  return getEmailType(emailType) || EmailType[emailType] || 'Other';
}
//#endregion

//#region Email Status
export enum EmailStatus {
  Unsent = 0,
  Attempting = 1,
  Failed = 2,
  Succeeded = 3
}

export function getEmailStatus(emailStatusId: number | undefined): string {
  if (emailStatusId === undefined || emailStatusId === null) return '';

  const statusMap: { [key: number]: string } = {
    [EmailStatus.Unsent]: 'Unsent',
    [EmailStatus.Attempting]: 'Attempting',
    [EmailStatus.Failed]: 'Failed',
    [EmailStatus.Succeeded]: 'Succeeded'
  };

  return statusMap[emailStatusId] || '';
}

export function getEmailStatusLabel(emailStatus: EmailStatus): string {
  return getEmailStatus(emailStatus) || EmailStatus[emailStatus] || 'Unsent';
}
//#endregion
