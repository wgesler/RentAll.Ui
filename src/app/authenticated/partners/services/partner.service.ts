import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PartnerCityStateResponse, PartnerContactResponse } from '../models/partner.model';

@Injectable({
  providedIn: 'root'
})
export class PartnerService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'partner/';

  getAllProperties(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'properties').pipe(
      map(properties => properties || []),
      catchError(() => of([]))
    );
  }

  getActivePropertiesBySelectionCriteria(userId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'properties/user/' + userId + '/active').pipe(
      map(properties => properties || []),
      catchError(() => of([]))
    );
  }

  getListOfCities(): Observable<PartnerCityStateResponse[]> {
    return this.http.get<PartnerCityStateResponse[]>(this.controller + 'cities').pipe(
      map(cities => cities || []),
      catchError(() => of([]))
    );
  }

  getPartnerContact(propertyId: string): Observable<PartnerContactResponse | null> {
    const id = String(propertyId || '').trim();
    if (!id) {
      return of(null);
    }

    return this.http.get<PartnerContactResponse>(this.controller + 'contact/' + id).pipe(
      map(contact => this.normalizePartnerContact(contact)),
      catchError(() => of(null))
    );
  }

  private normalizePartnerContact(contact: PartnerContactResponse | null | undefined): PartnerContactResponse | null {
    if (!contact) {
      return null;
    }

    const raw = contact as PartnerContactResponse & { company?: string | null };
    return {
      companyName: String(raw.companyName ?? raw.company ?? '').trim(),
      name: String(raw.name ?? '').trim(),
      phone: String(raw.phone ?? '').trim(),
      email: String(raw.email ?? '').trim()
    };
  }
}
