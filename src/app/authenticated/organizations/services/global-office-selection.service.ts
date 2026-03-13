import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OfficeResponse } from '../models/office.model';

@Injectable({
  providedIn: 'root'
})
export class GlobalOfficeSelectionService {
  private readonly storageKey = 'rentall.globalOfficeId';
  private selectedOfficeId$ = new BehaviorSubject<number | null>(this.readFromStorage());

  getSelectedOfficeId$(): Observable<number | null> {
    return this.selectedOfficeId$.asObservable();
  }

  getSelectedOfficeIdValue(): number | null {
    return this.selectedOfficeId$.value;
  }

  setSelectedOfficeId(officeId: number | null): void {
    this.selectedOfficeId$.next(officeId);
    this.writeToStorage(officeId);
  }

  syncWithAvailableOffices(offices: OfficeResponse[], preferredOfficeId: number | null = null): number | null {
    if (!offices?.length) {
      this.setSelectedOfficeId(null);
      return null;
    }

    // When user has a default office (e.g. from JWT or profile), use it to initialize the dropdown
    if (preferredOfficeId !== null && offices.some(office => office.officeId === preferredOfficeId)) {
      this.setSelectedOfficeId(preferredOfficeId);
      return preferredOfficeId;
    }

    const currentSelection = this.getSelectedOfficeIdValue();
    if (currentSelection !== null && offices.some(office => office.officeId === currentSelection)) {
      return currentSelection;
    }

    // Keep the previous UX for single-office users.
    if (offices.length === 1) {
      const singleOfficeId = offices[0].officeId;
      this.setSelectedOfficeId(singleOfficeId);
      return singleOfficeId;
    }

    this.setSelectedOfficeId(null);
    return null;
  }

  private readFromStorage(): number | null {
    const rawValue = localStorage.getItem(this.storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private writeToStorage(officeId: number | null): void {
    if (officeId === null) {
      localStorage.removeItem(this.storageKey);
      return;
    }

    localStorage.setItem(this.storageKey, officeId.toString());
  }
}
