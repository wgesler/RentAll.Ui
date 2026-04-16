import { Injectable } from '@angular/core';
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
   * **From API:** JSON calendar / `DateOnly` string → local start-of-day `Date`.
   * Uses only the `YYYY-MM-DD` segment (text before `T`); any time portion in the string is ignored.
   */
  parseDateOnlyStringToDate(value: string | null | undefined): Date | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const datePart = String(value).split('T')[0] ?? '';
    if (!datePart) {
      return null;
    }
    const d = new Date(`${datePart}T00:00:00`);
    return !isNaN(d.getTime()) ? d : null;
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
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
    if (!m) {
      return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
      return null;
    }
    return y * 10000 + mo * 100 + d;
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
  getReservationLabel(reservation: ReservationListResponse): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    const contactName = reservation.contactName || 'N/A';
    return `${code}: ${contactName}`;
  }

  /** Display name for reservation board: company/contact name (corporate vs individual). */
  getReservationDisplayName(reservation: ReservationListResponse, contact: ContactResponse | null): string {
    const shortCompanyName = contact?.displayName || this.getCompanyDisplayToken(contact?.companyName ?? reservation.companyName);
    const contactName = reservation.contactName ?? (contact ? (contact.firstName + ' ' + contact.lastName).trim() : '');
    const isCorporate = (reservation.reservationTypeId === ReservationType.Corporate || contact?.entityTypeId === EntityType.Company);
    const formatWithCompanyToken = (name: string): string => {
      if (!shortCompanyName) {
        return name;
      }
      if (!name) {
        return shortCompanyName;
      }
      return `${shortCompanyName}: ${name}`;
    };
    if (isCorporate) {
      return formatWithCompanyToken(reservation.tenantName || '');
    }
    return formatWithCompanyToken(contactName || '');
  }

  /** Label for reservation dropdown: ReservationCode: getReservationDisplayName(). */
  getReservationDropdownLabel(reservation: ReservationListResponse, contact: ContactResponse | null): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    return `${code}: ${this.getReservationDisplayName(reservation, contact)}`;
  }

  buildReservationCodeNameLabel(
    reservation: ReservationListResponse | ReservationResponse | null | undefined,
    contact: ContactResponse | null
  ): string | undefined {
    if (!reservation) {
      return undefined;
    }
    const label = this.getReservationDropdownLabel(reservation as ReservationListResponse, contact).trim();
    return label.length > 0 ? label : undefined;
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
