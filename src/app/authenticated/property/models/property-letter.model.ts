export interface PropertyLetterRequest {
  propertyId?: string;
  organizationId: string;
  arrivalInstructions?: string;
  mailboxInstructions?: string;
  packageInstructions?: string;
  parkingInformation?: string;  
  amenities?: string;
  laundry?: string;
  providedFurnishings?: string;
  housekeeping?: string;
  televisionSource?: string;
  internetService?: string;
  internetNetwork?: string;
  internetPassword?: string;
  keyReturn?: string;
  concierge?: string;
  emergencyContact?: string;
  emergencyContactNumber?: string;
  additionalNotes?: string;
  welcomeLetter?: string;
}

export interface PropertyLetterResponse {
  propertyId?: string;
  organizationId: string;
  arrivalInstructions?: string;
  mailboxInstructions?: string;
  packageInstructions?: string;
  parkingInformation?: string;  
  amenities?: string;
  laundry?: string;
  providedFurnishings?: string;
  housekeeping?: string;
  televisionSource?: string;
  internetService?: string;
  keyReturn?: string;
  concierge?: string;
  emergencyContact?: string;
  emergencyContactNumber?: string;
  additionalNotes?: string;
  welcomeLetter?: string;
}

export interface PropertyLetterFormData {
  // Display/Selection fields (not sent to API - come from Property/Reservation)
  propertyCode: string;
  reservationId: string | null;
  tenantName: string;
  buildingName: string;
  arrivalDate: Date | null;
  departureDate: Date | null;
  checkInTimeId: number | null;
  checkOutTimeId: number | null;
  communityAddress: string;
  apartmentAddress: string;
  size: number;
  suite: string;
  access: string;
  trashLocation: string;
  
  // API fields (sent to/from API - these map to PropertyLetterRequest/Response)
  arrivalInstructions: string | null;
  mailbox: string | null;
  package: string | null;
  parkingInformation: string | null;
  amenaties: string | null;
  laundry: string | null;
  providedFurnishings: string | null;
  housekeeping: string | null;
  televisionSource: string | null;
  internetService: string | null;
  keyReturn: string | null;
  concierge: string | null;
  emergencyContact: string | null;
  emergencyContactNumber: string | null;
  additionalNotes: string | null;
}

