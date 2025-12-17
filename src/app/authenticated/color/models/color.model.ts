export interface ColorRequest {
  colorId?: number;
  organizationId: string;
  reservationStatusId: number;
  color: string;
}

export interface ColorResponse {
  colorId: number;
  organizationId: string;
  reservationStatusId: number;
  color: string;
}

export interface ColorListDisplay {
  colorId: number;
  reservationStatusId: number;
  reservationStatus: string;
  color: string;
}

