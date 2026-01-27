export enum DocumentType {
  Other = 0,
  PropertyLetter = 1,
  ReservationLease = 2
}

export function getDocumentTypeLabel(documentType: DocumentType): string {
  const typeLabels: { [key in DocumentType]: string } = {
    [DocumentType.Other]: 'Other',
    [DocumentType.PropertyLetter]: 'Welcome Letter',
    [DocumentType.ReservationLease]: 'Reservation Lease'
  };
  return typeLabels[documentType] || DocumentType[documentType] || 'Other';
}
