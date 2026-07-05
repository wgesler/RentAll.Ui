import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OwnerReportJournalEntryLineResponse, OwnerReportJournalEntryLineSearchRequest, OwnerReportResponse, OwnerReportSearchRequest, OwnerReportSearchResponse } from '../models/owner-report.model';
import { OwnerStatementService } from './owner-statement.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerReportService {
  constructor(private ownerStatementService: OwnerStatementService) {}

  searchOwnerReports(request: OwnerReportSearchRequest): Observable<OwnerReportSearchResponse> {
    return this.ownerStatementService.searchOwnerStatements(request);
  }

  searchOwnerReportJournalEntryLines(request: OwnerReportJournalEntryLineSearchRequest): Observable<OwnerReportJournalEntryLineResponse[]> {
    return this.ownerStatementService.searchOwnerStatementJournalEntryLines(request);
  }
}
