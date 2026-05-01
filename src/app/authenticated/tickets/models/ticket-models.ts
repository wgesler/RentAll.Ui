export interface TicketRequest {
    ticketId: number;
    organizationId: string;
    officeId: number;
    officeName: string;
    propertyId: string | null;
    PropertyCode: string | null;
    assigneeId?: string | null;
    ReservationId : string | null;
    ReservationCode : string | null;
    TicketCode: string;
    Title: string;
    Description: string;
    ticketStateTypeId: number
    permissionToEnter: boolean;
    ownerContacted: boolean;
    confirmedWithTenant: boolean;
    followedUpWithOwner: boolean;
    workOrderCompleted: boolean;
    Notes?: TicketNoteRequest[] | null;
    IsActive: boolean;
}

export interface TicketResponse {
    ticketId: number;
    organizationId: string;
    officeId: number;
    officeName: string;
    propertyId: string | null;
    PropertyCode: string | null;
    assigneeId?: string | null;
    assignee?: string | null;
    ReservationId : string | null;
    ReservationCode : string | null;
    TicketCode: string;
    Title: string;
    Description: string;
    ticketStateTypeId: number
    permissionToEnter: boolean;
    ownerContacted: boolean;
    confirmedWithTenant: boolean;
    followedUpWithOwner: boolean;
    workOrderCompleted: boolean;
    Notes?: TicketNoteResponse[] | null;
    IsActive: boolean;
}

export interface TicketNoteRequest {
  ticketNoteId?: number | null;
  ticketId?: string | null;
  note: string;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface TicketNoteResponse {
  ticketNoteId: number;
  ticketId: string;
  note: string;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}