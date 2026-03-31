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
import { MaintenanceListMappingContext, MappingService } from '../../../services/mapping.service';
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
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';

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
  carpet: UserDropdownCell;
  carpetUserId?: string | null;
  carpetDate: string;
  inspector: UserDropdownCell;
  inspectorUserId?: string | null;
  inspectingDate: string;
  bed1Text: BedDropdownCell;
  bed2Text: BedDropdownCell;
  bed3Text: BedDropdownCell;
  bed4Text: BedDropdownCell;
  petsAllowed: boolean;
  needsMaintenance: boolean;
  needsMaintenanceState?: 'red' | 'yellow' | 'green' | 'grey';
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
  upcomingDeparturePropertiesDisplay: MaintenanceListDisplay[] = [];
  remainingPropertiesDisplay: MaintenanceListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  globalOfficeSubscription?: Subscription;
  navigationSubscription?: Subscription;
  lastNavigationUrl = '';
  destroy$ = new Subject<void>();
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  housekeepingUsers: UserResponse[] = [];
  carpetUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];
  housekeepingById = new Map<string, string>();
  carpetById = new Map<string, string>();
  inspectorById = new Map<string, string>();
  userId: string = '';
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  propertiesFiltered = false;
  officeScopeResolved = false;
  isCompactView = false;
  isInspectorView = false;
  inspectorPropertyIds = new Set<string>();
  upcomingDeparturePropertyIds = new Set<string>();
  currentReservationHasPetsByPropertyId = new Map<string, boolean>();

  private readonly compactViewportWidth = 1024;
  private readonly upcomingDepartureWindowDays = 14;
  private readonly housekeepingUserOptions: string[] = ['Clear Selection'];
  private readonly carpetUserOptions: string[] = ['Clear Selection'];
  private readonly inspectorUserOptions: string[] = ['Clear Selection'];
  private readonly bedTypeOptions: string[] = getBedSizeTypes().map(bed => bed.label);
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly bedTypes = getBedSizeTypes();
  private readonly bedTypeByLabel = new Map(this.bedTypes.map(bed => [bed.label, bed.value]));
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '13ch', sort: true, options: this.propertyStatusLabels },
    'needsMaintenance': { displayAs: 'Maint', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'petsAllowed': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'cleaningDate': { displayAs: 'Cleaner Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'cleaner': { displayAs: 'Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.housekeepingUserOptions },
    'carpetDate': { displayAs: 'Carpet Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'carpet': { displayAs: 'Carpet Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.carpetUserOptions },
    'inspectingDate': { displayAs: 'Inspector Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'inspector': { displayAs: 'Inspector', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.inspectorUserOptions },
    };
    
  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural', wrap: false }
  };

  private readonly inspectorPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'propertyAddress': { displayAs: 'Address', maxWidth: '25ch', sortType: 'natural', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '20ch', sort: true, options: this.propertyStatusLabels },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '15ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'petsAllowed': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '15ch', alignment: 'center', options: this.bedTypeOptions},
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'properties', 'officeScope', 'cleaners', 'carpetUsers', 'inspectors', 'reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public propertyService: PropertyService,
    public toastr: ToastrService,
    public router: Router,
    public formatterService: FormatterService,
    public mappingService: MappingService,
    public authService: AuthService,
    public officeService: OfficeService,
    public globalOfficeSelectionService: GlobalOfficeSelectionService,
    public route: ActivatedRoute,
    public utilityService: UtilityService,
    public ngZone: NgZone,
    public propertySelectionFilterService: PropertySelectionFilterService,
    public maintenanceService: MaintenanceService,
    public userService: UserService,
    public reservationService: ReservationService
  ) {
  }

  //#region Maintenance-List
  ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId || '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;

    // If the user is an inspector, the admin can limit the properties they view
    this.isInspectorView = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    this.inspectorPropertyIds = new Set(
      (this.authService.getUser()?.properties || [])
        .map(propertyId => propertyId.trim().toLowerCase())
        .filter(propertyId => propertyId !== '')
    );
    this.loadHousekeepingUsers();
    this.loadCarpetUsers();
    this.loadInspectorUsers();
    this.loadActiveReservations();
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
        this.loadPropertyMaintenance();
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
  goToPropertyMaintenance(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=1`);
    });
  }

  goToProperty(event: MaintenanceListDisplay): void {
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
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
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
    this.splitPropertiesByUpcomingDepartures();
  }
  //#endregion

  //#region Data Load Methods
  loadActiveReservations(): void {
    this.reservationService.getActiveReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))).subscribe({
      next: (reservations: ReservationListResponse[]) => {
        this.upcomingDeparturePropertyIds = this.buildUpcomingDeparturePropertyIds(reservations || []);
        this.currentReservationHasPetsByPropertyId = this.buildCurrentReservationHasPetsByPropertyId(reservations || []);
        this.allProperties = this.mappingService.mapMaintenancePetsFromCurrentReservations(
          this.allProperties,
          this.currentReservationHasPetsByPropertyId
        );
        this.applyFilters();
      },
      error: () => {
        this.upcomingDeparturePropertyIds = new Set<string>();
        this.currentReservationHasPetsByPropertyId = new Map<string, boolean>();
        this.allProperties = this.mappingService.mapMaintenancePetsFromCurrentReservations(
          this.allProperties,
          this.currentReservationHasPetsByPropertyId
        );
        this.applyFilters();
      }
    });
  }

  loadPropertyMaintenance(): void {
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
      next: (loadResponse) => {
        const mappingContext: MaintenanceListMappingContext = {
          housekeepingUsers: this.housekeepingUsers,
          inspectorUsers: this.inspectorUsers,
          housekeepingById: this.housekeepingById,
          inspectorById: this.inspectorById,
          isInspectorView: this.isInspectorView,
          inspectorPropertyIds: this.inspectorPropertyIds,
          currentReservationHasPetsByPropertyId: this.currentReservationHasPetsByPropertyId
        };
        this.allProperties = this.mappingService.mapMaintenanceListDisplayRowsFromLoadResponse(
          loadResponse,
          mappingContext
        ) as MaintenanceListDisplay[];
        this.remapCleanerInspectorDropdowns();
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
        this.housekeepingById = new Map(this.housekeepingUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.housekeepingUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Clear Selection');
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, ...names);
        this.remapCleanerInspectorDropdowns();
      },
      error: () => {
        this.housekeepingUsers = [];
        this.housekeepingById = new Map<string, string>();
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, 'Clear Selection');
        this.remapCleanerInspectorDropdowns();
      }
    });
  }

  loadCarpetUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Vendor]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'carpetUsers'))).subscribe({
      next: (users: UserResponse[]) => {
        this.carpetUsers = users || [];
        this.carpetById = new Map(this.carpetUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.carpetUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Clear Selection');
        this.carpetUserOptions.splice(0, this.carpetUserOptions.length, ...names);
        this.remapCleanerInspectorDropdowns();
      },
      error: () => {
        this.carpetUsers = [];
        this.carpetById = new Map<string, string>();
        this.carpetUserOptions.splice(0, this.carpetUserOptions.length, 'Clear Selection');
        this.remapCleanerInspectorDropdowns();
      }
    });
  }

  loadInspectorUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspectors'))).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
        this.inspectorById = new Map(this.inspectorUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.inspectorUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Clear Selection');
        this.inspectorUserOptions.splice(0, this.inspectorUserOptions.length, ...names);
        this.remapCleanerInspectorDropdowns();
      },
      error: () => {
        this.inspectorUsers = [];
        this.inspectorById = new Map<string, string>();
        this.inspectorUserOptions.splice(0, this.inspectorUserOptions.length, 'Clear Selection');
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
        this.loadPropertyMaintenance();
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.resolveOfficeScope(this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
        this.loadPropertyMaintenance();
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
    this.remapCleanerInspectorDropdowns();
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    }
    this.remapCleanerInspectorDropdowns();
  }
  //#endregion

  //#region Dropdown Update Methods
  onInlineEditChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    const changedColumn = event.__changedInlineColumn;
    if (changedColumn !== 'cleaningDate' && changedColumn !== 'carpetDate' && changedColumn !== 'inspectingDate') {
      return;
    }
    this.onMaintenanceDateChange(event, changedColumn as 'cleaningDate' | 'carpetDate' | 'inspectingDate', event.__inlineValue ?? '');
  }

  onDropdownChange(event: MaintenanceListDisplay): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (changedColumn === 'propertyStatusDropdown') {
      this.onPropertyStatusChange(event);
      return;
    }

    if (changedColumn === 'cleaner' || changedColumn === 'carpet' || changedColumn === 'inspector') {
      const selectedCleanerLabel = event.cleaner?.value ?? '';
      const selectedCarpetLabel = event.carpet?.value ?? '';
      const selectedInspectorLabel = event.inspector?.value ?? '';
      const selectedCleanerId = this.resolveCleanerIdFromLabel(event.cleaner?.value ?? '', event.officeId);
      const selectedCarpetId = this.resolveCarpetIdFromLabel(event.carpet?.value ?? '', event.officeId);
      const selectedInspectorId = this.resolveInspectorIdFromLabel(event.inspector?.value ?? '', event.officeId);
      const currentCleanerId = event.cleanerUserId ?? null;
      const currentCarpetId = event.carpetUserId ?? null;
      const currentInspectorId = event.inspectorUserId ?? null;
      const shouldClearCleanerDate = selectedCleanerId === null && (event.cleaningDate ?? '').trim() !== '';
      const shouldClearCarpetDate = selectedCarpetId === null && (event.carpetDate ?? '').trim() !== '';
      const shouldClearInspectorDate = selectedInspectorId === null && (event.inspectingDate ?? '').trim() !== '';
      if (selectedCleanerId !== currentCleanerId || selectedCarpetId !== currentCarpetId || selectedInspectorId !== currentInspectorId || shouldClearCleanerDate || shouldClearCarpetDate || shouldClearInspectorDate) {
        this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedCarpetId, selectedInspectorId);
      } else if (selectedCleanerLabel === 'Clear Selection' || selectedCarpetLabel === 'Clear Selection' || selectedInspectorLabel === 'Clear Selection') {
        event.cleaner = this.buildUserDropdownCell(
          this.resolveCleanerName(event.cleanerUserId ?? '', event.officeId),
          this.getCleanerOptionsForOffice(event.officeId)
        );
        event.carpet = this.buildUserDropdownCell(
          this.resolveCarpetName(event.carpetUserId ?? '', event.officeId),
          this.getCarpetOptionsForOffice(event.officeId)
        );
        event.inspector = this.buildUserDropdownCell(
          this.resolveInspectorName(event.inspectorUserId ?? '', event.officeId),
          this.getInspectorOptionsForOffice(event.officeId)
        );
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
    const selectedCarpetId = this.resolveCarpetIdFromLabel(event.carpet?.value ?? '', event.officeId);
    const selectedInspectorId = this.resolveInspectorIdFromLabel(event.inspector?.value ?? '', event.officeId);
    const currentCleanerId = event.cleanerUserId ?? null;
    const currentCarpetId = event.carpetUserId ?? null;
    const currentInspectorId = event.inspectorUserId ?? null;
    if (selectedCleanerId !== currentCleanerId || selectedCarpetId !== currentCarpetId || selectedInspectorId !== currentInspectorId) {
      this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedCarpetId, selectedInspectorId);
      return;
    }

    if (hasBedChange) {
      this.onBedTypesChange(event, selectedBed1Id, selectedBed2Id, selectedBed3Id, selectedBed4Id);
    }
  }

  onMaintenanceDateChange(event: MaintenanceListDisplay, columnName: 'cleaningDate' | 'carpetDate' | 'inspectingDate', dateValue: string): void {
    const isoDate = this.mappingService.toIsoDateOrNull(dateValue);
    const cleanerUserId = event.cleanerUserId ?? null;
    const carpetUserId = event.carpetUserId ?? null;
    const inspectorUserId = event.inspectorUserId ?? null;
    const dateOverrides = columnName === 'cleaningDate'
      ? {
          cleaningDate: cleanerUserId ? isoDate : null as string | null,
          carpetDate: undefined as string | null | undefined,
          inspectingDate: undefined as string | null | undefined
        }
      : columnName === 'carpetDate'
        ? {
            cleaningDate: undefined as string | null | undefined,
            carpetDate: carpetUserId ? isoDate : null as string | null,
            inspectingDate: undefined as string | null | undefined
          }
        : {
            cleaningDate: undefined as string | null | undefined,
            carpetDate: undefined as string | null | undefined,
            inspectingDate: inspectorUserId ? isoDate : null as string | null
          };

    this.maintenanceService.getByPropertyId(event.propertyId).pipe(take(1), switchMap((existing) => {
      const payload = this.buildMaintenancePayload(event, existing, {
        cleanerUserId,
        carpetUserId,
        inspectorUserId,
        cleaningDate: dateOverrides.cleaningDate,
        carpetDate: dateOverrides.carpetDate,
        inspectingDate: dateOverrides.inspectingDate
      });
      return payload.maintenanceId
        ? this.maintenanceService.updateMaintenance(payload).pipe(take(1))
        : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined }).pipe(take(1));
    })).subscribe({
      next: (saved) => {
        event.cleaningDate = this.formatterService.formatDateString(saved?.cleaningDate ?? undefined) || '';
        event.carpetDate = this.formatterService.formatDateString(saved?.carpetDate ?? undefined) || '';
        event.inspectingDate = this.formatterService.formatDateString(saved?.inspectingDate ?? undefined) || '';
        this.toastr.success('Maintenance updated.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to update maintenance.', CommonMessage.Error);
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

  onBedTypesChange(event: MaintenanceListDisplay, bed1Id: number, bed2Id: number, bed3Id: number, bed4Id: number): void {
    this.propertyService.getPropertyByGuid(event.propertyId).pipe(take(1),switchMap((property: PropertyResponse) => {
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

  onMaintenanceAssigneesChange(event: MaintenanceListDisplay, cleanerUserId: string | null, carpetUserId: string | null, inspectorUserId: string | null): void {
    this.maintenanceService.getByPropertyId(event.propertyId).pipe(take(1), switchMap((existing) => {
        const payload = this.buildMaintenancePayload(event, existing, {
          cleanerUserId,
          carpetUserId,
          inspectorUserId,
          cleaningDate: cleanerUserId ? existing?.cleaningDate : null,
          carpetDate: carpetUserId ? existing?.carpetDate : null,
          inspectingDate: inspectorUserId ? existing?.inspectingDate : null
        });
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload).pipe(take(1))
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined }).pipe(take(1));
      })
    ).subscribe({
      next: (saved) => {
        event.cleanerUserId = saved?.cleanerUserId ?? null;
        event.carpetUserId = saved?.carpetUserId ?? null;
        event.inspectorUserId = saved?.inspectorUserId ?? null;
        event.cleaningDate = this.formatterService.formatDateString(saved?.cleaningDate ?? undefined) || '';
        event.carpetDate = this.formatterService.formatDateString(saved?.carpetDate ?? undefined) || '';
        event.inspectingDate = this.formatterService.formatDateString(saved?.inspectingDate ?? undefined) || '';
        event.cleaner = this.buildUserDropdownCell(
          this.resolveCleanerName(event.cleanerUserId ?? '', event.officeId),
          this.getCleanerOptionsForOffice(event.officeId)
        );
        event.carpet = this.buildUserDropdownCell(
          this.resolveCarpetName(event.carpetUserId ?? '', event.officeId),
          this.getCarpetOptionsForOffice(event.officeId)
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
        event.carpet = this.buildUserDropdownCell(
          this.resolveCarpetName(event.carpetUserId ?? '', event.officeId),
          this.getCarpetOptionsForOffice(event.officeId)
        );
        event.inspector = this.buildUserDropdownCell(
          this.resolveInspectorName(event.inspectorUserId ?? '', event.officeId),
          this.getInspectorOptionsForOffice(event.officeId)
        );
        this.toastr.error('Unable to update maintenance.', CommonMessage.Error);
      }
    });
  }

  buildMaintenancePayload(
    event: MaintenanceListDisplay,
    existing: MaintenanceRequest | null,
    overrides: {
      cleanerUserId?: string | null;
      cleaningDate?: string | null;
      carpetUserId?: string | null;
      carpetDate?: string | null;
      inspectorUserId?: string | null;
      inspectingDate?: string | null;
    }
  ): MaintenanceRequest {
    return {
      maintenanceId: existing?.maintenanceId,
      organizationId: existing?.organizationId ?? this.organizationId,
      officeId: existing?.officeId ?? event.officeId,
      officeName: existing?.officeName ?? event.officeName ?? '',
      propertyId: event.propertyId,
      inspectionCheckList: existing?.inspectionCheckList ?? this.buildDefaultInspectionTemplateJson(),
      cleanerUserId: overrides.cleanerUserId !== undefined ? overrides.cleanerUserId : (existing?.cleanerUserId ?? null),
      cleaningDate: overrides.cleaningDate !== undefined ? overrides.cleaningDate : existing?.cleaningDate,
      carpetUserId: overrides.carpetUserId !== undefined ? overrides.carpetUserId : (existing?.carpetUserId ?? null),
      carpetDate: overrides.carpetDate !== undefined ? overrides.carpetDate : existing?.carpetDate,
      inspectorUserId: overrides.inspectorUserId !== undefined ? overrides.inspectorUserId : (existing?.inspectorUserId ?? null),
      inspectingDate: overrides.inspectingDate !== undefined ? overrides.inspectingDate : existing?.inspectingDate,
      filterDescription: existing?.filterDescription,
      lastFilterChangeDate: existing?.lastFilterChangeDate,
      smokeDetectors: existing?.smokeDetectors,
      lastSmokeChangeDate: existing?.lastSmokeChangeDate,
      smokeDetectorBatteries: existing?.smokeDetectorBatteries,
      lastBatteryChangeDate: existing?.lastBatteryChangeDate,
      licenseNo: existing?.licenseNo,
      licenseDate: existing?.licenseDate,
      hvacNotes: existing?.hvacNotes,
      hvacServiced: existing?.hvacServiced,
      fireplaceNotes: existing?.fireplaceNotes,
      fireplaceServiced: existing?.fireplaceServiced,
      notes: existing?.notes,
      isActive: existing?.isActive ?? true
    };
  }
  //#endregion

  //#region Property Status Display
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

  //#region Cleaner/Inspector Display
  remapCleanerInspectorDropdowns(): void {
    this.allProperties = this.allProperties.map(property => {
      const cleanerKey = (property.cleaner as unknown as { value?: string })?.value ?? (property.cleaner as unknown as string) ?? '';
      const carpetKey = (property.carpet as unknown as { value?: string })?.value ?? (property.carpet as unknown as string) ?? '';
      const inspectorKey = (property.inspector as unknown as { value?: string })?.value ?? (property.inspector as unknown as string) ?? '';
      return {
        ...property,
        cleaner: this.buildUserDropdownCell(
          this.resolveCleanerName(property.cleanerUserId ?? cleanerKey, property.officeId),
          this.getCleanerOptionsForOffice(property.officeId)
        ),
        carpet: this.buildUserDropdownCell(
          this.resolveCarpetName(property.carpetUserId ?? carpetKey, property.officeId),
          this.getCarpetOptionsForOffice(property.officeId)
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
    if (!cleanerUserIdOrName || cleanerUserIdOrName === 'Clear Selection' || cleanerUserIdOrName === 'Select Cleaner') {
      return '';
    }
    const matchingUser = this.getHousekeepingUsersForScope(officeId).find(user => user.userId === cleanerUserIdOrName);
    if (matchingUser) {
      return `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim();
    }
    return this.housekeepingById.get(cleanerUserIdOrName) ?? cleanerUserIdOrName;
  }

  resolveInspectorName(inspectorUserIdOrName: string, officeId: number): string {
    if (!inspectorUserIdOrName || inspectorUserIdOrName === 'Select Inspector') {
      return '';
    }
    const matchingUser = this.getInspectorUsersForScope(officeId).find(user => user.userId === inspectorUserIdOrName);
    if (matchingUser) {
      return `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim();
    }
    return this.inspectorById.get(inspectorUserIdOrName) ?? inspectorUserIdOrName;
  }

  resolveCarpetName(carpetUserIdOrName: string, officeId: number): string {
    if (!carpetUserIdOrName || carpetUserIdOrName === 'Clear Selection' || carpetUserIdOrName === 'Select Carpet Cleaner') {
      return '';
    }
    const matchingUser = this.getCarpetUsersForScope(officeId).find(user => user.userId === carpetUserIdOrName);
    if (matchingUser) {
      return `${matchingUser.firstName ?? ''} ${matchingUser.lastName ?? ''}`.trim();
    }
    return this.carpetById.get(carpetUserIdOrName) ?? carpetUserIdOrName;
  }

  getCleanerOptionsForOffice(officeId: number): string[] {
    const names = this.getHousekeepingUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  getInspectorOptionsForOffice(officeId: number): string[] {
    const names = this.getInspectorUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  getCarpetOptionsForOffice(officeId: number): string[] {
    const names = this.getCarpetUsersForScope(officeId)
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return ['Clear Selection', ...names];
  }

  resolveCleanerIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Cleaner') {
      return null;
    }
    const user = this.getHousekeepingUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveInspectorIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Inspector') {
      return null;
    }
    const user = this.getInspectorUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  resolveCarpetIdFromLabel(label: string, officeId: number): string | null {
    if (!label || label === 'Clear Selection' || label === 'Select Carpet Cleaner') {
      return null;
    }
    const user = this.getCarpetUsersForScope(officeId).find(candidate => `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() === label);
    return user?.userId ?? null;
  }

  getHousekeepingUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.housekeepingUsers;
    }
    return this.housekeepingUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
  }

  getInspectorUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.inspectorUsers;
    }
    return this.inspectorUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
  }

  getCarpetUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.carpetUsers;
    }
    return this.carpetUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
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
 //#endregion

  //#region Bedroom Display
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

  splitPropertiesByUpcomingDepartures(): void {
    if (!this.propertiesDisplay?.length) {
      this.upcomingDeparturePropertiesDisplay = [];
      this.remainingPropertiesDisplay = [];
      return;
    }

    const upcomingProperties: MaintenanceListDisplay[] = [];
    const remainingProperties: MaintenanceListDisplay[] = [];
    this.propertiesDisplay.forEach(property => {
      const normalizedPropertyId = this.normalizePropertyId(property.propertyId);
      if (normalizedPropertyId && this.upcomingDeparturePropertyIds.has(normalizedPropertyId)) {
        upcomingProperties.push(property);
        return;
      }
      remainingProperties.push(property);
    });

    this.upcomingDeparturePropertiesDisplay = upcomingProperties;
    this.remainingPropertiesDisplay = remainingProperties;
  }

  buildUpcomingDeparturePropertyIds(reservations: ReservationListResponse[]): Set<string> {
    const propertyIds = new Set<string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(today.getDate() + this.upcomingDepartureWindowDays);
    windowEnd.setHours(23, 59, 59, 999);

    reservations.forEach(reservation => {
      if (!reservation.isActive || !reservation.departureDate) {
        return;
      }

      const departureDate = new Date(reservation.departureDate);
      if (Number.isNaN(departureDate.getTime())) {
        return;
      }

      departureDate.setHours(0, 0, 0, 0);
      const departureTime = departureDate.getTime();
      if (departureTime >= today.getTime() && departureTime <= windowEnd.getTime()) {
        const normalizedPropertyId = this.normalizePropertyId(reservation.propertyId);
        if (normalizedPropertyId) {
          propertyIds.add(normalizedPropertyId);
        }
      }
    });

    return propertyIds;
  }

  buildCurrentReservationHasPetsByPropertyId(reservations: ReservationListResponse[]): Map<string, boolean> {
    const propertyHasPetsById = new Map<string, boolean>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    reservations.forEach(reservation => {
      if (!reservation.isActive || !reservation.propertyId || !reservation.arrivalDate || !reservation.departureDate) {
        return;
      }

      const arrivalDate = new Date(reservation.arrivalDate);
      const departureDate = new Date(reservation.departureDate);
      if (Number.isNaN(arrivalDate.getTime()) || Number.isNaN(departureDate.getTime())) {
        return;
      }
      arrivalDate.setHours(0, 0, 0, 0);
      departureDate.setHours(0, 0, 0, 0);

      const isCurrentReservation = today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime();
      if (!isCurrentReservation) {
        return;
      }

      const normalizedPropertyId = this.normalizePropertyId(reservation.propertyId);
      if (!normalizedPropertyId) {
        return;
      }

      const hasPets = reservation.hasPets === true;
      const existingValue = propertyHasPetsById.get(normalizedPropertyId) === true;
      propertyHasPetsById.set(normalizedPropertyId, existingValue || hasPets);
    });

    return propertyHasPetsById;
  }

  normalizePropertyId(propertyId: string | null | undefined): string {
    return (propertyId ?? '').trim().toLowerCase();
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
