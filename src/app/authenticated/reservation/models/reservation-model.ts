// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string;
  organizationId: string;
  agentId?: string | null;
  propertyId: string;
  reservationTypeId: number;
  contactId: string;
  tenantName: string;
  reservationStatusId: number;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  numberOfPeople: number;
  deposit?: number | null;
  checkoutFee: number;
  maidServiceFee: number;
  frequencyId: number;
  petFee: number;
  extraFee: number;
  extraFeeName: string;
  taxes: number;
  notes?: string;
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
  propertyCode: string;
  propertyAddress: string;
  propertyStatusId: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  tenantName?: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingTypeId: number;
  billingRate: number;
  numberOfPeople: number;
  deposit?: number | null;
  checkoutFee: number;
  maidServiceFee: number;
  frequencyId: number;
  petFee: number;
  extraFee: number;
  extraFeeName: string;
  taxes: number;
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


