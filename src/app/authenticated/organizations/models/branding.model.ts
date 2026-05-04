import { FileDetails } from '../../../shared/models/fileDetails';

export interface BrandingResponse {
  organizationId: string;
  primaryColor: string;
  accentColor: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  logoPath?: string | null;
  collapsedLogoPath?: string | null;
  fileDetails?: FileDetails | null;
  collapsedFileDetails?: FileDetails | null;
}

export interface BrandingRequest {
  organizationId: string;
  primaryColor: string;
  accentColor: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  logoPath?: string | null;
  fileDetails?: FileDetails | null;
  collapsedLogoPath?: string | null;
  collapsedFileDetails?: FileDetails | null;
}
