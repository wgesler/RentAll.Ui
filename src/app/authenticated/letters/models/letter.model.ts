export interface LetterUpdateRequest {
	state: string;
  text: string;
  createdBy: string;
}

export interface LetterRequest {
	state: string;
	text: string;
}

export interface LetterResponse {
	state: string;
	text: string;
	modifiedBy: string;
	modifiedOn: string;
}

export interface CombinedLetterResponse {
	defaultLetter: LetterResponse;
	stateEscheatLetter?: LetterResponse;
}

export interface LetterListDisplay {
	state: string;
	text: string;
	modifiedBy: string;
  modifiedOn: string;
  deleteDisabled: boolean;
}

export interface LetterSections {
  subject: string;
  letter: string;
  prefix: string;
  escheat: string;
  suffix: string;
}
