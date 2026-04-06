import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, finalize, map, skip, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse, PropertyRequest, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ExtraFeeLineRequest, ReservationListDisplay, ReservationListResponse, ReservationRequest, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { UserGroups } from '../../users/models/user-enums';
import { FormsModule } from '@angular/forms';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { getPropertyStatus, getPropertyStatusLetter, getPropertyStatuses } from '../../properties/models/property-enums';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';

export interface PropertyVacancyDisplay extends PropertyListResponse {
  vacancyDays: number | null;
  vacancyDaysDisplay: string | number;
  lastDepartureDate: string | null;
}

export interface MonthlyCommissionDisplay extends ReservationListDisplay {
  daysRented: number;
  commission: number;
}

export interface MonthlyCommissionTileRow {
  agentCode: string;
  amount: number;
}

type TurnoverReservationDisplay = ReservationListDisplay & {
  propertyStatusId?: number;
  propertyStatusText: string;
  propertyStatusLetter: string;
  propertyStatusDropdown: {
    value: string;
    isOverridable: boolean;
    options?: string[];
    panelClass?: string | string[];
    triggerText?: string;
    toString: () => string;
  };
};

type TurnoverCheckboxColumn = 'paymentReceived' | 'welcomeLetterSent' | 'readyForArrival' | 'code' | 'departureLetterSent';

@Component({
    standalone: true,
    selector: 'app-dashboard-main',
    imports: [MaterialModule, DataTableComponent, FormsModule],
    templateUrl: './dashboard-main.component.html',
    styleUrl: './dashboard-main.component.scss'
})
export class DashboardMainComponent implements OnInit, OnDestroy {
  user: JwtUser | null = null;
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;
  private usersSubscription?: Subscription;
  private agentsSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;

  allReservations: ReservationListDisplay[] = [];
  upcomingArrivals: TurnoverReservationDisplay[] = [];
  upcomingDepartures: TurnoverReservationDisplay[] = [];
  isLoadingReservations: boolean = false;
  
  todayArrivals: ReservationListDisplay[] = [];
  todayDepartures: ReservationListDisplay[] = [];
  tomorrowArrivals: ReservationListDisplay[] = [];
  tomorrowDepartures: ReservationListDisplay[] = [];
  todayDate: string = '';
  currentUserAgentId: string | null = null;
  currentUserAgentCode: string | null = null;
  currentUserCommissionRate: number = 0;
  isAdmin: boolean = false;
  canViewCommissions: boolean = false;
  adminUsers: UserResponse[] = [];
  adminAgents: AgentResponse[] = [];
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  adminCommissionRatesByAgentCode = new Map<string, number>();
  showMonthlyCommissionAmount: boolean = false;
  showCommissionBreakdown: boolean = false;
  monthlyCommissions: MonthlyCommissionDisplay[] = [];

  allProperties: PropertyListResponse[] = [];
  rentedCount: number = 0;
  vacantCount: number = 0;
  isLoadingProperties: boolean = false;
  propertiesByVacancy: PropertyVacancyDisplay[] = [];
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown = true;
  organizationId = '';
  preferredOfficeId: number | null = null;

