export enum TransactionType {
  Charge = 0,
  Payment = 1,
  Deposit = 2,
  SDW = 3,
  Expense = 4,
  CostOfGoodsSold = 5,
  Asset = 6,
  Liability = 7,
  Equity = 8,
  Income = 9
 }

export const TransactionTypeLabels: { value: TransactionType, label: string }[] = [
  { value: TransactionType.Charge, label: 'Charge' },
  { value: TransactionType.Payment, label: 'Payment' },
  { value: TransactionType.Deposit, label: 'Deposit' },
  { value: TransactionType.SDW, label: 'SDW' },
  { value: TransactionType.Expense, label: 'Expense' },
  { value: TransactionType.CostOfGoodsSold, label: 'Cost Of Goods Sold' },
  { value: TransactionType.Asset, label: 'Asset' },
  { value: TransactionType.Liability, label: 'Liability' },
  { value: TransactionType.Equity, label: 'Equity' },
  { value: TransactionType.Income, label: 'Income' },
];

export function getTransactionType(transactionTypeId: number | undefined): string {
  if (transactionTypeId === undefined || transactionTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [TransactionType.Charge]: 'Charge',
    [TransactionType.Payment]: 'Payment',
    [TransactionType.Deposit]: 'Deposit',
    [TransactionType.SDW]: 'SDW',
    [TransactionType.Expense]: 'Expense',
    [TransactionType.CostOfGoodsSold]: 'Cost Of Goods Sold',
    [TransactionType.Asset]: 'Asset',
    [TransactionType.Liability]: 'Liability',
    [TransactionType.Equity]: 'Equity',
    [TransactionType.Income]: 'Income',
   };
  
  return typeMap[transactionTypeId] || '';
}

export enum SourceType {
  Check = 0,
  Deposit = 1,
  Invoice = 2,
  InvoicePayment = 3,
  InvoiceCredit = 4,
  Bill = 5,
  BillPayment = 6,
  BillCredit = 7,
  Receipt = 8,
  CreditMemo = 9,
  Journal = 10,
  Adjustment = 11,
  CreditCard = 12,
  CreditCardCredit = 13,
  CreditCardRefund = 14,
  SecurityDeposit = 15,
  OwnerDistribution = 16,
  Paycheck = 17,
  PayrollLiabilityCheck = 18,
  YtdAdjustment = 19,
  LiabilityAdjustment = 20,
  Transfer = 21,
  WorkOrder = 22,
  Reservation = 23,
  LinensAndTowels = 24
}

export const SourceTypeCodes: Record<SourceType, string> = {
  [SourceType.Check]: 'CK',
  [SourceType.Deposit]: 'DEP',
  [SourceType.Invoice]: 'INV',
  [SourceType.InvoicePayment]: 'PAY',
  [SourceType.InvoiceCredit]: 'PAY',
  [SourceType.Bill]: 'BILL',
  [SourceType.BillPayment]: 'BPAY',
  [SourceType.BillCredit]: 'BCRD',
  [SourceType.Receipt]: 'REC',
  [SourceType.CreditMemo]: 'CMEM',
  [SourceType.Journal]: 'JRN',
  [SourceType.Adjustment]: 'ADJ',
  [SourceType.CreditCard]: 'CC',
  [SourceType.CreditCardCredit]: 'CCC',
  [SourceType.CreditCardRefund]: 'CCRF',
  [SourceType.SecurityDeposit]: 'SDEP',
  [SourceType.OwnerDistribution]: 'ODIS',
  [SourceType.Paycheck]: 'PAY',
  [SourceType.PayrollLiabilityCheck]: 'PLB',
  [SourceType.YtdAdjustment]: 'YADJ',
  [SourceType.LiabilityAdjustment]: 'LADJ',
  [SourceType.Transfer]: 'TRAN',
  [SourceType.WorkOrder]: 'WO',
  [SourceType.Reservation]: 'RES',
  [SourceType.LinensAndTowels]: 'LIN',
};

export const SourceTypeLabels: { value: SourceType, label: string }[] = [
  { value: SourceType.Check, label: 'Check' },
  { value: SourceType.Deposit, label: 'Deposit' },
  { value: SourceType.Invoice, label: 'Invoice' },
  { value: SourceType.InvoicePayment, label: 'Invoice Payment' },
  { value: SourceType.InvoiceCredit, label: 'Invoice Credit' },
  { value: SourceType.Bill, label: 'Bill' },
  { value: SourceType.BillPayment, label: 'Bill Payment' },
  { value: SourceType.BillCredit, label: 'Bill Credit' },
  { value: SourceType.Receipt, label: 'Sales Receipt' },
  { value: SourceType.CreditMemo, label: 'Credit Memo' },
  { value: SourceType.Journal, label: 'Journal' },
  { value: SourceType.Adjustment, label: 'Adjustment' },
  { value: SourceType.CreditCard, label: 'Credit Card' },
  { value: SourceType.CreditCardCredit, label: 'Credit Card Credit' },
  { value: SourceType.CreditCardRefund, label: 'Credit Card Refund' },
  { value: SourceType.SecurityDeposit, label: 'Security Deposit' },
  { value: SourceType.OwnerDistribution, label: 'Owner Distribution' },
  { value: SourceType.Paycheck, label: 'Paycheck' },
  { value: SourceType.PayrollLiabilityCheck, label: 'Payroll Liability Check' },
  { value: SourceType.YtdAdjustment, label: 'YTD Adjustment' },
  { value: SourceType.LiabilityAdjustment, label: 'Liability Adjustment' },
  { value: SourceType.Transfer, label: 'Transfer' },
  { value: SourceType.WorkOrder, label: 'Work Order' },
  { value: SourceType.Reservation, label: 'Reservation' },
  { value: SourceType.LinensAndTowels, label: 'Linens & Towels' },
];

