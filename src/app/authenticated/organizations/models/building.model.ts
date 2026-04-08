export interface BuildingRequest {
  buildingId?: number;
  organizationId: string;
  officeId: string;
  buildingCode: string;
  name: string;
  description?: string;
  hoaName?: string;
  hoaPhone?: string;
  hoaEmail?: string;

  // Ammenities
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  poundLimit: string;
  trashPickupId: number;
  trashRemoval?: string | null;
  washerDryerInBldg: boolean;
  deck: boolean;
  patio: boolean;
  yard: boolean;
  garden: boolean;
  commonPool: boolean;
  privatePool: boolean;
  jacuzzi: boolean;
  sauna: boolean;
  gym: boolean;
  isActive: boolean;
}

export interface BuildingResponse {
  buildingId: number;
  organizationId: string;
  officeId: string;
  officeName: string;
  buildingCode: string;
  name: string;
  description?: string;
  hoaName?: string;
  hoaPhone?: string;
  hoaEmail?: string;
  
  // Ammenities
  heating: boolean;
  ac: boolean;
  elevator: boolean;
  security: boolean;
  gated: boolean;
  petsAllowed: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  poundLimit: string;
  trashPickupId: number;
  trashRemoval?: string | null;
  washerDryerInBldg: boolean;
  deck: boolean;
  patio: boolean;
  yard: boolean;
  garden: boolean;
  commonPool: boolean;
  privatePool: boolean;
  jacuzzi: boolean;
  sauna: boolean;
  gym: boolean;
  isActive: boolean;
}

/** Grid / list row: same shape as API so getBuildings() amenities are not stripped by mapping. */
export type BuildingListDisplay = BuildingResponse;


