import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter, skip, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { getDocumentTypes } from '../models/document.enum';
import { DocumentGetRequest } from '../models/document.model';
import { DocumentListComponent } from '../document-list/document-list.component';

@Component({
  standalone: true,
  selector: 'app-documents-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TitleBarSelectComponent,
    DocumentListComponent
  ],
  templateUrl: './documents-shell.component.html',
  styleUrl: './documents-shell.component.scss'
})
export class DocumentsShellComponent implements OnInit, OnDestroy {
  private readonly clearPinsEventName = 'rentall-clear-pins';
  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-documents-shell-pinned-dates';

  @ViewChild('documentsTabList') documentsTabList?: DocumentListComponent;

  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  selectedDocumentTypeId: number | null = null;
  selectedReservationSummary: ReservationCodeResponse | null = null;

  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  properties: PropertyCodeResponse[] = [];
  availableProperties: SearchableSelectOption[] = [];
  reservations: ReservationCodeResponse[] = [];
  availableReservations: SearchableSelectOption[] = [];

  organizationId = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRangePinned = false;
  documentRequest: DocumentGetRequest = { officeIds: [] };
  private initialOfficeScopeApplied = false;
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private propertyService: PropertyService,
    private reservationService: ReservationService
  ) {
    this.applyPinnedDateRangeFromStorage();
    this.syncDocumentRequest();
  }

  //#region Documents-Shell
  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(event => {
      const currentPath = event.urlAfterRedirects.split('?')[0];
      if (currentPath.endsWith('/documents')) {
        if (!this.dateRangePinned) {
          this.selectedReservationId = null;
        }
        this.refreshReservationOptions();
        this.syncDocumentRequest();
      }
    });

    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
      if (!this.dateRangePinned) {
        this.selectedReservationId = null;
      }
      this.applyPageOfficeChangeEffects();
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    this.selectedReservationId = null;
    this.persistPinnedTopBarIfActive();
    this.applyPageOfficeChangeEffects();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    this.selectedPropertyId = value == null || value === '' ? null : String(value);
    this.refreshReservationOptions();
    this.persistPinnedTopBarIfActive();
    this.syncDocumentRequest();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
    this.selectedPropertyId = this.selectedReservationSummary?.propertyId ?? this.selectedPropertyId;
    this.persistPinnedTopBarIfActive();
    this.syncDocumentRequest();
  }

  onDocumentTypeDropdownChange(value: string | number | null): void {
    this.selectedDocumentTypeId = value == null || value === '' ? null : Number(value);
    this.documentsTabList?.onDocumentTypeDropdownChange(value);
    this.persistPinnedTopBarIfActive();
    this.syncDocumentRequest();
  }

  private persistPinnedTopBarIfActive(): void {
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate && !this.dateRangePinned) {
      this.setDefaultDateRange();
    } else if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }

    this.persistPinnedTopBarIfActive();

    this.syncDocumentRequest();
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get propertyOptions(): SearchableSelectOption[] {
    return this.availableProperties;
  }

  get reservationOptions(): SearchableSelectOption[] {
    return this.availableReservations;
  }

  get documentTypeOptions(): SearchableSelectOption[] {
    return getDocumentTypes().map(type => ({
      value: type.value,
      label: type.label
    }));
  }

  get selectedPropertyCode(): string {
    const selectedProperty = this.properties.find(property => property.propertyId === this.selectedPropertyId) || null;
    if (selectedProperty?.propertyCode) {
      return selectedProperty.propertyCode;
    }
    return this.selectedReservationSummary?.propertyCode || 'Code';
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    const previousOfficeId = this.selectedOfficeId;
    this.showOfficeDropdown = this.offices.length > 1;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
    if (!this.dateRangePinned && previousOfficeId !== this.selectedOfficeId) {
      this.selectedReservationId = null;
    }
  }

  /** Title-bar office change on this page only (never updates global selection). */
  applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    if (officeId != null && this.offices.length > 0 && !this.offices.some(o => o.officeId === officeId)) {
      this.selectedOfficeId = null;
    } else if (!this.dateRangePinned && this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
    }
  }

  applyPageOfficeChangeEffects(): void {
    this.refreshPropertyOptions();
    this.refreshReservationOptions();
    this.syncDocumentRequest();
  }

  refreshReservationOptions(): void {
    const officeFilteredReservations = this.selectedOfficeId == null
      ? this.reservations
      : this.reservations.filter(reservation => reservation.officeId === this.selectedOfficeId);
    const filteredReservations = this.selectedPropertyId == null
      ? officeFilteredReservations
      : officeFilteredReservations.filter(reservation => reservation.propertyId === this.selectedPropertyId);
    this.availableReservations = filteredReservations.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));

    if (this.selectedReservationId && !filteredReservations.some(reservation => reservation.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
    }
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
  }

  refreshPropertyOptions(): void {
    const filteredProperties = this.selectedOfficeId == null
      ? this.properties
      : this.properties.filter(property => property.officeId === this.selectedOfficeId);
    this.availableProperties = filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));
    if (this.selectedPropertyId && !filteredProperties.some(property => property.propertyId === this.selectedPropertyId)) {
      this.selectedPropertyId = null;
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            this.applyOfficeFromGlobal(this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue());
          } else if (this.selectedOfficeId != null) {
            this.applyPageOfficeScope(this.selectedOfficeId);
          } else {
            this.showOfficeDropdown = this.offices.length > 1;
          }
          this.applyPageOfficeChangeEffects();
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.selectedOfficeId = null;
        this.syncDocumentRequest();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.properties = properties || [];
            this.refreshPropertyOptions();
          },
          error: () => {
            this.properties = [];
            this.availableProperties = [];
            this.selectedPropertyId = null;
          }
        });
      }
    });
  }

  loadReservationCodes(): void {
    this.reservationService.getReservationCodes().pipe(take(1)).subscribe({
      next: reservations => {
        this.reservations = reservations || [];
        this.refreshReservationOptions();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
        this.selectedReservationId = null;
        this.selectedReservationSummary = null;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  setDefaultDateRange(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - 30);

    this.endDate = end;
    this.startDate = start;
  }

  syncDocumentRequest(): void {
    this.documentRequest = {
      officeIds: this.resolveOfficeIdsForRequest(),
      propertyId: this.selectedPropertyId,
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  private resolveOfficeIdsForRequest(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }

    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }

  //#region Pinned Date Range
  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      this.onDateRangeChange();
      this.persistPinnedDateRange();
      return;
    }
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    this.selectedDocumentTypeId = null;
    this.selectedReservationId = null;
    this.applyPageOfficeChangeEffects();
    this.onDateRangeChange();
  }

  applyPinnedDateRangeFromStorage(): void {
    const stored = this.readPinnedDateRangeFromStorage();
    if (stored?.enabled && stored.startDate && stored.endDate) {
      const start = this.utilityService.parseCalendarDateInput(stored.startDate);
      const end = this.utilityService.parseCalendarDateInput(stored.endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.dateRangePinned = true;
        this.startDate = start;
        this.endDate = end;
        this.selectedOfficeId = stored.officeId ?? null;
        this.selectedPropertyId = stored.propertyId ?? null;
        this.selectedReservationId = stored.reservationId ?? null;
        this.selectedDocumentTypeId = stored.documentTypeId ?? null;
        return;
      }
      this.clearPinnedDateRangeStorage();
    }

    this.dateRangePinned = false;
    this.setDefaultDateRange();
  }

  persistPinnedDateRange(): void {
    if (!this.dateRangePinned || !this.startDate || !this.endDate) {
      return;
    }

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }

    localStorage.setItem(this.getPinnedDateRangeStorageKey(), JSON.stringify({
      enabled: true,
      startDate,
      endDate,
      officeId: this.selectedOfficeId,
      propertyId: this.selectedPropertyId,
      reservationId: this.selectedReservationId,
      documentTypeId: this.selectedDocumentTypeId
    }));
  }

  readPinnedDateRangeFromStorage(): { enabled: boolean; startDate: string; endDate: string; officeId: number | null; propertyId: string | null; reservationId: string | null; documentTypeId: number | null } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getPinnedDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; startDate?: string; endDate?: string; officeId?: number | null; propertyId?: string | null; reservationId?: string | null; documentTypeId?: number | null };
      if (parsed?.enabled !== true || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      const officeId = parsed.officeId == null || parsed.officeId === undefined ? null : Number(parsed.officeId);
      const documentTypeId = parsed.documentTypeId == null || parsed.documentTypeId === undefined ? null : Number(parsed.documentTypeId);
      return {
        enabled: true,
        startDate: String(parsed.startDate),
        endDate: String(parsed.endDate),
        officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null,
        propertyId: parsed.propertyId == null || parsed.propertyId === '' ? null : String(parsed.propertyId),
        reservationId: parsed.reservationId == null || parsed.reservationId === '' ? null : String(parsed.reservationId),
        documentTypeId: Number.isFinite(documentTypeId) && documentTypeId > 0 ? documentTypeId : null
      };
    } catch {
      return null;
    }
  }

  clearPinnedDateRangeStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getPinnedDateRangeStorageKey());
  }

  getPinnedDateRangeStorageKey(): string {
    const userKey = this.authService.getUser()?.userId?.trim() || 'anonymous';
    return `${this.pinnedDateRangeStorageKeyPrefix}-${userKey}`;
  }

  onClearPins = (): void => {
    if (!this.dateRangePinned) {
      return;
    }
    this.dateRangePinned = false;
    this.clearPinnedDateRangeStorage();
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    this.selectedReservationId = null;
    this.applyPageOfficeChangeEffects();
  };
  //#endregion

  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
