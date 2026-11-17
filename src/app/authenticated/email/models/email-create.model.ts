import { DocumentConfig, EmailConfig } from '../../shared/models/base-document.model';

export interface EmailCreateDraft {
  emailConfig: EmailConfig;
  documentConfig: DocumentConfig;
  returnUrl: string;
  /** When true, open the compose template read-only to view a sent email. */
  viewOnly?: boolean;
  attachmentDocumentId?: string | null;
}
