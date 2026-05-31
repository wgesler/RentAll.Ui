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

/** Query parameters for GET /api/document (calendar dates as yyyy-MM-dd). */
export interface DocumentGetRequest {
  /** One office when the dropdown is set; all accessible offices when All Offices / null. */
  officeIds: number[];
  propertyId?: string | null;
  documentTypeIds?: number | number[] | null;
  /** Calendar date (yyyy-MM-dd), not a timestamp. */
  startDate?: string | null;
  /** Calendar date (yyyy-MM-dd), not a timestamp. */
  endDate?: string | null;
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
}

export interface GenerateDocumentFromHtmlDto {
  htmlContent: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  documentTypeId: DocumentType;
  fileName: string;
  /** When true, backend must generate a standalone PDF (images embedded) and save that file; documentPath must point to the PDF. */
  generatePdf?: boolean;
}


