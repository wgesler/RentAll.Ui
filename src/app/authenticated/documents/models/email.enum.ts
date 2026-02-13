export enum EmailStatus {
  Unsent = 0,
  Attempting = 1,
  Failed = 2,
  Succeeded = 3
}

export function getEmailStatus(emailStatusId: number | undefined): string {
  if (emailStatusId === undefined || emailStatusId === null) return '';

  const statusMap: { [key: number]: string } = {
    [EmailStatus.Unsent]: 'Unsent',
    [EmailStatus.Attempting]: 'Attempting',
    [EmailStatus.Failed]: 'Failed',
    [EmailStatus.Succeeded]: 'Succeeded'
  };

  return statusMap[emailStatusId] || '';
}

export function getEmailStatusLabel(emailStatus: EmailStatus): string {
  return getEmailStatus(emailStatus) || EmailStatus[emailStatus] || 'Unsent';
}
