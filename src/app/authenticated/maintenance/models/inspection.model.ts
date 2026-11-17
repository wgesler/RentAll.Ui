export interface InspectionRequest {
  inspectionId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  reservationId?: string | null;
  maintenanceId: string;
  inspectionTypeId: number;
  inspectionCheckList: string;
  documentPath?: string | null;
  isActive: boolean;
}

export interface InspectionResponse {
  inspectionId: number;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  reservationId: string;
  reservationCode: string; 
  maintenanceId: string;
  inspectionTypeId: number;
  inspectionCheckList: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}

export type ChecklistMode = 'template' | 'answer' | 'readonly';

export type ChecklistType = 'inspection';

export type ChecklistIssueEntry = {
  sectionTitle: string;
  setLabel?: string;
  lineText: string;
  issueText: string;
  photoSrc?: string | null;
};

export type ChecklistIssueEntryView = ChecklistIssueEntry & { _rid: number };

export type ChecklistIssueGroup = {
  sectionTitle: string;
  setLabel?: string;
  issues: ChecklistIssueEntryView[];
};

export type ChecklistIssuesDialogData = {
  issues: ChecklistIssueEntry[];
  propertyCode?: string | null;
  dateText?: string | null;
  organizationId?: string | null;
  officeId?: number | null;
  officeName?: string | null;
  propertyId?: string | null;
  reservationId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail?: string | null;
  toName?: string | null;
};

export type DialogIssueItemResult = {
  issueText: string;
  photoFile: File | null;
};

export type MobileAnswerSnapshotRow = {
  sectionKey: string;
  repeatIndex: number;
  itemIndex: number;
  checked: boolean;
  photoPath: string | null;
  documentId: string | null;
  count: number | null;
  issue: string | null;
  hasIssue: boolean;
};

export interface InspectionDisplayList {
  inspectionId: number;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  reservationId: string;
  reservationCode: string; 
  maintenanceId: string;
  inspectionTypeId: number;
  inspectionType?: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
