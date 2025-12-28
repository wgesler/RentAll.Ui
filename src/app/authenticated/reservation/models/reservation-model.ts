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
  hasPets: boolean;
  tenantName: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit?: number | null;
  departureFee: number;
  maidServiceFee: number;
  frequencyId: number;
  petFee: number;
  numberOfPets?: number;
  petDescription?: string;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  taxes: number;
  notes?: string;
  pets?: boolean;
  createdOn?: string;
  createdBy?: string;
  modifiedOn?: string;
  modifiedBy?: string;
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
  hasPets: boolean;
  tenantName?: string;
  propertyCode: string;
  propertyAddress: string;
  propertyStatusId: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit?: number | null;
  departureFee: number;
  maidServiceFee: number;
  frequencyId: number;
  petFee: number;
  numberOfPets?: number;
  petDescription?: string;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  taxes: number;
  notes?: string;
  pets?: boolean;
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


