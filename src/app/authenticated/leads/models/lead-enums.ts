//#region LeadStateType
export enum LeadStateType {
  New = 0,
  ReachedOut = 1,
  MadeContact = 2,
  NeverHeardBack = 3,
  NotInterested = 4,
  Interested = 5,
  Denied = 6,
  ChoseAnotherOption = 7,
  BookedWithUs = 8
}

export function formatLeadStateLabel(leadStateId: number): string {
  const labels: Record<number, string> = {
    [LeadStateType.New]: 'New',
    [LeadStateType.ReachedOut]: 'ReachedOut',
    [LeadStateType.MadeContact]: 'MadeContact',
    [LeadStateType.NeverHeardBack]: 'NeverHeardBack',
    [LeadStateType.NotInterested]: 'NotInterested',
    [LeadStateType.Interested]: 'Interested',
    [LeadStateType.Denied]: 'Denied',
    [LeadStateType.ChoseAnotherOption]: 'ChoseAnotherOption',
    [LeadStateType.BookedWithUs]: 'BookedWithUs'
  };
  return labels[leadStateId] ?? `State ${leadStateId}`;
}

export const LEAD_STATE_SELECT_OPTIONS: { value: LeadStateType; label: string }[] = [
  LeadStateType.New,
  LeadStateType.ReachedOut,
  LeadStateType.MadeContact,
  LeadStateType.NeverHeardBack,
  LeadStateType.NotInterested,
  LeadStateType.Interested,
  LeadStateType.Denied,
  LeadStateType.ChoseAnotherOption,
  LeadStateType.BookedWithUs
].map(value => ({ value, label: formatLeadStateLabel(value) }));
//#endregion
