import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, concatMap, filter, finalize, from, map, switchMap, take, toArray } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationService } from '../../reservations/services/reservation.service';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { hasCompanyRole } from '../../shared/access/role-access';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { getTicketStateType, getTicketStateTypes, TicketStateType } from '../models/ticket-enum';
import {
  TicketAssigneeDropdownCell,
  TicketListDisplay,
  TicketOfficeFilterOption,
  TicketPropertyFilterOption,
  TicketReservationFilterOption
} from '../models/ticket-models';
import { TicketService } from '../services/ticket.service';

@Component({
  standalone: true,
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class TicketListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Input() assigneeFilterMode: 'all' | 'assignedToMe' | 'assignedToMeInAssignedState' | 'assignedToMeNotInAssignedState' | 'allOthers' | 'closed' = 'all';
  @Input() currentUserId: string | null = null;
  @Input() currentUserAgentId: string | null = null;
  @Input() showListFiltersAndActions: boolean = true;
  @Output() ticketSelected = new EventEmitter<{ ticketId: string | number | null; propertyId: string | null; reservationId: string | null; officeId: number | null }>();
  @Output() ticketUpdated = new EventEmitter<void>();

  isServiceError: boolean = false;
  showInactive = false;
  isPageReady: boolean = false;
  selectedOfficeId: number | null = null;
  selectedOffice: TicketOfficeFilterOption | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  allTickets: TicketListDisplay[] = [];
  ticketsDisplay: TicketListDisplay[] = [];
  ticketStateTypeOptions = getTicketStateTypes().map(state => state.label);
  officeFilterOptions: TicketOfficeFilterOption[] = [];
  propertyFilterOptions: TicketPropertyFilterOption[] = [];
  reservationFilterOptions: TicketReservationFilterOption[] = [];
  users: UserResponse[] = [];
  hasLoadedTickets = false;
  isSyncingLatestAgents = false;

  ticketsDisplayedColumns: ColumnSet = {
    'ticketCode': { displayAs: 'Ticket', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'created': { displayAs: 'Created', maxWidth: '18ch', alignment: 'center' },
    'modified': { displayAs: 'Modified', maxWidth: '18ch', alignment: 'center'  },
    'ticketStateTypeText': { displayAs: 'State', maxWidth: '18ch' },
    'assigneeDropdown': { displayAs: 'Assignee', maxWidth: '20ch' },
    'agentName': { displayAs: 'Agent', maxWidth: '20ch' },
    'title': { displayAs: 'Title', maxWidth: '25ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
 };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['tickets', 'users']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private ticketService: TicketService,
    private reservationService: ReservationService,
    private userService: UserService,
    private utilityService: UtilityService
  ) {}

  //#region Ticket-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      this.isPageReady = true;
    });

    this.loadUsers();
    this.getTickets();
  }

  addTicket(): void {
    if (this.embeddedInSettings) {
      this.ticketSelected.emit({ ticketId: 'new', propertyId: null, reservationId: null, officeId: this.selectedOfficeId });
      return;
    }

    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Ticket, ['new'])}`);
  }

  getTickets(): void {
    this.ticketService.getTickets().pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'tickets'))).subscribe({
      next: (tickets) => {
        this.isServiceError = false;
        this.allTickets = (tickets || []).map(ticket => this.withAssigneeDropdownCell(this.mappingService.mapTicketToDisplay(ticket, this.ticketStateTypeOptions)));
        this.hasLoadedTickets = true;
        this.rebuildFilterOptions();
        this.rebuildAssigneeDropdowns();
        this.applyFilters();
        this.syncLatestAgentsFromReservations();
      },
      error: () => {
        this.isServiceError = true;
        this.allTickets = [];
        this.ticketsDisplay = [];
      }
    });
  }

  deleteTicket(event: TicketListDisplay): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) {
      return;
    }

    this.ticketService.deleteTicket(event.ticketId).pipe(take(1)).subscribe({
      next: () => {
        this.allTickets = this.allTickets.filter(ticket => ticket.ticketId !== event.ticketId);
        this.rebuildFilterOptions();
        this.applyFilters();
        this.toastr.success('Ticket deleted successfully', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to delete ticket.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onTicketDropdownChange(event: TicketListDisplay): void {
    const changedDropdownColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedDropdownColumn === 'ticketStateTypeText') {
      this.onTicketStateDropdownChange(event);
      return;
    }
    if (changedDropdownColumn === 'assigneeDropdown') {
      this.onTicketAssigneeDropdownChange(event);
    }
  }

  goToTicket(event: TicketListDisplay): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) return;

    if (this.embeddedInSettings) {
      this.ticketSelected.emit({
        ticketId: event.ticketId,
        propertyId: String(event.propertyId || '').trim() || null,
        reservationId: String(event.reservationId || '').trim() || null,
        officeId: event.officeId ?? null
      });
      return;
    }

    this.router.navigateByUrl(
      `/${RouterUrl.replaceTokens(RouterUrl.Ticket, [String(event.ticketId)])}`,
      { state: { ticket: event } }
    );
  }

  goToProperty(event: TicketListDisplay): void {
    const propertyId = String(event?.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Property, [propertyId])}`);
  }

  goToReservation(event: TicketListDisplay): void {
    const reservationId = String(event?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }
    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}`);
  }

  onTicketStateDropdownChange(event: TicketListDisplay): void {
    const changedDropdownColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedDropdownColumn !== 'ticketStateTypeText') {
      return;
    }

    const selectedStateLabel = String(event.ticketStateTypeText?.value || '').trim();
    if (!selectedStateLabel) {
      return;
    }

    const selectedState = getTicketStateTypes().find(state => state.label === selectedStateLabel);
    if (!selectedState || selectedState.value === event.ticketStateTypeId) {
      return;
    }
    const sourceTicket = this.allTickets.find(ticket => ticket.ticketId === event.ticketId) || null;
    if (!sourceTicket) {
      return;
    }

    const previousStateId = event.ticketStateTypeId;
    const previousAssigneeId = this.utilityService.normalizeIdOrNull(event.assigneeId ?? null);
    const previousAssigneeLabel = previousAssigneeId
      ? this.getAssigneeCandidatesForOffice(event.officeId ?? null).find(option => option.userId === previousAssigneeId)?.displayName || 'Unassigned'
      : 'Unassigned';
    const stateDecision = this.confirmTicketState({
      currentStateTypeId: selectedState.value,
      previousStateTypeId: previousStateId,
      assigneeChanged: false,
      currentAssigneeId: previousAssigneeId,
      hasReservation: !!this.utilityService.normalizeIdOrNull(sourceTicket.reservationId ?? null),
      areAllCommunicationCheckboxesChecked: this.areAllCommunicationCheckboxesChecked(sourceTicket)
    });
    if (!stateDecision.isAllowed) {
      this.applyTicketStateValue(event.ticketId, previousStateId);
      this.openCannotCloseDialog();
      return;
    }

    const nextAssigneeId = stateDecision.assigneeId;
    const nextAssigneeLabel = nextAssigneeId
      ? this.getAssigneeCandidatesForOffice(event.officeId ?? null).find(option => option.userId === nextAssigneeId)?.displayName || 'Unassigned'
      : 'Unassigned';
    if (nextAssigneeId !== previousAssigneeId) {
      this.applyTicketAssigneeValue(event.ticketId, nextAssigneeId, nextAssigneeLabel);
    }
    this.applyTicketStateValue(event.ticketId, stateDecision.ticketStateTypeId);
    this.ticketService.updateTicket(this.mappingService.mapTicketUpdateRequest(sourceTicket, {
      ticketStateTypeId: stateDecision.ticketStateTypeId,
      assigneeId: nextAssigneeId
    })).pipe(take(1)).subscribe({
      next: () => {
        this.ticketService.notifyTicketStateChanged();
        this.getTickets();
        this.ticketUpdated.emit();
        this.toastr.success('Ticket state updated.', CommonMessage.Success);
      },
      error: () => {
        if (nextAssigneeId !== previousAssigneeId) {
          this.applyTicketAssigneeValue(event.ticketId, previousAssigneeId, previousAssigneeLabel);
        }
        this.applyTicketStateValue(event.ticketId, previousStateId);
        this.toastr.error('Unable to update ticket state.', CommonMessage.Error);
      }
    });
  }

  onTicketAssigneeDropdownChange(event: TicketListDisplay): void {
    const changedDropdownColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedDropdownColumn !== 'assigneeDropdown') {
      return;
    }

    const selectedAssigneeLabel = this.getAssigneeLabel(event);
    const nextAssigneeId = this.getAssigneeIdByLabel(selectedAssigneeLabel, event.officeId ?? null);
    const previousAssigneeId = this.utilityService.normalizeIdOrNull(event.assigneeId ?? null);
    if (nextAssigneeId === previousAssigneeId) {
      return;
    }

    const previousAssigneeLabel = previousAssigneeId
      ? this.getAssigneeCandidatesForOffice(event.officeId ?? null).find(option => option.userId === previousAssigneeId)?.displayName || 'Unassigned'
      : 'Unassigned';
    const previousStateId = event.ticketStateTypeId;
    const sourceTicket = this.allTickets.find(ticket => ticket.ticketId === event.ticketId) || null;
    if (!sourceTicket) {
      return;
    }
    const stateDecision = this.confirmTicketState({
      currentStateTypeId: previousStateId,
      previousStateTypeId: previousStateId,
      assigneeChanged: true,
      currentAssigneeId: nextAssigneeId,
      hasReservation: !!this.utilityService.normalizeIdOrNull(sourceTicket.reservationId ?? null),
      areAllCommunicationCheckboxesChecked: this.areAllCommunicationCheckboxesChecked(sourceTicket)
    });
    const nextStateTypeId = stateDecision.ticketStateTypeId;
    const resolvedAssigneeId = stateDecision.assigneeId;
    const resolvedAssigneeLabel = resolvedAssigneeId
      ? this.getAssigneeCandidatesForOffice(event.officeId ?? null).find(option => option.userId === resolvedAssigneeId)?.displayName || selectedAssigneeLabel
      : 'Unassigned';
    this.applyTicketAssigneeValue(event.ticketId, resolvedAssigneeId, resolvedAssigneeLabel);
    this.applyTicketStateValue(event.ticketId, nextStateTypeId);
    const updateRequest = this.mappingService.mapTicketUpdateRequest(sourceTicket, {
      assigneeId: resolvedAssigneeId
    });
    updateRequest.ticketStateTypeId = nextStateTypeId;
    this.ticketService.updateTicket(updateRequest).pipe(take(1)).subscribe({
      next: () => {
        this.ticketService.notifyTicketStateChanged();
        this.getTickets();
        this.ticketUpdated.emit();
        this.toastr.success('Ticket assignee updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyTicketAssigneeValue(event.ticketId, previousAssigneeId, previousAssigneeLabel);
        this.applyTicketStateValue(event.ticketId, previousStateId);
        this.toastr.error('Unable to update ticket assignee.', CommonMessage.Error);
      }
    });
  }

  onTicketCheckboxChange(event: TicketListDisplay): void {
    const changedCheckboxColumn = (event as unknown as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as unknown as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as unknown as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }
    const sourceTicket = this.allTickets.find(ticket => ticket.ticketId === event.ticketId) || null;
    if (!sourceTicket) {
      return;
    }

    this.applyTicketIsActiveValue(event.ticketId, nextValue);
    this.ticketService.updateTicket(this.mappingService.mapTicketUpdateRequest(sourceTicket, { isActive: nextValue })).pipe(take(1)).subscribe({
      next: () => {
        this.getTickets();
        this.ticketUpdated.emit();
        this.toastr.success('Ticket updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyTicketIsActiveValue(event.ticketId, previousValue);
        this.toastr.error('Unable to update ticket.', CommonMessage.Error);
      }
    });
  }

  applyTicketIsActiveValue(ticketId: string, isActive: boolean): void {
    const nextValue = !!isActive;
    this.allTickets = this.allTickets.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, isActive: nextValue }
        : ticket
    );
    this.ticketsDisplay = this.ticketsDisplay.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, isActive: nextValue }
        : ticket
    );
  }

  applyTicketStateValue(ticketId: string, ticketStateTypeId: number): void {
    const ticketStateTypeText = this.mappingService.mapTicketStateDropdownCell(getTicketStateType(ticketStateTypeId), this.ticketStateTypeOptions);
    this.allTickets = this.allTickets.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, ticketStateTypeId, ticketStateTypeText }
        : ticket
    );
    this.ticketsDisplay = this.ticketsDisplay.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, ticketStateTypeId, ticketStateTypeText }
        : ticket
    );
  }

  applyTicketAssigneeValue(ticketId: string, assigneeId: string | null, assigneeLabel: string): void {
    this.allTickets = this.allTickets.map(ticket => {
      if (ticket.ticketId !== ticketId) {
        return ticket;
      }
      return {
        ...ticket,
        assigneeId,
        assigneeName: assigneeLabel,
        assigneeDropdown: this.mapAssigneeDropdownCell(assigneeLabel, ticket.officeId ?? null)
      };
    });
    this.ticketsDisplay = this.ticketsDisplay.map(ticket => {
      if (ticket.ticketId !== ticketId) {
        return ticket;
      }
      return {
        ...ticket,
        assigneeId,
        assigneeName: assigneeLabel,
        assigneeDropdown: this.mapAssigneeDropdownCell(assigneeLabel, ticket.officeId ?? null)
      };
    });
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    const normalizedCurrentUserId = this.utilityService.normalizeIdOrNull(this.currentUserId);
    const normalizedCurrentUserAgentId = this.utilityService.normalizeIdOrNull(this.currentUserAgentId);
    const byInactive = this.showInactive
      ? [...this.allTickets]
      : this.allTickets.filter(ticket => ticket.isActive === true);

    const isMine = (ticket: TicketListDisplay): boolean => {
      if (!normalizedCurrentUserId) {
        return false;
      }
      const assigneeId = this.utilityService.normalizeIdOrNull(ticket.assigneeId ?? null);
      const agentId = this.utilityService.normalizeIdOrNull(ticket.agentId ?? null);
      return assigneeId === normalizedCurrentUserId || (normalizedCurrentUserAgentId != null && agentId === normalizedCurrentUserAgentId);
    };

    const byTicketBucket =
      this.assigneeFilterMode === 'closed'
        ? byInactive.filter(ticket => ticket.ticketStateTypeId === TicketStateType.closed)
        : (this.assigneeFilterMode === 'assignedToMe' || this.assigneeFilterMode === 'allOthers')
          ? byInactive.filter(ticket => ticket.ticketStateTypeId !== TicketStateType.closed)
          : byInactive;

    const byAssigneeScope =
      this.assigneeFilterMode === 'assignedToMe'
        ? normalizedCurrentUserId
          ? byTicketBucket.filter(ticket => isMine(ticket))
          : []
        : this.assigneeFilterMode === 'assignedToMeInAssignedState'
          ? normalizedCurrentUserId
            ? byTicketBucket.filter(ticket => isMine(ticket) && ticket.ticketStateTypeId === TicketStateType.assigned)
            : []
          : this.assigneeFilterMode === 'assignedToMeNotInAssignedState'
            ? normalizedCurrentUserId
              ? byTicketBucket.filter(ticket => isMine(ticket) && ticket.ticketStateTypeId !== TicketStateType.assigned)
              : []
            : this.assigneeFilterMode === 'allOthers'
              ? normalizedCurrentUserId
                ? byTicketBucket.filter(ticket => !isMine(ticket))
                : byTicketBucket
              : byTicketBucket;

    const byOffice = this.selectedOfficeId == null
      ? byAssigneeScope
      : byAssigneeScope.filter(ticket => ticket.officeId === this.selectedOffice?.officeId);

    const byProperty = this.selectedPropertyId == null
      ? byOffice
      : byOffice.filter(ticket => String(ticket.propertyId || '').trim() === this.selectedPropertyId);

    const filteredTickets = this.selectedReservationId == null
      ? byProperty
      : byProperty.filter(ticket => String(ticket.reservationId || '').trim() === this.selectedReservationId);
    this.ticketsDisplay = this.sortTickets(filteredTickets);

    // Keep dropdown contents scoped by upstream selections.
    this.propertyFilterOptions = Array.from(
      new Map(
        byOffice
          .filter(ticket => String(ticket.propertyId || '').trim() !== '')
          .map(ticket => [String(ticket.propertyId || '').trim(), String(ticket.propertyCode || ticket.propertyId || '').trim()])
      ).entries()
    ).map(([propertyId, propertyCode]) => ({ propertyId, propertyCode }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));

    this.reservationFilterOptions = Array.from(
      new Map(
        byProperty
          .filter(ticket => String(ticket.reservationId || '').trim() !== '')
          .map(ticket => [String(ticket.reservationId || '').trim(), String(ticket.reservationCode || ticket.reservationId || '').trim()])
      ).entries()
    ).map(([reservationId, reservationCode]) => ({ reservationId, reservationCode }))
      .sort((a, b) => a.reservationCode.localeCompare(b.reservationCode, undefined, { sensitivity: 'base' }));
  }

  onInactiveChange(checked: boolean): void {
    this.showInactive = checked;
    this.applyFilters();
  }

  onOfficeFilterChange(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.officeFilterOptions, officeId);
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
    this.selectedPropertyId = null;
    this.selectedReservationId = null;
    this.rebuildAssigneeDropdowns();
    this.applyFilters();
  }

  onPropertyFilterChange(propertyId: string | null): void {
    this.selectedPropertyId = propertyId;
    this.selectedReservationId = null;
    this.applyFilters();
  }

  onReservationFilterChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.applyFilters();
  }

  rebuildFilterOptions(): void {
    const officeMap = new Map<number, string>();
    const propertyMap = new Map<string, string>();
    const reservationMap = new Map<string, string>();

    for (const ticket of this.allTickets) {
      if (ticket.officeId) {
        officeMap.set(ticket.officeId, String(ticket.officeName || `Office ${ticket.officeId}`));
      }

      const propertyId = String(ticket.propertyId || '').trim();
      if (propertyId) {
        propertyMap.set(propertyId, String(ticket.propertyCode || propertyId));
      }

      const reservationId = String(ticket.reservationId || '').trim();
      if (reservationId) {
        reservationMap.set(reservationId, String(ticket.reservationCode || reservationId));
      }
    }

    this.officeFilterOptions = Array.from(officeMap.entries())
      .map(([officeId, officeName]) => ({ officeId, officeName }))
      .sort((a, b) => a.officeName.localeCompare(b.officeName, undefined, { sensitivity: 'base' }));
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.officeFilterOptions, this.selectedOfficeId);
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;

    this.propertyFilterOptions = Array.from(propertyMap.entries())
      .map(([propertyId, propertyCode]) => ({ propertyId, propertyCode }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));

    this.reservationFilterOptions = Array.from(reservationMap.entries())
      .map(([reservationId, reservationCode]) => ({ reservationId, reservationCode }))
      .sort((a, b) => a.reservationCode.localeCompare(b.reservationCode, undefined, { sensitivity: 'base' }));
  }
  //#endregion 

  //#region Data Loading Methods
  loadUsers(): void {
    this.userService.getUsers().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users'))).subscribe({
      next: users => {
        this.users = users || [];
        this.rebuildAssigneeDropdowns();
        this.applyFilters();
      },
      error: () => {
        this.users = [];
        this.rebuildAssigneeDropdowns();
      }
    });
  }
  //#endregion

  //#region Agent and Assignee Methods
  syncLatestAgentsFromReservations(): void {
    if (!this.hasLoadedTickets || this.isSyncingLatestAgents) {
      return;
    }
    const reservationIds = Array.from(new Set(
      this.allTickets
        .map(ticket => this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null))
        .filter((reservationId): reservationId is string => !!reservationId)
    ));
    if (reservationIds.length === 0) {
      return;
    }

    this.isSyncingLatestAgents = true;
    from(reservationIds).pipe(
      concatMap(reservationId =>
        this.reservationService.getReservationByGuid(reservationId).pipe(take(1),
          switchMap(reservation => {
            const normalizedReservationId = this.utilityService.normalizeId(reservation.reservationId);
            const latestAgentId = this.utilityService.normalizeIdOrNull(reservation.agentId ?? null);
            const ticketsForReservation = this.allTickets.filter(ticket =>
              this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === normalizedReservationId
            );
            return from(ticketsForReservation).pipe(
              concatMap(ticket =>
                this.ticketService.updateTicket(this.mappingService.mapTicketUpdateRequest(ticket, {
                  agentId: latestAgentId
                })).pipe(take(1))
              ),
              toArray(),
              map(() => ({ reservationId: normalizedReservationId, latestAgentId }))
            );
          })
        )
      ),
      toArray()
    ).subscribe({
      next: (results) => {
        results.forEach(result => {
          this.allTickets = this.allTickets.map(ticket =>
            this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === result.reservationId
              ? { ...ticket, agentId: result.latestAgentId }
              : ticket
          );
          this.ticketsDisplay = this.ticketsDisplay.map(ticket =>
            this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === result.reservationId
              ? { ...ticket, agentId: result.latestAgentId }
              : ticket
          );
        });
        this.ticketService.notifyTicketStateChanged();
        this.applyFilters();
      },
      error: () => {
        this.isSyncingLatestAgents = false;
      },
      complete: () => {
        this.isSyncingLatestAgents = false;
      }
    });
  }

  syncTicketsForReservation(reservationId: string): void {
    const normalizedReservationId = this.utilityService.normalizeIdOrNull(reservationId);
    if (!normalizedReservationId) {
      return;
    }
    const ticketsForReservation = this.allTickets.filter(ticket =>
      this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === normalizedReservationId
    );

    this.reservationService.getReservationByGuid(normalizedReservationId).pipe(take(1),
      switchMap(reservation => {
        const latestAgentId = this.utilityService.normalizeIdOrNull(reservation.agentId ?? null);
        return from(ticketsForReservation).pipe(
          concatMap(ticket =>
            this.ticketService.updateTicket(this.mappingService.mapTicketUpdateRequest(ticket, {
              agentId: latestAgentId
            })).pipe(take(1))
          ),
          toArray(),
          map(() => latestAgentId)
        );
      })
    ).subscribe({
      next: (latestAgentId) => {
      this.allTickets = this.allTickets.map(ticket =>
        this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === normalizedReservationId
          ? { ...ticket, agentId: latestAgentId }
          : ticket
      );
      this.ticketsDisplay = this.ticketsDisplay.map(ticket =>
        this.utilityService.normalizeIdOrNull(ticket.reservationId ?? null) === normalizedReservationId
          ? { ...ticket, agentId: latestAgentId }
          : ticket
      );
      this.ticketService.notifyTicketStateChanged();
      this.applyFilters();
      },
      error: () => {}
    });
  }

  mapAssigneeDropdownCell(value: string, officeId: number | null): TicketAssigneeDropdownCell {
    const normalizedValue = String(value || '').trim() || 'Unassigned';
    const optionsForOffice = ['Unassigned', ...this.getAssigneeCandidatesForOffice(officeId).map(option => option.displayName)];
    const options = optionsForOffice.includes(normalizedValue)
      ? optionsForOffice
      : [normalizedValue, ...optionsForOffice];
    return {
      value: normalizedValue,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => normalizedValue
    };
  }

  getAssigneeLabel(ticket: TicketListDisplay): string {
    return String(ticket.assigneeDropdown?.value || ticket.assigneeName || '').trim() || 'Unassigned';
  }

  withAssigneeDropdownCell(ticket: TicketListDisplay): TicketListDisplay {
    const assigneeLabel = this.getAssigneeLabel(ticket);
    const officeId = ticket.officeId ?? null;
    return {
      ...ticket,
      assigneeName: assigneeLabel,
      assigneeDropdown: this.mapAssigneeDropdownCell(assigneeLabel, officeId)
    };
  }

  rebuildAssigneeDropdowns(): void {
    this.allTickets = this.allTickets.map(ticket => this.withAssigneeDropdownCell(ticket));
    this.ticketsDisplay = this.ticketsDisplay.map(ticket => this.withAssigneeDropdownCell(ticket));
  }

  getAssigneeCandidatesForOffice(officeId: number | null): { userId: string; displayName: string }[] {
    const scopedOfficeId = officeId === 0 ? null : officeId;
    return (this.users || [])
      .filter(user => {
        if (!user.isActive || !hasCompanyRole(user.userGroups)) {
          return false;
        }
        if (scopedOfficeId == null) {
          return true;
        }
        const normalizedOfficeAccess = (user.officeAccess || []).map(accessId => Number(accessId)).filter(accessId => !isNaN(accessId));
        return normalizedOfficeAccess.includes(scopedOfficeId);
      })
      .map(user => ({
        userId: user.userId,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  }

  getAssigneeIdByLabel(label: string, officeId: number | null): string | null {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel || normalizedLabel === 'Unassigned') {
      return null;
    }
    return this.getAssigneeCandidatesForOffice(officeId).find(option => option.displayName === normalizedLabel)?.userId ?? null;
  }

  sortTickets(tickets: TicketListDisplay[]): TicketListDisplay[] {
    return (tickets || []).slice().sort((a, b) => {
      const stateOrder = (a.ticketStateTypeId ?? 0) - (b.ticketStateTypeId ?? 0);
      if (stateOrder !== 0) {
        return stateOrder;
      }
      const aCreated = Date.parse(String(a.createdOn || '')) || 0;
      const bCreated = Date.parse(String(b.createdOn || '')) || 0;
      return bCreated - aCreated;
    });
  }

  areAllCommunicationCheckboxesChecked(ticket: TicketListDisplay): boolean {
    return !!ticket.needPermissionToEnter
      && !!ticket.permissionGranted
      && !!ticket.ownerContacted
      && !!ticket.confirmedWithTenant
      && !!ticket.followedUpWithOwner
      && !!ticket.workOrderCompleted;
  }

  confirmTicketState(params: {
    currentStateTypeId: number;
    previousStateTypeId?: number;
    assigneeChanged: boolean;
    currentAssigneeId: string | null;
    hasReservation: boolean;
    areAllCommunicationCheckboxesChecked: boolean;
  }): { ticketStateTypeId: number; assigneeId: string | null; isAllowed: boolean } {
    let resolvedStateTypeId = Number(params.currentStateTypeId ?? 0);
    let resolvedAssigneeId = params.currentAssigneeId;

    if (params.assigneeChanged) {
      if (!resolvedAssigneeId) {
        resolvedStateTypeId = TicketStateType.caseCreated;
      } else {
        resolvedStateTypeId = TicketStateType.assigned;
      }
    }

    if (resolvedStateTypeId === TicketStateType.caseCreated) {
      resolvedAssigneeId = null;
    }

    const isAttemptingClose = resolvedStateTypeId === TicketStateType.closed;
    if (isAttemptingClose && params.hasReservation && !params.areAllCommunicationCheckboxesChecked) {
      return {
        ticketStateTypeId: Number(params.previousStateTypeId ?? TicketStateType.caseCreated),
        assigneeId: resolvedAssigneeId,
        isAllowed: false
      };
    }

    return {
      ticketStateTypeId: resolvedStateTypeId,
      assigneeId: resolvedAssigneeId,
      isAllowed: true
    };
  }

  openCannotCloseDialog(): void {
    const dialogData: GenericModalData = {
      title: 'Unable to Close Ticket',
      message: 'This ticket cannot be closed until all tenant/owner communication(s) have occurred and work orders completed.',
      icon: 'warning' as any,
      iconColor: 'accent',
      no: '',
      yes: 'OK',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: false
    };
    this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });
  }
  // #endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
