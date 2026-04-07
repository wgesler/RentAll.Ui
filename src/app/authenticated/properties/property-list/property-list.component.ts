import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, switchMap, take, takeUntil } from 'rxjs';
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
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { CalendarUrlResponse } from '../models/property-calendar';
import { getPropertyStatuses } from '../models/property-enums';
import { PropertySelectionResponse } from '../models/property-selection.model';
import { PropertyListDisplay, PropertyRequest, PropertyResponse } from '../models/property.model';
import { PropertyCalendarUrlDialogComponent, PropertyCalendarUrlDialogData } from '../property-calendar-url-dialog/property-calendar-url-dialog.component';
import { PropertySelectionFilterService } from '../services/property-selection-filter.service';
import { PropertyService } from '../services/property.service';

type PropertyListDisplayRow = PropertyListDisplay & {
  propertyStatusText: string;
  propertyStatusDropdown: {
    value: string;
    isOverridable: boolean;
    toString: () => string;
  };
};

@Component({
    standalone: true,
    selector: 'app-property-list',
    templateUrl: './property-list.component.html',
    styleUrls: ['./property-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})

export class PropertyListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allProperties: PropertyListDisplayRow[] = [];
  propertiesDisplay: PropertyListDisplayRow[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  navigationSubscription?: Subscription;
  lastNavigationUrl = '';
  destroy$ = new Subject<void>();
  officeScopeResolved = false;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  user: any;
  isAdmin = false;
  userId: string = '';
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  propertiesFiltered = false;
  isCompactView = false;
  canEditIsActiveCheckbox = false;

  private readonly compactViewportWidth = 1024;
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'contactName': { displayAs: 'Owner', maxWidth: '20ch', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '15ch', sort: true, options: this.propertyStatusLabels },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'accomodates': { displayAs: 'Accom', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'propertyType': { displayAs: 'Type', maxWidth: '13ch', wrap: false },
    'monthlyRate': { displayAs: 'Monthly', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
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
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.userId = this.user?.userId || '';
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;
    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe((v) => (this.propertiesFiltered = v));

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    this.navigationSubscription = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd),takeUntil(this.destroy$)).subscribe(e => {
      const path = e.urlAfterRedirects.split('?')[0];
      const isPropertyList = /\/properties$/.test(path);
      const fromSelection = this.lastNavigationUrl.includes('/selection');
      if (isPropertyList && fromSelection) {
        this.getProperties();
      }
      this.lastNavigationUrl = path;
    });

    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe(() => {
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

  getProperties(): void {
    if (!this.itemsToLoad$.value.has('properties')) return;
    this.isServiceError = false;
    if (!this.userId) {
      this.allProperties = [];
      this.applyFilters();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getPropertiesBySelectionCriteria(this.userId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (properties) => {
        this.allProperties = this.mappingService.mapPropertyListRows(properties || []);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.allProperties = [];
        this.propertiesDisplay = [];
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

  deleteProperty(property: PropertyListDisplay): void {
    this.propertyService.deleteProperty(property.propertyId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Property deleted successfully', CommonMessage.Success);
        this.getProperties();
      },
      error: () => {}
    });
  }

  onPropertyCheckboxChange(event: PropertyListDisplayRow): void {
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

    this.applyPropertyIsActiveValue(event.propertyId, nextValue);

    this.propertyService.getPropertyByGuid(event.propertyId).pipe(
      take(1),
      switchMap((property: PropertyResponse) => this.propertyService.updateProperty(this.buildPropertyIsActiveUpdateRequest(property, nextValue)).pipe(take(1))),
      finalize(() => this.applyFilters())
    ).subscribe({
      next: () => {
        this.toastr.success('Property updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyPropertyIsActiveValue(event.propertyId, previousValue);
        this.toastr.error('Unable to update property.', CommonMessage.Error);
      }
    });
  }
  //#endregion
  
  //#region Routing Methods
  goToProperty(event: PropertyListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId])],
        { queryParams: { section: 'basic', returnTo: 'property-list' } }
      );
    });
  }

  goToContact(event: PropertyListDisplay): void {
    if (event.owner1Id) {
      this.ngZone.run(() => {
        this.router.navigate(
          [RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id])],
          { queryParams: { returnUrl: this.router.url } }
        );
      });
    }
  }

  goToPropertySelection(): void {
    if (!this.userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list' } });
      return;
    }
    this.propertyService.getPropertySelection(this.userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list', selection } });
      },
      error: () => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'property-list' } });
      }
    });
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
    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            if (this.officeId !== null && this.officeId !== undefined) {
              const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
              if (matchingOffice !== this.selectedOffice) {
                this.selectedOffice = matchingOffice;
                this.applyFilters();
              }
              return;
            }

            if (uiState.selectedOffice) {
              if (uiState.selectedOffice !== this.selectedOffice) {
                this.selectedOffice = uiState.selectedOffice;
                this.officeIdChange.emit(uiState.selectedOffice.officeId);
                this.applyFilters();
              }
              return;
            }

            if (this.selectedOffice && this.offices.length === 1) {
              this.applyFilters();
            }
          }
        });

        this.getProperties();
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.getProperties();
      }
    });
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.resolveOfficeScope(this.selectedOffice?.officeId ?? null, true);
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

  //#region Property Status Methods
  onPropertyStatusChange(event: PropertyListDisplayRow): void {
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

    // We allow the user to update the property status in-line on a property row
    this.propertyService.getPropertyByGuid(event.propertyId).pipe(take(1),
      switchMap((property: PropertyResponse) => this.propertyService.updateProperty(this.buildPropertyStatusUpdateRequest(property, selectedStatusId)).pipe(take(1))),
      finalize(() => {  event.propertyStatusDropdown = this.buildStatusDropdownCell(event.propertyStatusText); })
    ).subscribe({
      next: () => {
        this.updatePropertyStatusDisplay(event.propertyId, selectedStatusId, selectedLabel);
        this.toastr.success('Property status updated.', CommonMessage.Success);
      },
      error: (err: HttpErrorResponse) => {
        this.updatePropertyStatusDisplay(event.propertyId, previousStatusId, previousLabel);
        this.toastr.error('Unable to update property status.', CommonMessage.Error);
      }
    });
  }

  buildStatusDropdownCell(label: string, isOverridable: boolean = true): PropertyListDisplayRow['propertyStatusDropdown'] {
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

  buildPropertyIsActiveUpdateRequest(property: PropertyResponse, isActive: boolean): PropertyRequest {
    const { officeName: _officeName, parkingNotes, ...requestBase } = property;
    return {
      ...requestBase,
      isActive,
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

  applyPropertyIsActiveValue(propertyId: string, isActive: boolean): void {
    for (const property of this.allProperties) {
      if (property.propertyId === propertyId) {
        property.isActive = isActive;
        break;
      }
    }
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  updateDisplayedColumns(): void {
    this.isCompactView = window.innerWidth <= this.compactViewportWidth;
    this.propertiesDisplayedColumns = this.isCompactView ? this.compactPropertiesDisplayedColumns : this.fullPropertiesDisplayedColumns;
  }

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.fullPropertiesDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
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

