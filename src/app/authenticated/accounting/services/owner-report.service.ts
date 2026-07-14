import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OwnerReportJournalEntryLineResponse, OwnerReportJournalEntryLineSearchRequest } from '../models/owner-report.model';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerReportService {
  private reportService = inject(ReportService);


  searchOwnerReportJournalEntryLines(request: OwnerReportJournalEntryLineSearchRequest): Observable<OwnerReportJournalEntryLineResponse[]> {
    return this.reportService.searchOwnerReportJournalEntryLines(request);
  }
}
