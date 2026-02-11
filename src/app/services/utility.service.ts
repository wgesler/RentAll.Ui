import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ReservationListResponse } from '../authenticated/reservations/models/reservation-model';

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

  // Gets formatted reservation label for display in dropdowns and lists
  getReservationLabel(reservation: ReservationListResponse): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    const contactName = reservation.contactName || 'N/A';
    return `${code}: ${contactName}`;
  }

  // Generates document file name for saving/downloading documents
   generateDocumentFileName(type: 'lease' | 'welcomeLetter' | 'invoice', code?: string): string {
    let fileName = '';
     
    switch (type) {
      case 'lease':
        fileName = `Lease_${code}.pdf`;
        break;
      case 'welcomeLetter':
         fileName = `Letter_${code}.pdf`;
        break;
      case 'invoice':
        fileName = `Invoice_${code}.pdf`;
        break;
    }
    
    return fileName;
  }
}
