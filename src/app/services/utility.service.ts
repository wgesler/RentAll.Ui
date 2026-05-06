import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { ContactResponse } from '../authenticated/contacts/models/contact.model';
import { EntityType } from '../authenticated/contacts/models/contact-enum';
import { ReservationListResponse, ReservationResponse } from '../authenticated/reservations/models/reservation-model';
import { ReservationType } from '../authenticated/reservations/models/reservation-enum';
import { FileDetails } from '../shared/models/fileDetails';
import { FormatterService } from './formatter-service';
/** SQL **DATE** / JSON calendar (`YYYY-MM-DD`); not a zoned instant. */
export type CalendarDateString = string;
export interface OptimizedUploadPayload {
  uploadFile: File;
  fileDetails: FileDetails;
  wasOptimized: boolean;
}

type FileDetailsLike = {
  fileName?: string;
  contentType?: string;
  file?: string;
  dataUrl?: string;
};

@Injectable({
  providedIn: 'root'
})
export class UtilityService {
  private measurementCanvas: HTMLCanvasElement | null = null;
  readonly defaultImageTargetMinBytes = 150 * 1024;
  readonly defaultImageTargetMaxBytes = 500 * 1024;

  constructor(private formatterService: FormatterService) { }

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
      const bodyMessage = this.extractApiErrorMessageFromPayload(error.error);
      if (bodyMessage) {
        return bodyMessage;
      }
      if (typeof error.message === 'string' && error.message.trim() !== '') {
        return error.message.trim();
      }
    }
    const directPayloadMessage = this.extractApiErrorMessageFromPayload(error);
    if (directPayloadMessage) {
      return directPayloadMessage;
    }
    if (error instanceof Error && error.message.trim() !== '') {
      return error.message.trim();
    }
    return '';
  }

  extractApiErrorMessageFromPayload(payload: unknown): string {
    if (typeof payload === 'string') {
      return payload.trim();
    }
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const obj = payload as Record<string, unknown>;
    const message = typeof obj['message'] === 'string' ? obj['message'].trim() : '';
    if (message) {
      return message;
    }

    const title = typeof obj['title'] === 'string' ? obj['title'].trim() : '';
    const detail = typeof obj['detail'] === 'string' ? obj['detail'].trim() : '';
    const errors = obj['errors'];
    if (errors && typeof errors === 'object') {
      const flattened = Object.entries(errors as Record<string, unknown>)
        .flatMap(([field, value]) => {
          if (Array.isArray(value)) {
            return value
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map(item => `${field}: ${item.trim()}`);
          }
          if (typeof value === 'string' && value.trim().length > 0) {
            return [`${field}: ${value.trim()}`];
          }
          return [];
        });
      if (flattened.length > 0) {
        const parts = [title || 'Validation error', ...flattened];
        return parts.join(' | ');
      }
    }

    if (detail) {
      return detail;
    }
    if (title) {
      return title;
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

  //#region Text/layout helpers
  isAddressSingleLine(label: string, address1: string | null | undefined, address2: string | null | undefined): boolean {
    const singleLine = [String(address1 || '').trim(), String(address2 || '').trim()].filter(part => part.length > 0).join(', ');
    return !singleLine || this.measureTextWidthPx(`${String(label || '').trim()} ${singleLine}`.trim(), "10pt arial, sans-serif") <= 315;
  }

  measureTextWidthPx(text: string, font: string = "10pt arial, sans-serif"): number {
    const value = String(text || "");
    if (!value) {
      return 0;
    }

    if (typeof document === "undefined") {
      return value.length * 7;
    }

    if (!this.measurementCanvas) {
      this.measurementCanvas = document.createElement("canvas");
    }

    const context = this.measurementCanvas.getContext("2d");
    if (!context) {
      return value.length * 7;
    }

    context.font = font;
    return context.measureText(value).width;
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

  getReservationBoardLabel(reservation: ReservationListResponse | ReservationResponse | null | undefined, contact: ContactResponse | null) {
    if (!reservation) 
      return '';
    
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

  getResponsibleParty(reservation: ReservationListResponse | ReservationResponse | null | undefined, contact: ContactResponse | null): string {
    if (!contact) 
      return '';
    
    const reservationTypeId = Number(reservation?.reservationTypeId);
    switch (reservationTypeId) {
      case ReservationType.Corporate:
      case ReservationType.Platform:
         return (contact.companyName || contact.displayName || contact.fullName || '').trim();
      default:
        if (contact.entityTypeId === EntityType.Company) {
          return (contact.companyName || contact.displayName || contact.fullName || '').trim();
        }
        return (`${contact.firstName || ''} ${contact.lastName || ''}`).trim();
    }
  }

  getResponsiblePartyAddress1(reservation: ReservationListResponse | ReservationResponse | null | undefined, contact: ContactResponse | null): string {
    if (!contact) 
      return '';
  
    const isInternational = contact.isInternational || false;
    if (isInternational) {
      return contact?.address1 || '';
    }

    return (`${contact.address1 || ''} ${contact.address2 || ''}`).trim();
  }

  getResponsiblePartyAddress2(reservation: ReservationListResponse | ReservationResponse | null | undefined, contact: ContactResponse | null): string {
    if (!contact) 
      return '';
  
    const isInternational = contact.isInternational || false;
    if (isInternational) {
      return contact?.address2 || '';
    }

    return (`${contact.city ? `${contact.city}, ` : ''}${contact.state || ''} ${contact.zip || ''}`).trim();
  }
  
  getResponsiblePartyPhone(contact: ContactResponse | null): string {
    return this.formatterService.phoneNumber(contact?.phone) || '';
  }

  getResponsiblePartyEmail(contact: ContactResponse | null): string {
    return contact?.email || '';
  }

  getResponsiblePartyOccupant(reservation: ReservationListResponse | ReservationResponse | null, contact: ContactResponse | null): string {
    return (reservation.tenantName || '').trim();
  }

  getCompanyDropdownLabel(contact: ContactResponse | null | undefined): string {
    if (!contact) {
      return '';
    }
    return (contact.companyName || '').trim();
  }

  getVendorDropdownLabel(contact: ContactResponse | null | undefined): string {
    if (!contact) {
      return '';
    }
    const companyName = String(contact.companyName || '').trim();
    if (companyName) {
      return companyName;
    }
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
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

  //#region Upload/Image Optimization
  async optimizeUploadedImage(
    file: File,
    options?: {
      targetMinBytes?: number;
      targetMaxBytes?: number;
      maxDimension?: number;
      maxAttempts?: number;
      initialQuality?: number;
      minQuality?: number;
      qualityStep?: number;
      scaleStep?: number;
    }
  ): Promise<Blob> {
    const targetMinBytes = options?.targetMinBytes ?? this.defaultImageTargetMinBytes;
    const targetMaxBytes = options?.targetMaxBytes ?? this.defaultImageTargetMaxBytes;
    const maxDimension = options?.maxDimension ?? 1800;
    const maxAttempts = options?.maxAttempts ?? 8;
    const initialQuality = options?.initialQuality ?? 0.82;
    const minQuality = options?.minQuality ?? 0.5;
    const qualityStep = options?.qualityStep ?? 0.1;
    const scaleStep = options?.scaleStep ?? 0.85;

    if (!file.type.startsWith('image/') && !this.isHeicLikeFile(file)) {
      return file;
    }

    const normalizedFile = await this.convertHeicToJpegIfNeeded(file);
    if (normalizedFile.size <= targetMaxBytes) {
      return normalizedFile;
    }

    const image = await this.loadImageFromFile(normalizedFile);
    const largestSide = Math.max(image.width, image.height);
    const initialScale = largestSide > maxDimension ? maxDimension / largestSide : 1;
    let scale = initialScale;
    let quality = initialQuality;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nextBlob = await this.renderCompressedJpegBlob(image, scale, quality);
      if (!nextBlob) {
        break;
      }
      bestBlob = nextBlob;

      if (nextBlob.size <= targetMaxBytes && nextBlob.size >= targetMinBytes) {
        break;
      }

      if (nextBlob.size > targetMaxBytes) {
        if (quality > minQuality) {
          quality = Math.max(minQuality, quality - qualityStep);
        } else {
          scale *= scaleStep;
          quality = initialQuality;
        }
        continue;
      }

      break;
    }

    if (!bestBlob || bestBlob.size >= normalizedFile.size) {
      return normalizedFile;
    }

    return bestBlob;
  }

  isHeicLikeFile(file: File): boolean {
    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    return fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');
  }

  async convertHeicToJpegIfNeeded(file: File): Promise<File> {
    if (!this.isHeicLikeFile(file)) {
      return file;
    }

    try {
      const heic2anyModule = await import('heic2any');
      const heic2any = heic2anyModule.default;
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });

      const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(convertedBlob instanceof Blob)) {
        throw new Error('Unsupported HEIC conversion result.');
      }

      const convertedName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([convertedBlob], convertedName, { type: 'image/jpeg' });
    } catch {
      throw new Error('Unable to process HEIC image. Please convert to JPG/PNG and try again.');
    }
  }

  loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to decode image'));
      };
      image.src = objectUrl;
    });
  }

  renderCompressedJpegBlob(image: HTMLImageElement, scale: number, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
      const targetWidth = Math.max(1, Math.floor(image.width * scale));
      const targetHeight = Math.max(1, Math.floor(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }

  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  }

  fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }

  getFirstSelectedFile(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    return input.files && input.files.length > 0 ? input.files[0] : null;
  }

  async buildOptimizedUploadPayload(
    file: File,
    options?: {
      targetMinBytes?: number;
      targetMaxBytes?: number;
      fallbackContentType?: string;
    }
  ): Promise<OptimizedUploadPayload> {
    const fallbackContentType = options?.fallbackContentType || 'image/jpeg';

    try {
      const optimizedBlob = await this.optimizeUploadedImage(file, {
        targetMinBytes: options?.targetMinBytes,
        targetMaxBytes: options?.targetMaxBytes
      });
      const optimizedDataUrl = await this.blobToDataUrl(optimizedBlob);
      const optimizedContentType = optimizedBlob.type || file.type || fallbackContentType;
      const optimizedName = optimizedContentType === 'image/jpeg'
        ? file.name.replace(/\.[^/.]+$/, '.jpg')
        : file.name;
      const base64String = optimizedDataUrl.includes(',') ? optimizedDataUrl.split(',')[1] : optimizedDataUrl;
      const uploadFile = new File([optimizedBlob], optimizedName, { type: optimizedContentType });
      return {
        uploadFile,
        fileDetails: {
          contentType: optimizedContentType,
          fileName: optimizedName,
          file: base64String,
          dataUrl: optimizedDataUrl
        },
        wasOptimized: uploadFile.name !== file.name
          || uploadFile.type !== file.type
          || uploadFile.size !== file.size
      };
    } catch {
      const originalDataUrl = await this.fileToDataUrl(file);
      const base64String = originalDataUrl.includes(',') ? originalDataUrl.split(',')[1] : originalDataUrl;
      return {
        uploadFile: file,
        fileDetails: {
          contentType: file.type || fallbackContentType,
          fileName: file.name,
          file: base64String,
          dataUrl: originalDataUrl
        },
        wasOptimized: false
      };
    }
  }
  //#endregion

  //#region File Preview Helpers
  resolveFileDetailsDataUrl(fileDetails?: FileDetailsLike | null, fallbackPath?: string | null): string | null {
    if (!fileDetails) {
      return null;
    }
    const directDataUrl = String(fileDetails.dataUrl || '').trim();
    if (directDataUrl) {
      return directDataUrl;
    }
    const rawFile = String(fileDetails.file || '').trim();
    if (!rawFile) {
      return null;
    }
    if (rawFile.startsWith('data:')) {
      return rawFile;
    }
    if (!this.looksLikeBase64(rawFile)) {
      return null;
    }
    const normalizedBase64 = this.normalizeBase64(rawFile);
    const inferredContentType = this.getContentTypeFromBase64(normalizedBase64);
    const fallbackContentType = this.getContentTypeFromPath(fallbackPath);
    const contentType = inferredContentType || String(fileDetails.contentType || '').trim() || fallbackContentType || 'application/octet-stream';
    return `data:${contentType};base64,${normalizedBase64}`;
  }

  getContentTypeFromDataUrl(dataUrl: string | null | undefined): string | null {
    const match = String(dataUrl || '').trim().match(/^data:([^;]+);/i);
    return match?.[1]?.toLowerCase() || null;
  }

  normalizeBase64(value: string): string {
    const cleaned = String(value || '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const paddingNeeded = cleaned.length % 4;
    if (paddingNeeded === 0) {
      return cleaned;
    }
    return `${cleaned}${'='.repeat(4 - paddingNeeded)}`;
  }

  looksLikeBase64(value: string): boolean {
    const normalized = this.normalizeBase64(value);
    if (!normalized || normalized.length < 16 || /[^A-Za-z0-9+/=]/.test(normalized)) {
      return false;
    }
    try {
      atob(normalized);
      return true;
    } catch {
      return false;
    }
  }

  getContentTypeFromBase64(base64: string): string | null {
    const normalized = this.normalizeBase64(base64);
    if (!normalized) {
      return null;
    }
    if (normalized.startsWith('JVBERi0')) return 'application/pdf';
    if (normalized.startsWith('/9j/')) return 'image/jpeg';
    if (normalized.startsWith('iVBORw0KGgo')) return 'image/png';
    if (normalized.startsWith('R0lGOD')) return 'image/gif';
    if (normalized.startsWith('UklGR')) return 'image/webp';
    if (normalized.startsWith('PHN2Zy') || normalized.startsWith('PD94bWwg') || normalized.startsWith('PCFET0NUWVBFIGh0bWw')) return 'image/svg+xml';
    return null;
  }

  getContentTypeFromPath(path: string | null | undefined): string | null {
    const raw = String(path || '').trim();
    if (!raw) {
      return null;
    }
    const withoutQuery = raw.split('?')[0].split('#')[0];
    const normalized = withoutQuery.toLowerCase();
    if (normalized.endsWith('.pdf')) return 'application/pdf';
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.gif')) return 'image/gif';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.svg')) return 'image/svg+xml';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg') || normalized.endsWith('.jfif')) return 'image/jpeg';
    return null;
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
