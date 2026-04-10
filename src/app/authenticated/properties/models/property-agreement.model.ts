import { FileDetails } from '../../documents/models/document.model';

export interface PropertyAgreementRequest {
  propertyId: string;
  w9FileDetails?: FileDetails | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: string | null;
  w9Path?: string | null;
  insurancePath?: string | null;
  agreementPath?: string | null;
  agreementFileDetails?: FileDetails | null;
  managementFeeTypeId: number;
  flatRateAmount: number | null;
  markup?: number | null;
  revenueSplitOwner?: number | null;
  revenueSplitOffice?: number | null;
  workingCapitalBalance?: number | null;
  linenAndTowelFee?: number | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  rentalIncomeCcId?: number | null;
  rentalExpenseCcId?: number | null;
  notes?: string | null;
}

export interface PropertyAgreementResponse {
  propertyId: string;
  officeId: number;
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  insurancePath?: string | null;
  insuranceExpiration?: string | null;
  insuranceFileDetails?: FileDetails | null;
  agreementPath?: string | null;
  agreementFileDetails?: FileDetails | null;
  managementFeeTypeId: number;
  flatRateAmount: number | null;
  markup: number;
  revenueSplitOwner: number;
  revenueSplitOffice: number;
  workingCapitalBalance: number;
  linenAndTowelFee: number;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  rentalIncomeCcId?: number | null;
  rentalExpenseCcId?: number | null;
  notes?: string | null;
}
