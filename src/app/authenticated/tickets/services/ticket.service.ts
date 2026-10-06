import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { TicketRequest, TicketResponse } from '../models/ticket-models';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'ticket/';
  private readonly ticketStateChangedSubject = new Subject<void>();
  ticketStateChanged$ = this.ticketStateChangedSubject.asObservable();

  // GET: Get all tickets
  getTickets(): Observable<TicketResponse[]> {
    return this.http.get<TicketResponse[]>(this.controller);
  }

  // GET: Get ticket by ID
  getTicketById(ticketId: string): Observable<TicketResponse> {
    return this.http.get<TicketResponse>(this.controller + ticketId);
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

  uploadTicketImage(officeId: number, fileDetails: FileDetails): Observable<{ imagePath: string }> {
    return this.http.post<{ imagePath: string }>(this.controller + 'image', { officeId, fileDetails });
  }

  getTicketImage(path: string, officeId: number): Observable<Blob> {
    return this.http.get(this.controller + 'image', {
      params: { path, officeId: String(officeId) },
      responseType: 'blob'
    });
  }

  notifyTicketStateChanged(): void {
    this.ticketStateChangedSubject.next();
  }
}
