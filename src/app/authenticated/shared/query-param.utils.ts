export function getStringQueryParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function getNumberQueryParam(
  params: Record<string, unknown>,
  key: string,
  min?: number,
  max?: number
): number | null {
  const rawValue = getStringQueryParam(params, key);
  if (!rawValue) {
    return null;
  }

  const parsed = parseInt(rawValue, 10);
  if (isNaN(parsed)) {
    return null;
  }

  if (min !== undefined && parsed < min) {
    return null;
  }

  if (max !== undefined && parsed > max) {
    return null;
  }

  return parsed;
}
