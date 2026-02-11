import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, forkJoin, take } from 'rxjs';
import { RouterUrl } from '../../app.routes';
import { MaterialModule } from '../../material.module';
import { JwtUser } from '../../public/login/models/jwt';
import { AuthService } from '../../services/auth.service';
import { MappingService } from '../../services/mapping.service';
import { PropertyListResponse } from '../properties/models/property.model';
import { PropertyService } from '../properties/services/property.service';
import { AgentResponse } from '../organizations/models/agent.model';
import { AgentService } from '../organizations/services/agent.service';
import { ReservationListDisplay, ReservationListResponse } from '../reservations/models/reservation-model';
import { ReservationService } from '../reservations/services/reservation.service';
import { DataTableComponent } from '../shared/data-table/data-table.component';
import { ColumnSet } from '../shared/data-table/models/column-data';
import { UserResponse } from '../users/models/user.model';
import { UserGroups } from '../users/models/user-enums';
import { UserService } from '../users/services/user.service';

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
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: JwtUser | null = null;
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;

  // Reservation data
  allReservations: ReservationListDisplay[] = [];
  upcomingArrivals: ReservationListDisplay[] = [];
  upcomingDepartures: ReservationListDisplay[] = [];
  isLoadingReservations: boolean = false;
  
  // Today/Tomorrow data
  todayArrivals: ReservationListDisplay[] = [];
  todayDepartures: ReservationListDisplay[] = [];
  tomorrowArrivals: ReservationListDisplay[] = [];
  tomorrowDepartures: ReservationListDisplay[] = [];
  todayDate: string = '';
  currentUserAgentId: string | null = null;
  currentUserAgentCode: string | null = null;
  currentUserCommissionRate: number = 0;
  isAdminUser: boolean = false;
  adminCommissionRatesByAgentCode = new Map<string, number>();
  showMonthlyCommissionAmount: boolean = false;
  monthlyCommissions: MonthlyCommissionDisplay[] = [];

  // Property data
  allProperties: PropertyListResponse[] = [];
  rentedCount: number = 0;
  vacantCount: number = 0;
  isLoadingProperties: boolean = false;
  propertiesByVacancy: PropertyVacancyDisplay[] = [];

  // Accordion states
  arrivalsExpanded: boolean = true;
  departuresExpanded: boolean = true;
  monthlyCommissionsExpanded: boolean = true;
  propertiesExpanded: boolean = true;

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
    private agentService: AgentService
  ) { }

  //#region Dashboard
  ngOnInit(): void {
    // Get current user from auth service
    this.user = this.authService.getUser();
    this.isAdminUser = this.hasAdminRole(this.user);
    
    // Set today's date
    this.setTodayDate();
    
    // Load user profile picture
    this.loadUserProfilePicture();
    
    // Load reservations
    this.loadReservations();
    
    // Load properties
    this.loadProperties();
  }
  //#endregion 

  //#region Data Loading Methods
  loadUserProfilePicture(): void {
    const currentUser = this.authService.getUser();
    if (!currentUser?.userId) {
      return;
    }
    
    if (this.isAdminUser) {
      this.userSubscription = forkJoin({
        currentUser: this.userService.getUserByGuid(currentUser.userId),
        allUsers: this.userService.getUsers(),
        agents: this.agentService.getAgents()
      }).pipe(take(1)).subscribe({
        next: ({ currentUser, allUsers, agents }) => {
          this.applyUserProfilePicture(currentUser);
          this.currentUserAgentId = currentUser.agentId ?? this.user?.agentId ?? null;
          this.currentUserCommissionRate = Number(currentUser.commissionRate ?? 0);

          const agentCodeByAgentId = new Map<string, string>();
          (agents || []).forEach(agent => {
            if (agent.agentId && agent.agentCode) {
              agentCodeByAgentId.set(agent.agentId, agent.agentCode.trim().toLowerCase());
            }
          });

          this.adminCommissionRatesByAgentCode.clear();
          (allUsers || []).forEach(user => {
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
        },
        error: () => {
          this.profilePictureUrl = null;
          this.currentUserAgentId = this.user?.agentId ?? null;
          this.currentUserCommissionRate = 0;
          this.adminCommissionRatesByAgentCode.clear();
          this.resolveCurrentAgentAndFilter();
        }
      });
      return;
    }

    this.userSubscription = this.userService.getUserByGuid(currentUser.userId).pipe(take(1)).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        this.currentUserAgentId = userResponse.agentId ?? this.user?.agentId ?? null;
        this.currentUserCommissionRate = Number(userResponse.commissionRate ?? 0);
        this.resolveCurrentAgentAndFilter();
      },
      error: () => {
        // Silently fail - just don't show profile picture
        this.profilePictureUrl = null;
        this.currentUserAgentId = this.user?.agentId ?? null;
        this.currentUserCommissionRate = 0;
        this.adminCommissionRatesByAgentCode.clear();
        this.resolveCurrentAgentAndFilter();
      }
    });
  }

  applyUserProfilePicture(userResponse: UserResponse): void {
    // Set profile picture URL from fileDetails or profilePath
    if (userResponse.fileDetails && userResponse.fileDetails.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
    } else if (userResponse.profilePath) {
      this.profilePictureUrl = userResponse.profilePath;
    } else {
      this.profilePictureUrl = null;
    }
  }
  
  loadReservations(): void {
    this.isLoadingReservations = true;
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.allReservations = this.mappingService.mapReservationList(response);
        this.filterUpcomingReservations();
        this.filterMonthlyCommissions();
        this.isLoadingReservations = false;
        // Recalculate property status when reservations are loaded
        if (this.allProperties.length > 0) {
          this.calculatePropertyStatus();
        }
      },
      error: (err: HttpErrorResponse) => {
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
        // Only calculate if reservations are already loaded
        if (this.allReservations.length > 0) {
          this.calculatePropertyStatus();
        }
        this.isLoadingProperties = false;
      },
      error: (err: HttpErrorResponse) => {
        this.allProperties = [];
        this.rentedCount = 0;
        this.vacantCount = 0;
        this.isLoadingProperties = false;
      }
    });
  }
  //#endregion

  //#region Setting and Filtering
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

    // Filter for today's arrivals
    this.todayArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === today.getTime();
    });

    // Filter for today's departures
    this.todayDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === today.getTime();
    });

    // Filter for tomorrow's arrivals
    this.tomorrowArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === tomorrow.getTime();
    });

    // Filter for tomorrow's departures
    this.tomorrowDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === tomorrow.getTime();
    });

    // Filter for upcoming arrivals (arrival date within next 15 days)
    this.upcomingArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      
      return arrivalDate.getTime() >= today.getTime() && 
             arrivalDate.getTime() <= fifteenDaysFromNow.getTime();
    });

    // Filter for upcoming departures (departure date within next 15 days)
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
    if (this.isAdminUser) {
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
    if (!this.isAdminUser && !this.currentUserAgentCode) {
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
        this.isAdminUser
          ? (reservation.agentCode || '').trim().length > 0
          : (reservation.agentCode || '').trim().toLowerCase() === agentCode
      )
      .filter(reservation =>
        overlapsCurrentMonth(reservation.arrivalDate, reservation.departureDate)
      )
      .map(reservation => {
        const normalizedReservationAgentCode = (reservation.agentCode || '').trim().toLowerCase();
        const commissionRate = this.isAdminUser
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

  hasAdminRole(user: JwtUser | null): boolean {
    if (!user?.userGroups?.length) {
      return false;
    }

    const adminIds = new Set<number>([UserGroups.Admin, UserGroups.SuperAdmin]);
    return user.userGroups.some(group => {
      if (group === 'Admin' || group === 'SuperAdmin') {
        return true;
      }
      const parsed = parseInt(String(group), 10);
      return !isNaN(parsed) && adminIds.has(parsed);
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
    
    // Get all active reservations
    const activeReservations = this.allReservations.filter(r => r.isActive);
    
    // Create a set of property IDs that are currently rented
    const rentedPropertyIds = new Set<string>();
    
    // Track last departure date for each property
    const propertyLastDeparture = new Map<string, Date>();
    
    activeReservations.forEach(reservation => {
      if (reservation.arrivalDate && reservation.departureDate) {
        const arrivalDate = new Date(reservation.arrivalDate);
        arrivalDate.setHours(0, 0, 0, 0);
        
        const departureDate = new Date(reservation.departureDate);
        departureDate.setHours(0, 0, 0, 0);
        
        // Check if today falls between arrival and departure (inclusive)
        if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
          rentedPropertyIds.add(reservation.propertyId);
        }
        
        // Track the latest departure date for each property
        if (reservation.propertyId) {
          const existingDate = propertyLastDeparture.get(reservation.propertyId);
          if (!existingDate || departureDate.getTime() > existingDate.getTime()) {
            propertyLastDeparture.set(reservation.propertyId, departureDate);
          }
        }
      }
    });
    
    // Count rented and vacant properties
    this.rentedCount = rentedPropertyIds.size;
    this.vacantCount = this.allProperties.length - this.rentedCount;
    
    // Calculate vacancy duration for each property
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
        // Property is currently rented, so it's not vacant
        vacancyDays = null;
        lastDepartureDate = null;
      } else if (lastDeparture) {
        // Property has been rented before, calculate days since last departure
        const daysDiff = Math.floor((today.getTime() - lastDeparture.getTime()) / (1000 * 60 * 60 * 24));
        vacancyDays = daysDiff;
        lastDepartureDate = lastDeparture.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      } else {
        // Property has never been rented (or no departure date found)
        // Could be considered as vacant since the beginning of time, but we'll use a large number
        // or mark as "Never rented"
        vacancyDays = null; // Will be sorted last
        lastDepartureDate = 'Never rented';
      }
      
      // Format vacancy days for display
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
        departureFee: property.departureFee,
        petFee: property.petFee,
        maidServiceFee: property.maidServiceFee,
        propertyStatusId: property.propertyStatusId,
        isActive: property.isActive,
        vacancyDays: vacancyDays,
        vacancyDaysDisplay: vacancyDaysDisplay,
        lastDepartureDate: lastDepartureDate
      });
    });
    
    // Filter out currently rented properties - only show vacant ones
    const vacantProperties = propertiesWithVacancy.filter(p => !rentedPropertyIds.has(p.propertyId));
    
    // Sort by vacancy days (longest first), then by property code for consistency
    vacantProperties.sort((a, b) => {
      // Properties with null vacancy days (never rented) go to the end
      if (a.vacancyDays === null && b.vacancyDays === null) {
        return a.propertyCode.localeCompare(b.propertyCode);
      }
      if (a.vacancyDays === null) return 1;
      if (b.vacancyDays === null) return -1;
      
      // Sort by vacancy days descending (longest first)
      if (b.vacancyDays !== a.vacancyDays) {
        return b.vacancyDays - a.vacancyDays;
      }
      
      // If same vacancy days, sort by property code
      return a.propertyCode.localeCompare(b.propertyCode);
    });
    
    this.propertiesByVacancy = vacantProperties;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
  }
  //#endregion
}
