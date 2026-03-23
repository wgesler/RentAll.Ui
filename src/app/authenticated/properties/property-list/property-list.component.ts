import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { CalendarUrlResponse } from '../models/property-calendar';
import { PropertySelectionResponse } from '../models/property-selection.model';
import { PropertyListDisplay } from '../models/property.model';
import { PropertyCalendarUrlDialogComponent, PropertyCalendarUrlDialogData } from '../property-calendar-url-dialog/property-calendar-url-dialog.component';
import { PropertySelectionFilterService } from '../services/property-selection-filter.service';
import { PropertyService } from '../services/property.service';

@Component({
    standalone: true,
    selector: 'app-property-list',
    templateUrl: './property-list.component.html',
    styleUrls: ['./property-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class PropertyListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allProperties: PropertyListDisplay[] = [];
  propertiesDisplay: PropertyListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  private navigationSubscription?: Subscription;
  private lastNavigationUrl = '';
  private destroy$ = new Subject<void>();
  officeScopeResolved = false;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  /** True when saved property selection has non-default filters. */
  propertiesFiltered = false;
  isCompactView = false;

  private readonly compactViewportWidth = 1024;
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '15ch', wrap: false },
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false },
    'ownerName': { displayAs: 'Owner', maxWidth: '25ch', wrap: false },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'accomodates': { displayAs: 'Acms', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'propertyType': { displayAs: 'Type', maxWidth: '10ch', wrap: false },
    'monthlyRate': { displayAs: 'Monthly', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };
  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: '', maxWidth: '20ch', sortType: 'natural', wrap: false }
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public propertyService: PropertyService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private authService: AuthService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private route: ActivatedRoute,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private ngZone: NgZone,
    private propertySelectionFilterService: PropertySelectionFilterService) {
  }

  //#region Property-List
  ngOnInit(): void {
    this.updateDisplayedColumns();
    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => (this.propertiesFiltered = v));

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    this.navigationSubscription = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(e => {
      const path = e.urlAfterRedirects.split('?')[0];
      const isPropertyList = /\/properties$/.test(path);
      const fromSelection = this.lastNavigationUrl.includes('/selection');
      if (isPropertyList && fromSelection) {
        this.getProperties();
      }
      this.lastNavigationUrl = path;
    });

    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.resolveOfficeScope(this.officeId, false);
      }
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.resolveOfficeScope(parsedOfficeId, true);
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            this.resolveOfficeScope(this.globalOfficeSelectionService.getSelectedOfficeIdValue(), true);
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
          this.resolveOfficeScope(newOfficeId, false);
        }
      }
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDisplayedColumns();
  }

  /** GET property/user/{userId} — properties matching saved Property Selection (server-filtered). */
  getProperties(): void {
    this.isServiceError = false;
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.allProperties = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getPropertiesBySelectionCritera(userId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))
    ).subscribe({
      next: (properties) => {
        this.allProperties = this.mappingService.mapProperties(properties || []);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.allProperties = [];
        this.propertiesDisplay = [];
        console.error('Error loading properties:', err);
      }
    });
  }

  goToPropertySelection(): void {
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list' } });
      return;
    }
    this.propertyService.getPropertySelection(userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list', selection } });
      },
      error: () => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list' } });
      }
    });
  }

  addProperty(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, ['new']));
  }
    
  copyProperty(event: PropertyListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, ['new']);
    this.router.navigate([url], { queryParams: { copyFrom: event.propertyId } });
  }

  openPropertyCalendar(property: PropertyListDisplay): void {
    this.propertyService.getPropertyCalendarUrl(property.propertyId).pipe(take(1)).subscribe({
      next: (response: CalendarUrlResponse) => {
        if (!response?.subscriptionUrl) {
          this.toastr.error('No calendar URL was returned for this property.', CommonMessage.ServiceError);
          return;
        }

        const dialogConfig: MatDialogConfig<PropertyCalendarUrlDialogData> = {
          width: '700px',
          autoFocus: true,
          restoreFocus: true,
          disableClose: false,
          hasBackdrop: true,
          data: {
            propertyCode: property.propertyCode,
            subscriptionUrl: response.subscriptionUrl
          }
        };

        this.dialog.open(PropertyCalendarUrlDialogComponent, dialogConfig);
      },
      error: () => {}
    });
  }

  deleteProperty(property: PropertyListDisplay): void {
    this.propertyService.deleteProperty(property.propertyId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Property deleted successfully', CommonMessage.Success);
        this.getProperties();
      },
      error: () => {}
    });
  }
  //#endregion
  
  //#region Routing Methods
  goToProperty(event: PropertyListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId])],
        { queryParams: { section: 'basic' } }
      );
    });
  }

  goToContact(event: PropertyListDisplay): void {
    if (event.owner1Id) {
      this.ngZone.run(() => {
        this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id]));
      });
    }
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allProperties;

    if (!this.showInactive) {
      filtered = filtered.filter(property => property.isActive);
    }

    if (this.selectedOffice) {
      filtered = filtered.filter(property => property.officeId === this.selectedOffice.officeId);
    }

    this.propertiesDisplay = filtered;
  }
  //#endregion

  //#region Office Methods
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
        
        this.getProperties();
      });
    });
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.resolveOfficeScope(this.selectedOffice?.officeId ?? null, true);
  }
  //#endregion

  //#region Utility Methods
  private updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    this.propertiesDisplayedColumns = this.isCompactView ? this.compactPropertiesDisplayedColumns : this.fullPropertiesDisplayedColumns;
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

