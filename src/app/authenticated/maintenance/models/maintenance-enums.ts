export enum WorkOrderType {
  Tenant = 0,
  Owner = 1,
  Organization = 2
}

export function getWorkOrderType(workOrderTypeId: number | undefined): string {
  if (workOrderTypeId === undefined || workOrderTypeId === null) return '';

  const typeMap: { [key: number]: string } = {
    [WorkOrderType.Tenant]: 'Tenant',
    [WorkOrderType.Owner]: 'Owner',
    [WorkOrderType.Organization]: 'Organization'
  };

  return typeMap[workOrderTypeId] || '';
}

export function getWorkOrderTypes(): { value: number; label: string }[] {
  return Object.keys(WorkOrderType)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: WorkOrderType[key as keyof typeof WorkOrderType],
      label: getWorkOrderType(WorkOrderType[key as keyof typeof WorkOrderType])
    }));
}

export enum MaintenanceStatus {
  UnProcessed = 0,
  NeedToScheduleCleaners = 1,
  CleanersScheduled = 2,
  Cleaned = 3,
  WaitingForInspection = 4,
  InspectedWithIssues = 5,
  NeedToScheduleMaintenance = 6,
  MaintenanceScheduled = 7,
  MaintenanceComplete = 8,
  InspectionComplete = 9,
  Ready = 10
}

export function getMaintenanceStatus(maintenanceStatusId: number | undefined): string {
  if (maintenanceStatusId === undefined || maintenanceStatusId === null) return '';

  const statusMap: { [key: number]: string } = {
    [MaintenanceStatus.UnProcessed]: 'UnProcessed',
    [MaintenanceStatus.NeedToScheduleCleaners]: 'Need To Schedule Cleaners',
    [MaintenanceStatus.CleanersScheduled]: 'Cleaners Scheduled',
    [MaintenanceStatus.Cleaned]: 'Cleaned',
    [MaintenanceStatus.WaitingForInspection]: 'Waiting For Inspection',
    [MaintenanceStatus.InspectedWithIssues]: 'Inspected With Issues',
    [MaintenanceStatus.NeedToScheduleMaintenance]: 'Need To Schedule Maintenance',
    [MaintenanceStatus.MaintenanceScheduled]: 'Maintenance Scheduled',
    [MaintenanceStatus.MaintenanceComplete]: 'Maintenance Complete',
    [MaintenanceStatus.InspectionComplete]: 'Inspection Complete',
    [MaintenanceStatus.Ready]: 'Ready'
  };

  return statusMap[maintenanceStatusId] || '';
}

export function getMaintenanceStatuses(): { value: number, label: string }[] {
  return Object.keys(MaintenanceStatus)
    .filter(key => isNaN(Number(key)))
    .map(key => ({
      value: MaintenanceStatus[key as keyof typeof MaintenanceStatus],
      label: getMaintenanceStatus(MaintenanceStatus[key as keyof typeof MaintenanceStatus])
    }));
}
