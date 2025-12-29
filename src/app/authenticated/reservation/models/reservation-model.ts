// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string;
  organizationId: string;
  agentId?: string | null;
  propertyId: string;
  contactId: string;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number;
  numberOfPeople: number;
  tenantName: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number;
  departureFee: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  taxes: number;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  notes?: string;
  isActive: boolean;
}

export interface ReservationResponse {
  reservationId: string;
  organizationId: string;
  agentId?: string | null;
  propertyId: string;
  contactId: string;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number;
  numberOfPeople: number;
  tenantName: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number;
  departureFee: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  taxes: number;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  notes?: string;
  isActive: boolean;
}

export interface ReservationListDisplay {
  reservationId: string;
  propertyCode: string;
  contactId: string;
  contactName: string;
  arrivalDate?: string;
  departureDate?: string;
  reservationStatus: string;
  reservationStatusId?: number; // Added for proper sorting by numeric ID
  isActive: boolean;
}


