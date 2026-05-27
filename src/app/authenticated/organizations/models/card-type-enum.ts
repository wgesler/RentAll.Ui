export enum CardType {
  Visa = 0,
  MasterCard = 1,
  Discover = 2,
  AmericanExpress = 3
}

export function getCardTypes(): { value: number; label: string }[] {
  return [
    { value: CardType.Visa, label: 'Visa' },
    { value: CardType.MasterCard, label: 'MasterCard' },
    { value: CardType.Discover, label: 'Discover' },
    { value: CardType.AmericanExpress, label: 'AmericanExpress' }
  ];
}
