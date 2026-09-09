import { UtilityService } from '../../../services/utility.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ServiceType, getServiceType } from '../../shared/models/mixed-enums';
import { MaintenanceListDisplay, ReservationPropertyMaintenance } from '../../shared/models/mixed-models';
import { formatPropertyBedTypesSummary } from '../../properties/models/property-enums';
import { MobileMaintenanceSlices } from './mobile-dashboard-maintenance-data';
import { MobileScheduleDateCell } from './mobile-dashboard-calendar.model';

export type MobileScheduleServiceProviderOption = {
  userId: string;
  label: string;
};

type ScheduleBuildContext = {
  utilityService: UtilityService;
  currentMonthStartAtMidnight: Date;
  filteredReservationPropertyMaintenanceList: ReservationPropertyMaintenance[];
  getInclusiveCurrentAndNextMonthOrdinalBounds: () => { lo: number; hi: number } | null;
};

function isValidScheduleDate(value: string): boolean {
  const trimmed = String(value || '').trim();
  return !!trimmed && trimmed !== '—' && trimmed !== '-' && trimmed !== 'N/A';
}

function buildScheduleDateCell(text: string, emphasis: MobileScheduleDateCell['emphasis']): MobileScheduleDateCell {
  const trimmed = String(text || '').trim();
  if (!isValidScheduleDate(trimmed)) {
    return { text: '', emphasis: 'none' };
  }
  return { text: trimmed, emphasis };
}

function resolveScheduleProviderName(
  providerCell: MaintenanceListDisplay['cleaner'],
  emptyLabels: string[]
): string {
  if (providerCell && typeof providerCell === 'object' && 'value' in providerCell) {
    const value = String(providerCell.value || '').trim();
    if (value && !emptyLabels.includes(value)) {
      return value;
    }
  }
  return '';
}

function resolveScheduleCleanerName(row: MaintenanceListDisplay): string {
  return resolveScheduleProviderName(row.cleaner, ['Clear Selection', 'Select Cleaner']);
}

function getScheduleServiceSlots(row: MaintenanceListDisplay): {
  serviceKind: 'cleaning' | 'carpet' | 'inspecting' | 'maid';
  serviceDate: string;
  providerUserId: string | null;
  providerName: string;
}[] {
  if (row.eventType === ServiceType.MaidService) {
    const serviceDate = String(row.eventDate || '').trim();
    if (!isValidScheduleDate(serviceDate)) {
      return [];
    }
    return [{
      serviceKind: 'maid',
      serviceDate,
      providerUserId: row.cleanerUserId ?? null,
      providerName: resolveScheduleCleanerName(row)
    }];
  }

  const slots: {
    serviceKind: 'cleaning' | 'carpet' | 'inspecting';
    serviceDate: string;
    providerUserId: string | null;
    providerName: string;
  }[] = [];

  const cleaningDate = String(row.cleaningDate || '').trim();
  if (isValidScheduleDate(cleaningDate)) {
    slots.push({
      serviceKind: 'cleaning',
      serviceDate: cleaningDate,
      providerUserId: row.cleanerUserId ?? null,
      providerName: resolveScheduleProviderName(row.cleaner, ['Clear Selection', 'Select Cleaner'])
    });
  }

  const carpetDate = String(row.carpetDate || '').trim();
  if (isValidScheduleDate(carpetDate)) {
    slots.push({
      serviceKind: 'carpet',
      serviceDate: carpetDate,
      providerUserId: row.carpetUserId ?? null,
      providerName: resolveScheduleProviderName(row.carpet, ['Clear Selection', 'Select Carpet Cleaner'])
    });
  }

  const inspectingDate = String(row.inspectingDate || '').trim();
  if (isValidScheduleDate(inspectingDate)) {
    slots.push({
      serviceKind: 'inspecting',
      serviceDate: inspectingDate,
      providerUserId: row.inspectorUserId ?? null,
      providerName: resolveScheduleProviderName(row.inspector, ['Clear Selection', 'Select Inspector'])
    });
  }

  return slots;
}

function buildPropertyReservationTimeline(
  context: ScheduleBuildContext
): Map<
  string,
  {
    reservationId: string;
    arrivalDateOrdinal: number;
    departureDateOrdinal: number;
    arrivalDateDisplay: string;
    departureDateDisplay: string;
  }[]
