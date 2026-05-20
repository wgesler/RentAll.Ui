import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DynamicFormDraftService {
  buildDraftKey(
    organizationId: string,
    ownerLeadId: number | null,
    officeId: number | null,
    propertyId: string | null,
    formKey: string
  ): string {
    const org = String(organizationId || '').trim() || 'none';
    const owner = Number(ownerLeadId) > 0 ? String(ownerLeadId) : 'none';
    const office = Number(officeId) > 0 ? String(officeId) : 'none';
    const property = String(propertyId || '').trim() || 'none';
    const form = String(formKey || '').trim() || 'unknown';
    return `owner-dynamic-form:${org}:${owner}:${office}:${property}:${form}`;
  }

  loadDraft(key: string): string | null {
    if (!key) {
      return null;
    }
    try {
      const value = localStorage.getItem(key);
      return value && value.trim() ? value : null;
    } catch {
      return null;
    }
  }

  saveDraft(key: string, html: string): void {
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, html || '');
    } catch {
      // Ignore storage errors to keep form usable.
    }
  }

  resetDraft(key: string): void {
    if (!key) {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors to keep form usable.
    }
  }
}
