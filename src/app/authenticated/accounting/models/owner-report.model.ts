import { OwnerStatementActivityLinkSelection, OwnerStatementAmountDrillDownSelection, OwnerStatementDescriptionSegment, OwnerStatementDrillDownMetric, OwnerStatementJournalEntryLineResponse, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementJournalEntryLineSelection, OwnerStatementListViewState, OwnerStatementOfficeGroup, OwnerStatementPropertyActivityLineDisplay, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest, OwnerStatementPropertyRow, OwnerStatementReportKind, OwnerStatementResponse, OwnerStatementSearchRequest, OwnerStatementSearchResponse, OwnerStatementVisibleRow } from './owner-statement.model';

export type OwnerReportSearchRequest = OwnerStatementSearchRequest;
export type OwnerReportSearchResponse = OwnerStatementSearchResponse;
export type OwnerReportResponse = OwnerStatementResponse;
export type OwnerReportPropertyRow = OwnerStatementPropertyRow;
export type OwnerReportOfficeGroup = OwnerStatementOfficeGroup;
export type OwnerReportVisibleRow = OwnerStatementVisibleRow;
export type OwnerReportPropertyActivityLineResponse = OwnerStatementPropertyActivityLineResponse;
export type OwnerReportPropertyActivityLineSearchRequest = OwnerStatementPropertyActivityLineSearchRequest;
export type OwnerReportPropertyActivityLineDisplay = OwnerStatementPropertyActivityLineDisplay;
export type OwnerReportDescriptionSegment = OwnerStatementDescriptionSegment;
export type OwnerReportKind = OwnerStatementReportKind;
export type OwnerReportDrillDownMetric = OwnerStatementDrillDownMetric;
export type OwnerReportActivityLinkSelection = OwnerStatementActivityLinkSelection;
export type OwnerReportAmountDrillDownSelection = OwnerStatementAmountDrillDownSelection;
export type OwnerReportListViewState = OwnerStatementListViewState;
export type OwnerReportJournalEntryLineSearchRequest = OwnerStatementJournalEntryLineSearchRequest;
export type OwnerReportJournalEntryLineResponse = OwnerStatementJournalEntryLineResponse;
export type OwnerReportJournalEntryLineSelection = OwnerStatementJournalEntryLineSelection;

/** Body for POST report/owner-cash/search — matches API GetOwnerCashReportDto. */
export type OwnerCashReportSearchRequest = OwnerStatementSearchRequest;

/** Body for POST report/owner-accrual/search — matches API GetOwnerAccrualReportDto. */
export type OwnerAccrualReportSearchRequest = OwnerStatementSearchRequest;

export interface OwnerCashReportRowResponse {
  propertyId: string;
  officeId: number;
  officeName: string;
  ownerId?: string | null;
  propertyCode: string;
  companyName?: string | null;
  ownerNames: string;
  ownerNameLine: string;
  startingBalance: number;
  receivedIncome: number;
  ownerExpenses: number;
  ownerPayment: number;
  endingBalance: number;
  workingCapital: number;
}

export interface OwnerCashReportResponse {
  rows: OwnerCashReportRowResponse[];
  propertyActivityLines: OwnerReportPropertyActivityLineResponse[];
}

export interface OwnerAccrualReportRowResponse {
  propertyId: string;
  officeId: number;
  officeName: string;
  ownerId?: string | null;
  propertyCode: string;
  companyName?: string | null;
  ownerNames: string;
  ownerNameLine: string;
  startingBalance: number;
  invoicedIncome: number;
  prepaidIncome: number;
  paidIncome: number;
  unpaidIncome: number;
  ownerExpenses: number;
  ownerProfit: number;
}

export interface OwnerAccrualReportResponse {
  rows: OwnerAccrualReportRowResponse[];
  propertyActivityLines: OwnerReportPropertyActivityLineResponse[];
}

export interface OwnerReportsBundleResponse {
  cash: OwnerCashReportResponse;
  accrual: OwnerAccrualReportResponse;
}
