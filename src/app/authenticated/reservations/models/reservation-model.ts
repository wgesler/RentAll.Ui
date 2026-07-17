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
  billingStartDate?: CalendarDateString | null;
  billingEndDate?: CalendarDateString | null;
  checkInTimeId: number;
  checkOutTimeId: number;
  maidUserId?: string | null;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  garageCode?: string | null;
  currentInvoiceNo: number;
  billingMethodId: number;
  prorateTypeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId: number;
  depositReturned: boolean;
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
  collapseCharges: boolean;

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
  noticeStatusId?: number | null;
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
  billingStartDate?: CalendarDateString | null;
  billingEndDate?: CalendarDateString | null;
  checkInTimeId: number;
  checkOutTimeId: number;
  maidUserId?: string | null;
  lockBoxCode?: string | null;
  unitTenantCode?: string | null;
  garageCode?: string | null;
  currentInvoiceNo: number;
  billingMethodId: number;
  prorateTypeId: number;
  billingTypeId: number;
  billingRate: number;
  deposit: number;
  depositTypeId?: number | null;
  depositReturned?: boolean | null;
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
  collapseCharges: boolean;

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
  propertyId: string;
  propertyCode: string;
  noticeStatusId?: number | null;
  officeId: number;
  officeName: string;
  contactId: string;
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  tenantName: string;
  agentCode?: string | null;
  billingTypeId?: number | null;
  billingRate?: number;
  monthlyRate: number;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  reservationTypeId: number;
  reservationStatusId: number;
  reservationNoticeId?: number | null;
  hasPets: boolean;
  maidUserId: string | null;
  maidStartDate: string | null;
  frequencyId: number;
  maidServiceFee: number;
  currentInvoiceNo: number;

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

export interface ReservationCodeResponse {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  contactId: string;
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  tenantName: string;
  reservationTypeId: number;
  isActive: boolean;
}

export interface ReservationListDisplay {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  noticeStatusId?: number | null;
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
  billingTypeId?: number | null;
  billingRate?: number;
  monthlyRate: number;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  reservationTypeId: number;
  reservationStatusId: number;
  hasPets?: boolean | null;
  maidUserId: string | null;
  maidStartDate?: string | null;
  frequencyId?: number | null;
  maidService?: boolean | null;
  currentInvoiceNo: number;
  
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

export interface ReservationTrackerResponseRequest {
  trackerResponseId?: string;
  trackerDefinitionId: string;
  reservationId: string;
  isChecked: boolean;
  checkedOn?: string | null;
  checkedBy?: string | null;
}

export interface ReservationTrackerResponse {
  trackerResponseId: string;
  trackerDefinitionId: string;
  propertyId: string;
  reservationId?: string | null;
  organizationId: string;
  officeId: number;
  officeName: string;
  trackerContextId: number;
  trackerContextCode: string;
  trackerDisplayName: string;
  trackerDescription?: string | null;
  trackerSortOrder: number;
  entityTypeId: number;
  entityTypeDescription: string;
  entityId: string;
  isChecked: boolean;
  checkedOn?: string | null;
  checkedBy?: string | null;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReservationTrackerResponseOptionRequest {
  trackerResponseId: string;
  trackerDefinitionOptionId: string;
}

export interface ReservationTrackerResponseOption {
  trackerResponseId: string;
  trackerDefinitionOptionId: string;
  propertyId: string;
  reservationId?: string | null;
  trackerDefinitionId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  trackerContextId: number;
  trackerContextCode: string;
  trackerDisplayName: string;
  trackerDescription?: string | null;
  trackerSortOrder: number;
  label: string;
  optionDescription?: string | null;
  optionSortOrder: number;
  entityTypeId: number;
  entityTypeDescription: string;
  entityId: string;
  isChecked: boolean;
  createdOn: string;
  createdBy: string;
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

/** UI state for an extra fee line on the reservation form. */
export interface ExtraFeeLineDisplay {
  extraFeeLineId: string | null;
  feeDescription: string | null;
  feeAmount: number | undefined;
  feeFrequencyId: number | undefined;
  costCodeId: number | undefined;
  isNew?: boolean;
}

/** Additional contact row on the reservation form. */
export interface AdditionalContactRow {
  contactId: string;
  contactPhone: string;
  contactEmail: string;
}

/** Context for reservation change notification emails. */
export interface ReservationNotificationContext {
  shouldNotify: boolean;
  isNewReservation: boolean;
  isCancellation: boolean;
  arrivalDateChanged: boolean;
  departureDateChanged: boolean;
}

export interface ReservationDepartureResponse {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  propertyCode: string;
  officeId: number;
  officeName: string;
  agentCode?: string | null;
  contactId: string;
  contactName: string;
  companyId?: string | null;
  companyName?: string | null;
  tenantName: string;
  monthlyRate: number;
  dailyRate: number;
  billingRate: number;
  billingTypeId: number;
  arrivalDate: CalendarDateString;
  departureDate: CalendarDateString;
  reservationTypeId: number;
  reservationStatusId: number;
  hasPets: boolean;
  depositTypeId: number;
  deposit: number;
  depositReturned: boolean;
  securityDepositReturnDate: CalendarDateString;
}

export interface SecurityDepositReturnRequest {
  reservationId: string;
  paymentDate: CalendarDateString;
  chartOfAccountId: number;
  paymentTypeId: number;
  description: string;
  amount: number;
}

export interface UnreturnedSecurityDepositDisplay {
  reservationId: string;
  reservationCode: string;
  propertyCode: string;
  officeId: number;
  agentCode: string;
  contactName: string;
  tenantName: string;
  companyName: string;
  arrivalDate: string;
  departureDate: string;
  securityDepositReturnDate: string;
  depositDisplay: string;
  deposit: number;
  depositReturned: boolean;
}

