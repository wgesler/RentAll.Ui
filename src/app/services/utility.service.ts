import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ContactResponse } from '../authenticated/contacts/models/contact.model';
import { EntityType } from '../authenticated/contacts/models/contact-enum';
import { ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import { ReservationType } from '../authenticated/reservations/models/reservation-enum';
import { UserGroups } from '../authenticated/users/models/user-enums';

@Injectable({
  providedIn: 'root'
})
export class UtilityService {
  constructor() { }

  // Adds an item to a BehaviorSubject<Set<string>>
  addLoadItem(itemsToLoad$: BehaviorSubject<Set<string>>, key: string): void {
    const currentSet = itemsToLoad$.value;
    if (!currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.add(key);
      itemsToLoad$.next(newSet);
    }
  }

  // Removes an item from a BehaviorSubject<Set<string>>
  removeLoadItemFromSet(itemsToLoad$: BehaviorSubject<Set<string>>, key: string): void {
    const currentSet = itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      itemsToLoad$.next(newSet);
    }
  }

  resolveSelectedOfficeById<T extends { officeId: number }>(offices: T[], officeId: number | null): T | null {
    if (!offices?.length) {
      return null;
    }
    if (officeId !== null) {
      return offices.find(office => office.officeId === officeId) || null;
    }
    return offices.length === 1 ? offices[0] : null;
  }

  // Gets formatted reservation label for display in dropdowns and lists
  getReservationLabel(reservation: ReservationListResponse): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    const contactName = reservation.contactName || 'N/A';
    return `${code}: ${contactName}`;
  }

  // Generates document file name for saving/downloading documents
   generateDocumentFileName(type: 'lease' | 'welcomeLetter' | 'invoice' | 'inspection' | 'inventory', propertyCode?: string, reservationCode?: string): string {
    let fileName = '';

    switch (type) {
      case 'lease':
        fileName = `Lease_${propertyCode}_${reservationCode}_${this.getFilenameTimestamp()}.pdf`;
        break;
      case 'welcomeLetter':
         fileName = `Letter_${propertyCode}_${reservationCode}_${this.getFilenameTimestamp()}.pdf`;
        break;
      case 'invoice':
        fileName = `Invoice_${propertyCode}_${reservationCode}_${this.getFilenameTimestamp()}.pdf`;
        break;
      case 'inspection':
        fileName = `Inspection_${propertyCode}_${this.getFilenameTimestamp()}.pdf`;
        break;
      case 'inventory':
        fileName = `Inventory_${propertyCode}_${this.getFilenameTimestamp()}.pdf`;
        break;
    }

    return fileName;
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
  
  hasRole(groups: Array<string | number> | undefined, role: UserGroups): boolean {
    if (!groups || groups.length === 0) {
      return false;
    }

    return groups.some(group => {
      if (typeof group === 'string') {
        if (group === UserGroups[role]) {
          return true;
        }
        const parsed = Number(group);
        return !isNaN(parsed) && parsed === role;
      }
      return typeof group === 'number' && group === role;
    });
  }

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

  /** Display name for reservation board: company/contact name (corporate vs individual). */
  getReservationDisplayName(reservation: ReservationListResponse, contact: ContactResponse | null): string {
    const shortCompanyName = contact?.displayName || this.getCompanyDisplayToken(contact?.companyName ?? reservation.companyName);
    const contactName = reservation.contactName ?? (contact ? (contact.firstName + ' ' + contact.lastName).trim() : '');
    const isCorporate = (reservation.reservationTypeId === ReservationType.Corporate || contact?.entityTypeId === EntityType.Company);
    if (isCorporate) {
      return [shortCompanyName, reservation.tenantName].filter(Boolean).join(' ');
    }
    return [shortCompanyName, contactName].filter(Boolean).join(' ');
  }

  /** Label for reservation dropdown: ReservationCode: getReservationDisplayName(). */
  getReservationDropdownLabel(reservation: ReservationListResponse, contact: ContactResponse | null): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    return `${code}: ${this.getReservationDisplayName(reservation, contact)}`;
  }
}
