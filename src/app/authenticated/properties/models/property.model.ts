// Ordered to match form layout - Updated to match API PropertyResponseDto
export interface PropertyRequest {
  // Top section
  propertyId?: string;
  organizationId: string;
  propertyCode: string;
  owner1Id: string;
  owner2Id?: string;
  owner3Id?: string;
  isActive: boolean;
  
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  minStay: number;
  maxStay: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  monthlyRate: number;
  dailyRate: number;
  departureFee: number;
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
  
    // Location section
  officeId: number;
  regionId?: number | null;
  areaId?: number | null;
  buildingId?: number | null;

  // Features & Security section
  unfurnished: boolean;
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  poundLimit: string;
  smoking: boolean;
  parking: boolean;
  parkingnotes?: string;
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
  internetNetwork?: string;
  internetPassword?: string;
  
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
  notes?: string;
}

export interface PropertyResponse {
  propertyId: string;
  organizationId: string;
  propertyCode: string;
  owner1Id: string;
  owner2Id?: string;
  owner3Id?: string;
  isActive: boolean;
   
  // Availability section
  availableFrom?: string;
  availableUntil?: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  minStay: number;
  maxStay: number;
  propertyStyleId: number;
  propertyTypeId: number;
  propertyStatusId: number;
  monthlyRate: number;
  dailyRate: number;
  departureFee: number;
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
  
    // Location section
  officeId: number;
  officeName: string;
  regionId?: number | null;
  areaId?: number | null;
  buildingId?: number | null;

  // Features & Security section
  unfurnished: boolean;
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  poundLimit: string;
  smoking: boolean;
  parking: boolean;
  parkingNotes?: string;
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
  internetNetwork?: string;
  internetPassword?: string;
 
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
  notes?: string;
}

export interface PropertyListResponse{
  propertyId: string;
  propertyCode: string;
  shortAddress: string;
  availableFrom?: string;
  availableUntil?: string;
  officeId: number;  
  officeName: string;
  owner1Id: string;
  ownerName: string;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  monthlyRate: number;
  dailyRate: number;
  departureFee: number;
  petFee: number;
  maidServiceFee: number;
  propertyStatusId: number;
  isActive: boolean;
}
export interface PropertyListDisplay {
  propertyId: string;
  propertyCode: string;
  shortAddress:string;
  officeId: number;  
  officeName: string;
  owner1Id: string;
  ownerName: string;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  monthlyRate: number;
  dailyRate: number;
  departureFee: number;
  petFee: number;
  maidServiceFee: number;
  propertyStatusId: number;
  isActive: boolean;
}
