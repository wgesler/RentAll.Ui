//#Region Ticket State
export enum TicketStateType {
  caseCreated = 0,
  assigned = 1,
  scheduled = 2,
  inProgress = 3,
  workComplete = 4,
  closed = 5
}

export function getTicketStateType(ticketStateTypeId: number | undefined): string {
  if (ticketStateTypeId === undefined || ticketStateTypeId === null) return '';

  const stateTypeMap: { [key: number]: string } = {
    [TicketStateType.caseCreated]: 'Case Created',
    [TicketStateType.assigned]: 'Assigned',
    [TicketStateType.scheduled]: 'Scheduled',
    [TicketStateType.inProgress]: 'In Progress',
    [TicketStateType.workComplete]: 'Work Complete',
    [TicketStateType.closed]: 'Closed'
  };

  return stateTypeMap[ticketStateTypeId] || '';
}

export function getTicketStateTypes(): { value: number, label: string }[] {
  return [
    { value: TicketStateType.caseCreated, label: getTicketStateType(TicketStateType.caseCreated) },
    { value: TicketStateType.assigned, label: getTicketStateType(TicketStateType.assigned) },
    { value: TicketStateType.scheduled, label: getTicketStateType(TicketStateType.scheduled) },
    { value: TicketStateType.inProgress, label: getTicketStateType(TicketStateType.inProgress) },
    { value: TicketStateType.workComplete, label: getTicketStateType(TicketStateType.workComplete) },
    { value: TicketStateType.closed, label: getTicketStateType(TicketStateType.closed) }
  ];
}
//#endregion