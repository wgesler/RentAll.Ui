import { PropertyResponse } from '../../properties/models/property.model';

export interface InspectionReadonlyDialogData {
  title: string;
  property: PropertyResponse | null;
  templateJson: string | null;
  answersJson: string | null;
  checklistType: 'inspection';
}
