import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FormTokenReplacerService {
  replaceTokens(
    html: string,
    tokenValues: Record<string, string | null | undefined>,
    options?: { highlightUnresolved?: boolean; includeUnderlinedVariants?: boolean }
  ): string {
    const highlightUnresolved = options?.highlightUnresolved ?? true;
    const includeUnderlinedVariants = options?.includeUnderlinedVariants ?? false;
    const normalized = this.normalizeTokenValues(tokenValues);
    const expanded = includeUnderlinedVariants ? this.withAutoUnderlinedVariants(normalized) : normalized;

    let content = String(html || '');
    Object.entries(expanded).forEach(([token, value]) => {
      const pattern = new RegExp(`\\{\\{\\s*${this.escapeRegExp(token)}\\s*\\}\\}`, 'gi');
      content = content.replace(pattern, value);
    });

    // Never silently strip unresolved tokens. Leave them in place and flag them (purple)
    // so they are obvious and can be fixed. A token mapped to an empty value renders blank
    // (handled above) and is intentionally not flagged.
    if (highlightUnresolved) {
      content = content.replace(/\{\{\s*[^}]+\s*\}\}/g, match =>
        `<span class="unresolved-token" style="color:#9c27b0;font-weight:600;">${match}</span>`
      );
    }
    return content;
  }

  getUnderlinedFillValue(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return '';
    }
    return `&nbsp;&nbsp;${trimmed}&nbsp;&nbsp;`;
  }

  private normalizeTokenValues(values: Record<string, string | null | undefined>): Record<string, string> {
    const normalized: Record<string, string> = {};
    Object.entries(values || {}).forEach(([key, value]) => {
      normalized[String(key)] = String(value ?? '');
    });
    return normalized;
  }

  private withAutoUnderlinedVariants(values: Record<string, string>): Record<string, string> {
    const expanded: Record<string, string> = { ...values };
    Object.entries(values).forEach(([key, value]) => {
      if (key.toLowerCase().endsWith('underlined')) {
        return;
      }
      if (/[<>]/.test(value)) {
        return;
      }
      const underlinedKey = `${key}Underlined`;
      if (expanded[underlinedKey] != null) {
        return;
      }
      expanded[underlinedKey] = this.getUnderlinedFillValue(value);
    });
    return expanded;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
