import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { PropertyUploadLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-property-upload-log-list',
  templateUrl: './property-upload-log-list.component.html',
  styleUrl: './property-upload-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class PropertyUploadLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openPropertyUploadLog = new EventEmitter<PropertyUploadLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  rows: Array<PropertyUploadLogResponse & { createdOnDate: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    eventType: { displayAs: 'Event', maxWidth: '12ch' },
    status: { displayAs: 'Status', maxWidth: '10ch' },
    message: { displayAs: 'Message', maxWidth: '60ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region Property-Upload-Log-List
  ngOnInit(): void {
    this.loadPropertyUploadLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadPropertyUploadLogs();
  }

  refreshPropertyUploadLogs(): void {
    this.loadPropertyUploadLogs(true);
  }

  deleteAllPropertyUploadLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllPropertyUploadLog().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadPropertyUploadLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openPropertyUpload(row: PropertyUploadLogResponse): void {
    if (!row?.id) {
      return;
    }
    this.openPropertyUploadLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadPropertyUploadLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllPropertyUploadLog().pipe(take(1), finalize(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (rows: PropertyUploadLogResponse[]) => {
        this.rows = (rows || []).map(row => ({
          ...row,
          propertyCode: row.propertyCode || '-',
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
