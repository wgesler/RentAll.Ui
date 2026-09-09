import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListResponse } from '../../maintenance/models/maintenance.model';
import { PropertyStatus } from '../../properties/models/property-enums';
import { ServiceType } from '../../shared/models/mixed-enums';
import {
  MaintenanceListDisplay,
  MaintenanceListMappingContext,
  PropertyMaintenance,
  ReservationPropertyMaintenance
} from '../../shared/models/mixed-models';
import { UserResponse } from '../../users/models/user.model';

export type MobileMaintenanceSlices = {
  arrivals: MaintenanceListDisplay[];
  departures: MaintenanceListDisplay[];
  online: MaintenanceListDisplay[];
  offline: MaintenanceListDisplay[];
  maid: MaintenanceListDisplay[];
  occupied: MaintenanceListDisplay[];
  vacant: MaintenanceListDisplay[];
  offlineStatus: MaintenanceListDisplay[];
};

type MaintenanceSliceContext = {
  mixedMappingService: MixedMappingService;
  mappingService: MappingService;
  utilityService: UtilityService;
  formatterService: FormatterService;
  arrivalReservations: ReservationPropertyMaintenance[];
  departureReservations: ReservationPropertyMaintenance[];
  cleaningReservations: ReservationPropertyMaintenance[];
  onlineProperties: PropertyMaintenance[];
  offlineProperties: PropertyMaintenance[];
  filteredPropertyMaintenanceList: PropertyMaintenance[];
  filteredReservationPropertyMaintenanceList: ReservationPropertyMaintenance[];
  housekeepingUsers: UserResponse[];
  carpetUsers: UserResponse[];
  inspectorUsers: UserResponse[];
  housekeepingById: Map<string, string>;
  carpetById: Map<string, string>;
  inspectorById: Map<string, string>;
  getMaintenanceForPropertyId: (propertyId: string, propertyIdAlt?: string) => MaintenanceListResponse | null;
};

