import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceResponse, LedgerLineResponse } from '../../accounting/models/invoice.model';
import { InvoiceService } from '../../accounting/services/invoice.service';

@Component({
  standalone: true,
  selector: 'app-mobile-invoice-page',
  imports: [MaterialModule],
  templateUrl: './mobile-invoice-page.component.html',
  styleUrl: './mobile-invoice-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileInvoicePageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() invoiceId = '';
  private invoiceService = inject(InvoiceService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  invoice: InvoiceResponse | null = null;
  lines: LedgerLineResponse[] = [];
  isPageReady = false;
  loadFailed = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['invoice']));
  destroy$ = new Subject<void>();

  //#region Mobile-Invoice-Page
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadInvoice();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoiceId'] && !changes['invoiceId'].firstChange) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'invoice');
      this.loadInvoice();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  formatDate(value: string | null | undefined): string {
    const dateOnly = String(value || '').trim().slice(0, 10);
    const [year, month, day] = dateOnly.split('-');
    if (!year || !month || !day) {
      return dateOnly;
    }
    return `${month}/${day}/${year}`;
  }

  formatAmount(value: number | null | undefined): string {
    return this.formatter.currencyUsd(Number(value) || 0);
  }

  dueAmount(): number {
    const total = Number(this.invoice?.totalAmount) || 0;
    const paid = Number(this.invoice?.paidAmount) || 0;
    return Math.round((total - paid) * 100) / 100;
  }
  //#endregion

  //#region Data Loading Methods
  loadInvoice(): void {
    const invoiceId = this.invoiceId.trim();
    this.invoice = null;
    this.lines = [];
    this.loadFailed = false;
    if (!invoiceId) {
      this.loadFailed = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice');
      this.markViewForCheck();
      return;
    }

    this.invoiceService.getInvoiceByGuid(invoiceId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice'))).subscribe({
      next: invoice => {
        this.invoice = invoice;
        this.lines = [...(invoice?.ledgerLines || [])].sort((left, right) => Number(left.lineNumber || 0) - Number(right.lineNumber || 0));
        this.markViewForCheck();
      },
      error: () => {
        this.invoice = null;
        this.lines = [];
        this.loadFailed = true;
        this.markViewForCheck();
      }
    });
  }
  //#endregion
}
