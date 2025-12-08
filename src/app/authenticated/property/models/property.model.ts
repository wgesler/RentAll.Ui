export interface PropertyRequest {
  propertyId?: string;
  propertyCode: string;
  name: string;
  contactId?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  gated: boolean;
  alarm: boolean;
  alarmCode?: string;
  washerDryer: boolean;
  amenities?: string;
  pool: boolean;
  hotTub: boolean;
  parkingSpaces: number;
  yard: boolean;
  isActive: boolean;
}

export interface PropertyResponse {
  propertyId: string;
  propertyCode: string;
  name: string;
  contactId?: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  gated: boolean;
  alarm: boolean;
  alarmCode: string;
  washerDryer: boolean;
  amenities: string;
  pool: boolean;
  hotTub: boolean;
  parkingSpaces: number;
  yard: boolean;
  isActive: boolean;
}

export interface PropertyListDisplay {
  propertyId: string;
  propertyCode: string;
  name: string;
  owner: string;
  contactId: string;
  phone: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  isActive: boolean;
}

