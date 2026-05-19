import { FileDetails } from '../../../shared/models/fileDetails';

export interface StateFormRequest {
  stateFormId?: number;
  organizationId?: string;
  stateCode: string;
  formName: string;
  path?: string | null;
  formAsHtml?: string | null;
  fileDetails?: FileDetails | null;
}

export interface StateFormResponse {
  stateFormId: number;
  organizationId: string;
  stateCode: string;
  formName: string;
  path: string;
  formAsHtml?: string | null;
  fileDetails?: FileDetails | null;
}

export interface StateFormListDisplay {
  stateFormId: number;
  stateCode: string;
  formName: string;
  path: string;
  hasDocument: string;
  hasHtml: string;
}
