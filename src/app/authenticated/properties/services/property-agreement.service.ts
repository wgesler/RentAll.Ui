import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RentRollPropertyAgreement } from '../../accounting/models/rent-roll.model';
import { ConfigService } from '../../../services/config.service';
import { PropertyAgreementRequest, PropertyAgreementResponse } from '../models/property-agreement.model';

@Injectable({
  providedIn: 'root'
})
export class PropertyAgreementService {
  private readonly agreementUrl = this.configService.config().apiUrl + 'property/property-agreement';

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }

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
}
