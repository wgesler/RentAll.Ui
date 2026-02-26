import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReservationListDisplay, ReservationListResponse } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';

@Component({
    selector: 'app-reservation-list',
    templateUrl: './reservation-list.component.html',
    styleUrls: ['./reservation-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ReservationListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
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
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;

  reservationsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '20ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '15ch' },
    'departureDate': { displayAs: 'Departure', maxWidth: '15ch' },
    'hasCredit': { displayAs: 'Has Credit', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public reservationService: ReservationService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private companyService: CompanyService,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    private officeService: OfficeService) {
  }

  //#region Reservation List
  ngOnInit(): void {
    this.loadOffices();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        if (this.selectedOffice) {
          this.applyFilters();
        }
      }
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              this.officeIdChange.emit(this.selectedOffice.officeId);
              this.applyFilters();
            }
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            this.selectedOffice = null;
            this.applyFilters();
          }
        }
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
          if (this.selectedOffice) {
            this.applyFilters();
          } else {
            this.applyFilters();
          }
        }
      }
    }
  }

  addReservation(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, ['new']);
    const queryParams: any = {};
    
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
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
      error: () => {
        this.isServiceError = true;
        this.allReservations = [];
        this.reservationsDisplay = [];
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
        error: () => {}
      });
    }
  }

  goToReservation(event: ReservationListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    const queryParams: any = {};
    
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
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
      error: () => {
        this.companies = [];
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
      error: () => {
        this.properties = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
        this.getReservations();
      }
    });
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        
        if (this.offices.length === 1 && (this.officeId === null || this.officeId === undefined)) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        if (this.officeId !== null && this.officeId !== undefined) {
          const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (matchingOffice !== this.selectedOffice) {
            this.selectedOffice = matchingOffice;
            if (this.selectedOffice) {
              this.applyFilters();
            } else {
              this.applyFilters();
            }
          }
        } else if (this.selectedOffice && this.offices.length === 1) {
          this.applyFilters();
        }
        
        this.getReservations();
      });
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

  onOfficeChange(): void {
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    
    const queryParams: any = {};
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId.toString();
    } else {
      queryParams.officeId = null;
    }
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
    
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

