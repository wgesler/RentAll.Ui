import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import {BehaviorSubject, Subject, finalize, skip, take, takeUntil} from 'rxjs';
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
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
  standalone: true,
  selector: 'app-ticket-shell',
  imports: [CommonModule, FormsModule, MaterialModule, TitleBarSelectComponent, TicketListComponent, TicketComponent],
  templateUrl: './ticket-shell.component.html',
  styleUrl: './ticket-shell.component.scss'
})
export class TicketShellComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private globalSelectionService = inject(GlobalSelectionService);
  private userService = inject(UserService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

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
  /** Page-level office filter: seeded from global; does not write global. */
  private initialOfficeScopeApplied = false;
  properties: PropertyCodeResponse[] = [];
  reservations: ReservationCodeResponse[] = [];
  private allProperties: PropertyCodeResponse[] = [];
  private allReservations: ReservationCodeResponse[] = [];
  contacts: ContactResponse[] = [];


  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isApplyingTicketSelectionContext = false;
  destroy$ = new Subject<void>();

  //#region Ticket-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.currentUserId = String(this.authService.getUser()?.userId || '').trim() || null;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
    });
    
    this.loadCurrentUserAgentId();
    this.loadOffices();
    this.loadPropertyCodes();
    this.loadContacts();
    this.loadReservationCodes();

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
  //#endregion

  //#region Form Response Methods
  onTicketSelected(event: { ticketId: string | number | null; ticketCode: string | null; propertyId: string | null; propertyCode: string | null; reservationId: string | null; reservationCode: string | null; officeId: number | null; officeName: string | null }): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) {
      return;
    }

    const isAddTicketFlow = event.ticketId === 'new';
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
    this.refreshReservationScope(nextReservationId, nextPropertyId);
    this.syncFiltersToList();
    this.markViewForCheck();
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

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    this.applyPageOfficeChangeEffects();
  }

  applyPageOfficeChangeEffects(): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    const nextOfficeId = this.normalizeOfficeId(this.selectedOfficeId);
    this.isOfficeSelectionInvalidOnSave = false;
    this.resolveOfficeScope(nextOfficeId);
    this.refreshPropertyScope();
    this.refreshReservationScope(this.selectedReservationId);
    this.syncFiltersToList();
    this.markViewForCheck();
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    this.applyPageOfficeScope(this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    }));
    this.applyPageOfficeChangeEffects();
  }

  applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = this.normalizeOfficeId(officeId);
  }

  onPropertyFilterChange(propertyId: string | null): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    this.selectedPropertyId = propertyId;
    if (this.selectedPropertyId) {
      this.isOfficeSelectionInvalidOnSave = false;
    }
    this.refreshReservationScope(this.selectedReservationId);
    this.syncFiltersToList();
    this.markViewForCheck();
  }

  onReservationFilterChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.syncFiltersToList();
    this.markViewForCheck();
  }

  onTicketPropertySelectionChange(event: { propertyId: string | null; officeId: number | null; reservationId: string | null }): void {
    if (this.isApplyingTicketSelectionContext) {
      return;
    }
    const isAddTicketFlow = this.currentTicketId === 'new';
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
    const selectedTicketId = this.currentTicketId != null && this.currentTicketId !== 'new'
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
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(
            o => o.organizationId === this.organizationId && o.isActive
          );

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(
                this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
              );
            }
          } else if (this.selectedOfficeId != null) {
            this.applyPageOfficeScope(this.selectedOfficeId);
          }
          this.syncFiltersToList();
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.allProperties = properties || [];
            this.refreshPropertyScope();
            this.markViewForCheck();
          },
          error: () => {
            this.allProperties = [];
            this.properties = [];
            this.markViewForCheck();
          }
        });
      }
    });
  }

  loadReservationCodes(): void {
    this.reservationService.getReservationCodes().pipe(take(1)).subscribe({
      next: reservations => {
        this.allReservations = reservations || [];
        this.refreshReservationScope(this.selectedReservationId);
        this.markViewForCheck();
      },
      error: () => {
        this.allReservations = [];
        this.reservations = [];
        this.selectedReservationId = null;
        this.markViewForCheck();
      }
    });
  }

  refreshPropertyScope(): void {
    const scopedByOffice = this.selectedOfficeId == null
      ? this.allProperties
      : this.allProperties.filter(property => Number(property.officeId) === Number(this.selectedOfficeId));
    this.properties = scopedByOffice.slice().sort((a, b) =>
      String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
    );
    const isSelectedPropertyInScope = !!this.selectedPropertyId
      && this.properties.some(property => property.propertyId === this.selectedPropertyId);
    if (!isSelectedPropertyInScope) {
      this.selectedPropertyId = null;
    }
  }

  refreshReservationScope(
    preferredReservationId: string | null = this.selectedReservationId,
    forcedPropertyId: string | null = null
  ): void {
    const normalizedPreferredReservationId = preferredReservationId == null || String(preferredReservationId).trim() === ''
      ? null
      : String(preferredReservationId).trim();
    const propertyIdForScope = this.utilityService.normalizeIdOrNull(forcedPropertyId ?? this.selectedPropertyId);
    const scopedByOffice = this.selectedOfficeId == null
      ? this.allReservations
      : this.allReservations.filter(reservation => Number(reservation.officeId) === Number(this.selectedOfficeId));
    const scopedByProperty = propertyIdForScope
      ? scopedByOffice.filter(reservation => this.utilityService.normalizeIdOrNull(reservation.propertyId) === propertyIdForScope)
      : scopedByOffice;
    this.reservations = scopedByProperty.slice().sort((a, b) =>
      String(a.reservationCode || '').localeCompare(String(b.reservationCode || ''), undefined, { sensitivity: 'base' })
    );
    this.selectedReservationId = normalizedPreferredReservationId
      && this.reservations.some(reservation => this.utilityService.normalizeId(reservation.reservationId) === this.utilityService.normalizeId(normalizedPreferredReservationId))
      ? this.reservations.find(reservation => this.utilityService.normalizeId(reservation.reservationId) === this.utilityService.normalizeId(normalizedPreferredReservationId))?.reservationId ?? normalizedPreferredReservationId
      : null;

    if (this.isApplyingTicketSelectionContext) {
      this.isApplyingTicketSelectionContext = false;
    }
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
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
  syncPageReadyFromLoadItems(): void {
    this.isPageReady = this.itemsToLoad$.value.size === 0;
    this.cdr.markForCheck();
  }

  getFilteredPropertiesByOffice(): PropertyCodeResponse[] {
    const scopedOfficeId = this.selectedOfficeId;
    if (scopedOfficeId == null) {
      return this.properties;
    }
    return (this.properties || []).filter(property => Number(property.officeId) === scopedOfficeId);
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.officeFilterOptions.map(office => ({
      value: office.officeId,
      label: office.officeName
    }));
  }

  get showOfficeDropdown(): boolean {
    return this.offices.length > 0;
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
    this.applyPageOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue());
    this.resolveOfficeScope(this.selectedOfficeId);
    this.refreshPropertyScope();
    this.refreshReservationScope();
    this.syncFiltersToList();
    this.markViewForCheck();
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

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
