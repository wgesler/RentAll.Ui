export interface EmailResponse {
  emailId: number;
  outstandingCheckId: string;
  companyName: string;
  payeeName: string;
  payeeEmail: string;
  isEscheat: boolean;
  success: boolean;
  createdBy: string;
  createdOn: Date;
}

export interface EmailDisplay {
  companyName: string;
  payeeName: string;
  payeeEmail: string;
  isEscheat: string;
  success: boolean;
  createdBy: string;
  createdOn: string;
}