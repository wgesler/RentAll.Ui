//#region FeatureType
export enum FeatureType {
  MainProgram = 0,
  Ticketing = 1,
  DocuSign = 2,
  QuickBooks = 3,
  Accounting = 4,
  Leads = 5,
  Owners = 6
}

export function getFeatureType(featureTypeId: number | undefined | null): string {
  if (featureTypeId === undefined || featureTypeId === null) {
    return '';
  }

  const typeMap: { [key: number]: string } = {
    [FeatureType.MainProgram]: 'Main Program',
    [FeatureType.Ticketing]: 'Ticketing',
    [FeatureType.DocuSign]: 'DocuSign',
    [FeatureType.QuickBooks]: 'QuickBooks',
    [FeatureType.Accounting]: 'Accounting',
    [FeatureType.Leads]: 'Leads',
    [FeatureType.Owners]: 'Owners'
  };

  return typeMap[featureTypeId] || '';
}

export function getFeatureTypeCode(featureTypeId: number | undefined | null): string {
  if (featureTypeId === undefined || featureTypeId === null) {
    return '';
  }

  const codeMap: { [key: number]: string } = {
    [FeatureType.MainProgram]: 'MAIN',
    [FeatureType.Ticketing]: 'TIK',
    [FeatureType.DocuSign]: 'DOC',
    [FeatureType.QuickBooks]: 'QB',
    [FeatureType.Accounting]: 'ACT',
    [FeatureType.Leads]: 'LEAD',
    [FeatureType.Owners]: 'OWN'
  };

  return codeMap[featureTypeId] || '';
}

export function getFeatureTypes(): { value: number; label: string }[] {
  return Object.keys(FeatureType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: FeatureType[key as keyof typeof FeatureType],
      label: getFeatureType(FeatureType[key as keyof typeof FeatureType])
    }));
}

export function getFeatureTypeLabel(featureTypeId: number, featureTypes?: { value: number; label: string }[]): string {
  if (featureTypes && featureTypes.length > 0) {
    const found = featureTypes.find(t => t.value === featureTypeId);
    return found?.label || getFeatureType(featureTypeId);
  }
  return getFeatureType(featureTypeId) || 'Unknown';
}
//#endregion
