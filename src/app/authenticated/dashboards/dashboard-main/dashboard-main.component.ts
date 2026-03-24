import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';

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

  allReservations: ReservationListDisplay[] = [];
  upcomingArrivals: ReservationListDisplay[] = [];
  upcomingDepartures: ReservationListDisplay[] = [];
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
  adminUsers: UserResponse[] = [];
  adminAgents: AgentResponse[] = [];
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  adminCommissionRatesByAgentCode = new Map<string, number>();
  showMonthlyCommissionAmount: boolean = false;
  monthlyCommissions: MonthlyCommissionDisplay[] = [];

  allProperties: PropertyListResponse[] = [];
  rentedCount: number = 0;
  vacantCount: number = 0;
  isLoadingProperties: boolean = false;
  propertiesByVacancy: PropertyVacancyDisplay[] = [];

  expandedSections = { arrivals: true, departures: true, monthlyCommissions: true, properties: true };

  reservationsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '20ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '20ch' },
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch' },
  };

  propertiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '30ch' },
    'ownerName': { displayAs: 'Owner', maxWidth: '20ch' },
    'bedrooms': { displayAs: 'Beds', maxWidth: '10ch' },
    'bathrooms': { displayAs: 'Baths', maxWidth: '10ch' },
    'vacancyDaysDisplay': { displayAs: 'Days Vacant', maxWidth: '18ch' },
    'lastDepartureDate': { displayAs: 'Last Departure', maxWidth: '20ch' },
  };

  monthlyCommissionsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '20ch' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '20ch' },
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch' },
    'daysRented': { displayAs: 'Days Rented', maxWidth: '15ch' },    
    'commission': { displayAs: 'Commission', maxWidth: '15ch' },
  };

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reservationService: ReservationService,
    private mappingService: MappingService,
    private router: Router,
    private propertyService: PropertyService,
    private agentService: AgentService,
    private utilityService: UtilityService
  ) { }

  //#region Dashboard-Main
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setTodayDate();
    if (!this.user?.userId) {
      return;
    }

    this.loadCurrentUser(this.user.userId);
    if (this.isAdmin) {
      this.adminUsers = [];
      this.adminAgents = [];
      this.utilityService.addLoadItem(this.itemsToLoad$, 'users');
      this.utilityService.addLoadItem(this.itemsToLoad$, 'agents');
      this.loadUsers();
      this.loadAgents();
    }

    this.loadReservations();
    this.loadProperties();
  }
  //#endregion

  //#region Data Loading Methods
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
        this.filterUpcomingReservations();
        this.filterMonthlyCommissions();
        this.isLoadingReservations = false;
        if (this.allProperties.length > 0) {
          this.calculatePropertyStatus();
        }
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
        if (this.allReservations.length > 0) {
          this.calculatePropertyStatus();
        }
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
    if (this.showMonthlyCommissionAmount) {
      return `$${amount.toFixed(2)}`;
    }
    if (amount <= 0) {
      return '$0.00';
    }
    return '$******';
  }

  toggleMonthlyCommissionAmount(): void {
    this.showMonthlyCommissionAmount = !this.showMonthlyCommissionAmount;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999);

    this.todayArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === today.getTime();
    });

    this.todayDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === today.getTime();
    });

    this.tomorrowArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === tomorrow.getTime();
    });

    this.tomorrowDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === tomorrow.getTime();
    });

    this.upcomingArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      
      return arrivalDate.getTime() >= today.getTime() && 
             arrivalDate.getTime() <= fifteenDaysFromNow.getTime();
    });

    this.upcomingDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      
      return departureDate.getTime() >= today.getTime() && 
             departureDate.getTime() <= fifteenDaysFromNow.getTime();
    });
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
    this.monthlyCommissions = this.allReservations
      .filter(reservation =>
        this.isAdmin
          ? (reservation.agentCode || '').trim().length > 0
          : (reservation.agentCode || '').trim().toLowerCase() === agentCode
      )
      .filter(reservation =>
        overlapsCurrentMonth(reservation.arrivalDate, reservation.departureDate)
      )
      .map(reservation => {
        const normalizedReservationAgentCode = (reservation.agentCode || '').trim().toLowerCase();
        const commissionRate = this.isAdmin
          ? Number(this.adminCommissionRatesByAgentCode.get(normalizedReservationAgentCode) ?? 0)
          : this.currentUserCommissionRate;
        const daysRented = getDaysRentedInCurrentMonth(reservation.arrivalDate, reservation.departureDate);
        return {
          ...reservation,
          daysRented: daysRented,
          commission: getCommission(daysRented, commissionRate)
        };
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
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
    }
  }

  goToProperty(event: PropertyVacancyDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]);
    this.router.navigateByUrl(url);
  }
  //#endregion

  //#region Table Calculations
  calculatePropertyStatus(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeReservations = this.allReservations.filter(r => r.isActive);
    const rentedPropertyIds = new Set<string>();
    const propertyLastDeparture = new Map<string, Date>();

    activeReservations.forEach(reservation => {
      if (reservation.arrivalDate && reservation.departureDate) {
        const arrivalDate = new Date(reservation.arrivalDate);
        arrivalDate.setHours(0, 0, 0, 0);
        const departureDate = new Date(reservation.departureDate);
        departureDate.setHours(0, 0, 0, 0);
        if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
          rentedPropertyIds.add(reservation.propertyId);
        }

        if (reservation.propertyId) {
          const existingDate = propertyLastDeparture.get(reservation.propertyId);
          if (!existingDate || departureDate.getTime() > existingDate.getTime()) {
            propertyLastDeparture.set(reservation.propertyId, departureDate);
          }
        }
      }
    });
    
    this.rentedCount = rentedPropertyIds.size;
    this.vacantCount = this.allProperties.length - this.rentedCount;
    this.calculateVacancyDuration(rentedPropertyIds, propertyLastDeparture, today);
  }

  calculateVacancyDuration(rentedPropertyIds: Set<string>, propertyLastDeparture: Map<string, Date>, today: Date): void {
    const propertiesWithVacancy: PropertyVacancyDisplay[] = [];
    
    this.allProperties.forEach(property => {
      const isCurrentlyRented = rentedPropertyIds.has(property.propertyId);
      const lastDeparture = propertyLastDeparture.get(property.propertyId);
      
      let vacancyDays: number | null = null;
      let lastDepartureDate: string | null = null;
      
      if (isCurrentlyRented) {
        vacancyDays = 0;
        lastDepartureDate = null;
      } else if (lastDeparture) {
        const daysDiff = Math.floor((today.getTime() - lastDeparture.getTime()) / (1000 * 60 * 60 * 24));
        vacancyDays = Math.max(daysDiff, 0);
        lastDepartureDate = lastDeparture.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      } else {
        vacancyDays = null;
        lastDepartureDate = 'Never rented';
      }

      let vacancyDaysDisplay: string | number;
      if (vacancyDays === null) {
        vacancyDaysDisplay = 'Never rented';
      } else {
        vacancyDaysDisplay = vacancyDays;
      }
      
      propertiesWithVacancy.push({
        propertyId: property.propertyId,
        propertyCode: property.propertyCode,
        shortAddress: property.shortAddress,
        officeId: property.officeId,
        officeName: property.officeName,
        owner1Id: property.owner1Id,
        ownerName: property.ownerName,
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
        vacancyDays: vacancyDays,
        vacancyDaysDisplay: vacancyDaysDisplay,
        lastDepartureDate: lastDepartureDate
      });
    });

    const vacantProperties = propertiesWithVacancy.filter(p => !rentedPropertyIds.has(p.propertyId));

    vacantProperties.sort((a, b) => {
      if (a.vacancyDays === null && b.vacancyDays === null) {
        return a.propertyCode.localeCompare(b.propertyCode);
      }
      if (a.vacancyDays === null) return 1;
      if (b.vacancyDays === null) return -1;

      if (b.vacancyDays !== a.vacancyDays) {
        return b.vacancyDays - a.vacancyDays;
      }

      return a.propertyCode.localeCompare(b.propertyCode);
    });

    this.propertiesByVacancy = vacantProperties;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.usersSubscription?.unsubscribe();
    this.agentsSubscription?.unsubscribe();
  }
  //#endregion
}
