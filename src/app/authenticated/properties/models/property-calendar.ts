export interface CalendarUrlRequest {
  propertyId: string;
  organizationId: string;
  token: string;
}

export interface CalendarUrlResponse {
  configuredBaseUrl?: string;
  fallbackBaseUrl?: string;
  finalBaseUrl?: string;
  subscriptionUrl: string;
  propertyId?: string;
  organizationId?: string;
}