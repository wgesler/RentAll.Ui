import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { ContactResponse } from '../authenticated/contacts/models/contact.model';
import { EntityType } from '../authenticated/contacts/models/contact-enum';
import { ReservationListResponse, ReservationResponse } from '../authenticated/reservations/models/reservation-model';
import { ReservationType } from '../authenticated/reservations/models/reservation-enum';
/** SQL **DATE** / JSON calendar (`YYYY-MM-DD`); not a zoned instant. */
export type CalendarDateString = string;

@Injectable({
  providedIn: 'root'
})
export class UtilityService {
  constructor() { }

  //#region To/From the API (calendar / DateOnly)
  /**
   * **From API / UI:** calendar string → local start-of-day `Date`.
   * Accepts `YYYY-MM-DD`, US `M/d/yyyy`, then a generic `Date` parse fallback (segment before `T` / first space).
   */
  parseDateOnlyStringToDate(value: string | null | undefined): Date | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const datePart = String(value).split('T')[0]?.split(' ')[0] ?? '';
    if (!datePart) {
      return null;
    }
    // `YYYY-MM-DD` (same segment rules as {@link parseCalendarDateToOrdinal}).
    const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (mIso) {
      const y = Number(mIso[1]);
      const mo = Number(mIso[2]);
      const d = Number(mIso[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
        return null;
      }
      return new Date(y, mo - 1, d);
    }
    // US `M/d/yyyy` or `MM/DD/YYYY` (list/formatter display dates).
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(datePart);
    if (us) {
      const mo = Number(us[1]);
      const d = Number(us[2]);
      const y = Number(us[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
        return null;
      }
      return new Date(y, mo - 1, d);
    }
    const parsed = new Date(`${datePart}T00:00:00`);
    if (isNaN(parsed.getTime())) {
      return null;
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  /** **To API:** local `Date` → `yyyy-MM-dd` for calendar fields on the wire. */
  formatDateOnlyForApi(value: Date | null | undefined): string | null {
    if (!value || !(value instanceof Date) || isNaN(value.getTime())) {
      return null;
    }
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  /**
   * **To API:** coerce a control or loose UI value → `yyyy-MM-dd` for JSON calendar fields.
   * Accepts `Date`, or strings such as `2026-04-16` or values with an ISO date prefix.
   */
  toDateOnlyJsonString(value: unknown): string | null {
    if (value == null || value === '') {
      return null;
    }
    if (value instanceof Date) {
      return this.formatDateOnlyForApi(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const datePart = trimmed.split('T')[0]?.split(' ')[0] ?? '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return this.formatDateOnlyForApi(parsed);
      }
      return null;
    }
    return null;
  }

  /** **To API:** today in the org’s local calendar as `yyyy-MM-dd` (defaults, queries). */
  todayAsCalendarDateString(): CalendarDateString {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  //#endregion

  //#region UI (forms & pickers — calendar day)
  /**
   * Same calendar rules as {@link parseDateOnlyStringToDate} for strings, plus `Date` from pickers (time stripped).
   * Use on reactive controls where the value may be `Date | string`.
   */
  parseCalendarDateInput(value: string | Date | null | undefined): Date | null {
    if (value == null || value === '') {
      return null;
    }
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        return null;
      }
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    return this.parseDateOnlyStringToDate(String(value));
  }
  //#endregion

  //#region Calendar strings (compare & sort — client-side)
  /** Sort key for calendar strings (`YYYYMMDD`), or `null` if not parseable. */
  parseCalendarDateToOrdinal(value: string | null | undefined): number | null {
    const part = String(value ?? '').trim().split('T')[0] ?? '';
    // API / wire calendar: `YYYY-MM-DD` (optional `T…` time suffix on `value` is stripped via `part`).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
        return null;
      }
      return y * 10000 + mo * 100 + d;
    }
    // Display / formatter output: US `M/d/yyyy` or `MM/DD/YYYY` (same convention as `formatDateString`).
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(part);
    if (us) {
      const mo = Number(us[1]);
      const d = Number(us[2]);
      const y = Number(us[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
        return null;
      }
      return y * 10000 + mo * 100 + d;
    }
    // Loose UI / legacy strings and `Date` pickers → normalize to `YYYY-MM-DD` then reuse the strict branch above.
    const parsed = this.parseCalendarDateInput(value);
    if (!parsed) {
      return null;
    }
    const api = this.formatDateOnlyForApi(parsed);
    if (!api) {
      return null;
    }
    return this.parseCalendarDateToOrdinal(api);
  }

  compareCalendarDateStrings(a: string | null | undefined, b: string | null | undefined): number {
    const ao = this.parseCalendarDateToOrdinal(a);
    const bo = this.parseCalendarDateToOrdinal(b);
    if (ao === null && bo === null) {
      return 0;
    }
    if (ao === null) {
      return -1;
    }
    if (bo === null) {
      return 1;
    }
    return ao - bo;
  }

  isSameCalendarDayStrings(a: string | null | undefined, b: string | null | undefined): boolean {
    const ao = this.parseCalendarDateToOrdinal(a);
    const bo = this.parseCalendarDateToOrdinal(b);
    return ao !== null && ao === bo;
  }

  isSameCalendarDayStringAndLocalDate(value: string | null | undefined, day: Date): boolean {
    const o1 = this.parseCalendarDateToOrdinal(value);
    if (o1 === null) {
      return false;
    }
    const o2 = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
    return o1 === o2;
  }

  isSameLocalCalendarDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  normalizeId(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
  }

  normalizeIdOrNull(value: string | null | undefined): string | null {
    const s = this.normalizeId(value);
    return s === '' ? null : s;
  }

  extractApiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string; title?: string; errors?: Record<string, string[] | string> } | string | null;
      if (typeof body === 'string' && body.trim() !== '') {
        return body.trim();
      }
      if (body && typeof body === 'object') {
        if (typeof body.message === 'string' && body.message.trim() !== '') {
          return body.message.trim();
        }
        if (typeof body.title === 'string' && body.title.trim() !== '') {
          return body.title.trim();
        }
        const errors = body.errors;
        if (errors && typeof errors === 'object') {
          const firstValue = Object.values(errors)[0];
          if (Array.isArray(firstValue) && firstValue.length > 0 && typeof firstValue[0] === 'string' && firstValue[0].trim() !== '') {
            return firstValue[0].trim();
          }
          if (typeof firstValue === 'string' && firstValue.trim() !== '') {
            return firstValue.trim();
          }
        }
      }
      if (typeof error.message === 'string' && error.message.trim() !== '') {
        return error.message.trim();
      }
    }
    if (error instanceof Error && error.message.trim() !== '') {
      return error.message.trim();
    }
    return '';
  }
  //#endregion

