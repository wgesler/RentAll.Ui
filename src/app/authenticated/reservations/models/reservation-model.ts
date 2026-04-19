import type { CalendarDateString } from '../../../services/utility.service';

// Reservation models will be added here

export interface ReservationRequest {
  reservationId?: string | null;
  organizationId: string;
  officeId: number;
  agentId?: string | null;
  propertyId: string;
  reservationCode?: string | null;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId: number;
  contactIds: string[];
  companyId?: string | null;
  companyName?: string | null;
  numberOfPeople: number;
  tenantName: string;
  referenceNo: string;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  checkInTimeId: number;
  checkOutTimeId: number;
  maidUserId?: string | null;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  currentInvoiceNo: number;
  creditDue: number;
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
  maidStartDate: CalendarDateString;
  extraFeeLines: ExtraFeeLineRequest[];
  notes?: string | null;
  allowExtensions: boolean;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;

  aCleanerUserId?: string | null;
  aCleaningDate?: CalendarDateString | null;
  aCarpetUserId?: string | null;
  aCarpetDate?: CalendarDateString | null;
  aInspectorUserId?: string | null;
  aInspectingDate?: CalendarDateString | null;
  dCleanerUserId?: string | null;
  dCleaningDate?: CalendarDateString | null;
  dCarpetUserId?: string | null;
  dCarpetDate?: CalendarDateString | null;
  dInspectorUserId?: string | null;
  dInspectingDate?: CalendarDateString | null;
  isActive: boolean;
}

export interface ReservationResponse {
  reservationId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  agentId?: string | null;
  propertyId: string;
  reservationCode: string;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number | null;
  contactIds: string[];
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  numberOfPeople: number;
  tenantName: string;
  referenceNo: string;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  checkInTimeId: number;
  checkOutTimeId: number;
  maidUserId?: string | null;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  currentInvoiceNo: number;
  creditDue: number;
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
  maidStartDate: CalendarDateString;
  extraFeeLines?: ExtraFeeLineResponse[] | null;
  notes?: string | null;
  allowExtensions: boolean;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;

  aCleanerUserId?: string | null;
  aCleaningDate?: CalendarDateString | null;
  aCarpetUserId?: string | null;
  aCarpetDate?: CalendarDateString | null;
  aInspectorUserId?: string | null;
  aInspectingDate?: CalendarDateString | null;
  dCleanerUserId?: string | null;
  dCleaningDate?: CalendarDateString | null;
  dCarpetUserId?: string | null;
  dCarpetDate?: CalendarDateString | null;
  dInspectorUserId?: string | null;
  dInspectingDate?: CalendarDateString | null;
  isActive: boolean;
  isDeleted?: boolean;
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
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  tenantName: string;
  agentCode?: string | null;
  monthlyRate: number;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  reservationStatusId: number;
  hasPets: boolean;
  maidUserId: string | null;
  maidStartDate: string | null;
  frequencyId: number;
  maidServiceFee: number;
  currentInvoiceNo: number;
  creditDue: number;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;

  aCleanerUserId?: string | null;
  aCleaningDate?: CalendarDateString | null;
  aCarpetUserId?: string | null;
  aCarpetDate?: CalendarDateString | null;
  aInspectorUserId?: string | null;
  aInspectingDate?: CalendarDateString | null;
  dCleanerUserId?: string | null;
  dCleaningDate?: CalendarDateString | null;
  dCarpetUserId?: string | null;
  dCarpetDate?: CalendarDateString | null;
  dInspectorUserId?: string | null;
  dInspectingDate?: CalendarDateString | null;
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
  companyId?: string | null;
  companyName: string;
  agentCode?: string | null;
  monthlyRate: number;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  reservationStatusId: number;
  hasPets?: boolean | null;
  maidUserId: string | null;
  maidStartDate?: string | null;
  frequencyId?: number | null;
  maidService?: boolean | null;
  currentInvoiceNo: number;
  creditDue: number;
  hasCredit?: boolean | null;
  paymentReceived: boolean;
  welcomeLetterChecked: boolean;
  welcomeLetterSent: boolean;
  readyForArrival: boolean;
  code: boolean;
  departureLetterChecked: boolean;
  departureLetterSent: boolean;
  
  aCleanerUserId?: string | null;
  aCleaningDate?: CalendarDateString | null;
  aCarpetUserId?: string | null;
  aCarpetDate?: CalendarDateString | null;
  aInspectorUserId?: string | null;
  aInspectingDate?: CalendarDateString | null;
  dCleanerUserId?: string | null;
  dCleaningDate?: CalendarDateString | null;
  dCarpetUserId?: string | null;
  dCarpetDate?: CalendarDateString | null;
  dInspectorUserId?: string | null;
  dInspectingDate?: CalendarDateString | null;  
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


