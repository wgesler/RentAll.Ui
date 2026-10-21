export interface TerminologyRequest {
  termId?: number;
  organizationId: string;
  officeId: number;
  term: string;
  replacement: string;
}

export interface TerminologyResponse {
  termId: number;
  organizationId: string;
  officeId: number;
  officeName: string;
  term: string;
  replacement: string;
}

export interface TerminologyListDisplay {
  termId: number;
  officeId: number;
  term: string;
  replacement: string;
}
