import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ReservationListResponse, ReservationListDisplay } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { CompanyService } from '../../companies/services/company.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.component.html',
  styleUrls: ['./reservation-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ReservationListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allReservations: ReservationListDisplay[] = [];
  reservationsDisplay: ReservationListDisplay[] = [];
  companies: CompanyResponse[] = [];
  properties: PropertyListResponse[] = [];
  startDate: Date | null = null;
  endDate: Date | null = null;

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  reservationsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '20ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '15ch' },
    'departureDate': { displayAs: 'Departure', maxWidth: '15ch' },
    'hasCredit': { displayAs: 'Has Credit', isCheckbox: true, sort: false, wrap: false, alignment: 'center' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'center' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public reservationService: ReservationService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private companyService: CompanyService,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private authService: AuthService) {
  }

  //#region Reservation List
  ngOnInit(): void {
    this.loadOffices();
  }

  addReservation(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Reservation, ['new']));
  }

  getReservations(): void {
    // Only call if not already loading/loaded
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has('reservations')) {
      return; // Already loaded or loading
    }

    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.isServiceError = false;
        this.allReservations = this.mappingService.mapReservationList(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.allReservations = [];
        this.reservationsDisplay = [];
        // Don't show toast for 401 - interceptor handles it
        // Don't show toast for 400 - API handles it
        if (err.status !== 400 && err.status !== 401) {
          this.toastr.error('Could not load Reservations', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteReservation(reservation: ReservationListDisplay): void {
    if (confirm(`Are you sure you want to delete this reservation?`)) {
      this.reservationService.deleteReservation(reservation.reservationId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success);
          // Remove from local arrays instead of reloading
          this.allReservations = this.allReservations.filter(r => r.reservationId !== reservation.reservationId);
          this.applyFilters();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete reservation. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete reservation', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToReservation(event: ReservationListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]));
  }

  goToContact(event: ReservationListDisplay): void {
    if (event.contactId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
    }
  }
  //#endregion

  //#region Data Load Methods
  loadCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = companies;
      },
      error: (err: HttpErrorResponse) => {
        this.companies = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load companies. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });  
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.properties = properties;
        // Get reservations - ReservationListResponse already includes contactName, so we don't need contacts
        this.getReservations();
      },
      error: (err: HttpErrorResponse) => {
        this.properties = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load properties. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
        // Get reservations even if properties failed - ReservationListResponse already includes contactName
        this.getReservations();
      }
    });
  }
  //#endregion

  //#region Filtering Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  clearDateFilters(): void {
    this.startDate = null;
    this.endDate = null;
    this.applyFilters();
  }

  onStartDateChange(): void {
    this.applyFilters();
  }

  onEndDateChange(): void {
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allReservations;

    // Filter by active/inactive
    if (!this.showInactive) {
      filtered = filtered.filter(reservation => reservation.isActive === true);
    }

    // Filter by office
    if (this.selectedOffice) {
      filtered = filtered.filter(reservation => reservation.officeId === this.selectedOffice.officeId);
    }

    // Filter by date range - show reservations where EITHER arrival OR departure falls within the range
    if (this.startDate || this.endDate) {
      filtered = filtered.filter(reservation => {
        // Normalize filter dates to midnight for accurate comparison
        const start = this.startDate ? new Date(this.startDate) : null;
        const end = this.endDate ? new Date(this.endDate) : null;
        
        if (start) {
          start.setHours(0, 0, 0, 0);
        }
        if (end) {
          end.setHours(0, 0, 0, 0);
        }

        // Check if arrival date falls within range (inclusive)
        if (reservation.arrivalDate) {
          const arrivalDate = new Date(reservation.arrivalDate);
          arrivalDate.setHours(0, 0, 0, 0);
          
          const arrivalMatches = (!start || arrivalDate.getTime() >= start.getTime()) && 
                                 (!end || arrivalDate.getTime() <= end.getTime());
          if (arrivalMatches) {
            return true;
          }
        }

        // Check if departure date falls within range (inclusive)
        if (reservation.departureDate) {
          const departureDate = new Date(reservation.departureDate);
          departureDate.setHours(0, 0, 0, 0);
          
          const departureMatches = (!start || departureDate.getTime() >= start.getTime()) && 
                                   (!end || departureDate.getTime() <= end.getTime());
          if (departureMatches) {
            return true;
          }
        }

        // Neither date falls within range
        return false;
      });
    }

    this.reservationsDisplay = filtered;
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
    // Offices are already loaded on login, so directly subscribe to changes
    this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
      // Filter offices by user access
      const user = this.authService.getUser();
      if (user && user.officeAccess && user.officeAccess.length > 0) {
        // User has specific office access - filter to only those offices
        const officeAccessIds = user.officeAccess.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
        this.offices = (allOffices || []).filter(office => officeAccessIds.includes(office.officeId));
      } else {
        // User has no office restrictions - show all offices
        this.offices = allOffices || [];
      }
      this.getReservations();
    });
  }

  onOfficeChange(): void {
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

