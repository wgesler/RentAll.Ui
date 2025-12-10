// Ordered to match form layout - Updated to match API PropertyResponseDto
export interface PropertyRequest {
  // Top section
  propertyId?: string;
  propertyCode: string;
  contactId: string;
  isActive: boolean;
  
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  minStay: number;
  maxStay: number;
  checkInTimeId: number;
  checkOutTimeId: number;
  monthlyRate: number;
  dailyRate: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedSizes: string;
  
  // Address section
  address1: string;
  address2: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  neighborhood: string;
  crossStreet: string;
  view: string;
  mailbox: string;
  
  // Features & Security section
  furnished: boolean;
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  smoking: boolean;
  assignedParking: boolean;
  notes: string;
  alarm: boolean;
  alarmCode: string;
  remoteAccess: boolean;
  keyCode: string;
  
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
  trashRemoval: string;
  
  // Additional Amenities section
  amenities: string;
}

export interface PropertyResponse {
  propertyId: string;
  propertyCode: string;
  contactId: string;
  isActive: boolean;
   
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  minStay: number;
  maxStay: number;
  checkInTimeId: number;
  checkOutTimeId: number;
  monthlyRate: number;
  dailyRate: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedSizes: string;
  
  // Address section
  address1: string;
  address2: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  neighborhood: string;
  crossStreet: string;
  view: string;
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
  assignedParking: boolean;
  notes: string;
  alarm: boolean;
  alarmCode: string;
  remoteAccess: boolean;
  keyCode: string;
  
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
  trashRemoval: string;
  
  // Additional Amenities section
  amenities: string;
}

export interface PropertyListDisplay {
  propertyId: string;
  propertyCode: string;
  owner: string;
  contactId?: string;
  accomodates: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  isActive: boolean;
}
