import { Injectable } from '@angular/core';
import { MaintenanceListResponse, MaintenanceListStatusDropdownCell, MaintenanceListUserDropdownCell, MaintenanceRequest, MaintenanceResponse } from '../authenticated/maintenance/models/maintenance.model';
import { PropertyListDisplay, PropertyListResponse, PropertyRequest, PropertyResponse } from '../authenticated/properties/models/property.model';
import { getReservationStatus } from '../authenticated/reservations/models/reservation-enum';
import { ReservationListDisplay, ReservationListResponse, ReservationRequest, ReservationResponse } from '../authenticated/reservations/models/reservation-model';
import {
  DashboardPropertyTurnoverRow,
  MaintenanceListCurrentReservationByPropertyId,
  MaintenanceListCurrentReservationSnapshot,
  MaintenanceListDisplay,
  MaintenanceListLoadResponse,
  MaintenanceListMappingContext,
  PropertyMaintenance,
  ReservationPropertyMaintenance,
  ReservationTurnoverEventDisplay
} from '../authenticated/shared/models/mixed-models';
import { ServiceType } from '../authenticated/shared/models/mixed-enums';
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
        ...this.resolvePropertyServiceProviderFields(property),
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
        ...this.resolveReservationServiceProviderFields(reservation),
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
        ...this.resolvePropertyServiceProviderFields(property),
        maintenanceNotes: String(maintenance?.notes ?? '').trim()
      };
    });
  }
  //#endregion

  //#region Reservation Display Mapping
  mapReservationListDisplayWithProviderFields(
    reservations: ReservationListResponse[],
    mappedRows: ReservationListDisplay[]
  ): ReservationListDisplay[] {
    const reservationById = new Map<string, ReservationListResponse>();
    (reservations || []).forEach(reservation => {
      if (reservation?.reservationId) {
        reservationById.set(this.utilityService.normalizeId(reservation.reservationId), reservation);
      }
    });

    return (mappedRows || []).map(row => {
      const source = reservationById.get(this.utilityService.normalizeId(row.reservationId));
      if (!source) {
        return row;
      }
      return {
        ...row,
        aCleanerUserId: this.utilityService.normalizeIdOrNull(source.aCleanerUserId),
        aCleaningDate: source.aCleaningDate ?? null,
        aCarpetUserId: this.utilityService.normalizeIdOrNull(source.aCarpetUserId),
        aCarpetDate: source.aCarpetDate ?? null,
        aInspectorUserId: this.utilityService.normalizeIdOrNull(source.aInspectorUserId),
        aInspectingDate: source.aInspectingDate ?? null,
        dCleanerUserId: this.utilityService.normalizeIdOrNull(source.dCleanerUserId),
        dCleaningDate: source.dCleaningDate ?? null,
        dCarpetUserId: this.utilityService.normalizeIdOrNull(source.dCarpetUserId),
        dCarpetDate: source.dCarpetDate ?? null,
        dInspectorUserId: this.utilityService.normalizeIdOrNull(source.dInspectorUserId),
        dInspectingDate: source.dInspectingDate ?? null
      };
    });
  }
  //#endregion

  //#region Maintenance-List Display Mappers
  mapMaintenanceListDisplayRows(properties: PropertyListResponse[], maintenanceRows: MaintenanceListResponse[], context: MaintenanceListMappingContext
  ): MaintenanceListDisplay[] {
    const {
      housekeepingUsers,
      carpetUsers,
      inspectorUsers,
      housekeepingById,
      carpetById,
      inspectorById,
      currentReservationByPropertyId
    } = context;

    const propertyRows = this.mappingService.mapPropertyListRows(properties || []);
    const propertyProviderFieldsByPropertyId = new Map<string, ReturnType<MixedMappingService['resolvePropertyServiceProviderFields']>>();
    (properties || []).forEach(property => {
      if (property?.propertyId) {
        propertyProviderFieldsByPropertyId.set(property.propertyId, this.resolvePropertyServiceProviderFields(property));
      }
    });
    const maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
    (maintenanceRows || []).forEach(row => {
      if (row?.propertyId) {
        maintenanceByPropertyId.set(row.propertyId, row);
      }
    });

    const rows = propertyRows.map((property): MaintenanceListDisplay => {
      const maintenanceRow = maintenanceByPropertyId.get(property.propertyId);
      const reservationRow = this.getMaintenanceListCurrentReservationFields(property.propertyId, currentReservationByPropertyId);
      const providerFields = propertyProviderFieldsByPropertyId.get(property.propertyId);
      const cleanerId = this.utilityService.normalizeIdOrNull(providerFields?.onCleanerUserId ?? providerFields?.offCleanerUserId ?? null);
      const carpetId = this.utilityService.normalizeIdOrNull(providerFields?.onCarpetUserId ?? providerFields?.offCarpetUserId ?? null);
      const inspectorId = this.utilityService.normalizeIdOrNull(providerFields?.onInspectorUserId ?? providerFields?.offInspectorUserId ?? null);
      const cleaningDateDisplay = this.formatter.formatDateString(providerFields?.onCleaningDate ?? providerFields?.offCleaningDate ?? undefined);
      const carpetDateDisplay = this.formatter.formatDateString(providerFields?.onCarpetDate ?? providerFields?.offCarpetDate ?? undefined);
      const inspectingDateDisplay = this.formatter.formatDateString(providerFields?.onInspectingDate ?? providerFields?.offInspectingDate ?? undefined);

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
        cleaningDate: cleaningDateDisplay,
        carpetDate: carpetDateDisplay,
        inspector: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(inspectorId ?? '', property.officeId, inspectorUsers, inspectorById, ''),
          this.getMaintenanceUserOptionsForOffice(inspectorUsers, property.officeId, 'Clear Selection')
        ),
        inspectingDate: inspectingDateDisplay,
        ...this.mappingService.buildPropertyRowBedDropdownCells(property, maintenanceRow),
        eventDate: reservationRow.eventDate,
        eventDateSortTime: reservationRow.eventDateSortTime,
        hasPets: reservationRow.hasPets,
        needsMaintenance: false,
        needsMaintenanceState: 'green'
      };
    });

    return rows;
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

    const providerAssignment = this.getProviderAssignmentForTurnoverRow(mixedRow);
    const cleanerId = providerAssignment.cleanerUserId;
    const carpetId = providerAssignment.carpetUserId;
    const inspectorId = providerAssignment.inspectorUserId;
    const reservationMaidUserId =
      'maidUserId' in mixedRow
        ? this.utilityService.normalizeIdOrNull((mixedRow as ReservationPropertyMaintenance).maidUserId)
        : null;

    const reservationSnapshot = context.currentReservationByPropertyId.get(propertyRow.propertyId);
    return {
      ...propertyRow,
      maintenanceId: maintenanceRecord?.maintenanceId,
      reservationId: 'reservationId' in mixedRow
        ? this.utilityService.normalizeIdOrNull((mixedRow as ReservationPropertyMaintenance).reservationId)
        : this.utilityService.normalizeIdOrNull(reservationSnapshot?.reservationId ?? null),
      eventType: mixedRow.eventType ?? null,
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
      cleaningDate: providerAssignment.cleaningDateDisplay,
      carpetDate: providerAssignment.carpetDateDisplay,
      inspector: this.buildMaintenanceUserDropdownCell(
        this.resolveMaintenanceUserName(inspectorId ?? '', propertyRow.officeId, inspectorUsers, inspectorById, ''),
        this.getMaintenanceUserOptionsForOffice(inspectorUsers, propertyRow.officeId, 'Clear Selection')
      ),
      inspectingDate: providerAssignment.inspectingDateDisplay,
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
    type Agg = {
      reservationId: string;
      departureTime: number;
      arrivalTime: number;
      eventDate: string;
      hasPets: boolean;
      rank: 0 | 1 | 2;
    };
    const byProperty = new Map<string, Agg>();
    const todayOrdinal = this.utilityService.parseCalendarDateToOrdinal(this.utilityService.todayAsCalendarDateString());
    if (todayOrdinal === null) {
      return new Map();
    }

    for (const reservation of reservations) {
      const arrivalOrdinal = this.utilityService.parseCalendarDateToOrdinal(reservation.arrivalDate);
      const departureOrdinal = this.utilityService.parseCalendarDateToOrdinal(reservation.departureDate);
      if (
        arrivalOrdinal === null ||
        departureOrdinal === null
      ) {
        continue;
      }

      const propertyId = reservation.propertyId;
      const reservationId = (reservation.reservationId ?? '').trim();
      if (!propertyId || !reservationId) {
        continue;
      }
      const rank: 0 | 1 | 2 =
        todayOrdinal >= arrivalOrdinal && todayOrdinal <= departureOrdinal
          ? 0
          : arrivalOrdinal > todayOrdinal
            ? 1
            : 2;

      const eventDateDisplay = this.formatter.formatDateString(reservation.departureDate) || '';
      const hasPets = reservation.hasPets === true;
      const existing = byProperty.get(propertyId);
      const shouldReplace = (() => {
        if (!existing) {
          return true;
        }
        if (rank !== existing.rank) {
          return rank < existing.rank;
        }
        if (rank === 1) {
          return arrivalOrdinal < existing.arrivalTime;
        }
        return departureOrdinal > existing.departureTime;
      })();

      if (!shouldReplace) {
        continue;
      }
      byProperty.set(propertyId, {
        reservationId,
        departureTime: departureOrdinal,
        arrivalTime: arrivalOrdinal,
        eventDate: eventDateDisplay,
        hasPets,
        rank
      });
    }

    const result: MaintenanceListCurrentReservationByPropertyId = new Map();
    byProperty.forEach((v, k) => {
      const eventDate = v.eventDate.trim() !== '' ? v.eventDate : 'N/A';
      result.set(k, {
        reservationId: v.reservationId,
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
        reservationId: null,
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
    const officeUser = users.find(user =>
      user.userId === userIdOrName
      && (user.officeAccess || []).includes(officeId)
    );
    if (officeUser) {
      return `${officeUser.firstName ?? ''} ${officeUser.lastName ?? ''}`.trim();
    }
    return userById.get(userIdOrName) ?? defaultLabel;
  }

  getMaintenanceUserOptionsForOffice(users: UserResponse[], officeId: number, defaultLabel: string): string[] {
    const names = users
      .filter(user => (user.officeAccess || []).includes(officeId))
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return [defaultLabel, ...names];
  }
  //#endregion

  //#region Dashboard-Main Display Mappers
  mapReservationPropertyMaintenanceToTurnoverDisplay(rpm: ReservationPropertyMaintenance): ReservationTurnoverEventDisplay {
    const providerAssignment = this.getProviderAssignmentForTurnoverRow(rpm);
    return {
      propertyId: this.utilityService.normalizeId(rpm.propertyId),
      propertyCode: String(rpm.propertyCode ?? '').trim(),
      officeId: rpm.officeId,
      reservationId: this.utilityService.normalizeId(rpm.reservationId),
      reservationCode: String(rpm.reservationCode ?? '').trim(),
      contactId: this.utilityService.normalizeId(rpm.contactId),
      companyName: String(rpm.companyName ?? '').trim(),
      agentCode: rpm.agentCode ?? null,
      tenantName: String(rpm.tenantName ?? '').trim(),
      contactName: String(rpm.contactName ?? '').trim(),
      officeName: String(rpm.officeName ?? '').trim(),
      arrivalDateDisplay: String(rpm.arrivalDateDisplay ?? '').trim() || this.formatter.formatDateString(rpm.arrivalDate) || '',
      departureDateDisplay: String(rpm.departureDateDisplay ?? '').trim() || this.formatter.formatDateString(rpm.departureDate) || '',
      reservationStatusDisplay: getReservationStatus(rpm.reservationStatusId),
      paymentReceived: rpm.paymentReceived,
      welcomeLetterChecked: rpm.welcomeLetterChecked,
      welcomeLetterSent: rpm.welcomeLetterSent,
      readyForArrival: rpm.readyForArrival,
      code: rpm.code,
      departureLetterChecked: rpm.departureLetterChecked,
      departureLetterSent: rpm.departureLetterSent,
      cleanerUserId: providerAssignment.cleanerUserId,
      carpetUserId: providerAssignment.carpetUserId,
      inspectorUserId: providerAssignment.inspectorUserId,
      cleaningDateDisplay: providerAssignment.cleaningDateDisplay,
      carpetDateDisplay: providerAssignment.carpetDateDisplay,
      inspectingDateDisplay: providerAssignment.inspectingDateDisplay
    };
  }

  mapDashboardMainPropertyTurnoverRow(
    property: PropertyListResponse,
    maintenanceRow?: MaintenanceListResponse | null,
    sourceRow?: PropertyMaintenance | null
  ): DashboardPropertyTurnoverRow {
    const base = this.mappingService.mapProperties([property])[0];
    const providerSource = sourceRow ?? this.mapPropertyMaintenenace([property], maintenanceRow ? [maintenanceRow] : [])[0];
    const providerAssignment = this.getProviderAssignmentForTurnoverRow(providerSource);
    return {
      ...base,
      availableAfter: this.formatter.formatDateString(property.availableFrom ?? undefined) ?? '',
      availableUntil: this.formatter.formatDateString(property.availableUntil ?? undefined) ?? '',
      ...this.mappingService.buildPropertyRowBedDropdownCells(base, maintenanceRow, true),
      cleanerUserId: providerAssignment.cleanerUserId,
      carpetUserId: providerAssignment.carpetUserId,
      inspectorUserId: providerAssignment.inspectorUserId,
      cleaningDateDisplay: providerAssignment.cleaningDateDisplay,
      carpetDateDisplay: providerAssignment.carpetDateDisplay,
      inspectingDateDisplay: providerAssignment.inspectingDateDisplay
    };
  }
  //#endregion

  //#region Dashboard-Service Display Mappers
  mapPropertyMaintenanceToDashboardServiceScheduleRow(pm: PropertyMaintenance): ReservationPropertyMaintenance {
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
      maidUserId: pm.eventType === ServiceType.Offline
        ? this.utilityService.normalizeIdOrNull(pm.offCleanerUserId)
        : this.utilityService.normalizeIdOrNull(pm.onCleanerUserId),
      maidStartDate: null,
      maidStartDateOrdinal: null,
      maidStartDateDisplay: '',
      aCleanerUserId: null,
      aCleaningDate: null,
      aCleaningDateOrdinal: null,
      acleaningDateDisplay: '',
      aCarpetUserId: null,
      aCarpetDate: null,
      aCarpetDateOrdinal: null,
      aCarpetDateDisplay: '',
      aInspectorUserId: null,
      aInspectingDate: null,
      aInspectingDateOrdinal: null,
      aInspectingDateDisplay: '',
      dCleanerUserId: null,
      dCleaningDate: null,
      dCleaningDateOrdinal: null,
      dCleaningDateDisplay: '',
      dCarpetUserId: null,
      dCarpetDate: null,
      dCarpetDateOrdinal: null,
      dCarpetDateDisplay: '',
      dInspectorUserId: null,
      dInspectingDate: null,
      dInspectingDateOrdinal: null,
      dInspectingDateDisplay: '',
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

  mapReservationPropertyMaintenanceDashboardServiceScheduleRow(row: ReservationPropertyMaintenance): ReservationPropertyMaintenance {
    const eventDisp = this.formatter.formatDateString(row.eventDate ?? undefined) || '';
    const providerAssignment = this.getProviderAssignmentForTurnoverRow(row);
    const mappedRow = {
      ...row,
      departureDateDisplay: eventDisp
    };
    const mappedRecord = mappedRow as unknown as Record<string, unknown>;
    mappedRecord['cleanerUserId'] = providerAssignment.cleanerUserId;
    mappedRecord['carpetUserId'] = providerAssignment.carpetUserId;
    mappedRecord['inspectorUserId'] = providerAssignment.inspectorUserId;
    mappedRecord['cleaningDateDisplay'] = providerAssignment.cleaningDateDisplay;
    mappedRecord['carpetDateDisplay'] = providerAssignment.carpetDateDisplay;
    mappedRecord['inspectingDateDisplay'] = providerAssignment.inspectingDateDisplay;
    return mappedRow;
  }
  //#endregion

  //#region Service Provider Helpers
  private resolvePropertyServiceProviderFields(
    property: Pick<
      PropertyListResponse,
      | 'onCleanerUserId' | 'onCleaningDate' | 'onCarpetUserId' | 'onCarpetDate' | 'onInspectorUserId'
      | 'onInspectingDate' | 'offCleanerUserId' | 'offCleaningDate' | 'offCarpetUserId' | 'offCarpetDate'
      | 'offInspectorUserId' | 'offInspectingDate'
    >
  ): Pick<
    PropertyMaintenance,
    | 'onCleanerUserId' | 'onCleaningDate' | 'onCleaningDateOrdinal' | 'onCleaningDateDisplay' | 'onCarpetUserId'
    | 'onCarpetDate' | 'onCarpetDateOrdinal' | 'onCarpetDateDisplay' | 'onInspectorUserId' | 'onInspectingDate'
    | 'onInspectingDateOrdinal' | 'onInspectingDateDisplay' | 'offCleanerUserId' | 'offCleaningDate' | 'offCleaningDateOrdinal'
    | 'offCleaningDateDisplay' | 'offCarpetUserId' | 'offCarpetDate' | 'offCarpetDateOrdinal' | 'offCarpetDateDisplay'
    | 'offInspectorUserId' | 'offInspectingDate' | 'offInspectingDateOrdinal' | 'offInspectingDateDisplay'
  > {
    const onCleaningDate = property.onCleaningDate ?? null;
    const onCarpetDate = property.onCarpetDate ?? null;
    const onInspectingDate = property.onInspectingDate ?? null;
    const offCleaningDate = property.offCleaningDate ?? null;
    const offCarpetDate = property.offCarpetDate ?? null;
    const offInspectingDate = property.offInspectingDate ?? null;

    return {
      onCleanerUserId: this.utilityService.normalizeIdOrNull(property.onCleanerUserId),
      onCleaningDate,
      onCleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(onCleaningDate),
      onCleaningDateDisplay: this.formatter.formatDateString(onCleaningDate ?? undefined) || '',
      onCarpetUserId: this.utilityService.normalizeIdOrNull(property.onCarpetUserId),
      onCarpetDate,
      onCarpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(onCarpetDate),
      onCarpetDateDisplay: this.formatter.formatDateString(onCarpetDate ?? undefined) || '',
      onInspectorUserId: this.utilityService.normalizeIdOrNull(property.onInspectorUserId),
      onInspectingDate,
      onInspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(onInspectingDate),
      onInspectingDateDisplay: this.formatter.formatDateString(onInspectingDate ?? undefined) || '',
      offCleanerUserId: this.utilityService.normalizeIdOrNull(property.offCleanerUserId),
      offCleaningDate,
      offCleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(offCleaningDate),
      offCleaningDateDisplay: this.formatter.formatDateString(offCleaningDate ?? undefined) || '',
      offCarpetUserId: this.utilityService.normalizeIdOrNull(property.offCarpetUserId),
      offCarpetDate,
      offCarpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(offCarpetDate),
      offCarpetDateDisplay: this.formatter.formatDateString(offCarpetDate ?? undefined) || '',
      offInspectorUserId: this.utilityService.normalizeIdOrNull(property.offInspectorUserId),
      offInspectingDate,
      offInspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(offInspectingDate),
      offInspectingDateDisplay: this.formatter.formatDateString(offInspectingDate ?? undefined) || ''
    };
  }

  private resolveReservationServiceProviderFields(
    reservation: Pick<
      ReservationListDisplay,
      | 'aCleanerUserId' | 'aCleaningDate' | 'aCarpetUserId' | 'aCarpetDate' | 'aInspectorUserId'
      | 'aInspectingDate' | 'dCleanerUserId' | 'dCleaningDate' | 'dCarpetUserId' | 'dCarpetDate'
      | 'dInspectorUserId' | 'dInspectingDate'
    >
  ): Pick<
    ReservationPropertyMaintenance,
    | 'aCleanerUserId' | 'aCleaningDate' | 'aCleaningDateOrdinal' | 'acleaningDateDisplay' | 'aCarpetUserId'
    | 'aCarpetDate' | 'aCarpetDateOrdinal' | 'aCarpetDateDisplay' | 'aInspectorUserId' | 'aInspectingDate'
    | 'aInspectingDateOrdinal' | 'aInspectingDateDisplay' | 'dCleanerUserId' | 'dCleaningDate' | 'dCleaningDateOrdinal'
    | 'dCleaningDateDisplay' | 'dCarpetUserId' | 'dCarpetDate' | 'dCarpetDateOrdinal' | 'dCarpetDateDisplay'
    | 'dInspectorUserId' | 'dInspectingDate' | 'dInspectingDateOrdinal' | 'dInspectingDateDisplay'
  > {
    const aCleaningDate = reservation.aCleaningDate ?? null;
    const aCarpetDate = reservation.aCarpetDate ?? null;
    const aInspectingDate = reservation.aInspectingDate ?? null;
    const dCleaningDate = reservation.dCleaningDate ?? null;
    const dCarpetDate = reservation.dCarpetDate ?? null;
    const dInspectingDate = reservation.dInspectingDate ?? null;

    return {
      aCleanerUserId: this.utilityService.normalizeIdOrNull(reservation.aCleanerUserId),
      aCleaningDate,
      aCleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(aCleaningDate),
      acleaningDateDisplay: this.formatter.formatDateString(aCleaningDate ?? undefined) || '',
      aCarpetUserId: this.utilityService.normalizeIdOrNull(reservation.aCarpetUserId),
      aCarpetDate,
      aCarpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(aCarpetDate),
      aCarpetDateDisplay: this.formatter.formatDateString(aCarpetDate ?? undefined) || '',
      aInspectorUserId: this.utilityService.normalizeIdOrNull(reservation.aInspectorUserId),
      aInspectingDate,
      aInspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(aInspectingDate),
      aInspectingDateDisplay: this.formatter.formatDateString(aInspectingDate ?? undefined) || '',
      dCleanerUserId: this.utilityService.normalizeIdOrNull(reservation.dCleanerUserId),
      dCleaningDate,
      dCleaningDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(dCleaningDate),
      dCleaningDateDisplay: this.formatter.formatDateString(dCleaningDate ?? undefined) || '',
      dCarpetUserId: this.utilityService.normalizeIdOrNull(reservation.dCarpetUserId),
      dCarpetDate,
      dCarpetDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(dCarpetDate),
      dCarpetDateDisplay: this.formatter.formatDateString(dCarpetDate ?? undefined) || '',
      dInspectorUserId: this.utilityService.normalizeIdOrNull(reservation.dInspectorUserId),
      dInspectingDate,
      dInspectingDateOrdinal: this.utilityService.parseCalendarDateToOrdinal(dInspectingDate),
      dInspectingDateDisplay: this.formatter.formatDateString(dInspectingDate ?? undefined) || ''
    };
  }

  private getProviderAssignmentForTurnoverRow(mixedRow: PropertyMaintenance): {
    cleanerUserId: string | null;
    carpetUserId: string | null;
    inspectorUserId: string | null;
    cleaningDateDisplay: string;
    carpetDateDisplay: string;
    inspectingDateDisplay: string;
  } {
    if (mixedRow.eventType === ServiceType.Offline) {
      return {
        cleanerUserId: mixedRow.offCleanerUserId ?? null,
        carpetUserId: mixedRow.offCarpetUserId ?? null,
        inspectorUserId: mixedRow.offInspectorUserId ?? null,
        cleaningDateDisplay: mixedRow.offCleaningDateDisplay,
        carpetDateDisplay: mixedRow.offCarpetDateDisplay,
        inspectingDateDisplay: mixedRow.offInspectingDateDisplay
      };
    }
    if (mixedRow.eventType === ServiceType.Arrival && 'aCleanerUserId' in mixedRow) {
      const row = mixedRow as ReservationPropertyMaintenance;
      return {
        cleanerUserId: row.aCleanerUserId ?? null,
        carpetUserId: row.aCarpetUserId ?? null,
        inspectorUserId: row.aInspectorUserId ?? null,
        cleaningDateDisplay: row.acleaningDateDisplay,
        carpetDateDisplay: row.aCarpetDateDisplay,
        inspectingDateDisplay: row.aInspectingDateDisplay
      };
    }
    if (mixedRow.eventType === ServiceType.Departure && 'dCleanerUserId' in mixedRow) {
      const row = mixedRow as ReservationPropertyMaintenance;
      return {
        cleanerUserId: row.dCleanerUserId ?? null,
        carpetUserId: row.dCarpetUserId ?? null,
        inspectorUserId: row.dInspectorUserId ?? null,
        cleaningDateDisplay: row.dCleaningDateDisplay,
        carpetDateDisplay: row.dCarpetDateDisplay,
        inspectingDateDisplay: row.dInspectingDateDisplay
      };
    }
    if (mixedRow.eventType === ServiceType.MaidService && 'maidUserId' in mixedRow) {
      const row = mixedRow as ReservationPropertyMaintenance;
      return {
        cleanerUserId: this.utilityService.normalizeIdOrNull(row.maidUserId),
        carpetUserId: null,
        inspectorUserId: null,
        cleaningDateDisplay: this.formatter.formatDateString(row.eventDate ?? row.maidStartDate ?? undefined) || '',
        carpetDateDisplay: '',
        inspectingDateDisplay: ''
      };
    }
    return {
      cleanerUserId: mixedRow.onCleanerUserId ?? null,
      carpetUserId: mixedRow.onCarpetUserId ?? null,
      inspectorUserId: mixedRow.onInspectorUserId ?? null,
      cleaningDateDisplay: mixedRow.onCleaningDateDisplay,
      carpetDateDisplay: mixedRow.onCarpetDateDisplay,
      inspectingDateDisplay: mixedRow.onInspectingDateDisplay
    };
  }
  //#endregion

  //#region Response-To-Request Mappers
  mapPropertyResponseToRequest(property: PropertyResponse, overrides?: Partial<PropertyRequest>): PropertyRequest {
    const { parkingNotes, ...requestBase } = property;
    const base = {
      ...requestBase,
      parkingnotes: parkingNotes ?? null
    } as PropertyRequest;
    return { ...base, ...(overrides ?? {}) };
  }

  mapMaintenanceResponseToRequest(maintenance: MaintenanceResponse, overrides?: Partial<MaintenanceRequest>): MaintenanceRequest {
    const { propertyCode: _propertyCode, ...requestBase } = maintenance;
    void _propertyCode;
    const base = {
      ...requestBase,
      notes: maintenance.notes ?? null
    } as MaintenanceRequest;
    return { ...base, ...(overrides ?? {}) };
  }

  mapReservationResponseToRequest(
    reservation: ReservationResponse,
    overrides?: Partial<ReservationRequest>
  ): ReservationRequest {
    const contactIds = (reservation.contactIds || []).filter(id => String(id || '').trim().length > 0);
    const {
      officeName: _officeName,
      contactName: _contactName,
      isDeleted: _isDeleted,
      createdOn: _createdOn,
      createdBy: _createdBy,
      modifiedOn: _modifiedOn,
      modifiedBy: _modifiedBy,
      extraFeeLines,
      ...requestBase
    } = reservation;
    void _officeName;
    void _contactName;
    void _isDeleted;
    void _createdOn;
    void _createdBy;
    void _modifiedOn;
    void _modifiedBy;
    const base: ReservationRequest = {
      ...requestBase,
      organizationId: reservation.organizationId || '',
      agentId: reservation.agentId ?? null,
      reservationCode: reservation.reservationCode ?? null,
      reservationNoticeId: reservation.reservationNoticeId ?? 0,
      contactIds,
      companyId: reservation.companyId ?? null,
      companyName: reservation.companyName ?? null,
      tenantName: reservation.tenantName || '',
      referenceNo: reservation.referenceNo || '',
      lockBoxCode: reservation.lockBoxCode ?? null,
      unitTenantCode: reservation.unitTenantCode ?? null,
      depositTypeId: reservation.depositTypeId ?? 0,
      petDescription: reservation.petDescription ?? null,
      maidUserId: reservation.maidUserId ?? null,
      extraFeeLines: this.mappingService.mapExtraFeeLinesResponseToRequest(extraFeeLines),
      notes: reservation.notes ?? null,
      aCleanerUserId: reservation.aCleanerUserId ?? null,
      aCleaningDate: reservation.aCleaningDate ?? null,
      aCarpetUserId: reservation.aCarpetUserId ?? null,
      aCarpetDate: reservation.aCarpetDate ?? null,
      aInspectorUserId: reservation.aInspectorUserId ?? null,
      aInspectingDate: reservation.aInspectingDate ?? null,
      dCleanerUserId: reservation.dCleanerUserId ?? null,
      dCleaningDate: reservation.dCleaningDate ?? null,
      dCarpetUserId: reservation.dCarpetUserId ?? null,
      dCarpetDate: reservation.dCarpetDate ?? null,
      dInspectorUserId: reservation.dInspectorUserId ?? null,
      dInspectingDate: reservation.dInspectingDate ?? null
    };
    return { ...base, ...overrides };
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
