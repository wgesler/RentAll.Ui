export const systemUserAccountEmail = 'system@rentall.com';
export const systemUserAccountName = 'System User';
export const systemUserOutboundEmail = 'wendy.gesler@rentallexchange.com';
export const systemUserOutboundName = 'Wendy Gelser';

export interface OutboundSenderFields {
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  plainTextContent?: string | null;
  htmlContent?: string | null;
}

export function isSystemUserAccountSender(fromEmail: string | null | undefined, fromName: string | null | undefined): boolean {
  const email = (fromEmail || '').trim().toLowerCase();
  const name = (fromName || '').trim();
  return email === systemUserAccountEmail || name === systemUserAccountName;
}

export function applySystemUserOutboundSender<T extends OutboundSenderFields>(config: T): T {
  if (!isSystemUserAccountSender(config.fromEmail, config.fromName)) {
    return config;
  }

  return {
    ...config,
    fromEmail: systemUserOutboundEmail,
    fromName: systemUserOutboundName,
    subject: config.subject == null ? config.subject : replaceSystemUserSenderText(config.subject),
    plainTextContent: config.plainTextContent == null ? config.plainTextContent : replaceSystemUserSenderText(config.plainTextContent),
    htmlContent: config.htmlContent == null ? config.htmlContent : replaceSystemUserSenderText(config.htmlContent)
  };
}

function replaceSystemUserSenderText(value: string): string {
  return value.split(systemUserAccountName).join(systemUserOutboundName).split(systemUserAccountEmail).join(systemUserOutboundEmail);
}
