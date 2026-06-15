export interface FeatureRequest {
  featureId?: number;
  organizationId: string;
  featureTypeId: number;
  hasAccess: boolean;
}

export interface FeatureResponse {
  featureId: number;
  organizationId: string;
  featureTypeId: number;
  featureCode: string;
  featureTypeDescription: string;
  hasAccess: boolean;
}

export type FeatureListDisplay = FeatureResponse;

export interface FeatureToggleCell {
  featureTypeId: number;
  featureTypeLabel: string;
  featureId?: number;
  hasAccess: boolean;
  isSaving: boolean;
}
