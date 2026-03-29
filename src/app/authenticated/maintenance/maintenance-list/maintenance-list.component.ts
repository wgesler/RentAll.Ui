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
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getBedSizeType, getBedSizeTypes, getPropertyStatuses } from '../../properties/models/property-enums';
import { PropertyListDisplay, PropertyRequest, PropertyResponse } from '../../properties/models/property.model';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { hasInspectorRole } from '../../shared/access/role-access';
import { MaintenanceRequest } from '../models/maintenance.model';
import { INSPECTION_SECTIONS } from '../models/checklist-sections';
import { MaintenanceService } from '../services/maintenance.service';
import { UserService } from '../../users/services/user.service';
import { UserResponse } from '../../users/models/user.model';
import { UserGroups } from '../../users/models/user-enums';

type UserDropdownCell = {
  value: string;
  isOverridable: boolean;
  options?: string[];
  panelClass?: string | string[];
  toString: () => string;
};

type BedDropdownCell = {
  value: string;
  isOverridable: boolean;
  toString: () => string;
};

type MaintenanceListDisplay = PropertyListDisplay & {
  propertyStatusText: string;
  propertyStatusDropdown: {
    value: string;
    isOverridable: boolean;
    panelClass?: string | string[];
    toString: () => string;
  };
  cleaner: UserDropdownCell;
  cleanerUserId?: string | null;
  cleaningDate: string;
  inspector: UserDropdownCell;
  inspectorUserId?: string | null;
  inspectingDate: string;
  bed1Text: BedDropdownCell;
  bed2Text: BedDropdownCell;
  bed3Text: BedDropdownCell;
  bed4Text: BedDropdownCell;
  needsMaintenance: boolean;
  needsMaintenanceState?: 'red' | 'yellow' | 'green';
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
  allProperties: MaintenanceListDisplay[] = [];
  propertiesDisplay: MaintenanceListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  globalOfficeSubscription?: Subscription;
  navigationSubscription?: Subscription;
  lastNavigationUrl = '';
  destroy$ = new Subject<void>();
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  housekeepingUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];
  housekeepingById = new Map<string, string>();
  inspectorById = new Map<string, string>();
  userId: string = '';
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  propertiesFiltered = false;
  officeScopeResolved = false;
  isCompactView = false;
  isInspectorView = false;
  inspectorPropertyIds = new Set<string>();

  private readonly compactViewportWidth = 1024;
  private readonly housekeepingUserOptions: string[] = ['Select Cleaner'];
  private readonly inspectorUserOptions: string[] = ['Select Inspector'];
  private readonly bedTypeOptions: string[] = getBedSizeTypes().map(bed => bed.label);
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly bedTypes = getBedSizeTypes();
  private readonly bedTypeByLabel = new Map(this.bedTypes.map(bed => [bed.label, bed.value]));
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'propertyAddress': { displayAs: 'Address', maxWidth: '30ch', sortType: 'natural', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '15ch', sort: true, options: this.propertyStatusLabels },
    'cleaner': { displayAs: 'Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.housekeepingUserOptions },
    'inspector': { displayAs: 'Inspector', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.inspectorUserOptions },
    'needsMaintenance': { displayAs: 'Maintenance', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' },
    'bed1Text': { displayAs: 'Bed1', wrap: false, maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', options: this.bedTypeOptions },
    'bed2Text': { displayAs: 'Bed2', wrap: false, maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', options: this.bedTypeOptions },
    'bed3Text': { displayAs: 'Bed3', wrap: false, maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', options: this.bedTypeOptions },
    'bed4Text': { displayAs: 'Bed4', wrap: false, maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', options: this.bedTypeOptions },
  
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
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'officeScope', 'cleaners', 'inspectors']));
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
    public maintenanceService: MaintenanceService,
    public userService: UserService
  ) {
  }

  //#region Maintenance-List
  ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId || '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    this.isInspectorView = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    this.inspectorPropertyIds = new Set(
      (this.authService.getUser()?.properties || [])
        .map(propertyId => propertyId.trim().toLowerCase())
        .filter(propertyId => propertyId !== '')
    );
    this.loadHousekeepingUsers();
    this.loadInspectorUsers();
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
        this.loadProperties();
      }
      this.lastNavigationUrl = path;
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

  //#endregion
  
  //#region Routing Methods
  goToProperty(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
    });
  }

  goToPropertyComponent(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId])}?returnTo=maintenance-list`);
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
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=1`);
    });
  }

  goToPropertySelection(): void {
    if (!this.userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'maintenance-list' } });
      return;
    }
    this.propertyService.getPropertySelection(this.userId).pipe(take(1)).subscribe({
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

  //#region Filter Methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allProperties;
    if (this.selectedOffice) {
      filtered = filtered.filter(property => property.officeId === this.selectedOffice.officeId);
    }

    this.propertiesDisplay = filtered;
  }
  //#endregion

  //#region Data Load Methods
  loadProperties(): void {
    this.isServiceError = false;
    if (!this.userId) {
      this.allProperties = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getActivePropertiesBySelectionCriteria(this.userId).pipe(take(1),
      switchMap(properties => this.maintenanceService.getMaintenanceList().pipe(take(1), map(maintenanceList => ({ properties, maintenanceList })))),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))
    ).subscribe({
      next: ({ properties, maintenanceList }) => {
        const maintenanceRows = this.mappingService.mapMaintenancePropertyDisplayRows(properties || [], maintenanceList || []).map(property => ({
          ...property,
          cleanerUserId: property.cleaner ?? null,
          inspectorUserId: property.inspector ?? null,
          propertyStatusDropdown: this.buildStatusDropdownCell(property.propertyStatusText),
          cleaner: this.buildUserDropdownCell(
            this.resolveCleanerName(property.cleaner ?? '', property.officeId),
            this.getCleanerOptionsForOffice(property.officeId)
          ),
          inspector: this.buildUserDropdownCell(
            this.resolveInspectorName(property.inspector ?? '', property.officeId),
            this.getInspectorOptionsForOffice(property.officeId)
          )
        }));
        this.allProperties = this.isInspectorView && this.inspectorPropertyIds.size > 0
          ? maintenanceRows.filter(property => this.inspectorPropertyIds.has(String(property.propertyId || '').trim().toLowerCase()))
          : maintenanceRows;
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

  loadHousekeepingUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'cleaners'))).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
        this.housekeepingById = new Map(
          this.housekeepingUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()])
        );
        const names = this.housekeepingUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Select Cleaner');
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, ...names);
        this.remapCleanerInspectorDropdowns();
      },
      error: () => {
        this.housekeepingUsers = [];
        this.housekeepingById = new Map<string, string>();
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, 'Select Cleaner');
        this.remapCleanerInspectorDropdowns();
      }
    });
  }

  loadInspectorUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspectors'))).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
        this.inspectorById = new Map(
          this.inspectorUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()])
        );
        const names = this.inspectorUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Select Inspector');
        this.inspectorUserOptions.splice(0, this.inspectorUserOptions.length, ...names);
        this.remapCleanerInspectorDropdowns();
      },
      error: () => {
        this.inspectorUsers = [];
        this.inspectorById = new Map<string, string>();
        this.inspectorUserOptions.splice(0, this.inspectorUserOptions.length, 'Select Inspector');
        this.remapCleanerInspectorDropdowns();
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
            const officeIdParam = this.route.snapshot.queryParamMap.get('officeId');
            if (officeIdParam) {
              const parsedOfficeId = parseInt(officeIdParam, 10);
              if (parsedOfficeId) {
                this.resolveOfficeScope(parsedOfficeId, true);
              }
            }
          }
        });
        this.loadProperties();
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
        this.loadProperties();
      }
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

  onDropdownChange(event: MaintenanceListDisplay): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedColumn === 'propertyStatusDropdown') {
      this.onPropertyStatusChange(event);
      return;
    }

    if (changedColumn === 'cleaner' || changedColumn === 'inspector') {
      const selectedCleanerId = this.resolveCleanerIdFromLabel(event.cleaner?.value ?? '', event.officeId);
      const selectedInspectorId = this.resolveInspectorIdFromLabel(event.inspector?.value ?? '', event.officeId);
      const currentCleanerId = event.cleanerUserId ?? null;
      const currentInspectorId = event.inspectorUserId ?? null;
      if (selectedCleanerId !== currentCleanerId || selectedInspectorId !== currentInspectorId) {
        this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedInspectorId);
      }
      return;
    }

    if (changedColumn === 'bed1Text' || changedColumn === 'bed2Text' || changedColumn === 'bed3Text' || changedColumn === 'bed4Text') {
      const selectedBed1Id = this.getBedTypeIdFromLabel(event.bed1Text?.value);
      const selectedBed2Id = this.getBedTypeIdFromLabel(event.bed2Text?.value);
      const selectedBed3Id = this.getBedTypeIdFromLabel(event.bed3Text?.value);
      const selectedBed4Id = this.getBedTypeIdFromLabel(event.bed4Text?.value);
      const hasBedChange =
        selectedBed1Id !== (event.bedroomId1 ?? 0) ||
        selectedBed2Id !== (event.bedroomId2 ?? 0) ||
        selectedBed3Id !== (event.bedroomId3 ?? 0) ||
        selectedBed4Id !== (event.bedroomId4 ?? 0);
      if (hasBedChange) {
        this.onBedTypesChange(event, selectedBed1Id, selectedBed2Id, selectedBed3Id, selectedBed4Id);
      }
      return;
    }

    const selectedStatusLabel = event.propertyStatusDropdown?.value ?? '';
    if (selectedStatusLabel !== event.propertyStatusText) {
      this.onPropertyStatusChange(event);
      return;
    }

    const selectedBed1Id = this.getBedTypeIdFromLabel(event.bed1Text?.value);
    const selectedBed2Id = this.getBedTypeIdFromLabel(event.bed2Text?.value);
    const selectedBed3Id = this.getBedTypeIdFromLabel(event.bed3Text?.value);
    const selectedBed4Id = this.getBedTypeIdFromLabel(event.bed4Text?.value);
    const hasBedChange =
      selectedBed1Id !== (event.bedroomId1 ?? 0) ||
      selectedBed2Id !== (event.bedroomId2 ?? 0) ||
      selectedBed3Id !== (event.bedroomId3 ?? 0) ||
      selectedBed4Id !== (event.bedroomId4 ?? 0);
    const selectedCleanerId = this.resolveCleanerIdFromLabel(event.cleaner?.value ?? '', event.officeId);
    const selectedInspectorId = this.resolveInspectorIdFromLabel(event.inspector?.value ?? '', event.officeId);
    const currentCleanerId = event.cleanerUserId ?? null;
    const currentInspectorId = event.inspectorUserId ?? null;
    if (selectedCleanerId !== currentCleanerId || selectedInspectorId !== currentInspectorId) {
      this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedInspectorId);
      return;
    }

    if (hasBedChange) {
      this.onBedTypesChange(event, selectedBed1Id, selectedBed2Id, selectedBed3Id, selectedBed4Id);
    }
  }

  //#region Property Status
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

  buildStatusDropdownCell(label: string, isOverridable: boolean = true): MaintenanceListDisplay['propertyStatusDropdown'] {
    return {
      value: label,
      isOverridable,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  buildUserDropdownCell(label: string, options: string[]): UserDropdownCell {
    return {
      value: label,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  buildPropertyStatusUpdateRequest(property: PropertyResponse, propertyStatusId: number): PropertyRequest {
    const request = this.buildPropertyUpdateRequest(property);
    request.propertyStatusId = propertyStatusId;
    return request;
  }

  buildPropertyUpdateRequest(property: PropertyResponse): PropertyRequest {
    const { officeName: _officeName, parkingNotes, ...requestBase } = property;
    return {
      ...requestBase,
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

  remapCleanerInspectorDropdowns(): void {
    this.allProperties = this.allProperties.map(property => {
      const cleanerKey = (property.cleaner as unknown as { value?: string })?.value ?? (property.cleaner as unknown as string) ?? '';
      const inspectorKey = (property.inspector as unknown as { value?: string })?.value ?? (property.inspector as unknown as string) ?? '';
      return {
        ...property,
        cleaner: this.buildUserDropdownCell(
          this.resolveCleanerName(property.cleanerUserId ?? cleanerKey, property.officeId),
          this.getCleanerOptionsForOffice(property.officeId)
        ),
        inspector: this.buildUserDropdownCell(
          this.resolveInspectorName(property.inspectorUserId ?? inspectorKey, property.officeId),
          this.getInspectorOptionsForOffice(property.officeId)
        )
      };
    });
    this.applyFilters();
  }

  resolveCleanerName(cleanerUserIdOrName: string, officeId: number): string {
    if (!cleanerUserIdOrName) {
      return 'Select Cleaner';
    }
    const officeUser = this.housekeepingUsers.find(user => user.userId === cleanerUserIdOrName && (user.officeAccess || []).includes(officeId));
    if (officeUser) {
      return `${officeUser.firstName ?? ''} ${officeUser.lastName ?? ''}`.trim();
    }
    return this.housekeepingById.get(cleanerUserIdOrName) ?? cleanerUserIdOrName;
  }

  resolveInspectorName(inspectorUserIdOrName: string, officeId: number): string {
    if (!inspectorUserIdOrName) {
      return 'Select Inspector';
    }
    const officeUser = this.inspectorUsers.find(user => user.userId === inspectorUserIdOrName && (user.officeAccess || []).includes(officeId));
    if (officeUser) {
      return `${officeUser.firstName ?? ''} ${officeUser.lastName ?? ''}`.trim();
    }
    return this.inspectorById.get(inspectorUserIdOrName) ?? inspectorUserIdOrName;
  }

  getCleanerOptionsForOffice(officeId: number): string[] {
    const names = this.housekeepingUsers
      .filter(user => (user.officeAccess || []).includes(officeId))
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Select Cleaner', ...names];
  }

  getInspectorOptionsForOffice(officeId: number): string[] {
    const names = this.inspectorUsers
      .filter(user => (user.officeAccess || []).includes(officeId))
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Select Inspector', ...names];
  }

  onBedTypesChange(event: MaintenanceListDisplay, bed1Id: number, bed2Id: number, bed3Id: number, bed4Id: number): void {
    this.propertyService.getPropertyByGuid(event.propertyId).pipe(
      take(1),
      switchMap((property: PropertyResponse) => {
        const request = this.buildPropertyUpdateRequest(property);
        request.bedroomId1 = bed1Id;
        request.bedroomId2 = bed2Id;
        request.bedroomId3 = bed3Id;
        request.bedroomId4 = bed4Id;
        return this.propertyService.updateProperty(request).pipe(take(1));
      })
    ).subscribe({
      next: () => {
        event.bedroomId1 = bed1Id;
        event.bedroomId2 = bed2Id;
        event.bedroomId3 = bed3Id;
        event.bedroomId4 = bed4Id;
        event.bed1Text = this.buildBedDropdownCell(bed1Id);
        event.bed2Text = this.buildBedDropdownCell(bed2Id);
        event.bed3Text = this.buildBedDropdownCell(bed3Id);
        event.bed4Text = this.buildBedDropdownCell(bed4Id);
        this.toastr.success('Property updated.', CommonMessage.Success);
      },
      error: () => {
        event.bed1Text = this.buildBedDropdownCell(event.bedroomId1 ?? 0);
        event.bed2Text = this.buildBedDropdownCell(event.bedroomId2 ?? 0);
        event.bed3Text = this.buildBedDropdownCell(event.bedroomId3 ?? 0);
        event.bed4Text = this.buildBedDropdownCell(event.bedroomId4 ?? 0);
        this.toastr.error('Unable to update property.', CommonMessage.Error);
      }
    });
  }

  onMaintenanceAssigneesChange(event: MaintenanceListDisplay, cleanerUserId: string | null, inspectorUserId: string | null): void {
    this.maintenanceService.getByPropertyId(event.propertyId).pipe(
      take(1),
      switchMap((existing) => {
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId,
          organizationId: existing?.organizationId ?? this.organizationId,
          officeId: existing?.officeId ?? event.officeId,
          officeName: existing?.officeName ?? event.officeName ?? '',
          propertyId: event.propertyId,
          inspectionCheckList: existing?.inspectionCheckList ?? this.buildDefaultInspectionTemplateJson(),
          cleanerUserId,
          cleaningDate: existing?.cleaningDate ?? null,
          inspectorUserId,
          inspectingDate: existing?.inspectingDate ?? null,
          filterDescription: existing?.filterDescription ?? null,
          lastFilterChangeDate: existing?.lastFilterChangeDate ?? null,
          smokeDetectors: existing?.smokeDetectors ?? null,
          lastSmokeChangeDate: existing?.lastSmokeChangeDate ?? null,
          smokeDetectorBatteries: existing?.smokeDetectorBatteries ?? null,
          lastBatteryChangeDate: existing?.lastBatteryChangeDate ?? null,
          licenseNo: existing?.licenseNo ?? null,
          licenseDate: existing?.licenseDate ?? null,
          hvacNotes: existing?.hvacNotes ?? null,
          hvacServiced: existing?.hvacServiced ?? null,
          fireplaceNotes: existing?.fireplaceNotes ?? null,
          fireplaceServiced: existing?.fireplaceServiced ?? null,
          notes: existing?.notes ?? null,
          isActive: existing?.isActive ?? true
        };
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload).pipe(take(1))
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined }).pipe(take(1));
      })
    ).subscribe({
      next: (saved) => {
        event.cleanerUserId = saved?.cleanerUserId ?? null;
        event.inspectorUserId = saved?.inspectorUserId ?? null;
        event.cleaner = this.buildUserDropdownCell(
          this.resolveCleanerName(event.cleanerUserId ?? '', event.officeId),
          this.getCleanerOptionsForOffice(event.officeId)
        );
        event.inspector = this.buildUserDropdownCell(
          this.resolveInspectorName(event.inspectorUserId ?? '', event.officeId),
          this.getInspectorOptionsForOffice(event.officeId)
        );
        this.toastr.success('Maintenance updated.', CommonMessage.Success);
      },
      error: () => {
        event.cleaner = this.buildUserDropdownCell(
          this.resolveCleanerName(event.cleanerUserId ?? '', event.officeId),
          this.getCleanerOptionsForOffice(event.officeId)
        );
        event.inspector = this.buildUserDropdownCell(
          this.resolveInspectorName(event.inspectorUserId ?? '', event.officeId),
          this.getInspectorOptionsForOffice(event.officeId)
        );
        this.toastr.error('Unable to update maintenance.', CommonMessage.Error);
      }
    });
  }

  buildBedDropdownCell(bedId: number): BedDropdownCell {
    const value = getBedSizeType(bedId);
    return {
      value,
      isOverridable: true,
      toString: () => value
    };
  }

  getBedTypeIdFromLabel(label: string | undefined): number {
    if (!label) {
      return 0;
    }
    return this.bedTypeByLabel.get(label) ?? 0;
  }

  resolveCleanerIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Select Cleaner') {
      return null;
    }
    const officeUsers = this.housekeepingUsers.filter(user => (user.officeAccess || []).includes(officeId));
    const user = officeUsers.find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveInspectorIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Select Inspector') {
      return null;
    }
    const officeUsers = this.inspectorUsers.filter(user => (user.officeAccess || []).includes(officeId));
    const user = officeUsers.find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  buildDefaultInspectionTemplateJson(): string {
    const payload = {
      sections: INSPECTION_SECTIONS.map(section => ({
        key: section.key,
        title: section.title,
        notes: '',
        sets: [
          section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: false,
            count: null,
            isEditable: false,
            photoPath: null as string | null
          }))
        ]
      }))
    };
    return JSON.stringify(payload);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.navigationSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
