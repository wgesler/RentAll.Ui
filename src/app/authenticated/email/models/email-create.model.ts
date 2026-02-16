import { DocumentConfig, EmailConfig } from '../../shared/base-document.component';

export interface EmailCreateDraft {
  emailConfig: EmailConfig;
  documentConfig: DocumentConfig;
  returnUrl: string;
}
