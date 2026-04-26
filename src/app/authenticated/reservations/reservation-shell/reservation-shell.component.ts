import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, finalize, map, take } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceListComponent } from '../../accounting/invoice-list/invoice-list.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { LeaseComponent } from '../lease/lease.component';
import { ReservationListResponse } from '../models/reservation-model';
import { ReservationComponent } from '../reservation/reservation.component';
import { ReservationService } from '../services/reservation.service';

@Component({
  standalone: true,
  selector: 'app-reservation-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    ReservationComponent,
    TitleBarSelectComponent,
    LeaseComponent,
    InvoiceListComponent,
    EmailListComponent,
    DocumentListComponent
  ],
  templateUrl: './reservation-shell.component.html',
  styleUrl: './reservation-shell.component.scss'
})
export class ReservationShellComponent implements OnInit, AfterViewInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('reservationSection') reservationSection?: ReservationComponent;
  @ViewChild('reservationEmailList') reservationEmailList?: EmailListComponent;
  @ViewChild('reservationDocumentList') reservationDocumentList?: DocumentListComponent;

  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  selectedPropertyIdSeed: string | null = null;
  showOfficeDropdown: boolean = false;
  selectedHeaderReservationId: string | null = null;
  routeReservationId: string | null = null;
  selectedReservationSummary: ReservationListResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  availableHeaderReservations: SearchableSelectOption[] = [];
  reservationList: ReservationListResponse[] = [];
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  isAddMode: boolean = false;
  isHandlingTabGuard: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  readonly EmailType = EmailType;
  readonly DocumentType = DocumentType;
  readonly tabParamToIndex: Record<string, number> = {
    lease: 1,
    invoices: 2,
    email: 3,
    documents: 4
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private mappingService: MappingService
  ) {}

  //#region Reservation-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;

    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      this.selectedTabIndex = this.getTabIndexFromQueryParam(queryParams['tab']);
    });

    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.isAddMode = !id || id === 'new';
      this.routeReservationId = this.isAddMode ? null : id;
      this.selectedHeaderReservationId = this.routeReservationId;
      this.loadSelectedReservationContext();
      this.loadOffices();
    });

  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.onReservationLoaded());
  }
  //#endregion

  //#region Tab Interaction Methods
  async onTabIndexChange(requestedTabIndex: number): Promise<void> {
    if (this.isHandlingTabGuard) {
      return;
    }

    const previousTabIndex = this.selectedTabIndex;
    if (previousTabIndex === requestedTabIndex) {
      return;
    }

    this.isHandlingTabGuard = true;
    try {
      // Accept the emitted index first so we can deterministically revert on "Stay".
      this.selectedTabIndex = requestedTabIndex;

      if (this.reservationSection) {
        const canLeave = await this.reservationSection.confirmNavigationWithUnsavedChanges();
        if (!canLeave) {
          this.selectedTabIndex = previousTabIndex;
          return;
        }
      }

      this.refreshHeaderReservationOptions();
      this.onHeaderReservationChange();

      const tabParam = this.getTabParamFromIndex(requestedTabIndex);
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: tabParam },
        queryParamsHandling: 'merge'
      });

      if (requestedTabIndex === 3 && this.reservationEmailList) {
        this.reservationEmailList.reload();
      }
      if (requestedTabIndex === 4 && this.reservationDocumentList) {
        this.reservationDocumentList.reload();
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }
  
  getTabIndexFromQueryParam(tabParam: string | undefined): number {
    if (!tabParam) {
      return 0;
    }
    return this.tabParamToIndex[tabParam] ?? 0;
  }

  getTabParamFromIndex(tabIndex: number): string | null {
    switch (tabIndex) {
      case 1:
        return 'lease';
      case 2:
        return 'invoices';
      case 3:
        return 'email';
      case 4:
        return 'documents';
      default:
        return null;
    }
  }
  // #endregion

  //#region Header Dropdown Mehtods
  async onHeaderReservationDropdownChange(reservationId: string | number | null): Promise<void> {
    const nextReservationId = reservationId == null ? null : String(reservationId);
    const previousReservationId = this.selectedHeaderReservationId;
    this.selectedHeaderReservationId = nextReservationId;
    if (nextReservationId) {
      this.routeReservationId = nextReservationId;
    }
    this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === nextReservationId) || null;

    if (this.selectedReservationSummary?.officeId != null && this.selectedOfficeId !== this.selectedReservationSummary.officeId) {
      this.selectedOfficeId = this.selectedReservationSummary.officeId;
    }
    this.syncOfficeToSelectedPropertyOffice();

    if (this.selectedTabIndex === 0 && this.reservationSection && nextReservationId) {
      const canLeave = await this.reservationSection.confirmNavigationWithUnsavedChanges();
      if (!canLeave) {
        this.selectedHeaderReservationId = previousReservationId;
        this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === previousReservationId) || null;
        return;
      }
      this.reservationSection.loadReservation(nextReservationId);
    }

    this.onHeaderReservationChange();
  }

  onHeaderReservationChange(): void {
    const reservation = this.reservationSection;
    if (!reservation) {
      return;
    }

    if (this.selectedTabIndex === 0) {
      if (!this.selectedHeaderReservationId) {
        return;
      }
      if (reservation.reservation?.reservationId !== this.selectedHeaderReservationId) {
        reservation.loadReservation(this.selectedHeaderReservationId);
      }
      return;
    }
    if (this.selectedTabIndex === 3 && this.reservationEmailList) {
      this.reservationEmailList.reload();
    }
    if (this.selectedTabIndex === 4 && this.reservationDocumentList) {
      this.reservationDocumentList.reload();
    }
  }

  onReservationLoaded(): void {
    const reservation = this.reservationSection;
    if (!reservation) {
      return;
    }

    if (!this.routeReservationId) {
      this.routeReservationId = reservation.sharedReservationId ?? reservation.reservation?.reservationId ?? null;
    }
    this.selectedHeaderReservationId = this.routeReservationId ?? reservation.sharedReservationId ?? reservation.reservation?.reservationId ?? null;
    if (reservation.sharedOfficeId != null) {
      this.selectedOfficeId = reservation.sharedOfficeId;
      this.resolveOfficeScope(this.selectedOfficeId);
    }
    this.syncOfficeToSelectedPropertyOffice();
    this.loadReservations();
    this.refreshHeaderReservationOptions();
  }

  refreshHeaderReservationOptions(): void {
    const selectedOfficeId = this.selectedOffice?.officeId ?? this.selectedOfficeId;
    const officeFiltered = selectedOfficeId == null
      ? this.reservationList
      : this.reservationList.filter(r => r.officeId === selectedOfficeId);
    this.availableHeaderReservations = officeFiltered.map(r => ({
      value: r.reservationId,
      label: this.getReservationDropdownLabel(r)
    }));

    if (this.selectedHeaderReservationId && !officeFiltered.some(r => r.reservationId === this.selectedHeaderReservationId)) {
      this.selectedHeaderReservationId = null;
    }
    this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === this.selectedHeaderReservationId) || null;
  }
  
  get officeOptions(): SearchableSelectOption[] {
    return this.availableOffices.map(o => ({ value: o.value, label: o.name }));
  }

  get selectedPropertyId(): string | null {
    return this.selectedReservationSummary?.propertyId
      ?? this.reservationSection?.sharedPropertyId
      ?? this.reservationSection?.selectedProperty?.propertyId
      ?? this.reservationSection?.reservation?.propertyId
      ?? this.selectedPropertyIdSeed
      ?? null;
  }

  syncOfficeToSelectedPropertyOffice(): void {
    const propertyOfficeId = this.reservationSection?.sharedOfficeId
      ?? this.selectedReservationSummary?.officeId
      ?? this.reservationSection?.selectedProperty?.officeId
      ?? this.reservationSection?.reservation?.officeId
      ?? null;
    if (propertyOfficeId != null && this.selectedOfficeId !== propertyOfficeId) {
      this.selectedOfficeId = propertyOfficeId;
      this.resolveOfficeScope(this.selectedOfficeId);
    }
  }
  //#endregion

  //#region Reservation Context Getters
  get activeReservationId(): string | null {
    return this.selectedHeaderReservationId;
  }

  get selectedPropertyCode(): string {
    return this.selectedReservationSummary?.propertyCode ?? this.reservationSection?.sharedPropertyCode ?? 'Code';
  }

  get selectedOfficeName(): string {
    const officeId = this.displayOfficeId;
    return this.selectedOffice?.name ?? this.offices.find(office => office.officeId === officeId)?.name ?? '';
  }

  get displayOfficeId(): number | null {
    return this.reservationSection?.sharedOfficeId ?? this.selectedOfficeId ?? null;
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        if (this.selectedOfficeId != null) {
          this.resolveOfficeScope(this.selectedOfficeId);
          this.showOfficeDropdown = this.offices.length > 1;
          this.refreshHeaderReservationOptions();
          return;
        }
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.selectedOfficeId, useGlobalSelection: false, requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.selectedOfficeId = uiState.selectedOfficeId;
            this.resolveOfficeScope(this.selectedOfficeId);
            this.refreshHeaderReservationOptions();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.selectedOfficeId = null;
        this.selectedOffice = null;
      }
    });
  }

  loadSelectedReservationContext(): void {
    if (!this.routeReservationId || this.isAddMode) {
      return;
    }

    this.reservationService.getReservationByGuid(this.routeReservationId).pipe(take(1)).subscribe({
      next: reservation => {
        if (reservation?.officeId == null) {
          return;
        }
        this.selectedOfficeId = reservation.officeId;
        this.selectedPropertyIdSeed = reservation.propertyId ?? null;
        this.resolveOfficeScope(this.selectedOfficeId);
        this.refreshHeaderReservationOptions();
        this.loadReservations();
      },
      error: () => {}
    });
  }

  loadReservations(): void {
    const propertyId = this.selectedPropertyId;
    if (propertyId) {
      this.loadReservationsByPropertyId(propertyId);
      return;
    }

    const reservationIdForPropertyLookup = this.selectedHeaderReservationId ?? this.routeReservationId ?? this.reservationSection?.sharedReservationId ?? null;
    if (reservationIdForPropertyLookup) {
      this.reservationService.getReservationByGuid(reservationIdForPropertyLookup).pipe(take(1)).subscribe({
        next: reservation => {
          if (reservation?.propertyId) {
            this.loadReservationsByPropertyId(reservation.propertyId);
            return;
          }
          this.reservationList = [];
          this.availableHeaderReservations = [];
          this.selectedReservationSummary = null;
        },
        error: () => {
          this.reservationList = [];
          this.availableHeaderReservations = [];
          this.selectedReservationSummary = null;
        }
      });
      return;
    }

    this.reservationList = [];
    this.availableHeaderReservations = [];
    this.selectedReservationSummary = null;
  }

  loadReservationsByPropertyId(propertyId: string): void {
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: reservations => {
        this.reservationList = reservations || [];
        if (!this.selectedHeaderReservationId) {
          const currentReservationId = this.routeReservationId ?? this.reservationSection?.sharedReservationId ?? this.reservationSection?.reservation?.reservationId ?? null;
          if (currentReservationId && this.reservationList.some(r => r.reservationId === currentReservationId)) {
            this.selectedHeaderReservationId = currentReservationId;
          }
        }
        this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === this.selectedHeaderReservationId) || null;
        const selectedPropertyOfficeId = this.reservationSection?.sharedOfficeId
          ?? this.selectedReservationSummary?.officeId
          ?? null;
        if (selectedPropertyOfficeId != null) {
          this.selectedOfficeId = selectedPropertyOfficeId;
          this.resolveOfficeScope(this.selectedOfficeId);
        }
        this.syncOfficeToSelectedPropertyOffice();
        this.refreshHeaderReservationOptions();
      },
      error: () => {
        this.reservationList = [];
        this.availableHeaderReservations = [];
      }
    });
  }
  //#endregion

  //#region Utility Methods
  getReservationDropdownLabel(reservation: ReservationListResponse): string {
    const contacts = this.reservationSection?.contacts || [];
    const contact = contacts.find(c => c.contactId === reservation.contactId) || null;
    return this.utilityService.getReservationDropdownLabel(reservation, contact);
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  canDeactivate(): Promise<boolean> | boolean {
    return this.reservationSection?.canDeactivate() ?? true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
