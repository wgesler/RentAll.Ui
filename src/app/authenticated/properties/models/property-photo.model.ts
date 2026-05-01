import { FileDetails } from '../../../shared/models/fileDetails';

export interface PropertyPhotoRequest {
  order: number;
  fileDetails?: FileDetails | null;
}

export interface UpdatePropertyPhotoOrderRequest {
  photoId: number;
  order: number;
}

export interface PropertyPhotoResponse {
  photoId: number;
  propertyId: string;
  order: number;
  photoPath: string;
  fileDetails?: FileDetails | null;
}
