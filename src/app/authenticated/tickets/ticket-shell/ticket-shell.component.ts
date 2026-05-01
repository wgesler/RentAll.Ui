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
  @ViewChild('ticketListSection') set ticketListSection(value: TicketListComponent | undefined) {
    this.ticketListSectionRef = value;
    if (value) {
      this.syncFiltersToList();
    }
  }
  @ViewChild('ticketSection') ticketSection?: TicketComponent;
  ticketListSectionRef?: TicketListComponent;

  showTicketForm = false;
  currentTicketId: string | number | null = null;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
  properties: PropertyListResponse[] = [];
  reservations: ReservationListResponse[] = [];
  contacts: ContactResponse[] = [];
  showOfficeDropdown = false;
  globalOfficeSubscription?: Subscription;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'reservations', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  isPageReady = false;
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
    private utilityService: UtilityService
  ) {}

  //#region Ticket-Shell
  ngOnInit(): void {
    this.loadOffices();
    this.loadProperties();
    this.loadContacts();
    this.loadReservations();

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.showTicketForm = !!id;
      this.currentTicketId = id;
    });
  }

  onTicketSelected(ticketId: string | number | null): void {
    if (ticketId === null || ticketId === undefined) {
      return;
    }

    this.showTicketForm = true;
    this.currentTicketId = ticketId;
    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Ticket, [String(ticketId)])}`);
  }

  onTicketBack(): void {
    this.showTicketForm = false;
    this.currentTicketId = null;
    this.router.navigateByUrl(`/${RouterUrl.TicketList}`);
  }

  onTicketSaved(): void {
    this.ticketListSectionRef?.getTickets();
  }

  onOfficeFilterChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.resolveOfficeScope(officeId);
    this.syncFiltersToList();
  }

  onPropertyFilterChange(propertyId: string | null): void {
    this.selectedPropertyId = propertyId;
    this.selectedReservationId = null;
    this.syncFiltersToList();
    this.loadReservations();
  }

  onReservationFilterChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.syncFiltersToList();
  }

  onTicketPropertySelectionChange(event: { propertyId: string | null; officeId: number | null }): void {
    this.selectedPropertyId = event.propertyId;
    if (event.officeId != null) {
      this.selectedOfficeId = event.officeId;
      this.resolveOfficeScope(this.selectedOfficeId);
    }
    this.selectedReservationId = null;
    this.loadReservations();
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
  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId?.trim();
    if (!orgId) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.selectedOffice = null;
      this.showOfficeDropdown = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.getOffices(orgId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: offices => {
        this.offices = offices || [];
        this.showOfficeDropdown = this.offices.length > 1;
        const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
        this.selectedOfficeId = this.selectedOfficeId ?? globalOfficeId ?? null;
        this.resolveOfficeScope(this.selectedOfficeId);
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
        this.selectedOffice = null;
        this.showOfficeDropdown = false;
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

  loadReservations(): void {
    if (this.selectedPropertyId) {
      this.reservationService.getReservationsByPropertyId(this.selectedPropertyId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))).subscribe({
        next: reservations => {
          this.reservations = (reservations || []).slice().sort((a, b) =>
            String(a.reservationCode || '').localeCompare(String(b.reservationCode || ''), undefined, { sensitivity: 'base' })
          );
          if (this.selectedReservationId && !this.reservations.some(r => r.reservationId === this.selectedReservationId)) {
            this.selectedReservationId = null;
            this.syncFiltersToList();
          }
        },
        error: () => {
          this.reservations = [];
          this.selectedReservationId = null;
          this.syncFiltersToList();
        }
      });
      return;
    }

    this.reservationService.getReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))).subscribe({
      next: reservations => {
        this.reservations = (reservations || []).slice().sort((a, b) =>
          String(a.reservationCode || '').localeCompare(String(b.reservationCode || ''), undefined, { sensitivity: 'base' })
        );
      },
      error: () => {
        this.reservations = [];
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
  get officeFilterOptions(): { officeId: number; officeName: string }[] {
    return this.offices.map(office => ({ officeId: office.officeId, officeName: office.name }));
  }

  get propertyFilterOptions(): { propertyId: string; propertyCode: string }[] {
    return this.properties.map(property => ({ propertyId: property.propertyId, propertyCode: property.propertyCode || '' }));
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
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
  }

  syncFiltersToList(): void {
    if (!this.ticketListSectionRef) {
      return;
    }
    this.ticketListSectionRef.onOfficeFilterChange(this.selectedOfficeId);
    this.ticketListSectionRef.onPropertyFilterChange(this.selectedPropertyId);
    this.ticketListSectionRef.onReservationFilterChange(this.selectedReservationId);
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
