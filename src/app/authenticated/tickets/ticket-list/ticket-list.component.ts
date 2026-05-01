import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { getTicketStateType, getTicketStateTypes } from '../models/ticket-enum';
import { TicketRequest, TicketResponse } from '../models/ticket-models';
import { TicketService } from '../services/ticket.service';

type TicketStateDropdownCell = {
  value: string;
  isOverridable: boolean;
  options: string[];
  panelClass: string[];
  toString: () => string;
};

type TicketListDisplay = TicketResponse & {
  ticketStateTypeText: TicketStateDropdownCell;
  propertyId: string;
  reservationId: string;
};

type TicketOfficeFilterOption = {
  officeId: number;
  officeName: string;
};

type TicketPropertyFilterOption = {
  propertyId: string;
  propertyCode: string;
};

type TicketReservationFilterOption = {
  reservationId: string;
  reservationCode: string;
};

@Component({
  standalone: true,
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class TicketListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() ticketSelected = new EventEmitter<string | number | null>();

  isServiceError: boolean = false;
  showInactive = false;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  allTickets: TicketListDisplay[] = [];
  ticketsDisplay: TicketListDisplay[] = [];
  ticketStateTypeOptions = getTicketStateTypes().map(state => state.label);
  officeFilterOptions: TicketOfficeFilterOption[] = [];
  propertyFilterOptions: TicketPropertyFilterOption[] = [];
  reservationFilterOptions: TicketReservationFilterOption[] = [];

  ticketsDisplayedColumns: ColumnSet = {
    'ticketCode': { displayAs: 'Ticket', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'ticketStateTypeText': { displayAs: 'State', maxWidth: '20ch' },
    'title': { displayAs: 'Title', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '50ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
 };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['tickets']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private ticketService: TicketService
  ) {}

  //#region Ticket-List
  ngOnInit(): void {
    this.getTickets();
  }

  addTicket(): void {
    if (this.embeddedInSettings) {
      this.ticketSelected.emit('new');
      return;
    }

    this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Ticket, ['new'])}`);
  }

  getTickets(): void {
    this.ticketService.getTickets().pipe(
      take(1),
      finalize(() => this.itemsToLoad$.next(new Set()))
    ).subscribe({
      next: (tickets) => {
        this.isServiceError = false;
        this.allTickets = (tickets || []).map(ticket => this.mapTicketToDisplay(ticket));
        this.rebuildFilterOptions();
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.allTickets = [];
        this.ticketsDisplay = [];
      }
    });
  }

  goToTicket(event: TicketListDisplay): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) return;

    if (this.embeddedInSettings) {
      this.ticketSelected.emit(event.ticketId);
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

    const previousStateId = event.ticketStateTypeId;
    this.applyTicketStateValue(event.ticketId, selectedState.value);
    this.ticketService.getTicketById(event.ticketId).pipe(
      take(1),
      switchMap(ticket => this.ticketService.updateTicket(this.buildTicketUpdateRequest(ticket, { ticketStateTypeId: selectedState.value })).pipe(take(1)))
    ).subscribe({
      next: () => {
        this.toastr.success('Ticket state updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyTicketStateValue(event.ticketId, previousStateId);
        this.toastr.error('Unable to update ticket state.', CommonMessage.Error);
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

    this.applyTicketIsActiveValue(event.ticketId, nextValue);
    this.ticketService.getTicketById(event.ticketId).pipe(
      take(1),
      switchMap(ticket => this.ticketService.updateTicket(this.buildTicketUpdateRequest(ticket, { IsActive: nextValue })).pipe(take(1)))
    ).subscribe({
      next: () => {
        this.toastr.success('Ticket updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyTicketIsActiveValue(event.ticketId, previousValue);
        this.toastr.error('Unable to update ticket.', CommonMessage.Error);
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

  applyTicketIsActiveValue(ticketId: number, isActive: boolean): void {
    const nextValue = !!isActive;
    this.allTickets = this.allTickets.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, IsActive: nextValue, isActive: nextValue }
        : ticket
    );
    this.ticketsDisplay = this.ticketsDisplay.map(ticket =>
      ticket.ticketId === ticketId
        ? { ...ticket, IsActive: nextValue, isActive: nextValue }
        : ticket
    );
  }

  applyTicketStateValue(ticketId: number, ticketStateTypeId: number): void {
    const ticketStateTypeText = this.buildTicketStateDropdownCell(getTicketStateType(ticketStateTypeId));
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
  //#endregion

  //#region Utility Methods
  mapTicketToDisplay(ticket: TicketResponse): TicketListDisplay {
    return {
      ...ticket,
      ticketCode: ticket.TicketCode || '',
      propertyCode: ticket.PropertyCode || '',
      reservationCode: ticket.ReservationCode || '',
      title: ticket.Title || '',
      propertyId: ticket.propertyId || '',
      reservationId: ticket.ReservationId || '',
      description: ticket.Description || '',
      isActive: ticket.IsActive,
      ticketStateTypeText: this.buildTicketStateDropdownCell(getTicketStateType(ticket.ticketStateTypeId))
    } as TicketListDisplay;
  }

  buildTicketStateDropdownCell(label: string): TicketStateDropdownCell {
    const normalizedLabel = label || '';
    return {
      value: normalizedLabel,
      isOverridable: true,
      options: this.ticketStateTypeOptions,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => normalizedLabel
    };
  }

  buildTicketUpdateRequest(ticket: TicketResponse, updates: Partial<TicketRequest>): TicketRequest {
    return {
      ticketId: ticket.ticketId,
      organizationId: ticket.organizationId,
      officeId: ticket.officeId,
      officeName: ticket.officeName,
      propertyId: ticket.propertyId ?? null,
      PropertyCode: ticket.PropertyCode ?? null,
      ReservationId: ticket.ReservationId ?? null,
      ReservationCode: ticket.ReservationCode ?? null,
      TicketCode: ticket.TicketCode,
      Title: ticket.Title,
      Description: ticket.Description,
      ticketStateTypeId: ticket.ticketStateTypeId,
      permissionToEnter: ticket.permissionToEnter,
      ownerContacted: ticket.ownerContacted,
      confirmedWithTenant: ticket.confirmedWithTenant,
      followedUpWithOwner: ticket.followedUpWithOwner,
      workOrderCompleted: ticket.workOrderCompleted,
      Notes: ticket.Notes
        ? ticket.Notes.map(note => ({
            ticketNoteId: note.ticketNoteId,
            ticketId: note.ticketId,
            note: note.note,
            createdOn: note.createdOn,
            createdBy: note.createdBy,
            modifiedOn: note.modifiedOn,
            modifiedBy: note.modifiedBy
          }))
        : null,
      IsActive: ticket.IsActive,
      ...updates
    };
  }

  applyFilters(): void {
    const byInactive = this.showInactive
      ? [...this.allTickets]
      : this.allTickets.filter(ticket => ticket.IsActive === true);

    const byOffice = this.selectedOfficeId == null
      ? byInactive
      : byInactive.filter(ticket => ticket.officeId === this.selectedOfficeId);

    const byProperty = this.selectedPropertyId == null
      ? byOffice
      : byOffice.filter(ticket => String(ticket.propertyId || '').trim() === this.selectedPropertyId);

    this.ticketsDisplay = this.selectedReservationId == null
      ? byProperty
      : byProperty.filter(ticket => String(ticket.reservationId || '').trim() === this.selectedReservationId);

    // Keep dropdown contents scoped by upstream selections.
    this.propertyFilterOptions = Array.from(
      new Map(
        byOffice
          .filter(ticket => String(ticket.propertyId || '').trim() !== '')
          .map(ticket => [String(ticket.propertyId || '').trim(), String(ticket.PropertyCode || ticket.propertyId || '').trim()])
      ).entries()
    ).map(([propertyId, propertyCode]) => ({ propertyId, propertyCode }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));

    this.reservationFilterOptions = Array.from(
      new Map(
        byProperty
          .filter(ticket => String(ticket.reservationId || '').trim() !== '')
          .map(ticket => [String(ticket.reservationId || '').trim(), String(ticket.ReservationCode || ticket.reservationId || '').trim()])
      ).entries()
    ).map(([reservationId, reservationCode]) => ({ reservationId, reservationCode }))
      .sort((a, b) => a.reservationCode.localeCompare(b.reservationCode, undefined, { sensitivity: 'base' }));
  }

  onInactiveChange(checked: boolean): void {
    this.showInactive = checked;
    this.applyFilters();
  }

  onOfficeFilterChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.selectedPropertyId = null;
    this.selectedReservationId = null;
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
        propertyMap.set(propertyId, String(ticket.PropertyCode || propertyId));
      }

      const reservationId = String(ticket.reservationId || '').trim();
      if (reservationId) {
        reservationMap.set(reservationId, String(ticket.ReservationCode || reservationId));
      }
    }

    this.officeFilterOptions = Array.from(officeMap.entries())
      .map(([officeId, officeName]) => ({ officeId, officeName }))
      .sort((a, b) => a.officeName.localeCompare(b.officeName, undefined, { sensitivity: 'base' }));

    this.propertyFilterOptions = Array.from(propertyMap.entries())
      .map(([propertyId, propertyCode]) => ({ propertyId, propertyCode }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));

    this.reservationFilterOptions = Array.from(reservationMap.entries())
      .map(([reservationId, reservationCode]) => ({ reservationId, reservationCode }))
      .sort((a, b) => a.reservationCode.localeCompare(b.reservationCode, undefined, { sensitivity: 'base' }));
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