export function buildMobileMaintenanceSlices(
  context: MaintenanceSliceContext,
  options?: { includeStatusInventory?: boolean }
): MobileMaintenanceSlices {
  const includeStatusInventory = options?.includeStatusInventory !== false;
  const propertyRows = context.mappingService.mapPropertyListRows(
    context.filteredPropertyMaintenanceList.map(pm =>
      context.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm)
    )
  );
  const propertyById = new Map(propertyRows.map(property => [property.propertyId, property] as const));
  const currentReservationByPropertyId = context.mixedMappingService.getReservationData(
    context.filteredReservationPropertyMaintenanceList as never[]
  );
  const reservationById = new Map(
    context.filteredReservationPropertyMaintenanceList.map(row => [
      context.utilityService.normalizeId(row.reservationId),
      row
    ] as const)
  );
  const mappingContext: MaintenanceListMappingContext = {
    housekeepingUsers: context.housekeepingUsers,
    carpetUsers: context.carpetUsers,
    inspectorUsers: context.inspectorUsers,
    housekeepingById: context.housekeepingById,
    carpetById: context.carpetById,
    inspectorById: context.inspectorById,
    currentReservationByPropertyId
  };
  const noSort = MixedMappingService.maintenanceListNoDepartureSortTime;

  const mapMixedRow = (
    mixed: PropertyMaintenance,
    eventDateDisplay: string,
    eventDateSortTime: number,
    hasPets: boolean
  ): MaintenanceListDisplay | null => {
    if (!mixed.propertyId) {
      return null;
    }
    const propertyRow = propertyById.get(mixed.propertyId);
    if (!propertyRow) {
      return null;
    }
    const maintenanceRecord = context.getMaintenanceForPropertyId(mixed.propertyId, propertyRow.propertyId);
    return context.mixedMappingService.mapMaintenanceListDisplayFromMixedTurnoverRow({
      mixedRow: mixed,
      propertyRow,
      maintenanceRecord,
      context: mappingContext,
      eventDateDisplay,
      eventDateSortTime,
      hasPets
    });
  };

  const mapReservationRows = (
    rows: ReservationPropertyMaintenance[],
    dateDisplay: (row: ReservationPropertyMaintenance) => string,
    sortTime: (row: ReservationPropertyMaintenance) => number
  ) =>
    rows
      .map(row => mapMixedRow(row, dateDisplay(row), sortTime(row), row.hasPets))
      .filter((row): row is MaintenanceListDisplay => row !== null);

  const mapPropertyRows = (
    rows: PropertyMaintenance[],
    dateDisplay: (row: PropertyMaintenance) => string,
    sortTime: (row: PropertyMaintenance) => number
  ) =>
    rows
      .map(row => mapMixedRow(row, dateDisplay(row), sortTime(row), false))
      .filter((row): row is MaintenanceListDisplay => row !== null);

  const vacantStatusIds = new Set<number>([
    PropertyStatus.Vacant,
    PropertyStatus.Cleaned,
    PropertyStatus.Inspected,
    PropertyStatus.Ready,
    PropertyStatus.Maintenance
  ]);

  const mapStatusInventoryRows = (statusPredicate: (statusId: number) => boolean): MaintenanceListDisplay[] =>
    context.filteredPropertyMaintenanceList
      .filter(pm => !!pm.propertyId && statusPredicate(Number(pm.propertyStatusId)))
      .sort((a, b) => (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { sensitivity: 'base' }))
      .map(pm => {
        const snap = context.mixedMappingService.getMaintenanceListCurrentReservationFields(
          pm.propertyId,
          currentReservationByPropertyId
        );
        const reservationLookupId = context.utilityService.normalizeId(snap.reservationId ?? '');
        const reservationRow = reservationLookupId ? (reservationById.get(reservationLookupId) ?? null) : null;
        const mixedRow = reservationRow
          ? ({
              ...pm,
              reservationId: reservationRow.reservationId,
              eventType: ServiceType.Departure,
              dCleanerUserId: reservationRow.dCleanerUserId,
              dCleaningDate: reservationRow.dCleaningDate,
              dCleaningDateOrdinal: reservationRow.dCleaningDateOrdinal,
              dCleaningDateDisplay: reservationRow.dCleaningDateDisplay,
              dCarpetUserId: reservationRow.dCarpetUserId,
              dCarpetDate: reservationRow.dCarpetDate,
              dCarpetDateOrdinal: reservationRow.dCarpetDateOrdinal,
              dCarpetDateDisplay: reservationRow.dCarpetDateDisplay,
              dInspectorUserId: reservationRow.dInspectorUserId,
              dInspectingDate: reservationRow.dInspectingDate,
              dInspectingDateOrdinal: reservationRow.dInspectingDateOrdinal,
              dInspectingDateDisplay: reservationRow.dInspectingDateDisplay,
              maidUserId: reservationRow.maidUserId
            } as unknown as PropertyMaintenance)
          : ({
              ...pm,
              eventType: ServiceType.Online
            } as PropertyMaintenance);
        return mapMixedRow(mixedRow, snap.eventDate, snap.eventDateSortTime, snap.hasPets);
      })
      .filter((row): row is MaintenanceListDisplay => row !== null);

  return {
    arrivals: mapReservationRows(
      [...context.arrivalReservations].sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0)),
      row => row.arrivalDateDisplay,
      row => Number(row.eventDateSortTime ?? row.arrivalDateOrdinal ?? noSort)
    ),
    departures: mapReservationRows(
      [...context.departureReservations].sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0)),
      row => row.departureDateDisplay,
      row => Number(row.eventDateSortTime ?? row.departureDateOrdinal ?? noSort)
    ),
    maid: mapReservationRows(
      [...context.cleaningReservations].sort(
        (a, b) => (Number(a.eventDateSortTime) || 0) - (Number(b.eventDateSortTime) || 0)
      ),
      row => context.formatterService.formatDateString(row.eventDate ?? undefined) || '',
      row => Number(row.eventDateSortTime ?? noSort)
    ),
    online: mapPropertyRows(
      [...context.onlineProperties].sort((a, b) => (a.availableFromOrdinal ?? 0) - (b.availableFromOrdinal ?? 0)),
      row => row.availableFromDisplay,
      row => Number(row.eventDateSortTime ?? row.availableFromOrdinal ?? noSort)
    ),
    offline: mapPropertyRows(
      [...context.offlineProperties].sort((a, b) => (a.availableUntilOrdinal ?? 0) - (b.availableUntilOrdinal ?? 0)),
      row => row.availableUntilDisplay,
      row => Number(row.eventDateSortTime ?? row.availableUntilOrdinal ?? noSort)
    ),
    occupied: includeStatusInventory
      ? mapStatusInventoryRows(statusId => statusId === PropertyStatus.Occupied)
      : [],
    vacant: includeStatusInventory
      ? mapStatusInventoryRows(statusId => vacantStatusIds.has(statusId))
      : [],
    offlineStatus: includeStatusInventory
      ? mapStatusInventoryRows(statusId => statusId === PropertyStatus.Offline)
      : []
  };
}
