import { ContactResponse } from '../../contacts/models/contact.model';

export interface DocuSignSignerConfig {
  email: string;
  name: string;
  routingOrder: number;
}

export interface DocuSignSignerSlot {
  id: string;
  role: string;
  label: string;
  email: string;
  name: string;
  contactId: string | null;
  isRemovable: boolean;
  isTenant: boolean;
  isOwner2: boolean;
  isCompany: boolean;
  isCompanyTenant: boolean;
}

export interface OwnerDocuSignSignerContext {
  primaryOwnerContact: ContactResponse | null | undefined;
  additionalOwnerContactIds: string[];
  contacts: ContactResponse[];
  agent: { email: string; name: string } | null | undefined;
  primaryTenantContact?: ContactResponse | null | undefined;
  primaryCompanyContact?: ContactResponse | null | undefined;
}

export interface OwnerDocuSignSignersPromptInput {
  formTitle: string;
  roles: string[];
  context: OwnerDocuSignSignerContext;
  officeId: number | null | undefined;
  contacts: ContactResponse[];
}
