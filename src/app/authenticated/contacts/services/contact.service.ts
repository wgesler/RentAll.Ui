import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, tap, catchError, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { EntityType } from '../models/contact-enum';
import { ContactRequest, ContactResponse } from '../models/contact.model';

@Injectable({
    providedIn: 'root'
})

export class ContactService {
  
  private readonly controller = this.configService.config().apiUrl + 'contact/';
  private allContacts$ = new BehaviorSubject<ContactResponse[]>([]);
  private contactsLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService,
      private mappingService: MappingService) {
  }

  loadAllContacts(): Observable<ContactResponse[]> {
    const url = this.controller;
    return this.http.get<ContactResponse[]>(url).pipe(
      tap(contacts => {
        this.allContacts$.next(contacts || []);
        this.contactsLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Contact Service - Error loading all contacts:', err);
        this.allContacts$.next([]);
        this.contactsLoaded$.next(true);
        return of([]);
      })
    );
  }

  areContactsLoaded(): Observable<boolean> {
    return this.contactsLoaded$.asObservable();
  }

  clearContacts(): void {
    this.allContacts$.next([]);
    this.contactsLoaded$.next(false);
  }

  getAllContacts(): Observable<ContactResponse[]> {
    return this.allContacts$;
  }

  getAllContactsValue(): ContactResponse[] {
    return this.allContacts$.value;
  }

  getAllCompanyContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Company)));
  }

  getAllOwnerContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Owner)));
  }

  getAllTenantContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Tenant)));
  }

  getAllVendorContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Vendor)));
  }

  getContacts(): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(this.controller);
  }

  getContactsByType(contactTypeId: number): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(this.controller + 'type/' + contactTypeId);
  }

  getContactByGuid(contactId: string): Observable<ContactResponse> {
    return this.http.get<ContactResponse>(this.controller + contactId).pipe(
      map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
    );
  }

  createContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.http.post<ContactResponse>(this.controller, contact);
  }

  updateContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.http.put<ContactResponse>(this.controller, contact);
  }

  deleteContact(contactId: string): Observable<void> {
    return this.http.delete<void>(this.controller + contactId);
  }
}

