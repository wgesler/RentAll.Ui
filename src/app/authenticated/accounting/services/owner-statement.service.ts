import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { OwnerStatementResponse, OwnerStatementSearchRequest } from '../models/owner-statement.model';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(private http: HttpClient, private configService: ConfigService) {}

  searchOwnerStatements(request: OwnerStatementSearchRequest): Observable<OwnerStatementResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statements.');
    }

    return this.http.post<OwnerStatementResponse[]>(`${this.controller}owner-statement/search`, {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? [])
    );
  }
}
