export interface CheckHtmlResponse {
  checkHtmlId: string;
  organizationId: string;
  officeId?: number | null;
  check: string;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}
