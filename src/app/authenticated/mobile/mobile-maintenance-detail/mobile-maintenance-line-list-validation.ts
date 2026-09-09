export function prepareMobileLineListSaveValidation(
  payload: { hasChanges: boolean; hasInvalidRows: boolean },
  setSaveValidationAttempted: (attempted: boolean) => void,
  markForCheck: () => void
): boolean {
  if (!payload.hasChanges) {
    return true;
  }
  if (payload.hasInvalidRows) {
    setSaveValidationAttempted(true);
    markForCheck();
    return false;
  }
  return true;
}

export function shouldShowMobileLineFieldError(saveValidationAttempted: boolean, isMissing: boolean): boolean {
  return saveValidationAttempted && isMissing;
}

export function runMobileLineListSave(
  payload: { hasChanges: boolean; hasInvalidRows: boolean },
  onSave: () => void,
  setSaveValidationAttempted: (attempted: boolean) => void,
  markForCheck: () => void
): void {
  if (!payload.hasChanges) {
    return;
  }
  if (payload.hasInvalidRows) {
    setSaveValidationAttempted(true);
    markForCheck();
    return;
  }
  setSaveValidationAttempted(false);
  onSave();
}
