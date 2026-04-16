export interface PropertyRequest {
  // Top section
  propertyId?: string | null;
  organizationId: string;
  propertyCode: string;
  propertyLeaseTypeId: number;
  owner1Id?: string | null;
  owner2Id?: string | null;
  owner3Id?: string | null;
  vendorId?: string| null;
  isActive: boolean;
  
  // Availability section
  availableFrom?: string | null;
  availableUntil?: string | null;
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
  unitLevel: number;
  bldgNo?: string | null;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  sofabed: number;
  
  // Address section
  address1: string;
  address2?: string | null;
  suite?: string | null;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  communityAddress?: string | null;
  neighborhood?: string | null;
  crossStreet?: string | null;
  view?: string | null;
  mailbox?: string | null;
  
    // Location section
  officeId: number;
  regionId?: number | null;
  areaId?: number | null;
  buildingId?: number | null;
  latitude: number;
  longitude: number;

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
  parkingnotes?: string | null;
  alarmCode?: string | null;
  unitMstrCode?: string | null;
  bldgMstrCode?: string | null;
  bldgTenantCode?: string | null;
  mailRoomCode?: string | null;
  garageCode?: string | null;
  gateCode?: string | null;
  trashCode?: string | null;
  storageCode?: string | null;
 
  // Kitchen & Bath section
  kitchen: boolean;
  oven: boolean;
  refrigerator: boolean;
  microwave: boolean;
  dishwasher: boolean;
  bathtub: boolean;
  washerDryerInUnit: boolean;
  washerDryerInBldg: boolean;
  
  // Electronics section
  tv: boolean;
  cable: boolean;
  dvd: boolean;
  streaming: boolean;
  fastInternet: boolean;
  internetNetwork?: string | null;
  internetPassword?: string | null;
  
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
  trashRemoval?: string | null;
  
  // Additional Amenities section
  amenities?: string | null;
  description?: string | null;
  notes?: string | null;
}
export interface PropertyResponse {
  propertyId: string;
  organizationId: string;
  propertyCode: string;
  propertyLeaseTypeId: number;
  owner1Id?: string | null;
  owner2Id?: string | null;
  owner3Id?: string | null;
  vendorId?: string| null;
  isActive: boolean;
   
  // Availability section
  availableFrom?: string | null;
  availableUntil?: string | null;
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
  unitLevel: number;
  bldgNo?: string | null;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  sofabed: number;
  
  // Address section
  address1: string;
  address2?: string | null;
  suite?: string | null;
  city: string;
  state: string;
  zip: string;
  phone?: string | null;
  communityAddress?: string | null;
  neighborhood?: string | null;
  crossStreet?: string | null;
  view?: string | null;
  mailbox?: string | null;
  
    // Location section
  officeId: number;
  officeName: string;
  regionId?: number | null;
  areaId?: number | null;
  buildingId?: number | null;
  latitude: number;
  longitude: number;
  
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
  parkingNotes?: string | null;
  alarmCode?: string | null;
  unitMstrCode?: string | null;
  bldgMstrCode?: string | null;
  bldgTenantCode?: string | null;
  mailRoomCode?: string | null;
  garageCode?: string | null;
  gateCode?: string | null;
  trashCode?: string | null;
  storageCode?: string | null;

  // Kitchen & Bath section
  kitchen: boolean;
  oven: boolean;
  refrigerator: boolean;
  microwave: boolean;
  dishwasher: boolean;
  bathtub: boolean;
  washerDryerInUnit: boolean;
  washerDryerInBldg: boolean;
  
  // Electronics section
  tv: boolean;
  cable: boolean;
  dvd: boolean;
  streaming: boolean;
  fastInternet: boolean;
  internetNetwork?: string | null;
  internetPassword?: string | null;
 
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
  trashRemoval?: string | null;
  
  // Additional Amenities section
  amenities?: string | null;
  description?: string | null;
  notes?: string | null;
}
export interface PropertyListResponse{
  propertyId: string;
  propertyCode: string;
  propertyLeaseTypeId: number;
  shortAddress: string;
  officeId: number;  
  officeName: string;
  owner1Id?: string | null;
  vendorId?: string| null;
  contactName: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  unitLevel: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  propertyTypeId: number;
  unfurnished?: boolean;
  monthlyRate: number;
  dailyRate: number;
  departureFee: number;
  petFee: number;
  maidServiceFee: number;
  propertyStatusId: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;
  isActive: boolean;
 }
export interface PropertyListDisplay {
  propertyId: string;
  propertyCode: string;
  propertyLeaseTypeId: number;
  shortAddress:string;
  officeId: number;  
  officeName: string;
  owner1Id?: string | null;
  vendorId?: string| null;
  contactName: string;
  unitLevel: number;
  bedrooms: number;
  bathrooms: number;
  accomodates: number;
  squareFeet: number;
  monthlyRate: number;
  dailyRate: number;
  propertyTypeId: number;
  propertyType: string;
  departureFee: number;
  petFee: number;
  maidServiceFee: number;
  propertyStatusId: number;
  bedroomId1: number;
  bedroomId2: number;
  bedroomId3: number;
  bedroomId4: number;

  isActive: boolean;
  unfurnished: boolean;
}
