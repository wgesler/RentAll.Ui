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
  officeId?: number | null;
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
  officeId?: number | null;
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
  officeId?: number | null;
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
}

export interface GenerateDocumentFromHtmlDto {
  htmlContent: string;
  organizationId: string;
  officeId?: number | null;
  documentType: DocumentType;
  fileName: string;
}

