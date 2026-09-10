import { TestBed } from '@angular/core/testing';
import { JournalEntryKind } from './accounting-enum';
import { buildArAgingBucketDefinitions } from './ar-aging-report.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';
import { MappingService } from '../../../services/mapping.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { WorkOrderAmountService } from '../../maintenance/services/work-order-amount.service';

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

describe('MappingService AR aging prepayment passthrough', () => {
  let mappingService: MappingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MappingService,
        { provide: FormatterService, useValue: {} },
        {
          provide: UtilityService,
          useValue: {
            toDateOnlyJsonString: (value: string | null | undefined) => String(value ?? '').split('T')[0] || null,
            coerceCalendarDateStringFromApi: (value: unknown) => String(value ?? '').split('T')[0] || null
          }
        },
        { provide: WorkOrderAmountService, useValue: {} }
      ]
    });

    mappingService = TestBed.inject(MappingService);
  });

  it('shows zero AR due for held prepayment before invoice period', () => {
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

    const invoiceDetails = mappingService.buildArAgingInvoiceDetailsFromJournalLines(
      lines,
      '2025-07-31',
      new Map<string, string>(),
      new Map<string, number | null>(),
      new Map<string, string>(),
      buildArAgingBucketDefinitions(30, 90)
    );

    const totalDue = invoiceDetails.reduce((sum, detail) => sum + detail.balanceDue, 0);
    expect(totalDue).toBe(0);
  });

  it('shows zero AR due after invoice and prepayment apply', () => {
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
      }),
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

    const invoiceDetails = mappingService.buildArAgingInvoiceDetailsFromJournalLines(
      lines,
      '2025-08-31',
      new Map<string, string>(),
      new Map<string, number | null>(),
      new Map<string, string>(),
      buildArAgingBucketDefinitions(30, 90)
    );

    const totalDue = invoiceDetails.reduce((sum, detail) => sum + detail.balanceDue, 0);
    expect(totalDue).toBe(0);
  });
});
