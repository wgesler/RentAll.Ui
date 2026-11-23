export enum BankAccountType {
  Unknown = 0,
  PersonalChecking = 1,
  PersonalSavings = 2,
  BusinessChecking = 3,
  BusinessSavings = 4
}

export function getBankAccountTypes(): { value: number; label: string }[] {
  return [
    { value: BankAccountType.PersonalChecking, label: 'Personal checking' },
    { value: BankAccountType.PersonalSavings, label: 'Personal savings' },
    { value: BankAccountType.BusinessChecking, label: 'Business checking' },
    { value: BankAccountType.BusinessSavings, label: 'Business savings' }
  ];
}
