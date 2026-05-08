import { TrackerContextType } from './tracker-enum';

export interface TrackerContextResponse {
  trackerContextId: TrackerContextType;
  code: string;
  description: string;
  isActive: boolean;
}

export interface TrackerDefinitionRequest {
  trackerDefinitionId?: string;
  organizationId: string;
  officeId: number;
  trackerContextId: TrackerContextType;
  displayName: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TrackerDefinitionOptionRequest {
  trackerDefinitionOptionId?: string;
  trackerDefinitionId: string;
  label: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TrackerDefinitionResponse {
  trackerDefinitionId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  trackerContextId: TrackerContextType;
  trackerContextCode: string;
  displayName: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface TrackerDefinitionOptionResponse {
  trackerDefinitionOptionId: string;
  trackerDefinitionId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  trackerContextId: TrackerContextType;
  trackerContextCode: string;
  trackerDisplayName: string;
  trackerDescription?: string;
  trackerSortOrder: number;
  label: string;
  optionDescription?: string;
  optionSortOrder: number;
  isActive: boolean;
}

export interface TrackerConfigurationDefinitionResponse extends TrackerDefinitionResponse {
  options: TrackerDefinitionOptionResponse[];
}

export interface TrackerConfigurationContextResponse extends TrackerContextResponse {
  definitions: TrackerConfigurationDefinitionResponse[];
}

export interface TrackerConfigurationResponse {
  contexts: TrackerConfigurationContextResponse[];
}

export interface TrackerDefinitionListDisplay {
  trackerDefinitionId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  trackerContextId: TrackerContextType;
  trackerContextCode: string;
  trackerContextLabel: string;
  displayName: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  options?: TrackerDefinitionOptionResponse[];
}

export interface TrackerContextSection {
  value: TrackerContextType;
  label: string;
  trackers: TrackerDefinitionListDisplay[];
}

export interface TrackerOfficeSection {
  officeId: number;
  officeName: string;
  contexts: TrackerContextSection[];
}

export interface TrackerSelectionEvent {
  trackerDefinitionId: string;
  trackerContextId: TrackerContextType | null;
  officeId: number | null;
  tracker: TrackerDefinitionListDisplay | null;
}