> {
  const byProperty = new Map<
    string,
    {
      reservationId: string;
      arrivalDateOrdinal: number;
      departureDateOrdinal: number;
      arrivalDateDisplay: string;
      departureDateDisplay: string;
    }[]
  >();

  for (const reservation of context.filteredReservationPropertyMaintenanceList) {
    const propertyId = context.utilityService.normalizeId(reservation.propertyId);
    const reservationId = context.utilityService.normalizeId(reservation.reservationId);
    const arrivalDateOrdinal = reservation.arrivalDateOrdinal;
    const departureDateOrdinal = reservation.departureDateOrdinal;
    if (!propertyId || !reservationId || arrivalDateOrdinal == null || departureDateOrdinal == null) {
      continue;
    }
    const list = byProperty.get(propertyId) ?? [];
    list.push({
      reservationId,
      arrivalDateOrdinal,
      departureDateOrdinal,
      arrivalDateDisplay: reservation.arrivalDateDisplay || '',
      departureDateDisplay: reservation.departureDateDisplay || ''
    });
    byProperty.set(propertyId, list);
  }

  for (const list of byProperty.values()) {
    list.sort((a, b) => a.arrivalDateOrdinal - b.arrivalDateOrdinal);
  }
  return byProperty;
}

function findPreviousDepartureDate(
  utilityService: UtilityService,
  timeline: {
    reservationId: string;
    arrivalDateOrdinal: number;
    departureDateOrdinal: number;
    arrivalDateDisplay: string;
    departureDateDisplay: string;
  }[],
  beforeArrivalOrdinal: number,
  reservationId?: string
): string {
  const normalizedReservationId = reservationId ? utilityService.normalizeId(reservationId) : '';
  let best: (typeof timeline)[number] | null = null;
  for (const entry of timeline) {
    if (entry.departureDateOrdinal <= beforeArrivalOrdinal && entry.reservationId !== normalizedReservationId) {
      if (!best || entry.departureDateOrdinal > best.departureDateOrdinal) {
        best = entry;
      }
    }
  }
  return best?.departureDateDisplay ?? '';
}

function findNextArrivalDate(
  utilityService: UtilityService,
  timeline: {
    reservationId: string;
    arrivalDateOrdinal: number;
    departureDateOrdinal: number;
    arrivalDateDisplay: string;
    departureDateDisplay: string;
  }[],
  afterDepartureOrdinal: number,
  reservationId?: string
): string {
  const normalizedReservationId = reservationId ? utilityService.normalizeId(reservationId) : '';
  let best: (typeof timeline)[number] | null = null;
  for (const entry of timeline) {
    if (entry.arrivalDateOrdinal >= afterDepartureOrdinal && entry.reservationId !== normalizedReservationId) {
      if (!best || entry.arrivalDateOrdinal < best.arrivalDateOrdinal) {
        best = entry;
      }
    }
  }
  return best?.arrivalDateDisplay ?? '';
}

