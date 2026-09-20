import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../../services/config.service';

export interface SidebarAttentionSummary {
  assignedTicketCount: number;
  newLeadCount: number;
  securityDepositCount: number;
  pendingReceiptDraftCount: number;
}

@Injectable({ providedIn: 'root' })
export class SidebarAttentionService {
  private readonly http = inject(HttpClient);
  private readonly controller = inject(ConfigService).config().apiUrl + 'sidebar/';

  getSummary(): Observable<SidebarAttentionSummary> {
    return this.http.get<SidebarAttentionSummary>(this.controller + 'attention-summary');
  }
}
