import { ContactResponse } from '../../contacts/models/contact.model';
import { DocuSignSignerSlot } from '../../owners/models/owner-docusign.model';

export interface AddAlertDialogData {
  officeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  ticketId?: string | null;
  ticketCode?: string | null;
  source?: 'property' | 'reservation' | 'maintenance' | 'ticket' | null;
}

export type AlertPropertyOption = {
  propertyId: string;
  officeId: number;
  label: string;
};

export type AlertReservationOption = {
  reservationId: string;
  officeId: number;
  propertyId: string;
  label: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

export interface DocuSignConsentDialogData {
  consentUrl: string;
}

export interface DocuSignSignersDialogData {
  formTitle: string;
  slots: DocuSignSignerSlot[];
  tenantContacts: ContactResponse[];
  owner2Contacts: ContactResponse[];
  noSignersConfigured?: boolean;
}

export interface InvoicePaidFullDialogData {
  // No data needed for this simple informational dialog
}

export interface PasswordCheckDialogData {
  title?: string;
  message?: string;
  hint?: string;
  confirmLabel?: string;
}

export interface PasswordCheckDialogResult {
  password: string;
}

export interface PropertyCalendarTesterDialogData {
  initialUrl?: string | null;
}

export type ParsedCalendarEvent = {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  location: string;
  description: string;
};
