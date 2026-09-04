import { Injectable } from '@angular/core';
import { DocumentHealthSessionState, HealthCheckRowState } from '../models/health.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentHealthStateService {
  private session: DocumentHealthSessionState | null = null;

  load(organizationId: string): DocumentHealthSessionState | null {
    if (!organizationId || !this.session || this.session.organizationId !== organizationId) {
      return null;
    }

    return {
      ...this.session,
      rows: this.session.rows.map(row => this.resetRowBusyState(row)),
      issueRows: [...this.session.issueRows]
    };
  }

  save(state: DocumentHealthSessionState): void {
    this.session = {
      ...state,
      rows: state.rows.map(row => ({ ...row })),
      issueRows: state.issueRows.map(row => ({ ...row }))
    };
  }

  clear(): void {
    this.session = null;
  }

  private resetRowBusyState(row: HealthCheckRowState): HealthCheckRowState {
    return {
      ...row,
      checking: false,
      fixing: false,
      fixProgress: null
    };
  }
}
