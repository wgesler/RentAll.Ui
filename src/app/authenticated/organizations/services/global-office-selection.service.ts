import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, take } from 'rxjs';
import { OfficeResponse } from '../models/office.model';
import { OfficeService } from './office.service';

export interface OfficeUiStateOptions {
  explicitOfficeId?: number | null;
  useGlobalSelection?: boolean;
  disableSingleOfficeRule?: boolean;
  requireExplicitOfficeUnset?: boolean;
  requireResolvedSelectionEmpty?: boolean;
}

export interface OfficeUiState {
  selectedOfficeId: number | null;
  selectedOffice: OfficeResponse | null;
  showOfficeDropdown: boolean;
  autoSelectedOfficeId: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class GlobalOfficeSelectionService {
  private readonly storageKey = 'rentall.globalOfficeId';
  private selectedOfficeId$ = new BehaviorSubject<number | null>(this.readFromStorage());

  constructor(private officeService: OfficeService) {}

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

  ensureOfficeScope(organizationId: string, preferredOfficeId: number | null = null): Observable<number | null> {
    return this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1), map(offices => this.syncWithAvailableOffices((offices || []).filter(office => office.isActive), preferredOfficeId)));
  }

  refreshOfficeScope(organizationId: string, preferredOfficeId: number | null = null): Observable<number | null> {
    return this.officeService.refreshOffices(organizationId).pipe(take(1), map(offices => this.syncWithAvailableOffices((offices || []).filter(office => office.isActive), preferredOfficeId)));
  }

  getOfficeUiState$(offices: OfficeResponse[], options: OfficeUiStateOptions = {}): Observable<OfficeUiState> {
    return this.getSelectedOfficeId$().pipe(
      take(1),
      map(globalOfficeId => {
        const explicitOfficeId = options.explicitOfficeId ?? null;
        const useGlobalSelection = options.useGlobalSelection ?? true;
        const fallbackGlobalOfficeId = useGlobalSelection ? globalOfficeId : null;
        const resolvedSelectionId = explicitOfficeId ?? fallbackGlobalOfficeId;
        const selectedOffice = offices.find(office => office.officeId === resolvedSelectionId) || null;
        const singleOfficeRuleApplies = !(options.disableSingleOfficeRule ?? false) && offices.length === 1;
        const explicitOfficeUnset = explicitOfficeId === null;
        const requireExplicitOfficeUnset = options.requireExplicitOfficeUnset ?? false;
        const requireResolvedSelectionEmpty = options.requireResolvedSelectionEmpty ?? false;
        const autoSelectSingleOffice = singleOfficeRuleApplies
          && (!requireExplicitOfficeUnset || explicitOfficeUnset)
          && (!requireResolvedSelectionEmpty || selectedOffice === null);
        const autoSelectedOfficeId = autoSelectSingleOffice ? offices[0].officeId : null;
        const selectedOfficeId = selectedOffice?.officeId ?? autoSelectedOfficeId;

        return {
          selectedOfficeId,
          selectedOffice: offices.find(office => office.officeId === selectedOfficeId) || null,
          showOfficeDropdown: !autoSelectSingleOffice,
          autoSelectedOfficeId
        };
      })
    );
  }

  readFromStorage(): number | null {
    const rawValue = localStorage.getItem(this.storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  writeToStorage(officeId: number | null): void {
    if (officeId === null) {
      localStorage.removeItem(this.storageKey);
      return;
    }

    localStorage.setItem(this.storageKey, officeId.toString());
  }
}
