import { FileDetails } from '../../../shared/models/fileDetails';

export interface CheckHtmlResponse {
  checkHtmlId: string;
  organizationId: string;
  officeId?: number | null;
  check: string;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface CreateCheckHtmlRequest {
  organizationId: string;
  officeId?: number | null;
  check: string;
  checkStockFileDetails?: FileDetails | null;
}

export interface UpdateCheckHtmlRequest {
  checkHtmlId: string;
  organizationId: string;
  officeId?: number | null;
  check: string;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
}
