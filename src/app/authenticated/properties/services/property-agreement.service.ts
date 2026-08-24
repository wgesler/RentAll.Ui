import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RentRollPropertyAgreement } from '../../accounting/models/rent-roll.model';
import { ConfigService } from '../../../services/config.service';
import { PropertyAgreementLineRequest, PropertyAgreementLineResponse, PropertyAgreementRequest, PropertyAgreementResponse } from '../models/property-agreement.model';

@Injectable({
  providedIn: 'root'
})
export class PropertyAgreementService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly agreementUrl = this.configService.config().apiUrl + 'property/property-agreement';

  getPropertyAgreement(propertyId: string): Observable<PropertyAgreementResponse | null> {
    return this.http.get<PropertyAgreementResponse | null>(`${this.agreementUrl}/${propertyId}`);
  }

  getPropertyAgreementRentRollByOfficeIds(): Observable<RentRollPropertyAgreement[]> {
    return this.http.get<RentRollPropertyAgreement[]>(`${this.agreementUrl}/rent-roll`);
  }

  createPropertyAgreement(agreement: PropertyAgreementRequest): Observable<PropertyAgreementResponse> {
    return this.http.post<PropertyAgreementResponse>(`${this.agreementUrl}/${agreement.propertyId}`, agreement);
  }

  updatePropertyAgreement(agreement: PropertyAgreementRequest): Observable<PropertyAgreementResponse> {
    return this.http.put<PropertyAgreementResponse>(this.agreementUrl, agreement);
  }

  createRentRollAgreementLine(line: PropertyAgreementLineRequest): Observable<PropertyAgreementLineResponse> {
    return this.http.post<PropertyAgreementLineResponse>(`${this.agreementUrl}/rent-roll/agreement-line`, line);
  }

  updateRentRollAgreementLine(line: PropertyAgreementLineRequest & { agreementLineId: string }): Observable<PropertyAgreementLineResponse> {
    return this.http.put<PropertyAgreementLineResponse>(`${this.agreementUrl}/rent-roll/agreement-line`, line);
  }

  deleteRentRollAgreementLine(agreementLineId: string): Observable<void> {
    return this.http.delete<void>(`${this.agreementUrl}/rent-roll/agreement-line/${agreementLineId}`);
  }
}
