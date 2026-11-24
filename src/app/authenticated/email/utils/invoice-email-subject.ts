const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Invoice email subject, e.g. "Invoice R-000000035-018 from AvenueWest – November 2026". The invoice number is left
 * out when the office has Exclude Invoice from Subject checked.
 */
export function buildInvoiceEmailSubject(
  companyName: string | null | undefined,
  period: string | null | undefined,
  invoiceCode?: string | null,
  excludeInvoiceCode = false
): string {
  const name = (companyName || '').trim();
  const monthYear = formatInvoiceSubjectMonthYear(period);
  const code = excludeInvoiceCode ? '' : (invoiceCode || '').trim();
  const invoice = code ? `Invoice ${code}` : 'Invoice';
  if (name && monthYear) {
    return `${invoice} from ${name} – ${monthYear}`;
  }
  if (name) {
    return `${invoice} from ${name}`;
  }
  return monthYear ? `${invoice} – ${monthYear}` : invoice;
}

function formatInvoiceSubjectMonthYear(period: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec((period || '').trim());
  if (!match) {
    return '';
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const month = monthNames[monthIndex];
  if (!month || !Number.isFinite(year)) {
    return '';
  }
  return `${month} ${year}`;
}
