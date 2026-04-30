import { FileDetails } from "../../../shared/models/fileDetails";

export interface OfficeRequest {
  officeId?: number;
  organizationId: string;
  officeCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  isInternational: boolean;
  isActive: boolean;
  // Configuration fields
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  afterHoursInstructions?: string;
  useDailyOnResBoard: boolean
  daysToRefundDeposit: number;
  defaultDeposit: number;
  defaultSdw: number;
  defaultKeyFee: number;
  undisclosedPetFee: number;
  minimumSmokingFee: number;
  utilityOneBed: number;
  utilityTwoBed: number;
  utilityThreeBed: number;
  utilityFourBed: number;
  utilityHouse: number;
  maidOneBed: number;
  maidTwoBed: number;
  maidThreeBed: number;
  maidFourBed: number;
  parkingLowEnd: number;
  parkingHighEnd: number;
  emailListForReservations?: string | null;
  // Cost Codes
  tenantChargeCcId?: number | null;
  tenantExpenseCcId?: number | null;
  ownerChargeCcId?: number | null;
  ownerExpenseCcId?: number | null;
  furnishedRentChargeCcId?: number | null;
  furnishedRentExpenseCcId?: number | null;
  unfurnishedRentChargeCcId?: number | null;
  unfurnishedRentExpenseCcId?: number | null;
  maidServiceChargeCcId?: number | null;
  maidServiceExpenseCcId?: number | null;
  parkingChargeCcId?: number | null;
  parkingExpenseCcId?: number | null;
  departureFeeCcId?: number | null;
  petFeeCcId?: number | null;
  securityDepositCcId?: number | null;
  securityDepositWaiverCcId?: number | null;
}

export interface OfficeResponse {
  officeId: number;
  organizationId: string;
  officeCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  isInternational: boolean;
  isActive: boolean;
  // Configuration fields
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  afterHoursInstructions?: string;
  useDailyOnResBoard: boolean
  daysToRefundDeposit: number;
  defaultDeposit: number;
  defaultSdw: number;
  defaultKeyFee: number;
  undisclosedPetFee: number;
  minimumSmokingFee: number;
  utilityOneBed: number;
  utilityTwoBed: number;
  utilityThreeBed: number;
  utilityFourBed: number;
  utilityHouse: number;
  maidOneBed: number;
  maidTwoBed: number;
  maidThreeBed: number;
  maidFourBed: number;
  parkingLowEnd: number;
  parkingHighEnd: number;
  emailListForReservations?: string | null;
  // Cost Codes
  tenantChargeCcId?: number | null;
  tenantExpenseCcId?: number | null;
  ownerChargeCcId?: number | null;
  ownerExpenseCcId?: number | null;
  furnishedRentChargeCcId?: number | null;
  furnishedRentExpenseCcId?: number | null;
  unfurnishedRentChargeCcId?: number | null;
  unfurnishedRentExpenseCcId?: number | null;
  maidServiceChargeCcId?: number | null;
  maidServiceExpenseCcId?: number | null;
  parkingChargeCcId?: number | null;
  parkingExpenseCcId?: number | null;
  departureFeeCcId?: number | null;
  petFeeCcId?: number | null;
  securityDepositCcId?: number | null;
  securityDepositWaiverCcId?: number | null;

}

export interface OfficeListDisplay {
  officeId: number;
  officeCode: string;
  address: string;
  name: string;
  phone: string;
  fax?: string;
  website?: string;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  defaultDeposit: number;
  defaultSdw: number;
  isInternational: boolean;
  isActive: boolean;
}



