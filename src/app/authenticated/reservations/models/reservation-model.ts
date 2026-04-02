// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string | null;
  organizationId: string;
  officeId: number;
  agentId: string;
  propertyId: string;
  contactId: string;
  reservationCode?: string | null;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId: number;
  numberOfPeople: number;
  tenantName: string;
  referenceNo: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  billingMethodId: number;
  prorateTypeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId: number;
  departureFee: number;
  taxes: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string | null;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  maidStartDate: string;
  extraFeeLines: ExtraFeeLineRequest[];
  notes?: string | null;
  allowExtensions: boolean;
  currentInvoiceNo: number;
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
  reservationNoticeId?: number | null;
  numberOfPeople: number;
  tenantName: string;
  referenceNo: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  billingMethodId: number;
  prorateTypeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number | null;
  departureFee: number;
  taxes: number;
  hasPets: boolean;
  petFee: number;
  numberOfPets: number;
  petDescription?: string | null;
  maidService: boolean;
  maidServiceFee: number;
  frequencyId: number;
  maidStartDate: string;
  extraFeeLines?: ExtraFeeLineResponse[] | null;
  notes?: string | null;
  allowExtensions: boolean;
  currentInvoiceNo: number;
  creditDue: number;
  isActive: boolean;
  createdOn?: string | null;
  createdBy?: string | null;
  modifiedOn?: string | null;
  modifiedBy?: string | null; 
}

export interface ReservationListResponse {
  reservationId: string;
  reservationCode: string;
  reservationTypeId?: number | null;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  contactId: string;
  entityId?: string | null;
  entityTypeId?: number | null;
  contactName: string;
  displayName?: string | null;
  tenantName: string;
  companyName: string;
  agentId?: string | null;
  agentCode: string;
  monthlyRate: number;
  arrivalDate: string;
  departureDate: string;
  reservationStatusId: number;
  currentInvoiceNo: number;
  creditDue: number;
  hasPets?: boolean | null;
  isActive: boolean;
  createdOn: string;
}

export interface ReservationListDisplay {
  reservationId: string;
  reservationCode: string;
  reservationTypeId?: number | null;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  office?: string | null;
  contactId: string;
  entityId?: string | null;
  entityTypeId?: number | null;
  contactName: string;
  tenantName: string;
  companyName: string;
  agentId?: string | null;
  agentCode: string;
  monthlyRate: number;
  arrivalDate: string;
  departureDate: string;
  reservationStatusId: number;
  creditDue: number;
  hasCredit?: boolean | null;
  isActive: boolean;
  createdOn: string;
}

// ExtraFeeLine models
export interface ExtraFeeLineRequest {
  extraFeeLineId?: string | null;
  reservationId?: string | null;
  feeDescription: string | null;
  feeAmount: number;
  feeFrequencyId: number;
  costCodeId: number;
}

export interface ExtraFeeLineResponse {
  extraFeeLineId: string;
  reservationId: string | null;
  feeDescription: string | null;
  feeAmount: number;
  feeFrequencyId: number;
  costCodeId: number;
}


