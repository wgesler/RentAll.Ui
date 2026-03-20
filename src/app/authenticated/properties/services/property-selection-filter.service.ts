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
  if (nonZero(s.fromBeds) || nonZero(s.toBeds) || nonZero(s.accomodates) || nonZero(s.maxRent)) {
    return true;
  }
  if (hasText(s.propertyCode) || hasText(s.city) || hasText(s.state)) {
    return true;
  }
  if (
    s.unfurnished ||
    s.cable ||
    s.streaming ||
    s.pool ||
    s.jacuzzi ||
    s.security ||
    s.parking ||
    s.pets ||
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

  getDateRangeValue(): { startDate: Date | null; endDate: Date | null } {
    return this._dateRange.value;
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
}
