//#region Email Type
export enum EmailType {
  Other = 0,
  PropertyLetter = 1,
  ReservationLease = 2,
  Invoice = 3,
  WorkOrder = 4,
  Inspection = 5,
  InspectionIssues = 6,
  Alert = 7,
  Reservation = 8,
  Proposal = 9,
  OwnerAgreement = 10,
  OwnerStatement = 11,
  SecurityDeposit = 12,
  Schedules = 13
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
    [EmailType.Alert]: 'Alert',
    [EmailType.Reservation]: 'Reservation',
    [EmailType.Proposal]: 'Proposal',
    [EmailType.OwnerAgreement]: 'Owner Agreement',
    [EmailType.OwnerStatement]: 'Owner Statement',
    [EmailType.SecurityDeposit]: 'Security Deposit',
    [EmailType.Schedules]: 'Schedules'
  };

  return typeMap[emailTypeId] || '';
}
//#endregion
