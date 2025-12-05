export interface OutstandingCheckRequest {
	outstandingCheckId: string;
	lastContact: string;
}

export interface OutstandingCheckUpdateRequest {
  lastContact: Date;
}
export interface OutstandingCheckResponse {
	outstandingCheckId: string;
	agencyId: string;
	gfNo: string;
	amount: string;
	checkNum: string;
	checkDate: string;
	payeeName: string;
	payeeAddress: string;
	payeeCity: string;
	payeeState: string;
	payeeZip: string;
	payeeCellPhone: string;
	payeeHomePhone: string;
	payeeBusinessPhone: string;
	payeeEmail: string;
	lastContact: string;	
	reminderSent: boolean;
	escheatSent: boolean;
}

export interface OutstandingCheckSummaryResponse {
	outstandingCheckId: string;
	agencyId: string;
	gfNo: string;
	amount: string;
	checkNum: string;
	checkDate: string;
	lastContact: string;
	reminderSent: boolean;
	escheatSent: boolean;
}

export interface OutstandingCheckSummary {
	outstandingCheckId: string;
	agencyId: string;
	gfNo: string;
	amount: string;
	checkNum: string;
	checkDate: Date;
	lastContact: Date;
	reminderSent: boolean;
	escheatSent: boolean;
}

export interface OutstandingCheckListDisplay {
	outstandingCheckId: string;
	agencyId: string;
	gfNo: string;
	amount: string;
	checkNum: string;
	checkDate: string;
	lastContact: string;
	reminderSent: boolean;
	escheatSent: boolean;
}

export interface OutstandingCheckListResponse {
	syncStatus: OutstandingCheckSyncStatusResponse;
	outstandingChecks: OutstandingCheckSummaryResponse[];
}

export interface OutstandingCheckSyncStatusResponse {
	ramquestLastSync: string;
	syncInProgress: boolean;
}

export interface OutstandingCheckLetterPair {
  outstandingCheckId: string;
  state: string;
}

export interface OutstandingCheckEmailRequest {
  checkLetterPairs: OutstandingCheckLetterPair[];
  subject: string;
  isEscheat: boolean;
  requestedBy: string
}

export interface OutstandingCheckEmailResponse {
  numberOfSuccessfulEmails: number;
  numberOfFailedEmails: number;
}

export interface OutstandingCheckPreviewRequest {
  subject: string;
  state: string;
  isEscheat: boolean;
}
