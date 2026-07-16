import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PropertySelectionResponse } from '../models/property-selection.model';

/** True when saved property selection is not the default (all filters off / "All"). */
export function isPropertySelectionFiltered(s: PropertySelectionResponse | null | undefined): boolean {
  if (!s) {
    return false;
  }
  if (s.propertyStatusId != null && Number(s.propertyStatusId) !== 0) {
    return true;
  }
  if (
    nonZero(s.fromUnitLevel) ||
    nonZero(s.toUnitLevel) ||
    nonZero(s.fromBeds) ||
    nonZero(s.toBeds) ||
    nonZero(s.accomodates) ||
    nonZero(s.maxRent)
  ) {
    return true;
  }
  if (hasText(s.propertyCode) || hasText(s.city) || hasText(s.state)) {
    return true;
  }
  if (s.propertyLeaseTypeId != null && Number(s.propertyLeaseTypeId) !== 0) {
    return true;
  }
  if (s.propertyTypeId != null && Number(s.propertyTypeId) !== 0) {
    return true;
  }
  if (
    s.cable ||
    s.streaming ||
    s.pool ||
    s.jacuzzi ||
    s.security ||
    s.parking ||
    s.pets ||
    s.dogsOkay ||
    s.catsOkay ||
    s.smoking ||
    s.highSpeedInternet
  ) {
    return true;
  }
  if (hasText(s.officeCode)) {
    return true;
  }
  if ((s.buildingCodes?.length ?? 0) > 0 || (s.regionCodes?.length ?? 0) > 0 || (s.areaCodes?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

function nonZero(n: number | null | undefined): boolean {
  return n != null && Number(n) !== 0;
}

function hasText(v: string | null | undefined): boolean {
  return (v ?? '').toString().trim().length > 0;
}

@Injectable({ providedIn: 'root' })
export class PropertySelectionFilterService {
  private readonly stickySelectionStorageKeyPrefix = 'rentall-property-selection-sticky';
  private readonly _propertiesFiltered = new BehaviorSubject<boolean>(false);
  private readonly _dateRange = new BehaviorSubject<{ startDate: Date | null; endDate: Date | null }>({ startDate: null, endDate: null });
  private selectionFiltersApplied = false;
  private dateRangeApplied = false;

  /** Emits whether the user's saved property selection applies any non-default filters. */
  readonly propertiesFiltered$: Observable<boolean> = this._propertiesFiltered.asObservable();
  readonly dateRange$: Observable<{ startDate: Date | null; endDate: Date | null }> = this._dateRange.asObservable();

  get propertiesFiltered(): boolean {
    return this._propertiesFiltered.value;
  }

  setFromResponse(response: PropertySelectionResponse | null | undefined): void {
    this.selectionFiltersApplied = isPropertySelectionFiltered(response);
    this._propertiesFiltered.next(this.selectionFiltersApplied || this.dateRangeApplied);
  }

  setDateRange(startDate: Date | null, endDate: Date | null): void {
    this.dateRangeApplied = !!startDate || !!endDate;
    this._dateRange.next({ startDate, endDate });
    this._propertiesFiltered.next(this.selectionFiltersApplied || this.dateRangeApplied);
  }

  clear(): void {
    this.selectionFiltersApplied = false;
    this.dateRangeApplied = false;
    this._dateRange.next({ startDate: null, endDate: null });
    this._propertiesFiltered.next(false);
  }

  isSelectionSticky(userId: string | null | undefined): boolean {
    return this.readStickySelectionFromStorage(userId)?.enabled === true;
  }

  setSelectionSticky(userId: string | null | undefined, enabled: boolean): void {
    const userKey = userId?.trim();
    if (!userKey) {
      return;
    }

    if (enabled) {
      localStorage.setItem(this.getStickySelectionStorageKey(userKey), JSON.stringify({ enabled: true }));
      return;
    }

    this.clearSelectionStickyStorage(userKey);
  }

  clearSelectionStickyStorage(userId: string | null | undefined): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const userKey = userId?.trim();
    if (!userKey) {
      return;
    }

    localStorage.removeItem(this.getStickySelectionStorageKey(userKey));
  }

readStickySelectionFromStorage(userId: string | null | undefined): { enabled: boolean } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const userKey = userId?.trim();
    if (!userKey) {
      return null;
    }

    const rawValue = localStorage.getItem(this.getStickySelectionStorageKey(userKey));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean };
      if (parsed?.enabled !== true) {
        return null;
      }
      return { enabled: true };
    } catch {
      return null;
    }
  }

getStickySelectionStorageKey(userId: string): string {
    return `${this.stickySelectionStorageKeyPrefix}-${userId}`;
  }
}
