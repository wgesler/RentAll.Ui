import { PropertyAgreementLineResponse } from '../../properties/models/property-agreement.model';

export interface RentRollRow {
  propertyId: string;
  propertyCode: string;
  officeId: number | null;
  agreementLineId: string | null;
  billDate: string | null;
  title: string;
  vendorId: string | null;
  vendorName: string;
  terms: string;
  chartOfAccountId: number | null;
  startDate: string | null;
  endDate: string | null;
  depositAmount: number;
  oneTimeAmount: number;
  monthlyAmount: number;
  dailyAmount: number;
  totalAmount: number;
}

export interface RentRollRowDisplay {
  propertyId: string;
  agreementLineId: string | null;
  billDate: string | null;
  propertyCode: string;
  vendorName: string;
  chartOfAccountDisplay: string;
  terms: string;
  billDateDisplay: string;
  dueDateDisplay: string;
  depositAmountDisplay: string;
  oneTimeAmountDisplay: string;
  monthlyAmountDisplay: string;
  dailyAmountDisplay: string;
  totalAmountDisplay: string;
  hasExistingBill?: boolean;
  invoiceDisabled?: boolean;
}

export interface RentRollPropertyAgreement {
  propertyId: string;
  propertyCode: string;
  officeId: number;
  agreementLines?: PropertyAgreementLineResponse[] | null;
}

export interface RentRollCreateBillRequest {
  propertyId: string;
  officeId: number | null;
  agreementLineId: string | null;
  billDate: string | null;
  dueDate: string | null;
  vendorId: string | null;
  vendorName: string;
  chartOfAccountId: number | null;
  terms: string;
  description: string;
  amount: number;
}
