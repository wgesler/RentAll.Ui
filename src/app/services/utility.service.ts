import { Injectable } from '@angular/core';
import { CheckinTimes, CheckoutTimes } from '../authenticated/property/models/property-enums';

@Injectable({
  providedIn: 'root'
})
export class UtilityService {
  constructor() { }

  // Removes an item from an itemsToLoad array
  removeLoadItem(itemsToLoad: string[], itemToRemove: string): string[] {
    return itemsToLoad.filter(item => item !== itemToRemove);
  }

  //***************** Check-in/Check-out Times ***********************/
  // Gets the check-in time label string from a CheckinTimes enum value
  getCheckInTime(checkInTimeId: number | undefined): string {
    if (!checkInTimeId) return '';
    
    const timeMap: { [key: number]: string } = {
      [CheckinTimes.NA]: 'N/A',
      [CheckinTimes.TwelvePM]: '12:00 PM',
      [CheckinTimes.OnePM]: '1:00 PM',
      [CheckinTimes.TwoPM]: '2:00 PM',
      [CheckinTimes.ThreePM]: '3:00 PM',
      [CheckinTimes.FourPM]: '4:00 PM',
      [CheckinTimes.FivePM]: '5:00 PM'
    };
    
    return timeMap[checkInTimeId] || '';
  }

  // Gets the check-out time label string from a CheckoutTimes enum value
  getCheckOutTime(checkOutTimeId: number | undefined): string {
    if (!checkOutTimeId) return '';
    
    const timeMap: { [key: number]: string } = {
      [CheckoutTimes.NA]: 'N/A',
      [CheckoutTimes.EightAM]: '8:00 AM',
      [CheckoutTimes.NineAM]: '9:00 AM',
      [CheckoutTimes.TenAM]: '10:00 AM',
      [CheckoutTimes.ElevenAM]: '11:00 AM',
      [CheckoutTimes.TwelvePM]: '12:00 PM',
      [CheckoutTimes.OnePM]: '1:00 PM'
    };
    
    return timeMap[checkOutTimeId] || '';
  }

  // Gets the array of check-in time options for dropdowns
  getCheckInTimes(): { value: number, label: string }[] {
    return [
      { value: CheckinTimes.NA, label: 'N/A' },
      { value: CheckinTimes.TwelvePM, label: '12:00 PM' },
      { value: CheckinTimes.OnePM, label: '1:00 PM' },
      { value: CheckinTimes.TwoPM, label: '2:00 PM' },
      { value: CheckinTimes.ThreePM, label: '3:00 PM' },
      { value: CheckinTimes.FourPM, label: '4:00 PM' },
      { value: CheckinTimes.FivePM, label: '5:00 PM' }
    ];
  }

  // Gets the array of check-out time options for dropdowns
  getCheckOutTimes(): { value: number, label: string }[] {
    return [
      { value: CheckoutTimes.NA, label: 'N/A' },
      { value: CheckoutTimes.EightAM, label: '8:00 AM' },
      { value: CheckoutTimes.NineAM, label: '9:00 AM' },
      { value: CheckoutTimes.TenAM, label: '10:00 AM' },
      { value: CheckoutTimes.ElevenAM, label: '11:00 AM' },
      { value: CheckoutTimes.TwelvePM, label: '12:00 PM' },
      { value: CheckoutTimes.OnePM, label: '1:00 PM' }
    ];
  }

  // Normalizes check-in time ID to a number for API requests (defaults to NA if null/undefined)
  normalizeCheckInTimeId(value: number | null | undefined): number {
    if (value !== null && value !== undefined) {
      return Number(value);
    }
    return CheckinTimes.NA;
  }

  // Normalizes check-out time ID to a number for API requests (defaults to NA if null/undefined)
  normalizeCheckOutTimeId(value: number | null | undefined): number {
    if (value !== null && value !== undefined) {
      return Number(value);
    }
    return CheckoutTimes.NA;
  }
}
