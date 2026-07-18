import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, catchError, concatMap, filter, finalize, firstValueFrom, from, map, of, take, takeUntil, toArray } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DashboardPropertyTurnoverRow, PropertyMaintenance, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyTrackerResponse, PropertyTrackerResponseOption, PropertyTrackerResponseOptionRequest, PropertyTrackerResponseRequest} from '../../properties/models/property.model';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ReservationListDisplay, ReservationTrackerResponse, ReservationTrackerResponseOption, ReservationTrackerResponseOptionRequest, ReservationTrackerResponseRequest} from '../../reservations/models/reservation-model';
import { BillingType } from '../../reservations/models/reservation-enum';
import { ReservationService } from '../../reservations/services/reservation.service';
import { MaintenanceService } from '../../maintenance/services/maintenance.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { MonthlyCommissionDisplay, MonthlyCommissionTileRow } from '../models/dashboard-model';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { TrackerContextType } from '../../organizations/models/tracker-enum';
import { TrackerConfigurationDefinitionResponse, TrackerConfigurationResponse } from '../../organizations/models/tracker.model';
import { TrackerService } from '../../organizations/services/tracker.service';
import { PropertyLeaseType } from '../../properties/models/property-enums';

@Component({
    standalone: true,
    selector: 'app-dashboard-main',
    imports: [MaterialModule, DataTableComponent],
    templateUrl: './dashboard-main.component.html',
    styleUrl: './dashboard-main.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardMainComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private router = inject(Router);
  private agentService = inject(AgentService);
  private formatterService = inject(FormatterService);
  private toastr = inject(ToastrService);
  private trackerService = inject(TrackerService);
  private cdr = inject(ChangeDetectorRef);

  profilePictureUrl: string | null = null;
  todayDate = '';
  isAdmin: boolean = false;
  currentUserAgentId: string | null = null;
  currentUserAgentCode: string | null = null;
  currentUserCommissionRate: number = 0;
  canViewCommissions: boolean = false;
  canViewAllCommissions: boolean = false;

  adminUsers: UserResponse[] = [];
  adminAgents: AgentResponse[] = [];
  adminCommissionRatesByAgentCode = new Map<string, number>();
  showMonthlyCommissionAmount: boolean = false;
  showCommissionBreakdown: boolean = false;
  monthlyCommissions: MonthlyCommissionDisplay[] = [];

  trackerConfiguration: TrackerConfigurationResponse | null = null;
  arrivalTrackerDefinitions: TrackerConfigurationDefinitionResponse[] = [];
  departureTrackerDefinitions: TrackerConfigurationDefinitionResponse[] = [];
  arrivalColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
  departureColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
  reservationTrackerResponsesByReservation = new Map<string, Map<string, ReservationTrackerResponse>>();
  reservationTrackerResponseOptionsByReservation = new Map<string, ReservationTrackerResponseOption[]>();
  propertyColumnDefinitionByOfficeByContext = new Map<TrackerContextType, Map<string, Map<number, TrackerConfigurationDefinitionResponse>>>();
  propertyDisplayedColumnsByContext = new Map<TrackerContextType, ColumnSet>();
  propertyTrackerResponsesByProperty = new Map<string, Map<string, PropertyTrackerResponse>>();
  propertyTrackerResponseOptionsByProperty = new Map<string, PropertyTrackerResponseOption[]>();

  reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[] = [];
  reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[] = [];
  pmOnlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  thirdPartyOnlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  directOnlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  pmOfflinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  thirdPartyOfflinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  directOfflinePropertyRows: DashboardPropertyTurnoverRow[] = [];

  expandedSections = { monthlyCommissions: true, properties: true, propertyTurnover: true, vacantProperties: true };
  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser', 'activeReservations', 'propertyMaintenanceList', 'trackerConfiguration']));
  isPageReady = false;
  trackerContextType = TrackerContextType;
  

  reservationTurnoverArrivalBaseColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '12ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    'contactName': { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    'companyName': { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    'arrivalDateDisplay': { displayAs: 'Arrival', maxWidth: '18ch', wrap: false, alignment: 'center' },
    'reservationStatusDisplay': { displayAs: 'Status', maxWidth: '16ch', wrap: false }
  };

  reservationTurnoverDepartureBaseColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '12ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    'contactName': { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    'companyName': { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    'departureDateDisplay': { displayAs: 'Departure', maxWidth: '18ch', wrap: false, alignment: 'center' },
    'reservationStatusDisplay': { displayAs: 'Status', maxWidth: '16ch', wrap: false },
  };

  propertyOnlineBaseColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableAfter': { displayAs: 'Online', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' },
  };

  propertyOfflineBaseColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableUntil': { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' },
  };

  reservationTurnoverArrivalDisplayedColumns: ColumnSet = this.cloneColumnSet(this.reservationTurnoverArrivalBaseColumns);
  reservationTurnoverDepartureDisplayedColumns: ColumnSet = this.cloneColumnSet(this.reservationTurnoverDepartureBaseColumns);

  propertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' , wrap: false},
    'bedrooms': { displayAs: 'Beds', maxWidth: '15h', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', maxWidth: '15ch', alignment: 'center' },
    'vacancyDaysDisplay': { displayAs: 'Days Vacant', maxWidth: '25ch', alignment: 'center' },
    'lastDepartureDate': { displayAs: 'Last Departure', maxWidth: '25ch', alignment: 'center' },
  };

  monthlyCommissionsDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '20ch', alignment: 'center' },
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    'daysRented': { displayAs: 'Days Rented', maxWidth: '18ch', alignment: 'center' },
    'commissionDisplay': { displayAs: 'Comm', maxWidth: '20ch', alignment: 'center' },
  };

markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  //#region Dashboard-Main
  override ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.setTodayDate();
    this.isAdmin = this.authService.isAdmin();
    this.canViewCommissions = this.authService.canViewCommissions();
    this.canViewAllCommissions = this.authService.isInAccounting();
    this.loadCurrentUser(this.authService.getUser()?.userId ?? '');

    if (this.canViewCommissions) {
      this.loadUsers();
      this.loadAgents();
    } 

    this.loadTrackerConfiguration();

    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeBackendData();
      this.markViewForCheck();
    });

    super.ngOnInit();
  }
  //#endregion

  //#region Main Data Setup & Saves
  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    void userAssignedId;
    this.buildPropertyTurnoverFromBaseLists();
    this.buildReservationTurnoverFromBaseLists();
    this.buildCommissionsList();
    this.markViewForCheck();
  }

  buildReservationTurnoverFromBaseLists(): void {
    const arrivalRows = this.arrivalReservations;
    arrivalRows.sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0));
    this.reservationTurnoverArrivalRows = arrivalRows.map(r =>
      this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r)
    );

    const departureRows = this.departureReservations;
    departureRows.sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0));
    this.reservationTurnoverDepartureRows = departureRows.map(r =>
      this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r)
    );

    this.applyReservationTrackerColumns();
    this.applyReservationTrackerValues();
    this.loadReservationTrackerResponses();
  }

  buildPropertyTurnoverFromBaseLists(): void {
    const onlineRows = [...this.onlineProperties]
      .filter(pm => pm.onlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableFromOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableFromOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));
    const offlineRows = [...this.offlineProperties]
      .filter(pm => pm.offlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableUntilOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableUntilOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));

    this.pmOnlinePropertyRows = this.filterRowsByLeaseType(onlineRows, PropertyLeaseType.PropertyManagement);
    this.thirdPartyOnlinePropertyRows = this.filterRowsByLeaseType(onlineRows, PropertyLeaseType.ThirdParty);
    this.directOnlinePropertyRows = this.filterRowsByLeaseType(onlineRows, PropertyLeaseType.Direct);
    this.pmOfflinePropertyRows = this.filterRowsByLeaseType(offlineRows, PropertyLeaseType.PropertyManagement);
    this.thirdPartyOfflinePropertyRows = this.filterRowsByLeaseType(offlineRows, PropertyLeaseType.ThirdParty);
    this.directOfflinePropertyRows = this.filterRowsByLeaseType(offlineRows, PropertyLeaseType.Direct);

    this.applyPropertyTrackerColumns();
    this.applyPropertyTrackerValues();
    this.loadPropertyTrackerResponses();
  }

  rebuildPropertyTurnoverIncludingIncompleteTrackers(): void {
    const onlineBaseRows = [...this.onlineProperties]
      .filter(pm => pm.onlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableFromOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableFromOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));
    const offlineBaseRows = [...this.offlineProperties]
      .filter(pm => pm.offlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableUntilOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableUntilOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));

    this.pmOnlinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(onlineBaseRows, PropertyLeaseType.PropertyManagement),
      TrackerContextType.PropertyOnline
    );
    this.thirdPartyOnlinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(onlineBaseRows, PropertyLeaseType.ThirdParty),
      TrackerContextType.PropertyThirdPartyOnline
    );
    this.directOnlinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(onlineBaseRows, PropertyLeaseType.Direct),
      TrackerContextType.PropertyDirectOnline
    );
    this.pmOfflinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(offlineBaseRows, PropertyLeaseType.PropertyManagement),
      TrackerContextType.PropertyOffline
    );
    this.thirdPartyOfflinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(offlineBaseRows, PropertyLeaseType.ThirdParty),
      TrackerContextType.PropertyThirdPartyOffline
    );
    this.directOfflinePropertyRows = this.addIncompleteTrackerProperties(
      this.filterRowsByLeaseType(offlineBaseRows, PropertyLeaseType.Direct),
      TrackerContextType.PropertyDirectOffline
    );

    this.applyPropertyTrackerColumns();
    this.applyPropertyTrackerValues();
  }

  buildCommissionsList(): void {
    if (!this.canViewCommissions) {
      return;
    }

    if (this.canViewAllCommissions) {
      const pending = this.itemsToLoad$.value;
      if (pending.has('users') || pending.has('agents')) {
        return;
      }
    }

    const agentCodeByAgentId = new Map<string, string>();
    this.adminAgents.forEach(agent => {
      if (agent.agentId && agent.agentCode) {
        agentCodeByAgentId.set(agent.agentId, agent.agentCode.trim().toLowerCase());
      }
    });

    this.adminCommissionRatesByAgentCode.clear();
    this.adminUsers.forEach(user => {
      if (!user.agentId) {
        return;
      }
      const agentCode = agentCodeByAgentId.get(user.agentId);
      if (!agentCode) {
        return;
      }
      this.adminCommissionRatesByAgentCode.set(agentCode, Number(user.commissionRate ?? 0));
    });

    this.resolveCurrentAgentAndFilter();
  }

  async saveReservationTrackerCheckbox(
    reservationId: string,
    trackerDefinition: TrackerConfigurationDefinitionResponse,
    isChecked: boolean
  ): Promise<void> {
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
      const existingOptions = this.reservationTrackerResponseOptionsByReservation.get(reservationKey) || [];
      this.reservationTrackerResponseOptionsByReservation.set(
        reservationKey,
        existingOptions.filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey)
      );
    }
  }

  async saveReservationTrackerMultiSelect(
    reservationId: string,
    trackerDefinition: TrackerConfigurationDefinitionResponse,
    selectedLabels: string[]
  ): Promise<void> {
    const reservationKey = this.utilityService.normalizeId(reservationId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.reservationTrackerResponsesByReservation.get(reservationKey) || new Map<string, ReservationTrackerResponse>();
    this.reservationTrackerResponsesByReservation.set(reservationKey, byDefinitionId);
    const optionResponses = this.reservationTrackerResponseOptionsByReservation.get(reservationKey) || [];

    const optionById = new Map(
      (trackerDefinition.options || []).map(option => [this.utilityService.normalizeId(option.trackerDefinitionOptionId), option] as const)
    );
    const optionIdByLabel = new Map(
      (trackerDefinition.options || []).map(option => [option.label, this.utilityService.normalizeId(option.trackerDefinitionOptionId)] as const)
    );

    const selectedOptionIds = new Set(
      selectedLabels.map(label => optionIdByLabel.get(label) || '').filter(optionId => !!optionId)
    );

    const existing = byDefinitionId.get(definitionKey) || null;
    let trackerResponse = existing;
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

    const responseOptionList = optionResponses.filter(option =>
      this.utilityService.normalizeId(option.trackerDefinitionId) === definitionKey
    );
    const existingOptionIds = new Set(responseOptionList.map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId)));

    const toAdd = Array.from(selectedOptionIds).filter(optionId => !existingOptionIds.has(optionId));
    const toRemove = Array.from(existingOptionIds).filter(optionId => !selectedOptionIds.has(optionId));

    for (const optionId of toAdd) {
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

    for (const optionId of toRemove) {
      const option = responseOptionList.find(item => this.utilityService.normalizeId(item.trackerDefinitionOptionId) === optionId);
      if (!option) {
        continue;
      }
      await firstValueFrom(this.reservationService.deleteReservationTrackerResponseOption(option.trackerResponseId, option.trackerDefinitionOptionId));
    }

    const remainingOptions = optionResponses.filter(option => {
      if (this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey) {
        return true;
      }
      const optionId = this.utilityService.normalizeId(option.trackerDefinitionOptionId);
      return selectedOptionIds.has(optionId);
    });
    this.reservationTrackerResponseOptionsByReservation.set(reservationKey, remainingOptions);

    if (selectedOptionIds.size === 0 && trackerResponse.trackerResponseId) {
      await firstValueFrom(this.reservationService.deleteReservationTrackerResponse(trackerResponse.trackerResponseId));
      byDefinitionId.delete(definitionKey);
    }
  }

  async savePropertyTrackerCheckbox(
    propertyId: string,
    trackerDefinition: TrackerConfigurationDefinitionResponse,
    isChecked: boolean
  ): Promise<void> {
    const propertyKey = this.utilityService.normalizeId(propertyId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
    this.propertyTrackerResponsesByProperty.set(propertyKey, byDefinitionId);

    const existing = byDefinitionId.get(definitionKey) || null;
    if (isChecked) {
      const request: PropertyTrackerResponseRequest = {
        trackerResponseId: existing?.trackerResponseId,
        trackerDefinitionId: trackerDefinition.trackerDefinitionId,
        propertyId: propertyId,
        isChecked: true,
        checkedOn: new Date().toISOString(),
        checkedBy: this.authService.getUser()?.userId ?? null
      };

      const saved = existing
        ? await firstValueFrom(this.propertyService.updatePropertyTrackerResponse(request))
        : await firstValueFrom(this.propertyService.createPropertyTrackerResponse(request));
      byDefinitionId.set(definitionKey, saved);
      return;
    }

    if (existing?.trackerResponseId) {
      await firstValueFrom(this.propertyService.deletePropertyTrackerResponse(existing.trackerResponseId));
      byDefinitionId.delete(definitionKey);
      const existingOptions = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];
      this.propertyTrackerResponseOptionsByProperty.set(
        propertyKey,
        existingOptions.filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey)
      );
    }
  }

  async savePropertyTrackerMultiSelect(
    propertyId: string,
    trackerDefinition: TrackerConfigurationDefinitionResponse,
    selectedLabels: string[]
  ): Promise<void> {
    const propertyKey = this.utilityService.normalizeId(propertyId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
    this.propertyTrackerResponsesByProperty.set(propertyKey, byDefinitionId);
    const optionResponses = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];

    const optionById = new Map(
      (trackerDefinition.options || []).map(option => [this.utilityService.normalizeId(option.trackerDefinitionOptionId), option] as const)
    );
    const optionIdByLabel = new Map(
      (trackerDefinition.options || []).map(option => [option.label, this.utilityService.normalizeId(option.trackerDefinitionOptionId)] as const)
    );
    const selectedOptionIds = new Set(
      selectedLabels.map(label => optionIdByLabel.get(label) || '').filter(optionId => !!optionId)
    );

    const existing = byDefinitionId.get(definitionKey) || null;
    let trackerResponse = existing;
    if (!trackerResponse && selectedOptionIds.size > 0) {
      trackerResponse = await firstValueFrom(this.propertyService.createPropertyTrackerResponse({
        trackerDefinitionId: trackerDefinition.trackerDefinitionId,
        propertyId: propertyId,
        isChecked: true,
        checkedOn: new Date().toISOString(),
        checkedBy: this.authService.getUser()?.userId ?? null
      }));
      byDefinitionId.set(definitionKey, trackerResponse);
    }

    if (!trackerResponse) {
      return;
    }

    const responseOptionList = optionResponses.filter(option =>
      this.utilityService.normalizeId(option.trackerDefinitionId) === definitionKey
    );
    const existingOptionIds = new Set(responseOptionList.map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId)));
    const toAdd = Array.from(selectedOptionIds).filter(optionId => !existingOptionIds.has(optionId));
    const toRemove = Array.from(existingOptionIds).filter(optionId => !selectedOptionIds.has(optionId));

    for (const optionId of toAdd) {
      const option = optionById.get(optionId);
      if (!option) {
        continue;
      }
      const created = await firstValueFrom(this.propertyService.createPropertyTrackerResponseOption({
        trackerResponseId: trackerResponse.trackerResponseId,
        trackerDefinitionOptionId: option.trackerDefinitionOptionId
      } as PropertyTrackerResponseOptionRequest));
      optionResponses.push(created);
    }

    for (const optionId of toRemove) {
      const option = responseOptionList.find(item => this.utilityService.normalizeId(item.trackerDefinitionOptionId) === optionId);
      if (!option) {
        continue;
      }
      await firstValueFrom(this.propertyService.deletePropertyTrackerResponseOption(option.trackerResponseId, option.trackerDefinitionOptionId));
    }

    const remainingOptions = optionResponses.filter(option => {
      if (this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey) {
        return true;
      }
      const optionId = this.utilityService.normalizeId(option.trackerDefinitionOptionId);
      return selectedOptionIds.has(optionId);
    });
    this.propertyTrackerResponseOptionsByProperty.set(propertyKey, remainingOptions);

    if (selectedOptionIds.size === 0 && trackerResponse.trackerResponseId) {
      await firstValueFrom(this.propertyService.deletePropertyTrackerResponse(trackerResponse.trackerResponseId));
      byDefinitionId.delete(definitionKey);
    }
  }
  //#endregion

  //#region Titlebar Methods
  setTodayDate(): void {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    this.todayDate = new Date().toLocaleDateString('en-US', options);
  }

  getFullName(): string {
    if (!this.user) {
      return '';
    }
    return `${this.user.firstName} ${this.user.lastName}`.trim();
  }

  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails?.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
      return;
    }
    this.profilePictureUrl = userResponse.profilePath || null;
  }

  loadCurrentUser(userId: string | undefined): void {
    if (!userId?.trim()) {
      this.currentUserAgentId = null;
      this.currentUserCommissionRate = 0;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser');
      this.resolveCurrentAgentAndFilter();
      this.markViewForCheck();
      return;
    }

    this.userService.getUserByGuid(userId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser');
      this.resolveCurrentAgentAndFilter();
      this.markViewForCheck();
    })).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        this.currentUserAgentId = this.utilityService.normalizeIdOrNull(userResponse.agentId);
        this.currentUserCommissionRate = Number(userResponse.commissionRate ?? 0);
        this.markViewForCheck();
      },
      error: () => {
        this.profilePictureUrl = null;
        this.currentUserAgentId = null;
        this.currentUserCommissionRate = 0;
        this.markViewForCheck();
      }
    });
  }

  @HostListener('document:mouseup')
  onDocumentMouseup(): void {
    setTimeout(() => {
      this.endCommissionPreview();
      this.markViewForCheck();
    });
  }

  @HostListener('document:touchend')
  onDocumentTouchend(): void {
    setTimeout(() => {
      this.endCommissionPreview();
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Commissions
  resolveCurrentAgentAndFilter(): void {
    if (!this.canViewCommissions) {
      this.currentUserAgentCode = null;
      this.monthlyCommissions = [];
      return;
    }

    if (this.canViewAllCommissions) {
      this.currentUserAgentCode = 'ALL';
      this.getCommissions();
      return;
    }

    if (!this.currentUserAgentId || Number(this.currentUserCommissionRate) <= 0) {
      this.currentUserAgentCode = null;
      this.monthlyCommissions = [];
      return;
    }

    if (this.adminAgents.length === 0) {
      return;
    }

    const assignedAgent = this.adminAgents.find(agent => agent.agentId === this.currentUserAgentId) || null;
    this.currentUserAgentCode = assignedAgent?.agentCode?.trim() ?? null;
    this.getCommissions();
  }

  get showCommissionsUi(): boolean {
    return this.canViewCommissions;
  }

  getCommissions(): void {
    if (!this.showCommissionsUi) {
      this.monthlyCommissions = [];
      return;
    }

    const commissionMonth = this.getCommissionMonthReferenceDate();
    const monthLo = this.getMonthStartAsOrdinal(commissionMonth)!;
    const monthHi = this.getMonthEndAsOrdinal(commissionMonth)!;
    const daysInMonth = monthHi % 100;

    const overlapsCurrentMonth = (a: number, d: number) => a <= monthHi && d >= monthLo;

    const getDaysRentedInCurrentMonth = (arrivalOrdinal: number, departureOrdinal: number, billingTypeId?: number | null): number => {
      const overlapStart = Math.max(arrivalOrdinal, monthLo);
      const overlapEnd = Math.min(departureOrdinal, monthHi);
      if (overlapStart > overlapEnd) return 0;
      const span = this.toJulianDay(overlapEnd) - this.toJulianDay(overlapStart);
      return billingTypeId === BillingType.Nightly ? span : span + 1;
    };

    const resolveCommissionRate = (row: { agentCode?: string | null }): number => this.canViewAllCommissions
      ? Number(this.adminCommissionRatesByAgentCode.get((row.agentCode || '').trim().toLowerCase()) ?? 0)
      : Number(this.currentUserCommissionRate ?? 0);

    const getCommission = (daysRented: number, rate: number): number => daysRented >= 30 || daysRented === daysInMonth
        ? Number(rate.toFixed(2))
        : Number(((rate / 30) * daysRented).toFixed(2));

    const agentCode = (this.currentUserAgentCode || '').trim().toLowerCase();

    this.monthlyCommissions = this.filteredReservationPropertyMaintenanceList
      .filter(row => this.canViewAllCommissions ? (row.agentCode || '').trim().length > 0 : (row.agentCode || '').trim().toLowerCase() === agentCode)
      .filter(row => resolveCommissionRate(row) > 0)
      .filter(row => overlapsCurrentMonth(row.arrivalDateOrdinal!, row.departureDateOrdinal!))
      .sort((a, b) =>
        (a.agentCode || '').localeCompare(b.agentCode || '') ||
        ((a.arrivalDateOrdinal || 0) - (b.arrivalDateOrdinal || 0)) ||
        (a.reservationCode || '').localeCompare(b.reservationCode || '')
      )
      .map(row => {
        const daysRented = getDaysRentedInCurrentMonth(row.arrivalDateOrdinal!, row.departureDateOrdinal!, row.billingTypeId);
        const commission = getCommission(daysRented, resolveCommissionRate(row));
        return {
          ...(row as unknown as MonthlyCommissionDisplay),
          daysRented,
          commission,
          commissionDisplay: this.formatUsd(commission)
        };
      })
      .filter(row => row.commission > 0)
      ;
  }

  getMonthlyCommissionTotal(): number {
    return this.monthlyCommissions.reduce((total, reservation) => total + (reservation.commission || 0), 0);
  }

  getCurrentMonthDisplay(): string {
    return this.getCommissionMonthReferenceDate().toLocaleDateString('en-US', { month: 'long' });
  }

  getCommissionMonthReferenceDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  getMonthlyCommissionTileRows(): MonthlyCommissionTileRow[] {
    const totalsByAgent = new Map<string, number>();
    this.monthlyCommissions.forEach(reservation => {
      const code = (reservation.agentCode || '').trim() || 'No Agent';
      totalsByAgent.set(code, (totalsByAgent.get(code) || 0) + (reservation.commission || 0));
    });

    return Array.from(totalsByAgent.entries())
      .map(([agentCode, amount]) => ({ agentCode, amount }))
      .sort((a, b) => a.agentCode.localeCompare(b.agentCode));
  }

  getCommissionAmountDisplay(amount: number): string {
    if (amount > 0 && !this.showMonthlyCommissionAmount) {
      return '$******';
    }
    return this.formatUsd(amount);
  }

  formatUsd(amount: number): string {
    return this.formatterService.currencyUsd(amount);
  }

  onCommissionPreviewMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (!this.showCommissionsUi || !this.canViewAllCommissions || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    event.preventDefault();
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  onCommissionPreviewTouchStart(event: TouchEvent): void {
    void event;
    if (!this.showCommissionsUi || !this.canViewAllCommissions || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  endCommissionPreview(): void {
    this.showMonthlyCommissionAmount = false;
    this.showCommissionBreakdown = false;
  }
  //#endregion

  //#region Data Loading Methods
  loadUsers(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'users');
    this.userService.getUsers().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users');
      this.buildCommissionsList();
      this.markViewForCheck();
    })).subscribe({
      next: (users: UserResponse[]) => {
        this.adminUsers = users || [];
        this.markViewForCheck();
      },
      error: () => {
        this.adminUsers = [];
        this.markViewForCheck();
      }
    });
  }

  loadAgents(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'agents');
    this.agentService.getAgents().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents');
      this.buildCommissionsList();
      this.markViewForCheck();
    })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.adminAgents = agents || [];
        this.markViewForCheck();
      },
      error: () => {
        this.adminAgents = [];
        this.markViewForCheck();
      }
    });
  }

  loadTrackerConfiguration(): void {
    this.trackerService.getTrackerConfiguration(false).pipe(
      takeUntil(this.destroy$),
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'trackerConfiguration'))
    ).subscribe({
      next: (response: TrackerConfigurationResponse) => {
        this.trackerConfiguration = response || null;
        this.applyReservationTrackerColumns();
        this.applyReservationTrackerValues();
        this.applyPropertyTrackerColumns();
        this.applyPropertyTrackerValues();
        this.loadReservationTrackerResponses();
        this.loadPropertyTrackerResponses();
        this.markViewForCheck();
      },
      error: () => {
        this.trackerConfiguration = null;
        this.applyReservationTrackerColumns();
        this.applyPropertyTrackerColumns();
        this.markViewForCheck();
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
      this.markViewForCheck();
    });
  }

  loadPropertyTrackerResponses(): void {
    const candidatePropertyIds = this.getPropertyTrackingCandidateIds();
    const propertyIds = Array.from(candidatePropertyIds);

    if (propertyIds.length === 0) {
      this.propertyTrackerResponsesByProperty.clear();
      this.propertyTrackerResponseOptionsByProperty.clear();
      this.rebuildPropertyTurnoverIncludingIncompleteTrackers();
      return;
    }

    this.propertyService.getPropertyTrackerResponsesByOffices(false).pipe(
      concatMap(responses =>
        this.propertyService.getPropertyTrackerResponseOptionsByOffices(false).pipe(
          map(options => ({ responses: responses || [], options: options || [] })),
          catchError(() => of({ responses: responses || [], options: [] as PropertyTrackerResponseOption[] }))
        )
      ),
      catchError(() => of({ responses: [] as PropertyTrackerResponse[], options: [] as PropertyTrackerResponseOption[] })),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.propertyTrackerResponsesByProperty.clear();
      this.propertyTrackerResponseOptionsByProperty.clear();

      result.responses.forEach(response => {
        const propertyKey = this.utilityService.normalizeId(response.propertyId);
        if (!candidatePropertyIds.has(propertyKey)) {
          return;
        }

        const byDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
        byDefinitionId.set(this.utilityService.normalizeId(response.trackerDefinitionId), response);
        this.propertyTrackerResponsesByProperty.set(propertyKey, byDefinitionId);
      });

      result.options.forEach(option => {
        const propertyKey = this.utilityService.normalizeId(option.propertyId);
        if (!candidatePropertyIds.has(propertyKey)) {
          return;
        }

        const existingOptions = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];
        existingOptions.push(option);
        this.propertyTrackerResponseOptionsByProperty.set(propertyKey, existingOptions);
      });
      this.rebuildPropertyTurnoverIncludingIncompleteTrackers();
      this.markViewForCheck();
    });
  }
  //#endregion
  
  //#region Routing Methods
  goToReservation(event: ReservationListDisplay): void {
    if (!event.reservationId) {
      if (event.propertyId) {
        this.goToProperty({ propertyId: event.propertyId });
      }
      return;
    }
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    this.router.navigateByUrl(url);
  }

  goToContact(event: ReservationListDisplay): void {
    if (event.contactId) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  goToProperty(event: { propertyId: string }): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]);
    this.router.navigateByUrl(url);
  }

  onReservationTurnoverRowNavigate(row: ReservationTurnoverEventDisplay): void {
    if (row.reservationId?.trim()) {
      this.goToReservation({ reservationId: row.reservationId, propertyId: row.propertyId } as ReservationListDisplay);
      return;
    }
    this.goToProperty({ propertyId: row.propertyId });
  }

  onReservationTurnoverContactNavigate(row: ReservationTurnoverEventDisplay): void {
    if (!row.contactId?.trim()) {
      return;
    }
    this.goToContact({ contactId: row.contactId } as ReservationListDisplay);
  }
  //#endregion

  //#region Form Response Methods
  onReservationTurnoverCheckboxChange(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const ext = event as ReservationTurnoverEventDisplay & {
      __changedCheckboxColumn?: string;
      __previousCheckboxValue?: boolean;
      __checkboxValue?: boolean;
    };
    const column = ext.__changedCheckboxColumn;
    if (!column) {
      return;
    }

    const reservationId = (event.reservationId || '').trim();
    const previousValue = ext.__previousCheckboxValue === true;
    const nextValue = ext.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    if (!reservationId) {
      (event as unknown as Record<string, boolean>)[column] = previousValue;
      return;
    }

    const trackerDefinition = this.getTrackerDefinitionForRow(sourceContext, column, event.officeId);
    if (!trackerDefinition) {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, previousValue);
      return;
    }

    void this.saveReservationTrackerCheckbox(reservationId, trackerDefinition, nextValue).then(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, nextValue);
      this.toastr.success('Tracker updated.', CommonMessage.Success);
      this.markViewForCheck();
    }).catch(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, previousValue);
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
      this.markViewForCheck();
    });
  }

  applyReservationTurnoverCheckboxValue(reservationId: string, column: string, value: boolean): void {
    const apply = (rows: ReservationTurnoverEventDisplay[]): ReservationTurnoverEventDisplay[] =>
      rows.map(row =>
        (row.reservationId || '').trim() === reservationId ? { ...row, [column]: value } : row
      );
    this.reservationTurnoverArrivalRows = apply(this.reservationTurnoverArrivalRows);
    this.reservationTurnoverDepartureRows = apply(this.reservationTurnoverDepartureRows);
  }

  onReservationTurnoverDropdownChange(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
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
      this.toastr.success('Tracker updated.', CommonMessage.Success);
      this.markViewForCheck();
    }).catch(() => {
      this.applyReservationTrackerValues();
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
      this.markViewForCheck();
    });
  }

  onReservationTurnoverClearTracking(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const definitionMap = sourceContext === 'arrival'
      ? this.arrivalColumnDefinitionByOffice
      : this.departureColumnDefinitionByOffice;
    const definitions = this.getTrackerDefinitionsForOffice(definitionMap, event.officeId);
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
        this.toastr.success('Tracking cleared.', CommonMessage.Success);
        this.markViewForCheck();
      } catch {
        this.applyReservationTrackerValues();
        this.toastr.error('Unable to clear tracking.', CommonMessage.Error);
        this.markViewForCheck();
      }
    })();
  }

  onReservationTurnoverCheckAllTracking(event: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const definitionMap = sourceContext === 'arrival'
      ? this.arrivalColumnDefinitionByOffice
      : this.departureColumnDefinitionByOffice;
    const definitions = this.getTrackerDefinitionsForOffice(definitionMap, event.officeId);
    if (definitions.length === 0) {
      return;
    }

    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            const selectedLabels = (definition.options || [])
              .map(option => (option.label || '').trim())
              .filter(label => !!label);
            await this.saveReservationTrackerMultiSelect(reservationId, definition, selectedLabels);
            continue;
          }
          await this.saveReservationTrackerCheckbox(reservationId, definition, true);
        }
        this.applyReservationTrackerValues();
        this.toastr.success('Tracking marked complete.', CommonMessage.Success);
        this.markViewForCheck();
      } catch {
        this.applyReservationTrackerValues();
        this.toastr.error('Unable to update all tracker checks.', CommonMessage.Error);
        this.markViewForCheck();
      }
    })();
  }

  onPropertyTurnoverCheckboxChange(event: DashboardPropertyTurnoverRow, contextType: TrackerContextType): void {
    const ext = event as DashboardPropertyTurnoverRow & {
      __changedCheckboxColumn?: string;
      __previousCheckboxValue?: boolean;
      __checkboxValue?: boolean;
    };
    const column = ext.__changedCheckboxColumn;
    if (!column) {
      return;
    }

    const propertyId = (event.propertyId || '').trim();
    const previousValue = ext.__previousCheckboxValue === true;
    const nextValue = ext.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    if (!propertyId) {
      (event as unknown as Record<string, boolean>)[column] = previousValue;
      return;
    }

    const trackerDefinition = this.getPropertyTrackerDefinitionForRow(contextType, column, event.officeId);
    if (!trackerDefinition) {
      this.applyPropertyTurnoverCheckboxValue(propertyId, column, previousValue);
      return;
    }

    void this.savePropertyTrackerCheckbox(propertyId, trackerDefinition, nextValue)
      .then(() => {
        this.applyPropertyTurnoverCheckboxValue(propertyId, column, nextValue);
        return this.tryCompletePropertyTracking(propertyId, event.officeId, contextType);
      })
      .then(completed => {
        if (completed) {
          this.toastr.success('Tracking marked complete.', CommonMessage.Success);
          this.markViewForCheck();
          return;
        }
        this.applyPropertyTrackerValues();
        this.toastr.success('Tracker updated.', CommonMessage.Success);
        this.markViewForCheck();
      })
      .catch(() => {
        this.applyPropertyTurnoverCheckboxValue(propertyId, column, previousValue);
        this.toastr.error('Unable to update tracker.', CommonMessage.Error);
        this.markViewForCheck();
      });
  }

  applyPropertyTurnoverCheckboxValue(propertyId: string, column: string, value: boolean): void {
    const apply = (rows: DashboardPropertyTurnoverRow[]): DashboardPropertyTurnoverRow[] =>
      rows.map(row =>
        (row.propertyId || '').trim() === propertyId ? { ...row, [column]: value } : row
      );
    this.pmOnlinePropertyRows = apply(this.pmOnlinePropertyRows);
    this.thirdPartyOnlinePropertyRows = apply(this.thirdPartyOnlinePropertyRows);
    this.directOnlinePropertyRows = apply(this.directOnlinePropertyRows);
    this.pmOfflinePropertyRows = apply(this.pmOfflinePropertyRows);
    this.thirdPartyOfflinePropertyRows = apply(this.thirdPartyOfflinePropertyRows);
    this.directOfflinePropertyRows = apply(this.directOfflinePropertyRows);
  }

  onPropertyTurnoverDropdownChange(event: DashboardPropertyTurnoverRow, contextType: TrackerContextType): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (!changedColumn) {
      return;
    }
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    const trackerDefinition = this.getPropertyTrackerDefinitionForRow(contextType, changedColumn, event.officeId);
    if (!trackerDefinition || !this.isTrackerDefinitionMultiSelect(trackerDefinition)) {
      return;
    }
    const selectedLabels = this.readMultiSelectLabels(event, changedColumn);
    void this.savePropertyTrackerMultiSelect(propertyId, trackerDefinition, selectedLabels)
      .then(() => this.tryCompletePropertyTracking(propertyId, event.officeId, contextType))
      .then(completed => {
        if (completed) {
          this.toastr.success('Tracking marked complete.', CommonMessage.Success);
          this.markViewForCheck();
          return;
        }
        this.applyPropertyTrackerValues();
        this.toastr.success('Tracker updated.', CommonMessage.Success);
        this.markViewForCheck();
      })
      .catch(() => {
        this.applyPropertyTrackerValues();
        this.toastr.error('Unable to update tracker.', CommonMessage.Error);
        this.markViewForCheck();
      });
  }

  onPropertyTurnoverClearTracking(event: DashboardPropertyTurnoverRow, contextType: TrackerContextType): void {
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    const isOnlineContext = this.isOnlinePropertyContext(contextType);

    void (async () => {
      try {
        await this.propertyService.updateModifiedProperty(propertyId, isOnlineContext ? { onlineChecked: false } : { offlineChecked: false });
        await firstValueFrom(this.propertyService.deletePropertyTrackerResponsesByPropertyId(propertyId));
        const propertyKey = this.utilityService.normalizeId(propertyId);
        this.propertyTrackerResponsesByProperty.delete(propertyKey);
        this.propertyTrackerResponseOptionsByProperty.delete(propertyKey);
        this.applyPropertyCompletionFlag(propertyId, isOnlineContext, false);
        this.rebuildPropertyTurnoverIncludingIncompleteTrackers();
        this.toastr.success('Tracking cleared.', CommonMessage.Success);
        this.markViewForCheck();
      } catch {
        this.rebuildPropertyTurnoverIncludingIncompleteTrackers();
        this.toastr.error('Unable to clear tracking.', CommonMessage.Error);
        this.markViewForCheck();
      }
    })();
  }

  onPropertyTurnoverCheckAllTracking(event: DashboardPropertyTurnoverRow, contextType: TrackerContextType): void {
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }

    const mapByColumn = this.propertyColumnDefinitionByOfficeByContext.get(contextType)
      || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    const definitions = this.getTrackerDefinitionsForOffice(mapByColumn, event.officeId);
    if (definitions.length === 0) {
      return;
    }

    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            const selectedLabels = (definition.options || [])
              .map(option => (option.label || '').trim())
              .filter(label => !!label);
            await this.savePropertyTrackerMultiSelect(propertyId, definition, selectedLabels);
            continue;
          }
          await this.savePropertyTrackerCheckbox(propertyId, definition, true);
        }
        const completed = await this.tryCompletePropertyTracking(propertyId, event.officeId, contextType);
        if (completed) {
          this.toastr.success('Tracking marked complete.', CommonMessage.Success);
          this.markViewForCheck();
          return;
        }
        this.applyPropertyTrackerValues();
        this.toastr.success('Tracking marked complete.', CommonMessage.Success);
        this.markViewForCheck();
      } catch {
        this.applyPropertyTrackerValues();
        this.toastr.error('Unable to update all tracker checks.', CommonMessage.Error);
        this.markViewForCheck();
      }
    })();
  }
  //#endregion

  //#region Tracker Methods
  applyReservationTrackerColumns(): void {
    const visibleOfficeIds = new Set<number>([
      ...this.reservationTurnoverArrivalRows.map(row => row.officeId),
      ...this.reservationTurnoverDepartureRows.map(row => row.officeId)
    ].filter(officeId => officeId > 0));
    this.arrivalTrackerDefinitions = this.getTrackerDefinitionsForContext(TrackerContextType.ReservationArrival, false)
      .filter(definition => visibleOfficeIds.size === 0 || visibleOfficeIds.has(definition.officeId));
    this.departureTrackerDefinitions = this.getTrackerDefinitionsForContext(TrackerContextType.ReservationDeparture, false)
      .filter(definition => visibleOfficeIds.size === 0 || visibleOfficeIds.has(definition.officeId));

    const arrivalBase: ColumnSet = this.cloneColumnSet(this.reservationTurnoverArrivalBaseColumns);
    const departureBase: ColumnSet = this.cloneColumnSet(this.reservationTurnoverDepartureBaseColumns);

    this.arrivalColumnDefinitionByOffice = this.buildColumnDefinitionByOffice(this.arrivalTrackerDefinitions);
    this.departureColumnDefinitionByOffice = this.buildColumnDefinitionByOffice(this.departureTrackerDefinitions);

    this.arrivalColumnDefinitionByOffice.forEach((definitionByOffice, columnName) => {
      const displayName = definitionByOffice.values().next().value?.displayName || '';
      const isMultiSelect = this.isTrackerColumnMultiSelect(definitionByOffice);
      arrivalBase[columnName] = {
        displayAs: displayName,
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
      const isMultiSelect = this.isTrackerColumnMultiSelect(definitionByOffice);
      departureBase[columnName] = {
        displayAs: displayName,
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

    this.reservationTurnoverArrivalDisplayedColumns = arrivalBase;
    this.reservationTurnoverDepartureDisplayedColumns = departureBase;
  }

  applyReservationTrackerValues(): void {
    this.reservationTurnoverArrivalRows = this.reservationTurnoverArrivalRows.map(row =>
      this.attachTrackerValuesToRow(row, TrackerContextType.ReservationArrival)
    );
    this.reservationTurnoverDepartureRows = this.reservationTurnoverDepartureRows.map(row =>
      this.attachTrackerValuesToRow(row, TrackerContextType.ReservationDeparture)
    );
  }

  applyPropertyTrackerColumns(): void {
    const visibleOfficeIds = new Set<number>(
      this.getAllPropertyTurnoverRows()
        .map(row => row.officeId)
        .filter(officeId => officeId > 0)
    );
    this.propertyColumnDefinitionByOfficeByContext.clear();
    this.propertyDisplayedColumnsByContext.clear();

    this.getPropertyTrackerContexts().forEach(contextType => {
      const definitions = this.getTrackerDefinitionsForContext(contextType, false)
        .filter(definition => visibleOfficeIds.size === 0 || visibleOfficeIds.has(definition.officeId));
      const baseColumns = this.cloneColumnSet(this.isOnlinePropertyContext(contextType) ? this.propertyOnlineBaseColumns : this.propertyOfflineBaseColumns);
      const definitionByOffice = this.buildColumnDefinitionByOffice(definitions);

      definitionByOffice.forEach((columnDefinitionByOffice, columnName) => {
        const displayName = columnDefinitionByOffice.values().next().value?.displayName || '';
        const isMultiSelect = this.isTrackerColumnMultiSelect(columnDefinitionByOffice);
        baseColumns[columnName] = {
          displayAs: displayName,
          isCheckbox: !isMultiSelect,
          isMultiSelect: isMultiSelect,
          checkboxEditable: true,
          sort: false,
          wrap: false,
          alignment: 'center',
          headerAlignment: 'center',
          maxWidth: '12ch'
        };
      });

      this.propertyColumnDefinitionByOfficeByContext.set(contextType, definitionByOffice);
      this.propertyDisplayedColumnsByContext.set(contextType, baseColumns);
    });
  }

  applyPropertyTrackerValues(): void {
    this.pmOnlinePropertyRows = this.pmOnlinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyOnline));
    this.thirdPartyOnlinePropertyRows = this.thirdPartyOnlinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyThirdPartyOnline));
    this.directOnlinePropertyRows = this.directOnlinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyDirectOnline));
    this.pmOfflinePropertyRows = this.pmOfflinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyOffline));
    this.thirdPartyOfflinePropertyRows = this.thirdPartyOfflinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyThirdPartyOffline));
    this.directOfflinePropertyRows = this.directOfflinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, TrackerContextType.PropertyDirectOffline));
  }

  attachTrackerValuesToRow(
    row: ReservationTurnoverEventDisplay,
    contextType: TrackerContextType
  ): ReservationTurnoverEventDisplay {
    const next = { ...row } as ReservationTurnoverEventDisplay & Record<string, unknown>;
    const responseByDefinitionId = this.reservationTrackerResponsesByReservation.get(this.utilityService.normalizeId(row.reservationId)) || new Map<string, ReservationTrackerResponse>();
    const optionResponses = this.reservationTrackerResponseOptionsByReservation.get(this.utilityService.normalizeId(row.reservationId)) || [];

    const byOffice = contextType === TrackerContextType.ReservationArrival
      ? this.arrivalColumnDefinitionByOffice
      : this.departureColumnDefinitionByOffice;
    byOffice.forEach((definitionByOffice, columnName) => {
      const definition = definitionByOffice.get(row.officeId);
      if (!definition) {
        next[columnName] = 'NONE';
        return;
      }
      if (this.isTrackerDefinitionMultiSelect(definition)) {
        next[columnName] = this.buildTrackerMultiSelectCell(definition, optionResponses, true);
        return;
      }
      const response = responseByDefinitionId.get(this.utilityService.normalizeId(definition.trackerDefinitionId));
      next[columnName] = response?.isChecked === true;
    });

    return next;
  }

  attachPropertyTrackerValuesToRow(
    row: DashboardPropertyTurnoverRow,
    contextType: TrackerContextType
  ): DashboardPropertyTurnoverRow {
    const next = { ...row } as DashboardPropertyTurnoverRow & Record<string, unknown>;
    const responseByDefinitionId = this.propertyTrackerResponsesByProperty.get(this.utilityService.normalizeId(row.propertyId)) || new Map<string, PropertyTrackerResponse>();
    const optionResponses = this.propertyTrackerResponseOptionsByProperty.get(this.utilityService.normalizeId(row.propertyId)) || [];

    const byOffice = this.propertyColumnDefinitionByOfficeByContext.get(contextType) || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    byOffice.forEach((definitionByOffice, columnName) => {
      const definition = definitionByOffice.get(row.officeId);
      if (!definition) {
        next[columnName] = 'NONE';
        return;
      }
      if (this.isTrackerDefinitionMultiSelect(definition)) {
        next[columnName] = this.buildTrackerMultiSelectCell(definition, optionResponses, false);
        return;
      }
      const response = responseByDefinitionId.get(this.utilityService.normalizeId(definition.trackerDefinitionId));
      next[columnName] = response?.isChecked === true;
    });

    return next;
  }

  getTrackerDefinitionsForContext(contextType: TrackerContextType, includeAllOffices: boolean = false): TrackerConfigurationDefinitionResponse[] {
    if (!this.trackerConfiguration?.contexts?.length) {
      return [];
    }

    const context = this.trackerConfiguration.contexts.find(c => Number(c.trackerContextId) === Number(contextType));
    if (!context?.definitions?.length) {
      return [];
    }

    return context.definitions
      .filter(definition => definition.isActive)
      .filter(definition => includeAllOffices || this.selectedOffice?.officeId == null || definition.officeId === this.selectedOffice.officeId)
      .sort((a, b) => {
        if (a.officeId !== b.officeId) return a.officeId - b.officeId;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.displayName.localeCompare(b.displayName);
      });
  }

  buildColumnDefinitionByOffice(definitions: TrackerConfigurationDefinitionResponse[]): Map<string, Map<number, TrackerConfigurationDefinitionResponse>> {
    const mapByColumn = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    definitions.forEach(definition => {
      const columnName = this.getTrackerColumnName(definition.displayName);
      if (!mapByColumn.has(columnName)) {
        mapByColumn.set(columnName, new Map<number, TrackerConfigurationDefinitionResponse>());
      }
      mapByColumn.get(columnName)!.set(definition.officeId, definition);
    });
    return mapByColumn;
  }

  getTrackerColumnName(displayName: string): string {
    const key = (displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `tracker_${key}`;
  }

  cloneColumnSet(columns: ColumnSet): ColumnSet {
    const cloned: ColumnSet = {};
    Object.keys(columns).forEach(key => {
      cloned[key] = { ...(columns[key] || {}) };
    });
    return cloned;
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

  readMultiSelectLabels(row: unknown, columnName: string): string[] {
    const rowValue = row as Record<string, unknown>;
    const cell = rowValue[columnName] as { value?: unknown } | undefined;
    const value = cell?.value;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(item => String(item ?? '').trim()).filter(label => !!label);
  }

  buildTrackerMultiSelectCell(
    definition: TrackerConfigurationDefinitionResponse,
    optionResponses: Array<ReservationTrackerResponseOption | PropertyTrackerResponseOption>,
    openLeft: boolean
  ): {
    value: string[];
    options: string[];
    optionsSelected: number;
    triggerText: string;
    isOverridable: boolean;
    isMultiSelect: boolean;
    multiSelectState: 'none' | 'partial' | 'all';
    panelClass: string[];
    toString: () => string
  } {
    const optionList = [...(definition.options || [])].sort((a, b) => {
      if ((a.optionSortOrder ?? 0) !== (b.optionSortOrder ?? 0)) {
        return (a.optionSortOrder ?? 0) - (b.optionSortOrder ?? 0);
      }
      return (a.label || '').localeCompare(b.label || '');
    });
    const selectedIds = new Set(
      optionResponses
        .filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) === this.utilityService.normalizeId(definition.trackerDefinitionId))
        .map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId))
    );
    const selectedLabels = optionList
      .filter(option => selectedIds.has(this.utilityService.normalizeId(option.trackerDefinitionOptionId)))
      .map(option => option.label);
    const selectedCount = selectedLabels.length;
    const totalCount = optionList.length;
    const multiSelectState: 'none' | 'partial' | 'all' = selectedCount === 0
      ? 'none'
      : selectedCount >= totalCount && totalCount > 0
        ? 'all'
        : 'partial';
    return {
      value: selectedLabels,
      options: optionList.map(option => option.label),
      optionsSelected: selectedCount,
      triggerText: selectedLabels.length > 0 ? `${selectedLabels.length} selected` : '',
      isOverridable: true,
      isMultiSelect: true,
      multiSelectState,
      panelClass: openLeft ? ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'] : ['datatable-dropdown-panel'],
      toString: () => selectedLabels.join(', ')
    };
  }

  getTrackerDefinitionForRow(
    sourceContext: 'arrival' | 'departure',
    columnName: string,
    officeId: number
  ): TrackerConfigurationDefinitionResponse | null {
    const mapByColumn = sourceContext === 'arrival'
      ? this.arrivalColumnDefinitionByOffice
      : this.departureColumnDefinitionByOffice;
    return mapByColumn.get(columnName)?.get(officeId) || null;
  }

  getPropertyTrackerDefinitionForRow(
    contextType: TrackerContextType,
    columnName: string,
    officeId: number
  ): TrackerConfigurationDefinitionResponse | null {
    const mapByColumn = this.propertyColumnDefinitionByOfficeByContext.get(contextType) || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    return mapByColumn.get(columnName)?.get(officeId) || null;
  }

  getTrackerDefinitionsForOffice(
    mapByColumn: Map<string, Map<number, TrackerConfigurationDefinitionResponse>>,
    officeId: number
  ): TrackerConfigurationDefinitionResponse[] {
    const definitionsById = new Map<string, TrackerConfigurationDefinitionResponse>();
    mapByColumn.forEach(byOffice => {
      const definition = byOffice.get(officeId);
      if (!definition) {
        return;
      }
      definitionsById.set(this.utilityService.normalizeId(definition.trackerDefinitionId), definition);
    });
    return Array.from(definitionsById.values());
  }

  getPropertyTrackerContexts(): TrackerContextType[] {
    return [
      TrackerContextType.PropertyOnline,
      TrackerContextType.PropertyThirdPartyOnline,
      TrackerContextType.PropertyDirectOnline,
      TrackerContextType.PropertyOffline,
      TrackerContextType.PropertyThirdPartyOffline,
      TrackerContextType.PropertyDirectOffline
    ];
  }

  isOnlinePropertyContext(contextType: TrackerContextType): boolean {
    return contextType === TrackerContextType.PropertyOnline
      || contextType === TrackerContextType.PropertyThirdPartyOnline
      || contextType === TrackerContextType.PropertyDirectOnline;
  }

  getAllPropertyTurnoverRows(): DashboardPropertyTurnoverRow[] {
    return [
      ...this.pmOnlinePropertyRows,
      ...this.thirdPartyOnlinePropertyRows,
      ...this.directOnlinePropertyRows,
      ...this.pmOfflinePropertyRows,
      ...this.thirdPartyOfflinePropertyRows,
      ...this.directOfflinePropertyRows
    ];
  }

  getPropertyTurnoverRowsByContext(contextType: TrackerContextType): DashboardPropertyTurnoverRow[] {
    switch (contextType) {
      case TrackerContextType.PropertyOnline:
        return this.pmOnlinePropertyRows;
      case TrackerContextType.PropertyThirdPartyOnline:
        return this.thirdPartyOnlinePropertyRows;
      case TrackerContextType.PropertyDirectOnline:
        return this.directOnlinePropertyRows;
      case TrackerContextType.PropertyOffline:
        return this.pmOfflinePropertyRows;
      case TrackerContextType.PropertyThirdPartyOffline:
        return this.thirdPartyOfflinePropertyRows;
      case TrackerContextType.PropertyDirectOffline:
        return this.directOfflinePropertyRows;
      default:
        return [];
    }
  }

  getPropertyDisplayedColumnsForContext(contextType: TrackerContextType): ColumnSet {
    return this.propertyDisplayedColumnsByContext.get(contextType)
      || this.cloneColumnSet(this.isOnlinePropertyContext(contextType) ? this.propertyOnlineBaseColumns : this.propertyOfflineBaseColumns);
  }

  hasPropertyTurnoverRows(): boolean {
    return this.getAllPropertyTurnoverRows().length > 0;
  }

  hasReservationTurnoverRows(): boolean {
    return this.reservationTurnoverArrivalRows.length > 0 || this.reservationTurnoverDepartureRows.length > 0;
  }

  shouldShowPropertySectionDivider(contextType: TrackerContextType): boolean {
    for (const priorContext of this.getPropertyTrackerContexts()) {
      if (priorContext === contextType) {
        break;
      }
      if (this.getPropertyTurnoverRowsByContext(priorContext).length > 0) {
        return true;
      }
    }
    return false;
  }

  getPropertySectionLabel(contextType: TrackerContextType): string {
    switch (contextType) {
      case TrackerContextType.PropertyOnline:
        return 'Properties Online (Next 15 Days)';
      case TrackerContextType.PropertyThirdPartyOnline:
        return '3rd Party Online (Next 15 Days)';
      case TrackerContextType.PropertyDirectOnline:
        return 'Direct Online (Next 15 Days)';
      case TrackerContextType.PropertyOffline:
        return 'Properties Offline (Next 15 Days)';
      case TrackerContextType.PropertyThirdPartyOffline:
        return '3rd Party Offline (Next 15 Days)';
      case TrackerContextType.PropertyDirectOffline:
        return 'Direct Offline (Next 15 Days)';
      default:
        return '';
    }
  }

  filterRowsByLeaseType(rows: DashboardPropertyTurnoverRow[], leaseType: PropertyLeaseType): DashboardPropertyTurnoverRow[] {
    return rows.filter(row => Number(row.propertyLeaseTypeId) === Number(leaseType));
  }

  isLeaseTypeMatchForContext(leaseTypeId: number, contextType: TrackerContextType): boolean {
    if (contextType === TrackerContextType.PropertyOnline || contextType === TrackerContextType.PropertyOffline) {
      return Number(leaseTypeId) === Number(PropertyLeaseType.PropertyManagement);
    }
    if (contextType === TrackerContextType.PropertyThirdPartyOnline || contextType === TrackerContextType.PropertyThirdPartyOffline) {
      return Number(leaseTypeId) === Number(PropertyLeaseType.ThirdParty);
    }
    if (contextType === TrackerContextType.PropertyDirectOnline || contextType === TrackerContextType.PropertyDirectOffline) {
      return Number(leaseTypeId) === Number(PropertyLeaseType.Direct);
    }
    return false;
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

  addIncompleteTrackerProperties(
    baseRows: DashboardPropertyTurnoverRow[],
    contextType: TrackerContextType
  ): DashboardPropertyTurnoverRow[] {
    const rows = [...baseRows];
    const includedPropertyIds = new Set(rows.map(row => this.utilityService.normalizeId(row.propertyId)));
    this.filteredPropertyMaintenanceList.forEach(pm => {
      const mappedRow = this.mapPropertyMaintenanceToDashboardTurnoverRow(pm);
      const propertyIdKey = this.utilityService.normalizeId(pm.propertyId);
      if (includedPropertyIds.has(propertyIdKey)) {
        return;
      }
      if (!this.isLeaseTypeMatchForContext(Number(mappedRow.propertyLeaseTypeId), contextType)) {
        return;
      }
      if (!this.isPropertyPastDueAndUnchecked(pm, contextType)) {
        return;
      }
      if (!this.hasIncompletePropertyTrackers(pm.propertyId, pm.officeId, contextType)) {
        return;
      }
      rows.push(mappedRow);
      includedPropertyIds.add(propertyIdKey);
    });
    return rows;
  }

  hasIncompletePropertyTrackers(propertyId: string, officeId: number, contextType: TrackerContextType): boolean {
    if (this.isPropertyContextMarkedComplete(propertyId, contextType)) {
      return false;
    }

    const definitions = this.getTrackerDefinitionsForContext(contextType, true)
      .filter(definition => definition.officeId === officeId);
    if (definitions.length === 0) {
      return false;
    }

    const propertyKey = this.utilityService.normalizeId(propertyId);
    const responsesByDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
    const optionResponses = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];

    for (const definition of definitions) {
      const definitionKey = this.utilityService.normalizeId(definition.trackerDefinitionId);
      const response = responsesByDefinitionId.get(definitionKey);
      if (!this.isTrackerDefinitionMultiSelect(definition)) {
        if (response?.isChecked !== true) {
          return true;
        }
        continue;
      }

      const expectedOptionCount = definition.options?.length ?? 0;
      if (expectedOptionCount <= 0) {
        if (response?.isChecked !== true) {
          return true;
        }
        continue;
      }

      const selectedOptionIds = new Set(
        optionResponses
          .filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) === definitionKey)
          .map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId))
      );
      if (selectedOptionIds.size < expectedOptionCount) {
        return true;
      }
    }

    return false;
  }

  isPropertyContextMarkedComplete(propertyId: string, contextType: TrackerContextType): boolean {
    const propertyKey = this.utilityService.normalizeId(propertyId);
    const isOnlineContext = this.isOnlinePropertyContext(contextType);
    const fromTurnoverRows = this.getAllPropertyTurnoverRows().find(row => this.utilityService.normalizeId(row.propertyId) === propertyKey);
    if (fromTurnoverRows) {
      return isOnlineContext ? fromTurnoverRows.onlineChecked === true : fromTurnoverRows.offlineChecked === true;
    }
    const fromMaintenance = this.filteredPropertyMaintenanceList.find(row => this.utilityService.normalizeId(row.propertyId) === propertyKey);
    if (!fromMaintenance) {
      return false;
    }
    return isOnlineContext ? fromMaintenance.onlineChecked === true : fromMaintenance.offlineChecked === true;
  }

  applyPropertyCompletionFlag(propertyId: string, isOnlineContext: boolean, value: boolean): void {
    const propertyKey = this.utilityService.normalizeId(propertyId);
    const completionField: 'onlineChecked' | 'offlineChecked' = isOnlineContext ? 'onlineChecked' : 'offlineChecked';
    const patchRows = (rows: DashboardPropertyTurnoverRow[]): DashboardPropertyTurnoverRow[] =>
      rows.map(row =>
        this.utilityService.normalizeId(row.propertyId) === propertyKey
          ? { ...row, [completionField]: value }
          : row
      );

    this.pmOnlinePropertyRows = patchRows(this.pmOnlinePropertyRows);
    this.thirdPartyOnlinePropertyRows = patchRows(this.thirdPartyOnlinePropertyRows);
    this.directOnlinePropertyRows = patchRows(this.directOnlinePropertyRows);
    this.pmOfflinePropertyRows = patchRows(this.pmOfflinePropertyRows);
    this.thirdPartyOfflinePropertyRows = patchRows(this.thirdPartyOfflinePropertyRows);
    this.directOfflinePropertyRows = patchRows(this.directOfflinePropertyRows);
    this.filteredPropertyMaintenanceList = this.filteredPropertyMaintenanceList.map(row =>
      this.utilityService.normalizeId(row.propertyId) === propertyKey
        ? { ...row, [completionField]: value }
        : row
    );
  }

  async tryCompletePropertyTracking(propertyId: string, officeId: number, contextType: TrackerContextType): Promise<boolean> {
    if (this.hasIncompletePropertyTrackers(propertyId, officeId, contextType)) {
      return false;
    }

    const isOnlineContext = this.isOnlinePropertyContext(contextType);
    await this.propertyService.updateModifiedProperty(propertyId, isOnlineContext ? { onlineChecked: true } : { offlineChecked: true });
    await firstValueFrom(this.propertyService.deletePropertyTrackerResponsesByPropertyId(propertyId));

    const propertyKey = this.utilityService.normalizeId(propertyId);
    this.propertyTrackerResponsesByProperty.delete(propertyKey);
    this.propertyTrackerResponseOptionsByProperty.delete(propertyKey);
    this.applyPropertyCompletionFlag(propertyId, isOnlineContext, true);
    this.rebuildPropertyTurnoverIncludingIncompleteTrackers();
    return true;
  }

  isOfflineDateExpired(pm: PropertyMaintenance): boolean {
    const offlineOrdinal = Number(pm.availableUntilOrdinal ?? 0);
    return offlineOrdinal > 0 && offlineOrdinal < this.todayDayOrdinal;
  }

  isOnlineDateExpired(pm: PropertyMaintenance): boolean {
    const onlineOrdinal = Number(pm.availableFromOrdinal ?? 0);
    return onlineOrdinal > 0 && onlineOrdinal < this.todayDayOrdinal;
  }

  isPropertyPastDueAndUnchecked(pm: PropertyMaintenance, contextType: TrackerContextType): boolean {
    if (this.isOnlinePropertyContext(contextType)) {
      return this.isOnlineDateExpired(pm) && pm.onlineChecked !== true;
    }
    return this.isOfflineDateExpired(pm) && pm.offlineChecked !== true;
  }

  getPropertyTrackingCandidateIds(): Set<string> {
    const ids = new Set<string>([
      ...this.onlineProperties
        .filter(pm => pm.onlineChecked !== true)
        .map(pm => this.utilityService.normalizeId(pm.propertyId)),
      ...this.offlineProperties
        .filter(pm => pm.offlineChecked !== true)
        .map(pm => this.utilityService.normalizeId(pm.propertyId))
    ].filter(id => !!id));

    this.filteredPropertyMaintenanceList.forEach(pm => {
      const propertyId = this.utilityService.normalizeId(pm.propertyId);
      if (!propertyId) {
        return;
      }
      if (this.isPropertyPastDueAndUnchecked(pm, TrackerContextType.PropertyOnline) || this.isPropertyPastDueAndUnchecked(pm, TrackerContextType.PropertyOffline)) {
        ids.add(propertyId);
      }
    });

    return ids;
  }
  //#endregion

  //#region Utility Methods
  getMonthStartAsOrdinal(referenceDate: Date): number | null {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const api = this.utilityService.formatDateOnlyForApi(monthStart);
    return api ? this.utilityService.parseCalendarDateToOrdinal(api) : null;
  }

  getMonthEndAsOrdinal(referenceDate: Date): number | null {
    const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    const api = this.utilityService.formatDateOnlyForApi(monthEnd);
    return api ? this.utilityService.parseCalendarDateToOrdinal(api) : null;
  }

  toJulianDay(ordinal: number): number {
    const year = Math.floor(ordinal / 10000);
    const month = Math.floor((ordinal % 10000) / 100);
    const day = ordinal % 100;
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }
  //#endregion
}
