import { FormatterService } from '../../../services/formatter-service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListResponse } from '../../maintenance/models/maintenance.model';
import { PropertyStatus } from '../../properties/models/property-enums';
import { ServiceType } from '../../shared/models/mixed-enums';
import {
  PropertyMaintenance,
  ReservationPropertyMaintenance
} from '../../shared/models/mixed-models';
import { MobileCalendarMaintenanceRow } from './mobile-dashboard-calendar.model';

type CalendarDataContext = {
  mixedMappingService: MixedMappingService;
  utilityService: UtilityService;
  formatterService: FormatterService;
  getMaintenanceForPropertyId: (propertyId: string, propertyIdAlt?: string) => MaintenanceListResponse | null;
};

function mapMixedToCalendarRow(
  mixed: PropertyMaintenance | ReservationPropertyMaintenance,
  context: CalendarDataContext
): MobileCalendarMaintenanceRow {
  const provider = context.mixedMappingService.getProviderAssignmentForTurnoverRow(mixed);
  const maintenanceId = mixed.propertyId
    ? context.getMaintenanceForPropertyId(mixed.propertyId)?.maintenanceId ?? null
    : null;

  return {
    propertyCode: String(mixed.propertyCode ?? '').trim() || '—',
    reservationCode: 'reservationCode' in mixed
      ? (String(mixed.reservationCode ?? '').trim() || null)
      : null,
    contactName: String(('contactName' in mixed ? mixed.contactName : '') ?? '').trim() || '—',
    cleaningDate: provider.cleaningDateDisplay,
    carpetDate: provider.carpetDateDisplay,
    inspectingDate: provider.inspectingDateDisplay,
    eventType: mixed.eventType ?? null,
    propertyId: mixed.propertyId ?? null,
    reservationId: 'reservationId' in mixed
      ? context.utilityService.normalizeIdOrNull(mixed.reservationId)
      : null,
    maintenanceId: maintenanceId ?? null
  };
}

function mapReservationRows(
  rows: ReservationPropertyMaintenance[],
  context: CalendarDataContext
): MobileCalendarMaintenanceRow[] {
  return rows.map(row => mapMixedToCalendarRow(row, context));
}

function mapPropertyRows(
  rows: PropertyMaintenance[],
  context: CalendarDataContext
): MobileCalendarMaintenanceRow[] {
  return rows.map(row => mapMixedToCalendarRow(row, context));
}

export function buildMobileCalendarMaintenanceRows(params: {
  arrivalReservations: ReservationPropertyMaintenance[];
  departureReservations: ReservationPropertyMaintenance[];
  cleaningReservations: ReservationPropertyMaintenance[];
  onlineProperties: PropertyMaintenance[];
  offlineProperties: PropertyMaintenance[];
  filteredPropertyMaintenanceList: PropertyMaintenance[];
  filteredReservationPropertyMaintenanceList: ReservationPropertyMaintenance[];
  context: CalendarDataContext;
  includeStatusInventory?: boolean;
}): MobileCalendarMaintenanceRow[] {
  const includeStatusInventory = params.includeStatusInventory !== false;
  const {
    arrivalReservations,
    departureReservations,
    cleaningReservations,
    onlineProperties,
    offlineProperties,
    filteredPropertyMaintenanceList,
    filteredReservationPropertyMaintenanceList,
    context
  } = params;

  const reservationById = new Map(
    filteredReservationPropertyMaintenanceList.map(row => [
      context.utilityService.normalizeId(row.reservationId),
      row
    ] as const)
  );
  const currentReservationByPropertyId = context.mixedMappingService.getReservationData(
    filteredReservationPropertyMaintenanceList as never[]
  );

  const vacantStatusIds = new Set<number>([
    PropertyStatus.Vacant,
    PropertyStatus.Cleaned,
    PropertyStatus.Inspected,
    PropertyStatus.Ready,
    PropertyStatus.Maintenance
  ]);

  const mapStatusInventoryRows = (statusPredicate: (statusId: number) => boolean): MobileCalendarMaintenanceRow[] =>
    filteredPropertyMaintenanceList
      .filter(pm => !!pm.propertyId && statusPredicate(Number(pm.propertyStatusId)))
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
        return mapMixedToCalendarRow(mixedRow, context);
      });

  return [
    ...mapReservationRows(
      [...arrivalReservations].sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0)),
      context
    ),
    ...mapReservationRows(
      [...departureReservations].sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0)),
      context
    ),
    ...mapReservationRows(
      [...cleaningReservations].sort((a, b) => (Number(a.eventDateSortTime) || 0) - (Number(b.eventDateSortTime) || 0)),
      context
    ),
    ...mapPropertyRows(
      [...onlineProperties].sort((a, b) => (a.availableFromOrdinal ?? 0) - (b.availableFromOrdinal ?? 0)),
      context
    ),
    ...mapPropertyRows(
      [...offlineProperties].sort((a, b) => (a.availableUntilOrdinal ?? 0) - (b.availableUntilOrdinal ?? 0)),
      context
    ),
    ...(includeStatusInventory
      ? mapStatusInventoryRows(statusId => statusId === PropertyStatus.Occupied)
      : []),
    ...(includeStatusInventory
      ? mapStatusInventoryRows(statusId => vacantStatusIds.has(statusId))
      : []),
    ...(includeStatusInventory
      ? mapStatusInventoryRows(statusId => statusId === PropertyStatus.Offline)
      : [])
  ];
}
