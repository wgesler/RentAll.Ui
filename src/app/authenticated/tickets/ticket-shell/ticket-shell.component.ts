import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, Subscription, finalize, map, skip, take, takeUntil } from 'rxjs';
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
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
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
  currentTicketId: string | number | null = null;
  currentUserId: string | null = null;
  currentUserAgentId: string | null = null;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  isOfficeSelectionInvalidOnSave = false;
  offices: OfficeResponse[] = [];
  properties: PropertyListResponse[] = [];
  reservations: ReservationListResponse[] = [];
  contacts: ContactResponse[] = [];
  globalOfficeSubscription?: Subscription;


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
    this.currentUserId = String(this.authService.getUser()?.userId || '').trim() || null;

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadCurrentUserAgentId();
    this.loadOffices();
    this.loadProperties();
    this.loadContacts();
    this.loadReservations();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.onOfficeFilterChange(officeId);
      }
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.showTicketForm = !!id;
      this.currentTicketId = id;
    });

    this.reservationService.reservationSaved$.pipe(takeUntil(this.destroy$)).subscribe(event => {
      this.myTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
      this.otherTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
      this.closedTicketListSectionRef?.syncTicketsForReservation(event.reservationId);
    });
  }

  onTicketSelected(event: { ticketId: string | number | null; propertyId: string | null; reservationId: string | null; officeId: number | null }): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) {
      return;
    }

    const nextOfficeId = event.officeId ?? null;
    const nextPropertyId = this.utilityService.normalizeIdOrNull(event.propertyId);
    const nextReservationId = this.utilityService.normalizeIdOrNull(event.reservationId);

    this.isApplyingTicketSelectionContext = true;
    this.selectedOfficeId = nextOfficeId;
    this.resolveOfficeScope(nextOfficeId);
    this.selectedPropertyId = nextPropertyId;
    this.selectedReservationId = nextReservationId;
    this.loadReservations(nextReservationId, nextPropertyId);

    this.showTicketForm = true;
    this.currentTicketId = event.ticketId;
    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Ticket, [String(event.ticketId)])}`);
  }

  onTicketBack(): void {
    this.showTicketForm = false;
    this.currentTicketId = null;
    this.router.navigateByUrl(`/${RouterUrl.TicketList}`);
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
    this.selectedOfficeId = officeId;
    this.isOfficeSelectionInvalidOnSave = false;
    this.resolveOfficeScope(officeId);
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
    this.selectedPropertyId = this.utilityService.normalizeIdOrNull(event.propertyId);
    if (this.selectedPropertyId) {
      this.isOfficeSelectionInvalidOnSave = false;
    }
    this.selectedReservationId = this.utilityService.normalizeIdOrNull(event.reservationId);
    if (event.officeId != null) {
      this.selectedOfficeId = event.officeId;
      this.resolveOfficeScope(this.selectedOfficeId);
    }
  }

  onOfficeSelectionInvalidOnSave(): void {
    this.isOfficeSelectionInvalidOnSave = this.selectedOfficeId == null && !this.selectedPropertyId;
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.selectedOfficeId,
      propertyId: this.selectedPropertyId,
      reservationId: this.selectedReservationId,
      source: 'reservation'
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
    const orgId = this.authService.getUser()?.organizationId?.trim();
    if (!orgId) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.getOffices(orgId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: offices => {
        this.offices = offices || [];
        const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
        this.selectedOfficeId = this.selectedOfficeId ?? globalOfficeId ?? null;
        this.onOfficeFilterChange(this.selectedOfficeId);
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: properties => {
        this.properties = (properties || []).slice().sort((a, b) =>
          String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
        );
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
    if (propertyIdForLoad) {
      this.reservationService.getReservationsByPropertyId(propertyIdForLoad).pipe(
        take(1),
        finalize(() => {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
          if (shouldReleaseSelectionLock) {
            this.isApplyingTicketSelectionContext = false;
          }
        })
      ).subscribe({
        next: reservations => {
          this.reservations = (reservations || []).slice().sort((a, b) =>
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
      return;
    }

    this.reservationService.getReservationList().pipe(
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
        if (shouldReleaseSelectionLock) {
          this.isApplyingTicketSelectionContext = false;
        }
      })
    ).subscribe({
      next: reservations => {
        this.reservations = (reservations || []).slice().sort((a, b) =>
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
  getFilteredPropertiesByOffice(): PropertyListResponse[] {
    if (this.selectedOfficeId == null) {
      return this.properties;
    }
    return (this.properties || []).filter(property => property.officeId === this.selectedOfficeId);
  }

  get officeFilterOptions(): { officeId: number; officeName: string }[] {
    return this.offices.map(office => ({ officeId: office.officeId, officeName: office.name }));
  }

  get propertyFilterOptions(): { propertyId: string; propertyCode: string }[] {
    return this.getFilteredPropertiesByOffice().map(property => ({ propertyId: property.propertyId, propertyCode: property.propertyCode || '' }));
  }

  get reservationFilterOptions(): { reservationId: string; reservationCode: string }[] {
    return this.reservations.map(reservation => ({
      reservationId: reservation.reservationId,
      reservationCode: this.utilityService.getReservationDropdownLabel(
        reservation,
        this.contacts.find(contact => contact.contactId === reservation.contactId) ?? null
      )
    }));
  }

  resolveOfficeScope(officeId: number | null): void {
    const selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.selectedOfficeId = selectedOffice?.officeId ?? null;
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
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