export function getSourceTypeCode(sourceTypeId: number | undefined | null): string {
  if (sourceTypeId === undefined || sourceTypeId === null) {
    return '';
  }

  return SourceTypeCodes[sourceTypeId as SourceType] ?? '';
}

export function isJournalEntrySourceNavigable(sourceTypeId: number | undefined | null): boolean {
  if (sourceTypeId == null) {
    return false;
  }

  return [
    SourceType.Invoice,
    SourceType.InvoicePayment,
    SourceType.Bill,
    SourceType.BillPayment,
    SourceType.Receipt
  ].includes(sourceTypeId);
}

export function getSourceTypeLabel(sourceTypeId: number | undefined | null, sourceTypes?: { value: number, label: string }[]): string {
  if (sourceTypeId === undefined || sourceTypeId === null) {
    return '';
  }

  const options = sourceTypes?.length ? sourceTypes : SourceTypeLabels;
  return options.find(type => type.value === sourceTypeId)?.label ?? '';
}

export function getTransactionTypeLabel(transactionType: number, transactionTypes?: { value: number, label: string }[]): string {
  if (transactionTypes && transactionTypes.length > 0) {
    const found = transactionTypes.find(t => t.value === transactionType);
    return found?.label || getTransactionType(transactionType);
  }
  // Fallback to getTransactionType function
  return getTransactionType(transactionType) || 'Unknown';
}

//#region AccountType
export enum AccountType {
  Bank = 0,
  AccountsReceivable = 1,
  OtherCurrentAsset = 2,
  FixedAsset = 3,
  OtherAsset = 4,
  AccountsPayable = 5,
  CreditCard = 6,
  OtherCurrentLiability = 7,
  LongTermLiability = 8,
  Equity = 9,
  Income = 10,
  CostOfGoodsSold = 11,
  Expense = 12,
  OtherIncome = 13,
  OtherExpense = 14
}

export const AccountTypeLabels: { value: AccountType; label: string }[] = [
  { value: AccountType.Bank, label: 'Bank' },
  { value: AccountType.AccountsReceivable, label: 'Accounts Receivable' },
  { value: AccountType.OtherCurrentAsset, label: 'Other Current Asset' },
  { value: AccountType.FixedAsset, label: 'Fixed Asset' },
  { value: AccountType.OtherAsset, label: 'Other Asset' },
  { value: AccountType.AccountsPayable, label: 'Accounts Payable' },
  { value: AccountType.CreditCard, label: 'Credit Card' },
  { value: AccountType.OtherCurrentLiability, label: 'Other Current Liability' },
  { value: AccountType.LongTermLiability, label: 'Long Term Liability' },
  { value: AccountType.Equity, label: 'Equity' },
  { value: AccountType.Income, label: 'Income' },
  { value: AccountType.CostOfGoodsSold, label: 'Cost of Goods Sold' },
  { value: AccountType.Expense, label: 'Expense' },
  { value: AccountType.OtherIncome, label: 'Other Income' },
  { value: AccountType.OtherExpense, label: 'Other Expense' },
];

export function isCreditNormalAccountType(accountTypeId: number | undefined | null): boolean {
  if (accountTypeId === undefined || accountTypeId === null) {
    return false;
  }

  return accountTypeId === AccountType.AccountsPayable
    || accountTypeId === AccountType.CreditCard
    || accountTypeId === AccountType.OtherCurrentLiability
    || accountTypeId === AccountType.LongTermLiability
    || accountTypeId === AccountType.Equity
    || accountTypeId === AccountType.Income
    || accountTypeId === AccountType.OtherIncome;
}

