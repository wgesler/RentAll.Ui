import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, finalize, map, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { UserService } from '../../users/services/user.service';
import { TicketComponent } from '../ticket/ticket.component';
import { TicketListComponent } from '../ticket-list/ticket-list.component';

@Component({
  standalone: true,
  selector: 'app-ticket-shell',
  imports: [CommonModule, FormsModule, MaterialModule, TicketListComponent, TicketComponent],
  templateUrl: './ticket-shell.component.html',
  styleUrl: './ticket-shell.component.scss'
})
export class TicketShellComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('myTicketListSection') set myTicketListSection(value: TicketListComponent | undefined) {
    this.myTicketListSectionRef = value;
    if (value) {
      this.syncFiltersToList();
    }
  }
  @ViewChild('otherTicketListSection') set otherTicketListSection(value: TicketListComponent | undefined) {
    this.otherTicketListSectionRef = value;
    if (value) {
      this.syncFiltersToList();
    }
  }
  @ViewChild('closedTicketListSection') set closedTicketListSection(value: TicketListComponent | undefined) {
    this.closedTicketListSectionRef = value;
    if (value) {
      this.syncFiltersToList();
    }
  }
  @ViewChild('ticketSection') ticketSection?: TicketComponent;
  myTicketListSectionRef?: TicketListComponent;
  otherTicketListSectionRef?: TicketListComponent;
  closedTicketListSectionRef?: TicketListComponent;

  showTicketForm = false;
  selectedTabIndex = 0;
  lastListTabIndex = 0;
  currentTicketId: string | number | null = null;
  currentTicketCode: string | null = null;
  currentUserId: string | null = null;
  currentUserAgentId: string | null = null;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  selectedOfficeNameFallback: string | null = null;
  selectedPropertyCodeFallback: string | null = null;
  selectedReservationCodeFallback: string | null = null;
  isOfficeSelectionInvalidOnSave = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  properties: PropertyCodeResponse[] = [];
  reservations: ReservationCodeResponse[] = [];
  contacts: ContactResponse[] = [];


  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'reservations', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  isPageReady = false;
  isApplyingTicketSelectionContext = false;
  destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private authService: AuthService,
    private officeService: OfficeService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private globalSelectionService: GlobalSelectionService,
    private userService: UserService,
    private utilityService: UtilityService
  ) {}

  //#region Ticket-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.currentUserId = String(this.authService.getUser()?.userId || '').trim() || null;

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadCurrentUserAgentId();
    this.loadOffices();
    this.loadProperties();
    this.loadContacts();
    this.loadReservations();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.onOfficeFilterChange(officeId);
      }
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.showTicketForm = !!id;
      this.currentTicketId = id;
      this.selectedTabIndex = this.lastListTabIndex;
    });

    this.reservationService.reservationSaved$.pipe(takeUntil(this.destroy$)).subscribe(event => {
      this.myTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
      this.otherTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
      this.closedTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
    });
  }

  onTicketSelected(event: { ticketId: string | number | null; ticketCode: string | null; propertyId: string | null; propertyCode: string | null; reservationId: string | null; reservationCode: string | null; officeId: number | null; officeName: string | null }): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) {
      return;
    }

    const isAddTicketFlow = String(event.ticketId).trim().toLowerCase() === 'new';
    if (isAddTicketFlow) {
      // Add flow must preserve title-bar filter context exactly as-is.
      this.lastListTabIndex = this.selectedTabIndex;
      this.showTicketForm = true;
      this.selectedTabIndex = this.lastListTabIndex;
      this.currentTicketId = event.ticketId;
      this.currentTicketCode = String(event.ticketCode || '').trim() || null;
      this.isApplyingTicketSelectionContext = false;
      return;
    }

    const nextOfficeId = this.normalizeOfficeId(event.officeId);
    const nextPropertyId = this.utilityService.normalizeIdOrNull(event.propertyId);
    const nextReservationId = this.utilityService.normalizeIdOrNull(event.reservationId);
    this.selectedOfficeNameFallback = this.utilityService.trimOrNull(event.officeName) ?? this.selectedOfficeNameFallback;
    this.selectedPropertyCodeFallback = this.utilityService.trimOrNull(event.propertyCode) ?? this.selectedPropertyCodeFallback;
    this.selectedReservationCodeFallback = this.utilityService.trimOrNull(event.reservationCode) ?? this.selectedReservationCodeFallback;

    this.isApplyingTicketSelectionContext = true;
    this.selectedOfficeId = nextOfficeId;
    this.resolveOfficeScope(nextOfficeId);
    this.selectedPropertyId = nextPropertyId;
    this.selectedReservationId = nextReservationId;
    this.lastListTabIndex = this.selectedTabIndex;
    this.showTicketForm = true;
    this.selectedTabIndex = this.lastListTabIndex;
    this.currentTicketId = event.ticketId;
    this.currentTicketCode = String(event.ticketCode || '').trim() || null;
    this.loadReservations(nextReservationId, nextPropertyId);
  }

  onTicketSelectedFromTab(event: { ticketId: string | number | null; ticketCode: string | null; propertyId: string | null; propertyCode: string | null; reservationId: string | null; reservationCode: string | null; officeId: number | null; officeName: string | null }, tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    this.lastListTabIndex = tabIndex;
    this.onTicketSelected(event);
  }

  onTicketBack(): void {
    this.resetShellFiltersForListReturn();
    this.showTicketForm = false;
    this.selectedTabIndex = this.lastListTabIndex;
    this.currentTicketId = null;
    this.currentTicketCode = null;
    this.router.navigateByUrl(`/${RouterUrl.TicketList}`);
  }

  onTabIndexChange(index: number): void {
    if (this.showTicketForm && index < 3) {
      this.showTicketForm = false;
      this.currentTicketId = null;
      this.currentTicketCode = null;
      this.lastListTabIndex = index;
      this.selectedTabIndex = index;
      this.router.navigateByUrl(`/${RouterUrl.TicketList}`);
      return;
    }

    this.selectedTabIndex = index;
    if (!this.showTicketForm && index < 3) {
      this.lastListTabIndex = index;
    }
  }

  onTicketSaved(): void {
    this.myTicketListSectionRef?.getTickets();
    this.otherTicketListSectionRef?.getTickets();
    this.closedTicketListSectionRef?.getTickets();
  }

  onTicketListUpdated(): void {
    this.myTicketListSectionRef?.getTickets();
    this.otherTicketListSectionRef?.getTickets();
    this.closedTicketListSectionRef?.getTickets();
  }

  onOfficeFilterChange(officeId: number | null): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    const nextOfficeId = this.normalizeOfficeId(officeId);
    const currentOfficeId = this.normalizeOfficeId(this.selectedOfficeId);
    if (nextOfficeId === currentOfficeId) {
      this.resolveOfficeScope(nextOfficeId);
      this.syncFiltersToList();
      return;
    }
    this.selectedOfficeId = nextOfficeId;
    this.isOfficeSelectionInvalidOnSave = false;
    this.resolveOfficeScope(this.selectedOfficeId);
    const isSelectedPropertyInScope = !!this.selectedPropertyId && this.getFilteredPropertiesByOffice().some(property => property.propertyId === this.selectedPropertyId);
    if (!isSelectedPropertyInScope) {
      this.selectedPropertyId = null;
    }
    this.loadReservations(this.selectedReservationId);
    this.syncFiltersToList();
  }

  onPropertyFilterChange(propertyId: string | null): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    this.selectedPropertyId = propertyId;
    if (this.selectedPropertyId) {
      this.isOfficeSelectionInvalidOnSave = false;
    }
    this.syncFiltersToList();
    this.loadReservations(this.selectedReservationId);
  }

  onReservationFilterChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.syncFiltersToList();
  }

  onTicketPropertySelectionChange(event: { propertyId: string | null; officeId: number | null; reservationId: string | null }): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    const isAddTicketFlow = String(this.currentTicketId || '').trim().toLowerCase() === 'new';
    if (isAddTicketFlow) {
      return;
    }
    const nextPropertyId = this.utilityService.normalizeIdOrNull(event.propertyId);
    const nextReservationId = this.utilityService.normalizeIdOrNull(event.reservationId);
    const nextOfficeId = this.normalizeOfficeId(event.officeId);
    const isAddInitializationClearEvent = isAddTicketFlow
      && !nextPropertyId
      && !nextReservationId
      && (nextOfficeId == null || nextOfficeId === this.selectedOfficeId);
    if (isAddInitializationClearEvent) {
      return;
    }
    this.selectedPropertyId = nextPropertyId;
    if (this.selectedPropertyId) {
      this.isOfficeSelectionInvalidOnSave = false;
    }
    this.selectedReservationId = nextReservationId;
    if (nextOfficeId != null) {
      this.selectedOfficeId = nextOfficeId;
      this.resolveOfficeScope(this.selectedOfficeId);
    }
  }

  onOfficeSelectionInvalidOnSave(): void {
    this.isOfficeSelectionInvalidOnSave = this.selectedOfficeId == null && !this.selectedPropertyId;
  }

  openAddAlertDialog(): void {
    const selectedTicketId = this.currentTicketId != null && String(this.currentTicketId).trim().toLowerCase() !== 'new'
      ? String(this.currentTicketId)
      : null;
    const selectedTicketCode = this.currentTicketCode || String(this.ticketSection?.ticketCodeDisplay || '').trim() || null;
    const ticketOfficeId = this.ticketSection?.ticket?.officeId ?? null;
    const ticketPropertyId = this.ticketSection?.ticket?.propertyId ?? null;
    const ticketReservationId = this.ticketSection?.ticket?.reservationId ?? null;
    const dialogData: AddAlertDialogData = {
      officeId: ticketOfficeId ?? this.selectedOfficeId,
      propertyId: ticketPropertyId ?? this.selectedPropertyId,
      reservationId: ticketReservationId ?? this.selectedReservationId,
      ticketId: selectedTicketId,
      ticketCode: selectedTicketCode,
      source: 'ticket'
    };
    this.dialog.open(AddAlertDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'add-alert-dialog-panel',
      data: dialogData
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadCurrentUserAgentId(): void {
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      this.currentUserAgentId = null;
      return;
    }
    this.userService.getAgentId(currentUserId).pipe(take(1)).subscribe({
      next: agentId => {
        this.currentUserAgentId = agentId;
        this.syncFiltersToList();
      },
      error: () => {
        this.currentUserAgentId = null;
      }
    });
  }

  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
          this.selectedOfficeId = this.normalizeOfficeId(this.selectedOfficeId ?? globalOfficeId ?? null);
          this.resolveOfficeScope(this.selectedOfficeId);
          this.onOfficeFilterChange(this.selectedOfficeId);
        });
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: properties => {
        const scopedByOffice = this.selectedOfficeId == null
          ? (properties || [])
          : (properties || []).filter(p => Number(p.officeId) === Number(this.selectedOfficeId));
        this.properties = scopedByOffice.slice().sort((a, b) =>
          String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
        );
        const isSelectedPropertyInScope = !!this.selectedPropertyId && this.getFilteredPropertiesByOffice().some(property => property.propertyId === this.selectedPropertyId);
        if (!isSelectedPropertyInScope) {
          this.selectedPropertyId = null;
        }
      },
      error: () => {
        this.properties = [];
      }
    });
  }

  loadReservations(preferredReservationId: string | null = this.selectedReservationId, forcedPropertyId: string | null = null): void {
    const normalizedPreferredReservationId = preferredReservationId == null || String(preferredReservationId).trim() === '' ? null : String(preferredReservationId).trim();
    const propertyIdForLoad = this.utilityService.normalizeIdOrNull(forcedPropertyId ?? this.selectedPropertyId);
    const shouldReleaseSelectionLock = this.isApplyingTicketSelectionContext;
    this.reservationService.getReservationCodes().pipe(
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
        if (shouldReleaseSelectionLock) {
          this.isApplyingTicketSelectionContext = false;
        }
      })
    ).subscribe({
      next: reservations => {
        const scopedByOffice = this.selectedOfficeId == null
          ? (reservations || [])
          : (reservations || []).filter(r => Number(r.officeId) === Number(this.selectedOfficeId));
        const scopedByProperty = propertyIdForLoad
          ? scopedByOffice.filter(r => this.utilityService.normalizeIdOrNull(r.propertyId) === this.utilityService.normalizeIdOrNull(propertyIdForLoad))
          : scopedByOffice;
        this.reservations = scopedByProperty.slice().sort((a, b) =>
          String(a.reservationCode || '').localeCompare(String(b.reservationCode || ''), undefined, { sensitivity: 'base' })
        );
        this.selectedReservationId = normalizedPreferredReservationId && this.reservations.some(r => this.utilityService.normalizeId(r.reservationId) === this.utilityService.normalizeId(normalizedPreferredReservationId))
          ? this.reservations.find(r => this.utilityService.normalizeId(r.reservationId) === this.utilityService.normalizeId(normalizedPreferredReservationId))?.reservationId ?? normalizedPreferredReservationId
          : null;
        this.syncFiltersToList();
      },
      error: () => {
        this.reservations = [];
        this.selectedReservationId = null;
        this.syncFiltersToList();
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'))).subscribe({
      next: contacts => {
        this.contacts = contacts || [];
      },
      error: () => {
        this.contacts = [];
      }
    });
  }
  //#endregion

  //#region Utility Methods
  getFilteredPropertiesByOffice(): PropertyCodeResponse[] {
    const scopedOfficeId = this.selectedOfficeId;
    if (scopedOfficeId == null) {
      return this.properties;
    }
    return (this.properties || []).filter(property => Number(property.officeId) === scopedOfficeId);
  }

  get officeFilterOptions(): { officeId: number; officeName: string }[] {
    const baseOptions = this.offices.map(office => ({ officeId: office.officeId, officeName: office.name }));
    const selectedOfficeId = this.selectedOfficeId;
    if (selectedOfficeId == null || baseOptions.some(option => option.officeId === selectedOfficeId)) {
      return baseOptions;
    }
    return [
      ...baseOptions,
      {
        officeId: selectedOfficeId,
        officeName: this.selectedOfficeNameFallback || `Office ${selectedOfficeId}`
      }
    ];
  }

  get propertyFilterOptions(): { propertyId: string; propertyCode: string }[] {
    const baseOptions = this.getFilteredPropertiesByOffice().map(property => ({ propertyId: property.propertyId, propertyCode: property.propertyCode || '' }));
    const selectedPropertyId = this.selectedPropertyId;
    if (!selectedPropertyId || baseOptions.some(option => option.propertyId === selectedPropertyId)) {
      return baseOptions;
    }
    return [
      ...baseOptions,
      {
        propertyId: selectedPropertyId,
        propertyCode: this.selectedPropertyCodeFallback || selectedPropertyId
      }
    ];
  }

  get reservationFilterOptions(): { reservationId: string; reservationCode: string }[] {
    const baseOptions = this.reservations.map(reservation => ({
      reservationId: reservation.reservationId,
      reservationCode: this.utilityService.getReservationDropdownLabel(
        reservation,
        this.contacts.find(contact => contact.contactId === reservation.contactId) ?? null
      )
    }));
    const selectedReservationId = this.selectedReservationId;
    if (!selectedReservationId || baseOptions.some(option => option.reservationId === selectedReservationId)) {
      return baseOptions;
    }
    return [
      ...baseOptions,
      {
        reservationId: selectedReservationId,
        reservationCode: this.selectedReservationCodeFallback || selectedReservationId
      }
    ];
  }

  resolveOfficeScope(officeId: number | null): void {
    const normalizedOfficeId = this.normalizeOfficeId(officeId);
    const selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, normalizedOfficeId);
    this.selectedOfficeId = selectedOffice?.officeId ?? null;
  }

  normalizeOfficeId(value: number | null | undefined): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }
    return numericValue;
  }

  resetShellFiltersForListReturn(): void {
    this.isApplyingTicketSelectionContext = false;
    this.isOfficeSelectionInvalidOnSave = false;
    this.selectedPropertyId = null;
    this.selectedReservationId = null;
    this.selectedPropertyCodeFallback = null;
    this.selectedReservationCodeFallback = null;
    this.selectedOfficeNameFallback = null;
    this.selectedOfficeId = this.normalizeOfficeId(this.globalSelectionService.getSelectedOfficeIdValue());
    this.resolveOfficeScope(this.selectedOfficeId);
    this.syncFiltersToList();
    this.loadReservations();
  }

  syncFiltersToList(): void {
    const sections = [
      this.myTicketListSectionRef,
      this.otherTicketListSectionRef,
      this.closedTicketListSectionRef
    ].filter(Boolean) as TicketListComponent[];
    if (sections.length === 0) {
      return;
    }
    sections.forEach(section => {
      section.onOfficeFilterChange(this.selectedOfficeId);
      section.onPropertyFilterChange(this.selectedPropertyId);
      section.onReservationFilterChange(this.selectedReservationId);
    });
  }

  canDeactivate(): boolean {
    return this.ticketSection?.canDeactivate() ?? true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
