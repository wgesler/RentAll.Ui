export interface PropertyLetterRequest {
  propertyId?: string;
  organizationId: string;
  tenantName: string;
  buildingName?: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  arrivalInstructions: string;
  compmunityAddress?: string;
  apartmentAddress: string;
  size: number;
  suite: string;
  access: string;
  mailbox: string;
  package: string; 
  PparkingInformation: string;
  amenaties: string;
  Laundry: string;
  trashLocation: string;
  providedFurnishings: string;
  housekeeping: string;
  televisionSouce: string;
  internetService: string;
  internetNetwork: string;
  internetPasword: string;
  keyReturn: string;
  supportContact: string;
  emergencyContact: string;
  emergencyContactNumber: string;
  additionalNotes: string;
}

export interface PropertyLetterResponse {
  propertyId?: string;
  organizationId: string;
  tenantName: string;
  buildingName?: string;
  arrivalDate: string;
  departureDate: string;
  checkInTimeId: number;
  checkOutTimeId: number;
  arrivalInstructions: string;
  compmunityAddress?: string;
  apartmentAddress: string;
  size: number;
  suite: string;
  access: string;
  mailbox: string;
  package: string; 
  PparkingInformation: string;
  amenaties: string;
  Laundry: string;
  trashLocation: string;
  providedFurnishings: string;
  housekeeping: string;
  televisionSouce: string;
  internetService: string;
  internetNetwork: string;
  internetPasword: string;
  keyReturn: string;
  supportContact: string;
  emergencyContact: string;
  emergencyContactNumber: string;
  additionalNotes: string;
}


