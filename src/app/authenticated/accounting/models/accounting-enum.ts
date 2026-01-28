export const StartOfCredits = 10;

export enum TransactionType {
  Debit = 0,
  Charge = 1,
  Deposit = 2,
  Sdw = 3,
  Credit = 10,
  Payment = 11,
  Refund = 12,
  Revenue = 13,
  Adjustment = 14
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

export function getTransactionType(transactionTypeId: number | undefined): string {
  if (transactionTypeId === undefined || transactionTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [TransactionType.Debit]: 'Debit',
    [TransactionType.Charge]: 'Charge',
    [TransactionType.Deposit]: 'Deposit',
    [TransactionType.Sdw]: 'SDW',
    [TransactionType.Credit]: 'Credit',
    [TransactionType.Payment]: 'Payment',
    [TransactionType.Refund]: 'Refund',
    [TransactionType.Revenue]: 'Revenue',
    [TransactionType.Adjustment]: 'Adjustment'
  };
  
  return typeMap[transactionTypeId] || '';
}

export function getTransactionTypeLabel(transactionType: number, transactionTypes?: { value: number, label: string }[]): string {
  if (transactionTypes && transactionTypes.length > 0) {
    const found = transactionTypes.find(t => t.value === transactionType);
    return found?.label || getTransactionType(transactionType);
  }
  // Fallback to getTransactionType function
  return getTransactionType(transactionType) || 'Unknown';
}
