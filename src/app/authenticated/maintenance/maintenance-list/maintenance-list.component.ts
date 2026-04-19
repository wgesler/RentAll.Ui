import { CommonModule } from "@angular/common";
import { Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MaintenanceListCurrentReservationByPropertyId, MaintenanceListDisplay, MaintenanceListMappingContext, PropertyMaintenance, ReservationPropertyMaintenance } from '../../shared/models/mixed-models';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getBedSizeTypes, getPropertyStatuses } from '../../properties/models/property-enums';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { hasCompanyRole } from '../../shared/access/role-access';
import { MaintenanceListUserDropdownCell } from '../models/maintenance.model';
import { MaintenanceItemResponse } from '../models/maintenance-item.model';
import { INSPECTION_SECTIONS } from '../models/checklist-sections';
import { MaintenanceService } from '../services/maintenance.service';
import { MaintenanceItemsService } from '../services/maintenance-items.service';
import { UserService } from '../../users/services/user.service';
import { UserResponse } from '../../users/models/user.model';
import { UserGroups } from '../../users/models/user-enums';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ServiceType } from '../../shared/models/mixed-enums';

@Component({
  standalone: true,
  selector: 'app-maintenance-list',
  templateUrl: './maintenance-list.component.html',
  styleUrls: ['./maintenance-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})
export class MaintenanceListComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  destroy$ = new Subject<void>();
  panelOpenState: boolean = true;
  allDisplayedProperties: MaintenanceListDisplay[] = [];
  arrivalMaintenanceDisplay: MaintenanceListDisplay[] = [];
  departureMaintenanceDisplay: MaintenanceListDisplay[] = [];
  maidMaintenanceDisplay: MaintenanceListDisplay[] = [];
  comingOnlineMaintenanceDisplay: MaintenanceListDisplay[] = [];
  goingOfflineMaintenanceDisplay: MaintenanceListDisplay[] = [];
  otherPropertiesMaintenanceDisplay: MaintenanceListDisplay[] = [];
  showOfficeDropdown: boolean = true;
  expandedSections = { reservationTurnover: true, propertyTurnover: true, maidService: true, otherProperties: true };

  userId: string = '';
  userGroups: (string | number)[];
  housekeepingUsers: UserResponse[] = [];
  carpetUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];
  housekeepingById = new Map<string, string>();
  carpetById = new Map<string, string>();
  inspectorById = new Map<string, string>();
  isCompactView = false;
  isVendorView = false;
  vendorRestrictedPropertyIds = new Set<string>();
  maintenanceItemsByPropertyId = new Map<string, MaintenanceItemResponse[]>();

  private readonly compactViewportWidth = 1024;
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
    'eventDate': { displayAs: 'Event Date', maxWidth: '15ch', alignment: 'center', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '15ch', sort: true, options: this.propertyStatusLabels },
    'needsMaintenance': { displayAs: 'Maint', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'hasPets': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'cleaningDate': { displayAs: 'Cleaner Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'cleaner': { displayAs: 'Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.housekeepingUserOptions },
    'carpetDate': { displayAs: 'Carpet Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'carpet': { displayAs: 'Carpet Cleaner', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.carpetUserOptions },
    'inspectingDate': { displayAs: 'Inspector Date', maxWidth: '18ch', alignment: 'center', editableType: 'date' },
    'inspector': { displayAs: 'Inspector', maxWidth: '20ch', alignment: 'center', wrap: false, options: this.inspectorUserOptions },
    };

  private readonly serviceProviderPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'propertyAddress': { displayAs: 'Address', maxWidth: '25ch', sortType: 'natural', wrap: false },
    'eventDate': { displayAs: 'Event Date', maxWidth: '15ch', alignment: 'center', wrap: false },
    'hasPets': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '12ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '13ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '12ch', alignment: 'center'},
    'bed1Text': { displayAs: 'Bed1', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed2Text': { displayAs: 'Bed2', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed3Text': { displayAs: 'Bed3', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
    'bed4Text': { displayAs: 'Bed4', wrap: false , maxWidth: '12ch', alignment: 'center', options: this.bedTypeOptions},
  };

  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'eventDate': { displayAs: 'Event Date', maxWidth: '15ch', alignment: 'center', wrap: false }
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  arrivalMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  departureMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  maidMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  comingOnlineMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  goingOfflineMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;
  otherPropertiesMaintenanceColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices','activeReservations','propertyMaintenanceList','cleaners','carpetUsers','inspectors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    authService: AuthService,
    reservationService: ReservationService,
    mixedMappingService: MixedMappingService,
    mappingService: MappingService,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    utilityService: UtilityService,
    officeService: OfficeService,
    globalSelectionService: GlobalSelectionService,
    public toastr: ToastrService,
    public router: Router,
    public formatterService: FormatterService,
    public route: ActivatedRoute,
    public ngZone: NgZone,
    public maintenanceItemsService: MaintenanceItemsService,
    public userService: UserService,
    private dialog: MatDialog
  ) {
    super(authService, reservationService, mixedMappingService, mappingService, propertyService, maintenanceService, utilityService, officeService, globalSelectionService);
  }

  //#region Maintenance-List
  override ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId || '';
    this.userGroups = this.authService.getUser()?.userGroups as Array<string | number> | undefined;
    this.isVendorView = !hasCompanyRole(this.userGroups);
    this.vendorRestrictedPropertyIds = new Set((this.authService.getUser()?.properties || [])
      .map(propertyId => propertyId.trim().toLowerCase())
      .filter(propertyId => propertyId !== '')
    );

    this.loadHousekeepingUsers();
    this.loadCarpetUsers();
    this.loadInspectorUsers();

    this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.recomputeBackendData();
    });

    super.ngOnInit();
    this.updateDisplayedColumns();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          super.resolveOfficeScope(newOfficeId ?? null);
          this.remapCleanerInspectorDropdowns();
        }
      }
    }
  }

  override recomputeBackendData(_userId: string | null = null): void {
    void _userId;
    const assigneeForBase =
      this.isVendorView && this.userId?.trim()
        ? this.userId.trim()
        : null;
    super.recomputeBackendData(assigneeForBase);
  }

  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    this.rebuildMaintenanceListFromBase(userAssignedId);
  }

  getMappedPropertyListDisplaysForMaintenanceList(): ReturnType<MappingService['mapPropertyListRows']> {
    return this.mappingService.mapPropertyListRows(
      this.filteredPropertyMaintenanceList.map(pm => this.mappingService.mapPropertyMaintenanceToPropertyListResponseForDashboard(pm))
    );
  }

  rebuildMaintenanceListFromBase(userAssignedId: string | null = null): void {
    const propertyRows = this.getMappedPropertyListDisplaysForMaintenanceList();
    const propertyById = new Map(propertyRows.map(p => [p.propertyId, p] as const));

    const currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId =
      this.mixedMappingService.getReservationData(this.filteredReservationPropertyMaintenanceList as unknown as ReservationListResponse[]);

    const mappingContext: MaintenanceListMappingContext = {
      housekeepingUsers: this.housekeepingUsers,
      carpetUsers: this.carpetUsers,
      inspectorUsers: this.inspectorUsers,
      housekeepingById: this.housekeepingById,
      carpetById: this.carpetById,
      inspectorById: this.inspectorById,
      isVendorView: this.isVendorView,
      vendorRestrictedPropertyIds: this.vendorRestrictedPropertyIds,
      currentReservationByPropertyId
    };

    const noSort = MixedMappingService.maintenanceListNoDepartureSortTime;
    const mapMixedRow = (
      mixed: PropertyMaintenance,
      eventDateDisplay: string,
      eventDateSortTime: number,
      hasPets: boolean
    ): MaintenanceListDisplay | null => {
      if (!mixed.propertyId) {
        return null;
      }
      if (this.isVendorView && this.vendorRestrictedPropertyIds.size > 0 && !this.vendorRestrictedPropertyIds.has(mixed.propertyId)) {
        return null;
      }
      const propertyRow = propertyById.get(mixed.propertyId);
      if (!propertyRow) {
        return null;
      }
      const maintenanceRecord = this.getMaintenanceListResponseForPropertyId(mixed.propertyId, propertyRow.propertyId);
      const mappedRow = this.mixedMappingService.mapMaintenanceListDisplayFromMixedTurnoverRow({
        mixedRow: mixed,
        propertyRow,
        maintenanceRecord,
        context: mappingContext,
        eventDateDisplay,
        eventDateSortTime,
        hasPets
      });
      return mappedRow;
    };

    //--------------------------------------------------------------------------------------------
    const arrivals = [...this.arrivalReservations].sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0));
    const arrivalRows = arrivals
      .map((r: ReservationPropertyMaintenance) =>
        mapMixedRow(
          r,
          r.arrivalDateDisplay,
          Number(r.eventDateSortTime ?? r.arrivalDateOrdinal ?? noSort),
          r.hasPets
        )
      )
      .filter((row): row is MaintenanceListDisplay => row !== null);

    //--------------------------------------------------------------------------------------------
    const departures = [...this.departureReservations].sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0));
    const departureRows = departures
      .map((r: ReservationPropertyMaintenance) =>
        mapMixedRow(
          r,
          r.departureDateDisplay,
          Number(r.eventDateSortTime ?? r.departureDateOrdinal ?? noSort),
          r.hasPets
        )
      )
      .filter((row): row is MaintenanceListDisplay => row !== null);

    //--------------------------------------------------------------------------------------------
    const maidCleanings = [...this.cleaningReservations].sort((a, b) => (Number(a.eventDateSortTime) || 0) - (Number(b.eventDateSortTime) || 0));
    const maidRows = maidCleanings
      .map((r: ReservationPropertyMaintenance) =>
        mapMixedRow(
          r,
          this.formatterService.formatDateString(r.eventDate ?? undefined) || '',
          Number(r.eventDateSortTime ?? noSort),
          r.hasPets
        )
      )
      .filter((row): row is MaintenanceListDisplay => row !== null);

    //--------------------------------------------------------------------------------------------
    const online = [...this.onlineProperties].sort((a, b) => (a.availableFromOrdinal ?? 0) - (b.availableFromOrdinal ?? 0));
    const onlineRows = online
      .map((r: PropertyMaintenance) =>
        mapMixedRow(
          r,
          r.availableFromDisplay,
          Number(r.eventDateSortTime ?? r.availableFromOrdinal ?? noSort),
          false
        )
      )
      .filter((row): row is MaintenanceListDisplay => row !== null);

    //--------------------------------------------------------------------------------------------
    const offline = [...this.offlineProperties].sort((a, b) => (a.availableUntilOrdinal ?? 0) - (b.availableUntilOrdinal ?? 0));
    const offlineRows = offline
      .map((r: PropertyMaintenance) =>
        mapMixedRow(
          r,
          r.availableUntilDisplay,
          Number(r.eventDateSortTime ?? r.availableUntilOrdinal ?? noSort),
          false
        )
      )
      .filter((row): row is MaintenanceListDisplay => row !== null);

    const displayedPropertyIds = new Set<string>();
    for (const row of [...arrivalRows, ...departureRows, ...maidRows, ...onlineRows, ...offlineRows]) {
      if (row.propertyId) {
        displayedPropertyIds.add(row.propertyId);
      }
    }

    //--------------------------------------------------------------------------------------------
    const otherRows = this.filteredPropertyMaintenanceList
      .filter(pm => {
        if (!pm.propertyId) {
          return false;
        }
        if (this.isVendorView && this.vendorRestrictedPropertyIds.size > 0 && !this.vendorRestrictedPropertyIds.has(pm.propertyId)) {
          return false;
        }
        return !displayedPropertyIds.has(pm.propertyId);
      })
      .map(pm => {
        const snap = this.mixedMappingService.getMaintenanceListCurrentReservationFields(pm.propertyId, currentReservationByPropertyId);
        return mapMixedRow(
          pm,
          snap.eventDate,
          snap.eventDateSortTime,
          snap.hasPets
        );
      })
      .filter((row): row is MaintenanceListDisplay => row !== null)
      .sort((a, b) => {
        const byEvent = a.eventDateSortTime - b.eventDateSortTime;
        if (byEvent !== 0) {
          return byEvent;
        }
        return (a.propertyCode ?? '').localeCompare(b.propertyCode ?? '', undefined, { sensitivity: 'base' });
      });

    this.arrivalMaintenanceDisplay = this.filterArrivalMaintenanceDisplayForUserAssignedId(userAssignedId, arrivalRows);
    this.departureMaintenanceDisplay = this.filterDepartureMaintenanceDisplayForUserAssignedId(userAssignedId, departureRows);
    this.maidMaintenanceDisplay = this.filterMaidServiceMaintenanceDisplayForUserAssignedId(userAssignedId, maidRows);
    this.comingOnlineMaintenanceDisplay = this.filterComingOnlineMaintenanceDisplayForUserAssignedId(userAssignedId, onlineRows);
    this.goingOfflineMaintenanceDisplay = this.filterGoingOfflineMaintenanceDisplayForUserAssignedId(userAssignedId, offlineRows);
    this.otherPropertiesMaintenanceDisplay = this.filterOtherPropertiesMaintenanceDisplayForUserAssignedId(userAssignedId, otherRows);

    this.syncAllDisplayedPropertiesFromTurnoverLists();
    this.applyMaintenanceStateFromServiceDates();
    this.remapCleanerInspectorDropdowns();
  }

  syncAllDisplayedPropertiesFromTurnoverLists(): void {
    this.allDisplayedProperties = [
      ...this.arrivalMaintenanceDisplay,
      ...this.departureMaintenanceDisplay,
      ...this.maidMaintenanceDisplay,
      ...this.comingOnlineMaintenanceDisplay,
      ...this.goingOfflineMaintenanceDisplay
    ];
  }
  //#endregion

  //#region Data Load Methods
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
        this.router.navigate(
          [RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id])],
          { queryParams: { returnUrl: this.router.url } }
        );
      });
    }
  }

  goToInspection(event: MaintenanceListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
    });
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.selectedOffice?.officeId ?? null,
      source: 'maintenance'
    };
    this.dialog.open(AddAlertDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'add-alert-dialog-panel',
      data: dialogData
    });
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    const sortRows = (rows: MaintenanceListDisplay[]) =>
      [...rows].sort((a, b) => {
        const byEvent = a.eventDateSortTime - b.eventDateSortTime;
        if (byEvent !== 0) {
          return byEvent;
        }
        return (a.propertyCode ?? '').localeCompare(b.propertyCode ?? '', undefined, { sensitivity: 'base' });
      });
    this.arrivalMaintenanceDisplay = sortRows(this.arrivalMaintenanceDisplay);
    this.departureMaintenanceDisplay = sortRows(this.departureMaintenanceDisplay);
    this.maidMaintenanceDisplay = sortRows(this.maidMaintenanceDisplay);
    this.comingOnlineMaintenanceDisplay = sortRows(this.comingOnlineMaintenanceDisplay);
    this.goingOfflineMaintenanceDisplay = sortRows(this.goingOfflineMaintenanceDisplay);
    this.otherPropertiesMaintenanceDisplay = sortRows(this.otherPropertiesMaintenanceDisplay);
    this.syncAllDisplayedPropertiesFromTurnoverLists();
  }
    
  filterArrivalMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row =>
        row.cleanerUserId === userAssignedId ||
        row.carpetUserId === userAssignedId ||
        row.inspectorUserId === userAssignedId
    );
  }

  filterDepartureMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row =>
        row.cleanerUserId === userAssignedId ||
        row.carpetUserId === userAssignedId ||
        row.inspectorUserId === userAssignedId
    );
  }

  filterComingOnlineMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row =>
        row.cleanerUserId === userAssignedId ||
        row.carpetUserId === userAssignedId ||
        row.inspectorUserId === userAssignedId
    );
  }

  filterGoingOfflineMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row =>
        row.cleanerUserId === userAssignedId ||
        row.carpetUserId === userAssignedId ||
        row.inspectorUserId === userAssignedId
    );
  }

  filterMaidServiceMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row => row.maidUserId === userAssignedId || row.cleanerUserId === userAssignedId
    );
  }

  filterOtherPropertiesMaintenanceDisplayForUserAssignedId(userAssignedId: string | null, rows: MaintenanceListDisplay[]): MaintenanceListDisplay[] {
    if (userAssignedId === null) {
      return [...rows];
    }
    return rows.filter(
      row =>
        row.cleanerUserId === userAssignedId ||
        row.carpetUserId === userAssignedId ||
        row.inspectorUserId === userAssignedId
    );
  }
  //#endregion

  //#region Dropdown Methods
  onDropdownChange(event: MaintenanceListDisplay): void {
    const changedColumn = (event as unknown as { __changedDropdownColumn?: string }).__changedDropdownColumn;
    if (!changedColumn) {
      return;
    }
    if (changedColumn === 'propertyStatusDropdown') {
      this.onPropertyStatusChange(event);
      return;
    }
    if (changedColumn === 'cleaner' || changedColumn === 'carpet' || changedColumn === 'inspector') {
      this.handleMaintenanceAssigneeDropdownChange(event);
      return;
    }
    if (changedColumn === 'bed1Text' || changedColumn === 'bed2Text' || changedColumn === 'bed3Text' || changedColumn === 'bed4Text') {
      this.handleMaintenanceBedDropdownChange(event);
    }
  }
  
  updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    if (this.isCompactView) {
      this.propertiesDisplayedColumns = this.compactPropertiesDisplayedColumns;
    } else {
      this.propertiesDisplayedColumns = this.isVendorView
        ? this.serviceProviderPropertiesDisplayedColumns
        : this.fullPropertiesDisplayedColumns;
    }
    this.syncSectionMaintenanceColumns();
  }

  private syncSectionMaintenanceColumns(): void {
    const base = this.propertiesDisplayedColumns;
    this.arrivalMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Arrival Date');
    this.departureMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Departure Date');
    this.maidMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Cleaning Date');
    this.comingOnlineMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Online Date');
    this.goingOfflineMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Offline Date');
    this.otherPropertiesMaintenanceColumns = this.cloneColumnSetWithEventDateLabel(base, 'Departure Date');
  }

  private cloneColumnSetWithEventDateLabel(source: ColumnSet, eventDateLabel: string): ColumnSet {
    const eventCol = source['eventDate'];
    if (!eventCol) {
      return { ...source };
    }
    return {
      ...source,
      eventDate: { ...eventCol, displayAs: eventDateLabel }
    };
  }

  getProviderTargetForRow(event: MaintenanceListDisplay): ServiceType | null {
    return event.eventType ?? null;
  }

  applyProviderValuesToEvent(
    event: MaintenanceListDisplay,
    cleanerUserId: string | null,
    carpetUserId: string | null,
    inspectorUserId: string | null,
    cleaningDate: string,
    carpetDate: string,
    inspectingDate: string
  ): void {
    event.cleanerUserId = cleanerUserId;
    event.carpetUserId = carpetUserId;
    event.inspectorUserId = inspectorUserId;
    event.cleaningDate = cleaningDate;
    event.carpetDate = carpetDate;
    event.inspectingDate = inspectingDate;
    event.cleaner = this.buildUserDropdownCell(
      this.resolveCleanerName(cleanerUserId ?? '', event.officeId),
      this.getCleanerOptionsForOffice(event.officeId)
    );
    event.carpet = this.buildUserDropdownCell(
      this.resolveCarpetName(carpetUserId ?? '', event.officeId),
      this.getCarpetOptionsForOffice(event.officeId)
    );
    event.inspector = this.buildUserDropdownCell(
      this.resolveInspectorName(inspectorUserId ?? '', event.officeId),
      this.getInspectorOptionsForOffice(event.officeId)
    );
  }
  //#endregion

  //#region Assignee Methods
  
  //#region User Selection Methods
  buildUserDropdownCell(label: string, options: string[]): MaintenanceListUserDropdownCell {
    return {
      value: label,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  handleMaintenanceAssigneeDropdownChange(event: MaintenanceListDisplay): void {
    const selectedCleanerLabel = event.cleaner?.value ?? '';
    const selectedCarpetLabel = event.carpet?.value ?? '';
    const selectedInspectorLabel = event.inspector?.value ?? '';
    const selectedCleanerId = this.resolveCleanerIdFromLabel(selectedCleanerLabel, event.officeId);
    const selectedCarpetId = this.resolveCarpetIdFromLabel(selectedCarpetLabel, event.officeId);
    const selectedInspectorId = this.resolveInspectorIdFromLabel(selectedInspectorLabel, event.officeId);
    const currentCleanerId = event.cleanerUserId ?? null;
    const currentCarpetId = event.carpetUserId ?? null;
    const currentInspectorId = event.inspectorUserId ?? null;
    const shouldClearCleanerDate = selectedCleanerId === null && (event.cleaningDate ?? '').trim() !== '';
    const shouldClearCarpetDate = selectedCarpetId === null && (event.carpetDate ?? '').trim() !== '';
    const shouldClearInspectorDate = selectedInspectorId === null && (event.inspectingDate ?? '').trim() !== '';
    if (selectedCleanerId !== currentCleanerId || selectedCarpetId !== currentCarpetId || selectedInspectorId !== currentInspectorId || shouldClearCleanerDate || shouldClearCarpetDate || shouldClearInspectorDate) {
      this.onMaintenanceAssigneesChange(event, selectedCleanerId, selectedCarpetId, selectedInspectorId);
      return;
    }
    if (selectedCleanerLabel === 'Clear Selection' || selectedCarpetLabel === 'Clear Selection' || selectedInspectorLabel === 'Clear Selection') {
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
  }

  onMaintenanceAssigneesChange(event: MaintenanceListDisplay, cleanerUserId: string | null, carpetUserId: string | null, inspectorUserId: string | null): void {
    const target = this.getProviderTargetForRow(event);
    const cleaningDate = cleanerUserId ? (this.mappingService.toDateOnlyJsonString(event.cleaningDate) ?? null) : null;
    const carpetDate = carpetUserId ? (this.mappingService.toDateOnlyJsonString(event.carpetDate) ?? null) : null;
    const inspectingDate = inspectorUserId ? (this.mappingService.toDateOnlyJsonString(event.inspectingDate) ?? null) : null;

    const onSaveOk = () => {
      this.applyProviderValuesToEvent(
        event,
        cleanerUserId,
        carpetUserId,
        inspectorUserId,
        this.formatterService.formatDateString(cleaningDate ?? undefined) || '',
        this.formatterService.formatDateString(carpetDate ?? undefined) || '',
        this.formatterService.formatDateString(inspectingDate ?? undefined) || ''
      );
      this.toastr.success('Provider assignments updated.', CommonMessage.Success);
    };
    const onSaveErr = () => {
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
      this.toastr.error('Unable to update provider assignments.', CommonMessage.Error);
    };

    if (target === ServiceType.Online || target === ServiceType.Offline) {
      const patch = target === ServiceType.Online
        ? {
            onCleanerUserId: cleanerUserId,
            onCleaningDate: cleaningDate,
            onCarpetUserId: carpetUserId,
            onCarpetDate: carpetDate,
            onInspectorUserId: inspectorUserId,
            onInspectingDate: inspectingDate
          }
        : {
            offCleanerUserId: cleanerUserId,
            offCleaningDate: cleaningDate,
            offCarpetUserId: carpetUserId,
            offCarpetDate: carpetDate,
            offInspectorUserId: inspectorUserId,
            offInspectingDate: inspectingDate
          };
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(onSaveOk).catch(onSaveErr);
      return;
    }

    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      this.toastr.error('Reservation not found for provider update.', CommonMessage.Error);
      onSaveErr();
      return;
    }

    if (target === ServiceType.Arrival || target === ServiceType.Departure) {
      const patch = target === ServiceType.Arrival
        ? {
            aCleanerUserId: cleanerUserId,
            aCleaningDate: cleaningDate,
            aCarpetUserId: carpetUserId,
            aCarpetDate: carpetDate,
            aInspectorUserId: inspectorUserId,
            aInspectingDate: inspectingDate
          }
        : {
            dCleanerUserId: cleanerUserId,
            dCleaningDate: cleaningDate,
            dCarpetUserId: carpetUserId,
            dCarpetDate: carpetDate,
            dInspectorUserId: inspectorUserId,
            dInspectingDate: inspectingDate
          };
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(onSaveOk).catch(onSaveErr);
      return;
    }

    if (target === ServiceType.MaidService) {
      const patch = {
        maidUserId: cleanerUserId,
        maidStartDate: cleaningDate
      };
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(onSaveOk).catch(onSaveErr);
      return;
    }

    this.toastr.error('Unable to determine where provider changes should be saved.', CommonMessage.Error);
    onSaveErr();
  }  
  //#endregion

  //#region Date Methods
  handleMaintenanceInlineDateChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    const col = event.__changedInlineColumn;
    if (col !== 'cleaningDate' && col !== 'carpetDate' && col !== 'inspectingDate') {
      return;
    }
    this.onMaintenanceDateChange(event, col, event.__inlineValue ?? '');
  }
  
  onMaintenanceDateChange(event: MaintenanceListDisplay, columnName: 'cleaningDate' | 'carpetDate' | 'inspectingDate', dateValue: string): void {
    const target = this.getProviderTargetForRow(event);
    const dateOnlyJson = this.mappingService.toDateOnlyJsonString(dateValue);
    const cleanerUserId = event.cleanerUserId ?? null;
    const carpetUserId = event.carpetUserId ?? null;
    const inspectorUserId = event.inspectorUserId ?? null;
    const nextCleaningDate = columnName === 'cleaningDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.cleaningDate) ?? null);
    const nextCarpetDate = columnName === 'carpetDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.carpetDate) ?? null);
    const nextInspectingDate = columnName === 'inspectingDate' ? (dateOnlyJson ?? null) : (this.mappingService.toDateOnlyJsonString(event.inspectingDate) ?? null);

    const onSaveOk = () => {
      this.applyProviderValuesToEvent(
        event,
        cleanerUserId,
        carpetUserId,
        inspectorUserId,
        this.formatterService.formatDateString(nextCleaningDate ?? undefined) || '',
        this.formatterService.formatDateString(nextCarpetDate ?? undefined) || '',
        this.formatterService.formatDateString(nextInspectingDate ?? undefined) || ''
      );
      this.toastr.success('Provider date updated.', CommonMessage.Success);
    };
    const onSaveErr = () => {
      this.toastr.error('Unable to update provider date.', CommonMessage.Error);
    };

    if (target === ServiceType.Online || target === ServiceType.Offline) {
      const patch = target === ServiceType.Online
        ? columnName === 'cleaningDate'
          ? { onCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { onCarpetDate: nextCarpetDate }
            : { onInspectingDate: nextInspectingDate }
        : columnName === 'cleaningDate'
          ? { offCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { offCarpetDate: nextCarpetDate }
            : { offInspectingDate: nextInspectingDate };
      void this.propertyService.updateModifiedProperty(event.propertyId, patch).then(onSaveOk).catch(onSaveErr);
      return;
    }

    const reservationId = (event.reservationId || '').trim();
    if (!reservationId) {
      this.toastr.error('Reservation not found for provider date update.', CommonMessage.Error);
      return;
    }

    if (target === ServiceType.Arrival || target === ServiceType.Departure) {
      const patch = target === ServiceType.Arrival
        ? columnName === 'cleaningDate'
          ? { aCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { aCarpetDate: nextCarpetDate }
            : { aInspectingDate: nextInspectingDate }
        : columnName === 'cleaningDate'
          ? { dCleaningDate: nextCleaningDate }
          : columnName === 'carpetDate'
            ? { dCarpetDate: nextCarpetDate }
            : { dInspectingDate: nextInspectingDate };
      void this.reservationService.updateModifiedReservation(reservationId, patch).then(onSaveOk).catch(onSaveErr);
      return;
    }

    if (target === ServiceType.MaidService) {
      if (columnName !== 'cleaningDate') {
        this.toastr.error('Only cleaning date applies to maid service.', CommonMessage.Error);
        return;
      }
      void this.reservationService.updateModifiedReservation(reservationId, { maidStartDate: nextCleaningDate }).then(onSaveOk).catch(onSaveErr);
      return;
    }

    this.toastr.error('Unable to determine where provider date should be saved.', CommonMessage.Error);
  }
  //#endregion

  //#region Property Bed Methods
  handleMaintenanceBedDropdownChange(event: MaintenanceListDisplay): void {
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
  }
  
  onBedTypesChange(event: MaintenanceListDisplay, bed1Id: number, bed2Id: number, bed3Id: number, bed4Id: number): void {
    void this.propertyService.updateModifiedProperty(event.propertyId, {
      bedroomId1: bed1Id,
      bedroomId2: bed2Id,
      bedroomId3: bed3Id,
      bedroomId4: bed4Id
    }).then(() => {
      event.bedroomId1 = bed1Id;
      event.bedroomId2 = bed2Id;
      event.bedroomId3 = bed3Id;
      event.bedroomId4 = bed4Id;
      Object.assign(event, this.mappingService.buildPropertyRowBedDropdownCells(event, undefined));
      this.toastr.success('Property updated.', CommonMessage.Success);
    }).catch(() => {
      Object.assign(event, this.mappingService.buildPropertyRowBedDropdownCells(event, undefined));
      this.toastr.error('Unable to update property.', CommonMessage.Error);
    });
  }

  getBedTypeIdFromLabel(label: string | undefined): number {
    if (!label) {
      return 0;
    }
    return this.bedTypeByLabel.get(label) ?? 0;
  }
  //#endregion

  //#region Property Status Methods
  buildPropertyStatusDropdownCell(label: string, isOverridable: boolean = true): MaintenanceListDisplay['propertyStatusDropdown'] {
    return {
      value: label,
      isOverridable,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }
  
  onPropertyStatusChange(event: MaintenanceListDisplay): void {
    const selectedLabel = event.propertyStatusDropdown?.value ?? '';
    const selectedStatusId = this.propertyStatusByLabel.get(selectedLabel);
    const previousStatusId = event.propertyStatusId;
    const previousLabel = event.propertyStatusText;

    if (selectedStatusId === undefined) {
      event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(previousLabel);
      return;
    }

    if (selectedStatusId === previousStatusId) {
      return;
    }

    event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(selectedLabel, false);

    void this.propertyService.updateModifiedProperty(event.propertyId, { propertyStatusId: selectedStatusId }).then(() => {
      this.updatePropertyStatusDisplay(event.propertyId, selectedStatusId, selectedLabel);
      this.toastr.success('Property status updated.', CommonMessage.Success);
    }).catch((err: unknown) => {
      console.error('Error updating property status:', err);
      this.updatePropertyStatusDisplay(event.propertyId, previousStatusId, previousLabel);
      this.toastr.error('Unable to update property status.', CommonMessage.Error);
    }).finally(() => {
      event.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(event.propertyStatusText);
    });
  }
  
  updatePropertyStatusDisplay(propertyId: string, propertyStatusId: number, propertyStatusText: string): void {
    const patch = (rows: MaintenanceListDisplay[]) => {
      for (const property of rows) {
        if (property.propertyId === propertyId) {
          property.propertyStatusId = propertyStatusId;
          property.propertyStatusText = propertyStatusText;
          property.propertyStatusDropdown = this.buildPropertyStatusDropdownCell(propertyStatusText);
        }
      }
    };
    patch(this.arrivalMaintenanceDisplay);
    patch(this.departureMaintenanceDisplay);
    patch(this.maidMaintenanceDisplay);
    patch(this.comingOnlineMaintenanceDisplay);
    patch(this.goingOfflineMaintenanceDisplay);
    patch(this.otherPropertiesMaintenanceDisplay);
    this.syncAllDisplayedPropertiesFromTurnoverLists();
    this.applyFilters();
  }
  //#endregion

  //#region Cleaner, Carpet Inspector Display
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

   remapCleanerInspectorDropdowns(): void {
    const remapRows = (rows: MaintenanceListDisplay[]) =>
      rows.map(property => {
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
    this.arrivalMaintenanceDisplay = remapRows(this.arrivalMaintenanceDisplay);
    this.departureMaintenanceDisplay = remapRows(this.departureMaintenanceDisplay);
    this.maidMaintenanceDisplay = remapRows(this.maidMaintenanceDisplay);
    this.comingOnlineMaintenanceDisplay = remapRows(this.comingOnlineMaintenanceDisplay);
    this.goingOfflineMaintenanceDisplay = remapRows(this.goingOfflineMaintenanceDisplay);
    this.otherPropertiesMaintenanceDisplay = remapRows(this.otherPropertiesMaintenanceDisplay);
    this.syncAllDisplayedPropertiesFromTurnoverLists();
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
 //#endregion

  //#region Checkbox State Method
  applyMaintenanceStateFromServiceDates(): void {
    const applyToRows = (rows: MaintenanceListDisplay[]) =>
      (rows || []).map(property => {
        const maintenanceItems = this.maintenanceItemsByPropertyId.get(property.propertyId) || [];
        const needsMaintenanceState = this.getNeedsMaintenanceState(maintenanceItems);
        return {
          ...property,
          needsMaintenanceState,
          needsMaintenance: needsMaintenanceState !== 'green'
        };
      });
    this.arrivalMaintenanceDisplay = applyToRows(this.arrivalMaintenanceDisplay);
    this.departureMaintenanceDisplay = applyToRows(this.departureMaintenanceDisplay);
    this.maidMaintenanceDisplay = applyToRows(this.maidMaintenanceDisplay);
    this.comingOnlineMaintenanceDisplay = applyToRows(this.comingOnlineMaintenanceDisplay);
    this.goingOfflineMaintenanceDisplay = applyToRows(this.goingOfflineMaintenanceDisplay);
    this.otherPropertiesMaintenanceDisplay = applyToRows(this.otherPropertiesMaintenanceDisplay);
    this.syncAllDisplayedPropertiesFromTurnoverLists();
  }

  getNeedsMaintenanceState(items: MaintenanceItemResponse[]): 'red' | 'yellow' | 'green' | 'grey' {
    if (!items || items.length === 0) {
      return 'grey';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let hasYellow = false;

    for (const item of items) {
      const monthsBetweenService = Math.max(0, Number(item.monthsBetweenService ?? 0));
      const lastServicedOn = this.utilityService.parseCalendarDateInput(item.lastServicedOn);

      const redThreshold = new Date(today);
      redThreshold.setMonth(redThreshold.getMonth() - monthsBetweenService);
      if (!lastServicedOn || lastServicedOn <= redThreshold) {
        return 'red';
      }

      const yellowThreshold = new Date(today);
      yellowThreshold.setMonth(yellowThreshold.getMonth() - Math.max(0, monthsBetweenService - 1));
      if (lastServicedOn <= yellowThreshold) {
        hasYellow = true;
      }
    }

    return hasYellow ? 'yellow' : 'green';
  }
  //#endregion

  //#region Utility Methods
  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDisplayedColumns();
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }
  //#endregion
}
