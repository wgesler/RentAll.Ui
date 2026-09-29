import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceResponse, LedgerLineListDisplay } from '../models/invoice.model';

export interface InvoicePreviewListRowDisplay {
  propertyCode: string;
  reservationCode: string;
  occupant: string;
  invoiceStartDate: string;
  invoiceEndDate: string;
  monthStart: string;
  periodStart: string;
  periodEnd: string;
  daysStayed: string | number;
  daysBilled: string | number;
  totalAmount: string;
  totalAmountValue: number;
  ledgerLines?: LedgerLineListDisplay[];
  expand?: string;
  expanded?: boolean;
  selected?: boolean;
  expandClick?: (event: Event, item: InvoicePreviewListRowDisplay) => void;
}

export function buildInvoicePreviewListRowDisplay(
  invoice: InvoiceResponse,
  formatter: FormatterService,
  utility: UtilityService,
  options: {
    rowKey: string;
    expanded: boolean;
    selected: boolean;
    mappedLedgerLines: LedgerLineListDisplay[];
    reservationCodeFallback?: string;
    propertyCodeFallback?: string;
    occupantFallback?: string;
    expandClick: (event: Event, item: InvoicePreviewListRowDisplay) => void;
  }
): InvoicePreviewListRowDisplay {
  const periodStartRaw =
    invoice.billedPeriodStart ??
    utility.coerceCalendarDateStringFromApi(invoice.startDate) ??
    null;
  const periodEndRaw =
    invoice.billedPeriodEnd ??
    utility.coerceCalendarDateStringFromApi(invoice.endDate) ??
    null;
  const monthStartRaw = invoice.billedMonthStart || invoice.accountingPeriod;
  const totalAmountValue = Number(invoice.totalAmount) || 0;
  const occupant =
    (invoice.tenantName || options.occupantFallback || '').trim() || '—';

  return {
    propertyCode: (invoice.propertyCode || options.propertyCodeFallback || '').trim() || '—',
    reservationCode: (invoice.reservationCode || options.reservationCodeFallback || '').trim() || '—',
    occupant,
    invoiceStartDate: periodStartRaw ? formatter.formatDateString(periodStartRaw) : '—',
    invoiceEndDate: periodEndRaw ? formatter.formatDateString(periodEndRaw) : '—',
    monthStart: formatter.formatDateString(monthStartRaw),
    periodStart: periodStartRaw ? formatter.formatDateString(periodStartRaw) : '—',
    periodEnd: periodEndRaw ? formatter.formatDateString(periodEndRaw) : '—',
    daysStayed: invoice.billedDaysStayed ?? '—',
    daysBilled: invoice.billedDaysBilled ?? '—',
    totalAmount: '$' + formatter.currency(totalAmountValue),
    totalAmountValue,
    ledgerLines: options.mappedLedgerLines,
    expand: options.rowKey,
    expanded: options.expanded,
    selected: options.selected,
    expandClick: options.expandClick
  };
}
