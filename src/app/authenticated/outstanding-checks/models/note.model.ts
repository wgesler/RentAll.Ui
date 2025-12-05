export interface NoteResponse {
  outstandingCheckId: string;
  text: string;
  createdBy: string;
  createdOn: Date;
}

export interface NoteDisplay {
  text: string;
  createdBy: string;
  createdOn: string;
}

export interface NoteRequest {
  outstandingCheckId: string;
  text: string;
  createdBy: string;
}