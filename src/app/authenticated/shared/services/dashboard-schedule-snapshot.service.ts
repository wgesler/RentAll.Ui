import { Injectable } from '@angular/core';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListResponse } from '../../maintenance/models/maintenance.model';
import { PropertyStatus, formatPropertyBedTypesSummary } from '../../properties/models/property-enums';
import { DashboardServiceProviderOption, ScheduleDateCell } from '../../dashboards/models/dashboard-model';
import { ServiceType, getServiceType } from '../models/mixed-enums';
import {
  MaintenanceListDisplay,
  MaintenanceListMappingContext,
  PropertyMaintenance,
  ReservationPropertyMaintenance
} from '../models/mixed-models';
import { ColumnSet } from '../data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';

export type DashboardScheduleSnapshotContext = {
  utilityService: UtilityService;
  mixedMappingService: MixedMappingService;
  mappingService: MappingService;
  formatterService: FormatterService;
  filteredPropertyMaintenanceList: PropertyMaintenance[];
  filteredReservationPropertyMaintenanceList: ReservationPropertyMaintenance[];
  arrivalReservations: ReservationPropertyMaintenance[];
  departureReservations: ReservationPropertyMaintenance[];
  cleaningReservations: ReservationPropertyMaintenance[];
  onlineProperties: PropertyMaintenance[];
  offlineProperties: PropertyMaintenance[];
  housekeepingUsers: UserResponse[];
  carpetUsers: UserResponse[];
  inspectorUsers: UserResponse[];
  housekeepingById: Map<string, string>;
  carpetById: Map<string, string>;
  inspectorById: Map<string, string>;
  currentMonthStartAtMidnight: Date;
  nextMonthEndAtMidnight: Date;
  getMaintenanceForPropertyId: (propertyId: string, propertyIdAlt?: string) => MaintenanceListResponse | null;
  getServiceProviders: () => { userId: string; displayName: string }[];
};

export type DashboardScheduleSnapshot = {
  scheduleCleaningRows: MaintenanceListDisplay[];
  scheduleCleaningColumns: ColumnSet;
  serviceProviderOptions: DashboardServiceProviderOption[];
};

export type DashboardScheduleMaintenanceFallbackRow = {
  propertyCode: string;
  propertyId: string | null;
  reservationId: string | null;
  cleaningDate: string;
  carpetDate: string;
  inspectingDate: string;
  eventType: ServiceType | null;
};

type MaintenanceSlices = {
  arrivals: MaintenanceListDisplay[];
  departures: MaintenanceListDisplay[];
  online: MaintenanceListDisplay[];
  offline: MaintenanceListDisplay[];
  maid: MaintenanceListDisplay[];
  occupied: MaintenanceListDisplay[];
  vacant: MaintenanceListDisplay[];
  offlineStatus: MaintenanceListDisplay[];
};

@Injectable({ providedIn: 'root' })
export class DashboardScheduleSnapshotService {
  buildSnapshot(
    context: DashboardScheduleSnapshotContext,
    maintenanceFallbackRows: DashboardScheduleMaintenanceFallbackRow[] = []
  ): DashboardScheduleSnapshot {
    const maintenanceSlices = this.buildMaintenanceSlices(context);
    let scheduleCleaningRows = this.buildScheduleCleaningRows(context, maintenanceSlices);
    if (scheduleCleaningRows.length === 0 && maintenanceFallbackRows.length > 0) {
      scheduleCleaningRows = this.buildScheduleRowsFromMaintenanceFallback(context, maintenanceFallbackRows);
    }

    return {
      scheduleCleaningRows,
      scheduleCleaningColumns: this.buildScheduleCleaningColumns(),
      serviceProviderOptions: context.getServiceProviders().map(({ userId, displayName }) => ({
        userId: context.utilityService.normalizeId(userId),
        label: displayName
      }))
    };
  }

