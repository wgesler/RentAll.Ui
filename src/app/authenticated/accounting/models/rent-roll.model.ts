import { PropertyAgreementLineResponse } from '../../properties/models/property-agreement.model';

export interface RentRollRow {
  propertyId: string;
  propertyCode: string;
  agreementLineId: string | null;
  title: string;
  vendorName: string;
  monthlyAmount: number;
  dailyAmount: number;
  totalAmount: number;
}

export interface RentRollRowDisplay {
  propertyCode: string;
  title: string;
  vendorName: string;
  monthlyAmountDisplay: string;
  dailyAmountDisplay: string;
  totalAmountDisplay: string;
}

export interface RentRollPropertyAgreement {
  propertyId: string;
  propertyCode: string;
  officeId: number;
  agreementLines?: PropertyAgreementLineResponse[] | null;
}
