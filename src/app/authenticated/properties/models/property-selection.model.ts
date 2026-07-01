export interface PropertySelectionRequest {
  userId: string;
  fromUnitLevel: number;
  toUnitLevel: number;
  fromBeds: number;
  toBeds: number;
  accomodates: number;
  maxRent: number;
  propertyCode: string | null;
  propertyLeaseTypeId: number;
  propertyTypeId: number;
  city: string | null;
  state: string | null;
  cable: boolean;
  streaming: boolean;
  pool: boolean;
  jacuzzi: boolean;
  security: boolean;
  parking: boolean;
  pets: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  smoking: boolean;
  highSpeedInternet: boolean;
  propertyStatusId: number;
  officeCode: string | null;
  buildingCodes: string[];
  regionCodes: string[];
  areaCodes: string[];
}

export interface PropertySelectionResponse {
  userId: string;
  fromUnitLevel: number;
  toUnitLevel: number;
  fromBeds: number;
  toBeds: number;
  accomodates: number;
  maxRent: number;
  propertyCode: string | null;
  propertyLeaseTypeId: number;
  propertyTypeId: number;
  city: string | null;
  state: string | null;
  cable: boolean;
  streaming: boolean;
  pool: boolean;
  jacuzzi: boolean;
  security: boolean;
  parking: boolean;
  pets: boolean;
  dogsOkay: boolean;
  catsOkay: boolean;
  smoking: boolean;
  highSpeedInternet: boolean;
  propertyStatusId: number;
  officeCode: string | null;
  buildingCodes: string[];
  regionCodes: string[];
  areaCodes: string[];
}



