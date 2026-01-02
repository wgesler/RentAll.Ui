/**
 * PropertySelectionRequest - Matches the database table structure
 * 
 * NULL Handling:
 * - All number fields (fromBeds, toBeds, etc.) are NOT NULL with DEFAULT 0, so always send a number (0 if not set)
 * - All boolean fields (unfurnished, cable, etc.) are NOT NULL with DEFAULT 0, so always send true/false
 * - String fields (propertyCode, city, state) are NULLABLE, so send null explicitly when empty/unset
 * 
 * Important: Use null (not undefined) for nullable fields so JSON.stringify includes them in the request
 */
export interface PropertySelectionRequest {
  userId: string;
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
  buildingCode: string | null;
  regionCode: string | null;
  areaCode: string | null;
}

/**
 * PropertySelectionResponse - Matches the database table structure
 * 
 * The Response may include computed/joined fields (office, region, area, building)
 * for display purposes, but these are not stored in the database table.
 * Only the ID fields (officeId, regionId, areaId, buildingId) are stored.
 */
export interface PropertySelectionResponse {
  userId: string;
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
  buildingCode: string | null;
  regionCode: string | null;
  areaCode: string | null;
}


