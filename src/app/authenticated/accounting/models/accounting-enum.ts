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
