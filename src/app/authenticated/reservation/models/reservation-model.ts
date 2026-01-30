// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string;
  organizationId: string;
  officeId: number | null;
  agentId: string | null;
  propertyId: string;
  contactId: string;
  reservationCode?: string;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number;
  numberOfPeople: number;
  tenantName: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingMethodId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number;
  departureFee: number;
  taxes: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  maidStartDate: string;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  notes?: string;
  allowExtensions: boolean;
  currentInvoiceNumber: number;
  creditDue: number;
  isActive: boolean; 
}

export interface ReservationResponse {
  reservationId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  agentId: string | null;
  propertyId: string;
  contactId: string;
  contactName: string;
  reservationCode: string;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number;
  numberOfPeople: number;
  tenantName: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  billingMethodId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number;
  departureFee: number;
  taxes: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  maidStartDate: string;
  extraFee: number;
  extraFeeName: string;
  extraFee2?: number;
  extraFee2Name?: string;
  notes?: string;
  allowExtensions: boolean;
  currentInvoiceNumber: number;
  creditDue: number;
  isActive: boolean;
  createdOn?: string;
  createdBy?: string;
  modifiedOn?: string;
  modifiedBy?: string; 
}

export interface ReservationListResponse {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  contactId: string;
  contactName: string;
  tenantName: string;
  companyName: string;
  agentCode: string;
  monthlyRate: number;
  arrivalDate: string;
  departureDate: string;
  reservationStatusId: number;
  creditDue: number;
  isActive: boolean;
  createdOn: string;
}

export interface ReservationListDisplay {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  office?: string;
  contactId: string;
  contactName: string;
  tenantName: string;
  companyName: string;
  agentCode: string;
  monthlyRate: number;
  arrivalDate: string;
  departureDate: string;
  reservationStatusId: number;
  creditDue: number;
  credit?: boolean;
  isActive: boolean;
  createdOn: string;
}

export interface ReservationPaymentRequest {
  reservationId: string;
  costCodeId: number;
  description: string;
  amount: number;
}


