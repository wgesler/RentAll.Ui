import { CommonModule } from "@angular/common";
import { Clipboard } from '@angular/cdk/clipboard';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, filter, finalize, map, skip, take, takeUntil} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { PropertyCalendarTesterDialogComponent } from '../../shared/modals/property-calendar-tester-dialog/property-calendar-tester-dialog.component';
import { CalendarUrlResponse } from '../models/property-calendar';
import { PropertyLeaseType, getPropertyStatuses, getPropertyLeaseType } from '../models/property-enums';
import { PropertySelectionResponse } from '../models/property-selection.model';
import { PropertyListDisplay, PropertyListResponse } from '../models/property.model';
import { PropertyCalendarUrlDialogComponent, PropertyCalendarUrlDialogData } from '../property-calendar-url-dialog/property-calendar-url-dialog.component';
import { PropertySelectionFilterService } from '../services/property-selection-filter.service';
import { PropertyListingShareService } from '../services/property-listing-share.service';
import { PropertyService } from '../services/property.service';
import { PartnerService } from '../../partners/services/partner.service';
import { BoardFilterIndex, FiveWayToggleValue, getBoardFilterMaxIndex, getFiveWayFilterLabel, isAllFilterIndex, isPartnersFilterIndex } from '../../reservations/models/property-filter-model';
type PropertyListDisplayRow = PropertyListDisplay & {
  propertyStatusText: string;
  propertyLeaseType: string;
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
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class PropertyListComponent implements OnInit, OnDestroy, OnChanges {

  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  private clipboard = inject(Clipboard);
  propertyService = inject(PropertyService);
  toastr = inject(ToastrService);
  router = inject(Router);
  mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private contactService = inject(ContactService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private route = inject(ActivatedRoute);
  private utilityService = inject(UtilityService);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);
  private propertySelectionFilterService = inject(PropertySelectionFilterService);
  private propertyListingShareService = inject(PropertyListingShareService);
  private partnerService = inject(PartnerService);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild('propertyListContextMenuTrigger') propertyListContextMenuTrigger?: MatMenuTrigger;
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  furnishedPropertyToggleChecked = false;
  furnishedSliderIndex: FiveWayToggleValue = 0;
  hasPartnerIntegration = false;
  allProperties: PropertyListDisplayRow[] = [];
  partnerProperties: PropertyListDisplayRow[] | null = null;
  propertiesDisplay: PropertyListDisplayRow[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  lastNavigationUrl = '';
  destroy$ = new Subject<void>();
  officeScopeResolved = false;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  private pageOfficeId: number | null = null;
  private initialOfficeScopeApplied = false;
  user: any;
  isAdmin = false;
  userId: string = '';
  organizationId: string = '';
  propertiesFiltered = false;
  isCompactView = false;
  canEditIsActiveCheckbox = false;
  selectedPropertyIds = new Set<string>();
  contextMenuPosition = { x: 0, y: 0 };

  private readonly compactViewportWidth = 1024;
  private readonly propertyStatuses = getPropertyStatuses();
  private readonly propertyStatusLabels = this.propertyStatuses.map(status => status.label);
  private readonly propertyStatusByLabel = new Map(this.propertyStatuses.map(status => [status.label, status.value]));
  private readonly fullPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    'contactName': { displayAs: 'Owner/Vendor', maxWidth: '20ch', wrap: false },
    'propertyStatusDropdown': { displayAs: 'Status', wrap: false, maxWidth: '15ch', sort: true, options: this.propertyStatusLabels },
    'bedrooms': { displayAs: 'Beds', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'bathrooms': { displayAs: 'Baths', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'accommodates': { displayAs: 'Accom', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'unitLevel': { displayAs: 'Level', wrap: false , maxWidth: '10ch', alignment: 'center'},
    'squareFeet': { displayAs: 'Sq Ft', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'propertyLeaseType': { displayAs: 'Lease', wrap: false, maxWidth: '18ch' },
    'propertyType': { displayAs: 'Type', maxWidth: '13ch', wrap: false },
    'rateDisplay': { displayAs: 'Rate', wrap: false, maxWidth: '15ch', alignment: 'center'},
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };
  private readonly compactPropertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: '', maxWidth: '20ch', sortType: 'natural', wrap: false }
  };
  propertiesDisplayedColumns: ColumnSet = this.fullPropertiesDisplayedColumns;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['properties', 'officeScope']));

  //#region Property-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.updateDisplayedColumns();
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.userId = this.user?.userId || '';
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.hasPartnerIntegration = this.authService.hasPartnerIntegrationAccess();
    this.furnishedSliderIndex = this.globalSelectionService.getFurnishedPropertySelection() === true ? 1 : 0;
    this.pageOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();

    const officeIdParam = this.route.snapshot.queryParams['officeId'];
    if (officeIdParam != null && String(officeIdParam).trim() !== '') {
      const parsedOfficeId = parseInt(String(officeIdParam), 10);
      if (!Number.isNaN(parsedOfficeId)) {
        this.pageOfficeId = parsedOfficeId;
      }
    }

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
      this.markViewForCheck();
    });

    this.loadOffices();

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.propertiesFiltered = v;
      this.markViewForCheck();
    });

    this.globalSelectionService.getFurnishedPropertySelection$().pipe(takeUntil(this.destroy$)).subscribe(v => {
      this.furnishedPropertyToggleChecked = v === true;
      if (this.furnishedSliderIndex <= 1) {
        this.furnishedSliderIndex = v === true ? 1 : 0;
      }
      if (this.officeScopeResolved) {
        this.applyFilters();
      }
      this.markViewForCheck();
    });

    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd),takeUntil(this.destroy$)).subscribe(e => {
      const path = e.urlAfterRedirects.split('?')[0];
      if (/\/properties$/.test(path) && this.lastNavigationUrl.includes('/selection')) {
        this.getProperties();
      }
      this.lastNavigationUrl = path;
      this.markViewForCheck();
    });

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;

      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.pageOfficeId = newOfficeId;
        if (this.offices.length > 0) {
          this.applyPageOfficeScope(newOfficeId);
          this.markViewForCheck();
        }
      }
    }
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
        const mappedRows = this.mappingService.mapPropertyListRows(properties || []);
        this.allProperties = this.applyPropertyContactDisplayNames(
          mappedRows.map(row => ({
            ...row,
            propertyLeaseType: this.getPropertyLeaseTypeListLabel(row.propertyLeaseTypeId)
          }))
        );
        const validPropertyIds = new Set(this.allProperties.map(property => property.propertyId));
        this.selectedPropertyIds.forEach(propertyId => {
          if (!validPropertyIds.has(propertyId)) {
            this.selectedPropertyIds.delete(propertyId);
          }
        });
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.allProperties = [];
        this.propertiesDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addProperty(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, ['new']);
    const queryParams: Record<string, string | number> = {};
    if (this.selectedOffice) {
      queryParams['officeId'] = this.selectedOffice.officeId;
    }
    this.router.navigate([url], { queryParams });
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.selectedOffice?.officeId ?? null,
      source: 'property'
    };
    this.dialog.open(AddAlertDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'add-alert-dialog-panel',
      data: dialogData
    });
  }
    
  copyProperty(event: PropertyListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, ['new']);
    this.router.navigate([url], { queryParams: { copyFrom: event.propertyId } });
  }

  copyPropertyListingLink(event: PropertyListDisplay): void {
    const propertyId = String(event?.propertyId || '').trim();
    if (!propertyId) {
      this.toastr.error('Unable to generate listing share link.', CommonMessage.Error);
      return;
    }

    this.propertyListingShareService.createPropertyShareLink(propertyId).pipe(take(1)).subscribe({
      next: (response) => {
        const shareUrl = this.propertyListingShareService.getPublicListingUrl(response.token);
        const copied = this.clipboard.copy(shareUrl);
        if (copied) {
          this.toastr.success('Listing link copied to clipboard.', CommonMessage.Success);
          return;
        }
        this.toastr.error('Unable to copy listing link.', CommonMessage.Error);
      },
      error: () => {
        this.toastr.error('Unable to generate listing share link.', CommonMessage.Error);
      }
    });
  }

  deleteProperty(property: PropertyListDisplay): void {
    this.propertyService.deleteProperty(property.propertyId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Property deleted successfully', CommonMessage.Success);
        this.allProperties = this.allProperties.filter(p => p.propertyId !== property.propertyId);
        this.selectedPropertyIds.delete(property.propertyId);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {}
    });
  }
  //#endregion
  
  //#region Form Response Methods
  goToProperty(event: PropertyListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId])],
        { queryParams: { section: 'basic', returnTo: 'property-list' } }
      );
    });
  }

  onPropertyRowClick(payload: { rowItem: PropertyListDisplayRow; mouseEvent: MouseEvent }): void {
    const rowItem = payload?.rowItem;
    const mouseEvent = payload?.mouseEvent;
    if (!rowItem?.propertyId) {
      return;
    }

    if (mouseEvent?.shiftKey) {
      mouseEvent.preventDefault();
      this.togglePropertySelection(rowItem.propertyId);
      return;
    }

    this.goToProperty(rowItem);
  }

  onPropertyRowContextMenu(payload: { rowItem: PropertyListDisplayRow; mouseEvent: MouseEvent }): void {
    if (!payload?.rowItem?.propertyId || this.selectedPropertyIds.size === 0) {
      return;
    }

    const mouseEvent = payload.mouseEvent;
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    this.contextMenuPosition = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    this.propertyListContextMenuTrigger?.closeMenu();
    this.propertyListContextMenuTrigger?.openMenu();
  }

  createQuoteFromSelection(): void {
    const selectedIds = Array.from(this.selectedPropertyIds);
    if (selectedIds.length === 0) {
      return;
    }

    this.router.navigateByUrl(`${RouterUrl.QuoteCreate}?propertyIds=${selectedIds.join(',')}&returnTo=property-list`);
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

  goToPropertyCalendarTester(): void {
    this.dialog.open(PropertyCalendarTesterDialogComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '95vh',
      autoFocus: true,
      restoreFocus: true
    });
  }

  openPropertyCalendar(property: PropertyListDisplay): void {
    this.propertyService.getPropertyCalendarUrl(property.propertyId).pipe(take(1)).subscribe({
      next: (response: CalendarUrlResponse) => {
        if (!response?.subscriptionUrl) {
          this.toastr.error('No calendar URL was returned for this property.', CommonMessage.ServiceError);
          return;
        }

        this.showPropertyCalendarUrlDialog(
          property.propertyCode,
          response.subscriptionUrl,
          response as unknown as Record<string, unknown>
        );
      },
      error: () => {}
    });
  }

