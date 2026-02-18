export interface CalendarUrlRequest {
  propertyId: string;
  organizationId: string;
  token: string;
}

export interface CalendarUrlResponse {
  propertyId: string;
  organizationId: string;
  subscriptionUrl: string;
}