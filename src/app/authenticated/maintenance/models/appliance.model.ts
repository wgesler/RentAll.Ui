import { FileDetails } from "../../../shared/models/fileDetails";

export interface ApplianceRequest {
  applianceId?: number;
  propertyId: string;
  applianceName: string;
  manufacturer: string;
  modelNo?: string | null;
  serialNo?: string | null;
  decalPath?: string | null;
  decalFileDetails?: FileDetails;
}

export interface ApplianceResponse {
  applianceId?: number;
  propertyId: string;
  applianceName: string;
  manufacturer: string;
  modelNo?: string | null;
  serialNo?: string | null;
  decalPath?: string | null;
  decalFileDetails?: FileDetails;
}
