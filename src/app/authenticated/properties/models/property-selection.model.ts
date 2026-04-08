export interface PropertySelectionRequest {
  userId: string;
  fromUnitLevel: number;
  toUnitLevel: number;
  fromBeds: number;
  toBeds: number;
  accomodates: number;
  maxRent: number;
  propertyCode: string | null;
  city: string | null;
  state: string | null;
  unfurnished: boolean;
  cable: boolean;
  streaming: boolean;
  pool: boolean;
  jacuzzi: boolean;
  security: boolean;
  parking: boolean;
  pets: boolean;
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
  city: string | null;
  state: string | null;
  unfurnished: boolean;
  cable: boolean;
  streaming: boolean;
  pool: boolean;
  jacuzzi: boolean;
  security: boolean;
  parking: boolean;
  pets: boolean;
  smoking: boolean;
  highSpeedInternet: boolean;
  propertyStatusId: number;
  officeCode: string | null;
  buildingCodes: string[];
  regionCodes: string[];
  areaCodes: string[];
}



