import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getPropertyStatus } from '../../properties/models/property-enums';
import { PropertyListDisplay } from '../../properties/models/property.model';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';

type MaintenanceListDisplay = PropertyListDisplay & {
  propertyStatusText: string;
};

@Component({
  standalone: true,
  selector: 'app-maintenance-list',
  templateUrl: './maintenance-list.component.html',
  styleUrls: ['./maintenance-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})
export class MaintenanceListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allProperties: MaintenanceListDisplay[] = [];
  propertiesDisplay: MaintenanceListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  navigationSubscription?: Subscription;
  lastNavigationUrl = '';
  destroy$ = new Subject<void>();
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  propertiesFiltered = false;
  officeScopeResolved = false;
  isCompactView = false;

  private readonly compactViewportWidth = 1024;
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '15ch', wrap: false },
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false },
    'ownerName': { displayAs: 'Owner', maxWidth: '20ch', wrap: false },
    'propertyStatusText': { displayAs: 'Status', wrap: false, maxWidth: '15ch' },
    'licenseDate': { displayAs: 'License Expires', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'lastFilterChangeDate': { displayAs: 'Filters Changed', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'lastSmokeChangeDate': { displayAs: 'Detectors Changed', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'hvacServiced': { displayAs: 'HVAC Serviced', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'fireplaceServiced': { displayAs: 'Fireplace Serviced', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    };
  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false }
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public propertyService: PropertyService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    public authService: AuthService,
    public officeService: OfficeService,
    public globalOfficeSelectionService: GlobalOfficeSelectionService,
    public route: ActivatedRoute,
    public utilityService: UtilityService,
    public ngZone: NgZone,
    public propertySelectionFilterService: PropertySelectionFilterService,
    private formatterService: FormatterService
  ) {
  }

  //#region Maintenance-List
  ngOnInit(): void {
    this.updateDisplayedColumns();
    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe((v) => (this.propertiesFiltered = v));
    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    this.navigationSubscription = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd),takeUntil(this.destroy$)).subscribe(e => {
      const path = e.urlAfterRedirects.split('?')[0];
      const isMaintenanceList = /\/maintenance$/.test(path);
      const fromSelection = this.lastNavigationUrl.includes('/selection');
      if (isMaintenanceList && fromSelection) {
        this.getProperties();
      }
      this.lastNavigationUrl = path;
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
            this.resolveOfficeScope(parsedOfficeId, true);
          }
        } else {
          this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
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

  /** Properties matching saved Property Selection (GET property/user/{userId}). */
  getProperties(): void {
    this.isServiceError = false;
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.allProperties = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getPropertiesBySelectionCritera(userId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (properties) => {
        const mappedProperties = this.mappingService.mapProperties(properties || []);
        this.allProperties = mappedProperties.map(property => ({
          ...property,
          propertyStatusText: getPropertyStatus(property.propertyStatusId),
          licenseDate: this.formatterService.formatDateString(property.licenseDate ?? undefined),
          lastFilterChangeDate: this.formatterService.formatDateString(property.lastFilterChangeDate ?? undefined),
          lastSmokeChangeDate: this.formatterService.formatDateString(property.lastSmokeChangeDate ?? undefined),
          hvacServiced: this.formatterService.formatDateString(property.hvacServiced ?? undefined),
          fireplaceServiced: this.formatterService.formatDateString(property.fireplaceServiced ?? undefined)
        }));
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
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'maintenance-list' } });
      return;
    }
    this.propertyService.getPropertySelection(userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, {
          state: { source: 'maintenance-list', selection }
        });
      },
      error: () => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'maintenance-list' } });
      }
    });
  }
  //#endregion
  
  //#region Routing Methods
  goToProperty(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId]));
    });
  }

  goToContact(event: MaintenanceListDisplay): void {
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
        
        this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
        
        this.getProperties();
      });
    });
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
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
  private updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    this.propertiesDisplayedColumns = this.isCompactView ? this.compactPropertiesDisplayedColumns : this.fullPropertiesDisplayedColumns;
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
