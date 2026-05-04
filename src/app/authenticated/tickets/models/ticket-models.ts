export interface TicketRequest {
  ticketId?: string | null;
  organizationId: string;
  officeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  assigneeId?: string | null;
  agentId?: string | null;
  ticketCode?: string | null;
  title: string;
  description: string;
  ticketStateTypeId: number
  needPermissionToEnter: boolean;
  permissionGranted: boolean;
  ownerContacted: boolean;
  confirmedWithTenant: boolean;
  followedUpWithOwner: boolean;
  workOrderCompleted: boolean;
  notes?: TicketNoteRequest[] | null;
  isActive: boolean;
}

export interface TicketResponse {
  ticketId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string | null;
  propertyCode: string | null;
  reservationId : string | null;
  reservationCode : string | null;
  assigneeId?: string | null;
  assignee?: string | null;
  assigneeName?: string | null;
  agentId?: string | null;
  agent?: string | null;
  agentName?: string | null;
  ticketCode: string;
  title: string;
  description: string;
  ticketStateTypeId: number
  needPermissionToEnter: boolean;
  permissionGranted: boolean;
  ownerContacted: boolean;
  confirmedWithTenant: boolean;
  followedUpWithOwner: boolean;
  workOrderCompleted: boolean;
  notes?: TicketNoteResponse[] | null;
  isActive: boolean;
  createdOn?: string | null;
  modifiedOn?: string | null;
}

export interface TicketNoteRequest {
  ticketNoteId?: number | null;
  ticketId?: string | null;
  note: string;
}

export interface TicketNoteResponse {
  ticketNoteId: number;
  ticketId: string;
  note: string;
  createdOn: string;
  createdBy: string;
  createdByName?: string | null;
  modifiedOn: string;
  modifiedBy: string;
  modifiedByName?: string | null;
}

export type TicketStateDropdownCell = {
  value: string;
  isOverridable: boolean;
  options: string[];
  panelClass: string[];
  toString: () => string;
};

export type TicketAssigneeDropdownCell = {
  value: string;
  isOverridable: boolean;
  options: string[];
  panelClass: string[];
  toString: () => string;
};

export type TicketListDisplay = TicketResponse & {
  ticketStateTypeText: TicketStateDropdownCell;
  assigneeDropdown: TicketAssigneeDropdownCell;
  created: string;
  modified: string;
  propertyId: string;
  reservationId: string;
};

export type TicketOfficeFilterOption = {
  officeId: number;
  officeName: string;
};

export type TicketPropertyFilterOption = {
  propertyId: string;
  propertyCode: string;
};

export type TicketReservationFilterOption = {
  reservationId: string;
  reservationCode: string;
};