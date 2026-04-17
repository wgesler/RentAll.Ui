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

  destroy$ = new Subject<void>();
  profilePictureUrl: string | null = null;
  todayDate = '';
  isAdmin: boolean = false;
  currentUserAgentId: string | null = null;
  currentUserAgentCode: string | null = null;
  currentUserCommissionRate: number = 0;
  canViewCommissions: boolean = false;

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
    this.loadCurrentUser(this.authService.getUser()?.userId ?? '');

    if (this.canViewCommissions) {
      this.loadUsers();
      this.loadAgents();
    } 

    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeDashboardData();
    });

    super.ngOnInit();
  }
  //#endregion

  //#region Main Data Setup
  protected override onAfterRecomputeDashboardData(_userAssignedId: string | null): void {
    this.buildPropertyTurnoverFromBaseLists();
    this.buildReservationTurnoverFromBaseLists();
    this.buildCommissionsList();
  }

  buildReservationTurnoverFromBaseLists(): void {
    const office = this.selectedOffice;
    const matchesOffice = (row: { officeId: number }): boolean =>
      !office || row.officeId === office.officeId;

    const arrivalRows = this.arrivalReservations.filter(matchesOffice);
    arrivalRows.sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0));
    this.reservationTurnoverArrivalRows = arrivalRows.map(r =>
      this.mappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r)
    );

    const departureRows = this.departureReservations.filter(matchesOffice);
    departureRows.sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0));
    this.reservationTurnoverDepartureRows = departureRows.map(r =>
      this.mappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(r)
    );
  }

  buildPropertyTurnoverFromBaseLists(): void {
    const propertiesForScope = !this.selectedOffice ? this.propertyList : this.propertyList.filter(p => p.officeId === this.selectedOffice!.officeId);
    const todayTime = this.todayAtMidnight.getTime();
    const windowEndTime = this.fifteenDaysAtMidnight.getTime();

    const inComingWindow = (calendar: string | null | undefined): boolean => {
      const d = this.utilityService.parseDateOnlyStringToDate(calendar ?? null);
      if (!d) {
        return false;
      }
      const t = d.getTime();
      return t >= todayTime && t <= windowEndTime;
    };

    this.comingOnlinePropertyRows = propertiesForScope
      .filter(p => p.isActive && inComingWindow(p.availableFrom))
      .sort((a, b) => {
        const ad = this.utilityService.parseDateOnlyStringToDate(a.availableFrom ?? null)?.getTime() ?? 0;
        const bd = this.utilityService.parseDateOnlyStringToDate(b.availableFrom ?? null)?.getTime() ?? 0;
        return ad - bd;
      })
      .map(p =>
        this.mixedMappingService.mapDashboardPropertyTurnoverRow(p, this.maintenanceByPropertyId.get(p.propertyId) ?? null)
      );

    this.goingOfflinePropertyRows = propertiesForScope
      .filter(p => p.isActive && inComingWindow(p.availableUntil))
      .sort((a, b) => {
        const ad = this.utilityService.parseDateOnlyStringToDate(a.availableUntil ?? null)?.getTime() ?? 0;
        const bd = this.utilityService.parseDateOnlyStringToDate(b.availableUntil ?? null)?.getTime() ?? 0;
        return ad - bd;
      })
      .map(p =>
        this.mixedMappingService.mapDashboardPropertyTurnoverRow(p, this.maintenanceByPropertyId.get(p.propertyId) ?? null)
      );
  }

  buildCommissionsList(): void {
    if (!this.canViewCommissions) {
      return;
    }

    if (this.isAdmin) {
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

    if (this.isAdmin) {
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
    if (!this.canViewCommissions) {
      return false;
    }
    if (this.isAdmin) {
      return true;
    }
    return !!this.currentUserAgentId && Number(this.currentUserCommissionRate) > 0;
  }

  getCommissions(): void {
    if (!this.showCommissionsUi) {
      this.monthlyCommissions = [];
      return;
    }

    if (!this.isAdmin && !this.currentUserAgentCode) {
      this.monthlyCommissions = [];
      return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthStart.setHours(0, 0, 0, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const overlapsCurrentMonth = (arrivalDate?: string, departureDate?: string): boolean => {
      if (!arrivalDate || !departureDate) {
        return false;
      }
      const reservationStart = this.utilityService.parseDateOnlyStringToDate(arrivalDate);
      const reservationEnd = this.utilityService.parseDateOnlyStringToDate(departureDate);
      if (!reservationStart || !reservationEnd) {
        return false;
      }
      const reservationEndEod = new Date(reservationEnd.getTime());
      reservationEndEod.setHours(23, 59, 59, 999);
      return reservationStart.getTime() <= monthEnd.getTime() && reservationEndEod.getTime() >= monthStart.getTime();
    };

    const getDaysRentedInCurrentMonth = (arrivalDate?: string, departureDate?: string): number => {
      if (!arrivalDate || !departureDate) {
        return 0;
      }
      const reservationStart = this.utilityService.parseDateOnlyStringToDate(arrivalDate);
      const reservationEnd = this.utilityService.parseDateOnlyStringToDate(departureDate);
      if (!reservationStart || !reservationEnd) {
        return 0;
      }
      const reservationEndEod = new Date(reservationEnd.getTime());
      reservationEndEod.setHours(23, 59, 59, 999);

      const overlapStart = reservationStart > monthStart ? reservationStart : monthStart;
      const overlapEnd = reservationEndEod < monthEnd ? reservationEndEod : monthEnd;
      if (overlapStart.getTime() > overlapEnd.getTime()) {
        return 0;
      }

      // Inclusive day count.
      return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };

    const getCommission = (daysRented: number, commissionRate: number): number => {
      if (daysRented <= 0) {
        return 0;
      }

      const isFullMonth = daysRented === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (isFullMonth || daysRented >= 30) {
        return Number(commissionRate.toFixed(2));
      }

      return Number(((commissionRate / 30) * daysRented).toFixed(2));
    };

    const agentCode = (this.currentUserAgentCode || '').trim().toLowerCase();
    const resolveCommissionRate = (reservation: ReservationListDisplay): number => {
      if (this.isAdmin) {
        const normalizedReservationAgentCode = (reservation.agentCode || '').trim().toLowerCase();
        return Number(this.adminCommissionRatesByAgentCode.get(normalizedReservationAgentCode) ?? 0);
      }
      return Number(this.currentUserCommissionRate ?? 0);
    };

    const reservationsForCommissions = !this.selectedOffice
      ? this.reservationList
      : this.reservationList.filter(r => r.officeId === this.selectedOffice!.officeId);
    this.monthlyCommissions = reservationsForCommissions
      .filter(reservation =>
        this.isAdmin
          ? (reservation.agentCode || '').trim().length > 0
          : (reservation.agentCode || '').trim().toLowerCase() === agentCode
      )
      .filter(reservation => resolveCommissionRate(reservation) > 0)
      .filter(reservation =>
        overlapsCurrentMonth(reservation.arrivalDate, reservation.departureDate)
      )
      .map(reservation => {
        const commissionRate = resolveCommissionRate(reservation);
        const daysRented = getDaysRentedInCurrentMonth(reservation.arrivalDate, reservation.departureDate);
        const commission = getCommission(daysRented, commissionRate);
        return {
          ...reservation,
          daysRented: daysRented,
          commission,
          commissionDisplay: this.formatUsd(commission)
        };
      })
      .filter(reservation => Number(reservation.commission ?? 0) > 0)
      .sort((a, b) => {
        const agentA = (a.agentCode || '').trim().toLowerCase();
        const agentB = (b.agentCode || '').trim().toLowerCase();
        const agentCompare = agentA.localeCompare(agentB);
        if (agentCompare !== 0) {
          return agentCompare;
        }

        const arrivalA = this.utilityService.parseDateOnlyStringToDate(a.arrivalDate)?.getTime() ?? 0;
        const arrivalB = this.utilityService.parseDateOnlyStringToDate(b.arrivalDate)?.getTime() ?? 0;
        if (arrivalA !== arrivalB) {
          return arrivalA - arrivalB;
        }

        return (a.reservationCode || '').localeCompare(b.reservationCode || '');
      });
  }

  getMonthlyCommissionTotal(): number {
    return this.monthlyCommissions.reduce((total, reservation) => total + (reservation.commission || 0), 0);
  }

  getCurrentMonthDisplay(): string {
    return new Date().toLocaleDateString('en-US', { month: 'long' });
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
    return '$' + this.formatterService.currency(amount);
  }

  onCommissionPreviewMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (!this.showCommissionsUi || !this.isAdmin || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    event.preventDefault();
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  onCommissionPreviewTouchStart(event: TouchEvent): void {
    if (!this.showCommissionsUi || !this.isAdmin || this.getMonthlyCommissionTotal() <= 0) {
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
      this.toastr.success('Reservation updated.', CommonMessage.Success);
      this.refreshReservationListsFromServer();
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

  refreshReservationListsFromServer(): void {
    this.reservationService.getReservationList().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.reservationList = this.mappingService.mapReservationList(response);
        this.activeReservationList = this.reservationList.filter(r => r.isActive === true);
        this.recomputeDashboardData();
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Utility Methods
  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }
  //#endregion
}
