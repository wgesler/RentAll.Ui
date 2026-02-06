import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, map } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { ContactRequest, ContactResponse } from '../models/contact.model';
import { EntityType } from '../models/contact-enum';

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
    const url = this.controller;
    
    this.http.get<ContactResponse[]>(url).subscribe({
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

  // Clear all contacts (e.g., on logout)
  clearContacts(): void {
    this.allContacts$.next([]);
    this.contactsLoaded$.next(false);
  }

  // Get all contacts as observable (returns BehaviorSubject - components should filter for non-empty)
  getAllContacts(): Observable<ContactResponse[]> {
    return this.allContacts$;
  }

  // Get all contacts value synchronously (returns current value)
  getAllContactsValue(): ContactResponse[] {
    return this.allContacts$.value;
  }

  // Get company contacts (filtered by EntityType.Company)
  getAllCompanyContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Company)));
  }

  // Get owner contacts (filtered by EntityType.Owner)
  getAllOwnerContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Owner)));
  }

  // Get tenant contacts (filtered by EntityType.Tenant)
  getAllTenantContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Tenant)));
  }

    // Get vendor contacts (filtered by EntityType.Tenant)
  getAllVendorContacts(): Observable<ContactResponse[]> {
    return this.allContacts$.pipe(map(contacts => contacts.filter(c => c.entityTypeId === EntityType.Vendor)));
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
  updateContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.http.put<ContactResponse>(this.controller, contact);
  }

  // DELETE: Delete contact
  deleteContact(contactId: string): Observable<void> {
    return this.http.delete<void>(this.controller + contactId);
  }
}

