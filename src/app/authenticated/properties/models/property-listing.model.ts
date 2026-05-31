import { FileDetails } from '../../../shared/models/fileDetails';

export interface ListingPhotoItem {
  id: string;
  order: number;
  fileDetails: FileDetails | null;
  photoPath?: string;
  isPending?: boolean;
}

export interface ListingHighlightItem {
  icon: string;
  label: string;
  value: string;
}

export interface ListingAmenityIconItem {
  icon: string;
  label: string;
}
