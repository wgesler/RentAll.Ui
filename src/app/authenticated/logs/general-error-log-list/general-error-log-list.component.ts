import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, firstValueFrom, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { InvoiceResponse } from '../../accounting/models/invoice.model';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { GeneralErrorLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-general-error-log-list',
  templateUrl: './general-error-log-list.component.html',
  styleUrl: './general-error-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class GeneralErrorLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openGeneralErrorLog = new EventEmitter<GeneralErrorLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private invoiceService = inject(InvoiceService);
  private receiptService = inject(ReceiptService);

  rows: Array<GeneralErrorLogResponse & { reservationCodeDisplay: string; propertyCodeDisplay: string; invoiceCodeDisplay: string; receiptCodeDisplay: string; createdOnDate: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    reservationCodeDisplay: { displayAs: 'Reservation', maxWidth: '12ch' },
    propertyCodeDisplay: { displayAs: 'Property', maxWidth: '12ch' },
    invoiceCodeDisplay: { displayAs: 'Invoice', maxWidth: '12ch' },
    receiptCodeDisplay: { displayAs: 'Receipt', maxWidth: '12ch' },
    message: { displayAs: 'Message', maxWidth: '45ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region General-Error-Log-List
  ngOnInit(): void {
    this.loadGeneralErrorLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadGeneralErrorLogs();
  }

  refreshGeneralErrorLogs(): void {
    this.loadGeneralErrorLogs(true);
  }

  deleteAllGeneralErrorLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllGeneralError().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadGeneralErrorLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openGeneralError(row: GeneralErrorLogResponse): void {
    if (!row?.id) {
      return;
    }
    this.openGeneralErrorLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadGeneralErrorLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllGeneralError().pipe(take(1), finalize(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (rows: GeneralErrorLogResponse[]) => {
        void this.loadCodeDisplays(rows || [], emitCallback);
      },
      error: () => {
        this.rows = [];
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  async loadCodeDisplays(rows: GeneralErrorLogResponse[], emitCallback = false): Promise<void> {
    let properties: PropertyListResponse[] = [];
    let reservations: ReservationListResponse[] = [];
    let invoices: InvoiceResponse[] = [];

    try {
      properties = await firstValueFrom(this.propertyService.getActivePropertyList().pipe(take(1)));
    } catch {}

    try {
      reservations = await firstValueFrom(this.reservationService.getReservationList().pipe(take(1)));
    } catch {}

    const officeIds = Array.from(new Set(rows.map(row => row.officeId || 0).filter(id => id > 0)));
    if (officeIds.length > 0) {
      try {
        invoices = await firstValueFrom(this.invoiceService.searchInvoices({ officeIds, includeInactive: true, includePaid: true }).pipe(take(1)));
      } catch {}
    }

    const receiptCodeById = await this.buildReceiptCodeMap(rows);
    const propertyCodeById = new Map<string, string>((properties || []).map(property => [property.propertyId, property.propertyCode]));
    const reservationCodeById = new Map<string, string>((reservations || []).map(reservation => [reservation.reservationId, reservation.reservationCode]));
    const invoiceCodeById = new Map<string, string>((invoices || []).map(invoice => [invoice.invoiceId, invoice.invoiceCode]));

    this.rows = rows.map(row => {
      const reservationId = row.reservationId || '';
      const propertyId = row.propertyId || '';
      const invoiceId = row.invoiceId || '';
      const receiptId = row.receiptId || '';
      return {
        ...row,
        reservationCodeDisplay: reservationCodeById.get(reservationId) || '-',
        propertyCodeDisplay: propertyCodeById.get(propertyId) || '-',
        invoiceCodeDisplay: invoiceCodeById.get(invoiceId) || '-',
        receiptCodeDisplay: receiptCodeById.get(receiptId) || '-',
        createdOnDate: this.formatter.formatDateTimeOffsetAsDateOnly(row.createdOn) || '-'
      };
    });
    if (emitCallback) {
      this.listActionCompleted.emit();
    }
  }
  //#endregion

  //#region Form Response Methods
  async buildReceiptCodeMap(rows: GeneralErrorLogResponse[]): Promise<Map<string, string>> {
    const receiptCodeById = new Map<string, string>();
    const uniqueReceiptIds = Array.from(new Set(rows.map(row => row.receiptId || '').filter(id => !!id)));
    for (const receiptId of uniqueReceiptIds) {
      try {
        const receipt = await firstValueFrom(this.receiptService.getReceiptById(receiptId).pipe(take(1)));
        receiptCodeById.set(receiptId, this.resolveReceiptCode(receipt));
      } catch {
        receiptCodeById.set(receiptId, '-');
      }
    }
    return receiptCodeById;
  }
  //#endregion

  //#region Get Methods
  resolveReceiptCode(receipt: ReceiptResponse | null | undefined): string {
    return (receipt?.receiptCode || receipt?.billNumber || '').trim() || '-';
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {}
  //#endregion
}
