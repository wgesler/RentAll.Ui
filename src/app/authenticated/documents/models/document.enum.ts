export enum DocumentType {
  Other = 0,
  PropertyLetter = 1,
  ReservationLease = 2,
  Invoice = 3
}

export function getDocumentType(documentTypeId: number | undefined): string {
  if (documentTypeId === undefined || documentTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [DocumentType.Other]: 'Other',
    [DocumentType.PropertyLetter]: 'Welcome Letter',
    [DocumentType.ReservationLease]: 'Reservation Lease',
    [DocumentType.Invoice]: 'Invoice'
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
    { value: DocumentType.Invoice, label: getDocumentType(DocumentType.Invoice) }
  ];
}
