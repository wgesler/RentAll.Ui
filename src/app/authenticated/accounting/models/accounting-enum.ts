export enum TransactionType {
  Charge = 0,
  Payment = 1,
  Deposit = 2,
  Sdw = 3
 }

export const TransactionTypeLabels: { value: TransactionType, label: string }[] = [
  { value: TransactionType.Charge, label: 'Charge' },
  { value: TransactionType.Payment, label: 'Payment' },
  { value: TransactionType.Deposit, label: 'Deposit' },
  { value: TransactionType.Deposit, label: 'SDW' }
];

export function getTransactionType(transactionTypeId: number | undefined): string {
  if (transactionTypeId === undefined || transactionTypeId === null) return '';
  
  const typeMap: { [key: number]: string } = {
    [TransactionType.Charge]: 'Charge',
    [TransactionType.Payment]: 'Payment',
    [TransactionType.Deposit]: 'Deposit',
    [TransactionType.Sdw]: 'SDW'
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
