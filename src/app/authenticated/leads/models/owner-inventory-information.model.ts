export interface OwnerInventoryInformationRequest {
  ownerId: number;
  organizationId: string;
  onSiteComplexManagementPhone?: string | null;
  keyCount?: string | null;
  garageRemoteModelCode?: string | null;
  storageAccessDetails?: string | null;
  cableSupplier?: string | null;
  cablePhone?: string | null;
  cableAccountNumber?: string | null;
  electricSupplier?: string | null;
  electricPhone?: string | null;
  electricAccountNumber?: string | null;
  internetSupplier?: string | null;
  internetPhone?: string | null;
  internetAccountNumber?: string | null;
  fuseBoxLocation?: string | null;
  schoolDistrict?: string | null;
  localEmergencyContact?: string | null;
  accessInformation?: string | null;
  isActive: boolean;
}

export interface OwnerInventoryInformationResponse {
  ownerId: number;
  organizationId: string;
  onSiteComplexManagementPhone?: string | null;
  keyCount?: string | null;
  garageRemoteModelCode?: string | null;
  storageAccessDetails?: string | null;
  cableSupplier?: string | null;
  cablePhone?: string | null;
  cableAccountNumber?: string | null;
  electricSupplier?: string | null;
  electricPhone?: string | null;
  electricAccountNumber?: string | null;
  internetSupplier?: string | null;
  internetPhone?: string | null;
  internetAccountNumber?: string | null;
  fuseBoxLocation?: string | null;
  schoolDistrict?: string | null;
  localEmergencyContact?: string | null;
  accessInformation?: string | null;
  isActive: boolean;
}
