import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { TicketRequest, TicketResponse } from '../models/ticket-models';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private readonly controller = this.configService.config().apiUrl + 'ticket/';
  private readonly ticketStateChangedSubject = new Subject<void>();
  ticketStateChanged$ = this.ticketStateChangedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
  }

  // GET: Get all tickets
  getTickets(): Observable<TicketResponse[]> {
    return this.http.get<TicketResponse[]>(this.controller);
  }

  // GET: Get ticket by ID
  getTicketById(ticketId: string): Observable<TicketResponse> {
    return this.http.get<TicketResponse>(this.controller + ticketId);
  }

  // GET: Get tickets by property ID
  getTicketsByPropertyId(propertyId: string): Observable<TicketResponse[]> {
    return this.http.get<TicketResponse[]>(this.controller + 'property/' + propertyId);
  }

  // POST: Create a new ticket
  createTicket(ticket: TicketRequest): Observable<TicketResponse> {
    return this.http.post<TicketResponse>(this.controller, ticket);
  }

  // PUT: Update ticket
  updateTicket(ticket: TicketRequest): Observable<TicketResponse> {
    return this.http.put<TicketResponse>(this.controller, ticket);
  }

  // DELETE: Delete ticket
  deleteTicket(ticketId: string): Observable<void> {
    return this.http.delete<void>(this.controller + ticketId);
  }

  notifyTicketStateChanged(): void {
    this.ticketStateChangedSubject.next();
  }
}
