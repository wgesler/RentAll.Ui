import { ContactResponse } from '../../contacts/models/contact.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { InvoiceResponse } from './invoice.model';

export interface InvoicePrintContext {
  invoice: InvoiceResponse;
  reservation: ReservationResponse;
  property: PropertyResponse | null;
  contact: ContactResponse | null;
  contacts: ContactResponse[];
  selectedOffice: OfficeResponse;
  selectedAccountingOffice: AccountingOfficeResponse | null;
  organization: OrganizationResponse | null;
  accountingOfficeLogo: string;
  orgLogo: string;
  paymentCostCodeIds: Set<number>;
}
