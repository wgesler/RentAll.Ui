/** Reservation board five-way filter — positions 1–5 map to index 0–4. */
export type FiveWayToggleValue = 0 | 1 | 2 | 3 | 4;

export interface ReservationBoardFiveWayFilterOption {
  readonly index: FiveWayToggleValue;
  /** Shown beside the toggle thumb for this position. */
  readonly label: string;
  /** Documents the API call this position will invoke (placeholder until endpoints exist). */
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
    apiCall: 'GET property/user/{userId}/active — cached; no furnish filter (full standard list)'
  },
  {
    index: 3,
    label: 'Partners',
    apiCall: 'GET partner/user/{userId}/active — cached separately'
  },
  {
    index: 4,
    label: 'All',
    apiCall: 'Merge cached standard + cached partner lists'
  }
] as const;

export function getFiveWayFilterLabel(index: FiveWayToggleValue): string {
  return RESERVATION_BOARD_FIVE_WAY_FILTER_OPTIONS[index]?.label ?? RESERVATION_BOARD_FIVE_WAY_FILTER_OPTIONS[0].label;
}
