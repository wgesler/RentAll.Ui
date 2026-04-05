import { CommonModule } from "@angular/common";
import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, skip, take, takeUntil } from 'rxjs';
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
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { ExtraFeeLineRequest, ReservationListDisplay, ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';
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
  allowedPropertyIds: Set<string> | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  navigationSubscription?: Subscription;
  lastNavigationUrl = '';

  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  user: any;
  isAdmin = false;
  
  userId: string = '';
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  propertiesFiltered = false;
  officeScopeResolved = false;
  isCompactView = false;
  canEditIsActiveCheckbox = false;

  private readonly compactViewportWidth = 1024;
  private readonly fullReservationsDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'tenantName': { displayAs: 'Occupant', maxWidth: '20ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '15ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '16ch', alignment: 'center'},
    'departureDate': { displayAs: 'Departure', maxWidth: '16ch', alignment: 'center'},
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '20ch' }
  };
  private readonly compactReservationsDisplayedColumns: ColumnSet = {
    'reservationCode': { displayAs: 'Code', maxWidth: '15ch', sort: false, sortType: 'natural' }
  };
  reservationsDisplayedColumns: ColumnSet = this.fullReservationsDisplayedColumns;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'reservations', 'properties', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

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
    private dialog: MatDialog,
    private propertySelectionFilterService: PropertySelectionFilterService) {
  }

  //#region Reservation List
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.userId = this.user?.userId || '';
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;
    this.setIsActiveCheckboxEditability();
    this.updateDisplayedColumns();
    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe((v) => (this.propertiesFiltered = v));
    this.propertySelectionFilterService.dateRange$.pipe(takeUntil(this.destroy$)).subscribe((range) => {
        this.startDate = range.startDate;
        this.endDate = range.endDate;
        this.applyFilters();
      });

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    this.navigationSubscription = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd),takeUntil(this.destroy$)).subscribe(e => {
      const url = e.urlAfterRedirects.split('?')[0];
      const isReservationList = url.endsWith('/reservations') || url.endsWith('/rentals');
      const fromPropertySelection = this.lastNavigationUrl.includes('/selection');
      if (isReservationList && fromPropertySelection) {
        this.reloadAllowedPropertyIds();
      }
      this.lastNavigationUrl = url;
    });

    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe(() => {
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
            this.resolveOfficeScope(parsedOfficeId, true);
          }
        } else {
          this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
        }
      });
    });

    this.getReservations();
    this.loadProperties();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(newOfficeId, false);
        }
      }
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDisplayedColumns();
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
    if (!this.itemsToLoad$.value.has('reservations')) return;

    this.reservationService.getReservationList().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations: ReservationListResponse[]) => {
        this.isServiceError = false;
        this.allReservations = this.mappingService.mapReservationList(reservations || []);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.allReservations = [];
        this.reservationsDisplay = [];
      }
    });
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

  deleteReservation(reservation: ReservationListDisplay): void {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const arrivalDate = reservation.arrivalDate ? new Date(reservation.arrivalDate) : null;
    if (arrivalDate && !isNaN(arrivalDate.getTime())) {
      arrivalDate.setHours(0, 0, 0, 0);
      if (now >= arrivalDate) {
        const dialogData: GenericModalData = {
          title: 'Cancel Reservation',
          message: 'It is not possible to cancel a reservation that has already begun.',
          icon: 'warning' as any,
          iconColor: 'warn',
          no: '',
          yes: 'OK',
          callback: (dialogRef) => dialogRef.close(),
          useHTML: false
        };

        this.dialog.open(GenericModalComponent, {
          data: dialogData,
          width: '35rem'
        });
        return;
      }
    }

    const dialogData: GenericModalData = {
      title: 'Delete Reservation',
      message: 'Are you sure you want to delete this reservation?',
      icon: 'warning' as any,
      iconColor: 'warn',
      no: 'Cancel',
      yes: 'Delete',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: true
    };

    const dialogRef = this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });

    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (result !== true) {
        return;
      }

      this.reservationService.deleteReservation(reservation.reservationId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success);
          this.allReservations = this.allReservations.filter(r => r.reservationId !== reservation.reservationId);
          this.applyFilters();
        },
        error: () => {}
      });
    });
  }

  onReservationCheckboxChange(event: ReservationListDisplay): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as any)?.__previousCheckboxValue === true;
    const nextValue = (event as any)?.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyReservationIsActiveValue(event.reservationId, nextValue);

    this.reservationService.getReservationByGuid(event.reservationId).pipe(
      take(1),
      finalize(() => this.applyFilters())
    ).subscribe({
      next: (reservation: ReservationResponse) => {
        const request = this.buildReservationRequestForIsActiveUpdate(reservation, nextValue);
        this.reservationService.updateReservation(request).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('Reservation updated.', CommonMessage.Success);
          },
          error: () => {
            this.applyReservationIsActiveValue(event.reservationId, previousValue);
            this.toastr.error('Unable to update reservation.', CommonMessage.Error);
          }
        });
      },
      error: () => {
        this.applyReservationIsActiveValue(event.reservationId, previousValue);
        this.toastr.error('Unable to update reservation.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Routing Methods
  goToReservation(event: ReservationListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    const queryParams: any = {};
    
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    queryParams.returnTo = 'reservation-list';
    
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  goToPropertySelection(): void {
    const listReturnPath = this.router.url.split('?')[0];
    if (!this.userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, {
        state: { source: 'reservation-list', listReturnPath }
      });
      return;
    }
    this.propertyService.getPropertySelection(this.userId).pipe(take(1)).subscribe({
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
  
  goToContact(event: ReservationListDisplay): void {
    if (event.contactId) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  goToProperty(event: ReservationListDisplay): void {
    if (event.propertyId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
    }
  }
  //#endregion

  //#region Data Load Methods
  loadProperties(): void {
    if (!this.userId || !this.propertiesFiltered) {
      this.allowedPropertyIds = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      this.applyFilters();
      return;
    }

    this.propertyService.getPropertiesBySelectionCriteria(this.userId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (props: PropertyListResponse[]) => {
        this.allowedPropertyIds = new Set((props || []).map(p => p.propertyId));
        this.applyFilters();
      },
      error: () => {
        this.toastr.warning('Could not load property selection; showing all reservations.', CommonMessage.ServiceError);
        this.allowedPropertyIds = null;
        this.applyFilters();
      }
    });
  }

  loadOffices(): void {
    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
      }
    });
  }

  reloadAllowedPropertyIds(): void {
    if (!this.propertiesFiltered) {
      this.allowedPropertyIds = null;
      this.applyFilters();
      return;
    }
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    this.loadProperties();
  }
  //#endregion

  //#region Filtering Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

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

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    }
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    this.reservationsDisplayedColumns = this.isCompactView ? this.compactReservationsDisplayedColumns : this.fullReservationsDisplayedColumns;
  }

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.fullReservationsDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  applyReservationIsActiveValue(reservationId: string, isActive: boolean): void {
    const nextValue = !!isActive;
    this.allReservations = this.allReservations.map(reservation =>
      reservation.reservationId === reservationId
        ? { ...reservation, isActive: nextValue }
        : reservation
    );
    this.reservationsDisplay = this.reservationsDisplay.map(reservation =>
      reservation.reservationId === reservationId
        ? { ...reservation, isActive: nextValue }
        : reservation
    );
  }

  buildReservationRequestForIsActiveUpdate(reservation: ReservationResponse, isActive: boolean): ReservationRequest {
    const extraFeeLines: ExtraFeeLineRequest[] = (reservation.extraFeeLines || []).map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      reservationId: line.reservationId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId,
      costCodeId: line.costCodeId
    }));

    return {
      reservationId: reservation.reservationId,
      organizationId: reservation.organizationId || '',
      officeId: reservation.officeId,
      agentId: reservation.agentId ?? null,
      propertyId: reservation.propertyId,
      contactId: reservation.contactId,
      companyId: reservation.companyId ?? null,
      companyName: reservation.companyName ?? null,
      reservationCode: reservation.reservationCode,
      reservationTypeId: reservation.reservationTypeId,
      reservationStatusId: reservation.reservationStatusId,
      reservationNoticeId: reservation.reservationNoticeId ?? 0,
      numberOfPeople: reservation.numberOfPeople,
      tenantName: reservation.tenantName || '',
      referenceNo: reservation.referenceNo || '',
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      checkInTimeId: reservation.checkInTimeId,
      checkOutTimeId: reservation.checkOutTimeId,
      lockBoxCode: reservation.lockBoxCode ?? null,
      unitTenantCode: reservation.unitTenantCode ?? null,
      billingMethodId: reservation.billingMethodId,
      prorateTypeId: reservation.prorateTypeId,
      billingTypeId: reservation.billingTypeId,
      billingRate: reservation.billingRate,
      deposit: reservation.deposit,
      depositTypeId: reservation.depositTypeId ?? 0,
      departureFee: reservation.departureFee,
      taxes: reservation.taxes,
      hasPets: reservation.hasPets,
      petFee: reservation.petFee,
      numberOfPets: reservation.numberOfPets,
      petDescription: reservation.petDescription ?? null,
      maidService: reservation.maidService,
      maidServiceFee: reservation.maidServiceFee,
      frequencyId: reservation.frequencyId,
      maidStartDate: reservation.maidStartDate,
      extraFeeLines,
      notes: reservation.notes ?? null,
      allowExtensions: reservation.allowExtensions,
      paymentReceived: reservation.paymentReceived,
      welcomeLetterSent: reservation.welcomeLetterSent,
      readyForArrival: reservation.readyForArrival,
      code: reservation.code,
      departureLetterSent: reservation.departureLetterSent,
      currentInvoiceNo: reservation.currentInvoiceNo,
      creditDue: reservation.creditDue,
      isActive
    };
  }

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

