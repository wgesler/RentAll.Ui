import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, map } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { ContactRequest, ContactResponse } from '../models/contact.model';
import { ContactType } from '../models/contact-type';

@Injectable({
    providedIn: 'root'
})

export class ContactService {
  
  private readonly controller = this.configService.config().apiUrl + 'contact/';
  private allContacts$ = new BehaviorSubject<ContactResponse[]>([]);
  private contactsLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // Load all contacts on startup
  loadAllContacts(): void {
    this.http.get<ContactResponse[]>(this.controller).subscribe({
      next: (contacts) => {
        this.allContacts$.next(contacts || []);
        this.contactsLoaded$.next(true);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Contact Service - Error loading all contacts:', err);
        this.allContacts$.next([]);
        this.contactsLoaded$.next(true); // Mark as loaded even on error
      }
    });
  }

  // Check if contacts have been loaded
  areContactsLoaded(): Observable<boolean> {
    return this.contactsLoaded$.asObservable();
  }

  // Get all contacts as observable
  getAllContacts(): Observable<ContactResponse[]> {
    return this.allContacts$;
  }

  // Get company contacts (filtered by ContactType.Company)
  getAllCompanyContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(
      map(contacts => contacts.filter(c => c.contactTypeId === ContactType.Company))
    );
  }

  // Get owner contacts (filtered by ContactType.Owner)
  getAllOwnerContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(
      map(contacts => contacts.filter(c => c.contactTypeId === ContactType.Owner))
    );
  }

  // Get tenant contacts (filtered by ContactType.Tenant)
  getAllTenantContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(
      map(contacts => contacts.filter(c => c.contactTypeId === ContactType.Tenant))
    );
  }

  // GET: Get all contacts
  getContacts(): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(this.controller);
  }

  // GET: Get contacts by type
  getContactsByType(contactTypeId: number): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(this.controller + 'type/' + contactTypeId);
  }

  // GET: Get contact by ID
  getContactByGuid(contactId: string): Observable<ContactResponse> {
    return this.http.get<ContactResponse>(this.controller + contactId);
  }

  // POST: Create a new contact
  createContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.http.post<ContactResponse>(this.controller, contact);
  }

  // PUT: Update entire contact
  updateContact(contactId: string, contact: ContactRequest): Observable<ContactResponse> {
    return this.http.put<ContactResponse>(this.controller + contactId, contact);
  }

  // PATCH: Partially update contact
  updateContactPartial(contactId: string, contact: Partial<ContactRequest>): Observable<ContactResponse> {
    return this.http.patch<ContactResponse>(this.controller + contactId, contact);
  }

  // DELETE: Delete contact
  deleteContact(contactId: string): Observable<void> {
    return this.http.delete<void>(this.controller + contactId);
  }
}

