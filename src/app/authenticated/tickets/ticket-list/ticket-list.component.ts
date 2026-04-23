import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { getTicketStateType } from '../models/ticket-enum';
import { TicketResponse } from '../models/ticket-models';

type TicketListDisplay = TicketResponse & {
  ticketStateTypeText: string;
};

@Component({
  standalone: true,
  selector: 'app-ticket-list',
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})
export class TicketListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() ticketSelected = new EventEmitter<string | number | null>();

  isServiceError: boolean = false;
  allTickets: TicketListDisplay[] = [];
  ticketsDisplay: TicketListDisplay[] = [];

  ticketsDisplayedColumns: ColumnSet = {
    'ticketCode': { displayAs: 'Ticket', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'ticketStateTypeText': { displayAs: 'State', maxWidth: '20ch' },
    'description': { displayAs: 'Description', maxWidth: '50ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
 };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['tickets']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  //#region Ticket-List
  ngOnInit(): void {
    this.getTickets();
  }

  addTicket(): void {
    this.ticketSelected.emit('new');
  }

  getTickets(): void {
    // Placeholder sample data until Ticket API/service is connected.
    const mockTickets: TicketResponse[] = [
      {
        ticketId: 1001,
        organizationId: '',
        officeId: 0,
        officeName: '',
        propertyId: 'P-001',
        PropertyCode: 'P-001',
        ReservationId: 'R-001',
        ReservationCode: 'R-001',
        TicketCode: 'T-001',
        Description: 'HVAC not cooling in primary bedroom',
        ticketStateTypeId: 0,
        permissionToEnter: true,
        ownerContacted: false,
        confirmedWithTenant: true,
        followedUpWithOwner: false,
        workOrderCompleted: false,
        Notes: null,
        IsActive: true
      },
      {
        ticketId: 1002,
        organizationId: '',
        officeId: 0,
        officeName: '',
        propertyId: 'P-014',
        PropertyCode: 'P-014',
        ReservationId: 'R-013',
        ReservationCode: 'R-013',
        TicketCode: 'T-002',
        Description: 'Garbage disposal jammed',
        ticketStateTypeId: 2,
        permissionToEnter: true,
        ownerContacted: true,
        confirmedWithTenant: true,
        followedUpWithOwner: false,
        workOrderCompleted: false,
        Notes: null,
        IsActive: true
      }
    ];

    this.allTickets = mockTickets.map(ticket => this.mapTicketToDisplay(ticket));
    this.applyFilters();
    this.itemsToLoad$.next(new Set());
  }

  goToTicket(event: TicketListDisplay): void {
    if (!event || event.ticketId === null || event.ticketId === undefined) return;
    this.ticketSelected.emit(event.ticketId);
  }
  //#endregion

  //#region Utility Methods
  mapTicketToDisplay(ticket: TicketResponse): TicketListDisplay {
    return {
      ...ticket,
      ticketCode: ticket.TicketCode || '',
      propertyCode: ticket.PropertyCode || '',
      reservationCode: ticket.ReservationCode || '',
      description: ticket.Description || '',
      ticketStateTypeText: getTicketStateType(ticket.ticketStateTypeId)
    } as TicketListDisplay;
  }

  applyFilters(): void {
    this.ticketsDisplay = [...this.allTickets];
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