  expandedSections = { arrivals: true, departures: true, monthlyCommissions: true, properties: true, vacantProperties: true };
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));

  arrivalsReservationsDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '20ch', wrap: false},
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' , wrap: false},
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '20ch' , alignment: 'center' },
    'propertyStatusDropdown': { displayAs: 'Status', maxWidth: '18ch', options: this.propertyStatusLabels },
    'paymentReceived': { displayAs: 'Payment', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'welcomeLetterSent': { displayAs: 'Letter', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'readyForArrival': { displayAs: 'Ready', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'code': { displayAs: 'Code', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
   };

  departuresReservationsDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '20ch', wrap: false},
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' , wrap: false},
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    'propertyStatusDropdown': { displayAs: 'Status', maxWidth: '18ch', options: this.propertyStatusLabels },
    'departureLetterSent': { displayAs: 'Letter', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
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
    'commission': { displayAs: 'Commission', maxWidth: '25ch', alignment: 'center' },
  };

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reservationService: ReservationService,
    private mappingService: MappingService,
    private router: Router,
    private propertyService: PropertyService,
    private agentService: AgentService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private toastr: ToastrService
  ) { }

  //#region Dashboard-Main
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.canViewCommissions =
      this.utilityService.hasRole(this.user?.userGroups, UserGroups.SuperAdmin)
      || this.utilityService.hasRole(this.user?.userGroups, UserGroups.Admin)
      || this.utilityService.hasRole(this.user?.userGroups, UserGroups.Agent);
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;
    this.setTodayDate();
    if (!this.user?.userId) {
      return;
    }

    this.loadOffices();
    this.loadReservations();
    this.loadProperties();
    this.loadCurrentUser(this.user.userId);

    if (this.isAdmin) {
      this.adminUsers = [];
      this.adminAgents = [];
      this.utilityService.addLoadItem(this.itemsToLoad$, 'users');
      this.utilityService.addLoadItem(this.itemsToLoad$, 'agents');
      this.loadUsers();
      this.loadAgents();
    }

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: null, requireExplicitOfficeUnset: false }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(this.globalOfficeSelectionService.getSelectedOfficeIdValue());
      }
    });
  }

  loadCurrentUser(userId: string): void {
    this.userSubscription = this.userService.getUserByGuid(userId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser'); if (this.isAdmin) { this.tryResolveAdminProfilePictureAndCommissions(); } })).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        this.currentUserAgentId = userResponse.agentId ?? this.user?.agentId ?? null;
        this.currentUserCommissionRate = Number(userResponse.commissionRate ?? 0);
        if (!this.isAdmin) {
          this.resolveCurrentAgentAndFilter();
        }
      },
      error: () => {
        this.profilePictureUrl = null;
        this.currentUserAgentId = this.user?.agentId ?? null;
        this.currentUserCommissionRate = 0;
        if (!this.isAdmin) {
          this.adminCommissionRatesByAgentCode.clear();
          this.resolveCurrentAgentAndFilter();
        }
      }
    });
  }

  loadUsers(): void {
    this.usersSubscription = this.userService.getUsers().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users'); this.tryResolveAdminProfilePictureAndCommissions(); })).subscribe({
      next: (users: UserResponse[]) => {
        this.adminUsers = users || [];
      },
      error: () => {
        this.adminUsers = [];
      }
    });
  }

  loadAgents(): void {
    this.agentsSubscription = this.agentService.getAgents().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'); this.tryResolveAdminProfilePictureAndCommissions(); })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.adminAgents = agents || [];
      },
      error: () => {
        this.adminAgents = [];
      }
    });
  }
  
  loadReservations(): void {
    this.isLoadingReservations = true;
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.allReservations = this.mappingService.mapReservationList(response);
        this.recomputeDashboardData();
        this.isLoadingReservations = false;
      },
      error: () => {
        this.allReservations = [];
        this.upcomingArrivals = [];
        this.upcomingDepartures = [];
        this.monthlyCommissions = [];
        this.isLoadingReservations = false;
      }
    });
  }

  loadProperties(): void {
    this.isLoadingProperties = true;
    this.propertyService.getPropertyList().pipe(take(1)).subscribe({
      next: (response: PropertyListResponse[]) => {
        this.allProperties = response.filter(p => p.isActive);
        this.recomputeDashboardData();
        this.isLoadingProperties = false;
      },
      error: () => {
        this.allProperties = [];
        this.rentedCount = 0;
        this.vacantCount = 0;
        this.isLoadingProperties = false;
      }
    });
  }
  //#endregion

  //#region Setting and Filtering
  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.recomputeDashboardData();
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.recomputeDashboardData();
  }

  recomputeDashboardData(): void {
    this.filterUpcomingReservations();
    this.filterMonthlyCommissions();
    if (this.allProperties.length > 0) {
      this.calculatePropertyStatus();
    } else {
      this.rentedCount = 0;
      this.vacantCount = 0;
      this.propertiesByVacancy = [];
    }
  }

  getOfficeFilteredReservations(): ReservationListDisplay[] {
    if (!this.selectedOffice) {
      return this.allReservations;
    }
    return this.allReservations.filter(reservation => reservation.officeId === this.selectedOffice?.officeId);
  }

  getOfficeFilteredProperties(): PropertyListResponse[] {
    if (!this.selectedOffice) {
      return this.allProperties;
    }
    return this.allProperties.filter(property => property.officeId === this.selectedOffice?.officeId);
  }

  tryResolveAdminProfilePictureAndCommissions(): void {
    const pendingAdminItems = this.itemsToLoad$.value;
    if (pendingAdminItems.has('currentUser') || pendingAdminItems.has('users') || pendingAdminItems.has('agents')) {
      return;
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

  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails && userResponse.fileDetails.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
    } else if (userResponse.profilePath) {
      this.profilePictureUrl = userResponse.profilePath;
    } else {
      this.profilePictureUrl = null;
    }
  }
  
  getFullName(): string {
    if (!this.user) {
      return '';
    }
    return `${this.user.firstName} ${this.user.lastName}`.trim();
  }
  
  getTodayTotal(): number {
    return this.todayArrivals.length + this.todayDepartures.length;
  }

  getTomorrowTotal(): number {
    return this.tomorrowArrivals.length + this.tomorrowDepartures.length;
  }

  getMonthlyCommissionTotal(): number {
    return this.monthlyCommissions.reduce((total, reservation) => total + (reservation.commission || 0), 0);
  }

  getMonthlyCommissionTotalDisplay(): string {
    return `$${this.getMonthlyCommissionTotal().toFixed(2)}`;
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
    if (amount <= 0) {
      return `$${amount.toFixed(2)}`;
    }

    if (this.showMonthlyCommissionAmount) {
      return `$${amount.toFixed(2)}`;
    }
    return '$******';
  }

  toggleMonthlyCommissionAmount(): void {
    this.showMonthlyCommissionAmount = !this.showMonthlyCommissionAmount;
  }

  onCommissionTileClick(event: MouseEvent): void {
    if (!this.isAdmin || this.getMonthlyCommissionTotal() <= 0) {
      this.showCommissionBreakdown = false;
      this.showMonthlyCommissionAmount = false;
      return;
    }
    event.stopPropagation();
    this.showCommissionBreakdown = !this.showCommissionBreakdown;
    if (!this.showCommissionBreakdown) {
      this.showMonthlyCommissionAmount = false;
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showCommissionBreakdown) {
      this.showMonthlyCommissionAmount = false;
    }
    this.showCommissionBreakdown = false;
  }
  
  setTodayDate(): void {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    this.todayDate = today.toLocaleDateString('en-US', options);
  }

  filterUpcomingReservations(): void {
    const officeFilteredReservations = this.getOfficeFilteredReservations();
    const propertyStatusByPropertyId = new Map<string, number>(
      this.getOfficeFilteredProperties().map(property => [property.propertyId, property.propertyStatusId])
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999);

    this.todayArrivals = officeFilteredReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === today.getTime();
    });

    this.todayDepartures = officeFilteredReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === today.getTime();
    });

    this.tomorrowArrivals = officeFilteredReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === tomorrow.getTime();
    });

    this.tomorrowDepartures = officeFilteredReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === tomorrow.getTime();
    });

    this.upcomingArrivals = officeFilteredReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      
      return arrivalDate.getTime() >= today.getTime() && 
             arrivalDate.getTime() <= fifteenDaysFromNow.getTime();
    }).sort((a, b) => {
      const aDate = this.parseDateAtMidnight(a.arrivalDate);
      const bDate = this.parseDateAtMidnight(b.arrivalDate);
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    }).map(reservation => this.mapTurnoverReservationStatus(reservation, propertyStatusByPropertyId));

    this.upcomingDepartures = officeFilteredReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      
      return departureDate.getTime() >= today.getTime() && 
             departureDate.getTime() <= fifteenDaysFromNow.getTime();
    }).sort((a, b) => {
      const aDate = this.parseDateAtMidnight(a.departureDate);
      const bDate = this.parseDateAtMidnight(b.departureDate);
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    }).map(reservation => this.mapTurnoverReservationStatus(reservation, propertyStatusByPropertyId));
  }

  resolveCurrentAgentAndFilter(): void {
    if (this.isAdmin) {
      this.currentUserAgentCode = 'ALL';
      this.filterMonthlyCommissions();
      return;
    }

    if (!this.currentUserAgentId) {
      this.currentUserAgentCode = null;
      this.filterMonthlyCommissions();
      return;
    }

    this.agentService.getAgents().pipe(take(1)).subscribe({
      next: (agents: AgentResponse[]) => {
        const assignedAgent = (agents || []).find(agent => agent.agentId === this.currentUserAgentId) || null;
        this.currentUserAgentCode = assignedAgent?.agentCode ?? null;
        this.filterMonthlyCommissions();
      },
      error: () => {
        this.currentUserAgentCode = null;
        this.filterMonthlyCommissions();
      }
    });
  }

  filterMonthlyCommissions(): void {
    if (!this.canViewCommissions) {
      this.monthlyCommissions = [];
      return;
    }

    if (!this.isAdmin && !this.currentUserAgentCode) {
      this.monthlyCommissions = [];
      return;
    }

    if (!this.isAdmin && Number(this.currentUserCommissionRate ?? 0) <= 0) {
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
      const reservationStart = new Date(arrivalDate);
      const reservationEnd = new Date(departureDate);
      reservationStart.setHours(0, 0, 0, 0);
      reservationEnd.setHours(23, 59, 59, 999);
      return reservationStart.getTime() <= monthEnd.getTime() && reservationEnd.getTime() >= monthStart.getTime();
    };

    const getDaysRentedInCurrentMonth = (arrivalDate?: string, departureDate?: string): number => {
      if (!arrivalDate || !departureDate) {
        return 0;
      }
      const reservationStart = new Date(arrivalDate);
      const reservationEnd = new Date(departureDate);
      reservationStart.setHours(0, 0, 0, 0);
      reservationEnd.setHours(23, 59, 59, 999);

      const overlapStart = reservationStart > monthStart ? reservationStart : monthStart;
      const overlapEnd = reservationEnd < monthEnd ? reservationEnd : monthEnd;
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

    this.monthlyCommissions = this.getOfficeFilteredReservations()
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
        return {
          ...reservation,
          daysRented: daysRented,
          commission: getCommission(daysRented, commissionRate)
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

        const arrivalA = this.parseDateAtMidnight(a.arrivalDate)?.getTime() ?? 0;
        const arrivalB = this.parseDateAtMidnight(b.arrivalDate)?.getTime() ?? 0;
        if (arrivalA !== arrivalB) {
          return arrivalA - arrivalB;
        }

        return (a.reservationCode || '').localeCompare(b.reservationCode || '');
      });
  }

  //#endregion

  //#region Routing Methods
  goToReservation(event: ReservationListDisplay): void {
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
  //#endregion

  //#region Dynamic Update Methods
  onTurnoverReservationCheckboxChange(event: TurnoverReservationDisplay): void {
    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn as TurnoverCheckboxColumn | undefined;
    if (!this.isTurnoverCheckboxColumn(changedCheckboxColumn)) {
      return;
    }

    const previousValue = this.toBoolean((event as any)?.__previousCheckboxValue);
    const nextValue = this.toBoolean((event as any)?.__checkboxValue);
    if (previousValue === nextValue) {
      return;
    }

    this.applyTurnoverCheckboxValue(event.reservationId, changedCheckboxColumn, nextValue);

    this.reservationService.getReservationByGuid(event.reservationId).pipe(take(1), 
      switchMap((reservation: ReservationResponse) => {
        const reservationRequest = this.buildReservationRequestForCheckboxUpdate(reservation, changedCheckboxColumn, nextValue);
        return this.reservationService.updateReservation(reservationRequest).pipe(take(1));
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Reservation updated.', CommonMessage.Success);
      },
      error: (err: any) => {
        this.applyTurnoverCheckboxValue(event.reservationId, changedCheckboxColumn, previousValue);
        const validationMessage = this.getReservationUpdateErrorMessage(err);
        if (validationMessage) {
          this.toastr.error(validationMessage, CommonMessage.Error, { timeOut: 10000 });
          return;
        }
        this.toastr.error('Unable to update reservation.', CommonMessage.Error);
      }
    });
  }

  onTurnoverPropertyStatusChange(event: TurnoverReservationDisplay): void {
    const selectedLabel = event.propertyStatusDropdown?.value ?? '';
    const selectedStatusId = this.propertyStatusByLabel.get(selectedLabel);
    const previousStatusId = event.propertyStatusId;
    const previousLabel = event.propertyStatusText;

    if (selectedStatusId === undefined) {
      event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(previousLabel, previousStatusId);
      return;
    }

    if (selectedStatusId === previousStatusId) {
      return;
    }

    event.propertyStatusLetter = getPropertyStatusLetter(selectedStatusId);
    event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(selectedLabel, selectedStatusId, false);

    this.propertyService.getPropertyByGuid(event.propertyId).pipe(take(1),
      switchMap((property: PropertyResponse) => this.propertyService.updateProperty(this.buildPropertyStatusUpdateRequest(property, selectedStatusId)).pipe(take(1))),
      finalize(() => {
        event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(event.propertyStatusText, event.propertyStatusId);
      })
    ).subscribe({
      next: () => {
        this.allProperties = this.allProperties.map(property =>
          property.propertyId === event.propertyId
            ? { ...property, propertyStatusId: selectedStatusId }
            : property
        );
        this.recomputeDashboardData();
        this.toastr.success('Property status updated.', CommonMessage.Success);
      },
      error: () => {
        event.propertyStatusId = previousStatusId;
        event.propertyStatusText = previousLabel;
        event.propertyStatusLetter = getPropertyStatusLetter(previousStatusId ?? -1);
        event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(previousLabel, previousStatusId);
        this.toastr.error('Unable to update property status.', CommonMessage.Error);
      }
    });
  }

  buildPropertyStatusDropdownCell(
    label: string,
    statusId?: number,
    isOverridable: boolean = true
  ): TurnoverReservationDisplay['propertyStatusDropdown'] {
    return {
      value: label,
      isOverridable,
      options: this.propertyStatusLabels,
      panelClass: ['datatable-dropdown-panel', 'dashboard-status-panel'],
      toString: () => label
    };
  }

  isTurnoverCheckboxColumn(value: string | undefined): value is TurnoverCheckboxColumn {
    return value === 'paymentReceived'
      || value === 'welcomeLetterSent'
      || value === 'readyForArrival'
      || value === 'code'
      || value === 'departureLetterSent';
  }

  applyTurnoverCheckboxValue(reservationId: string, column: TurnoverCheckboxColumn, value: boolean): void {
    const nextValue = !!value;
    this.allReservations = this.allReservations.map(reservation =>
      reservation.reservationId === reservationId
        ? { ...reservation, [column]: nextValue }
        : reservation
    );
    this.upcomingArrivals = this.upcomingArrivals.map(reservation =>
      reservation.reservationId === reservationId
        ? { ...reservation, [column]: nextValue }
        : reservation
    );
    this.upcomingDepartures = this.upcomingDepartures.map(reservation =>
      reservation.reservationId === reservationId
        ? { ...reservation, [column]: nextValue }
        : reservation
    );
  }

  buildReservationRequestForCheckboxUpdate(
    reservation: ReservationResponse,
    column: TurnoverCheckboxColumn,
    value: boolean
  ): ReservationRequest {
    const paymentReceived = column === 'paymentReceived' ? value : this.toBoolean(reservation.paymentReceived);
    const welcomeLetterSent = column === 'welcomeLetterSent' ? value : this.toBoolean(reservation.welcomeLetterSent);
    const readyForArrival = column === 'readyForArrival' ? value : this.toBoolean(reservation.readyForArrival);
    const code = column === 'code' ? value : this.toBoolean(reservation.code);
    const departureLetterSent = column === 'departureLetterSent' ? value : this.toBoolean(reservation.departureLetterSent);

    const extraFeeLines: ExtraFeeLineRequest[] = (reservation.extraFeeLines || []).map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      reservationId: line.reservationId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId,
      costCodeId: line.costCodeId
    }));

    const {
      officeName: _officeName,
      contactName: _contactName,
      createdOn: _createdOn,
      createdBy: _createdBy,
      modifiedOn: _modifiedOn,
      modifiedBy: _modifiedBy,
      extraFeeLines: _extraFeeLines,
      ...requestBase
    } = reservation;

    return {
      ...requestBase,
      organizationId: reservation.organizationId || '',
      tenantName: reservation.tenantName || '',
      referenceNo: reservation.referenceNo || '',
      lockBoxCode: reservation.lockBoxCode ?? null,
      unitTenantCode: reservation.unitTenantCode ?? null,
      reservationNoticeId: reservation.reservationNoticeId ?? 0,
      depositTypeId: reservation.depositTypeId ?? 0,
      petDescription: reservation.petDescription ?? null,
      extraFeeLines,
      notes: reservation.notes ?? null,
      allowExtensions: reservation.allowExtensions,
      paymentReceived,
      welcomeLetterSent,
      readyForArrival,
      code,
      departureLetterSent,
      currentInvoiceNo: reservation.currentInvoiceNo,
      creditDue: reservation.creditDue,
      isActive: reservation.isActive
    };
  }

  toBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  getReservationUpdateErrorMessage(error: any): string {
    if (!error || error.status !== 400) {
      return '';
    }

    const payload = error.error;
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const baseMessage = payload.title || payload.message || payload.Message || 'Validation failed.';
    const details = payload.errors;
    if (!details || typeof details !== 'object') {
      return baseMessage;
    }

    const fieldMessages: string[] = [];
    Object.keys(details).forEach(key => {
      const errors = details[key];
      if (Array.isArray(errors) && errors.length > 0) {
        fieldMessages.push(`${key}: ${errors.join(', ')}`);
      }
    });

    if (fieldMessages.length === 0) {
      return baseMessage;
    }

    return `${baseMessage}\n${fieldMessages.join('\n')}`;
  }

  buildPropertyStatusUpdateRequest(property: PropertyResponse, propertyStatusId: number): PropertyRequest {
    const { officeName: _officeName, parkingNotes, ...requestBase } = property;
    return {
      ...requestBase,
      propertyStatusId,
      parkingnotes: parkingNotes
    };
  }
  //#endregion

  //#region Table Calculations
  calculatePropertyStatus(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const officeFilteredProperties = this.getOfficeFilteredProperties();
    const officeFilteredReservations = this.getOfficeFilteredReservations();
    const activeReservations = officeFilteredReservations.filter(reservation => reservation.isActive);
    const rentedPropertyIds = new Set<string>();
    const latestPastDepartureByProperty = new Map<string, Date>();

    activeReservations.forEach(reservation => {
      const arrivalDate = this.parseDateAtMidnight(reservation.arrivalDate);
      const departureDate = this.parseDateAtMidnight(reservation.departureDate);
      if (!arrivalDate || !departureDate || !reservation.propertyId) {
        return;
      }
      if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
        rentedPropertyIds.add(reservation.propertyId);
      }
    });

    officeFilteredReservations.forEach(reservation => {
      if (!reservation.propertyId) {
        return;
      }
      const departureDate = this.parseDateAtMidnight(reservation.departureDate);
      if (!departureDate || departureDate.getTime() > today.getTime()) {
        return;
      }
      const existingLatestDeparture = latestPastDepartureByProperty.get(reservation.propertyId);
      if (!existingLatestDeparture || departureDate.getTime() > existingLatestDeparture.getTime()) {
        latestPastDepartureByProperty.set(reservation.propertyId, departureDate);
      }
    });

    this.propertiesByVacancy = officeFilteredProperties.map(property => {
      const isCurrentlyRented = rentedPropertyIds.has(property.propertyId);
      const latestPastDeparture = latestPastDepartureByProperty.get(property.propertyId);

      const vacancyDays = isCurrentlyRented
        ? 0
        : latestPastDeparture
          ? Math.max(Math.floor((today.getTime() - latestPastDeparture.getTime()) / (1000 * 60 * 60 * 24)), 0)
          : null;
      const vacancyDaysDisplay: string | number = vacancyDays === null ? 'Never rented' : vacancyDays;
      const lastDepartureDate = this.mappingService.mapVacantPropertyLastDepartureDate(latestPastDeparture);

      return {
        propertyId: property.propertyId,
        propertyCode: property.propertyCode,
        propertyLeaseId: property.propertyLeaseId,
        shortAddress: property.shortAddress,
        officeId: property.officeId,
        officeName: property.officeName,
        owner1Id: property.owner1Id,
        vendorId: property.vendorId,
        contactName: property.contactName,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        accomodates: property.accomodates,
        squareFeet: property.squareFeet,
        monthlyRate: property.monthlyRate,
        dailyRate: property.dailyRate,
        propertyTypeId: property.propertyTypeId,
        departureFee: property.departureFee,
        petFee: property.petFee,
        maidServiceFee: property.maidServiceFee,
        propertyStatusId: property.propertyStatusId,
        bedroomId1: property.bedroomId1,
        bedroomId2: property.bedroomId2,
        bedroomId3: property.bedroomId3,
        bedroomId4: property.bedroomId4,
        isActive: property.isActive,
        vacancyDays,
        vacancyDaysDisplay,
        lastDepartureDate
      };
    }).filter(property => {
      if (property.vacancyDays === null) {
        return true;
      }
      return typeof property.vacancyDays === 'number' && property.vacancyDays > 0;
    }).sort((a, b) => {
      const aDays = a.vacancyDays;
      const bDays = b.vacancyDays;

      if (aDays === null && bDays === null) {
        return (a.propertyCode || '').localeCompare(b.propertyCode || '');
      }
      if (aDays === null) {
        return -1;
      }
      if (bDays === null) {
        return 1;
      }
      return bDays - aDays;
    });

    this.rentedCount = rentedPropertyIds.size;
    this.vacantCount = this.propertiesByVacancy.length;
  }

  parseDateAtMidnight(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  mapTurnoverReservationStatus(
    reservation: ReservationListDisplay,
    propertyStatusByPropertyId: Map<string, number>
  ): TurnoverReservationDisplay {
    const propertyStatusId = propertyStatusByPropertyId.get(reservation.propertyId);
    const propertyStatusText = getPropertyStatus(propertyStatusId);
    const propertyStatusLetter = getPropertyStatusLetter(propertyStatusId ?? -1);
    return {
      ...reservation,
      propertyStatusId,
      propertyStatusText,
      propertyStatusLetter,
      propertyStatusDropdown: this.buildPropertyStatusDropdownCell(propertyStatusText, propertyStatusId)
    };
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.usersSubscription?.unsubscribe();
    this.agentsSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
  }
  //#endregion
}
