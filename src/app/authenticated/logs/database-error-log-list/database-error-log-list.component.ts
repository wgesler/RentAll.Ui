import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DatabaseErrorLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-database-error-log-list',
  templateUrl: './database-error-log-list.component.html',
  styleUrl: './database-error-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class DatabaseErrorLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openDatabaseErrorLog = new EventEmitter<DatabaseErrorLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private formatter = inject(FormatterService);

  rows: Array<DatabaseErrorLogResponse & { createdOnDate: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    tableName: { displayAs: 'Table Name', maxWidth: '20ch' },
    message: { displayAs: 'Message', maxWidth: '50ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region Database-Error-Log-List
  ngOnInit(): void {
    this.loadDatabaseErrorLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadDatabaseErrorLogs();
  }

  refreshDatabaseErrorLogs(): void {
    this.loadDatabaseErrorLogs(true);
  }

  deleteAllDatabaseErrorLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllDatabaseError().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadDatabaseErrorLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openDatabaseError(row: DatabaseErrorLogResponse): void {
    if (!row?.id) {
      return;
    }
    this.openDatabaseErrorLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadDatabaseErrorLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllDatabaseError().pipe(take(1), finalize(() => this.isLoading = false)).subscribe({
      next: (rows: DatabaseErrorLogResponse[]) => {
        this.rows = (rows || []).map(row => ({
          ...row,
          createdOnDate: this.formatter.formatDateTimeOffsetAsDateOnly(row.createdOn) || '-'
        }));
        if (emitCallback) {
          this.listActionCompleted.emit();
        }
      },
      error: () => {
        this.rows = [];
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {}
  //#endregion
}