function buildScheduleDateCells(
  context: ScheduleBuildContext,
  row: MaintenanceListDisplay,
  timeline: Map<
    string,
    {
      reservationId: string;
      arrivalDateOrdinal: number;
      departureDateOrdinal: number;
      arrivalDateDisplay: string;
      departureDateDisplay: string;
    }[]
  >,
  reservationById: Map<string, ReservationPropertyMaintenance>,
  serviceDate: string
): {
  scheduleDepartureDate: MobileScheduleDateCell;
  scheduleArrivalDate: MobileScheduleDateCell;
  scheduledCleanDate: MobileScheduleDateCell;
  serviceDate: MobileScheduleDateCell;
} {
  const reservationId = context.utilityService.normalizeId(row.reservationId ?? '');
  const reservation = reservationId ? reservationById.get(reservationId) : undefined;
  const propertyId = context.utilityService.normalizeId(row.propertyId);
  const propertyTimeline = timeline.get(propertyId) ?? [];
  const eventDate = String(row.eventDate || '').trim();

  if (row.eventType === ServiceType.Departure) {
    return {
      scheduleDepartureDate: buildScheduleDateCell(reservation?.departureDateDisplay || eventDate, 'primary'),
      scheduleArrivalDate: buildScheduleDateCell(
        reservation?.departureDateOrdinal != null
          ? findNextArrivalDate(
              context.utilityService,
              propertyTimeline,
              reservation.departureDateOrdinal,
              reservationId
            )
          : '',
        'none'
      ),
      scheduledCleanDate: buildScheduleDateCell('', 'none'),
      serviceDate: buildScheduleDateCell(serviceDate, 'none')
    };
  }

  if (row.eventType === ServiceType.Arrival) {
    return {
      scheduleDepartureDate: buildScheduleDateCell(
        reservation?.arrivalDateOrdinal != null
          ? findPreviousDepartureDate(
              context.utilityService,
              propertyTimeline,
              reservation.arrivalDateOrdinal,
              reservationId
            )
          : '',
        'none'
      ),
      scheduleArrivalDate: buildScheduleDateCell(reservation?.arrivalDateDisplay || eventDate, 'primary'),
      scheduledCleanDate: buildScheduleDateCell('', 'none'),
      serviceDate: buildScheduleDateCell(serviceDate, 'none')
    };
  }

  if (row.eventType === ServiceType.MaidService) {
    return {
      scheduleDepartureDate: buildScheduleDateCell('', 'none'),
      scheduleArrivalDate: buildScheduleDateCell('', 'none'),
      scheduledCleanDate: buildScheduleDateCell(eventDate, 'primary'),
      serviceDate: buildScheduleDateCell(serviceDate, 'none')
    };
  }

  if (row.eventType === ServiceType.Offline) {
    return {
      scheduleDepartureDate: buildScheduleDateCell(eventDate, 'primary'),
      scheduleArrivalDate: buildScheduleDateCell('', 'none'),
      scheduledCleanDate: buildScheduleDateCell('', 'none'),
      serviceDate: buildScheduleDateCell(serviceDate, 'none')
    };
  }

  if (row.eventType === ServiceType.Online) {
    return {
      scheduleDepartureDate: buildScheduleDateCell('', 'none'),
      scheduleArrivalDate: buildScheduleDateCell(eventDate, 'primary'),
      scheduledCleanDate: buildScheduleDateCell('', 'none'),
      serviceDate: buildScheduleDateCell(serviceDate, 'none')
    };
  }

  return {
    scheduleDepartureDate: buildScheduleDateCell('', 'none'),
    scheduleArrivalDate: buildScheduleDateCell('', 'none'),
    scheduledCleanDate: buildScheduleDateCell('', 'none'),
    serviceDate: buildScheduleDateCell(serviceDate, 'none')
  };
}

function resolveScheduleHasPets(
  context: ScheduleBuildContext,
  row: MaintenanceListDisplay,
  reservationById: Map<string, ReservationPropertyMaintenance>
): boolean {
  const reservationId = context.utilityService.normalizeId(row.reservationId ?? '');
  if (reservationId) {
    const reservation = reservationById.get(reservationId);
    if (reservation) {
      return reservation.hasPets === true;
    }
  }
  return row.hasPets === true;
}

function isScheduleServiceDateFromCurrentMonthForward(context: ScheduleBuildContext, dateDisplay: string): boolean {
  const dateOrdinal = context.utilityService.parseCalendarDateToOrdinal(dateDisplay);
  const monthStartOrdinal = context.utilityService.parseCalendarDateToOrdinal(
    context.utilityService.formatDateOnlyForApi(context.currentMonthStartAtMidnight)
  );
  if (dateOrdinal == null || monthStartOrdinal == null) {
    return false;
  }
  return dateOrdinal >= monthStartOrdinal;
}

function isScheduleEventInDashboardWindow(
  context: ScheduleBuildContext,
  row: MaintenanceListDisplay
): boolean {
  const bounds = context.getInclusiveCurrentAndNextMonthOrdinalBounds();
  if (!bounds) {
    return false;
  }
  const eventOrdinal = context.utilityService.parseCalendarDateToOrdinal(String(row.eventDate || '').trim());
  if (eventOrdinal == null) {
    return false;
  }
  return eventOrdinal >= bounds.lo && eventOrdinal <= bounds.hi;
}

function shouldIncludeScheduleRow(
  context: ScheduleBuildContext,
  row: MaintenanceListDisplay,
  scheduleSortDate: string
): boolean {
  if (!isValidScheduleDate(scheduleSortDate) || !isScheduleServiceDateFromCurrentMonthForward(context, scheduleSortDate)) {
    return false;
  }
  if (
    row.eventType === ServiceType.Arrival
    || row.eventType === ServiceType.Departure
    || row.eventType === ServiceType.Online
    || row.eventType === ServiceType.Offline
  ) {
    return isScheduleEventInDashboardWindow(context, row);
  }
  return true;
}

export function buildMobileScheduleDisplayColumns(): ColumnSet {
  return {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
    serviceDate: { displayAs: 'Service Date', maxWidth: '15ch', alignment: 'center', wrap: false }
  };
}

