//#region QbNameType
export enum QbNameType {
  Unselected = 0,
  CorporationCodeName = 1,
  CodeBoardName = 2
}

export function getQbNameType(qbNameTypeId: number | undefined | null): string {
  if (qbNameTypeId === undefined || qbNameTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [QbNameType.Unselected]: 'Unselected',
    [QbNameType.CorporationCodeName]: 'CorporationCodeName',
    [QbNameType.CodeBoardName]: 'CodeBoardName'
  };

  return typeMap[qbNameTypeId] || '';
}

export function getQbNameTypes(): { value: number; label: string }[] {
  return Object.keys(QbNameType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: QbNameType[key as keyof typeof QbNameType],
      label: getQbNameType(QbNameType[key as keyof typeof QbNameType])
    }));
}

export function getQbNameTypeLabel(qbNameTypeId: number, qbNameTypes?: { value: number; label: string }[]): string {
  if (qbNameTypes && qbNameTypes.length > 0) {
    const found = qbNameTypes.find(t => t.value === qbNameTypeId);
    return found?.label || getQbNameType(qbNameTypeId);
  }
  return getQbNameType(qbNameTypeId) || 'Unknown';
}
//#endregion

//#region QbClassType
export enum QbClassType {
  Unselected = 0,
  CityProperty = 1,
  OfficeProperty = 2,
  Property = 3
}

export function getQbClassType(qbClassTypeId: number | undefined | null): string {
  if (qbClassTypeId === undefined || qbClassTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [QbClassType.Unselected]: 'Unselected',
    [QbClassType.CityProperty]: 'CityProperty',
    [QbClassType.OfficeProperty]: 'OfficeProperty',
    [QbClassType.Property]: 'Property'
  };

  return typeMap[qbClassTypeId] || '';
}

export function getQbClassTypes(): { value: number; label: string }[] {
  return Object.keys(QbClassType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: QbClassType[key as keyof typeof QbClassType],
      label: getQbClassType(QbClassType[key as keyof typeof QbClassType])
    }));
}

export function getQbClassTypeLabel(qbClassTypeId: number, qbClassTypes?: { value: number; label: string }[]): string {
  if (qbClassTypes && qbClassTypes.length > 0) {
    const found = qbClassTypes.find(t => t.value === qbClassTypeId);
    return found?.label || getQbClassType(qbClassTypeId);
  }
  return getQbClassType(qbClassTypeId) || 'Unknown';
}
//#endregion