showPropertyCalendarUrlDialog(
    propertyCode: string,
    subscriptionUrl: string,
    calendarLinkResponse: Record<string, unknown>
  ): void {
    const dialogConfig: MatDialogConfig<PropertyCalendarUrlDialogData> = {
      width: '700px',
      autoFocus: true,
      restoreFocus: true,
      disableClose: false,
      hasBackdrop: true,
      data: {
        propertyCode,
        subscriptionUrl,
        calendarLinkResponse
      }
    };

    this.dialog.open(PropertyCalendarUrlDialogComponent, dialogConfig);
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

    void this.propertyService.updateModifiedProperty(event.propertyId, { isActive: nextValue }).then(() => {
      this.toastr.success('Property updated.', CommonMessage.Success);
    }).catch(() => {
      this.applyPropertyIsActiveValue(event.propertyId, previousValue);
      this.toastr.error('Unable to update property.', CommonMessage.Error);
      this.markViewForCheck();
    }).finally(() => {
      this.applyFilters();
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Filter Methods
  get furnishedToggleMaxIndex(): FiveWayToggleValue {
    return getBoardFilterMaxIndex(this.hasPartnerIntegration);
  }

  get furnishedFilterLabel(): string {
    return getFiveWayFilterLabel(this.furnishedSliderIndex, this.hasPartnerIntegration);
  }

  get isAllFilterSelected(): boolean {
    return isAllFilterIndex(this.furnishedSliderIndex, this.hasPartnerIntegration);
  }

  onFurnishedToggleTrackClick(event: MouseEvent): void {
    const track = (event.currentTarget as HTMLElement).querySelector('.five-way-toggle__track');
    if (!(track instanceof HTMLElement)) {
      return;
    }
    this.setFurnishedSliderIndex(this.resolveFurnishedToggleIndexFromTrackClick(track, event.clientX));
  }

  onFurnishedToggleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.setFurnishedSliderIndex(this.clampFurnishedSliderIndex(this.furnishedSliderIndex - 1));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.setFurnishedSliderIndex(this.clampFurnishedSliderIndex(this.furnishedSliderIndex + 1));
    }
  }

  resolveFurnishedToggleIndexFromTrackClick(track: HTMLElement, clientX: number): FiveWayToggleValue {
    const rect = track.getBoundingClientRect();
    const stepCount = this.furnishedToggleMaxIndex + 1;
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const index = Math.min(stepCount - 1, Math.max(0, Math.floor(ratio * stepCount)));
    return this.clampFurnishedSliderIndex(index);
  }

  clampFurnishedSliderIndex(index: number): FiveWayToggleValue {
    return Math.max(0, Math.min(this.furnishedToggleMaxIndex, index)) as FiveWayToggleValue;
  }

  setFurnishedSliderIndex(index: FiveWayToggleValue): void {
    const nextIndex = this.clampFurnishedSliderIndex(index);
    if (nextIndex === this.furnishedSliderIndex) {
      return;
    }
    this.furnishedSliderIndex = nextIndex;
    if (nextIndex === BoardFilterIndex.Furnished) {
      this.globalSelectionService.setFurnishedPropertySelection(false);
    } else if (nextIndex === BoardFilterIndex.Unfurnished) {
      this.globalSelectionService.setFurnishedPropertySelection(true);
    }
    if (isPartnersFilterIndex(nextIndex, this.hasPartnerIntegration) || this.isAllFilterSelected) {
      this.ensurePartnerPropertiesThen(() => this.applyFilters());
      this.markViewForCheck();
      return;
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  ensurePartnerPropertiesThen(onReady: () => void): void {
    if (!this.hasPartnerIntegration) {
      this.partnerProperties = this.partnerProperties ?? [];
      onReady();
      return;
    }
    if (this.partnerProperties !== null) {
      onReady();
      return;
    }
    if (!this.userId) {
      this.partnerProperties = [];
      onReady();
      return;
    }
    this.partnerService.getActivePropertiesBySelectionCriteria(this.userId).pipe(take(1)).subscribe({
      next: (properties) => {
        this.partnerProperties = this.mapListRows(properties || []);
        onReady();
        this.markViewForCheck();
      },
      error: () => {
        this.partnerProperties = [];
        onReady();
        this.markViewForCheck();
      }
    });
  }

  mapListRows(properties: PropertyListResponse[]): PropertyListDisplayRow[] {
    return this.mappingService.mapPropertyListRows(properties || []).map(row => ({
      ...row,
      propertyLeaseType: this.getPropertyLeaseTypeListLabel(row.propertyLeaseTypeId)
    }));
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    const officeScoped = (rows: PropertyListDisplayRow[]) => this.selectedOffice
      ? rows.filter(property => property.officeId === this.selectedOffice.officeId)
      : rows;
    const standard = officeScoped(this.allProperties);
    const partners = this.partnerProperties ?? [];
    const isActive = (property: PropertyListDisplayRow) => this.mappingService.toBooleanValue(property.isActive);
    const isUnfurnished = (property: PropertyListDisplayRow) => this.mappingService.toBooleanValue(property.unfurnished);

    let filtered: PropertyListDisplayRow[];
    if (this.furnishedSliderIndex === BoardFilterIndex.Furnished) {
      filtered = standard.filter(property => isActive(property) && !isUnfurnished(property));
    } else if (this.furnishedSliderIndex === BoardFilterIndex.Unfurnished) {
      filtered = standard.filter(property => isActive(property) && isUnfurnished(property));
    } else if (this.furnishedSliderIndex === BoardFilterIndex.Both) {
      filtered = standard.filter(property => isActive(property));
    } else if (this.furnishedSliderIndex === BoardFilterIndex.Inactive) {
      filtered = standard.filter(property => !isActive(property));
    } else if (isPartnersFilterIndex(this.furnishedSliderIndex, this.hasPartnerIntegration)) {
      filtered = partners.filter(property => isActive(property));
    } else if (this.isAllFilterSelected) {
      const byId = new Map<string, PropertyListDisplayRow>();
      [...standard.filter(property => isActive(property)), ...partners.filter(property => isActive(property))]
        .forEach(property => byId.set(property.propertyId, property));
      filtered = Array.from(byId.values());
    } else {
      filtered = standard.filter(property => isActive(property));
    }

    filtered.forEach(property => {
      (property as PropertyListDisplayRow & { rowActive?: boolean }).rowActive = this.selectedPropertyIds.has(property.propertyId);
    });
    this.propertiesDisplay = [...filtered];
  }
  //#endregion

  //#region Contact Display Methods
  getPropertyLeaseTypeListLabel(propertyLeaseTypeId: number): string {
    if (Number(propertyLeaseTypeId) === PropertyLeaseType.PropertyManagement) {
      return 'Management';
    }

    return getPropertyLeaseType(propertyLeaseTypeId);
  }

  applyPropertyContactDisplayNames(rows: PropertyListDisplayRow[]): PropertyListDisplayRow[] {
    const vendorContactsById = new Map(
      this.contactService
        .getAllContactsValue()
        .filter(contact => contact.entityTypeId === EntityType.Vendor)
        .map(contact => [this.utilityService.normalizeId(contact.contactId), contact])
    );

    return rows.map(row => {
      const leaseTypeId = Number(row.propertyLeaseTypeId);
      const isVendorLeaseType = leaseTypeId === PropertyLeaseType.Direct || leaseTypeId === PropertyLeaseType.ThirdParty;
      if (!isVendorLeaseType) {
        return row;
      }

      const vendor = vendorContactsById.get(this.utilityService.normalizeId(row.vendorId));
      if (!vendor) {
        return row;
      }

      const vendorLabel = this.utilityService.getVendorDropdownLabel(vendor);
      return vendorLabel ? { ...row, contactName: vendorLabel } : row;
    });
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => {
    })).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.showOfficeDropdown = this.offices.length > 1;
          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            this.applyOfficeFromGlobal(this.pageOfficeId);
          } else if (this.pageOfficeId != null || this.selectedOffice) {
            this.applyPageOfficeScope(this.selectedOffice?.officeId ?? this.pageOfficeId);
          }
          this.getProperties();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.applyPageOfficeScope(this.pageOfficeId);
        this.getProperties();
        this.markViewForCheck();
      }
    });
  }

  onOfficeChange(): void {
    this.pageOfficeId = this.selectedOffice?.officeId ?? null;
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }

    const queryParams: Record<string, string | null> = {};
    if (this.selectedOffice) {
      queryParams['officeId'] = this.selectedOffice.officeId.toString();
    } else {
      queryParams['officeId'] = null;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
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

  applyOfficeFromGlobal(officeId: number | null): void {
    this.pageOfficeId = officeId;
    if (this.offices.length === 0) {
      return;
    }
    if (this.offices.length === 1) {
      this.applyPageOfficeScope(this.offices[0].officeId);
      return;
    }
    const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
    this.applyPageOfficeScope(resolved);
  }

  /** Page-level office filter; does not update global selection. */
  applyPageOfficeScope(officeId: number | null): void {
    this.pageOfficeId = officeId;
    const explicitFromParent = this.officeId;
    const officeIdToUse = explicitFromParent != null && explicitFromParent !== undefined
      ? explicitFromParent
      : officeId;
    this.resolveOfficeScope(officeIdToUse, false);
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

    void this.propertyService.updateModifiedProperty(event.propertyId, { propertyStatusId: selectedStatusId }).then(() => {
      this.updatePropertyStatusDisplay(event.propertyId, selectedStatusId, selectedLabel);
      this.toastr.success('Property status updated.', CommonMessage.Success);
      this.markViewForCheck();
    }).catch(() => {
      this.updatePropertyStatusDisplay(event.propertyId, previousStatusId, previousLabel);
      this.toastr.error('Unable to update property status.', CommonMessage.Error);
      this.markViewForCheck();
    }).finally(() => {
      event.propertyStatusDropdown = this.buildStatusDropdownCell(event.propertyStatusText);
      this.markViewForCheck();
    });
  }

  buildStatusDropdownCell(label: string, isOverridable: boolean = true): PropertyListDisplayRow['propertyStatusDropdown'] {
    return {
      value: label,
      isOverridable,
      toString: () => label
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
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDisplayedColumns();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (event.shiftKey || this.selectedPropertyIds.size === 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.mat-mdc-menu-panel') || target?.closest('.property-list-context-menu-anchor')) {
      return;
    }

    this.selectedPropertyIds.clear();
    this.applyFilters();
  }

  togglePropertySelection(propertyId: string): void {
    if (!propertyId) {
      return;
    }

    if (this.selectedPropertyIds.has(propertyId)) {
      this.selectedPropertyIds.delete(propertyId);
    } else {
      this.selectedPropertyIds.add(propertyId);
    }

    this.applyFilters();
  }

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
    this.itemsToLoad$.complete();
  }
  //#endregion
}

