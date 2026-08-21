export enum ImageType {
  Logos = 0,
  Receipts = 1,
  Photos = 2,
  Profiles = 3,
  W9Forms = 4,
  Insurances = 5,
  ApplianceDecal = 6,
  StateForm = 7,
  CheckStocks = 8,
  UserGuide = 9
}

export function getImageTypeFolder(imageType: ImageType): string {
  const folderMap: Record<number, string> = {
    [ImageType.Logos]: 'logos',
    [ImageType.Receipts]: 'receipts',
    [ImageType.Photos]: 'photos',
    [ImageType.Profiles]: 'profiles',
    [ImageType.W9Forms]: 'w9forms',
    [ImageType.Insurances]: 'insurances',
    [ImageType.ApplianceDecal]: 'appliancedecal',
    [ImageType.StateForm]: 'stateform',
    [ImageType.CheckStocks]: 'checkstocks',
    [ImageType.UserGuide]: 'userguide'
  };

  return folderMap[imageType] || 'images';
}
