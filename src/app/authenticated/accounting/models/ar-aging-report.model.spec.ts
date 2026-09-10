import { JournalEntryKind } from './accounting-enum';
import {
  adjustArAgingJournalLineForPrepaymentPassthrough,
  adjustArAgingJournalLinesForPrepaymentPassthrough,
  buildArAgingBucketDefinitions,
  buildArAgingPrepaymentPassthroughCreditByKey
} from './ar-aging-report.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';

function buildArLine(overrides: Partial<JournalEntryLineSearchResponse>): JournalEntryLineSearchResponse {
  return {
    journalEntryLineId: overrides.journalEntryLineId ?? 'line-1',
    journalEntryId: overrides.journalEntryId ?? 'je-1',
    journalEntryCode: overrides.journalEntryCode ?? 'JE-000001',
    chartOfAccountId: overrides.chartOfAccountId ?? 1200,
    debit: overrides.debit ?? 0,
    credit: overrides.credit ?? 0,
    officeId: overrides.officeId ?? 1,
    transactionDate: overrides.transactionDate ?? '2025-06-30',
    accountingPeriod: overrides.accountingPeriod ?? '2025-08-01',
    postingStatusId: overrides.postingStatusId ?? 1,
    journalEntryKindId: overrides.journalEntryKindId ?? JournalEntryKind.Payment,
    sourceId: overrides.sourceId ?? 'invoice-1',
    sourceCode: overrides.sourceCode ?? 'R-000396-001',
    contactId: overrides.contactId ?? 'contact-1',
    contactName: overrides.contactName ?? 'Tenant One',
    reservationId: overrides.reservationId ?? 'reservation-1',
    paymentId: overrides.paymentId ?? 'payment-1',
    journalEntryCreatedOn: overrides.journalEntryCreatedOn ?? '2025-06-30T00:00:00Z',
    createdOn: overrides.createdOn ?? '2025-06-30T00:00:00Z',
    createdBy: overrides.createdBy ?? 'user-1',
    modifiedOn: overrides.modifiedOn ?? '2025-06-30T00:00:00Z',
    modifiedBy: overrides.modifiedBy ?? 'user-1'
  };
}

describe('AR aging prepayment passthrough helpers', () => {
  it('drops PrePaymentReceive lines and fully offsets paired Payment credits', () => {
    const lines = [
      buildArLine({
        journalEntryLineId: 'payment-ar',
        journalEntryKindId: JournalEntryKind.Payment,
        debit: 0,
        credit: 1000,
        transactionDate: '2025-06-30',
        accountingPeriod: '2025-08-01'
      }),
      buildArLine({
        journalEntryLineId: 'prepay-receive-ar',
        journalEntryKindId: JournalEntryKind.PrePaymentReceive,
        debit: 1000,
        credit: 0,
        transactionDate: '2025-06-30',
        accountingPeriod: '2025-06-01'
      })
    ];

    expect(adjustArAgingJournalLinesForPrepaymentPassthrough(lines)).toEqual([]);
  });

  it('keeps only the non-prepay portion of a cross-period payment credit', () => {
    const lines = [
      buildArLine({
        journalEntryLineId: 'payment-ar',
        journalEntryKindId: JournalEntryKind.Payment,
        debit: 0,
        credit: 2000,
        transactionDate: '2025-06-15',
        accountingPeriod: '2025-06-01'
      }),
      buildArLine({
        journalEntryLineId: 'prepay-receive-ar',
        journalEntryKindId: JournalEntryKind.PrePaymentReceive,
        debit: 800,
        credit: 0,
        transactionDate: '2025-06-15',
        accountingPeriod: '2025-06-01'
      })
    ];

    const adjusted = adjustArAgingJournalLinesForPrepaymentPassthrough(lines);
    expect(adjusted.length).toBe(1);
    expect(adjusted[0].journalEntryLineId).toBe('payment-ar');
    expect(adjusted[0].credit).toBe(1200);
    expect(adjusted[0].debit).toBe(0);
  });

  it('excludes early Payment credits when no receive line is present yet', () => {
    const line = buildArLine({
      journalEntryLineId: 'payment-ar',
      journalEntryKindId: JournalEntryKind.Payment,
      debit: 0,
      credit: 1000,
      transactionDate: '2025-06-30',
      accountingPeriod: '2025-08-01'
    });

    const passthroughCreditByKey = buildArAgingPrepaymentPassthroughCreditByKey([]);
    expect(adjustArAgingJournalLineForPrepaymentPassthrough(line, passthroughCreditByKey)).toBeNull();
  });

  it('keeps invoice charge and PrePaymentApply lines for aging', () => {
    const lines = [
      buildArLine({
        journalEntryLineId: 'invoice-ar',
        journalEntryKindId: JournalEntryKind.Charge,
        debit: 1000,
        credit: 0,
        transactionDate: '2025-08-01',
        accountingPeriod: '2025-08-01'
      }),
      buildArLine({
        journalEntryLineId: 'prepay-apply-ar',
        journalEntryKindId: JournalEntryKind.PrePaymentApply,
        debit: 0,
        credit: 1000,
        transactionDate: '2025-08-01',
        accountingPeriod: '2025-08-01'
      })
    ];

    expect(adjustArAgingJournalLinesForPrepaymentPassthrough(lines)).toEqual(lines);
  });

  it('leaves same-period invoice payments unchanged', () => {
    const line = buildArLine({
      journalEntryLineId: 'payment-ar',
      journalEntryKindId: JournalEntryKind.Payment,
      debit: 0,
      credit: 500,
      transactionDate: '2025-08-15',
      accountingPeriod: '2025-08-01'
    });

    expect(adjustArAgingJournalLinesForPrepaymentPassthrough([line])).toEqual([line]);
  });
});

describe('AR aging bucket definitions', () => {
  it('builds standard aging buckets', () => {
    const buckets = buildArAgingBucketDefinitions(30, 90);
    expect(buckets.some(bucket => bucket.id === 'current')).toBeTrue();
    expect(buckets.some(bucket => bucket.id === 'days-1-30')).toBeTrue();
  });
});
