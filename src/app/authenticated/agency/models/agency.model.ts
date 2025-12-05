import { FileDetails } from "../../../shared/models/fileDetails";

export interface AgencyRequest {
  agencyId: string,
  logoStorageId?: string,
  fileDetails?: FileDetails,
  isActive: boolean
}

export interface AgencyResponse {
  agencyId: string;
  name: string;
  branch: string;
  regId: number;
  state: string;
  databaseName: string;
  parentCompany: string;
  logoStorageId?: string;
  isActive: boolean;
}

export interface AgencyListDisplay {
  agencyId: string;
  name: string;
  regId: number;
  branch: string;
  state: string;
  parentCompany: string;
  logoStorageId?: string;
}