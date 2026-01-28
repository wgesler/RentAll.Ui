export enum Status {
    Inactive = 0,
    Active = 1,
}

export function getStatus(statusId: number | undefined): string {
  if (statusId === undefined || statusId === null) return '';
  
  const statusMap: { [key: number]: string } = {
    [Status.Inactive]: 'Inactive',
    [Status.Active]: 'Active'
  };
  
  return statusMap[statusId] || '';
}