import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, catchError, finalize, map, of, skip, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { DashboardPropertyTurnoverRow } from '../../shared/models/mixed-models';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ReservationListDisplay, ReservationListResponse, ReservationRequest, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { MaintenanceListResponse } from '../../maintenance/models/maintenance.model';
import { MaintenanceService } from '../../maintenance/services/maintenance.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { UserGroups } from '../../users/models/user-enums';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { getBedSizeTypes } from '../../properties/models/property-enums';
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

type TurnoverReservationDisplay = ReservationListDisplay;

type TurnoverCheckboxColumn =
  | 'paymentReceived'
  | 'welcomeLetterChecked'
  | 'welcomeLetterSent'
  | 'readyForArrival'
  | 'code'
  | 'departureLetterChecked'
  | 'departureLetterSent';

@Component({
    standalone: true,
    selector: 'app-dashboard-main',
    imports: [MaterialModule, DataTableComponent],
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
  comingOnlinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  goingOfflinePropertyRows: DashboardPropertyTurnoverRow[] = [];
  maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
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
  organizationId = '';
  preferredOfficeId: number | null = null;
  todayAtMidnight: Date = new Date();
  fifteenDaysOut: Date = new Date();

  expandedSections = { arrivals: true, departures: true, monthlyCommissions: true, properties: true, propertyTurnover: true, vacantProperties: true };
  private readonly bedTypeOptions: string[] = getBedSizeTypes().map(bed => bed.label);

  arrivalsReservationsDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '20ch', wrap: false},
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' , wrap: false},
    'companyName': { displayAs: 'Company', maxWidth: '15ch' , wrap: false},
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '15ch' , alignment: 'center' },
    'paymentReceived': { displayAs: 'Payment', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'welcomeLetterChecked': { displayAs: 'Ck Ltr', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
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
    'companyName': { displayAs: 'Company', maxWidth: '15ch' , wrap: false},
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    'departureLetterChecked': { displayAs: 'Ck Ltr', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
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

  propertyOnlineDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableAfter': { displayAs: 'Online', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '12ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '13ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '12ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
  };

  propertyOfflineDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' , wrap: false},
    'availableUntil': { displayAs: 'Offline', maxWidth: '15ch', alignment: 'center' },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '12ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '13ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '12ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
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
    private mixedMappingService: MixedMappingService,
    private mappingService: MappingService,
    private router: Router,
    private propertyService: PropertyService,
    private maintenanceService: MaintenanceService,
    private agentService: AgentService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private toastr: ToastrService
  ) { }

  //#region Dashboard-Main
  ngOnInit(): void {
    this.setTodayDate();
    this.initializeDateBoundaries();

    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.canViewCommissions =
      this.authService.hasRole(UserGroups.SuperAdmin)
      || this.authService.hasRole(UserGroups.Admin)
      || this.authService.hasRole(UserGroups.Agent);
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;

    this.loadOffices();
    this.loadReservations();
    this.loadProperties();
    this.loadCurrentUser(this.user?.userId ?? '');

    if (this.isAdmin) {
      this.adminUsers = [];
      this.adminAgents = [];
      this.utilityService.addLoadItem(this.itemsToLoad$, 'users');
      this.utilityService.addLoadItem(this.itemsToLoad$, 'agents');
      this.loadUsers();
      this.loadAgents();
    }

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: null, requireExplicitOfficeUnset: false }).pipe(take(1)).subscribe({
          next: uiState => {
            this.resolveOfficeScope(uiState.selectedOfficeId);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue());
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
        this.comingOnlinePropertyRows = [];
        this.goingOfflinePropertyRows = [];
        this.monthlyCommissions = [];
        this.isLoadingReservations = false;
        this.recomputeDashboardData();
      }
    });
  }

  loadProperties(): void {
    const userId = this.user?.userId || '';
    if (!userId) {
      this.allProperties = [];
      this.maintenanceByPropertyId = new Map();
      this.isLoadingProperties = false;
      this.recomputeDashboardData();
      return;
    }

    this.isLoadingProperties = true;
    this.propertyService.getActivePropertiesBySelectionCriteria(userId).pipe(
      take(1),
      switchMap(properties =>
        this.maintenanceService.getMaintenanceList().pipe(
          take(1),
          catchError(() => of([] as MaintenanceListResponse[])),
          map(maintenanceList => ({ properties: properties || [], maintenanceList: maintenanceList || [] }))
        )
      )
    ).subscribe({
      next: ({ properties, maintenanceList }) => {
        this.allProperties = properties.filter(p => p.isActive);
        this.maintenanceByPropertyId = new Map();
        maintenanceList.forEach(row => {
          if (row?.propertyId) {
            this.maintenanceByPropertyId.set(row.propertyId, row);
          }
        });
        this.recomputeDashboardData();
        this.isLoadingProperties = false;
      },
      error: () => {
        this.allProperties = [];
        this.maintenanceByPropertyId = new Map();
        this.rentedCount = 0;
        this.vacantCount = 0;
        this.isLoadingProperties = false;
        this.recomputeDashboardData();
      }
    });
  }
  //#endregion

  //#region TopBar Methods
  initializeDateBoundaries(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.todayAtMidnight = today;

    const fifteenDaysOut = new Date(today);
    fifteenDaysOut.setDate(fifteenDaysOut.getDate() + 15);
    this.fifteenDaysOut = fifteenDaysOut;
  }
  
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.recomputeDashboardData();
  }

  recomputeDashboardData(): void {
    this.filterProperties();
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

  onCommissionPreviewMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (!this.isAdmin || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    event.preventDefault();
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  onCommissionPreviewTouchStart(event: TouchEvent): void {
    if (!this.isAdmin || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  endCommissionPreview(): void {
    this.showMonthlyCommissionAmount = false;
    this.showCommissionBreakdown = false;
  }

  @HostListener('document:mouseup')
  onDocumentMouseup(): void {
    setTimeout(() => this.endCommissionPreview());
  }

  @HostListener('document:touchend')
  onDocumentTouchend(): void {
    setTimeout(() => this.endCommissionPreview());
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
  //#endregion

  //#region Main Methods
  calculatePropertyStatus(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const officeFilteredProperties = this.getOfficeFilteredProperties();
    const officeFilteredReservations = this.getOfficeFilteredReservations();
    const activeReservations = officeFilteredReservations.filter(reservation => reservation.isActive);
    const rentedPropertyIds = new Set<string>();
    const latestPastDepartureByProperty = new Map<string, Date>();

    activeReservations.forEach(reservation => {
      const arrivalDate = this.utilityService.parseDateOnlyStringToDate(reservation.arrivalDate);
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
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
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
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
        ...property,
        bedroomId1: this.mappingService.readPropertyListBedroomTypeId(property, 1),
        bedroomId2: this.mappingService.readPropertyListBedroomTypeId(property, 2),
        bedroomId3: this.mappingService.readPropertyListBedroomTypeId(property, 3),
        bedroomId4: this.mappingService.readPropertyListBedroomTypeId(property, 4),
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

  filterUpcomingReservations(): void {
    const officeFilteredReservations = this.getOfficeFilteredReservations();
    const today = this.todayAtMidnight;
    const toDateValue = (date: Date): number => (date.getFullYear() * 10000) + ((date.getMonth() + 1) * 100) + date.getDate();
    const todayValue = toDateValue(today);
    const fifteenDaysOutValue = toDateValue(this.fifteenDaysOut);

    const tomorrow = new Date(this.todayAtMidnight);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowValue = toDateValue(tomorrow);

    this.todayArrivals = officeFilteredReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = this.utilityService.parseDateOnlyStringToDate(reservation.arrivalDate);
      if (!arrivalDate) {
        return false;
      }
      return arrivalDate.getTime() === today.getTime();
    });

    this.todayDepartures = officeFilteredReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
      if (!departureDate) {
        return false;
      }
      return departureDate.getTime() === today.getTime();
    });

    this.tomorrowArrivals = officeFilteredReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = this.utilityService.parseDateOnlyStringToDate(reservation.arrivalDate);
      if (!arrivalDate) {
        return false;
      }
      return arrivalDate.getTime() === tomorrow.getTime();
    });

    this.tomorrowDepartures = officeFilteredReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
      if (!departureDate) {
        return false;
      }
      return departureDate.getTime() === tomorrow.getTime();
    });

    this.upcomingArrivals = officeFilteredReservations
      .filter(reservation => {
        if (!reservation.arrivalDate || !reservation.isActive) {
          return false;
        }
        const arrivalDate = this.utilityService.parseDateOnlyStringToDate(reservation.arrivalDate);
        if (!arrivalDate) {
          return false;
        }
        const dateValue = toDateValue(arrivalDate);
        return dateValue >= todayValue && dateValue <= fifteenDaysOutValue;
      })
      .sort((a, b) => {
        const aDate = this.utilityService.parseDateOnlyStringToDate(a.arrivalDate);
        const bDate = this.utilityService.parseDateOnlyStringToDate(b.arrivalDate);
        return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
      });

    this.upcomingDepartures = officeFilteredReservations
      .filter(reservation => {
        if (!reservation.departureDate || !reservation.isActive) {
          return false;
        }
        const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
        if (!departureDate) {
          return false;
        }
        const dateValue = toDateValue(departureDate);
        return dateValue >= todayValue && dateValue <= fifteenDaysOutValue;
      })
      .sort((a, b) => {
        const aDate = this.utilityService.parseDateOnlyStringToDate(a.departureDate);
        const bDate = this.utilityService.parseDateOnlyStringToDate(b.departureDate);
        return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
      });
  }

  filterProperties(): void {
    const officeFilteredProperties = this.getOfficeFilteredProperties();
    const todayTime = this.todayAtMidnight.getTime();
    const windowEndTime = this.fifteenDaysOut.getTime();

    const inComingWindow = (calendar: string | null | undefined): boolean => {
      const d = this.utilityService.parseDateOnlyStringToDate(calendar ?? null);
      if (!d) {
        return false;
      }
      const t = d.getTime();
      return t >= todayTime && t <= windowEndTime;
    };

    this.comingOnlinePropertyRows = officeFilteredProperties
      .filter(p => p.isActive && inComingWindow(p.availableFrom))
      .sort((a, b) => {
        const ad = this.utilityService.parseDateOnlyStringToDate(a.availableFrom ?? null)?.getTime() ?? 0;
        const bd = this.utilityService.parseDateOnlyStringToDate(b.availableFrom ?? null)?.getTime() ?? 0;
        return ad - bd;
      })
      .map(p =>
        this.mixedMappingService.mapDashboardPropertyTurnoverRow(p, this.maintenanceByPropertyId.get(p.propertyId) ?? null)
      );

    this.goingOfflinePropertyRows = officeFilteredProperties
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

        const arrivalA = this.utilityService.parseDateOnlyStringToDate(a.arrivalDate)?.getTime() ?? 0;
        const arrivalB = this.utilityService.parseDateOnlyStringToDate(b.arrivalDate)?.getTime() ?? 0;
        if (arrivalA !== arrivalB) {
          return arrivalA - arrivalB;
        }

        return (a.reservationCode || '').localeCompare(b.reservationCode || '');
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
  //#endregion

  //#region Checkbox Update Methods
  onTurnoverReservationCheckboxChange(event: TurnoverReservationDisplay): void {
    if (!event.reservationId) {
      return;
    }
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

    void this.reservationService.updateModifiedReservation(event.reservationId, reservation =>
      this.buildReservationCheckboxOverrides(reservation, changedCheckboxColumn, nextValue)
    ).then(() => {
      this.toastr.success('Reservation updated.', CommonMessage.Success);
    }).catch((err: unknown) => {
      this.applyTurnoverCheckboxValue(event.reservationId, changedCheckboxColumn, previousValue);
      const validationMessage = this.getReservationUpdateErrorMessage(err);
      if (validationMessage) {
        this.toastr.error(validationMessage, CommonMessage.Error, { timeOut: 10000 });
        return;
      }
      this.toastr.error('Unable to update reservation.', CommonMessage.Error);
    });
  }

  isTurnoverCheckboxColumn(value: string | undefined): value is TurnoverCheckboxColumn {
    return value === 'paymentReceived'
      || value === 'welcomeLetterChecked'
      || value === 'welcomeLetterSent'
      || value === 'readyForArrival'
      || value === 'code'
      || value === 'departureLetterChecked'
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

  buildReservationCheckboxOverrides(
    reservation: ReservationResponse,
    column: TurnoverCheckboxColumn,
    value: boolean
  ): Partial<ReservationRequest> {
    const paymentReceived = column === 'paymentReceived' ? value : this.toBoolean(reservation.paymentReceived);
    const welcomeLetterChecked = column === 'welcomeLetterChecked' ? value : this.toBoolean(reservation.welcomeLetterChecked);
    const welcomeLetterSent = column === 'welcomeLetterSent' ? value : this.toBoolean(reservation.welcomeLetterSent);
    const readyForArrival = column === 'readyForArrival' ? value : this.toBoolean(reservation.readyForArrival);
    const code = column === 'code' ? value : this.toBoolean(reservation.code);
    const departureLetterChecked = column === 'departureLetterChecked' ? value : this.toBoolean(reservation.departureLetterChecked);
    const departureLetterSent = column === 'departureLetterSent' ? value : this.toBoolean(reservation.departureLetterSent);

    return {
      paymentReceived,
      welcomeLetterChecked,
      welcomeLetterSent,
      readyForArrival,
      code,
      departureLetterChecked,
      departureLetterSent
    };
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

  //#endregion

  //#region Utility Methods
  toBoolean(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.usersSubscription?.unsubscribe();
    this.agentsSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
  }
  //#endregion
}
