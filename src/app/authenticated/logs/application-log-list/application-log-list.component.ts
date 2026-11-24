import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ApplicationLogResponse } from '../models/log.model';
import { NumberLogViewDialogComponent, NumberLogViewDialogData } from '../number-log-view-dialog/number-log-view-dialog.component';
import { LogService } from '../services/log.service';
import { ToastrService } from 'ngx-toastr';

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
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);

  rows: Array<ApplicationLogResponse & { createdOnDate: string; copyHidden: boolean; copyTooltip: string; viewHidden: boolean }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    level: { displayAs: 'Level', maxWidth: '10ch' },
    category: { displayAs: 'Category', maxWidth: '50ch' },
    message: { displayAs: 'Message', maxWidth: '75ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '22ch' }
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
          createdOnDate: this.formatter.formatDateTimeOffsetAsDateTime(row.createdOn) || '-',
          // View and Copy only on Number rows that carry a request, response or notification body.
          copyHidden: !this.isNumberRow(row),
          viewHidden: !this.isNumberRow(row),
          copyTooltip: 'Copy EasyPay request / response'
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
  /** Number rows with a body to copy: "[EasyPay {Action}Request]", "[EasyPay {Action}Response]" and notifications we receive. */
  isNumberRow(row: ApplicationLogResponse): boolean {
    const message = row?.message ?? '';
    return message.startsWith('[EasyPay ') && /"(Request|Response|Body)"\s*:/.test(row?.properties ?? '');
  }

  /** Shows exactly what Copy puts on the clipboard. */
  viewNumberRow(row: ApplicationLogResponse): void {
    const data: NumberLogViewDialogData = { title: this.numberRowLabel(row), text: this.buildNumberRowText(row) };
    this.dialog.open(NumberLogViewDialogComponent, { data, width: '60rem', maxWidth: '95vw' });
  }

  /** Copies a Number row as email-ready text. */
  copyNumberRow(row: ApplicationLogResponse): void {
    navigator.clipboard.writeText(this.buildNumberRowText(row)).then(
      () => this.toastr.success('EasyPay request / response copied.'),
      () => this.toastr.error('Could not copy to the clipboard.')
    );
  }

  /** The action and direction from "[EasyPay {Action}{Direction}] ...", e.g. CreateCardFormRequest. */
  numberRowLabel(row: ApplicationLogResponse): string {
    return (row.message ?? '').match(/^\[EasyPay ([^\]]+)\]/)?.[1] ?? 'EasyPay';
  }

  /** A Number row as email-ready text: the action and direction, the time, then the JSON body, formatted. */
  buildNumberRowText(row: ApplicationLogResponse): string {
    let properties: Record<string, unknown> = {};
    try {
      properties = JSON.parse(row.properties || '{}') as Record<string, unknown>;
    } catch {
      properties = {};
    }
    const pretty = (value: unknown): string => {
      const text = typeof value === 'string' ? value : '';
      if (!text) {
        return '(none)';
      }
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    };

    const time = this.formatter.formatDateTimeOffsetAsDateTime(row.createdOn) || row.createdOn;
    const lines: string[] = [this.numberRowLabel(row), `Time: ${time}`];
    if (properties['Request'] !== undefined) {
      lines.push(`${properties['Method'] ?? ''} ${properties['Url'] ?? ''}`.trim(), '', 'Request:', pretty(properties['Request']));
    }
    if (properties['Response'] !== undefined) {
      lines.push(`Status: ${properties['Status'] ?? ''}   ElapsedMs: ${properties['ElapsedMs'] ?? ''}`, '', 'Response:', pretty(properties['Response']));
    }
    if (properties['Body'] !== undefined) {
      lines.push('', 'Body:', pretty(properties['Body']));
    }
    return lines.join('\n');
  }

  ngOnDestroy(): void {}
  //#endregion
}
