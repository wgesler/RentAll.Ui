export enum DocumentType {
  Other = 0,
  PropertyLetter = 1,
  ReservationLease = 2,
  Invoice = 3,
  Attachment = 4,
  Inspection = 5,
  WorkOrder = 6,
  OwnerAgreement = 7,
  Quote = 8,
  OwnerStatement = 9,
  ProfitLoss = 10,
  BalanceSheet = 11,
  ArAging = 12,
  ReconcileAccountSummary = 13,
  ReconcileAccountDetail = 14,
  ApAging = 15
}

export function getDocumentType(documentTypeId: number | undefined): string {
  if (documentTypeId === undefined || documentTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [DocumentType.Other]: 'Other',
    [DocumentType.PropertyLetter]: 'Welcome Letter',
    [DocumentType.ReservationLease]: 'Reservation Lease',
    [DocumentType.Invoice]: 'Invoice',
    [DocumentType.Attachment]: 'Attachment',
    [DocumentType.Inspection]: 'Inspection',
    [DocumentType.WorkOrder]: 'Work Order',
    [DocumentType.OwnerAgreement]: 'Owner Agreement',
    [DocumentType.Quote]: 'Quote',
    [DocumentType.OwnerStatement]: 'Owner Statement',
    [DocumentType.ProfitLoss]: 'Profit & Loss',
    [DocumentType.BalanceSheet]: 'Balance Sheet',
    [DocumentType.ArAging]: 'AR Aging',
    [DocumentType.ReconcileAccountSummary]: 'Reconciliation Summary',
    [DocumentType.ReconcileAccountDetail]: 'Reconciliation Detail',
    [DocumentType.ApAging]: 'AP Aging'
  };
  
  return typeMap[documentTypeId] || '';
}

export function getDocumentTypeLabel(documentType: DocumentType): string {
  return getDocumentType(documentType) || DocumentType[documentType] || 'Other';
}

export function getDocumentTypes(): { value: DocumentType, label: string }[] {
  return [
    { value: DocumentType.Other, label: getDocumentType(DocumentType.Other) },
    { value: DocumentType.PropertyLetter, label: getDocumentType(DocumentType.PropertyLetter) },
    { value: DocumentType.ReservationLease, label: getDocumentType(DocumentType.ReservationLease) },
    { value: DocumentType.Invoice, label: getDocumentType(DocumentType.Invoice) },
    { value: DocumentType.Attachment, label: getDocumentType(DocumentType.Attachment) },
    { value: DocumentType.Inspection, label: getDocumentType(DocumentType.Inspection) },
    { value: DocumentType.WorkOrder, label: getDocumentType(DocumentType.WorkOrder) },
    { value: DocumentType.OwnerAgreement, label: getDocumentType(DocumentType.OwnerAgreement) },
    { value: DocumentType.Quote, label: getDocumentType(DocumentType.Quote) },
    { value: DocumentType.OwnerStatement, label: getDocumentType(DocumentType.OwnerStatement) },
    { value: DocumentType.ProfitLoss, label: getDocumentType(DocumentType.ProfitLoss) },
    { value: DocumentType.BalanceSheet, label: getDocumentType(DocumentType.BalanceSheet) },
    { value: DocumentType.ArAging, label: getDocumentType(DocumentType.ArAging) },
    { value: DocumentType.ReconcileAccountSummary, label: getDocumentType(DocumentType.ReconcileAccountSummary) },
    { value: DocumentType.ReconcileAccountDetail, label: getDocumentType(DocumentType.ReconcileAccountDetail) },
    { value: DocumentType.ApAging, label: getDocumentType(DocumentType.ApAging) }
  ];
}
