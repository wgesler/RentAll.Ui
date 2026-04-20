export enum TransactionType {
  Charge = 0,
  Payment = 1,
  Deposit = 2,
  SDW = 3,
  Expense = 4,
  CostOfGoodsSold = 5
 }

export const TransactionTypeLabels: { value: TransactionType, label: string }[] = [
  { value: TransactionType.Charge, label: 'Charge' },
  { value: TransactionType.Payment, label: 'Payment' },
  { value: TransactionType.Deposit, label: 'Deposit' },
  { value: TransactionType.SDW, label: 'SDW' },
  { value: TransactionType.Expense, label: 'Expense' },
  { value: TransactionType.CostOfGoodsSold, label: 'Cost Of Goods Sold' },
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
