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
//#endregion
