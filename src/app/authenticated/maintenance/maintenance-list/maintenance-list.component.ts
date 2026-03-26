import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, skip, switchMap, take, takeUntil } from 'rxjs';
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
import { getBedSizeType } from '../../properties/models/property-enums';
import { getPropertyStatus } from '../../properties/models/property-enums';
import { getPropertyStatuses } from '../../properties/models/property-enums';
import { PropertyListDisplay, PropertyRequest, PropertyResponse } from '../../properties/models/property.model';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { hasInspectorRole } from '../../shared/access/role-access';

type MaintenanceListDisplay = PropertyListDisplay & {
  propertyStatusText: string;
  propertyStatusDropdown: {
    value: string;
    isOverridable: boolean;
    toString: () => string;
  };
  bed1Text: string;
  bed2Text: string;
  bed3Text: string;
  bed4Text: string;
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
  isInspectorView = false;

  private readonly compactViewportWidth = 1024;
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '15ch', wrap: false },
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false },
    'ownerName': { displayAs: 'Owner', maxWidth: '20ch', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '20ch', sort: true, options: this.propertyStatusLabels },
    'licenseDate': { displayAs: 'License Expires', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'lastFilterChangeDate': { displayAs: 'Filters Changed', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'lastSmokeChangeDate': { displayAs: 'Detectors Changed', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'hvacServiced': { displayAs: 'HVAC Serviced', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    'fireplaceServiced': { displayAs: 'Fireplace Serviced', wrap: false, maxWidth: '20ch', alignment: 'center', headerAlignment: 'center' },
    };
    
  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false }
  };

  private readonly inspectorPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '23ch', sort: true, options: this.propertyStatusLabels },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '15ch', alignment: 'center'},
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
    this.isInspectorView = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
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

  getProperties(): void {
    this.isServiceError = false;
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.allProperties = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getPropertiesBySelectionCritera(userId, true).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (properties) => {
        const mappedProperties = this.mappingService.mapProperties(properties || []);
        this.allProperties = mappedProperties.map(property => ({
          ...property,
          propertyStatusText: getPropertyStatus(property.propertyStatusId),
          propertyStatusDropdown: this.buildStatusDropdownCell(getPropertyStatus(property.propertyStatusId)),
          bed1Text: property.bedroomId1 ? getBedSizeType(property.bedroomId1) : 'None',
          bed2Text: property.bedroomId2 ? getBedSizeType(property.bedroomId2) : 'None',
          bed3Text: property.bedroomId3 ? getBedSizeType(property.bedroomId3) : 'None',
          bed4Text: property.bedroomId4 ? getBedSizeType(property.bedroomId4) : 'None',
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

  goToInspection(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
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

  onPropertyStatusChange(event: MaintenanceListDisplay): void {
    const selectedLabel = event.propertyStatusDropdown?.value ?? '';
    const selectedStatusId = this.propertyStatusByLabel.get(selectedLabel);
    const previousStatusId = event.propertyStatusId;
    const previousLabel = event.propertyStatusText;

    if (selectedStatusId === undefined) {
      event.propertyStatusDropdown = this.buildStatusDropdownCell(previousLabel);
      return;
    }

    if (selectedStatusId === previousStatusId) {
      return;
    }

    event.propertyStatusDropdown = this.buildStatusDropdownCell(selectedLabel, false);

    this.propertyService.getPropertyByGuid(event.propertyId).pipe(take(1),
      switchMap((property: PropertyResponse) => this.propertyService.updateProperty(this.buildPropertyStatusUpdateRequest(property, selectedStatusId)).pipe(take(1))),
      finalize(() => {
        event.propertyStatusDropdown = this.buildStatusDropdownCell(event.propertyStatusText);
      })
    ).subscribe({
      next: () => {
        this.updatePropertyStatusDisplay(event.propertyId, selectedStatusId, selectedLabel);
        this.toastr.success('Property status updated.', CommonMessage.Success);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error updating property status:', err);
        this.updatePropertyStatusDisplay(event.propertyId, previousStatusId, previousLabel);
        this.toastr.error('Unable to update property status.', CommonMessage.Error);
      }
    });
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

  //#region Property Status
  buildStatusDropdownCell(label: string, isOverridable: boolean = true): MaintenanceListDisplay['propertyStatusDropdown'] {
    return {
      value: label,
      isOverridable,
      toString: () => label
    };
  }

  buildPropertyStatusUpdateRequest(property: PropertyResponse, propertyStatusId: number): PropertyRequest {
    const { officeName: _officeName, parkingNotes, ...requestBase } = property;
    return {
      ...requestBase,
      propertyStatusId,
      parkingnotes: parkingNotes
    };
  }

  updatePropertyStatusDisplay(propertyId: string, propertyStatusId: number, propertyStatusText: string): void {
    for (const property of this.allProperties) {
      if (property.propertyId === propertyId) {
        property.propertyStatusId = propertyStatusId;
        property.propertyStatusText = propertyStatusText;
        property.propertyStatusDropdown = this.buildStatusDropdownCell(propertyStatusText);
        break;
      }
    }
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    if (this.isCompactView) {
      this.propertiesDisplayedColumns = this.compactPropertiesDisplayedColumns;
      return;
    }

    this.propertiesDisplayedColumns = this.isInspectorView
      ? this.inspectorPropertiesDisplayedColumns
      : this.fullPropertiesDisplayedColumns;
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
