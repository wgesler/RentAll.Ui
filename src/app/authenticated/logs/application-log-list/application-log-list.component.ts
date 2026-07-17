import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ApplicationLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-application-log-list',
  templateUrl: './application-log-list.component.html',
  styleUrl: './application-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class ApplicationLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openApplicationLog = new EventEmitter<ApplicationLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  rows: Array<ApplicationLogResponse & { createdOnDate: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    level: { displayAs: 'Level', maxWidth: '10ch' },
    category: { displayAs: 'Category', maxWidth: '50ch' },
    message: { displayAs: 'Message', maxWidth: '75ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region Application-Log-List
  ngOnInit(): void {
    this.loadApplicationLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadApplicationLogs();
  }

  refreshApplicationLogs(): void {
    this.loadApplicationLogs(true);
  }

  deleteAllApplicationLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllApplicationLog().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadApplicationLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openApplication(row: ApplicationLogResponse): void {
    if (!row?.id) {
      return;
    }
    this.openApplicationLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadApplicationLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllApplicationLog().pipe(take(1), finalize(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (rows: ApplicationLogResponse[]) => {
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
