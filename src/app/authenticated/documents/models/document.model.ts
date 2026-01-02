export enum DocumentType {
  Unknown = 0,
  PropertyLetter = 1,
  ReservationLease = 2
}

export interface FileDetails {
  size?: number;
  uploadedBy?: string;
  uploadedOn?: string;
}

export interface DocumentRequest {
  documentId?: string;
  organizationId: string;
  officeId?: number | null;
  documentType: DocumentType;
  fileName: string;
  fileExtension: string;
  contentType: string;
  documentPath: string;
  fileDetails?: FileDetails | null;
  isDeleted: boolean;
}

export interface DocumentResponse {
  documentId: string;
  organizationId: string;
  officeId?: number | null;
  documentType: DocumentType;
  fileName: string;
  fileExtension: string;
  contentType: string;
  documentPath: string;
  fileDetails?: FileDetails | null;
  isDeleted: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface DocumentListDisplay {
  documentId: string;
  organizationId: string;
  officeId?: number | null;
  documentType: DocumentType;
  fileName: string;
  fileExtension: string;
  contentType: string;
  documentPath: string;
  fileDetails?: FileDetails | null;
  isDeleted: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
  documentTypeName?: string;
}

