export enum TransactionType {
  Debit = 0,
  Credit = 1,
  Payment = 2,
  Refund = 3,
  Charge = 4,
  Deposit = 5,
  Sdw = 6,
  Adjustment = 6
}

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
