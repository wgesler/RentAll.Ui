import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import { ClosedDateRequest, ClosedDateResponse, ClosedDateSearchRequest } from '../models/closed-dates.model';

@Injectable({
  providedIn: 'root'
})
export class ClosedDatesService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private utilityService = inject(UtilityService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/closed-date';

  searchClosedDates(request: ClosedDateSearchRequest): Observable<ClosedDateResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search closed dates.');
    }

    return this.http.post<ClosedDateResponse[]>(`${this.controller}/search`, {
      officeIds,
      startDate: request.startDate || null,
      endDate: request.endDate || null,
      postingStatusId: request.postingStatusId ?? null
    }).pipe(
      map(items => (items ?? []).map(item => this.mapClosedDateResponse(item)))
    );
  }

  getClosedDateById(closedDateId: number, officeId: number): Observable<ClosedDateResponse> {
    return this.http.get<ClosedDateResponse>(`${this.controller}/office/${officeId}/closedDateId/${closedDateId}`).pipe(
      map(item => this.mapClosedDateResponse(item))
    );
  }

  createClosedDate(closedDate: ClosedDateRequest): Observable<ClosedDateResponse> {
    return this.http.post<ClosedDateResponse>(this.controller, this.normalizeClosedDateRequest(closedDate)).pipe(
      map(item => this.mapClosedDateResponse(item))
    );
  }

  updateClosedDate(closedDate: ClosedDateRequest): Observable<ClosedDateResponse> {
    return this.http.put<ClosedDateResponse>(this.controller, this.normalizeClosedDateRequest(closedDate)).pipe(
      map(item => this.mapClosedDateResponse(item))
    );
  }

  deleteClosedDate(closedDateId: number, officeId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}/office/${officeId}/closedDateId/${closedDateId}`);
  }

  mapClosedDateResponse(item: ClosedDateResponse | Record<string, unknown>): ClosedDateResponse {
    return {
      closedDateId: Number(item['closedDateId'] ?? item['ClosedDateId'] ?? 0),
      organizationId: String(item['organizationId'] ?? item['OrganizationId'] ?? ''),
      officeId: Number(item['officeId'] ?? item['OfficeId'] ?? 0),
      startDate: this.utilityService.coerceCalendarDateStringFromApi(item['startDate'] ?? item['StartDate']) ?? '',
      endDate: this.utilityService.coerceCalendarDateStringFromApi(item['endDate'] ?? item['EndDate']) ?? '',
      postingStatusId: Number(item['postingStatusId'] ?? item['PostingStatusId'] ?? 0)
    };
  }

  normalizeClosedDateRequest(closedDate: ClosedDateRequest): ClosedDateRequest {
    return {
      closedDateId: closedDate.closedDateId,
      officeId: Number(closedDate.officeId) || 0,
      startDate: this.utilityService.toDateOnlyJsonString(closedDate.startDate) ?? closedDate.startDate,
      endDate: this.utilityService.toDateOnlyJsonString(closedDate.endDate) ?? closedDate.endDate,
      postingStatusId: Number(closedDate.postingStatusId) || 0
    };
  }
}
