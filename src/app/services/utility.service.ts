import { Injectable } from '@angular/core';
import { ReservationListResponse } from '../authenticated/reservation/models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class UtilityService {
  constructor() { }

  // Removes an item from an itemsToLoad array
  removeLoadItem(itemsToLoad: string[], itemToRemove: string): string[] {
    return itemsToLoad.filter(item => item !== itemToRemove);
  }

  // Gets formatted reservation label for display in dropdowns and lists
  getReservationLabel(reservation: ReservationListResponse): string {
    const code = reservation.reservationCode || reservation.reservationId.substring(0, 8);
    const contactName = reservation.contactName || 'N/A';
    return `${code}: ${contactName}`;
  }
}
