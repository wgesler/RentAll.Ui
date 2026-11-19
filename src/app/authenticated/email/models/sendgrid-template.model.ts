/** A SendGrid dynamic template ID saved for an email, per organization and optionally per office. */
export interface SendGridTemplateResponse {
  emailTemplateId: number;
  organizationId: string;
  officeId: number | null;
  emailName: string;
  templateId: string;
}

export interface SendGridTemplateNameResponse {
  emailName: string;
  displayName: string;
}

export interface SendGridTemplateSaveRequest {
  organizationId: string;
  officeId: number | null;
  emailName: string;
  templateId: string;
}

/** One email in the settings list, for the selected organization/office. */
export interface SendGridTemplateRow {
  emailName: string;
  displayName: string;
  /** The row saved for exactly this scope, if any. */
  saved: SendGridTemplateResponse | null;
  /** What is in the input box. */
  templateId: string;
  /** When editing an office: the organization-wide template it falls back to. */
  inheritedTemplateId: string;
  isSaving: boolean;
}
