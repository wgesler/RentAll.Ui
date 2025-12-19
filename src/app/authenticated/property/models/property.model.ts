// Ordered to match form layout - Updated to match API PropertyResponseDto
export interface PropertyRequest {
  // Top section
  propertyId?: string;
  organizationId: string;
  propertyCode: string;
  owner1Id: string;
  owner2Id?: string;
  isActive: boolean;
  
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  minStay: number;
  maxStay: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  monthlyRate: number;
  dailyRate: number;
  checkoutFee: number;
  maidServiceFee: number;
  petFee: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  
  // Address section
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  neighborhood?: string;
  crossStreet?: string;
  view?: string;
  mailbox?: string;
  
  // Features & Security section
  furnished: boolean;
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  smoking: boolean;
  parking: boolean;
  notes?: string;
  alarm: boolean;
  alarmCode?: string;
  keypadAccess: boolean;
  masterKeyCode?: string;
  tenantKeyCode?: string;
  
  // Kitchen & Bath section
  kitchen: boolean;
  oven: boolean;
  refrigerator: boolean;
  microwave: boolean;
  dishwasher: boolean;
  bathtub: boolean;
  washerDryer: boolean;
  sofabeds: boolean;
  
  // Electronics section
  tv: boolean;
  cable: boolean;
  dvd: boolean;
  streaming: boolean;
  fastInternet: boolean;
  
  // Outdoor Spaces section
  deck: boolean;
  patio: boolean;
  yard: boolean;
  garden: boolean;
  
  // Pool & Spa section
  commonPool: boolean;
  privatePool: boolean;
  jacuzzi: boolean;
  sauna: boolean;
  gym: boolean;
  
  // Trash section
  trashPickupId: number;
  trashRemoval?: string;
  
  // Additional Amenities section
  amenities?: string;
  description?: string;

  // Location section
  franchiseCode?: string | null;
  regionCode?: string | null;
  areaCode?: string | null;
  buildingCode?: string | null;
}

export interface PropertyResponse {
  propertyId: string;
  organizationId: string;
  propertyCode: string;
  owner1Id: string;
  owner2Id?: string;
  isActive: boolean;
   
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  minStay: number;
  maxStay: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  monthlyRate: number;
  dailyRate: number;
  checkoutFee: number;
  maidServiceFee: number;
  petFee: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  
  // Address section
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  neighborhood?: string;
  crossStreet?: string;
  view?: string;
  mailbox?: string;
  
  // Features & Security section
  furnished: boolean;
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  smoking: boolean;
  parking: boolean;
  notes?: string;
  alarm: boolean;
  alarmCode?: string;
  keypadAccess: boolean;
  masterKeyCode?: string;
  tenantKeyCode?: string;
  
  // Kitchen & Bath section
  kitchen: boolean;
  oven: boolean;
  refrigerator: boolean;
  microwave: boolean;
  dishwasher: boolean;
  bathtub: boolean;
  washerDryer: boolean;
  sofabeds: boolean;
  
  // Electronics section
  tv: boolean;
  cable: boolean;
  dvd: boolean;
  streaming: boolean;
  fastInternet: boolean;
  
  // Outdoor Spaces section
  deck: boolean;
  patio: boolean;
  yard: boolean;
  garden: boolean;
  
  // Pool & Spa section
  commonPool: boolean;
  privatePool: boolean;
  jacuzzi: boolean;
  sauna: boolean;
  gym: boolean;
  
  // Trash section
  trashPickupId: number;
  trashRemoval?: string;
  
  // Additional Amenities section
  amenities?: string;
  description?: string;

  // Location section
  franchiseCode?: string | null;
  regionCode?: string | null;
  areaCode?: string | null;
  buildingCode?: string | null;
}

export interface PropertyListDisplay {
  propertyId: string;
  propertyCode: string;
  owner: string;
  owner1Id?: string;
  owner2Id?: string;
  accomodates: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  monthlyRate: number;
  isActive: boolean;
}
