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
  @ViewChild('documentsTabList') documentsTabList?: DocumentListComponent;

  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
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
  documentRequest: DocumentGetRequest = { officeIds: [] };
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
    this.setDefaultDateRange();
    this.syncDocumentRequest();
  }

  //#region Documents-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(event => {
      const currentPath = event.urlAfterRedirects.split('?')[0];
      if (currentPath.endsWith('/documents')) {
        this.selectedReservationId = null;
        this.refreshReservationOptions();
        this.reloadDocumentsList();
      }
    });

    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
      this.selectedReservationId = null;
      this.refreshPropertyOptions();
      this.refreshReservationOptions();
      this.syncDocumentRequest();
      queueMicrotask(() => {
        this.documentsTabList?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      });
      this.reloadDocumentsList();
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.refreshPropertyOptions();
    this.refreshReservationOptions();
    this.selectedReservationId = null;
    this.syncDocumentRequest();
    this.reloadDocumentsList();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    this.selectedPropertyId = value == null || value === '' ? null : String(value);
    this.refreshReservationOptions();
    this.syncDocumentRequest();
    this.reloadDocumentsList();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
    this.selectedPropertyId = this.selectedReservationSummary?.propertyId ?? this.selectedPropertyId;
    this.syncDocumentRequest();
    this.reloadDocumentsList();
  }

  onDocumentTypeDropdownChange(value: string | number | null): void {
    this.documentsTabList?.onDocumentTypeDropdownChange(value);
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate) {
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

    this.syncDocumentRequest();
    this.reloadDocumentsList();
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

  get selectedDocumentTypeId(): number | null {
    return this.documentsTabList?.selectedDocumentTypeId ?? null;
  }

  get selectedPropertyCode(): string {
    const selectedProperty = this.properties.find(property => property.propertyId === this.selectedPropertyId) || null;
    if (selectedProperty?.propertyCode) {
      return selectedProperty.propertyCode;
    }
    return this.selectedReservationSummary?.propertyCode || 'Code';
  }

  applyShellOfficeScope(): void {
    this.showOfficeDropdown = this.offices.length > 1;
    let officeIdToUse = this.selectedOfficeId;
    if (officeIdToUse != null && !this.offices.some(o => o.officeId === officeIdToUse)) {
      officeIdToUse = null;
    }
    if (this.offices.length === 1) {
      officeIdToUse = this.offices[0].officeId;
    }
    this.selectedOfficeId = officeIdToUse;
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 0) {
      this.selectedOfficeId = officeId;
      return;
    }
    this.showOfficeDropdown = this.offices.length > 1;
    if (this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
      return;
    }
    const resolved = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.selectedOfficeId = resolved != null && this.offices.some(o => o.officeId === resolved) ? resolved : null;
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
          this.applyShellOfficeScope();
          this.refreshPropertyOptions();
          this.refreshReservationOptions();
          this.syncDocumentRequest();
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.selectedOfficeId = null;
        this.refreshPropertyOptions();
        this.refreshReservationOptions();
        this.syncDocumentRequest();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1)).subscribe({
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

  reloadDocumentsList(): void {
    this.documentsTabList?.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
