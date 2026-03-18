import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, filter, finalize, forkJoin, map, of, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReservationListDisplay, ReservationListResponse, ReservationResponse } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';

@Component({
    standalone: true,
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
  /** Property IDs from saved Property Selection (same API as reservation board). Null = not loaded yet. */
  allowedPropertyIds: Set<string> | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  private globalOfficeSubscription?: Subscription;
  private navigationSubscription?: Subscription;
  private lastNavigationUrl = '';
  private destroy$ = new Subject<void>();
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  propertiesFiltered = false;

  reservationsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '15ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '16ch', alignment: 'center'},
    'departureDate': { displayAs: 'Departure', maxWidth: '16ch', alignment: 'center'},
    'hasCredit': { displayAs: 'Credit', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' },
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
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private authService: AuthService,
    private propertySelectionFilterService: PropertySelectionFilterService) {
  }

  //#region Reservation List
  ngOnInit(): void {
    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => (this.propertiesFiltered = v));

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.selectedOffice = officeId != null ? this.offices.find(o => o.officeId === officeId) || null : null;
        this.officeIdChange.emit(officeId ?? null);
        this.applyFilters();
      }
    });

    this.navigationSubscription = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(e => {
      const url = e.urlAfterRedirects.split('?')[0];
      const isReservationList = url.endsWith('/reservations') || url.endsWith('/rentals');
      const fromPropertySelection = this.lastNavigationUrl.includes('/selection');
      if (isReservationList && fromPropertySelection) {
        this.reloadAllowedPropertyIds();
      }
      this.lastNavigationUrl = url;
    });

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
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has('reservations')) {
      return;
    }

    const userId = this.authService.getUser()?.userId || '';
    const finalizeLoad = () => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');

    if (!userId) {
      this.reservationService.getReservationList().pipe(take(1), finalize(finalizeLoad)).subscribe({
        next: (response: ReservationListResponse[]) => {
          this.isServiceError = false;
          this.allReservations = this.mappingService.mapReservationList(response);
          this.allowedPropertyIds = null;
          this.applyFilters();
        },
        error: () => {
          this.isServiceError = true;
          this.allReservations = [];
          this.reservationsDisplay = [];
          finalizeLoad();
        }
      });
      return;
    }

    forkJoin({
      reservations: this.reservationService.getReservationList(),
      selectedProperties: this.propertyService.getPropertiesBySelectionCritera(userId).pipe(
        catchError(() => {
          this.toastr.warning('Could not load property selection; showing all reservations.', CommonMessage.ServiceError);
          return of([] as PropertyListResponse[]);
        })
      )
    }).pipe(take(1), finalize(finalizeLoad)).subscribe({
      next: ({ reservations, selectedProperties }) => {
        this.isServiceError = false;
        this.allReservations = this.mappingService.mapReservationList(reservations || []);
        this.allowedPropertyIds = new Set((selectedProperties || []).map(p => p.propertyId));
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.allReservations = [];
        this.reservationsDisplay = [];
      }
    });
  }

  goToPropertySelection(): void {
    const userId = this.authService.getUser()?.userId || '';
    const listReturnPath = this.router.url.split('?')[0];
    if (!userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, {
        state: { source: 'reservation-list', listReturnPath }
      });
      return;
    }
    this.propertyService.getPropertySelection(userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, {
          state: { source: 'reservation-list', selection, listReturnPath }
        });
      },
      error: () => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, {
          state: { source: 'reservation-list', listReturnPath }
        });
      }
    });
  }

  reloadAllowedPropertyIds(): void {
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      return;
    }
    this.propertyService.getPropertiesBySelectionCritera(userId).pipe(
      take(1),
      catchError(() => of([] as PropertyListResponse[]))
    ).subscribe(props => {
      this.allowedPropertyIds = new Set((props || []).map(p => p.propertyId));
      this.applyFilters();
    });
  }

  deleteReservation(reservation: ReservationListDisplay): void {
    this.reservationService.deleteReservation(reservation.reservationId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Reservation deleted successfully', CommonMessage.Success);
        this.allReservations = this.allReservations.filter(r => r.reservationId !== reservation.reservationId);
        this.applyFilters();
      },
      error: () => {}
    });
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

  copyReservation(row: ReservationListDisplay): void {
    this.reservationService.getReservationByGuid(row.reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        const url = RouterUrl.replaceTokens(RouterUrl.Reservation, ['new']);
        const queryParams: Record<string, unknown> = {};
        if (this.selectedOffice) {
          queryParams['officeId'] = this.selectedOffice.officeId;
        }
        this.router.navigate([url], {
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          state: { copyFromReservation: reservation }
        });
      },
      error: () => {
        this.toastr.error('Could not load reservation to copy', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Data Load Methods
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
        
        const globalOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
        if (this.officeId !== null && this.officeId !== undefined) {
          const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (matchingOffice !== this.selectedOffice) {
            this.selectedOffice = matchingOffice;
            this.applyFilters();
          }
        } else if (globalOfficeId !== null) {
          const globalOffice = this.offices.find(o => o.officeId === globalOfficeId) || null;
          if (globalOffice && globalOffice !== this.selectedOffice) {
            this.selectedOffice = globalOffice;
            this.officeIdChange.emit(globalOffice.officeId);
            this.applyFilters();
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

    // Same property set as Property Selection / reservation board
    if (this.allowedPropertyIds !== null) {
      if (this.allowedPropertyIds.size === 0) {
        filtered = [];
      } else {
        filtered = filtered.filter(r => this.allowedPropertyIds!.has(r.propertyId));
      }
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
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
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
    this.destroy$.next();
    this.destroy$.complete();
    this.navigationSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