export function buildMobileScheduleExportColumns(): ColumnSet {
  return {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch', wrap: false },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    bedTypesText: { displayAs: 'Beds', wrap: false, maxWidth: '18ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' },
    hasPets: { displayAs: 'Pets', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '10ch' },
    scheduleDepartureDate: {
      displayAs: 'Departure or',
      headerLine2: 'Offline',
      maxWidth: '15ch',
      alignment: 'center',
      headerAlignment: 'center',
      wrap: false
    },
    scheduleArrivalDate: {
      displayAs: 'Arrival or',
      headerLine2: 'Online',
      maxWidth: '15ch',
      alignment: 'center',
      headerAlignment: 'center',
      wrap: false
    },
    scheduledCleanDate: {
      displayAs: 'Maid',
      headerLine2: 'Service',
      maxWidth: '15ch',
      alignment: 'center',
      headerAlignment: 'center',
      wrap: false
    },
    cleanerName: { displayAs: 'Service Provider', maxWidth: '20ch', wrap: false },
    serviceDate: { displayAs: 'Service Date', maxWidth: '15ch', alignment: 'center', wrap: false }
  };
}

export function buildMobileScheduleCleaningRows(
  slices: MobileMaintenanceSlices,
  context: ScheduleBuildContext
): MaintenanceListDisplay[] {
  const timeline = buildPropertyReservationTimeline(context);
  const reservationById = new Map(
    context.filteredReservationPropertyMaintenanceList.map(row => [
      context.utilityService.normalizeId(row.reservationId),
      row
    ] as const)
  );
  const combined = [
    ...slices.arrivals,
    ...slices.departures,
    ...slices.online,
    ...slices.offline,
    ...slices.maid,
    ...slices.occupied,
    ...slices.vacant,
    ...slices.offlineStatus
  ];
  const seen = new Set<string>();
  const rows: MaintenanceListDisplay[] = [];

  for (const row of combined) {
    for (const slot of getScheduleServiceSlots(row)) {
      if (!shouldIncludeScheduleRow(context, row, slot.serviceDate)) {
        continue;
      }
      const key = [
        row.propertyId,
        row.reservationId || '',
        row.eventType ?? '',
        slot.serviceKind,
        slot.serviceDate,
        slot.providerUserId || ''
      ].join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const dateCells = buildScheduleDateCells(context, row, timeline, reservationById, slot.serviceDate);
        rows.push({
          ...row,
          eventTypeDisplay: row.eventType != null ? getServiceType(row.eventType) : '—',
          bedTypesText: formatPropertyBedTypesSummary(
            row.bedrooms,
            row.bedroomId1,
            row.bedroomId2,
            row.bedroomId3,
            row.bedroomId4
          ),
          cleanerName: slot.providerName,
          cleanerUserId: slot.providerUserId,
          hasPets: resolveScheduleHasPets(context, row, reservationById),
          scheduleDepartureDate: dateCells.scheduleDepartureDate,
          scheduleArrivalDate: dateCells.scheduleArrivalDate,
          scheduledCleanDate: dateCells.scheduledCleanDate,
          serviceDate: dateCells.serviceDate,
          scheduleSortDate: slot.serviceDate,
          scheduleServiceKind: slot.serviceKind
        } as MaintenanceListDisplay & {
          eventTypeDisplay: string;
          cleanerName: string;
          scheduleDepartureDate: MobileScheduleDateCell;
          scheduleArrivalDate: MobileScheduleDateCell;
          scheduledCleanDate: MobileScheduleDateCell;
          serviceDate: MobileScheduleDateCell;
          scheduleSortDate: string;
          scheduleServiceKind: 'cleaning' | 'carpet' | 'inspecting' | 'maid';
        });
    }
  }

  return rows.sort((a, b) => {
    const aRow = a as MaintenanceListDisplay & { scheduleSortDate?: string };
    const bRow = b as MaintenanceListDisplay & { scheduleSortDate?: string };
    const aOrdinal = context.utilityService.parseCalendarDateToOrdinal(aRow.scheduleSortDate) ?? Number.MAX_SAFE_INTEGER;
    const bOrdinal = context.utilityService.parseCalendarDateToOrdinal(bRow.scheduleSortDate) ?? Number.MAX_SAFE_INTEGER;
    if (aOrdinal !== bOrdinal) {
      return aOrdinal - bOrdinal;
    }
    return String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' });
  });
}

export function buildMobileServiceProviderOptions(
  providers: { userId: string; displayName: string }[],
  utilityService: UtilityService
): MobileScheduleServiceProviderOption[] {
  return providers.map(({ userId, displayName }) => ({
    userId: utilityService.normalizeId(userId),
    label: displayName
  }));
}
