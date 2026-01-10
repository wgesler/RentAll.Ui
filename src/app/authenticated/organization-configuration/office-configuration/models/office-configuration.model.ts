export interface OfficeConfigurationRequest {
  officeId: number;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  afterHoursInstructions?: string;
  defaultDeposit: number;
  defaultSdw: number;
  utilityOneBed: number;
  utilityTwoBed: number;
  utilityThreeBed: number;
  utilityFourBed: number;
  utilityHouse: number;
  maidOneBed: number;
  maidTwoBed: number;
  maidThreeBed: number;
  maidFourBed: number;
  parkingLowEnd: number;
  parkingHighEnd: number;
  isActive: boolean;
}

export interface OfficeConfigurationResponse {
  officeId: number;
  officeCode: string;
  name: string;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  afterHoursInstructions?: string;
  defaultDeposit: number;
  defaultSdw: number;
  utilityOneBed: number;
  utilityTwoBed: number;
  utilityThreeBed: number;
  utilityFourBed: number;
  utilityHouse: number;
  maidOneBed: number;
  maidTwoBed: number;
  maidThreeBed: number;
  maidFourBed: number;
  parkingLowEnd: number;
  parkingHighEnd: number;
  isActive: boolean;
}

export interface OfficeConfigurationListDisplay {
  officeId: number;
  officeCode?: string;
  officeName?: string;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  defaultDeposit: number;
  defaultSdw: number;
  isActive: boolean;
}

