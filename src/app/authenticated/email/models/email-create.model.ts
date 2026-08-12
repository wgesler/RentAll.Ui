import { DocumentConfig, EmailConfig } from '../../shared/base-document.component';

export interface EmailCreateDraft {
  emailConfig: EmailConfig;
  documentConfig: DocumentConfig;
  returnUrl: string;
  /** When true, open the compose template read-only to view a sent email. */
  viewOnly?: boolean;
}
