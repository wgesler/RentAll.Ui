import { ContactResponse } from '../../contacts/models/contact.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from './owner-statement.model';

export interface OwnerStatementPrintContext {
  line: OwnerStatementMonthLineListDisplay;
  organization: OrganizationResponse | null;
  selectedOffice: OfficeResponse | null;
  selectedAccountingOffice: AccountingOfficeResponse | null;
  ownerContact: ContactResponse | null;
  property: PropertyResponse | null;
  statementActivityLines: OwnerStatementPropertyActivityLineResponse[];
  statementAccrualActivityLines: OwnerStatementPropertyActivityLineResponse[];
}