  private buildScheduleRowsFromMaintenanceFallback(
    context: DashboardScheduleSnapshotContext,
    maintenanceRows: DashboardScheduleMaintenanceFallbackRow[]
  ): MaintenanceListDisplay[] {
    const bounds = this.getInclusiveBounds(context);
    if (!bounds) {
      return [];
    }

    const rows: MaintenanceListDisplay[] = [];
    const seen = new Set<string>();

    for (const maint of maintenanceRows) {
      const slots: { kind: 'cleaning' | 'carpet' | 'inspecting' | 'maid'; date: string }[] = [
        { kind: maint.eventType === ServiceType.MaidService ? 'maid' : 'cleaning', date: maint.cleaningDate },
        { kind: 'carpet', date: maint.carpetDate },
        { kind: 'inspecting', date: maint.inspectingDate }
      ];

      for (const slot of slots) {
        const serviceDate = String(slot.date || '').trim();
        if (!this.isValidScheduleDate(serviceDate)) {
          continue;
        }
        const ordinal = context.utilityService.parseCalendarDateToOrdinal(serviceDate);
        if (ordinal == null || ordinal < bounds.lo || ordinal > bounds.hi) {
          continue;
        }
        const key = [maint.propertyId, maint.reservationId, slot.kind, serviceDate].join('|');
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        rows.push({
          propertyCode: maint.propertyCode,
          propertyId: maint.propertyId,
          reservationId: maint.reservationId,
          serviceDate: { text: serviceDate, emphasis: 'none' },
          scheduleSortDate: serviceDate,
          scheduleServiceKind: slot.kind
        } as MaintenanceListDisplay & { scheduleSortDate: string; scheduleServiceKind: typeof slot.kind });
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

  buildScheduleCleaningColumns(): ColumnSet {
    return {
      propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
      serviceDate: { displayAs: 'Service Date', maxWidth: '15ch', alignment: 'center', wrap: false }
    };
  }

  private buildMaintenanceSlices(context: DashboardScheduleSnapshotContext): MaintenanceSlices {
    const propertyRows = context.mappingService.mapPropertyListRows(
      context.filteredPropertyMaintenanceList.map(pm =>
        context.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm)
      )
    );
    const propertyById = new Map(
      propertyRows.map(property => [context.utilityService.normalizeId(property.propertyId), property] as const)
    );
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
      const propertyId = context.utilityService.normalizeId(mixed.propertyId ?? '');
      if (!propertyId) {
        return null;
      }
      const propertyRow = propertyById.get(propertyId);
      if (!propertyRow) {
        return null;
      }
      const maintenanceRecord = context.getMaintenanceForPropertyId(mixed.propertyId ?? '', propertyRow.propertyId);
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
      occupied: mapStatusInventoryRows(statusId => statusId === PropertyStatus.Occupied),
      vacant: mapStatusInventoryRows(statusId => vacantStatusIds.has(statusId)),
      offlineStatus: mapStatusInventoryRows(statusId => statusId === PropertyStatus.Offline)
    };
  }

  private buildScheduleCleaningRows(
    context: DashboardScheduleSnapshotContext,
    slices: MaintenanceSlices
  ): MaintenanceListDisplay[] {
    const timeline = this.buildPropertyReservationTimeline(context);
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
      for (const slot of this.getScheduleServiceSlots(row)) {
        if (!this.shouldIncludeScheduleRow(context, row, slot.serviceDate)) {
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
        const dateCells = this.buildScheduleDateCells(context, row, timeline, reservationById, slot.serviceDate);
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
          hasPets: this.resolveScheduleHasPets(context, row, reservationById),
          scheduleDepartureDate: dateCells.scheduleDepartureDate,
          scheduleArrivalDate: dateCells.scheduleArrivalDate,
          scheduledCleanDate: dateCells.scheduledCleanDate,
          serviceDate: dateCells.serviceDate,
          scheduleSortDate: slot.serviceDate,
          scheduleServiceKind: slot.serviceKind
        } as MaintenanceListDisplay & {
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

  private isValidScheduleDate(value: string): boolean {
    const trimmed = String(value || '').trim();
    return !!trimmed && trimmed !== '—' && trimmed !== '-' && trimmed !== 'N/A';
  }

  private getInclusiveBounds(context: DashboardScheduleSnapshotContext): { lo: number; hi: number } | null {
    const lo = context.utilityService.parseCalendarDateToOrdinal(
      context.utilityService.formatDateOnlyForApi(context.currentMonthStartAtMidnight)
    );
    const hi = context.utilityService.parseCalendarDateToOrdinal(
      context.utilityService.formatDateOnlyForApi(context.nextMonthEndAtMidnight)
    );
    if (lo === null || hi === null) {
      return null;
    }
    return { lo, hi };
  }

  private isScheduleServiceDateFromCurrentMonthForward(context: DashboardScheduleSnapshotContext, dateDisplay: string): boolean {
    const dateOrdinal = context.utilityService.parseCalendarDateToOrdinal(dateDisplay);
    const monthStartOrdinal = context.utilityService.parseCalendarDateToOrdinal(
      context.utilityService.formatDateOnlyForApi(context.currentMonthStartAtMidnight)
    );
    if (dateOrdinal == null || monthStartOrdinal == null) {
      return false;
    }
    return dateOrdinal >= monthStartOrdinal;
  }

  private isScheduleEventInDashboardWindow(context: DashboardScheduleSnapshotContext, row: MaintenanceListDisplay): boolean {
    const bounds = this.getInclusiveBounds(context);
    if (!bounds) {
      return false;
    }
    const eventOrdinal = context.utilityService.parseCalendarDateToOrdinal(String(row.eventDate || '').trim());
    if (eventOrdinal == null) {
      return false;
    }
    return eventOrdinal >= bounds.lo && eventOrdinal <= bounds.hi;
  }

  private shouldIncludeScheduleRow(
    context: DashboardScheduleSnapshotContext,
    row: MaintenanceListDisplay,
    scheduleSortDate: string
  ): boolean {
    if (!this.isValidScheduleDate(scheduleSortDate) || !this.isScheduleServiceDateFromCurrentMonthForward(context, scheduleSortDate)) {
      return false;
    }
    if (
      row.eventType === ServiceType.Arrival
      || row.eventType === ServiceType.Departure
      || row.eventType === ServiceType.Online
      || row.eventType === ServiceType.Offline
    ) {
      return this.isScheduleEventInDashboardWindow(context, row);
    }
    return true;
  }

  private resolveScheduleProviderName(
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

  private getScheduleServiceSlots(row: MaintenanceListDisplay): {
    serviceKind: 'cleaning' | 'carpet' | 'inspecting' | 'maid';
    serviceDate: string;
    providerUserId: string | null;
    providerName: string;
  }[] {
    if (row.eventType === ServiceType.MaidService) {
      const serviceDate = String(row.eventDate || '').trim();
      if (!this.isValidScheduleDate(serviceDate)) {
        return [];
      }
      return [{
        serviceKind: 'maid',
        serviceDate,
        providerUserId: row.cleanerUserId ?? null,
        providerName: this.resolveScheduleProviderName(row.cleaner, ['Clear Selection', 'Select Cleaner'])
      }];
    }

    const slots: {
      serviceKind: 'cleaning' | 'carpet' | 'inspecting';
      serviceDate: string;
      providerUserId: string | null;
      providerName: string;
    }[] = [];

    const cleaningDate = String(row.cleaningDate || '').trim();
    if (this.isValidScheduleDate(cleaningDate)) {
      slots.push({
        serviceKind: 'cleaning',
        serviceDate: cleaningDate,
        providerUserId: row.cleanerUserId ?? null,
        providerName: this.resolveScheduleProviderName(row.cleaner, ['Clear Selection', 'Select Cleaner'])
      });
    }

    const carpetDate = String(row.carpetDate || '').trim();
    if (this.isValidScheduleDate(carpetDate)) {
      slots.push({
        serviceKind: 'carpet',
        serviceDate: carpetDate,
        providerUserId: row.carpetUserId ?? null,
        providerName: this.resolveScheduleProviderName(row.carpet, ['Clear Selection', 'Select Carpet Cleaner'])
      });
    }

    const inspectingDate = String(row.inspectingDate || '').trim();
    if (this.isValidScheduleDate(inspectingDate)) {
      slots.push({
        serviceKind: 'inspecting',
        serviceDate: inspectingDate,
        providerUserId: row.inspectorUserId ?? null,
        providerName: this.resolveScheduleProviderName(row.inspector, ['Clear Selection', 'Select Inspector'])
      });
    }

    return slots;
  }

  private buildPropertyReservationTimeline(context: DashboardScheduleSnapshotContext) {
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

  private buildScheduleDateCell(text: string, emphasis: 'primary' | 'muted' | 'none'): ScheduleDateCell {
    const trimmed = String(text || '').trim();
    if (!this.isValidScheduleDate(trimmed)) {
      return { text: '', emphasis: 'none' };
    }
    return { text: trimmed, emphasis };
  }

  private buildScheduleDateCells(
    context: DashboardScheduleSnapshotContext,
    row: MaintenanceListDisplay,
    timeline: ReturnType<DashboardScheduleSnapshotService['buildPropertyReservationTimeline']>,
    reservationById: Map<string, ReservationPropertyMaintenance>,
    serviceDate: string
  ) {
    const reservationId = context.utilityService.normalizeId(row.reservationId ?? '');
    const reservation = reservationId ? reservationById.get(reservationId) : undefined;
    const propertyId = context.utilityService.normalizeId(row.propertyId);
    const propertyTimeline = timeline.get(propertyId) ?? [];
    const eventDate = String(row.eventDate || '').trim();

    if (row.eventType === ServiceType.Departure) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell(reservation?.departureDateDisplay || eventDate, 'primary'),
        scheduleArrivalDate: this.buildScheduleDateCell('', 'none'),
        scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
        serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
      };
    }

    if (row.eventType === ServiceType.Arrival) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell('', 'none'),
        scheduleArrivalDate: this.buildScheduleDateCell(reservation?.arrivalDateDisplay || eventDate, 'primary'),
        scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
        serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
      };
    }

    if (row.eventType === ServiceType.MaidService) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell('', 'none'),
        scheduleArrivalDate: this.buildScheduleDateCell('', 'none'),
        scheduledCleanDate: this.buildScheduleDateCell(eventDate, 'primary'),
        serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
      };
    }

    return {
      scheduleDepartureDate: this.buildScheduleDateCell('', 'none'),
      scheduleArrivalDate: this.buildScheduleDateCell('', 'none'),
      scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
      serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
    };
  }

  private resolveScheduleHasPets(
    context: DashboardScheduleSnapshotContext,
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
}
