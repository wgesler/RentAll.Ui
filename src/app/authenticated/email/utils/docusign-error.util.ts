export function isDocuSignConsentRequired(message: string): boolean {
  return /consent_required/i.test(message);
}

export function extractDocuSignConsentUrl(message: string): string | null {
  const visitMatch = message.match(/visit:\s*(https?:\/\/\S+)/i);
  if (visitMatch?.[1]) {
    return visitMatch[1].trim();
  }

  const urlMatch = message.match(/https?:\/\/[^\s"']+/i);
  return urlMatch?.[0]?.trim() || null;
}
