import { DocumentType } from './document.enum';

export interface FileDetails {
  size?: number;
  uploadedBy?: string;
  uploadedOn?: string;
  dataUrl?: string;
  file?: string;
  contentType?: string;
  fileName?: string;
}

export interface DocumentRequest {
  documentId?: string;
  organizationId: string;
  officeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  documentTypeId: number;
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
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  documentTypeId: number;
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
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  documentTypeId: number;
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
  canView?: boolean; // Whether document can be viewed in browser
  office?: string; // Office name for display
}

export interface GenerateDocumentFromHtmlDto {
  htmlContent: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  reservationId?: string | null;
  documentType: DocumentType;
  fileName: string;
}