export function getAccountType(accountTypeId: number | undefined | null): string {
  if (accountTypeId === undefined || accountTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [AccountType.Bank]: 'Bank',
    [AccountType.AccountsReceivable]: 'Accounts Receivable',
    [AccountType.OtherCurrentAsset]: 'Other Current Asset',
    [AccountType.FixedAsset]: 'Fixed Asset',
    [AccountType.OtherAsset]: 'Other Asset',
    [AccountType.AccountsPayable]: 'Accounts Payable',
    [AccountType.CreditCard]: 'Credit Card',
    [AccountType.OtherCurrentLiability]: 'Other Current Liability',
    [AccountType.LongTermLiability]: 'Long Term Liability',
    [AccountType.Equity]: 'Equity',
    [AccountType.Income]: 'Income',
    [AccountType.CostOfGoodsSold]: 'Cost of Goods Sold',
    [AccountType.Expense]: 'Expense',
    [AccountType.OtherIncome]: 'Other Income',
    [AccountType.OtherExpense]: 'Other Expense',
  };

  return typeMap[accountTypeId] || '';
}

export function getAccountTypes(): { value: number; label: string }[] {
  return AccountTypeLabels.map(({ value, label }) => ({ value, label }));
}

export function getAccountTypeLabel(accountTypeId: number, accountTypes?: { value: number; label: string }[]): string {
  if (accountTypes && accountTypes.length > 0) {
    const found = accountTypes.find(t => t.value === accountTypeId);
    return found?.label || getAccountType(accountTypeId);
  }
  return getAccountType(accountTypeId) || 'Unknown';
}
//#endregion

//#region PaymentType
export enum PaymentType {
  Check = 0,
  Ach = 1,
  Eft = 2,
  OnlineBanking = 3,
  WireTransfer = 4,
  CreditCard = 5
}

export const PaymentTypeLabels: { value: PaymentType; label: string }[] = [
  { value: PaymentType.Check, label: 'Check' },
  { value: PaymentType.Ach, label: 'ACH' },
  { value: PaymentType.Eft, label: 'EFT' },
  { value: PaymentType.OnlineBanking, label: 'Online banking' },
  { value: PaymentType.WireTransfer, label: 'Wire transfer' },
  { value: PaymentType.CreditCard, label: 'Credit Card' },
];

export function getPaymentType(paymentTypeId: number | undefined | null): string {
  if (paymentTypeId === undefined || paymentTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [PaymentType.Check]: 'Check',
    [PaymentType.Ach]: 'ACH',
    [PaymentType.Eft]: 'EFT',
    [PaymentType.OnlineBanking]: 'Online banking',
    [PaymentType.WireTransfer]: 'Wire transfer',
    [PaymentType.CreditCard]: 'Credit Card',
  };

  return typeMap[paymentTypeId] || '';
}

export function getPaymentTypes(): { value: number; label: string }[] {
  return PaymentTypeLabels.map(({ value, label }) => ({ value, label }));
}

export function getPaymentTypeLabel(
  paymentTypeId: number | undefined | null,
  paymentTypes?: { value: number; label: string }[]
): string {
  if (paymentTypeId === undefined || paymentTypeId === null) {
    return '';
  }

  const options = paymentTypes?.length ? paymentTypes : PaymentTypeLabels;
  return options.find(type => type.value === paymentTypeId)?.label ?? getPaymentType(paymentTypeId);
}
//#endregion

//#region Class
export enum Class {
  TotalOnly = 0,
  Month = 1,
  Quarter = 2,
  Year = 3,
  Customer = 4,
  Vendor = 5,
  Employee = 6,
  OtherName = 7,
  Class = 8,
  Item = 9,
  CustomerJob = 10,
  Account = 11
}

export const ClassLabels: { value: Class; label: string }[] = [
  { value: Class.TotalOnly, label: 'Total Only' },
  { value: Class.Month, label: 'Month' },
  { value: Class.Quarter, label: 'Quarter' },
  { value: Class.Year, label: 'Year' },
  { value: Class.Class, label: 'Property' },
  { value: Class.CustomerJob, label: 'Reservation' },
  { value: Class.Customer, label: 'Customer' },
  { value: Class.Vendor, label: 'Vendor' },
  { value: Class.Employee, label: 'Employee' },
  { value: Class.Account, label: 'Account' },
];

export function getClass(classId: number | undefined | null): string {
  if (classId === undefined || classId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [Class.TotalOnly]: 'Total Only',
    [Class.Month]: 'Month',
    [Class.Quarter]: 'Quarter',
    [Class.Year]: 'Year',
    [Class.Customer]: 'Customer',
    [Class.Vendor]: 'Vendor',
    [Class.Employee]: 'Employee',
    [Class.OtherName]: 'Other Name',
    [Class.Class]: 'Property',
    [Class.Item]: 'Item',
    [Class.CustomerJob]: 'Reservation',
    [Class.Account]: 'Account',
  };

  return typeMap[classId] || '';
}

export function getClasses(): { value: number; label: string }[] {
  return ClassLabels.map(({ value, label }) => ({ value, label }));
}

export function getClassLabel(
  classId: number | undefined | null,
  classes?: { value: number; label: string }[]
): string {
  if (classId === undefined || classId === null) {
    return '';
  }

  const options = classes?.length ? classes : ClassLabels;
  return options.find(type => type.value === classId)?.label ?? getClass(classId);
}
//#endregion
