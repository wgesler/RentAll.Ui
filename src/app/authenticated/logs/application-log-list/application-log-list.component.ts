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

  rows: Array<ApplicationLogResponse & { createdOnDate: string; copyHidden: boolean; copyTooltip: string }> = [];
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
          createdOnDate: this.formatter.formatDateTimeOffsetAsDateOnly(row.createdOn) || '-',
          // Copy button only on EasyPay rows: [EasyPayLog] calls and the webhooks EasyPay sends us.
          copyHidden: !this.isEasyPayRow(row),
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
  /** EasyPay rows: [EasyPayLog] calls we make, and the webhooks EasyPay sends us ([NumberPayment] Step=Raw). */
  isEasyPayRow(row: ApplicationLogResponse): boolean {
    const message = row?.message ?? '';
    return message.startsWith('[EasyPayLog]') || message.startsWith('[NumberPayment] Step=Raw');
  }

  /** Copies an EasyPay row as email-ready text: the call, then the request and response JSON, formatted. */
  copyEasyPayRow(row: ApplicationLogResponse): void {
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

    const lines: string[] = [];
    if (row.message?.startsWith('[EasyPayLog]')) {
      lines.push(`EasyPay call: ${properties['Method'] ?? ''} ${properties['Url'] ?? ''}`.trim());
      lines.push(`Status: ${properties['Status'] ?? properties['Error'] ?? ''}   Time: ${row.createdOn}`);
      lines.push('', 'Request:', pretty(properties['Request']), '', 'Response:', pretty(properties['Response']));
    } else {
      lines.push('Received from EasyPay (webhook)', `Time: ${row.createdOn}`, '', 'Body:', pretty(properties['Body']));
    }

    navigator.clipboard.writeText(lines.join('\n')).then(
      () => this.toastr.success('EasyPay request / response copied.'),
      () => this.toastr.error('Could not copy to the clipboard.')
    );
  }

  ngOnDestroy(): void {}
  //#endregion
}
