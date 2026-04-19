import { Injectable } from '@angular/core';
import { MaintenanceListResponse, MaintenanceListStatusDropdownCell, MaintenanceListUserDropdownCell } from '../authenticated/maintenance/models/maintenance.model';
import { PropertyListDisplay, PropertyListResponse } from '../authenticated/properties/models/property.model';
import { ReservationListDisplay, ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import {
  DashboardPropertyTurnoverRow,
  MaintenanceListCurrentReservationByPropertyId,
  MaintenanceListCurrentReservationSnapshot,
  MaintenanceListDisplay,
  MaintenanceListLoadResponse,
  MaintenanceListMappingContext,
  PropertyMaintenance,
  ReservationPropertyMaintenance
} from '../authenticated/shared/models/mixed-models';
import { UserResponse } from '../authenticated/users/models/user.model';
import { FormatterService } from './formatter-service';
import { MappingService } from './mapping.service';
import { type CalendarDateString, UtilityService } from './utility.service';

@Injectable({
  providedIn: 'root'
})
export class MixedMappingService {
  static readonly maintenanceListNoDepartureSortTime = Number.MAX_SAFE_INTEGER;

  constructor(
    private formatter: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {}

  //#region PropertyMaintenance
  mapPropertyMaintenenace(properties: PropertyListResponse[], maintenanceList: MaintenanceListResponse[]): PropertyMaintenance[] {

    // Store maintenence records by propertyId
    const maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
    for (const row of maintenanceList) {
      maintenanceByPropertyId.set(row.propertyId, row);
    }

    // Create corresponding PropertyMaintenence records
    return properties.map((property): PropertyMaintenance => {
      const maintenance = maintenanceByPropertyId.get(property.propertyId);
      const bedCells = this.mappingService.buildPropertyRowBedDropdownCells(property, maintenance, true);
      return {
        propertyId: property.propertyId,
        propertyCode: property.propertyCode,
        shortAddress: property.shortAddress ?? '',
        officeId: property.officeId,
        officeName: property.officeName ?? '',
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        accomodates: property.accomodates,
        squareFeet: property.squareFeet,
        propertyStatusId: property.propertyStatusId,
        availableFrom: property.availableFrom ?? null,
        availableFromOrdinal: this.utilityService.parseCalendarDateToOrdinal(property.availableFrom ?? null),
        availableFromDisplay: this.formatter.formatDateString(property.availableFrom ?? undefined) ?? '',
        availableUntil: property.availableUntil ?? null,
        availableUntilOrdinal: this.utilityService.parseCalendarDateToOrdinal(property.availableUntil ?? null),
        availableUntilDisplay: this.formatter.formatDateString(property.availableUntil ?? undefined) ?? '',
        bedroomId1: property.bedroomId1,
        bedroomId2: property.bedroomId2,
        bedroomId3: property.bedroomId3,
        bedroomId4: property.bedroomId4,
        bed1Text: bedCells.bed1Text,
        bed2Text: bedCells.bed2Text,
        bed3Text: bedCells.bed3Text,
        bed4Text: bedCells.bed4Text,
        cleanerUserId: this.utilityService.normalizeIdOrNull(maintenance?.cleanerUserId),
        cleaningDate: maintenance?.cleaningDate ?? null,
        cleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.cleaningDate ?? null),
        cleaningDateDisplay: this.formatter.formatDateString(maintenance?.cleaningDate ?? undefined) || '',
        carpetUserId: this.utilityService.normalizeIdOrNull(maintenance?.carpetUserId),
        carpetDate: maintenance?.carpetDate ?? null,
        carpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.carpetDate ?? null),
        carpetDateDisplay: this.formatter.formatDateString(maintenance?.carpetDate ?? undefined) || '',
        inspectorUserId: this.utilityService.normalizeIdOrNull(maintenance?.inspectorUserId),
        inspectingDate: maintenance?.inspectingDate ?? null,
        inspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.inspectingDate ?? null),
        inspectingDateDisplay: this.formatter.formatDateString(maintenance?.inspectingDate ?? undefined) || '',
        maintenanceNotes: String(maintenance?.notes ?? '').trim()
      };
    });
  }

  mapReservationPropertyMaintenance(reservations: ReservationListDisplay[], properties: PropertyListResponse[], maintenanceList: MaintenanceListResponse[]): ReservationPropertyMaintenance[] {

    // Store extension classes by propertyId
    const propertyById = new Map<string, PropertyListResponse>();
    for (const property of properties) {
      propertyById.set(property.propertyId, property);
    }

    const maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
    for (const row of maintenanceList) {
      maintenanceByPropertyId.set(row.propertyId, row);
    }

    return reservations.filter(reservation => {
      const rawPid = reservation.propertyId;
      if (rawPid == null || String(rawPid).trim() === '') {
        return false;
      }
      return propertyById.has(reservation.propertyId);
    }).map((reservation): ReservationPropertyMaintenance => {
      const property = propertyById.get(reservation.propertyId)!;
      const maintenance = maintenanceByPropertyId.get(reservation.propertyId);
      const bedCells = this.mappingService.buildPropertyRowBedDropdownCells(property, maintenance, true);
      return {
        reservationId: reservation.reservationId,
        reservationCode: reservation.reservationCode,
        propertyId: reservation.propertyId,
        propertyCode: reservation.propertyCode,
        officeId: reservation.officeId,
        officeName: reservation.officeName ?? '',
        contactId: reservation.contactId,
        contactName: reservation.contactName ?? '',
        companyId: reservation.companyId ?? null,
        companyName: reservation.companyName ?? null,
        tenantName: reservation.tenantName ?? '',
        agentCode: reservation.agentCode ?? null,
        reservationStatusId: reservation.reservationStatusId,
        arrivalDate: reservation.arrivalDate,
        arrivalDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(reservation.arrivalDate),
        arrivalDateDisplay: this.formatter.formatDateString(reservation.arrivalDate) || '',
        departureDate: reservation.departureDate,
        departureDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(reservation.departureDate),
        departureDateDisplay: this.formatter.formatDateString(reservation.departureDate) || '',
        hasPets: reservation.hasPets === true,
        maidUserId: this.utilityService.normalizeIdOrNull(reservation.maidUserId ),
        maidStartDate: reservation.maidStartDate ?? null,
        maidStartDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(reservation.maidStartDate ?? null),
        maidStartDateDisplay: this.formatter.formatDateString(reservation.maidStartDate ?? undefined) || '',
        frequencyId: reservation.frequencyId ?? 0,
        maidServiceFee: (reservation as Partial<{ maidServiceFee: number }>).maidServiceFee ?? 0,
        paymentReceived: this.mappingService.toBooleanValue(reservation.paymentReceived),
        welcomeLetterChecked: this.mappingService.toBooleanValue(reservation.welcomeLetterChecked),
        welcomeLetterSent: this.mappingService.toBooleanValue(reservation.welcomeLetterSent),
        readyForArrival: this.mappingService.toBooleanValue(reservation.readyForArrival),
        code: this.mappingService.toBooleanValue(reservation.code),
        departureLetterChecked: this.mappingService.toBooleanValue(reservation.departureLetterChecked),
        departureLetterSent: this.mappingService.toBooleanValue(reservation.departureLetterSent),
        shortAddress: property.shortAddress ?? '',
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        accomodates: property.accomodates,
        squareFeet: property.squareFeet,
        propertyStatusId: property.propertyStatusId,
        availableFrom: property.availableFrom ?? null,
        availableFromOrdinal: this.utilityService.parseCalendarDateToOrdinal(property.availableFrom ?? null),
        availableFromDisplay: this.formatter.formatDateString(property.availableFrom ?? undefined) ?? '',
        availableUntil: property.availableUntil ?? null,
        availableUntilOrdinal: this.utilityService.parseCalendarDateToOrdinal(property.availableUntil ?? null),
        availableUntilDisplay: this.formatter.formatDateString(property.availableUntil ?? undefined) ?? '',
        bedroomId1: property.bedroomId1,
        bedroomId2: property.bedroomId2,
        bedroomId3: property.bedroomId3,
        bedroomId4: property.bedroomId4,
        bed1Text: bedCells.bed1Text,
        bed2Text: bedCells.bed2Text,
        bed3Text: bedCells.bed3Text,
        bed4Text: bedCells.bed4Text,
        cleanerUserId: this.utilityService.normalizeId(maintenance?.cleanerUserId) || null,
        cleaningDate: maintenance?.cleaningDate ?? null,
        cleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.cleaningDate ?? null),
        cleaningDateDisplay: this.formatter.formatDateString(maintenance?.cleaningDate ?? undefined) || '',
        carpetUserId: this.utilityService.normalizeId(maintenance?.carpetUserId) || null,
        carpetDate: maintenance?.carpetDate ?? null,
        carpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.carpetDate ?? null),
        carpetDateDisplay: this.formatter.formatDateString(maintenance?.carpetDate ?? undefined) || '',
        inspectorUserId: this.utilityService.normalizeId(maintenance?.inspectorUserId) || null,
        inspectingDate: maintenance?.inspectingDate ?? null,
        inspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(maintenance?.inspectingDate ?? null),
        inspectingDateDisplay: this.formatter.formatDateString(maintenance?.inspectingDate ?? undefined) || '',
        maintenanceNotes: String(maintenance?.notes ?? '').trim()
      };
    });
  }
  //#endregion

  //#region MaintenanceList
  mapMaintenanceListDisplayRows(properties: PropertyListResponse[], maintenanceRows: MaintenanceListResponse[], context: MaintenanceListMappingContext
  ): MaintenanceListDisplay[] {
    const {
      housekeepingUsers,
      carpetUsers,
      inspectorUsers,
      housekeepingById,
      carpetById,
      inspectorById,
      isVendorView,
      vendorRestrictedPropertyIds,
      currentReservationByPropertyId
    } = context;

    const propertyRows = this.mappingService.mapPropertyListRows(properties || []);
    const maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
    (maintenanceRows || []).forEach(row => {
      if (row?.propertyId) {
        maintenanceByPropertyId.set(row.propertyId, row);
      }
    });

    const rows = propertyRows.map((property): MaintenanceListDisplay => {
      const maintenanceRow = maintenanceByPropertyId.get(property.propertyId);
      const reservationRow = this.getMaintenanceListCurrentReservationFields(property.propertyId, currentReservationByPropertyId);
      const cleanerId = maintenanceRow?.cleanerUserId ?? null;
      const carpetId = maintenanceRow?.carpetUserId ?? null;
      const inspectorId = maintenanceRow?.inspectorUserId ?? null;

      return {
        ...property,
        maintenanceId: maintenanceRow?.maintenanceId,
        propertyAddress: property.shortAddress ?? '',
        cleanerUserId: cleanerId,
        carpetUserId: carpetId,
        inspectorUserId: inspectorId,
        propertyStatusDropdown: this.buildMaintenanceStatusDropdownCell(property.propertyStatusText),
        cleaner: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(cleanerId ?? '', property.officeId, housekeepingUsers, housekeepingById, ''),
          this.getMaintenanceUserOptionsForOffice(housekeepingUsers, property.officeId, 'Clear Selection')
        ),
        carpet: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(carpetId ?? '', property.officeId, carpetUsers, carpetById, ''),
          this.getMaintenanceUserOptionsForOffice(carpetUsers, property.officeId, 'Clear Selection')
        ),
        cleaningDate: this.formatter.formatDateString(maintenanceRow?.cleaningDate ?? undefined),
        carpetDate: this.formatter.formatDateString(maintenanceRow?.carpetDate ?? undefined),
        inspector: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(inspectorId ?? '', property.officeId, inspectorUsers, inspectorById, ''),
          this.getMaintenanceUserOptionsForOffice(inspectorUsers, property.officeId, 'Clear Selection')
        ),
        inspectingDate: this.formatter.formatDateString(maintenanceRow?.inspectingDate ?? undefined),
        ...this.mappingService.buildPropertyRowBedDropdownCells(property, maintenanceRow),
        eventDate: reservationRow.eventDate,
        eventDateSortTime: reservationRow.eventDateSortTime,
        hasPets: reservationRow.hasPets,
        needsMaintenance: false,
        needsMaintenanceState: 'green'
      };
    });

    return isVendorView && vendorRestrictedPropertyIds.size > 0
      ? rows.filter(property => vendorRestrictedPropertyIds.has(property.propertyId))
      : rows;
  }

  mapMaintenanceListRowsFromCurrentReservationData(
    rows: MaintenanceListDisplay[],
    currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId
  ): MaintenanceListDisplay[] {
    return (rows || []).map(row => ({
      ...row,
      ...this.getMaintenanceListCurrentReservationFields(row.propertyId, currentReservationByPropertyId)
    }));
  }

  mapMaintenanceListDisplayRowsFromLoadResponse(
    loadResponse: MaintenanceListLoadResponse,
    context: MaintenanceListMappingContext
  ): MaintenanceListDisplay[] {
    return this.mapMaintenanceListDisplayRows(
      loadResponse.properties || [],
      loadResponse.maintenanceList || [],
      context
    );
  }

  mapMaintenanceListDisplayFromMixedTurnoverRow(params: {
    mixedRow: PropertyMaintenance;
    propertyRow: PropertyListDisplay & { propertyStatusText: string; propertyStatusDropdown: { value: string; isOverridable: boolean; toString: () => string } };
    maintenanceRecord: MaintenanceListResponse | null | undefined;
    context: MaintenanceListMappingContext;
    eventDateDisplay: string;
    eventDateSortTime: number;
    hasPets: boolean;
  }): MaintenanceListDisplay {
    const { mixedRow, propertyRow, maintenanceRecord, context, eventDateDisplay, eventDateSortTime, hasPets } = params;
    const {
      housekeepingUsers,
      carpetUsers,
      inspectorUsers,
      housekeepingById,
      carpetById,
      inspectorById
    } = context;

    const cleanerId = mixedRow.cleanerUserId ?? null;
    const carpetId = mixedRow.carpetUserId ?? null;
    const inspectorId = mixedRow.inspectorUserId ?? null;
    const reservationMaidUserId =
      'maidUserId' in mixedRow
        ? this.utilityService.normalizeIdOrNull((mixedRow as ReservationPropertyMaintenance).maidUserId)
        : null;

    return {
      ...propertyRow,
      maintenanceId: maintenanceRecord?.maintenanceId,
      propertyAddress: propertyRow.shortAddress ?? '',
      cleanerUserId: cleanerId,
      maidUserId: reservationMaidUserId,
      carpetUserId: carpetId,
      inspectorUserId: inspectorId,
      propertyStatusDropdown: this.buildMaintenanceStatusDropdownCell(propertyRow.propertyStatusText),
      cleaner: this.buildMaintenanceUserDropdownCell(
        this.resolveMaintenanceUserName(cleanerId ?? '', propertyRow.officeId, housekeepingUsers, housekeepingById, ''),
        this.getMaintenanceUserOptionsForOffice(housekeepingUsers, propertyRow.officeId, 'Clear Selection')
      ),
      carpet: this.buildMaintenanceUserDropdownCell(
        this.resolveMaintenanceUserName(carpetId ?? '', propertyRow.officeId, carpetUsers, carpetById, ''),
        this.getMaintenanceUserOptionsForOffice(carpetUsers, propertyRow.officeId, 'Clear Selection')
      ),
      cleaningDate: mixedRow.cleaningDateDisplay,
      carpetDate: mixedRow.carpetDateDisplay,
      inspector: this.buildMaintenanceUserDropdownCell(
        this.resolveMaintenanceUserName(inspectorId ?? '', propertyRow.officeId, inspectorUsers, inspectorById, ''),
        this.getMaintenanceUserOptionsForOffice(inspectorUsers, propertyRow.officeId, 'Clear Selection')
      ),
      inspectingDate: mixedRow.inspectingDateDisplay,
      bed1Text: mixedRow.bed1Text,
      bed2Text: mixedRow.bed2Text,
      bed3Text: mixedRow.bed3Text,
      bed4Text: mixedRow.bed4Text,
      eventDate: eventDateDisplay.trim() === '' ? 'N/A' : eventDateDisplay,
      eventDateSortTime,
      hasPets,
      needsMaintenance: false,
      needsMaintenanceState: 'green'
    };
  }

  getReservationData(reservations: ReservationListResponse[]): MaintenanceListCurrentReservationByPropertyId {
    type Agg = { departureTime: number; eventDate: string; hasPets: boolean };
    const byProperty = new Map<string, Agg>();
    const todayOrdinal = this.utilityService.parseCalendarDateToOrdinal(this.utilityService.todayAsCalendarDateString());

    for (const reservation of reservations) {
      const arrivalOrdinal = this.utilityService.parseCalendarDateToOrdinal(reservation.arrivalDate);
      const departureOrdinal = this.utilityService.parseCalendarDateToOrdinal(reservation.departureDate);
      if (
        todayOrdinal === null ||
        arrivalOrdinal === null ||
        departureOrdinal === null ||
        todayOrdinal < arrivalOrdinal ||
        todayOrdinal > departureOrdinal
      ) {
        continue;
      }

      const propertyId = reservation.propertyId;

      const departureTime = departureOrdinal;
      const eventDateDisplay = this.formatter.formatDateString(reservation.departureDate) || '';
      const hasPets = reservation.hasPets === true;
      const existing = byProperty.get(propertyId);

      if (!existing || departureTime > existing.departureTime) {
        byProperty.set(propertyId, {
          departureTime,
          eventDate: eventDateDisplay,
          hasPets: (existing?.hasPets ?? false) || hasPets
        });
      } else {
        byProperty.set(propertyId, {
          ...existing,
          hasPets: existing.hasPets || hasPets
        });
      }
    }

    const result: MaintenanceListCurrentReservationByPropertyId = new Map();
    byProperty.forEach((v, k) => {
      const eventDate = v.eventDate.trim() !== '' ? v.eventDate : 'N/A';
      result.set(k, {
        eventDate,
        hasPets: v.hasPets,
        eventDateSortTime: v.departureTime
      });
    });

    return result;
  }

  getMaintenanceListCurrentReservationFields(
    propertyId: string,
    currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId
  ): MaintenanceListCurrentReservationSnapshot {
    return (
      currentReservationByPropertyId.get(propertyId) ?? {
        hasPets: false,
        eventDate: 'N/A',
        eventDateSortTime: MixedMappingService.maintenanceListNoDepartureSortTime
      }
    );
  }

  buildMaintenanceStatusDropdownCell(label: string): MaintenanceListStatusDropdownCell {
    return {
      value: label,
      isOverridable: true,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  buildMaintenanceUserDropdownCell(label: string, options: string[]): MaintenanceListUserDropdownCell {
    return {
      value: label,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  resolveMaintenanceUserName(
    userIdOrName: string,
    officeId: number,
    users: UserResponse[],
    userById: Map<string, string>,
    defaultLabel: string
  ): string {
    if (
      !userIdOrName ||
      userIdOrName === 'Clear Selection' ||
      userIdOrName === 'Select Cleaner' ||
      userIdOrName === 'Select Carpet Cleaner' ||
      userIdOrName === 'Select Inspector'
    ) {
      return defaultLabel;
    }
    const officeUser = users.find(user => user.userId === userIdOrName && (user.officeAccess || []).includes(officeId));
    if (officeUser) {
      return `${officeUser.firstName ?? ''} ${officeUser.lastName ?? ''}`.trim();
    }
    return userById.get(userIdOrName) ?? userIdOrName;
  }

  getMaintenanceUserOptionsForOffice(users: UserResponse[], officeId: number, defaultLabel: string): string[] {
    const names = users
      .filter(user => (user.officeAccess || []).includes(officeId))
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return [defaultLabel, ...names];
  }
  //#endregion

  //#region DashboardPropertyTurnover
  mapDashboardPropertyTurnoverRow(
    property: PropertyListResponse,
    maintenanceRow?: MaintenanceListResponse | null
  ): DashboardPropertyTurnoverRow {
    const base = this.mappingService.mapProperties([property])[0];
    return {
      ...base,
      availableAfter: this.formatter.formatDateString(property.availableFrom ?? undefined) ?? '',
      availableUntil: this.formatter.formatDateString(property.availableUntil ?? undefined) ?? '',
      ...this.mappingService.buildPropertyRowBedDropdownCells(base, maintenanceRow, true)
    };
  }
  //#endregion

  //#region Service dashboard schedule
  mapPropertyMaintenanceToServiceDashboardScheduleRow(pm: PropertyMaintenance): ReservationPropertyMaintenance {
    const eventCal = (pm.eventDate ?? '') as CalendarDateString;
    const eventDisp = this.formatter.formatDateString(pm.eventDate ?? undefined) || '';
    const eventOrd = this.utilityService.parseCalendarDateToOrdinal(pm.eventDate ?? null);
    return {
      ...pm,
      reservationId: '',
      reservationCode: '',
      contactId: '',
      contactName: '',
      companyId: null,
      companyName: null,
      tenantName: '',
      agentCode: null,
      reservationStatusId: 0,
      arrivalDate: eventCal,
      arrivalDateOrdinal: eventOrd,
      arrivalDateDisplay: eventDisp,
      departureDate: eventCal,
      departureDateOrdinal: eventOrd,
      departureDateDisplay: eventDisp,
      hasPets: false,
      maidUserId: this.utilityService.normalizeIdOrNull(pm.cleanerUserId),
      maidStartDate: null,
      maidStartDateOrdinal: null,
      maidStartDateDisplay: '',
      frequencyId: 0,
      maidServiceFee: 0,
      paymentReceived: false,
      welcomeLetterChecked: false,
      welcomeLetterSent: false,
      readyForArrival: false,
      code: false,
      departureLetterChecked: false,
      departureLetterSent: false
    };
  }

  mapReservationPropertyMaintenanceServiceDashboardScheduleRow(row: ReservationPropertyMaintenance): ReservationPropertyMaintenance {
    const eventDisp = this.formatter.formatDateString(row.eventDate ?? undefined) || '';
    return {
      ...row,
      departureDateDisplay: eventDisp
    };
  }
  //#endregion

  //#region Utility Methods
  toBoolean(value: unknown): boolean {
    return this.mappingService.toBooleanValue(value);
  }

  toEventDateSortTime(value: string | null | undefined): number {
    return this.utilityService.parseCalendarDateToOrdinal(value) ?? MixedMappingService.maintenanceListNoDepartureSortTime;
  }
  //#endregion
}
