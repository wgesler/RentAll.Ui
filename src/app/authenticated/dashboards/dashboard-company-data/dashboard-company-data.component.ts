import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, concatMap, filter, finalize, firstValueFrom, map, of, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MaintenanceListResponse, MaintenanceListUserDropdownCell } from '../../maintenance/models/maintenance.model';
import { AgentResponse } from '../../organizations/models/agent.model';
import { TrackerContextType } from '../../organizations/models/tracker-enum';
import { TrackerConfigurationDefinitionResponse, TrackerConfigurationResponse } from '../../organizations/models/tracker.model';
import { AgentService } from '../../organizations/services/agent.service';
import { TrackerService } from '../../organizations/services/tracker.service';
import { PropertyLeaseType, PropertyStatus, formatPropertyBedTypesSummary } from '../../properties/models/property-enums';
import { PropertyListResponse, PropertyTrackerResponse, PropertyTrackerResponseOption, PropertyTrackerResponseOptionRequest, PropertyTrackerResponseRequest } from '../../properties/models/property.model';
import { BillingType } from '../../reservations/models/reservation-enum';
import { ReservationTrackerResponse, ReservationTrackerResponseOption, ReservationTrackerResponseOptionRequest, ReservationTrackerResponseRequest } from '../../reservations/models/reservation-model';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ServiceType, getServiceType } from '../../shared/models/mixed-enums';
import { DashboardPropertyTurnoverRow, MaintenanceListCurrentReservationByPropertyId, MaintenanceListDisplay, MaintenanceListMappingContext, PropertyMaintenance, PropertyOfflineStatusDisplay, ReservationPropertyMaintenance, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { MonthlyCommissionDisplay, DashboardServiceProviderOption, ScheduleDateCell } from '../models/dashboard-model';
import { DashboardCompanyDataService, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-company-data',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCompanyDataComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private agentService = inject(AgentService);
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

  canViewCommissions = false;
  canViewAllCommissions = false;
  isAdmin = false;
  currentUserAgentId: string | null = null;
  currentUserAgentCode: string | null = null;
  currentUserCommissionRate = 0;
  adminUsers: UserResponse[] = [];
  adminAgents: AgentResponse[] = [];
  adminCommissionRatesByAgentCode = new Map<string, number>();
  monthlyCommissionRows: MonthlyCommissionDisplay[] = [];
  commissionsUsersReady = false;
  commissionsAgentsReady = false;
  commissionsCurrentUserReady = false;

  trackerConfiguration: TrackerConfigurationResponse | null = null;
  reservationTrackerResponsesByReservation = new Map<string, Map<string, ReservationTrackerResponse>>();
  reservationTrackerResponseOptionsByReservation = new Map<string, ReservationTrackerResponseOption[]>();
  propertyTrackerResponsesByProperty = new Map<string, Map<string, PropertyTrackerResponse>>();
  propertyTrackerResponseOptionsByProperty = new Map<string, PropertyTrackerResponseOption[]>();
  arrivalColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
  departureColumnDefinitionByOffice = new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
  onlineColumnDefinitionByContext = new Map<number, Map<string, Map<number, TrackerConfigurationDefinitionResponse>>>();
  offlineColumnDefinitionByContext = new Map<number, Map<string, Map<number, TrackerConfigurationDefinitionResponse>>>();

  reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[] = [];
  reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[] = [];
  reservationTurnoverArrivalColumns: ColumnSet = {};
  reservationTurnoverDepartureColumns: ColumnSet = {};
  onlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  offlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  offlineStatusPropertyDisplayRows: PropertyOfflineStatusDisplay[] = [];
  propertyOnlineColumns: ColumnSet = {};
  propertyOnlineColumnsByLeaseType: Partial<Record<PropertyLeaseType, ColumnSet>> = {};
  propertyOfflineColumns: ColumnSet = {};
  offlineStatusPropertyColumns: ColumnSet = {};
  offlineStatusPropertyColumnsByLeaseType: Partial<Record<PropertyLeaseType, ColumnSet>> = {};

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

  private readonly propertyOnlineBaseColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    ownerName: { displayAs: 'Owner/Vendor', maxWidth: '20ch', wrap: false },
    availableAfter: { displayAs: 'Online', maxWidth: '15ch', alignment: 'center' },
    bedrooms: { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };

  private readonly propertyOfflineBaseColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    availableUntil: { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    bedrooms: { displayAs: 'Beds', wrap: false, maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };

  private readonly vacantPropertyColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    contactName: { displayAs: 'Contact', maxWidth: '20ch', wrap: false },
    propertyStatusDisplay: { displayAs: 'Status', maxWidth: '16ch', wrap: false },
    bedrooms: { displayAs: 'Beds', maxWidth: '15ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', maxWidth: '15ch', alignment: 'center' },
    vacancyDaysDisplay: { displayAs: 'Days Vacant', maxWidth: '25ch', alignment: 'center' },
    lastDepartureDate: { displayAs: 'Last Departure', maxWidth: '25ch', alignment: 'center' }
  };

  private readonly occupiedPropertyColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    contactName: { displayAs: 'Contact', maxWidth: '20ch', wrap: false },
    propertyStatusDisplay: { displayAs: 'Status', maxWidth: '16ch', wrap: false },
    bedrooms: { displayAs: 'Beds', maxWidth: '15ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', maxWidth: '15ch', alignment: 'center' }
  };

  private readonly offlineStatusPropertyBaseColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
    ownerName: { displayAs: 'Owner/Vendor', maxWidth: '20ch', wrap: false },
    availableUntilDisplay: { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    bedrooms: { displayAs: 'Beds', maxWidth: '15ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', maxWidth: '15ch', alignment: 'center' },
    squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' },
    propertyStatusDisplay: { displayAs: 'Status', maxWidth: '16ch', wrap: false }
  };

  private readonly monthlyCommissionColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    agentCode: { displayAs: 'Agent', maxWidth: '15ch' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '20ch', alignment: 'center' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    daysRented: { displayAs: 'Days Rented', maxWidth: '18ch', alignment: 'center' },
    commissionDisplay: { displayAs: 'Comm', maxWidth: '20ch', alignment: 'center' }
  };

  //#region Dashboard-Company-Data
  override ngOnInit(): void {
    this.companyDataService.reset();
    this.canViewCommissions = this.authService.canViewCommissions();
    this.canViewAllCommissions = this.authService.isInAccounting();
    this.isAdmin = this.authService.isAdmin();
    this.companyDataService.setTrackerHandlers({
      loadReservationTrackers: reservationIds => this.loadReservationTrackerResponses(reservationIds),
      onReservationCheckboxChange: (row, sourceContext) => this.onReservationCheckboxChange(row, sourceContext),
      onReservationDropdownChange: (row, sourceContext) => this.onReservationDropdownChange(row, sourceContext),
      onReservationCheckAllTracking: (row, sourceContext) => this.onReservationCheckAllTracking(row, sourceContext),
      onReservationClearTracking: (row, sourceContext) => this.onReservationClearTracking(row, sourceContext),
      onPropertyCheckboxChange: (row, sourceContext) => this.onPropertyCheckboxChange(row, sourceContext),
      onPropertyDropdownChange: (row, sourceContext) => this.onPropertyDropdownChange(row, sourceContext),
      onPropertyCheckAllTracking: (row, sourceContext) => this.onPropertyCheckAllTracking(row, sourceContext),
      onPropertyClearTracking: (row, sourceContext) => this.onPropertyClearTracking(row, sourceContext),
      onMaintenanceDropdownChange: row => this.onMaintenanceDropdownChange(row),
      onMaintenanceInlineDateChange: row => this.handleMaintenanceInlineDateChange(row)
    });
    this.loadHousekeepingUsers();
    this.loadCarpetUsers();
    this.loadInspectorUsers();
    this.loadTrackerConfiguration();
    if (this.canViewCommissions) {
      this.loadCommissionCurrentUser();
      this.loadCommissionUsers();
      this.loadCommissionAgents();
    } else {
      this.commissionsUsersReady = true;
      this.commissionsAgentsReady = true;
      this.commissionsCurrentUserReady = true;
    }
    this.companyDataService.pageOfficeId$.pipe(
      filter((officeId): officeId is number | null => officeId !== undefined),
      takeUntil(this.destroy$)
    ).subscribe(officeId => {
      this.resolveOfficeScope(officeId);
      this.publishOfficeUiSnapshot();
      if (this.itemsToLoad$.value.size === 0) {
        this.recomputeBackendData();
      }
    });
    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeBackendData();
    });
    super.ngOnInit();
  }

  override ngOnDestroy(): void {
    this.companyDataService.reset();
    super.ngOnDestroy();
  }

  override loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.globalSelectionService.getOfficeUiState$(this.offices, {
            explicitOfficeId: null,
            requireExplicitOfficeUnset: false
          }).pipe(take(1)).subscribe(uiState => {
            const pageOfficeId = this.companyDataService.pageOfficeId;
            const officeId = pageOfficeId !== undefined ? pageOfficeId : uiState.selectedOfficeId;
            this.resolveOfficeScope(officeId);
            this.publishOfficeUiSnapshot(uiState.showOfficeDropdown);
          });
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue());
        this.publishOfficeUiSnapshot(false);
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    void userAssignedId;
    this.buildMonthlyCommissions();
    this.publishSnapshot();
    this.loadPropertyTrackerResponses();
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
        if (this.companyDataService.snapshot.isReady) {
          this.publishSnapshot();
          this.loadPropertyTrackerResponses();
        }
      },
      error: () => {
        this.trackerConfiguration = null;
      }
    });
  }

  loadCommissionCurrentUser(): void {
    const userId = this.authService.getUser()?.userId ?? '';
    if (!userId) {
      this.currentUserAgentId = null;
      this.currentUserCommissionRate = 0;
      this.commissionsCurrentUserReady = true;
      this.tryPublishCommissionSlice();
      return;
    }
    this.userService.getUserByGuid(userId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.commissionsCurrentUserReady = true;
      this.tryPublishCommissionSlice();
    })).subscribe({
      next: (userResponse: UserResponse) => {
        this.currentUserAgentId = this.utilityService.normalizeIdOrNull(userResponse.agentId);
        this.currentUserCommissionRate = Number(userResponse.commissionRate ?? 0);
      },
      error: () => {
        this.currentUserAgentId = null;
        this.currentUserCommissionRate = 0;
      }
    });
  }

  loadCommissionUsers(): void {
    this.userService.getUsers().pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.commissionsUsersReady = true;
      this.tryPublishCommissionSlice();
    })).subscribe({
      next: (users: UserResponse[]) => {
        this.adminUsers = users || [];
      },
      error: () => {
        this.adminUsers = [];
      }
    });
  }

  loadCommissionAgents(): void {
    this.agentService.getAgents().pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.commissionsAgentsReady = true;
      this.tryPublishCommissionSlice();
    })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.adminAgents = agents || [];
      },
      error: () => {
        this.adminAgents = [];
      }
    });
  }

  tryPublishCommissionSlice(): void {
    if (!this.canViewCommissions) {
      return;
    }
    if (!this.commissionsCurrentUserReady || !this.commissionsUsersReady || !this.commissionsAgentsReady) {
      return;
    }
    this.buildMonthlyCommissions();
    if (!this.companyDataService.snapshot.isReady) {
      return;
    }
    this.companyDataService.patchSnapshot({
      canViewCommissions: this.canViewCommissions,
      canViewAllCommissions: this.canViewAllCommissions,
      isAdmin: this.isAdmin,
      currentUserAgentId: this.currentUserAgentId,
      currentUserAgentCode: this.currentUserAgentCode,
      monthlyCommissionRows: this.monthlyCommissionRows,
      monthlyCommissionColumns: this.monthlyCommissionColumns
    });
  }

  buildMonthlyCommissions(): void {
    if (!this.canViewCommissions) {
      this.currentUserAgentCode = null;
      this.monthlyCommissionRows = [];
      return;
    }

    if (this.canViewAllCommissions) {
      if (!this.commissionsUsersReady || !this.commissionsAgentsReady) {
        return;
      }
      this.currentUserAgentCode = 'ALL';
      this.populateAdminCommissionRates();
      this.computeMonthlyCommissionRows();
      return;
    }

    if (!this.commissionsCurrentUserReady) {
      return;
    }

    if (!this.currentUserAgentId || Number(this.currentUserCommissionRate) <= 0) {
      this.currentUserAgentCode = null;
      this.monthlyCommissionRows = [];
      return;
    }

    if (!this.commissionsAgentsReady || this.adminAgents.length === 0) {
      return;
    }

    const assignedAgent = this.adminAgents.find(agent => agent.agentId === this.currentUserAgentId) || null;
    this.currentUserAgentCode = assignedAgent?.agentCode?.trim() ?? null;
    this.computeMonthlyCommissionRows();
  }

  populateAdminCommissionRates(): void {
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
  }

  computeMonthlyCommissionRows(): void {
    const commissionMonth = this.getCommissionMonthReferenceDate();
    const monthLo = this.getMonthStartAsOrdinal(commissionMonth);
    const monthHi = this.getMonthEndAsOrdinal(commissionMonth);
    if (monthLo === null || monthHi === null) {
      this.monthlyCommissionRows = [];
      return;
    }
    const daysInMonth = monthHi % 100;
    const overlapsCurrentMonth = (a: number, d: number) => a <= monthHi && d >= monthLo;
    const getDaysRentedInCurrentMonth = (arrivalOrdinal: number, departureOrdinal: number, billingTypeId?: number | null): number => {
      const overlapStart = Math.max(arrivalOrdinal, monthLo);
      const overlapEnd = Math.min(departureOrdinal, monthHi);
      if (overlapStart > overlapEnd) {
        return 0;
      }
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

    this.monthlyCommissionRows = this.filteredReservationPropertyMaintenanceList
      .filter(row => this.canViewAllCommissions ? (row.agentCode || '').trim().length > 0 : (row.agentCode || '').trim().toLowerCase() === agentCode)
      .filter(row => resolveCommissionRate(row) > 0)
      .filter(row => row.arrivalDateOrdinal != null && row.departureDateOrdinal != null)
      .filter(row => overlapsCurrentMonth(row.arrivalDateOrdinal!, row.departureDateOrdinal!))
      .sort((a, b) =>
        (a.agentCode || '').localeCompare(b.agentCode || '')
        || ((a.arrivalDateOrdinal || 0) - (b.arrivalDateOrdinal || 0))
        || (a.reservationCode || '').localeCompare(b.reservationCode || '')
      )
      .map(row => {
        const daysRented = getDaysRentedInCurrentMonth(row.arrivalDateOrdinal!, row.departureDateOrdinal!, row.billingTypeId);
        const commission = getCommission(daysRented, resolveCommissionRate(row));
        return {
          ...(row as unknown as MonthlyCommissionDisplay),
          arrivalDate: row.arrivalDateDisplay || row.arrivalDate,
          departureDate: row.departureDateDisplay || row.departureDate,
          daysRented,
          commission,
          commissionDisplay: this.formatterService.currencyUsd(commission)
        };
      })
      .filter(row => row.commission > 0);
  }

  getCommissionMonthReferenceDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

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

  loadReservationTrackerResponses(reservationIds: string[]): void {
    const ids = Array.from(new Set((reservationIds || []).map(id => this.utilityService.normalizeId(id)).filter(id => !!id)));
    if (ids.length === 0) {
      return;
    }

    this.reservationService.getReservationTrackerResponsesByIds(ids).pipe(
      catchError(() => of({ responses: [] as ReservationTrackerResponse[], options: [] as ReservationTrackerResponseOption[] })),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      ids.forEach(reservationId => {
        this.reservationTrackerResponsesByReservation.set(reservationId, new Map<string, ReservationTrackerResponse>());
        this.reservationTrackerResponseOptionsByReservation.set(reservationId, []);
      });
      (result?.responses || []).forEach(response => {
        const reservationKey = this.utilityService.normalizeId(response.reservationId);
        if (!reservationKey) {
          return;
        }
        const byDefinitionId = this.reservationTrackerResponsesByReservation.get(reservationKey) || new Map<string, ReservationTrackerResponse>();
        byDefinitionId.set(this.utilityService.normalizeId(response.trackerDefinitionId), response);
        this.reservationTrackerResponsesByReservation.set(reservationKey, byDefinitionId);
      });
      (result?.options || []).forEach(option => {
        const reservationKey = this.utilityService.normalizeId(option.reservationId);
        if (!reservationKey) {
          return;
        }
        const list = this.reservationTrackerResponseOptionsByReservation.get(reservationKey) || [];
        list.push(option);
        this.reservationTrackerResponseOptionsByReservation.set(reservationKey, list);
      });
      this.applyReservationTrackerValues();
      this.publishReservationTrackerSlice();
    });
  }

  loadPropertyTrackerResponses(): void {
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
        const byDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
        byDefinitionId.set(this.utilityService.normalizeId(response.trackerDefinitionId), response);
        this.propertyTrackerResponsesByProperty.set(propertyKey, byDefinitionId);
      });
      result.options.forEach(option => {
        const propertyKey = this.utilityService.normalizeId(option.propertyId);
        const list = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];
        list.push(option);
        this.propertyTrackerResponseOptionsByProperty.set(propertyKey, list);
      });
      this.applyPropertyTrackerValues();
      this.publishPropertyTrackerSlice();
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
    this.onlinePropertyRows = [...this.onlineProperties]
      .filter(pm => pm.onlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableFromOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableFromOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));
    this.offlinePropertyRows = [...this.offlineProperties]
      .filter(pm => pm.offlineChecked !== true)
      .sort((a, b) => (Number(a.eventDateSortTime ?? a.availableUntilOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableUntilOrdinal) || 0))
      .map(pm => this.mapPropertyMaintenanceToDashboardTurnoverRow(pm));
    this.offlineStatusPropertyDisplayRows = this.propertiesOfflineStatus.map(row => ({
      ...row,
      ownerName: this.mappingService.resolvePropertyListContactName(row)
    }));

    this.reservationTurnoverArrivalRows = arrivalRows.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r));
    this.reservationTurnoverDepartureRows = departureRows.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r));
    this.applyReservationTrackerColumns();
    this.applyReservationTrackerValues();
    this.applyPropertyTrackerColumns();
    this.applyPropertyTrackerValues();

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
      offices: this.getDashboardOfficeOptions(),
      selectedOfficeId: this.selectedOffice?.officeId ?? null,
      showOfficeDropdown: this.getShowOfficeDropdown(),
      canViewCommissions: this.canViewCommissions,
      canViewAllCommissions: this.canViewAllCommissions,
      isAdmin: this.isAdmin,
      currentUserAgentId: this.currentUserAgentId,
      currentUserAgentCode: this.currentUserAgentCode,
      monthlyCommissionRows: this.monthlyCommissionRows,
      reservationTurnoverArrivalRows: this.reservationTurnoverArrivalRows,
      reservationTurnoverDepartureRows: this.reservationTurnoverDepartureRows,
      onlinePropertyRows: this.onlinePropertyRows,
      offlinePropertyRows: this.offlinePropertyRows,
      arrivalMaintenanceDisplay: maintenanceSlices.arrivals,
      departureMaintenanceDisplay: maintenanceSlices.departures,
      comingOnlineMaintenanceDisplay: maintenanceSlices.online,
      goingOfflineMaintenanceDisplay: maintenanceSlices.offline,
      maidMaintenanceDisplay: maintenanceSlices.maid,
      vacantPropertyRows: this.propertiesByVacancy,
      vacantMaintenanceDisplay: maintenanceSlices.vacant,
      occupiedPropertyRows: this.propertiesOccupied,
      occupiedMaintenanceDisplay: maintenanceSlices.occupied,
      offlineStatusPropertyRows: this.offlineStatusPropertyDisplayRows,
      offlineStatusMaintenanceDisplay: maintenanceSlices.offlineStatus,
      reservationTurnoverArrivalColumns: this.reservationTurnoverArrivalColumns,
      reservationTurnoverDepartureColumns: this.reservationTurnoverDepartureColumns,
      propertyOnlineColumns: this.propertyOnlineColumns,
      propertyOnlineColumnsByLeaseType: this.propertyOnlineColumnsByLeaseType,
      propertyOfflineColumns: this.propertyOfflineColumns,
      arrivalMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Arrival Date'),
      departureMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Departure Date'),
      comingOnlineMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Online Date'),
      goingOfflineMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Offline Date'),
      maidMaintenanceColumns: this.cloneMaidColumnSet(maintenanceColumns),
      vacantPropertyColumns: this.vacantPropertyColumns,
      vacantMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Event Date'),
      occupiedPropertyColumns: this.occupiedPropertyColumns,
      occupiedMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Event Date'),
      offlineStatusPropertyColumns: this.offlineStatusPropertyColumns,
      offlineStatusPropertyColumnsByLeaseType: this.offlineStatusPropertyColumnsByLeaseType,
      offlineStatusMaintenanceColumns: this.withEventDateLabel(maintenanceColumns, 'Event Date'),
      monthlyCommissionColumns: this.monthlyCommissionColumns,
      serviceProviderOptions: this.buildServiceProviderOptions(),
      scheduleCleaningRows: this.buildScheduleCleaningRows(maintenanceSlices),
      scheduleCleaningColumns: this.buildScheduleCleaningColumns()
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

  publishPropertyTrackerSlice(): void {
    this.companyDataService.patchSnapshot({
      onlinePropertyRows: this.onlinePropertyRows,
      offlinePropertyRows: this.offlinePropertyRows,
      offlineStatusPropertyRows: this.offlineStatusPropertyDisplayRows,
      propertyOnlineColumns: this.propertyOnlineColumns,
      propertyOnlineColumnsByLeaseType: this.propertyOnlineColumnsByLeaseType,
      propertyOfflineColumns: this.propertyOfflineColumns,
      offlineStatusPropertyColumns: this.offlineStatusPropertyColumns,
      offlineStatusPropertyColumnsByLeaseType: this.offlineStatusPropertyColumnsByLeaseType
    });
  }

  publishOfficeUiSnapshot(showOfficeDropdown: boolean = this.getShowOfficeDropdown()): void {
    this.companyDataService.patchSnapshot({
      offices: this.getDashboardOfficeOptions(),
      selectedOfficeId: this.selectedOffice?.officeId ?? null,
      showOfficeDropdown
    });
  }

  getDashboardOfficeOptions(): { officeId: number; name: string }[] {
    return this.globalSelectionService.filterOfficeListForUser(this.offices || []).map(office => ({
      officeId: office.officeId,
      name: office.name || office.officeCode || `Office ${office.officeId}`
    }));
  }

  getShowOfficeDropdown(): boolean {
    return this.getDashboardOfficeOptions().length > 1;
  }

  buildScheduleCleaningColumns(): ColumnSet {
    return {
      propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
      reservationCode: { displayAs: 'Reservation', maxWidth: '14ch', wrap: false },
      shortAddress: { displayAs: 'Address', maxWidth: '30ch', wrap: false },
      bedTypesText: { displayAs: 'Beds', wrap: false, maxWidth: '18ch', alignment: 'center' },
      bathrooms: { displayAs: 'Baths', wrap: false, maxWidth: '10ch', alignment: 'center' },
      squareFeet: { displayAs: 'Sq Ft', wrap: false, maxWidth: '10ch', alignment: 'center' },
      hasPets: { displayAs: 'Pets', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '10ch' },
      scheduleDepartureDate: { displayAs: 'Departure or', headerLine2: 'Offline', maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', wrap: false },
      scheduleArrivalDate: { displayAs: 'Arrival or', headerLine2: 'Online', maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', wrap: false },
      scheduledCleanDate: { displayAs: 'Maid', headerLine2: 'Service', maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', wrap: false },
      cleanerName: { displayAs: 'Service Provider', maxWidth: '20ch', wrap: false },
      serviceDate: { displayAs: 'Service Date', maxWidth: '15ch', alignment: 'center', wrap: false }
    };
  }

  resolveScheduleProviderName(
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

  resolveScheduleCleanerName(row: MaintenanceListDisplay): string {
    return this.resolveScheduleProviderName(row.cleaner, ['Clear Selection', 'Select Cleaner']);
  }

  getScheduleServiceSlots(row: MaintenanceListDisplay): {
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
        providerName: this.resolveScheduleCleanerName(row)
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

  buildServiceProviderOptions(): DashboardServiceProviderOption[] {
    return this.getServiceProviders().map(({ userId, displayName }) => ({
      userId: this.utilityService.normalizeId(userId),
      label: displayName
    }));
  }

  buildPropertyReservationTimeline(): Map<
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
    for (const reservation of this.filteredReservationPropertyMaintenanceList) {
      const propertyId = this.utilityService.normalizeId(reservation.propertyId);
      const reservationId = this.utilityService.normalizeId(reservation.reservationId);
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

  findPreviousDepartureDate(
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
    const normalizedReservationId = reservationId ? this.utilityService.normalizeId(reservationId) : '';
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

  findNextArrivalDate(
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
    const normalizedReservationId = reservationId ? this.utilityService.normalizeId(reservationId) : '';
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

  isValidScheduleDate(value: string): boolean {
    const trimmed = String(value || '').trim();
    return !!trimmed && trimmed !== '—' && trimmed !== '-' && trimmed !== 'N/A';
  }

  buildScheduleDateCell(text: string, emphasis: 'primary' | 'muted' | 'none'): ScheduleDateCell {
    const trimmed = String(text || '').trim();
    if (!this.isValidScheduleDate(trimmed)) {
      return { text: '', emphasis: 'none' };
    }
    return { text: trimmed, emphasis };
  }

  buildScheduleDateCells(
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
    scheduleDepartureDate: ScheduleDateCell;
    scheduleArrivalDate: ScheduleDateCell;
    scheduledCleanDate: ScheduleDateCell;
    serviceDate: ScheduleDateCell;
  } {
    const reservationId = this.utilityService.normalizeId(row.reservationId ?? '');
    const reservation = reservationId ? reservationById.get(reservationId) : undefined;
    const propertyId = this.utilityService.normalizeId(row.propertyId);
    const propertyTimeline = timeline.get(propertyId) ?? [];
    const eventDate = String(row.eventDate || '').trim();

    if (row.eventType === ServiceType.Departure) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell(reservation?.departureDateDisplay || eventDate, 'primary'),
        scheduleArrivalDate: this.buildScheduleDateCell(
          reservation?.departureDateOrdinal != null
            ? this.findNextArrivalDate(propertyTimeline, reservation.departureDateOrdinal, reservationId)
            : '',
          'none'
        ),
        scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
        serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
      };
    }

    if (row.eventType === ServiceType.Arrival) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell(
          reservation?.arrivalDateOrdinal != null
            ? this.findPreviousDepartureDate(propertyTimeline, reservation.arrivalDateOrdinal, reservationId)
            : '',
          'none'
        ),
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

    if (row.eventType === ServiceType.Offline) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell(eventDate, 'primary'),
        scheduleArrivalDate: this.buildScheduleDateCell('', 'none'),
        scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
        serviceDate: this.buildScheduleDateCell(serviceDate, 'none')
      };
    }

    if (row.eventType === ServiceType.Online) {
      return {
        scheduleDepartureDate: this.buildScheduleDateCell('', 'none'),
        scheduleArrivalDate: this.buildScheduleDateCell(eventDate, 'primary'),
        scheduledCleanDate: this.buildScheduleDateCell('', 'none'),
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

  resolveScheduleHasPets(row: MaintenanceListDisplay, reservationById: Map<string, ReservationPropertyMaintenance>): boolean {
    const reservationId = this.utilityService.normalizeId(row.reservationId ?? '');
    if (reservationId) {
      const reservation = reservationById.get(reservationId);
      if (reservation) {
        return reservation.hasPets === true;
      }
    }
    return row.hasPets === true;
  }

  isScheduleServiceDateFromCurrentMonthForward(dateDisplay: string): boolean {
    const dateOrdinal = this.utilityService.parseCalendarDateToOrdinal(dateDisplay);
    const monthStartOrdinal = this.utilityService.parseCalendarDateToOrdinal(
      this.utilityService.formatDateOnlyForApi(this.currentMonthStartAtMidnight)
    );
    if (dateOrdinal == null || monthStartOrdinal == null) {
      return false;
    }
    return dateOrdinal >= monthStartOrdinal;
  }

  isScheduleEventInDashboardWindow(row: MaintenanceListDisplay): boolean {
    const bounds = this.getInclusiveCurrentAndNextMonthOrdinalBounds();
    if (!bounds) {
      return false;
    }
    const eventOrdinal = this.utilityService.parseCalendarDateToOrdinal(String(row.eventDate || '').trim());
    if (eventOrdinal == null) {
      return false;
    }
    return eventOrdinal >= bounds.lo && eventOrdinal <= bounds.hi;
  }

  shouldIncludeScheduleRow(row: MaintenanceListDisplay, scheduleSortDate: string): boolean {
    if (!this.isValidScheduleDate(scheduleSortDate) || !this.isScheduleServiceDateFromCurrentMonthForward(scheduleSortDate)) {
      return false;
    }
    if (
      row.eventType === ServiceType.Arrival
      || row.eventType === ServiceType.Departure
      || row.eventType === ServiceType.Online
      || row.eventType === ServiceType.Offline
    ) {
      return this.isScheduleEventInDashboardWindow(row);
    }
    return true;
  }

  buildScheduleCleaningRows(slices: {
    arrivals: MaintenanceListDisplay[];
    departures: MaintenanceListDisplay[];
    online: MaintenanceListDisplay[];
    offline: MaintenanceListDisplay[];
    maid: MaintenanceListDisplay[];
    occupied: MaintenanceListDisplay[];
    vacant: MaintenanceListDisplay[];
    offlineStatus: MaintenanceListDisplay[];
  }): MaintenanceListDisplay[] {
    const timeline = this.buildPropertyReservationTimeline();
    const reservationById = new Map(
      this.filteredReservationPropertyMaintenanceList.map(row => [this.utilityService.normalizeId(row.reservationId), row] as const)
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
        if (!this.shouldIncludeScheduleRow(row, slot.serviceDate)) {
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
        const dateCells = this.buildScheduleDateCells(row, timeline, reservationById, slot.serviceDate);
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
          hasPets: this.resolveScheduleHasPets(row, reservationById),
          scheduleDepartureDate: dateCells.scheduleDepartureDate,
          scheduleArrivalDate: dateCells.scheduleArrivalDate,
          scheduledCleanDate: dateCells.scheduledCleanDate,
          serviceDate: dateCells.serviceDate,
          scheduleSortDate: slot.serviceDate
        } as MaintenanceListDisplay & {
          eventTypeDisplay: string;
          cleanerName: string;
          scheduleDepartureDate: ScheduleDateCell;
          scheduleArrivalDate: ScheduleDateCell;
          scheduledCleanDate: ScheduleDateCell;
          serviceDate: ScheduleDateCell;
          scheduleSortDate: string;
        });
      }
    }
    return rows.sort((a, b) => {
      const aRow = a as MaintenanceListDisplay & { scheduleSortDate?: string };
      const bRow = b as MaintenanceListDisplay & { scheduleSortDate?: string };
      const aOrdinal = this.utilityService.parseCalendarDateToOrdinal(aRow.scheduleSortDate) ?? Number.MAX_SAFE_INTEGER;
      const bOrdinal = this.utilityService.parseCalendarDateToOrdinal(bRow.scheduleSortDate) ?? Number.MAX_SAFE_INTEGER;
      if (aOrdinal !== bOrdinal) {
        return aOrdinal - bOrdinal;
      }
      return (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { sensitivity: 'base' });
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
    occupied: MaintenanceListDisplay[];
    vacant: MaintenanceListDisplay[];
    offlineStatus: MaintenanceListDisplay[];
  } {
    const propertyRows = this.mappingService.mapPropertyListRows(
      this.filteredPropertyMaintenanceList.map(pm => this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm))
    );
    const propertyById = new Map(propertyRows.map(p => [p.propertyId, p] as const));
    const currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId =
      this.mixedMappingService.getReservationData(this.filteredReservationPropertyMaintenanceList as never[]);
    const reservationById = new Map(
      this.filteredReservationPropertyMaintenanceList.map(row => [this.utilityService.normalizeId(row.reservationId), row] as const)
    );
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

    const vacantStatusIds = new Set<number>([
      PropertyStatus.Vacant,
      PropertyStatus.Cleaned,
      PropertyStatus.Inspected,
      PropertyStatus.Ready,
      PropertyStatus.Maintenance
    ]);

    const mapStatusInventoryRows = (statusPredicate: (statusId: number) => boolean): MaintenanceListDisplay[] =>
      this.filteredPropertyMaintenanceList
        .filter(pm => !!pm.propertyId && statusPredicate(Number(pm.propertyStatusId)))
        .sort((a, b) => (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { sensitivity: 'base' }))
        .map(pm => {
          const snap = this.mixedMappingService.getMaintenanceListCurrentReservationFields(pm.propertyId, currentReservationByPropertyId);
          const reservationLookupId = this.utilityService.normalizeId(snap.reservationId ?? '');
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
      ),
      occupied: mapStatusInventoryRows(statusId => statusId === PropertyStatus.Occupied),
      vacant: mapStatusInventoryRows(statusId => vacantStatusIds.has(statusId)),
      offlineStatus: mapStatusInventoryRows(statusId => statusId === PropertyStatus.Offline)
    };
  }

  remapProviderCells(slices: {
    arrivals: MaintenanceListDisplay[];
    departures: MaintenanceListDisplay[];
    online: MaintenanceListDisplay[];
    offline: MaintenanceListDisplay[];
    maid: MaintenanceListDisplay[];
    occupied: MaintenanceListDisplay[];
    vacant: MaintenanceListDisplay[];
    offlineStatus: MaintenanceListDisplay[];
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
      maid: remapRows(slices.maid),
      occupied: remapRows(slices.occupied),
      vacant: remapRows(slices.vacant),
      offlineStatus: remapRows(slices.offlineStatus)
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
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(() => {
        this.applyPropertyProviderOverridesToCachedLists(event.propertyId, patch);
        onSaveOk();
      }).catch(error => onSaveErr(error));
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
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(updatedReservation => {
        this.upsertReservationInCachedLists(updatedReservation);
        onSaveOk();
      }).catch(error => onSaveErr(error));
      return;
    }

    if (target === ServiceType.MaidService) {
      void this.reservationService.updateModifiedReservation(reservationId, { maidUserId: cleanerUserId }).then(updatedReservation => {
        this.upsertReservationInCachedLists(updatedReservation);
        onSaveOk();
      }).catch(error => onSaveErr(error));
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
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(() => {
        this.applyPropertyProviderOverridesToCachedLists(event.propertyId, patch);
        onSaveOk();
      }).catch(error => onSaveErr(error));
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
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(updatedReservation => {
        this.upsertReservationInCachedLists(updatedReservation);
        onSaveOk();
      }).catch(error => onSaveErr(error));
      return;
    }

    if (target === ServiceType.MaidService) {
      if (columnName !== 'cleaningDate') {
        this.toastr.error('Only cleaning date applies to maid service.', CommonMessage.Error);
        return;
      }
      void this.reservationService.updateModifiedReservation(reservationId, { maidStartDate: nextCleaningDate }).then(updatedReservation => {
        this.upsertReservationInCachedLists(updatedReservation);
        onSaveOk();
      }).catch(error => onSaveErr(error));
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
    const eventReservationId = (event.reservationId || '').trim();
    const eventType = event.eventType ?? null;

    const matchesRow = (row: MaintenanceListDisplay): boolean => {
      if (row.propertyId !== event.propertyId) {
        return false;
      }
      if ((row.reservationId || '').trim() !== eventReservationId) {
        return false;
      }
      // Same reservation can appear in arrival + departure (+ in-process). Never overwrite other event types.
      if (eventType != null && row.eventType != null && row.eventType !== eventType) {
        return false;
      }
      return true;
    };

    const patchProviderFields = (row: MaintenanceListDisplay): MaintenanceListDisplay => ({
      ...row,
      cleanerUserId: event.cleanerUserId,
      carpetUserId: event.carpetUserId,
      inspectorUserId: event.inspectorUserId,
      cleaningDate: event.cleaningDate,
      carpetDate: event.carpetDate,
      inspectingDate: event.inspectingDate,
      cleaner: event.cleaner,
      carpet: event.carpet,
      inspector: event.inspector,
      maidUserId: event.maidUserId
    });

    const patchRows = (rows: MaintenanceListDisplay[]) =>
      rows.map(row => (matchesRow(row) ? patchProviderFields(row) : row));

    const patched = {
      arrivalMaintenanceDisplay: patchRows(snapshot.arrivalMaintenanceDisplay),
      departureMaintenanceDisplay: patchRows(snapshot.departureMaintenanceDisplay),
      comingOnlineMaintenanceDisplay: patchRows(snapshot.comingOnlineMaintenanceDisplay),
      goingOfflineMaintenanceDisplay: patchRows(snapshot.goingOfflineMaintenanceDisplay),
      maidMaintenanceDisplay: patchRows(snapshot.maidMaintenanceDisplay),
      occupiedMaintenanceDisplay: patchRows(snapshot.occupiedMaintenanceDisplay),
      vacantMaintenanceDisplay: patchRows(snapshot.vacantMaintenanceDisplay),
      offlineStatusMaintenanceDisplay: patchRows(snapshot.offlineStatusMaintenanceDisplay)
    };

    this.companyDataService.patchSnapshot({
      ...patched,
      scheduleCleaningRows: this.buildScheduleCleaningRows({
        arrivals: patched.arrivalMaintenanceDisplay,
        departures: patched.departureMaintenanceDisplay,
        online: patched.comingOnlineMaintenanceDisplay,
        offline: patched.goingOfflineMaintenanceDisplay,
        maid: patched.maidMaintenanceDisplay,
        occupied: patched.occupiedMaintenanceDisplay,
        vacant: patched.vacantMaintenanceDisplay,
        offlineStatus: patched.offlineStatusMaintenanceDisplay
      })
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
    const listProperty = this.findPropertyListRowByPropertyId(pm.propertyId);
    const property: PropertyListResponse = {
      ...this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm),
      propertyLeaseTypeId: listProperty?.propertyLeaseTypeId ?? this.getPropertyLeaseTypeIdByPropertyId(pm.propertyId),
      owner1Id: listProperty?.owner1Id ?? null,
      vendorId: listProperty?.vendorId ?? null,
      contactName: listProperty?.contactName ?? ''
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

  resolvePropertyTrackerContext(propertyLeaseTypeId: number, sourceContext: 'online' | 'offline'): TrackerContextType {
    const leaseTypeId = Number(propertyLeaseTypeId);
    if (sourceContext === 'online') {
      if (leaseTypeId === PropertyLeaseType.ThirdParty) {
        return TrackerContextType.PropertyThirdPartyOnline;
      }
      if (leaseTypeId === PropertyLeaseType.Direct) {
        return TrackerContextType.PropertyDirectOnline;
      }
      return TrackerContextType.PropertyOnline;
    }
    if (leaseTypeId === PropertyLeaseType.ThirdParty) {
      return TrackerContextType.PropertyThirdPartyOffline;
    }
    if (leaseTypeId === PropertyLeaseType.Direct) {
      return TrackerContextType.PropertyDirectOffline;
    }
    return TrackerContextType.PropertyOffline;
  }

  getOnlineTrackerContextsForLeaseTypes(leaseTypeIds: Iterable<number>): TrackerContextType[] {
    const leaseTypes = new Set(Array.from(leaseTypeIds, id => Number(id)));
    const contexts: TrackerContextType[] = [];
    if (leaseTypes.size === 0) {
      return [
        TrackerContextType.PropertyOnline,
        TrackerContextType.PropertyThirdPartyOnline,
        TrackerContextType.PropertyDirectOnline
      ];
    }
    if (leaseTypes.has(PropertyLeaseType.PropertyManagement)) {
      contexts.push(TrackerContextType.PropertyOnline);
    }
    if (leaseTypes.has(PropertyLeaseType.ThirdParty)) {
      contexts.push(TrackerContextType.PropertyThirdPartyOnline);
    }
    if (leaseTypes.has(PropertyLeaseType.Direct)) {
      contexts.push(TrackerContextType.PropertyDirectOnline);
    }
    return contexts;
  }

  getOfflineTrackerContextsForLeaseTypes(leaseTypeIds: Iterable<number>): TrackerContextType[] {
    const leaseTypes = new Set(Array.from(leaseTypeIds, id => Number(id)));
    const contexts: TrackerContextType[] = [];
    if (leaseTypes.size === 0) {
      return [
        TrackerContextType.PropertyOffline,
        TrackerContextType.PropertyThirdPartyOffline,
        TrackerContextType.PropertyDirectOffline
      ];
    }
    if (leaseTypes.has(PropertyLeaseType.PropertyManagement)) {
      contexts.push(TrackerContextType.PropertyOffline);
    }
    if (leaseTypes.has(PropertyLeaseType.ThirdParty)) {
      contexts.push(TrackerContextType.PropertyThirdPartyOffline);
    }
    if (leaseTypes.has(PropertyLeaseType.Direct)) {
      contexts.push(TrackerContextType.PropertyDirectOffline);
    }
    return contexts;
  }

  applyPropertyTrackerColumns(): void {
    const onlineOfficeIds = new Set(this.onlinePropertyRows.map(row => row.officeId).filter(officeId => officeId > 0));
    const offlineOfficeIds = new Set([
      ...this.offlinePropertyRows.map(row => row.officeId),
      ...this.offlineStatusPropertyDisplayRows.map(row => row.officeId)
    ].filter(officeId => officeId > 0));

    // Only show tracker columns for lease types actually in each list (avoids blank PM columns on a 3rd-party row).
    const onlineContexts = this.getOnlineTrackerContextsForLeaseTypes(this.onlinePropertyRows.map(row => row.propertyLeaseTypeId));
    const offlineContexts = this.getOfflineTrackerContextsForLeaseTypes([
      ...this.offlinePropertyRows.map(row => row.propertyLeaseTypeId),
      ...this.offlineStatusPropertyDisplayRows.map(row => row.propertyLeaseTypeId)
    ]);

    const onlineBase = this.cloneColumnSet(this.propertyOnlineBaseColumns);
    const offlineBase = this.cloneColumnSet(this.propertyOfflineBaseColumns);
    const offlineStatusBase = this.cloneColumnSet(this.offlineStatusPropertyBaseColumns);
    this.onlineColumnDefinitionByContext = new Map();
    this.offlineColumnDefinitionByContext = new Map();

    onlineContexts.forEach(contextType => {
      const definitions = this.getTrackerDefinitionsForContext(contextType)
        .filter(definition => onlineOfficeIds.size === 0 || onlineOfficeIds.has(definition.officeId));
      const mapByColumn = this.buildColumnDefinitionByOffice(definitions);
      this.onlineColumnDefinitionByContext.set(Number(contextType), mapByColumn);
      this.addTrackerColumnsToColumnSet(onlineBase, mapByColumn);
    });

    offlineContexts.forEach(contextType => {
      const definitions = this.getTrackerDefinitionsForContext(contextType)
        .filter(definition => offlineOfficeIds.size === 0 || offlineOfficeIds.has(definition.officeId));
      const mapByColumn = this.buildColumnDefinitionByOffice(definitions);
      this.offlineColumnDefinitionByContext.set(Number(contextType), mapByColumn);
      this.addTrackerColumnsToColumnSet(offlineBase, mapByColumn);
      this.addTrackerColumnsToColumnSet(offlineStatusBase, mapByColumn);
    });

    this.propertyOnlineColumns = onlineBase;
    this.propertyOfflineColumns = offlineBase;
    this.offlineStatusPropertyColumns = offlineStatusBase;
    this.propertyOnlineColumnsByLeaseType = this.buildPropertyColumnsByLeaseType(
      this.propertyOnlineBaseColumns,
      this.onlineColumnDefinitionByContext,
      [
        { leaseTypeId: PropertyLeaseType.PropertyManagement, contextType: TrackerContextType.PropertyOnline },
        { leaseTypeId: PropertyLeaseType.ThirdParty, contextType: TrackerContextType.PropertyThirdPartyOnline },
        { leaseTypeId: PropertyLeaseType.Direct, contextType: TrackerContextType.PropertyDirectOnline }
      ],
      onlineContexts
    );
    this.offlineStatusPropertyColumnsByLeaseType = this.buildPropertyColumnsByLeaseType(
      this.offlineStatusPropertyBaseColumns,
      this.offlineColumnDefinitionByContext,
      [
        { leaseTypeId: PropertyLeaseType.PropertyManagement, contextType: TrackerContextType.PropertyOffline },
        { leaseTypeId: PropertyLeaseType.ThirdParty, contextType: TrackerContextType.PropertyThirdPartyOffline },
        { leaseTypeId: PropertyLeaseType.Direct, contextType: TrackerContextType.PropertyDirectOffline }
      ],
      offlineContexts
    );
  }

  buildPropertyColumnsByLeaseType(
    baseColumns: ColumnSet,
    columnDefinitionByContext: Map<number, Map<string, Map<number, TrackerConfigurationDefinitionResponse>>>,
    leaseTypeContexts: ReadonlyArray<{ leaseTypeId: PropertyLeaseType; contextType: TrackerContextType }>,
    activeContexts: TrackerContextType[]
  ): Partial<Record<PropertyLeaseType, ColumnSet>> {
    const activeContextSet = new Set(activeContexts.map(contextType => Number(contextType)));
    const columnsByLeaseType: Partial<Record<PropertyLeaseType, ColumnSet>> = {};
    leaseTypeContexts.forEach(({ leaseTypeId, contextType }) => {
      if (!activeContextSet.has(Number(contextType))) {
        return;
      }
      const columnSet = this.cloneColumnSet(baseColumns);
      const mapByColumn = columnDefinitionByContext.get(Number(contextType));
      if (mapByColumn) {
        this.addTrackerColumnsToColumnSet(columnSet, mapByColumn);
      }
      columnsByLeaseType[leaseTypeId] = columnSet;
    });
    return columnsByLeaseType;
  }

  addTrackerColumnsToColumnSet(target: ColumnSet, mapByColumn: Map<string, Map<number, TrackerConfigurationDefinitionResponse>>): void {
    mapByColumn.forEach((definitionByOffice, columnName) => {
      if (target[columnName]) {
        return;
      }
      const displayName = definitionByOffice.values().next().value?.displayName || '';
      const headerLines = this.splitTwoWordHeader(displayName);
      const isMultiSelect = this.isTrackerColumnMultiSelect(definitionByOffice);
      target[columnName] = {
        displayAs: headerLines.displayAs,
        headerLine2: headerLines.headerLine2,
        isCheckbox: !isMultiSelect,
        isMultiSelect: isMultiSelect,
        checkboxEditable: true,
        suppressRowClick: true,
        sort: false,
        wrap: false,
        alignment: 'center',
        headerAlignment: 'center',
        maxWidth: '10ch'
      };
    });
  }

  applyPropertyTrackerValues(): void {
    this.onlinePropertyRows = this.onlinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, 'online'));
    this.offlinePropertyRows = this.offlinePropertyRows.map(row => this.attachPropertyTrackerValuesToRow(row, 'offline'));
    this.offlineStatusPropertyDisplayRows = this.offlineStatusPropertyDisplayRows.map(row => this.attachPropertyTrackerValuesToRow(row, 'offline'));
  }

  attachPropertyTrackerValuesToRow<T extends { propertyId: string; officeId: number; propertyLeaseTypeId: number }>(row: T, sourceContext: 'online' | 'offline'): T {
    const next: Record<string, unknown> = { ...row };
    const contextType = this.resolvePropertyTrackerContext(row.propertyLeaseTypeId, sourceContext);
    const contextMaps = sourceContext === 'online' ? this.onlineColumnDefinitionByContext : this.offlineColumnDefinitionByContext;
    const contextMap = contextMaps.get(Number(contextType)) || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    const responseByDefinitionId = this.propertyTrackerResponsesByProperty.get(this.utilityService.normalizeId(row.propertyId)) || new Map<string, PropertyTrackerResponse>();
    const optionResponses = this.propertyTrackerResponseOptionsByProperty.get(this.utilityService.normalizeId(row.propertyId)) || [];

    contextMap.forEach((definitionByOffice, columnName) => {
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
    return next as T;
  }

  getTrackerDefinitionForPropertyRow(sourceContext: 'online' | 'offline', columnName: string, officeId: number, propertyLeaseTypeId: number): TrackerConfigurationDefinitionResponse | null {
    const contextType = this.resolvePropertyTrackerContext(propertyLeaseTypeId, sourceContext);
    const contextMaps = sourceContext === 'online' ? this.onlineColumnDefinitionByContext : this.offlineColumnDefinitionByContext;
    const mapByColumn = contextMaps.get(Number(contextType)) || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    return this.resolveTrackerDefinitionForOffice(mapByColumn.get(columnName) || new Map(), officeId) || null;
  }

  getPropertyTrackerDefinitionsForRow(sourceContext: 'online' | 'offline', officeId: number, propertyLeaseTypeId: number): TrackerConfigurationDefinitionResponse[] {
    const contextType = this.resolvePropertyTrackerContext(propertyLeaseTypeId, sourceContext);
    const contextMaps = sourceContext === 'online' ? this.onlineColumnDefinitionByContext : this.offlineColumnDefinitionByContext;
    const mapByColumn = contextMaps.get(Number(contextType)) || new Map<string, Map<number, TrackerConfigurationDefinitionResponse>>();
    return this.getTrackerDefinitionsForOffice(mapByColumn, officeId);
  }

  onPropertyCheckboxChange(event: { propertyId: string; officeId: number; propertyLeaseTypeId: number }, sourceContext: 'online' | 'offline'): void {
    const ext = event as { propertyId: string; officeId: number; propertyLeaseTypeId: number; __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean; };
    const column = ext.__changedCheckboxColumn;
    if (!column) {
      return;
    }
    const propertyId = (event.propertyId || '').trim();
    const previousValue = ext.__previousCheckboxValue === true;
    const nextValue = ext.__checkboxValue === true;
    if (previousValue === nextValue || !propertyId) {
      return;
    }
    const trackerDefinition = this.getTrackerDefinitionForPropertyRow(sourceContext, column, event.officeId, event.propertyLeaseTypeId);
    if (!trackerDefinition) {
      this.applyPropertyTurnoverCheckboxValue(propertyId, column, previousValue);
      this.publishPropertyTrackerSlice();
      return;
    }
    void this.savePropertyTrackerCheckbox(propertyId, trackerDefinition, nextValue).then(() => {
      this.applyPropertyTurnoverCheckboxValue(propertyId, column, nextValue);
      this.publishPropertyTrackerSlice();
      this.toastr.success('Tracker updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyPropertyTurnoverCheckboxValue(propertyId, column, previousValue);
      this.publishPropertyTrackerSlice();
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
    });
  }

  onPropertyDropdownChange(event: { propertyId: string; officeId: number; propertyLeaseTypeId: number }, sourceContext: 'online' | 'offline'): void {
    const changedColumn = (event as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (!changedColumn) {
      return;
    }
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    const trackerDefinition = this.getTrackerDefinitionForPropertyRow(sourceContext, changedColumn, event.officeId, event.propertyLeaseTypeId);
    if (!trackerDefinition || !this.isTrackerDefinitionMultiSelect(trackerDefinition)) {
      return;
    }
    const selectedLabels = this.readMultiSelectLabels(event, changedColumn);
    void this.savePropertyTrackerMultiSelect(propertyId, trackerDefinition, selectedLabels).then(() => {
      this.applyPropertyTrackerValues();
      this.publishPropertyTrackerSlice();
      this.toastr.success('Tracker updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyPropertyTrackerValues();
      this.publishPropertyTrackerSlice();
      this.toastr.error('Unable to update tracker.', CommonMessage.Error);
    });
  }

  onPropertyCheckAllTracking(event: { propertyId: string; officeId: number; propertyLeaseTypeId: number }, sourceContext: 'online' | 'offline'): void {
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    const definitions = this.getPropertyTrackerDefinitionsForRow(sourceContext, event.officeId, event.propertyLeaseTypeId);
    if (definitions.length === 0) {
      return;
    }
    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            await this.savePropertyTrackerMultiSelect(propertyId, definition, (definition.options || []).map(option => option.label).filter(label => !!label));
            continue;
          }
          await this.savePropertyTrackerCheckbox(propertyId, definition, true);
        }
        this.applyPropertyTrackerValues();
        this.publishPropertyTrackerSlice();
        this.toastr.success('Tracking marked complete.', CommonMessage.Success);
      } catch {
        this.applyPropertyTrackerValues();
        this.publishPropertyTrackerSlice();
        this.toastr.error('Unable to update all tracker checks.', CommonMessage.Error);
      }
    })();
  }

  onPropertyClearTracking(event: { propertyId: string; officeId: number; propertyLeaseTypeId: number }, sourceContext: 'online' | 'offline'): void {
    const propertyId = (event.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    const definitions = this.getPropertyTrackerDefinitionsForRow(sourceContext, event.officeId, event.propertyLeaseTypeId);
    if (definitions.length === 0) {
      return;
    }
    void (async () => {
      try {
        for (const definition of definitions) {
          if (this.isTrackerDefinitionMultiSelect(definition)) {
            await this.savePropertyTrackerMultiSelect(propertyId, definition, []);
            continue;
          }
          await this.savePropertyTrackerCheckbox(propertyId, definition, false);
        }
        this.applyPropertyTrackerValues();
        this.publishPropertyTrackerSlice();
        this.toastr.success('Tracking cleared.', CommonMessage.Success);
      } catch {
        this.applyPropertyTrackerValues();
        this.publishPropertyTrackerSlice();
        this.toastr.error('Unable to clear tracking.', CommonMessage.Error);
      }
    })();
  }

  async savePropertyTrackerCheckbox(propertyId: string, trackerDefinition: TrackerConfigurationDefinitionResponse, isChecked: boolean): Promise<void> {
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
    }
  }

  async savePropertyTrackerMultiSelect(propertyId: string, trackerDefinition: TrackerConfigurationDefinitionResponse, selectedLabels: string[]): Promise<void> {
    const propertyKey = this.utilityService.normalizeId(propertyId);
    const definitionKey = this.utilityService.normalizeId(trackerDefinition.trackerDefinitionId);
    const byDefinitionId = this.propertyTrackerResponsesByProperty.get(propertyKey) || new Map<string, PropertyTrackerResponse>();
    this.propertyTrackerResponsesByProperty.set(propertyKey, byDefinitionId);
    const optionResponses = this.propertyTrackerResponseOptionsByProperty.get(propertyKey) || [];
    const optionById = new Map((trackerDefinition.options || []).map(option => [this.utilityService.normalizeId(option.trackerDefinitionOptionId), option] as const));
    const optionIdByLabel = new Map((trackerDefinition.options || []).map(option => [option.label, this.utilityService.normalizeId(option.trackerDefinitionOptionId)] as const));
    const selectedOptionIds = new Set(selectedLabels.map(label => optionIdByLabel.get(label) || '').filter(optionId => !!optionId));
    let trackerResponse = byDefinitionId.get(definitionKey) || null;
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
    const responseOptionList = optionResponses.filter(option => this.utilityService.normalizeId(option.trackerDefinitionId) === definitionKey);
    const existingOptionIds = new Set(responseOptionList.map(option => this.utilityService.normalizeId(option.trackerDefinitionOptionId)));
    for (const optionId of Array.from(selectedOptionIds).filter(id => !existingOptionIds.has(id))) {
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
    for (const optionId of Array.from(existingOptionIds).filter(id => !selectedOptionIds.has(id))) {
      const option = responseOptionList.find(item => this.utilityService.normalizeId(item.trackerDefinitionOptionId) === optionId);
      if (!option) {
        continue;
      }
      await firstValueFrom(this.propertyService.deletePropertyTrackerResponseOption(option.trackerResponseId, option.trackerDefinitionOptionId));
    }
    this.propertyTrackerResponseOptionsByProperty.set(
      propertyKey,
      optionResponses.filter(option => {
        if (this.utilityService.normalizeId(option.trackerDefinitionId) !== definitionKey) {
          return true;
        }
        return selectedOptionIds.has(this.utilityService.normalizeId(option.trackerDefinitionOptionId));
      })
    );
    if (selectedOptionIds.size === 0 && trackerResponse.trackerResponseId) {
      await firstValueFrom(this.propertyService.deletePropertyTrackerResponse(trackerResponse.trackerResponseId));
      byDefinitionId.delete(definitionKey);
    }
  }

  applyPropertyTurnoverCheckboxValue(propertyId: string, column: string, value: boolean): void {
    const propertyKey = (propertyId || '').trim();
    const applyOnlineOffline = (rows: DashboardPropertyTurnoverRow[]): DashboardPropertyTurnoverRow[] =>
      rows.map(row => ((row.propertyId || '').trim() === propertyKey ? { ...row, [column]: value } : row));
    const applyStatus = (rows: PropertyOfflineStatusDisplay[]): PropertyOfflineStatusDisplay[] =>
      rows.map(row => ((row.propertyId || '').trim() === propertyKey ? { ...row, [column]: value } as PropertyOfflineStatusDisplay : row));
    this.onlinePropertyRows = applyOnlineOffline(this.onlinePropertyRows);
    this.offlinePropertyRows = applyOnlineOffline(this.offlinePropertyRows);
    this.offlineStatusPropertyDisplayRows = applyStatus(this.offlineStatusPropertyDisplayRows);
  }
  //#endregion
}