  //#region Load tracking
  addLoadItem(itemsToLoad$: BehaviorSubject<Set<string>>, key: string): void {
    const currentSet = itemsToLoad$.value;
    if (!currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.add(key);
      itemsToLoad$.next(newSet);
    }
  }

  removeLoadItemFromSet(itemsToLoad$: BehaviorSubject<Set<string>>, key: string): void {
    const currentSet = itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      itemsToLoad$.next(newSet);
    }
  }
  //#endregion

  //#region Office selection
  resolveSelectedOfficeById<T extends { officeId: number }>(offices: T[], officeId: number | null): T | null {
    if (!offices?.length) {
      return null;
    }
    if (officeId !== null) {
      return offices.find(office => office.officeId === officeId) || null;
    }
    return offices.length === 1 ? offices[0] : null;
  }
  //#endregion

  //#region Reservations
  /** Label for reservation dropdown: ReservationCode + company/contact display name. */
  getReservationDropdownLabel(reservation: ReservationListResponse | ReservationResponse | null | undefined, contact: ContactResponse | null): string {
    if (!reservation) {
      return '';
    }
    const code = reservation.reservationCode;
    const reservationTypeId = Number(reservation.reservationTypeId);
    const isCorporateLike =
      reservationTypeId === ReservationType.Corporate
      || reservationTypeId === ReservationType.Platform
      || contact?.entityTypeId === EntityType.Company
      || !!reservation.companyId
      || !!reservation.companyName;

    if (isCorporateLike) {
      const boardLabel = this.getReservationBoardLabel(reservation, contact);
      return `${code}: ${boardLabel}`;
    }

    const fallbackName = (contact ? (contact.firstName + ' ' + contact.lastName).trim() : '') || reservation.tenantName;
    const contactName = reservation.contactName ?? fallbackName;
    return `${code}: ${contactName}`;
  }

  getReservationBoardLabel(
    reservation: ReservationListResponse | ReservationResponse | null | undefined,
    contact: ContactResponse | null
  ): string {
    if (!reservation) {
      return '';
    }
    const shortCompanyName = contact?.displayName || this.getCompanyDisplayToken(contact?.companyName ?? reservation.companyName);
    const tenantName = reservation.tenantName;
    const reservationTypeId = Number(reservation.reservationTypeId);
    switch (reservationTypeId) {
      case ReservationType.Corporate:
      case ReservationType.Platform:
        return shortCompanyName ? `${shortCompanyName}: ${tenantName}` : tenantName;
      default:
        return `${tenantName}`;
    }
  }

  getCompanyDropdownLabel(contact: ContactResponse | null | undefined): string {
    if (!contact) {
      return '';
    }
    return (contact.companyName || '').trim();
  }

  //#endregion

  //#region Document filenames
  generateDocumentFileName(
    type: 'lease' | 'welcomeLetter' | 'invoice' | 'inspection',
    propertyCode?: string | null,
    codeName?: string | null,
    subType?: string | null
  ): string {
    const stamp = this.getFilenameTimestamp();
    const pc = this.sanitizeFileNameSegment(String(propertyCode ?? ''));
    const code = this.sanitizeFileNameSegment(String(codeName ?? ''));
    const sub = this.sanitizeFileNameSegment(String(subType ?? ''));
    const seg = (x: string) => (x ? `_${x}` : '');

    switch (type) {
      case 'lease':
        return `${pc || 'Property'}${seg(code)}${seg(stamp)}.pdf`;
      case 'welcomeLetter':
        return `${pc || 'Property'}${seg(code)}${seg(stamp)}.pdf`;
      case 'invoice':
        return `${pc || 'Invoice'}${seg(code)}${seg(stamp)}.pdf`;
      case 'inspection':
        return `${pc || 'Property'}${seg(sub)}${seg(code)}${seg(stamp)}.pdf`;
    }
  }

  sanitizeFileNameSegment(value: string): string {
    const raw = value.trim();
    if (!raw) {
      return '';
    }
    return raw
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  getFilenameTimestamp(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}_${h}-${min}`;
  }
  //#endregion

  //#region Company display
  getCompanyDisplayToken(companyName: string | null | undefined): string {
    const words = (companyName || '')
      .trim()
      .split(/\s+/)
      .map(word => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ''))
      .filter(Boolean);

    const firstMeaningfulWord = words.find(word => {
      const lowered = word.toLowerCase();
      return lowered !== 'the' && lowered !== 'a' && lowered !== 'an';
    });

    return firstMeaningfulWord || '';
  }
  //#endregion

}
