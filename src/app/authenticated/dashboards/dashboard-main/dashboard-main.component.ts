import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DashboardPropertyTurnoverRow, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyService } from '../../properties/services/property.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ReservationListDisplay, ReservationRequest } from '../../reservations/models/reservation-model';
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
import { getBedTypeOptionLabels } from '../../properties/models/property-enums';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';

const reservationTurnoverCheckboxColumns = new Set<string>([
  'paymentReceived',
  'welcomeLetterChecked',
  'welcomeLetterSent',
  'readyForArrival',
  'code',
  'departureLetterChecked',
  'departureLetterSent'
]);

@Component({
    standalone: true,
    selector: 'app-dashboard-main',
    imports: [MaterialModule, DataTableComponent],
    templateUrl: './dashboard-main.component.html',
    styleUrl: './dashboard-main.component.scss'
})
export class DashboardMainComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  destroy$ = new Subject<void>();
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

  reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[] = [];
  reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[] = [];
  comingOnlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  goingOfflinePropertyRows: DashboardPropertyTurnoverRow[] = [];

  expandedSections = { monthlyCommissions: true, properties: true, propertyTurnover: true, vacantProperties: true };
  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser', 'offices', 'activeReservations', 'propertyMaintenanceList']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  reservationTurnoverArrivalDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '12ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    'contactName': { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    'companyName': { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    'arrivalDateDisplay': { displayAs: 'Arrival', maxWidth: '18ch', wrap: false, alignment: 'center' },
    'reservationStatusDisplay': { displayAs: 'Status', maxWidth: '16ch', wrap: false },
    'paymentReceived': { displayAs: 'Payment', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'welcomeLetterChecked': { displayAs: 'Ck Ltr', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' },
    'welcomeLetterSent': { displayAs: 'Letter', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' },
    'readyForArrival': { displayAs: 'Ready', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' },
    'code': { displayAs: 'Code', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' }
  };

  reservationTurnoverDepartureDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '12ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '18ch', wrap: false },
    'contactName': { displayAs: 'Contact', maxWidth: '18ch', wrap: false },
    'companyName': { displayAs: 'Company', maxWidth: '18ch', wrap: false },
    'departureDateDisplay': { displayAs: 'Departure', maxWidth: '18ch', wrap: false, alignment: 'center' },
    'reservationStatusDisplay': { displayAs: 'Status', maxWidth: '16ch', wrap: false },
    'departureLetterChecked': { displayAs: 'Ck Ltr', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' },
    'departureLetterSent': { displayAs: 'Letter', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '8ch' },
  };

  propertyOnlineDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableAfter': { displayAs: 'Online', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '12ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '13ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '12ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
  };

  propertyOfflineDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableUntil': { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '12ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '13ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '12ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '12ch', alignment: 'center', options: getBedTypeOptionLabels()},
  };

  propertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' , wrap: false},
    'bedrooms': { displayAs: 'Beds', maxWidth: '15ch', alignment: 'center' },
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

  constructor(
    authService: AuthService,
    private userService: UserService,
    reservationService: ReservationService,
    mixedMappingService: MixedMappingService,
    mappingService: MappingService,
    private router: Router,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    private agentService: AgentService,
    utilityService: UtilityService,
    officeService: OfficeService,
    globalSelectionService: GlobalSelectionService,
    private formatterService: FormatterService,
    private toastr: ToastrService
  ) {
    super(authService, reservationService, mixedMappingService, mappingService, propertyService, maintenanceService, utilityService, officeService, globalSelectionService);
  }

  //#region Dashboard-Main
  override ngOnInit(): void {
    this.setTodayDate();
    this.isAdmin = this.authService.isAdmin();
    this.canViewCommissions = this.authService.canViewCommissions();
    this.canViewAllCommissions = this.authService.isInAccounting();
    this.loadCurrentUser(this.authService.getUser()?.userId ?? '');

    if (this.canViewCommissions) {
      this.loadUsers();
      this.loadAgents();
    } 

    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeBackendData();
    });

    super.ngOnInit();
  }
  //#endregion

  //#region Main Data Setup
  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    void userAssignedId;
    this.buildPropertyTurnoverFromBaseLists();
    this.buildReservationTurnoverFromBaseLists();
    this.buildCommissionsList();
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
  }

  buildPropertyTurnoverFromBaseLists(): void {
    const onlineRows = [...this.onlineProperties];
    onlineRows.sort((a, b) => (Number(a.eventDateSortTime ?? a.availableFromOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableFromOrdinal) || 0));
    this.comingOnlinePropertyRows = onlineRows.map(pm =>
      this.mixedMappingService.mapDashboardMainPropertyTurnoverRow(
        this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm),
        this.getMaintenanceListResponseForPropertyId(pm.propertyId) ?? null,
        pm
      )
    );

    const offlineRows = [...this.offlineProperties];
    offlineRows.sort((a, b) => (Number(a.eventDateSortTime ?? a.availableUntilOrdinal) || 0) - (Number(b.eventDateSortTime ?? b.availableUntilOrdinal) || 0));
    this.goingOfflinePropertyRows = offlineRows.map(pm =>
      this.mixedMappingService.mapDashboardMainPropertyTurnoverRow(
        this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm),
        this.getMaintenanceListResponseForPropertyId(pm.propertyId) ?? null,
        pm
      )
    );
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
      return;
    }

    this.userService.getUserByGuid(userId).pipe(takeUntil(this.destroy$), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser');
      this.resolveCurrentAgentAndFilter();
    })).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        this.currentUserAgentId = this.utilityService.normalizeIdOrNull(userResponse.agentId);
        this.currentUserCommissionRate = Number(userResponse.commissionRate ?? 0);
      },
      error: () => {
        this.profilePictureUrl = null;
        this.currentUserAgentId = null;
        this.currentUserCommissionRate = 0;
      }
    });
  }

  @HostListener('document:mouseup')
  onDocumentMouseup(): void {
    setTimeout(() => this.endCommissionPreview());
  }

  @HostListener('document:touchend')
  onDocumentTouchend(): void {
    setTimeout(() => this.endCommissionPreview());
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

    const getDaysRentedInCurrentMonth = (arrivalOrdinal: number, departureOrdinal: number): number => {
      const overlapStart = Math.max(arrivalOrdinal, monthLo);
      const overlapEnd = Math.min(departureOrdinal, monthHi);
      if (overlapStart > overlapEnd) return 0;
      return this.toJulianDay(overlapEnd) - this.toJulianDay(overlapStart) + 1;
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
        const daysRented = getDaysRentedInCurrentMonth(row.arrivalDateOrdinal!, row.departureDateOrdinal!);
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
    this.userService.getUsers().pipe(takeUntil(this.destroy$), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users');
      this.buildCommissionsList();
    })).subscribe({
      next: (users: UserResponse[]) => {
        this.adminUsers = users || [];
      },
      error: () => {
        this.adminUsers = [];
      }
    });
  }

  loadAgents(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'agents');
    this.agentService.getAgents().pipe(takeUntil(this.destroy$), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents');
      this.buildCommissionsList();
    })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.adminAgents = agents || [];
      },
      error: () => {
        this.adminAgents = [];
      }
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
  onReservationTurnoverCheckboxChange(event: ReservationTurnoverEventDisplay): void {
    const ext = event as ReservationTurnoverEventDisplay & {
      __changedCheckboxColumn?: string;
      __previousCheckboxValue?: boolean;
      __checkboxValue?: boolean;
    };
    const column = ext.__changedCheckboxColumn;
    if (!column || !reservationTurnoverCheckboxColumns.has(column)) {
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

    const patch = { [column]: nextValue } as Partial<ReservationRequest>;
    void this.reservationService.updateModifiedReservation(reservationId, patch).then(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, nextValue);
      this.toastr.success('Reservation updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyReservationTurnoverCheckboxValue(reservationId, column, previousValue);
      this.toastr.error('Unable to update reservation.', CommonMessage.Error);
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
