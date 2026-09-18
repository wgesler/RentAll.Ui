/** Reservation board six-way filter — positions 1–6 map to index 0–5. */
export type FiveWayToggleValue = 0 | 1 | 2 | 3 | 4 | 5;

export const BoardFilterIndex = {
  Furnished: 0,
  Unfurnished: 1,
  Both: 2,
  Inactive: 3,
  Partners: 4,
  All: 5
} as const;

export interface ReservationBoardFiveWayFilterOption {
  readonly index: FiveWayToggleValue;
  /** Shown beside the toggle thumb for this position. */
  readonly label: string;
  /** Documents the API call this position will invoke. */
  readonly apiCall: string;
}

export const RESERVATION_BOARD_FIVE_WAY_FILTER_OPTIONS: readonly ReservationBoardFiveWayFilterOption[] = [
  {
    index: 0,
    label: 'Furnished',
    apiCall: 'GET property/user/{userId}/active — cached; client filter furnished'
  },
  {
    index: 1,
    label: 'Unfurnished',
    apiCall: 'GET property/user/{userId}/active — cached; client filter unfurnished'
  },
  {
    index: 2,
    label: 'Both',
    apiCall: 'GET property/user/{userId}/active — cached; no furnish filter (full active list)'
  },
  {
    index: 3,
    label: 'InActive',
    apiCall: 'GET property/user/{userId} — cached; client filter inactive'
  },
  {
    index: 4,
    label: 'Partners',
    apiCall: 'GET partner/user/{userId}/active — cached separately'
  },
  {
    index: 5,
    label: 'All',
    apiCall: 'Merge cached active + inactive + partner lists'
  }
] as const;

export function getFiveWayFilterLabel(index: FiveWayToggleValue): string {
  return RESERVATION_BOARD_FIVE_WAY_FILTER_OPTIONS[index]?.label ?? RESERVATION_BOARD_FIVE_WAY_FILTER_OPTIONS[0].label;
}
