import { FileDetails } from '../../documents/models/document.model';
import type { CalendarDateString } from '../../../services/utility.service';

export interface PropertyAgreementLineRequest {
  agreementLineId?: string | null;
  title?: string | null;
  vendorId?: string | null;
  chartOfAccountId?: number | null;
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
  deposit?: number | null;
  oneTime?: number | null;
  monthly?: number | null;
  daily?: number | null;
  isRent?: boolean | null;
  notes?: string | null;
}

export interface PropertyAgreementLineResponse {
  agreementLineId?: string | null;
  title?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  termsId?: number | null;
  terms?: string | null;
  chartOfAccountId?: number | null;
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
  deposit?: number | null;
  oneTime?: number | null;
  monthly?: number | null;
  daily?: number | null;
  isRent?: boolean | null;
  notes?: string | null;
}

export interface AgreementLineDisplay {
  agreementLineId: string | null;
  title: string | null;
  vendorId: string | null;
  vendorName: string;
  terms: string;
  chartOfAccountId: number | null;
  startDate: Date | null;
  endDate: Date | null;
  deposit: string;
  oneTime: string;
  monthly: string;
  daily: string;
  isRent: boolean;
  notes: string;
}

export interface PropertyAgreementRequest {
  propertyId: string;
  w9FileDetails?: FileDetails | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: CalendarDateString | null;
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
  isMonthly?: boolean | null;
  hourlyLaborCost?: number | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  agreementLines?: PropertyAgreementLineRequest[] | null;
  notes?: string | null;
}

export interface PropertyAgreementResponse {
  propertyId: string;
  officeId: number;
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  insurancePath?: string | null;
  insuranceExpiration?: CalendarDateString | null;
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
  isMonthly: boolean;
  hourlyLaborCost?: number | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  agreementLines?: PropertyAgreementLineResponse[] | null;
  notes?: string | null;
}
