import { FileDetails } from "./document.model";

export interface PhotoRequest {
  photoId?: string;
  organizationId: string;
  officeId: number;
  maintenanceId?: string | null;
  fileDetails?: FileDetails | null;
}

export interface PhotoResponse {
  photoId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  maintenanceId?: string | null;
  fileName: string;
  fileExtension: string;
  contentType: string;
  photoPath: string;
  fileDetails?: FileDetails | null;
  createdOn: string;
  createdBy: string;
}