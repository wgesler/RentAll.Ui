export type MobileListRow = {
  id: string;
  [key: string]: string;
};

export type MobileListFieldOption = {
  value: string;
  label: string;
};

export type MobileListField = {
  key: string;
  label: string;
  value: string;
  control: 'text' | 'select';
  multiple?: boolean;
  readonly?: boolean;
  options?: MobileListFieldOption[];
};

export type MobileTicketNoteDisplay = {
  author: string;
  createdOn: string;
  note: string;
};
