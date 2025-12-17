// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string;
  organizationId: string;
  agentId?: string | null;
  propertyId: string;
  tenantName: string;
  clientId: string;
  clientTypeId: number;
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
  propertyCode?: string;
  propertyAddress?: string;
  PropertyStatus?: string;
  contactName?: string;
  tenantName: string;
  clientId: string;
  clientTypeId: number;
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
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
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
  isActive: boolean;
}


