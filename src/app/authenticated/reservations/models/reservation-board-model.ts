export interface BoardProperty {
  propertyId: string;
  propertyCode: string;
  address: string;
  monthlyRate: number;
  bedsBaths: string;
  statusLetter: string;
  availableFrom?: string;
  availableUntil?: string;
}

export interface CalendarDay {
  date: Date;
  dayOfWeek: string;
  dayNumber: number;
  monthName: string;
  isFirstOfMonth: boolean;
}

export interface Cell {
    color: string;
    char: string;
    underline: boolean;
}