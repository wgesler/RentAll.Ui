import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { LeadOwnerUpdateRequest } from '../../leads/models/lead-owner.model';
import { EntityType } from '../models/contact-enum';
import { AppendPropertyCodeToContactsRequest, AppendPropertyCodeToContactsResponse, ContactRequest, ContactResponse } from '../models/contact.model';

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
      map(contacts =>(contacts || []).map(c => this.mappingService.mapContactResponse(c as unknown as Record<string, unknown>))),
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

  ensureContactsLoaded(): Observable<ContactResponse[]> {
    if (this.contactsLoaded$.value) return this.getAllContacts().pipe(take(1));
    return this.loadAllContacts().pipe(take(1), switchMap(() => this.getAllContacts().pipe(take(1))));
  }

  refreshContacts(): Observable<ContactResponse[]> {
    return this.loadAllContacts().pipe(take(1), switchMap(() => this.getAllContacts().pipe(take(1))));
  }

  /** Reload the global contact cache and push to all getAllContacts() subscribers. */
  notifyContactsChanged(): void {
    this.refreshContacts().pipe(take(1)).subscribe({ error: () => {} });
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      switchMap(result =>
        this.loadAllContacts().pipe(
          map(() => result),
          catchError((err: HttpErrorResponse) => {
            console.error('Contact Service - Error refreshing contacts after mutation:', err);
            return throwError(() => err);
          })
        )
      )
    );
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

  getContacts(): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(this.controller).pipe(
      map(contacts =>
        (contacts || []).map(c => this.mappingService.mapContactResponse(c as unknown as Record<string, unknown>))
      )
    );
  }

  getContactByGuid(contactId: string): Observable<ContactResponse> {
    return this.http.get<ContactResponse>(this.controller + contactId).pipe(
      map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
    );
  }

  createContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.refreshCacheAfterMutation(
      this.http.post<ContactResponse>(this.controller, contact).pipe(
        map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
      )
    );
  }

  updateContact(contact: ContactRequest): Observable<ContactResponse> {
    return this.refreshCacheAfterMutation(
      this.http.put<ContactResponse>(this.controller, contact).pipe(
        map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
      )
    );
  }

  retriggerOwnerLogin(contactId: string): Observable<ContactResponse> {
    return this.refreshCacheAfterMutation(
      this.http.post<ContactResponse>(`${this.controller}${contactId}/retrigger-owner-login`, {}).pipe(
        map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
      )
    );
  }

  matchContactToLead(ownerLead: LeadOwnerUpdateRequest): Observable<ContactResponse> {
    return this.refreshCacheAfterMutation(
      this.http.put<ContactResponse>(this.controller + 'by-lead', ownerLead).pipe(
        map(dto => this.mappingService.mapContactResponse(dto as unknown as Record<string, unknown>))
      )
    );
  }

  deleteContact(contactId: string): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + contactId));
  }

  appendPropertyCodeToContacts(request: AppendPropertyCodeToContactsRequest): Observable<AppendPropertyCodeToContactsResponse> {
    return this.refreshCacheAfterMutation(this.http.post<AppendPropertyCodeToContactsResponse>(`${this.controller}append-property-code`, request));
  }
}

