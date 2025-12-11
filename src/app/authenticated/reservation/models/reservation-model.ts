// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string;
  agentId: string;
  propertyId: string;
  contactId: string;
  clientTypeId: number;
  reservationStatusId: number;
  isActive: boolean;
  
  // Availability section
  arrivalDate?: string;
  departureDate?: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  monthlyRate: number;
  dailyRate: number;
  numberOfPeople: number;
  deposit: number;
  departureFee: number;
  taxes: number;
  
  // Address section
  address1: string;
  address2: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

export interface ReservationResponse {
  reservationId: string;
  agentId: string;
  propertyId: string;
  propertyCode: string;
  propertyAddress: string;
  PropertyStatus: string;
  contactId: string;
  clientTypeId: number;
  reservationStatusId: number;
  isActive: boolean;
  
  // Availability section
  arrivalDate?: string;
  departureDate?: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  monthlyRate: number;
  dailyRate: number;
  bedrooms: number;
  bathrooms: number;
  numberOfPeople: number;
  deposit: number;
  departureFee: number;
  taxes: number;
}

export interface ReservationListDisplay {
  reservationId: string;
  propertyCode: string;
  contactId: string;
  contactName: string;
  arrivalDate?: string;
  departureDate?: string;
  reservationStatus: string;
  isActive: boolean;
}


