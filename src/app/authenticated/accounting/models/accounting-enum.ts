export enum TransactionType {
  Debit = 0,
  Credit = 1,
  Payment = 2,
  Refund = 3,
  Charge = 4,
  Deposit = 5,
  Sdw = 6,
  Revenue = 7,
  Adjustment = 8
}

export const TransactionTypeLabels: { value: TransactionType, label: string }[] = [
  { value: TransactionType.Debit, label: 'Debit' },
  { value: TransactionType.Credit, label: 'Credit' },
  { value: TransactionType.Payment, label: 'Payment' },
  { value: TransactionType.Refund, label: 'Refund' },
  { value: TransactionType.Charge, label: 'Charge' },
  { value: TransactionType.Deposit, label: 'Deposit' },
  { value: TransactionType.Deposit, label: 'SDW' },
  { value: TransactionType.Deposit, label: 'Revenue' },
  { value: TransactionType.Adjustment, label: 'Adjustment' }
];

export enum AccountingType {
  Bank = 0,
  AccountsReceivable = 1,
  OtherCurrentAsset = 2,
  FixedAsset = 3,
  AccountsPayable = 4,
  CreditCard = 5,
  OtherCurrentLiability = 6,
  LongTermLiability = 7,
  Equity = 8,
  Income = 9,
  CostOfGoodsSold = 10,
  Expense = 11
}

export function getTransactionTypeLabel(transactionType: number, transactionTypes?: { value: number, label: string }[]): string {
  if (transactionTypes && transactionTypes.length > 0) {
    const found = transactionTypes.find(t => t.value === transactionType);
    return found?.label || 'Unknown';
  }
  // Fallback to shared TransactionTypeLabels constant
  const found = TransactionTypeLabels.find(t => t.value === transactionType);
  return found?.label || 'Unknown';
}
