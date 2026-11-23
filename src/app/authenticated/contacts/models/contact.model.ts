import { FileDetails } from "../../documents/models/document.model";
import type { CalendarDateString } from '../../../services/utility.service';

export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  officeId: number;
  officeAccess: number[];
  contactCode?: string;
  externalRefNo?: string | null;
  userId?: string | null;
  entityTypeId: number;
  ownerTypeId: number;
  vendorTypeId: number;
  properties: string[];
  companyName?: string | null;
  companyEmail?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  extension?: string | null;
  email: string;
  rating: number;
  notes?: string;
  isInternational: boolean;
  markup?: number | null;
  paymentTermsId?: number | null;
  prorateTypeId?: number | null;
  invoiceMethodTypeId?: number | null;
  insurancePath?: string | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: CalendarDateString | null;
  propertyManagedBy?: number | null;
  dateOfBirth?: CalendarDateString | null;
  federalTaxClassificationId?: number | null;
  ownerIdTypeId?: number | null;
  identificationNumber?: string | null;
  ownerDocumentId?: number | null;
  documentFront?: string | null;
  documentFrontFileDetails?: FileDetails | null;
  documentBack?: string | null;
  documentBackFileDetails?: FileDetails | null;
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  contactCardId?: number | null;
  contactBank?: ContactBankRequest | null;
  addAsUser?: number | null;
  isOwnerReady?: boolean;
  ownerLeadId?: number | null;
  isActive: boolean;
 }

export interface ContactResponse {
  contactId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  officeAccess?: number[];
  contactCode: string;
  externalRefNo?: string | null;
  userId?: string | null;
  entityTypeId: number;
  ownerTypeId: number;
  vendorTypeId: number;
  properties: string[];
  companyName?: string | null;
  companyEmail?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  fullName?: string | null;
  legalName?: string | null;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  extension?: string | null;
  email: string;
  rating: number;
  notes?: string;
  isInternational: boolean;
  markup?: number | null;
  paymentTermsId?: number | null;
  prorateTypeId?: number | null;
  invoiceMethodTypeId?: number | null;
  insurancePath?: string | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: CalendarDateString | null;
  propertyManagedBy?: number | null;
  dateOfBirth?: CalendarDateString | null;
  federalTaxClassificationId?: number | null;
  ownerIdTypeId?: number | null;
  identificationNumber?: string | null;
  ownerDocumentId?: number | null;
  documentFront?: string | null;
  documentFrontFileDetails?: FileDetails | null;
  documentBack?: string | null;
  documentBackFileDetails?: FileDetails | null;
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  contactCardId?: number | null;
  contactCard?: ContactCardResponse | null;
  contactBankId?: number | null;
  contactBank?: ContactBankResponse | null;
  addAsUser?: number | null;
  isOwnerReady?: boolean;
  ownerLeadId?: number | null;
  isActive: boolean;
}

export interface ContactBankRequest {
  contactBankId?: number | null;
  bankAccountTypeId: number;
  nameOnAccount?: string | null;
  bankName?: string | null;
  routingNumber?: string | null;
  /** Blank or masked keeps the stored account number. */
  accountNumber?: string | null;
}

export interface ContactBankResponse {
  contactBankId: number;
  bankAccountTypeId: number;
  nameOnAccount?: string | null;
  bankName?: string | null;
  routingNumber?: string | null;
  lastFour?: string | null;
  hasNumberConsent?: boolean;
  authorizedOn?: string | null;
}

export interface ContactCardRequest {
  contactCardId?: number;
  cardTypeId: number;
  cardName: string;
  cardNumber: string;
}

export interface ContactCardResponse {
  contactCardId: number;
  organizationId: string;
  officeId: number;
  cardTypeId: number;
  cardName: string;
  displayName: string;
  cardNumber: string;
  rawCardNumber?: string;
  lastFour: string;
  /** MM/YY, as the payment processor reports it. */
  expirationDate?: string | null;
  hasNumberConsent?: boolean;
  /** The full number is held by the payment processor (Number); there is nothing to decrypt. */
  isExternallyStored?: boolean;
}

export interface ContactCardPanResponse {
  cardNumber: string;
}

export interface ContactListDisplay {
  contactId: string;
  ownerLeadId?: number | null;
  contactCode: string;
  officeId: number;
  officeName: string;
  officeAccess?: number[];
  fullName?: string | null;
  legalName?: string | null;
  contactType: string;
  entityTypeId?: number;
  ownerTypeId: number;
  vendorTypeId: number;
  properties?: string[];
  propertyCodesDisplay?: string;
  companyName?: string | null;
  companyEmail?: string | null;
  phone?: string | null;
  email: string;
  rating: number;
  ratingStars?: string;
  isOwnerReady?: boolean;
  isActive: boolean;
}

export interface AppendPropertyCodeToContactsRequest {
  contactIds: string[];
  propertyCode: string;
}

export interface AppendPropertyCodeToContactsResponse {
  requestedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface W9ExtractResponse {
  federalTaxClassificationId?: number | null;
  ownerIdTypeId?: number | null;
  identificationNumber?: string | null;
  warnings?: string[] | null;
}

export interface PropertyContactEditRow {
  rowId: number;
  contactId?: string;
  contactCode: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
}

