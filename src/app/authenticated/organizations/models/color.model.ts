export interface ColorRequest {
  colorId?: number;
  organizationId?: string;
  reservationStatusId: number;
  noticeDays?: number | null;
  color: string;
}

export interface ColorResponse {
  colorId: number;
  organizationId: string;
  reservationStatusId: number;
  noticeDays?: number | null;
  color: string;
}

export interface ColorListDisplay {
  colorId: number;
  reservationStatusId: number;
  reservationStatus: string;
  noticeDays?: number | null;
  sortOrder: number;
  color: string;
}

