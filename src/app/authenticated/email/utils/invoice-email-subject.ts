const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function buildInvoiceEmailSubject(companyName: string | null | undefined, period: string | null | undefined): string {
  const name = (companyName || '').trim();
  const monthYear = formatInvoiceSubjectMonthYear(period);
  if (name && monthYear) {
    return `Invoice from ${name} – ${monthYear}`;
  }
  if (name) {
    return `Invoice from ${name}`;
  }
  return monthYear ? `Invoice – ${monthYear}` : 'Invoice';
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
