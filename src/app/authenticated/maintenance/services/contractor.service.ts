import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ContractorRequest, ContractorResponse } from '../models/contractor.model';

@Injectable({
  providedIn: 'root'
})
export class ContractorService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/contractor/';
  }

  getContractors(): Observable<ContractorResponse[]> {
    return this.http.get<ContractorResponse[]>(this.controller);
  }

  getContractorById(contractorId: string): Observable<ContractorResponse> {
    return this.http.get<ContractorResponse>(this.controller + contractorId);
  }

  createContractor(request: ContractorRequest): Observable<ContractorResponse> {
    return this.http.post<ContractorResponse>(this.controller, request);
  }

  updateContractor(request: ContractorRequest): Observable<ContractorResponse> {
    return this.http.put<ContractorResponse>(this.controller, request);
  }

  deleteContractor(contractorId: string): Observable<void> {
    return this.http.delete<void>(this.controller + contractorId);
  }
}
