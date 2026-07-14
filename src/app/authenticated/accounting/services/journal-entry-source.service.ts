import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { SourceType } from '../models/accounting-enum';
import { InvoiceResponse } from '../models/invoice.model';
import { JournalEntryLineListDisplay } from '../models/journal-entry.model';
import { InvoiceService } from './invoice.service';

export type JournalEntrySourceKind = 'invoice' | 'receipt';

export interface JournalEntrySourceTarget {
  kind: JournalEntrySourceKind;
  invoice?: InvoiceResponse;
  receipt?: ReceiptResponse;
}

@Injectable({
  providedIn: 'root'
})
export class JournalEntrySourceService {
  private invoiceService = inject(InvoiceService);
  private receiptService = inject(ReceiptService);


  resolveSource(row: JournalEntryLineListDisplay): Observable<JournalEntrySourceTarget | null> {
    const sourceId = (row.sourceId || '').trim();
    if (!row.sourceTypeId || !sourceId) {
      return of(null);
    }

    switch (row.sourceTypeId) {
      case SourceType.Invoice:
        return this.invoiceService.getInvoiceByGuid(sourceId).pipe(
          switchMap(invoice => {
            if (invoice?.invoiceId) {
              return of({ kind: 'invoice' as const, invoice });
            }

            return this.findInvoiceForJournalEntrySource(sourceId, row).pipe(
              map(found => found?.invoiceId ? { kind: 'invoice' as const, invoice: found } : null)
            );
          })
        );
      case SourceType.InvoicePayment:
        return this.getInvoiceByLedgerLineId(sourceId, row).pipe(
          map(invoice => invoice?.invoiceId ? { kind: 'invoice', invoice } : null)
        );
      case SourceType.Bill:
      case SourceType.BillPayment:
      case SourceType.Receipt:
        return this.receiptService.getReceiptById(sourceId).pipe(
          map(receipt => receipt?.receiptId ? { kind: 'receipt', receipt } : null)
        );
      default:
        return of(null);
    }
  }

  getInvoiceByLedgerLineId(ledgerLineId: string, row: JournalEntryLineListDisplay): Observable<InvoiceResponse | null> {
    const normalizedLedgerLineId = ledgerLineId.toLowerCase();
    const findInvoice = (invoices: InvoiceResponse[]) => invoices.find(invoice =>
      (invoice.ledgerLines ?? []).some(line => (line.ledgerLineId || '').trim().toLowerCase() === normalizedLedgerLineId)
    ) ?? null;

    return this.invoiceService.searchInvoices({
      officeIds: [row.officeId],
      reservationId: row.reservationId ?? null,
      includeInactive: true,
      includePaid: true
    }).pipe(
      map(findInvoice),
      switchMap(invoice => {
        if (invoice || !row.reservationId) {
          return of(invoice);
        }

        return this.invoiceService.searchInvoices({
          officeIds: [row.officeId],
          includeInactive: true,
          includePaid: true
        }).pipe(map(findInvoice));
      })
    );
  }

  private findInvoiceForJournalEntrySource(sourceId: string, row: JournalEntryLineListDisplay): Observable<InvoiceResponse | null> {
    return this.getInvoiceByLedgerLineId(sourceId, row).pipe(
      switchMap(invoice => {
        if (invoice?.invoiceId) {
          return of(invoice);
        }

        if (!row.reservationId) {
          return of(null);
        }

        return this.invoiceService.searchInvoices({
          officeIds: [row.officeId],
          reservationId: row.reservationId,
          includeInactive: true,
          includePaid: true
        }).pipe(
          map(invoices => invoices.find(item => item.invoiceId === sourceId) ?? invoices[0] ?? null)
        );
      })
    );
  }
}
