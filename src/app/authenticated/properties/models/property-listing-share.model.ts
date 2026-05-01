import { PropertyPhotoResponse } from './property-photo.model';
import { PropertyResponse } from './property.model';

export interface PropertyListingShareResponse {
  shareId: string;
  propertyId: string;
  token: string;
  expiresOn: string;
}

export interface PublicPropertyListingResponse {
  property: PropertyResponse;
  photos: PropertyPhotoResponse[];
}
