export interface ConfirmCheckNumberDialogData {
  startingCheckNumber: number;
  checkCount: number;
  bankName?: string | null;
}

export interface ConfirmCheckNumberDialogResult {
  startingCheckNumber: number;
}
