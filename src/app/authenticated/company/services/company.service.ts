import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { CompanyRequest, CompanyResponse } from '../models/company.model';

@Injectable({
    providedIn: 'root'
})

export class CompanyService {
  
  private readonly controller = this.configService.config().apiUrl + 'company/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all companies
  getCompanies(): Observable<CompanyResponse[]> {
    return this.http.get<CompanyResponse[]>(this.controller);
  }

  // GET: Get company by ID
  getCompanyByGuid(companyId: string): Observable<CompanyResponse> {
    return this.http.get<CompanyResponse>(this.controller + companyId);
  }

  // POST: Create a new company
  createCompany(company: CompanyRequest): Observable<CompanyResponse> {
    return this.http.post<CompanyResponse>(this.controller, company);
  }

  // PUT: Update entire company
  updateCompany(companyId: string, company: CompanyRequest): Observable<CompanyResponse> {
    return this.http.put<CompanyResponse>(this.controller + companyId, company);
  }

  // PATCH: Partially update company
  updateCompanyPartial(companyId: string, company: Partial<CompanyRequest>): Observable<CompanyResponse> {
    return this.http.patch<CompanyResponse>(this.controller + companyId, company);
  }

  // PATCH: Update company logo
  updateCompanyLogo(companyId: string, company: CompanyRequest): Observable<CompanyResponse> {
    return this.http.patch<CompanyResponse>(this.controller + companyId, company);
  }

  // DELETE: Delete company
  deleteCompany(companyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + companyId);
  }
}

