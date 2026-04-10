import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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

  createPropertyAgreement(agreement: PropertyAgreementRequest): Observable<PropertyAgreementResponse> {
    return this.http.post<PropertyAgreementResponse>(`${this.agreementUrl}/${agreement.propertyId}`, agreement);
  }

  updatePropertyAgreement(agreement: PropertyAgreementRequest): Observable<PropertyAgreementResponse> {
    return this.http.put<PropertyAgreementResponse>(this.agreementUrl, agreement);
  }

  deletePropertyAgreement(propertyId: string): Observable<void> {
    return this.http.delete<void>(`${this.agreementUrl}/${propertyId}`);
  }
}
