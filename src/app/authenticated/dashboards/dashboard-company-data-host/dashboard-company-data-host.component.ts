import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, concatMap, filter, finalize, firstValueFrom, from, map, of, take, takeUntil, toArray } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MaintenanceListResponse, MaintenanceListUserDropdownCell } from '../../maintenance/models/maintenance.model';
import { TrackerContextType } from '../../organizations/models/tracker-enum';
import { TrackerConfigurationDefinitionResponse, TrackerConfigurationResponse } from '../../organizations/models/tracker.model';
import { TrackerService } from '../../organizations/services/tracker.service';
import { ReservationTrackerResponse, ReservationTrackerResponseOption, ReservationTrackerResponseOptionRequest, ReservationTrackerResponseRequest } from '../../reservations/models/reservation-model';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ServiceType } from '../../shared/models/mixed-enums';
import { DashboardPropertyTurnoverRow, MaintenanceListCurrentReservationByPropertyId, MaintenanceListDisplay, MaintenanceListMappingContext, PropertyMaintenance, ReservationPropertyMaintenance, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { DashboardCompanyDataService, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-company-data-host',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCompanyDataHostComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private formatterService = inject(FormatterService);
  private trackerService = inject(TrackerService);
  private toastr = inject(ToastrService);
  private companyDataService = inject(DashboardCompanyDataService);

  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['activeReservations', 'propertyMaintenanceList', 'cleaners', 'carpetUsers', 'inspectors', 'trackerConfiguration']));

  housekeepingById = new Map<string, string>();
  carpetById = new Map<string, string>();
  inspectorById = new Map<string, string>();
  housekeepingUserOptions: string[] = ['Clear Selection'];
  carpetUserOptions: string[] = ['Clear Selection'];
  inspectorUserOptions: string[] = ['Clear Selection'];

  trackerConfiguration: TrackerConfigurationResponse | null = null;
  reservationTrackerResponsesByReservation = new Map<string, Map<string, ReservationTrackerResponse>>();
  reservationTrackerResponseOptionsByReservation = new Map<string, ReservationTrackerResponseOption[]>();
  arrivalColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
  departureColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();

  private reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[] = [];
  private reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[] = [];
  private reservationTurnoverArrivalColumns: ColumnSet = {};
  private reservationTurnoverDepartureColumns: ColumnSet = {};

  private readonly reservationTurnoverArrivalBaseColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    agentCode: { displayAs: 'Agent', maxWidth: '12ch' },
    tenantName: { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    contactName: { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    companyName: { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    arrivalDateDisplay: { displayAs: 'Arrival', maxWidth: '18ch', wrap: false, alignment: 'center' },
    reservationStatusDisplay: { displayAs: 'Status', maxWidth: '16ch', wrap: false }
  };

  private readonly reservationTurnoverDepartureBaseColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    agentCode: { displayAs: 'Agent', maxWidth: '12ch' },
    tenantName: { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    contactName: { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    companyName: { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    departureDateDisplay: { displayAs: 'Departure', maxWidth: '18ch', wrap: false, alignment: 'center' },
    reservationStatusDisplay: { displayAs: 'Status', maxWidth: '16ch', wrap: false }
  };

  private readonly propertyOnlineColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    availableAfter: { displayAs: 'Online', maxWidth: '15ch', alignment: 'center' },
    bedrooms: { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };

  private readonly propertyOfflineColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    availableUntil: { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    bedrooms: { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };

  //#region Dashboard-Company-Data-Host
  override ngOnInit(): void {
    this.companyDataService.reset();
    this.companyDataService.setTrackerHandlers({
      onReservationCheckboxChange: (row, sourceContext) => this.onReservationCheckboxChange(row, sourceContext),
      onReservationDropdownChange: (row, sourceContext) => this.onReservationDropdownChange(row, sourceContext),
      onReservationCheckAllTracking: (row, sourceContext) => this.onReservationCheckAllTracking(row, sourceContext),
      onReservationClearTracking: (row, sourceContext) => this.onReservationClearTracking(row, sourceContext),
      onMaintenanceDropdownChange: row => this.onMaintenanceDropdownChange(row),
      onMaintenanceInlineDateChange: row => this.handleMaintenanceInlineDateChange(row)
    });
    this.loadHousekeepingUsers();
    this.loadCarpetUsers();
    this.loadInspectorUsers();
    this.loadTrackerConfiguration();
    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeBackendData();
    });
    super.ngOnInit();
  }

  override ngOnDestroy(): void {
    this.companyDataService.reset();
    super.ngOnDestroy();
  }
  //#endregion

  //#region Data Loading Methods
  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    void userAssignedId;
    this.publishSnapshot();
    this.loadReservationTrackerResponses();
  }

  loadHousekeepingUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'cleaners'))).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
        this.housekeepingById = new Map(this.housekeepingUsers.map(user => [this.utilityService.normalizeId(user.userId), `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.housekeepingUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        this.housekeepingUserOptions = ['Clear Selection', ...names];
      },
      error: () => {
        this.housekeepingUsers = [];
        this.housekeepingById = new Map<string, string>();
        this.housekeepingUserOptions = ['Clear Selection'];
      }
    });
  }

  loadCarpetUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Vendor]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'carpetUsers'))).subscribe({
      next: (users: UserResponse[]) => {
        this.carpetUsers = users || [];
        this.carpetById = new Map(this.carpetUsers.map(user => [this.utilityService.normalizeId(user.userId), `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.carpetUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        this.carpetUserOptions = ['Clear Selection', ...names];
      },
      error: () => {
        this.carpetUsers = [];
        this.carpetById = new Map<string, string>();
        this.carpetUserOptions = ['Clear Selection'];
      }
    });
  }

  loadInspectorUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspectors'))).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
        this.inspectorById = new Map(this.inspectorUsers.map(user => [this.utilityService.normalizeId(user.userId), `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.inspectorUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        this.inspectorUserOptions = ['Clear Selection', ...names];
      },
      error: () => {
        this.inspectorUsers = [];
        this.inspectorById = new Map<string, string>();
        this.inspectorUserOptions = ['Clear Selection'];
      }
    });
  }

  loadTrackerConfiguration(): void {
    this.trackerService.getTrackerConfiguration(false).pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'trackerConfiguration'))).subscribe({
      next: (response: TrackerConfigurationResponse) => {
        this.trackerConfiguration = response || null;
      },
      error: () => {
        this.trackerConfiguration = null;
      }
    });
  }

  loadReservationTrackerResponses(): void {
    const reservationIds = Array.from(new Set([
      ...this.reservationTurnoverArrivalRows.map(row => (row.reservationId || '').trim()),
      ...this.reservationTurnoverDepartureRows.map(row => (row.reservationId || '').trim())
    ].filter(id => !!id)));

    if (reservationIds.length === 0) {
      this.reservationTrackerResponsesByReservation.clear();
      this.reservationTrackerResponseOptionsByReservation.clear();
      this.applyReservationTrackerValues();
      this.publishReservationTrackerSlice();
      return;
    }

    from(reservationIds).pipe(
      concatMap(reservationId =>
        this.reservationService.getReservationTrackerResponses(reservationId).pipe(
          concatMap(responses =>
            this.reservationService.getReservationTrackerResponseOptions(reservationId).pipe(
              map(options => ({ reservationId, responses: responses || [], options: options || [] })),
              catchError(() => of({ reservationId, responses: responses || [], options: [] as ReservationTrackerResponseOption[] }))
            )
          ),
          catchError(() => of({ reservationId, responses: [] as ReservationTrackerResponse[], options: [] as ReservationTrackerResponseOption[] }))
        )
      ),
      toArray(),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.reservationTrackerResponsesByReservation.clear();
      this.reservationTrackerResponseOptionsByReservation.clear();
      result.forEach(item => {
        const byDefinitionId = new Map<string, ReservationTrackerResponse>();
        item.responses.forEach(response => {
          byDefinitionId.set(this.utilityService.normalizeId(response.trackerDefinitionId), response);
        });
        this.reservationTrackerResponsesByReservation.set(this.utilityService.normalizeId(item.reservationId), byDefinitionId);
        this.reservationTrackerResponseOptionsByReservation.set(this.utilityService.normalizeId(item.reservationId), item.options);
      });
      this.applyReservationTrackerValues();
      this.publishReservationTrackerSlice();
    });
  }
  //#endregion

  //#region Tracker Methods
  applyReservationTrackerColumns(): void {
    const visibleOfficeIds = new Set<number>([
      ...this.reservationTurnoverArrivalRows.map(row => row.officeId),
      ...this.reservationTurnoverDepartureRows.map(row => row.officeId)
    ].filter(officeId => officeId > 0));

    const arrivalDefinitions = this.getTrackerDefinitionsForContext(TrackerContextType.ReservationArrival)
      .filter(definition => visibleOfficeIds.size === 0 || visibleOfficeIds.has(definition.officeId));
    const departureDefinitions = this.getTrackerDefinitionsForContext(TrackerContextType.ReservationDeparture)
      .filter(definition => visibleOfficeIds.size === 0 || visibleOfficeIds.has(definition.officeId));

    const arrivalBase = this.cloneColumnSet(this.reservationTurnoverArrivalBaseColumns);
    const departureBase = this.cloneColumnSet(this.reservationTurnoverDepartureBaseColumns);
    this.arrivalColumnDefinitionByOffice = this.buildColumnDefinitionByOffice(arrivalDefinitions);
    this.departureColumnDefinitionByOffice = this.buildColumnDefinitionByOffice(departureDefinitions);

    this.arrivalColumnDefinitionByOffice.forEach((definitionByOffice, columnName) => {
      const displayName = definitionByOffice.values().next().value?.displayName || '';
      const headerLines = this.splitTwoWordHeader(displayName);
      const isMultiSelect = this.isTrackerColumnMultiSelect(definitionByOffice);
      arrivalBase[columnName] = {
        displayAs: headerLines.displayAs,
        headerLine2: headerLines.headerLine2,
        isCheckbox: !isMultiSelect,
        isMultiSelect: isMultiSelect,
        checkboxEditable: true,
        sort: false,
        wrap: false,
        alignment: 'center',
        headerAlignment: 'center',
        maxWidth: '10ch'
      };
    });

    this.departureColumnDefinitionByOffice.forEach((definitionByOffice, columnName) => {
      const displayName = definitionByOffice.values().next().value?.displayName || '';
      const headerLines = this.splitTwoWordHeader(displayName);
      const isMultiSelect = this.isTrackerColumnMultiSelect(definitionByOffice);
      departureBase[columnName] = {
        displayAs: headerLines.displayAs,
        headerLine2: headerLines.headerLine2,
        isCheckbox: !isMultiSelect,
        isMultiSelect: isMultiSelect,
        checkboxEditable: true,
        sort: false,
        wrap: false,
        alignment: 'center',
        headerAlignment: 'center',
        maxWidth: '10ch'
      };
    });

    this.reservationTurnoverArrivalColumns = arrivalBase;
    this.reservationTurnoverDepartureColumns = departureBase;
  }

  applyReservationTrackerValues(): void {
    this.reservationTurnoverArrivalRows = this.reservationTurnoverArrivalRows.map(row => this.attachTrackerValuesToRow(row, 'arrival'));
    this.reservationTurnoverDepartureRows = this.reservationTurnoverDepartureRows.map(row => this.attachTrackerValuesToRow(row, 'departure'));
  }

  attachTrackerValuesToRow(row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): ReservationTurnoverEventDisplay {
    const next = { ...row } as ReservationTurnoverEventDisplay & Record<string, unknown>;
    const responseByDefinitionId = this.reservationTrackerResponsesByReservation.get(this.utilityService.normalizeId(row.reservationId)) || new Map<string, ReservationTrackerResponse>();
    const optionResponses = this.reservationTrackerResponseOptionsByReservation.get(this.utilityService.normalizeId(row.reservationId)) || [];
    const byOffice = sourceContext === 'arrival' ? this.arrivalColumnDefinitionByOffice : this.departureColumnDefinitionByOffice;
    byOffice.forEach((definitionByOffice, columnName) => {
      const definition = this.resolveTrackerDefinitionForOffice(definitionByOffice, row.officeId);
      if (!definition) {
        next[columnName] = 'NONE';
        return;
      }
      if (this.isTrackerDefinitionMultiSelect(definition)) {
        const selectedLabels = optionResponses
          .filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) === this.utilityService.normalizeId(definition.trackerDefinitionId))
          .map(option => (definition.options || []).find(defOption => this.utilityService.normalizeId(defOption.trackerDefinitionOptionId) === this.utilityService.normalizeId(option.trackerDefinitionOptionId))?.label || '')
          .filter(label => !!label);
        next[columnName] = {
          value: selectedLabels,
          options: (definition.options || []).map(option => option.label).filter(label => !!label),
          optionsSelected: selectedLabels.length,
          triggerText: selectedLabels.length ? `${selectedLabels.length} selected` : 'Select',
          isOverridable: true,
          isMultiSelect: true,
          toString: () => selectedLabels.join(', ')
        };
        return;
      }
      const response = responseByDefinitionId.get(this.utilityService.normalizeId(definition.trackerDefinitionId));
      next[columnName] = response?.isChecked === true;
    });
    return next;
  }

  onReservationCheckboxChange(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const ext = event as ReservationTurnoverEventDisplay & { __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean; };
    const column = ext.__changedCheckboxColumn;
    if (!column) {
      return;
    }
    const reservationId = (event.reservationId || '').trim();
    const previousValue = ext.__previousCheckboxValue === true;
    const nextValue = ext.__checkboxValue === true;
    if (previousValue === nextValue || !reservationId) {
      return;
    }
    const trackerDefinition = this.getTrackerDefinitionForRow(sourceContext, column, event.officeId);
    if (!trackerDefinition) {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, previousValue);
      this.publishReservationTrackerSlice();
      return;
    }
    void this.saveReservationTrackerCheckbox(reservationId, trackerDefinition, nextValue).then(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, nextValue);
      this.publishReservationTrackerSlice();
      this.toastr.success('Tracker updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, previousValue);
      this.publishReservationTrackerSlice();
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
    });
  }

  onReservationDropdownChange(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (!changedColumn) {
      return;
    }
    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      return;
    }
    const trackerDefinition = this.getTrackerDefinitionForRow(sourceContext, changedColumn, event.officeId);
    if (!trackerDefinition || !this.isTrackerDefinitionMultiSelect(trackerDefinition)) {
      return;
    }
    const selectedLabels = this.readMultiSelectLabels(event, changedColumn);
    void this.saveReservationTrackerMultiSelect(reservationId, trackerDefinition, selectedLabels).then(() => {
      this.applyReservationTrackerValues();
      this.publishReservationTrackerSlice();
      this.toastr.success('Tracker updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyReservationTrackerValues();
      this.publishReservationTrackerSlice();
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
    });
  }

  onReservationCheckAllTracking(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      return;
    }
    const definitions = this.getTrackerDefinitionsForOffice(
      sourceContext === 'arrival' ? this.arrivalColumnDefinitionByOffice : this.departureColumnDefinitionByOffice,
      event.officeId
    );
    if (definitions.length === 0) {
      return;
    }
    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            await this.saveReservationTrackerMultiSelect(reservationId, definition, (definition.options || []).map(option => option.label).filter(label => !!label));
            continue;
          }
          await this.saveReservationTrackerCheckbox(reservationId, definition, true);
        }
        this.applyReservationTrackerValues();
        this.publishReservationTrackerSlice();
        this.toastr.success('Tracking marked complete.', CommonMessage.Success);
      } catch {
        this.applyReservationTrackerValues();
        this.publishReservationTrackerSlice();
        this.toastr.error('Unable to update all tracker checks.', CommonMessage.Error);
      }
    })();
  }

  onReservationClearTracking(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      return;
    }
    const definitions = this.getTrackerDefinitionsForOffice(
      sourceContext === 'arrival' ? this.arrivalColumnDefinitionByOffice : this.departureColumnDefinitionByOffice,
      event.officeId
    );
    if (definitions.length === 0) {
      return;
    }
    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            await this.saveReservationTrackerMultiSelect(reservationId, definition, []);
            continue;
          }
          await this.saveReservationTrackerCheckbox(reservationId, definition, false);
        }
        this.applyReservationTrackerValues();
        this.publishReservationTrackerSlice();
        this.toastr.success('Tracking cleared.', CommonMessage.Success);
      } catch {
        this.applyReservationTrackerValues();
        this.publishReservationTrackerSlice();
        this.toastr.error('Unable to clear tracking.', CommonMessage.Error);
      }
    })();
  }

  async saveReservationTrackerCheckbox(reservationId: string, trackerDefinition: TrackerConfigurationDefinitionResponse, isChecked: boolean): Promise<void> {
    const reservationKey = this.utilityService.normalizeId(reservationId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.reservationTrackerResponsesByReservation.get(reservationKey) || new Map<string, ReservationTrackerResponse>();
    this.reservationTrackerResponsesByReservation.set(reservationKey, byDefinitionId);
    const existing = byDefinitionId.get(definitionKey) || null;
    if (isChecked) {
      const request: ReservationTrackerResponseRequest = {
        trackerResponseId: existing?.trackerResponseId,
        trackerDefinitionId: trackerDefinition.trackerDefinitionId,
        reservationId: reservationId,
        isChecked: true,
        checkedOn: new Date().toISOString(),
        checkedBy: this.authService.getUser()?.userId ?? null
      };
      const saved = existing
        ? await firstValueFrom(this.reservationService.updateReservationTrackerResponse(request))
        : await firstValueFrom(this.reservationService.createReservationTrackerResponse(request));
      byDefinitionId.set(definitionKey, saved);
      return;
    }
    if (existing?.trackerResponseId) {
      await firstValueFrom(this.reservationService.deleteReservationTrackerResponse(existing.trackerResponseId));
      byDefinitionId.delete(definitionKey);
    }
  }

  async saveReservationTrackerMultiSelect(reservationId: string, trackerDefinition: TrackerConfigurationDefinitionResponse, selectedLabels: string[]): Promise<void> {
    const reservationKey = this.utilityService.normalizeId(reservationId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.reservationTrackerResponsesByReservation.get(reservationKey) || new Map<string, ReservationTrackerResponse>();
    this.reservationTrackerResponsesByReservation.set(reservationKey, byDefinitionId);
    const optionResponses = this.reservationTrackerResponseOptionsByReservation.get(reservationKey) || [];
    const optionById = new Map((trackerDefinition.options || []).map(option => [this.utilityService.normalizeId(option.trackerDefinitionOptionId), option] as const));
    const optionIdByLabel = new Map((trackerDefinition.options || []).map(option => [option.label, this.utilityService.normalizeId(option.trackerDefinitionOptionId)] as const));
    const selectedOptionIds = new Set(selectedLabels.map(label => optionIdByLabel.get(label) || '').filter(optionId => !!optionId));
    let trackerResponse = byDefinitionId.get(definitionKey) || null;
    if (!trackerResponse && selectedOptionIds.size > 0) {
      trackerResponse = await firstValueFrom(this.reservationService.createReservationTrackerResponse({
        trackerDefinitionId: trackerDefinition.trackerDefinitionId,
        reservationId: reservationId,
        isChecked: true,
        checkedOn: new Date().toISOString(),
        checkedBy: this.authService.getUser()?.userId ?? null
      }));
      byDefinitionId.set(definitionKey, trackerResponse);
    }
    if (!trackerResponse) {
      return;
    }
    const responseOptionList = optionResponses.filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) === definitionKey);
    const existingOptionIds = new Set(responseOptionList.map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId)));
    for (const optionId of Array.from(selectedOptionIds).filter(id => !existingOptionIds.has(id))) {
      const option = optionById.get(optionId);
      if (!option) {
        continue;
      }
      const created = await firstValueFrom(this.reservationService.createReservationTrackerResponseOption({
        trackerResponseId: trackerResponse.trackerResponseId,
        trackerDefinitionOptionId: option.trackerDefinitionOptionId
      } as ReservationTrackerResponseOptionRequest));
      optionResponses.push(created);
    }
    for (const optionId of Array.from(existingOptionIds).filter(id => !selectedOptionIds.has(id))) {
      const option = responseOptionList.find(item => this.utilityService.normalizeId(item.trackerDefinitionOptionId) === optionId);
      if (!option) {
        continue;
      }
      await firstValueFrom(this.reservationService.deleteReservationTrackerResponseOption(option.trackerResponseId, option.trackerDefinitionOptionId));
    }
    this.reservationTrackerResponseOptionsByReservation.set(
      reservationKey,
      optionResponses.filter(option => {
        if (this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey) {
          return true;
        }
        return selectedOptionIds.has(this.utilityService.normalizeId(option.trackerDefinitionOptionId));
      })
    );
    if (selectedOptionIds.size === 0 && trackerResponse.trackerResponseId) {
      await firstValueFrom(this.reservationService.deleteReservationTrackerResponse(trackerResponse.trackerResponseId));
      byDefinitionId.delete(definitionKey);
    }
  }
  //#endregion

  //#region Utility Methods
  publishSnapshot(): void {
    const arrivalRows = [...this.arrivalReservations].sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0));
    const departureRows = [...this.departureReservations].sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0));
    const onlineRows = [...this.onlineProperties]
      .filter(pm => pm.onlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableFromOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableFromOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));
    const offlineRows = [...this.offlineProperties]
      .filter(pm => pm.offlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableUntilOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableUntilOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));

    this.reservationTurnoverArrivalRows = arrivalRows.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r));
    this.reservationTurnoverDepartureRows = departureRows.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r));
    this.applyReservationTrackerColumns();
    this.applyReservationTrackerValues();

    const maintenanceSlices = this.remapProviderCells(this.buildMaintenanceSlices());
    const maintenanceColumns = this.buildMaintenanceColumns();

    this.companyDataService.publish({
      ...emptyDashboardCompanyDataSnapshot,
      isReady: true,
      todayArriveDepartCount: this.todayArriveDepartCount,
      tomorrowArriveDepartCount: this.tomorrowArriveDepartCount,
      onlineOfflineTodayCount: this.getOnlineOfflineTodayCount(),
      onlineOfflineTomorrowCount: this.getOnlineOfflineTomorrowCount(),
      rentedCount: this.rentedCount,
      vacantCount: this.vacantCount,
      reservationTurnoverArrivalRows: this.reservationTurnoverArrivalRows,
      reservationTurnoverDepartureRows: this.reservationTurnoverDepartureRows,
      onlinePropertyRows: onlineRows,
      offlinePropertyRows: offlineRows,
      arrivalMaintenanceDisplay: maintenanceSlices.arrivals,
      departureMaintenanceDisplay: maintenanceSlices.departures,
      comingOnlineMaintenanceDisplay: maintenanceSlices.online,
      goingOfflineMaintenanceDisplay: maintenanceSlices.offline,
      maidMaintenanceDisplay: maintenanceSlices.maid,
      reservationTurnoverArrivalColumns: this.reservationTurnoverArrivalColumns,
      reservationTurnoverDepartureColumns: this.reservationTurnoverDepartureColumns,
      propertyOnlineColumns: this.propertyOnlineColumns,
      propertyOfflineColumns: this.propertyOfflineColumns,
      arrivalMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Arrival Date'),
      departureMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Departure Date'),
      comingOnlineMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Online Date'),
      goingOfflineMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Offline Date'),
      maidMaintenanceColumns: this.cloneMaidColumnSet(maintenanceColumns)
    });
  }

  publishReservationTrackerSlice(): void {
    this.companyDataService.patchSnapshot({
      reservationTurnoverArrivalRows: this.reservationTurnoverArrivalRows,
      reservationTurnoverDepartureRows: this.reservationTurnoverDepartureRows,
      reservationTurnoverArrivalColumns: this.reservationTurnoverArrivalColumns,
      reservationTurnoverDepartureColumns: this.reservationTurnoverDepartureColumns
    });
  }

  buildMaintenanceColumns(): ColumnSet {
    return {
      propertyCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
      eventDate: { displayAs: 'Event Date', maxWidth: '15ch', alignment: 'center', wrap: false },
      hasPets: { displayAs: 'Pets', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '10ch' },
      cleaningDate: { displayAs: 'Cleaner Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
      cleaner: { displayAs: 'Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.housekeepingUserOptions },
      carpetDate: { displayAs: 'Carpet Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
      carpet: { displayAs: 'Carpet Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.carpetUserOptions },
      inspectingDate: { displayAs: 'Inspector Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
      inspector: { displayAs: 'Inspector', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.inspectorUserOptions }
    };
  }

  buildMaintenanceSlices(): {
    arrivals: MaintenanceListDisplay[];
    departures: MaintenanceListDisplay[];
    online: MaintenanceListDisplay[];
    offline: MaintenanceListDisplay[];
    maid: MaintenanceListDisplay[];
  } {
    const propertyRows = this.mappingService.mapPropertyListRows(
      this.filteredPropertyMaintenanceList.map(pm => this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm))
    );
    const propertyById = new Map(propertyRows.map(p => [p.propertyId, p] as const));
    const currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId =
      this.mixedMappingService.getReservationData(this.filteredReservationPropertyMaintenanceList as never[]);
    const mappingContext: MaintenanceListMappingContext = {
      housekeepingUsers: this.housekeepingUsers,
      carpetUsers: this.carpetUsers,
      inspectorUsers: this.inspectorUsers,
      housekeepingById: this.housekeepingById,
      carpetById: this.carpetById,
      inspectorById: this.inspectorById,
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
      const maintenanceRecord: MaintenanceListResponse | null = this.getMaintenanceListResponseForPropertyId(mixed.propertyId, propertyRow.propertyId);
      return this.mixedMappingService.mapMaintenanceListDisplayFromMixedTurnoverRow({
        mixedRow: mixed,
        propertyRow,
        maintenanceRecord,
        context: mappingContext,
        eventDateDisplay,
        eventDateSortTime,
        hasPets
      });
    };

    const mapReservationRows = (rows: ReservationPropertyMaintenance[], dateDisplay: (r: ReservationPropertyMaintenance) => string, sortTime: (r: ReservationPropertyMaintenance) => number) =>
      rows
        .map(r => mapMixedRow(r, dateDisplay(r), sortTime(r), r.hasPets))
        .filter((row): row is MaintenanceListDisplay => row !== null);

    const mapPropertyRows = (rows: PropertyMaintenance[], dateDisplay: (r: PropertyMaintenance) => string, sortTime: (r: PropertyMaintenance) => number) =>
      rows
        .map(r => mapMixedRow(r, dateDisplay(r), sortTime(r), false))
        .filter((row): row is MaintenanceListDisplay => row !== null);

    return {
      arrivals: mapReservationRows(
        [...this.arrivalReservations].sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0)),
        r => r.arrivalDateDisplay,
        r => Number(r.eventDateSortTime ?? r.arrivalDateOrdinal ?? noSort)
      ),
      departures: mapReservationRows(
        [...this.departureReservations].sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0)),
        r => r.departureDateDisplay,
        r => Number(r.eventDateSortTime ?? r.departureDateOrdinal ?? noSort)
      ),
      maid: mapReservationRows(
        [...this.cleaningReservations].sort((a, b) => (Number(a.eventDateSortTime) || 0) - (Number(b.eventDateSortTime) || 0)),
        r => this.formatterService.formatDateString(r.eventDate ?? undefined) || '',
        r => Number(r.eventDateSortTime ?? noSort)
      ),
      online: mapPropertyRows(
        [...this.onlineProperties].sort((a, b) => (a.availableFromOrdinal ?? 0) - (b.availableFromOrdinal ?? 0)),
        r => r.availableFromDisplay,
        r => Number(r.eventDateSortTime ?? r.availableFromOrdinal ?? noSort)
      ),
      offline: mapPropertyRows(
        [...this.offlineProperties].sort((a, b) => (a.availableUntilOrdinal ?? 0) - (b.availableUntilOrdinal ?? 0)),
        r => r.availableUntilDisplay,
        r => Number(r.eventDateSortTime ?? r.availableUntilOrdinal ?? noSort)
      )
    };
  }

  remapProviderCells(slices: {
    arrivals: MaintenanceListDisplay[];
    departures: MaintenanceListDisplay[];
    online: MaintenanceListDisplay[];
    offline: MaintenanceListDisplay[];
    maid: MaintenanceListDisplay[];
  }): typeof slices {
    const remapRows = (rows: MaintenanceListDisplay[]) =>
      rows.map(property => ({
        ...property,
        cleaner: this.buildUserDropdownCell(
          this.resolveProviderName(property.cleanerUserId, property.cleaner, this.housekeepingById),
          this.getCleanerOptionsForOffice(property.officeId)
        ),
        carpet: this.buildUserDropdownCell(
          this.resolveProviderName(property.carpetUserId, property.carpet, this.carpetById),
          this.getCarpetOptionsForOffice(property.officeId)
        ),
        inspector: this.buildUserDropdownCell(
          this.resolveProviderName(property.inspectorUserId, property.inspector, this.inspectorById),
          this.getInspectorOptionsForOffice(property.officeId)
        )
      }));
    return {
      arrivals: remapRows(slices.arrivals),
      departures: remapRows(slices.departures),
      online: remapRows(slices.online),
      offline: remapRows(slices.offline),
      maid: remapRows(slices.maid)
    };
  }

  onMaintenanceDropdownChange(event: MaintenanceListDisplay): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedColumn === 'cleaner' || changedColumn === 'carpet' || changedColumn === 'inspector') {
      this.handleMaintenanceAssigneeDropdownChange(event);
    }
  }

  handleMaintenanceInlineDateChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    const col = event.__changedInlineColumn;
    if (col !== 'cleaningDate' && col !== 'carpetDate' && col !== 'inspectingDate') {
      return;
    }
    this.onMaintenanceDateChange(event, col, event.__inlineValue ?? '');
  }

  handleMaintenanceAssigneeDropdownChange(event: MaintenanceListDisplay): void {
    const selectedCleanerLabel = event.cleaner?.value ?? '';
    const selectedCarpetLabel = event.carpet?.value ?? '';
    const selectedInspectorLabel = event.inspector?.value ?? '';
    const selectedCleanerId = this.resolveCleanerIdFromLabel(selectedCleanerLabel, event.officeId);
    const selectedCarpetId = this.resolveCarpetIdFromLabel(selectedCarpetLabel, event.officeId);
    const selectedInspectorId = this.resolveInspectorIdFromLabel(selectedInspectorLabel, event.officeId);
    const currentCleanerId = event.cleanerUserId ?? null;
    const currentCarpetId = event.carpetUserId ?? null;
    const currentInspectorId = event.inspectorUserId ?? null;
    if (selectedCleanerId !== currentCleanerId || selectedCarpetId !== currentCarpetId || selectedInspectorId !== currentInspectorId) {
      this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedCarpetId, selectedInspectorId);
      return;
    }
    this.applyProviderValuesToEvent(
      event,
      currentCleanerId,
      currentCarpetId,
      currentInspectorId,
      event.cleaningDate ?? '',
      event.carpetDate ?? '',
      event.inspectingDate ?? ''
    );
    this.publishMaintenanceSliceFromEvent(event);
  }

  onMaintenanceAssigneesChange(event: MaintenanceListDisplay, cleanerUserId: string | null, carpetUserId: string | null, inspectorUserId: string | null): void {
    const target = this.getEffectiveProviderTargetForRow(event);
    const currentCleaningDate = this.mappingService.toDateOnlyJsonString(event.cleaningDate) ?? null;
    const cleaningDate = target === ServiceType.MaidService ? currentCleaningDate : (cleanerUserId ? currentCleaningDate : null);
    const carpetDate = carpetUserId ? (this.mappingService.toDateOnlyJsonString(event.carpetDate) ?? null) : null;
    const inspectingDate = inspectorUserId ? (this.mappingService.toDateOnlyJsonString(event.inspectingDate) ?? null) : null;

    const onSaveOk = () => {
      this.applyProviderValuesToEvent(
        event,
        cleanerUserId,
        carpetUserId,
        inspectorUserId,
        this.formatterService.formatDateString(cleaningDate ?? undefined) || '',
        this.formatterService.formatDateString(carpetDate ?? undefined) || '',
        this.formatterService.formatDateString(inspectingDate ?? undefined) || ''
      );
      this.publishMaintenanceSliceFromEvent(event);
      this.toastr.success('Provider assignments updated.', CommonMessage.Success);
    };
    const onSaveErr = (error?: unknown) => {
      this.applyProviderValuesToEvent(
        event,
        event.cleanerUserId ?? null,
        event.carpetUserId ?? null,
        event.inspectorUserId ?? null,
        event.cleaningDate ?? '',
        event.carpetDate ?? '',
        event.inspectingDate ?? ''
      );
      this.publishMaintenanceSliceFromEvent(event);
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(detail ? `Unable to update provider assignments. ${detail}` : 'Unable to update provider assignments.', CommonMessage.Error);
    };

    if (target === ServiceType.Online || target === ServiceType.Offline) {
      const patch = target === ServiceType.Online
        ? {
            onCleanerUserId: cleanerUserId,
            onCleaningDate: cleaningDate,
            onCarpetUserId: carpetUserId,
            onCarpetDate: carpetDate,
            onInspectorUserId: inspectorUserId,
            onInspectingDate: inspectingDate
          }
        : {
            offCleanerUserId: cleanerUserId,
            offCleaningDate: cleaningDate,
            offCarpetUserId: carpetUserId,
            offCarpetDate: carpetDate,
            offInspectorUserId: inspectorUserId,
            offInspectingDate: inspectingDate
          };
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      this.toastr.error('Reservation not found for provider update.', CommonMessage.Error);
      return;
    }

    if (target === ServiceType.Arrival || target === ServiceType.Departure) {
      const patch = target === ServiceType.Arrival
        ? {
            aCleanerUserId: cleanerUserId,
            aCleaningDate: cleaningDate,
            aCarpetUserId: carpetUserId,
            aCarpetDate: carpetDate,
            aInspectorUserId: inspectorUserId,
            aInspectingDate: inspectingDate
          }
        : {
            dCleanerUserId: cleanerUserId,
            dCleaningDate: cleaningDate,
            dCarpetUserId: carpetUserId,
            dCarpetDate: carpetDate,
            dInspectorUserId: inspectorUserId,
            dInspectingDate: inspectingDate
          };
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    if (target === ServiceType.MaidService) {
      void this.reservationService.updateModifiedReservation(reservationId, { maidUserId: cleanerUserId }).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    this.toastr.error('Unable to determine where provider changes should be saved.', CommonMessage.Error);
    onSaveErr();
  }

  onMaintenanceDateChange(event: MaintenanceListDisplay, columnName: 'cleaningDate' | 'carpetDate' | 'inspectingDate', dateValue: string): void {
    const target = this.getEffectiveProviderTargetForRow(event);
    const dateOnlyJson = this.mappingService.toDateOnlyJsonString(dateValue);
    const cleanerUserId = event.cleanerUserId ?? null;
    const carpetUserId = event.carpetUserId ?? null;
    const inspectorUserId = event.inspectorUserId ?? null;
    const nextCleaningDate = columnName === 'cleaningDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.cleaningDate) ?? null);
    const nextCarpetDate = columnName === 'carpetDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.carpetDate) ?? null);
    const nextInspectingDate = columnName === 'inspectingDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.inspectingDate) ?? null);

    const onSaveOk = () => {
      this.applyProviderValuesToEvent(
        event,
        cleanerUserId,
        carpetUserId,
        inspectorUserId,
        this.formatterService.formatDateString(nextCleaningDate ?? undefined) || '',
        this.formatterService.formatDateString(nextCarpetDate ?? undefined) || '',
        this.formatterService.formatDateString(nextInspectingDate ?? undefined) || ''
      );
      this.publishMaintenanceSliceFromEvent(event);
      this.toastr.success('Provider date updated.', CommonMessage.Success);
    };
    const onSaveErr = (error?: unknown) => {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(detail ? `Unable to update provider date. ${detail}` : 'Unable to update provider date.', CommonMessage.Error);
      this.publishMaintenanceSliceFromEvent(event);
    };

    if (target === ServiceType.Online || target === ServiceType.Offline) {
      const patch = target === ServiceType.Online
        ? columnName === 'cleaningDate'
          ? { onCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { onCarpetDate: nextCarpetDate }
            : { onInspectingDate: nextInspectingDate }
        : columnName === 'cleaningDate'
          ? { offCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { offCarpetDate: nextCarpetDate }
            : { offInspectingDate: nextInspectingDate };
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      this.toastr.error('Reservation not found for provider date update.', CommonMessage.Error);
      return;
    }

    if (target === ServiceType.Arrival || target === ServiceType.Departure) {
      const patch = target === ServiceType.Arrival
        ? columnName === 'cleaningDate'
          ? { aCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { aCarpetDate: nextCarpetDate }
            : { aInspectingDate: nextInspectingDate }
        : columnName === 'cleaningDate'
          ? { dCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { dCarpetDate: nextCarpetDate }
            : { dInspectingDate: nextInspectingDate };
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    if (target === ServiceType.MaidService) {
      if (columnName !== 'cleaningDate') {
        this.toastr.error('Only cleaning date applies to maid service.', CommonMessage.Error);
        return;
      }
      void this.reservationService.updateModifiedReservation(reservationId, { maidStartDate: nextCleaningDate }).then(onSaveOk).catch(error => onSaveErr(error));
      return;
    }

    this.toastr.error('Unable to determine where provider date should be saved.', CommonMessage.Error);
  }

  applyProviderValuesToEvent(
    event: MaintenanceListDisplay,
    cleanerUserId: string | null,
    carpetUserId: string | null,
    inspectorUserId: string | null,
    cleaningDate: string,
    carpetDate: string,
    inspectingDate: string
  ): void {
    event.cleanerUserId = cleanerUserId;
    event.carpetUserId = carpetUserId;
    event.inspectorUserId = inspectorUserId;
    event.cleaningDate = cleaningDate;
    event.carpetDate = carpetDate;
    event.inspectingDate = inspectingDate;
    event.cleaner = this.buildUserDropdownCell(this.resolveCleanerName(cleanerUserId ?? '', event.officeId), this.getCleanerOptionsForOffice(event.officeId));
    event.carpet = this.buildUserDropdownCell(this.resolveCarpetName(carpetUserId ?? '', event.officeId), this.getCarpetOptionsForOffice(event.officeId));
    event.inspector = this.buildUserDropdownCell(this.resolveInspectorName(inspectorUserId ?? '', event.officeId), this.getInspectorOptionsForOffice(event.officeId));
  }

  publishMaintenanceSliceFromEvent(event: MaintenanceListDisplay): void {
    const snapshot = this.companyDataService.snapshot;
    const patchRows = (rows: MaintenanceListDisplay[]) =>
      rows.map(row => (row.propertyId === event.propertyId && (row.reservationId || '') === (event.reservationId || '') ? { ...event } : row));
    this.companyDataService.patchSnapshot({
      arrivalMaintenanceDisplay: patchRows(snapshot.arrivalMaintenanceDisplay),
      departureMaintenanceDisplay: patchRows(snapshot.departureMaintenanceDisplay),
      comingOnlineMaintenanceDisplay: patchRows(snapshot.comingOnlineMaintenanceDisplay),
      goingOfflineMaintenanceDisplay: patchRows(snapshot.goingOfflineMaintenanceDisplay),
      maidMaintenanceDisplay: patchRows(snapshot.maidMaintenanceDisplay)
    });
  }

  getEffectiveProviderTargetForRow(event: MaintenanceListDisplay): ServiceType | null {
    if (event.eventType != null) {
      return event.eventType;
    }
    return (event.reservationId || '').trim() !== '' ? ServiceType.Departure : ServiceType.Online;
  }

  getCleanerOptionsForOffice(officeId: number): string[] {
    const names = this.getHousekeepingUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  getCarpetOptionsForOffice(officeId: number): string[] {
    const names = this.getCarpetUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  getInspectorOptionsForOffice(officeId: number): string[] {
    const names = this.getInspectorUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  resolveCleanerIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Cleaner') {
      return null;
    }
    const user = this.getHousekeepingUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveCarpetIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Carpet Cleaner') {
      return null;
    }
    const user = this.getCarpetUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveInspectorIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Inspector') {
      return null;
    }
    const user = this.getInspectorUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveCleanerName(cleanerUserIdOrName: string, officeId: number): string {
    if (!cleanerUserIdOrName || cleanerUserIdOrName === 'Clear Selection') {
      return '';
    }
    const normalizedUserId = this.utilityService.normalizeId(cleanerUserIdOrName);
    const matchingUser = this.getHousekeepingUsersForScope(officeId).find(user => this.utilityService.normalizeId(user.userId) === normalizedUserId);
    return matchingUser ? `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim() : (this.housekeepingById.get(normalizedUserId) ?? cleanerUserIdOrName);
  }

  resolveCarpetName(carpetUserIdOrName: string, officeId: number): string {
    if (!carpetUserIdOrName || carpetUserIdOrName === 'Clear Selection') {
      return '';
    }
    const normalizedUserId = this.utilityService.normalizeId(carpetUserIdOrName);
    const matchingUser = this.getCarpetUsersForScope(officeId).find(user => this.utilityService.normalizeId(user.userId) === normalizedUserId);
    return matchingUser ? `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim() : (this.carpetById.get(normalizedUserId) ?? carpetUserIdOrName);
  }

  resolveInspectorName(inspectorUserIdOrName: string, officeId: number): string {
    if (!inspectorUserIdOrName || inspectorUserIdOrName === 'Clear Selection') {
      return '';
    }
    const normalizedUserId = this.utilityService.normalizeId(inspectorUserIdOrName);
    const matchingUser = this.getInspectorUsersForScope(officeId).find(user => this.utilityService.normalizeId(user.userId) === normalizedUserId);
    return matchingUser ? `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim() : (this.inspectorById.get(normalizedUserId) ?? inspectorUserIdOrName);
  }

  buildUserDropdownCell(label: string, options: string[]): MaintenanceListUserDropdownCell {
    const normalizedLabel = label === 'Clear Selection' ? '' : label;
    return {
      value: normalizedLabel,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => normalizedLabel
    };
  }

  resolveProviderName(userId: string | null | undefined, cell: MaintenanceListUserDropdownCell | string | undefined, byId: Map<string, string>): string {
    const fromCell = typeof cell === 'string' ? cell : (cell?.value ?? '');
    const key = (userId || fromCell || '').trim();
    if (!key || key === 'Clear Selection') {
      return '';
    }
    return byId.get(this.utilityService.normalizeId(key)) ?? fromCell ?? key;
  }

  mapPropertyMaintenanceToDashboardTurnoverRow(pm: PropertyMaintenance): DashboardPropertyTurnoverRow {
    const property = {
      ...this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm),
      propertyLeaseTypeId: this.getPropertyLeaseTypeIdByPropertyId(pm.propertyId)
    };
    return this.mixedMappingService.mapDashboardMainPropertyTurnoverRow(
      property,
      this.getMaintenanceListResponseForPropertyId(pm.propertyId) ?? null,
      pm
    );
  }

  withEventDateLabel(source: ColumnSet, eventDateLabel: string): ColumnSet {
    const eventCol = source['eventDate'];
    if (!eventCol) {
      return { ...source };
    }
    return {
      ...source,
      eventDate: { ...eventCol, displayAs: eventDateLabel }
    };
  }

  cloneMaidColumnSet(source: ColumnSet): ColumnSet {
    const maidColumns = this.withEventDateLabel(source, 'Cleaning Date');
    const nextColumns = { ...maidColumns };
    delete nextColumns['carpetDate'];
    delete nextColumns['carpet'];
    delete nextColumns['inspectingDate'];
    delete nextColumns['inspector'];
    return nextColumns;
  }

  cloneColumnSet(columns: ColumnSet): ColumnSet {
    const cloned: ColumnSet = {};
    Object.keys(columns).forEach(key => {
      cloned[key] = { ...(columns[key] || {}) };
    });
    return cloned;
  }

  getTrackerDefinitionsForContext(contextType: TrackerContextType): TrackerConfigurationDefinitionResponse[] {
    if (!this.trackerConfiguration?.contexts?.length) {
      return [];
    }
    const context = this.trackerConfiguration.contexts.find(c => Number(c.trackerContextId) === Number(contextType));
    if (!context?.definitions?.length) {
      return [];
    }
    return context.definitions
      .filter(definition => definition.isActive)
      .filter(definition => this.selectedOffice?.officeId == null || definition.officeId === this.selectedOffice.officeId)
      .sort((a, b) => {
        if (a.officeId !== b.officeId) return a.officeId - b.officeId;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.displayName.localeCompare(b.displayName);
      });
  }

  buildColumnDefinitionByOffice(definitions: TrackerConfigurationDefinitionResponse[]): Map<string, Map<number, TrackerConfigurationDefinitionResponse>> {
    const mapByColumn = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    definitions.forEach(definition => {
      const columnName = `tracker_${(definition.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (!mapByColumn.has(columnName)) {
        mapByColumn.set(columnName, new Map<number, TrackerConfigurationDefinitionResponse>());
      }
      mapByColumn.get(columnName)!.set(Number(definition.officeId), definition);
    });
    return mapByColumn;
  }

  resolveTrackerDefinitionForOffice(
    definitionByOffice: Map<number, TrackerConfigurationDefinitionResponse>,
    officeId: number
  ): TrackerConfigurationDefinitionResponse | undefined {
    const key = Number(officeId);
    if (Number.isFinite(key) && definitionByOffice.has(key)) {
      return definitionByOffice.get(key);
    }
    for (const [mappedOfficeId, definition] of definitionByOffice.entries()) {
      if (Number(mappedOfficeId) === key) {
        return definition;
      }
    }
    if (definitionByOffice.size === 1) {
      return definitionByOffice.values().next().value;
    }
    return undefined;
  }

  splitTwoWordHeader(displayName: string): { displayAs: string; headerLine2?: string } {
    const words = (displayName || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 2) {
      return { displayAs: words[0], headerLine2: words[1] };
    }
    return { displayAs: (displayName || '').trim() };
  }

  isTrackerDefinitionMultiSelect(definition: TrackerConfigurationDefinitionResponse | null | undefined): boolean {
    return !!definition?.options?.length;
  }

  isTrackerColumnMultiSelect(definitionByOffice: Map<number, TrackerConfigurationDefinitionResponse>): boolean {
    for (const definition of definitionByOffice.values()) {
      if (this.isTrackerDefinitionMultiSelect(definition)) {
        return true;
      }
    }
    return false;
  }

  getTrackerDefinitionForRow(sourceContext: 'arrival' | 'departure', columnName: string, officeId: number): TrackerConfigurationDefinitionResponse | null {
    const mapByColumn = sourceContext === 'arrival' ? this.arrivalColumnDefinitionByOffice : this.departureColumnDefinitionByOffice;
    return this.resolveTrackerDefinitionForOffice(mapByColumn.get(columnName) || new Map(), officeId) || null;
  }

  getTrackerDefinitionsForOffice(mapByColumn: Map<string, Map<number, TrackerConfigurationDefinitionResponse>>, officeId: number): TrackerConfigurationDefinitionResponse[] {
    const definitionsById = new Map<string, TrackerConfigurationDefinitionResponse>();
    mapByColumn.forEach(byOffice => {
      const definition = this.resolveTrackerDefinitionForOffice(byOffice, officeId);
      if (!definition) {
        return;
      }
      definitionsById.set(this.utilityService.normalizeId(definition.trackerDefinitionId), definition);
    });
    return Array.from(definitionsById.values());
  }

  readMultiSelectLabels(row: unknown, columnName: string): string[] {
    const rowValue = row as Record<string, unknown>;
    const cell = rowValue[columnName] as { value?: unknown } | undefined;
    const value = cell?.value;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(item => String(item ?? '').trim()).filter(label => !!label);
  }

  applyReservationTurnoverCheckboxValue(reservationId: string, column: string, value: boolean): void {
    const apply = (rows: ReservationTurnoverEventDisplay[]): ReservationTurnoverEventDisplay[] =>
      rows.map(row => ((row.reservationId || '').trim() === reservationId ? { ...row, [column]: value } : row));
    this.reservationTurnoverArrivalRows = apply(this.reservationTurnoverArrivalRows);
    this.reservationTurnoverDepartureRows = apply(this.reservationTurnoverDepartureRows);
  }
  //#endregion
}
