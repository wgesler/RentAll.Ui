import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, switchMap, take } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../models/office.model';
import { AccountingOfficeService } from './accounting-office.service';
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
export class GlobalSelectionService {
  private readonly officeStorageKey = 'rentall.globalOfficeId';
  private readonly furnishedPropertyStorageKey = 'rentall.furnishedPropertySelection';
  private selectedOfficeId$ = new BehaviorSubject<number | null>(this.readOfficeIdFromStorage());
  /** false = furnished-only (non-unfurnished); true = unfurnished-only. Reset on login / clear session. */
  private furnishedPropertySelection$ = new BehaviorSubject<boolean>(this.readFurnishedPropertySelectionFromStorage());

  constructor(
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private authService: AuthService
  ) {}

  getSelectedOfficeId$(): Observable<number | null> {
    return this.selectedOfficeId$.asObservable();
  }

  getSelectedOfficeIdValue(): number | null {
    return this.selectedOfficeId$.value;
  }

  setSelectedOfficeId(officeId: number | null): void {
    this.selectedOfficeId$.next(officeId);
    this.writeOfficeIdToStorage(officeId);
  }

  getFurnishedPropertySelection(): boolean {
    return this.furnishedPropertySelection$.value;
  }

  getFurnishedPropertySelection$(): Observable<boolean> {
    return this.furnishedPropertySelection$.asObservable();
  }

  setFurnishedPropertySelection(value: boolean): void {
    const v = value === true;
    this.furnishedPropertySelection$.next(v);
    this.writeFurnishedPropertySelectionToStorage(v);
  }

  resetFurnishedPropertySelection(): void {
    this.furnishedPropertySelection$.next(false);
    localStorage.removeItem(this.furnishedPropertyStorageKey);
  }

  syncWithAvailableOffices(offices: OfficeResponse[], preferredOfficeId: number | null = null): number | null {
    const accessibleOffices = this.filterOfficeListForUser(offices || []);
    if (!accessibleOffices.length) {
      this.setSelectedOfficeId(null);
      return null;
    }

    if (preferredOfficeId !== null && accessibleOffices.some(office => office.officeId === preferredOfficeId)) {
      this.setSelectedOfficeId(preferredOfficeId);
      return preferredOfficeId;
    }

    const currentSelection = this.getSelectedOfficeIdValue();
    if (currentSelection !== null && accessibleOffices.some(office => office.officeId === currentSelection)) {
      return currentSelection;
    }

    if (accessibleOffices.length === 1) {
      const singleOfficeId = accessibleOffices[0].officeId;
      this.setSelectedOfficeId(singleOfficeId);
      return singleOfficeId;
    }

    this.setSelectedOfficeId(null);
    return null;
  }

  ensureOfficeScope(organizationId: string, preferredOfficeId: number | null = null): Observable<number | null> {
    return this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1), switchMap(offices => this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), map(() => this.syncWithAvailableOffices((offices || []).filter(office => office.isActive), preferredOfficeId)))));
  }

  refreshOfficeScope(organizationId: string, preferredOfficeId: number | null = null): Observable<number | null> {
    return this.officeService.refreshOffices(organizationId).pipe(take(1), switchMap(offices => this.accountingOfficeService.refreshAccountingOffices().pipe(take(1), map(() => this.syncWithAvailableOffices((offices || []).filter(office => office.isActive), preferredOfficeId)))));
  }

  getOfficeUiState$(offices: OfficeResponse[], options: OfficeUiStateOptions = {}): Observable<OfficeUiState> {
    return this.getSelectedOfficeId$().pipe(
      take(1),
      map(globalOfficeId => {
        const accessibleOffices = this.filterOfficeListForUser(offices || []);
        const explicitOfficeId = options.explicitOfficeId ?? null;
        const useGlobalSelection = options.useGlobalSelection ?? true;
        const fallbackGlobalOfficeId = useGlobalSelection ? globalOfficeId : null;
        const resolvedSelectionId = explicitOfficeId ?? fallbackGlobalOfficeId;
        const selectedOffice = accessibleOffices.find(office => office.officeId === resolvedSelectionId) || null;
        const singleOfficeRuleApplies = !(options.disableSingleOfficeRule ?? false) && accessibleOffices.length === 1;
        const explicitOfficeUnset = explicitOfficeId === null;
        const requireExplicitOfficeUnset = options.requireExplicitOfficeUnset ?? false;
        const requireResolvedSelectionEmpty = options.requireResolvedSelectionEmpty ?? false;
        const autoSelectSingleOffice = singleOfficeRuleApplies
          && (!requireExplicitOfficeUnset || explicitOfficeUnset)
          && (!requireResolvedSelectionEmpty || selectedOffice === null);
        const autoSelectedOfficeId = autoSelectSingleOffice ? accessibleOffices[0].officeId : null;
        const selectedOfficeId = selectedOffice?.officeId ?? autoSelectedOfficeId;

        return {
          selectedOfficeId,
          selectedOffice: accessibleOffices.find(office => office.officeId === selectedOfficeId) || null,
          showOfficeDropdown: accessibleOffices.length > 1,
          autoSelectedOfficeId
        };
      })
    );
  }

  filterOfficeListForUser(offices: OfficeResponse[]): OfficeResponse[] {
    const source = offices || [];
    const officeAccessArray = this.authService.getUser()?.officeAccess || [];
    const officeAccessSet = new Set(
      officeAccessArray
        .map((id: unknown) => Number(id))
        .filter(id => Number.isFinite(id) && id > 0)
    );

    if (officeAccessSet.size === 0) {
      return source;
    }

    return source.filter(office => officeAccessSet.has(Number(office.officeId)));
  }

  private readOfficeIdFromStorage(): number | null {
    const rawValue = localStorage.getItem(this.officeStorageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return null;
    }
    return parsedValue;
  }

  private writeOfficeIdToStorage(officeId: number | null): void {
    if (officeId === null) {
      localStorage.removeItem(this.officeStorageKey);
      return;
    }

    localStorage.setItem(this.officeStorageKey, officeId.toString());
  }

  private readFurnishedPropertySelectionFromStorage(): boolean {
    const rawValue = localStorage.getItem(this.furnishedPropertyStorageKey);
    if (rawValue == null || rawValue === '') {
      return false;
    }
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
      return true;
    }
    return false;
  }

  private writeFurnishedPropertySelectionToStorage(value: boolean): void {
    if (!value) {
      localStorage.removeItem(this.furnishedPropertyStorageKey);
    } else {
      localStorage.setItem(this.furnishedPropertyStorageKey, 'true');
    }
  }
}
