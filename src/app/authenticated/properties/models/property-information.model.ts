export interface PropertyInformationRequest {
  propertyId?: string;
  organizationId: string;
  arrivalInstructions?: string;
  mailboxInstructions?: string;
  packageInstructions?: string;
  parkingInformation?: string;
  access?: string;
  laundry?: string;
  providedFurnishings?: string;
  housekeeping?: string;
  televisionSource?: string;
  internetService?: string;
  internetNetwork?: string;
  internetPassword?: string;
  keyReturn?: string;
  departureInstructions?: string;
  departureCleaning?: string;
  departureMail?: string;
  departureFees?: string;
  concierge?: string;
  maintenanceEmail?: string;
  emergencyPhone?: string;
  additionalNotes?: string;
  welcomeLetter?: string;
}

export interface PropertyInformationResponse {
  propertyId?: string;
  organizationId: string;
  arrivalInstructions?: string;
  mailboxInstructions?: string;
  packageInstructions?: string;
  parkingInformation?: string;
  access?: string;
  laundry?: string;
  providedFurnishings?: string;
  housekeeping?: string;
  televisionSource?: string;
  internetService?: string;
  keyReturn?: string;
  departureInstructions?: string;
  departureCleaning?: string;
  departureMail?: string;
  departureFees?: string;
  concierge?: string;
  maintenanceEmail?: string;
  emergencyPhone?: string;
  additionalNotes?: string;
  welcomeLetter?: string;
}

export interface PropertyInformationFormData {
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
  keypadAccess: string;
  trashLocation: string;
  arrivalInstructions: string | null;
  mailbox: string | null;
  package: string | null;
  parkingInformation: string | null;
  access: string | null;
  laundry: string | null;
  housekeeping: string | null;
  televisionSource: string | null;
  internetService: string | null;
  keyReturn: string | null;
  departureInstructions: string | null;
  departureCleaning: string | null;
  departureMail: string | null;
  departureFees: string | null;
  concierge: string | null;
  maintenanceEmail: string | null;
  emergencyPhone: string | null;
  additionalNotes: string | null;
}
