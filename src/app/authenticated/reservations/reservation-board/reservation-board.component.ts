import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuTrigger } from '@angular/material/menu';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, distinctUntilChanged, filter, finalize, forkJoin, interval, map, of, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { CommonService } from '../../../services/common.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { AgentResponse, filterAgentsByOffice } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { ColorResponse } from '../../organizations/models/color.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { ColorService } from '../../organizations/services/color.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getPropertyStatusLetter, getPropertyStatuses } from '../../properties/models/property-enums';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { PartnerService } from '../../partners/services/partner.service';
import { PartnerContactResponse } from '../../partners/models/partner.model';
import { hasRealtorRole } from '../../shared/access/role-access';
import { BoardProperty, CalendarDay } from '../models/reservation-board-model';
import { getReservationStatus, NoticeStatusType, ReservationNotice, ReservationStatus } from '../models/reservation-enum';
import { ReservationListResponse } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';
import { FiveWayToggleValue, getFiveWayFilterLabel} from '../models/property-filter-model';

@Component({
    standalone: true,
    selector: 'app-reservation-board',
    imports: [CommonModule, MaterialModule, FormsModule],
    templateUrl: './reservation-board.component.html',
    styleUrl: './reservation-board.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReservationBoardComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ownerUserId: string | null = null;
  @Input() ownerContactId: string | null = null;
  @Input() readOnly: boolean = false;
  @Input() readOnlyOwnerLayout: boolean = false;
  @Input() showReservationNames: boolean = true;
  private propertyService = inject(PropertyService);
  private partnerService = inject(PartnerService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private colorService = inject(ColorService);
  private commonService = inject(CommonService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private officeService = inject(OfficeService);
  private agentService = inject(AgentService);
  private propertySelectionFilterService = inject(PropertySelectionFilterService);
  private toastr = inject(ToastrService);
  private formatterService = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  private readonly clearPinsEventName = 'rentall-clear-pins';
  @ViewChild('boardContextMenuTrigger') boardContextMenuTrigger?: MatMenuTrigger;

  readonly boardAddressMaxChars = 23;
  readonly reservationPollIntervalMs = 60_000;
  getPropertyStatusLetter = getPropertyStatusLetter;  
  readonly noticeStatusType = NoticeStatusType;
  properties: BoardProperty[] = [];
  allPropertyRows: PropertyListResponse[] = [];
  standardPropertyRowsCache: PropertyListResponse[] | null = null;
  partnerPropertyRowsCache: PropertyListResponse[] | null = null;
  propertyRows: PropertyListResponse[] = [];
  calendarDays: CalendarDay[] = [];
  reservations: ReservationListResponse[] = [];
  apiReservations: ReservationListResponse[] = [];
  externalCalendarReservations: ReservationListResponse[] = [];
  offices: OfficeResponse[] = [];
  agents: AgentResponse[] = [];
  contacts: ContactResponse[] = [];
  colors: ColorResponse[] = [];
  colorMap: Map<number, string> = new Map(); // Maps reservationStatusId to color hex
  checkedInNoticeColorMap = new Map<number, string>();
  displayTextCache = new Map<string, string>();
  reservationBoardLegendStatusIds: number[] = [
    ReservationStatus.PreBooking,
    ReservationStatus.Confirmed,
    ReservationStatus.CheckedIn,
    ReservationStatus.GaveNotice,
    ReservationStatus.FirstRightRefusal,
    ReservationStatus.Maintenance,
    ReservationStatus.OwnerBlocked
  ];

  readonly externalCalendarReservationIdPrefix = 'extcal:';
  readonly stickyDateRangeStorageKeyPrefix = 'rentall-reservation-board-sticky-dates';

  startDate: Date = null;
  endDate: Date = null;
  dateRangeSticky = false;
  officeScopeResolved = false;
  selectedOfficeId: number | null = null;
  selectedAgentId: string | null = null;
  userId: string = '';
  isOwnerScopedView: boolean = false;
  canFilterByAgent: boolean = false;
  organizationId: string = '';
  propertiesFiltered = false;
  furnishedPropertyToggleChecked = false;
  furnishedSliderIndex: FiveWayToggleValue = 0;
  partnersBoardToggleChecked = false;
  isPartnerBoardLoading = false;
  partnerContactByPropertyId = new Map<string, PartnerContactResponse>();
  loadingPartnerContactIds = new Set<string>();
  hoveredPartnerPropertyId: string | null = null;
  partnerContactPanelPosition = { x: 0, y: 0 };
  propertyStatusOptions = getPropertyStatuses().map(status => ({ value: status.value, label: status.label, letter: getPropertyStatusLetter(status.value)}));
  selectedPropertyIds = new Set<string>();
  contextMenuPosition = { x: 0, y: 0 };
  updatingPropertyStatusIds = new Set<string>();
  isLoadingReservations = false;
  lastLoadedOfficeId: number | null | undefined = undefined;
  officeUseDailyOnBoardById = new Map<number, boolean>();
  externalCalendarLoadSequence = 0;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors', 'reservations', 'properties', 'officeScope']));
  destroy$ = new Subject<void>();

  //#region Reservation-Board
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.markViewForCheck();
    });
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.showReservationNames = this.showReservationNames !== false;
    this.userId = this.authService.getUser()?.userId || '';
    const userGroups = this.authService.getUser()?.userGroups as Array<string | number> | undefined;
    this.isOwnerScopedView = this.hasOwnerScope();
    if (hasRealtorRole(userGroups)) {
      this.readOnly = true;
    }
    this.canFilterByAgent = this.authService.isAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.furnishedPropertyToggleChecked = this.globalSelectionService.getFurnishedPropertySelection() === true;
    this.partnersBoardToggleChecked = this.globalSelectionService.getPartnersBoardSelection() === true;
    this.furnishedSliderIndex = this.resolveFiveWayToggleIndexFromGlobalState();
    this.applyStickyDateRangeFromStorage();
    this.generateCalendarDays();
    this.loadContacts();
    if (this.canFilterByAgent) {
      this.loadAgents();
    }
    this.loadColors();
    this.loadOfficeSettings();
    this.initializeOfficeScope();

    // Reload when user changes working office (skip(1) = ignore initial emission, so we don't load twice on init)
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), distinctUntilChanged(), takeUntil(this.destroy$)).subscribe({
      next: officeId => {
        if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
          return;
        }
        this.applyOfficeFromGlobal(officeId);
        this.lastLoadedOfficeId = null;
        this.loadReservations(true);
        this.loadBoardProperties();
      }
    });

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        const wasFiltered = this.propertiesFiltered;
        this.propertiesFiltered = value;
        if (wasFiltered !== value && this.officeScopeResolved && !this.hasOwnerScope()) {
          this.invalidateBoardPropertyCaches();
          this.loadBoardProperties();
        }
        this.markViewForCheck();
      }
    });
    this.globalSelectionService.getFurnishedPropertySelection$().pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        this.furnishedPropertyToggleChecked = value === true;
        const globalIndex = (value ? 1 : 0) as FiveWayToggleValue;
        if (this.furnishedSliderIndex <= 1 && !this.partnersBoardToggleChecked) {
          this.furnishedSliderIndex = globalIndex;
          if (!this.hasOwnerScope()) {
            this.loadPropertiesForFiveWayFilterPosition(globalIndex);
          }
        }
        this.markViewForCheck();
      }
    });
    this.globalSelectionService.getPartnersBoardSelection$().pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        const wasPartnersMode = this.partnersBoardToggleChecked;
        this.partnersBoardToggleChecked = value === true;
        if (this.partnersBoardToggleChecked) {
          this.furnishedSliderIndex = 3;
        } else if (this.furnishedSliderIndex === 3) {
          this.furnishedSliderIndex = this.furnishedPropertyToggleChecked ? 1 : 0;
        }
        if (wasPartnersMode !== this.partnersBoardToggleChecked) {
          this.lastLoadedOfficeId = null;
          this.loadReservations(true);
          this.loadBoardProperties();
        }
        this.markViewForCheck();
      }
    });
    this.reservationService.reservationSaved$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadReservations(true, true);
    });
    this.startReservationPolling();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['ownerContactId'] && !changes['ownerUserId']) {
      return;
    }

    const scopedOwnerId = this.getScopedOwnerId();
    if (!scopedOwnerId || !this.officeScopeResolved) {
      return;
    }

    this.loadReservations(true);
    this.loadBoardProperties();
  }

  startReservationPolling(): void {
    interval(this.reservationPollIntervalMs).pipe(filter(() => !document.hidden && this.officeScopeResolved && !this.authService.isLoggingOut() && this.authService.getIsLoggedIn()), takeUntil(this.destroy$)).subscribe(() => this.loadReservations(true, true));
  }

  setDefaultDateRange(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setMonth(end.getMonth() + 6);
    end.setHours(0, 0, 0, 0);

    this.startDate = today;
    this.endDate = end;
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
    } else if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setMonth(end.getMonth() + 6);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    // Normalize times
    if (this.startDate) this.startDate.setHours(0, 0, 0, 0);
    if (this.endDate) this.endDate.setHours(0, 0, 0, 0);

    // Ensure start <= end (swap if needed)
    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }

    this.generateCalendarDays();
    if (this.dateRangeSticky) {
      this.persistStickyDateRange();
    }
    this.markViewForCheck();
  }
  //#endregion
  
  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.contacts = contacts || [];
          this.markViewForCheck();
        });
      },
      error: () => {
        this.contacts = [];
        this.markViewForCheck();
      }
    });
  }

  loadAgents(): void {
    this.agentService.ensureAgentsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.agentService.getAllAgents().pipe(takeUntil(this.destroy$)).subscribe(agents => {
          this.agents = agents || [];
          this.syncSelectedAgentWithOfficeScope();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.agents = [];
        this.markViewForCheck();
      }
    });
  }

  loadOfficeSettings(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.officeUseDailyOnBoardById = new Map(
            this.offices.map(office => [office.officeId, office.useDailyOnResBoard === true])
          );
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.officeUseDailyOnBoardById = new Map();
        this.markViewForCheck();
      }
    });
  }

  loadColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors'); })).subscribe({
      next: (colors: ColorResponse[]) => {
        this.colors = colors;
        this.colorMap = this.mappingService.createColorMap(colors);
        this.checkedInNoticeColorMap = this.buildCheckedInNoticeColorMap(colors);
        this.markViewForCheck();
      },
      error: () => {
        this.colors = [];
        this.colorMap = new Map();
        this.checkedInNoticeColorMap = new Map();
        this.markViewForCheck();
      }
    });
  }

  loadBoardProperties(): void {
    if (this.hasOwnerScope()) {
      this.loadPropertiesForOwner();
      return;
    }
    this.loadPropertiesForFiveWayFilterPosition(this.furnishedSliderIndex);
  }

  loadPropertiesForOwner(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    if (!this.userId) {
      this.allPropertyRows = [];
      this.propertyRows = [];
      this.properties = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    const scopedOwnerId = this.getScopedOwnerId();
    if (!scopedOwnerId) {
      this.allPropertyRows = [];
      this.propertyRows = [];
      this.properties = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }

    this.propertyService.getPropertiesByOwner(scopedOwnerId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        const activeProperties = (properties || []).filter(p => p.isActive);
        const workingOfficeId = this.selectedOfficeId;
        this.allPropertyRows = workingOfficeId == null
          ? activeProperties
          : activeProperties.filter(p => p.officeId === workingOfficeId);
        this.applyBoardPropertyFilter();
      },
      error: () => {
        this.allPropertyRows = [];
        this.propertyRows = [];
        this.properties = [];
        this.markViewForCheck();
      }
    });
  }

  loadReservations(force: boolean = false, silent: boolean = false): void {
    if (!this.officeScopeResolved || this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) return;
    const currentOfficeId = this.selectedOfficeId ?? null;
    if (!force && (this.isLoadingReservations || this.lastLoadedOfficeId === currentOfficeId)) return;

    const scopedOwnerId = this.getScopedOwnerId();
    const reservations$ = scopedOwnerId
      ? this.reservationService.getReservationsByOwner(scopedOwnerId)
      : this.reservationService.getReservationList();

    this.isLoadingReservations = true;
    if (!silent) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    }
    reservations$.pipe(take(1), finalize(() => { if (!silent) { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); } })).subscribe({
      next: (reservations: ReservationListResponse[]) => {
        const workingOfficeId = this.selectedOfficeId;
        this.apiReservations = this.partnersBoardToggleChecked
          ? (reservations || [])
          : (reservations || []).filter(r => workingOfficeId == null || r.officeId === workingOfficeId);
        this.loadExternalCalendarReservations();
        this.lastLoadedOfficeId = workingOfficeId ?? null;
        this.displayTextCache.clear();
        this.isLoadingReservations = false;
        this.markViewForCheck();
      },
      error: () => {
        this.apiReservations = [];
        this.externalCalendarReservations = [];
        this.combineBoardReservations();
        this.lastLoadedOfficeId = currentOfficeId;
        this.isLoadingReservations = false;
        this.markViewForCheck();
      }
    });
  }

  initializeOfficeScope(): void {
    this.globalSelectionService.getSelectedOfficeId$().pipe(take(1)).subscribe({
      next: officeId => {
        this.applyOfficeFromGlobal(officeId);
        this.loadReservations(true);
        this.loadBoardProperties();
      }
    });
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    const previousOfficeId = this.selectedOfficeId;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangeSticky,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (previousOfficeId !== this.selectedOfficeId) {
      this.lastLoadedOfficeId = null;
      this.syncSelectedAgentWithOfficeScope();
    }
    this.markViewForCheck();
  }

  loadExternalCalendarReservations(): void {
    const currentSequence = ++this.externalCalendarLoadSequence;
    const propertiesWithExternalCalendar = (this.propertyRows || []).filter(property => String(property.externalCalendar || '').trim() !== '');
    if (propertiesWithExternalCalendar.length === 0) {
      this.externalCalendarReservations = [];
      this.combineBoardReservations();
      return;
    }

    const requests = propertiesWithExternalCalendar.map(property => {
      const externalCalendarUrl = String(property.externalCalendar || '').trim();
      return this.commonService.importExternalCalendar(externalCalendarUrl).pipe(
        map(response => this.mappingService.mapExternalCalendarEventsToReservationList(property, response.events || [])),
        catchError(() => of([] as ReservationListResponse[]))
      );
    });

    forkJoin(requests).pipe(take(1)).subscribe({
      next: (reservationLists: ReservationListResponse[][]) => {
        if (currentSequence !== this.externalCalendarLoadSequence) {
          return;
        }
        this.externalCalendarReservations = reservationLists.flat();
        this.combineBoardReservations();
      },
      error: () => {
        if (currentSequence !== this.externalCalendarLoadSequence) {
          return;
        }
        this.externalCalendarReservations = [];
        this.combineBoardReservations();
      }
    });
  }
  //#endregion

  //#region Sticky Date Range
  applyStickyDateRangeFromStorage(): void {
    const stored = this.readStickyDateRangeFromStorage();
    if (stored?.enabled && stored.startDate && stored.endDate) {
      const start = this.utilityService.parseCalendarDateInput(stored.startDate);
      const end = this.utilityService.parseCalendarDateInput(stored.endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.dateRangeSticky = true;
        this.startDate = start;
        this.endDate = end;
        this.selectedOfficeId = stored.officeId ?? null;
        return;
      }
      this.clearStickyDateRangeStorage();
    }

    this.dateRangeSticky = false;
    this.setDefaultDateRange();
  }

  onStickyDateRangeToggle(): void {
    this.dateRangeSticky = !this.dateRangeSticky;
    if (this.dateRangeSticky) {
      this.onDateRangeChange();
      this.persistStickyDateRange();
    } else {
      this.clearStickyDateRangeStorage();
      this.setDefaultDateRange();
      this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
      this.lastLoadedOfficeId = null;
      this.loadReservations(true);
      this.loadBoardProperties();
      this.onDateRangeChange();
    }
    this.markViewForCheck();
  }

  persistStickyDateRange(): void {
    if (!this.dateRangeSticky || !this.startDate || !this.endDate) {
      return;
    }

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }

    localStorage.setItem(this.getStickyDateRangeStorageKey(), JSON.stringify({
      enabled: true,
      startDate,
      endDate,
      officeId: this.selectedOfficeId
    }));
  }

  readStickyDateRangeFromStorage(): { enabled: boolean; startDate: string; endDate: string; officeId: number | null } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getStickyDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; startDate?: string; endDate?: string; officeId?: number | null };
      if (parsed?.enabled !== true || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      const officeId = parsed.officeId == null || parsed.officeId === undefined ? null : Number(parsed.officeId);
      return {
        enabled: true,
        startDate: String(parsed.startDate),
        endDate: String(parsed.endDate),
        officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null
      };
    } catch {
      return null;
    }
  }

  clearStickyDateRangeStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getStickyDateRangeStorageKey());
  }

  hasOwnerScope(): boolean {
    return this.getScopedOwnerId() !== '';
  }
  //#endregion

  //#region Five-Way Property Filter
  resolveFiveWayToggleIndexFromGlobalState(): FiveWayToggleValue {
    if (this.partnersBoardToggleChecked) {
      return 3;
    }
    return this.furnishedPropertyToggleChecked ? 1 : 0;
  }

  loadPropertiesForFiveWayFilterPosition(index: FiveWayToggleValue): void {
    if (index === 3) {
      this.ensurePartnerPropertyCacheThen(() => this.applyFiveWayFilterFromCache(3));
      return;
    }
    if (index === 4) {
      this.ensureAllPropertyCachesThen(() => this.applyFiveWayFilterFromCache(4));
      return;
    }
    this.ensureStandardPropertyCacheThen(() => this.applyFiveWayFilterFromCache(index));
  }

  applyFiveWayFilterFromCache(index: FiveWayToggleValue): void {
    const scopedStandard = this.scopeBoardPropertiesToOffice(this.standardPropertyRowsCache ?? []);
    const partner = this.partnerPropertyRowsCache ?? [];

    let rows: PropertyListResponse[];
    switch (index) {
      case 0:
        rows = scopedStandard.filter(property => !this.mappingService.toBooleanValue(property.unfurnished));
        break;
      case 1:
        rows = scopedStandard.filter(property => this.mappingService.toBooleanValue(property.unfurnished));
        break;
      case 2:
        // Both — full standard property list, no furnished/unfurnished filter
        rows = [...scopedStandard];
        break;
      case 3:
        rows = partner;
        break;
      case 4:
        rows = this.mergePropertyRowsById(scopedStandard, partner);
        break;
      default:
        rows = scopedStandard;
    }

    this.applyFiveWayFilterPropertyRows(rows);
  }

  ensureStandardPropertyCacheThen(onReady: () => void): void {
    if (this.standardPropertyRowsCache !== null) {
      onReady();
      return;
    }
    this.fetchStandardPropertyCache(onReady);
  }

  ensurePartnerPropertyCacheThen(onReady: () => void): void {
    if (this.partnerPropertyRowsCache !== null) {
      onReady();
      return;
    }
    this.fetchPartnerPropertyCache(onReady);
  }

  ensureAllPropertyCachesThen(onReady: () => void): void {
    const needStandard = this.standardPropertyRowsCache === null;
    const needPartner = this.partnerPropertyRowsCache === null;
    if (!needStandard && !needPartner) {
      onReady();
      return;
    }
    if (needStandard && needPartner) {
      this.fetchStandardAndPartnerPropertyCaches(onReady);
      return;
    }
    if (needStandard) {
      this.fetchStandardPropertyCache(onReady);
      return;
    }
    this.fetchPartnerPropertyCache(onReady);
  }

  fetchStandardPropertyCache(onReady: () => void): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    if (!this.userId) {
      this.standardPropertyRowsCache = [];
      this.clearBoardPropertyRows();
      this.completeBoardPropertyLoad();
      onReady();
      return;
    }

    this.propertyService.getActivePropertiesBySelectionCriteria(this.userId).pipe(take(1), finalize(() => this.completeBoardPropertyLoad())).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.standardPropertyRowsCache = properties || [];
        onReady();
      },
      error: () => {
        this.standardPropertyRowsCache = [];
        this.clearBoardPropertyRows();
        this.isPartnerBoardLoading = false;
        this.markViewForCheck();
      }
    });
  }

  fetchPartnerPropertyCache(onReady: () => void): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    if (!this.userId) {
      this.partnerPropertyRowsCache = [];
      this.clearBoardPropertyRows();
      this.completeBoardPropertyLoad();
      onReady();
      return;
    }

    this.partnerService.getActivePropertiesBySelectionCriteria(this.userId).pipe(take(1), finalize(() => this.completeBoardPropertyLoad())).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.partnerPropertyRowsCache = properties || [];
        onReady();
      },
      error: () => {
        this.partnerPropertyRowsCache = [];
        this.clearBoardPropertyRows();
        this.isPartnerBoardLoading = false;
        this.markViewForCheck();
      }
    });
  }

  fetchStandardAndPartnerPropertyCaches(onReady: () => void): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    if (!this.userId) {
      this.standardPropertyRowsCache = [];
      this.partnerPropertyRowsCache = [];
      this.clearBoardPropertyRows();
      this.completeBoardPropertyLoad();
      onReady();
      return;
    }

    forkJoin({
      standard: this.propertyService.getActivePropertiesBySelectionCriteria(this.userId),
      partner: this.partnerService.getActivePropertiesBySelectionCriteria(this.userId)
    }).pipe(take(1), finalize(() => this.completeBoardPropertyLoad())).subscribe({
      next: ({ standard, partner }) => {
        this.standardPropertyRowsCache = standard || [];
        this.partnerPropertyRowsCache = partner || [];
        onReady();
      },
      error: () => {
        this.standardPropertyRowsCache = [];
        this.partnerPropertyRowsCache = [];
        this.clearBoardPropertyRows();
        this.isPartnerBoardLoading = false;
        this.markViewForCheck();
      }
    });
  }

  completeBoardPropertyLoad(): void {
    this.isPartnerBoardLoading = false;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
  }

  mergePropertyRowsById(...lists: PropertyListResponse[][]): PropertyListResponse[] {
    const byPropertyId = new Map<string, PropertyListResponse>();
    lists.forEach(list => {
      (list || []).forEach(property => byPropertyId.set(property.propertyId, property));
    });
    return Array.from(byPropertyId.values());
  }

  invalidateBoardPropertyCaches(): void {
    this.standardPropertyRowsCache = null;
    this.partnerPropertyRowsCache = null;
  }

  applyFiveWayFilterPropertyRows(properties: PropertyListResponse[]): void {
    this.allPropertyRows = properties || [];
    this.propertyRows = this.allPropertyRows;
    this.isPartnerBoardLoading = false;
    this.loadExternalCalendarReservations();
  }

  scopeBoardPropertiesToOffice(properties: PropertyListResponse[]): PropertyListResponse[] {
    if (this.selectedOfficeId == null) {
      return properties || [];
    }
    return (properties || []).filter(property => property.officeId === this.selectedOfficeId);
  }

  clearBoardPropertyRows(): void {
    this.allPropertyRows = [];
    this.propertyRows = [];
    this.properties = [];
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
      this.setFurnishedSliderIndex(Math.max(0, this.furnishedSliderIndex - 1) as FiveWayToggleValue);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.setFurnishedSliderIndex(Math.min(4, this.furnishedSliderIndex + 1) as FiveWayToggleValue);
    }
  }

  resolveFurnishedToggleIndexFromTrackClick(track: HTMLElement, clientX: number): FiveWayToggleValue {
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const fifth = rect.width / 5;
    if (x >= fifth * 4) {
      return 4;
    }
    if (x >= fifth * 3) {
      return 3;
    }
    if (x >= fifth * 2) {
      return 2;
    }
    if (x >= fifth) {
      return 1;
    }
    return 0;
  }

  setFurnishedSliderIndex(index: FiveWayToggleValue): void {
    if (index === this.furnishedSliderIndex) {
      return;
    }
    this.onFurnishedSliderPreviewChange(index);
  }

  onFurnishedSliderPreviewChange(index: FiveWayToggleValue): void {
    const previousIndex = this.furnishedSliderIndex;
    this.furnishedSliderIndex = index;

    if (index === 3) {
      if (!this.partnersBoardToggleChecked) {
        this.beginPartnerBoardTransition();
        this.globalSelectionService.setPartnersBoardSelection(true);
      } else if (this.partnerPropertyRowsCache !== null) {
        this.applyFiveWayFilterFromCache(3);
      }
      this.markViewForCheck();
      return;
    }

    if (previousIndex === 3 && this.partnersBoardToggleChecked) {
      this.beginPartnerBoardTransition();
      this.globalSelectionService.setPartnersBoardSelection(false);
    }

    if (index === 0) {
      this.globalSelectionService.setFurnishedPropertySelection(false);
    } else if (index === 1) {
      this.globalSelectionService.setFurnishedPropertySelection(true);
    } else if (index === 2) {
      this.applyBothPropertyFilter();
    } else if (index === 4 && !this.hasOwnerScope() && !this.partnersBoardToggleChecked) {
      this.loadPropertiesForFiveWayFilterPosition(index);
    }

    this.markViewForCheck();
  }

  /** Both — all standard properties, no furnished/unfurnished filter. */
  applyBothPropertyFilter(): void {
    if (this.hasOwnerScope()) {
      return;
    }
    if (this.standardPropertyRowsCache !== null) {
      this.applyFiveWayFilterFromCache(2);
      return;
    }
    this.ensureStandardPropertyCacheThen(() => this.applyFiveWayFilterFromCache(2));
  }
  //#endregion

  //#region Get Methods

  get furnishedFilterLabel(): string {
    return getFiveWayFilterLabel(this.furnishedSliderIndex);
  }

  get officeOptions(): OfficeResponse[] {
    return this.offices;
  }

  get agentOptions(): AgentResponse[] {
    const activeAgents = (this.agents || []).filter(agent => agent.isActive);
    if (this.selectedOfficeId == null) {
      return activeAgents;
    }
    return filterAgentsByOffice(activeAgents, this.selectedOfficeId);
  }

  get showAgentDropdown(): boolean {
    return !this.partnersBoardToggleChecked && this.canFilterByAgent && this.agentOptions.length > 0;
  }

  get showOfficeDropdown(): boolean {
    return !this.partnersBoardToggleChecked && this.officeOptions.length > 1;
  }

  get isPropertyStatusReadOnly(): boolean {
    return this.readOnly || this.partnersBoardToggleChecked;
  }

  get isPropertyCodeNavigable(): boolean {
    return !this.readOnly && !this.partnersBoardToggleChecked;
  }

  getScopedOwnerId(): string {
    return String(this.ownerContactId || this.ownerUserId || '').trim();
  }

  getStickyDateRangeStorageKey(): string {
    const userKey = this.userId?.trim() || 'anonymous';
    return `${this.stickyDateRangeStorageKeyPrefix}-${userKey}`;
  }

  getSelectedAgentCode(): string | null {
    if (this.partnersBoardToggleChecked || !this.canFilterByAgent || !this.selectedAgentId) {
      return null;
    }
    const agent = this.agents.find(item => item.agentId === this.selectedAgentId);
    const agentCode = (agent?.agentCode || '').trim();
    return agentCode || null;
  }

  getMonthGroups(): { monthName: string; days: number }[] {
    const groups: { monthName: string; days: number }[] = [];
    let currentMonth = '';
    let dayCount = 0;

    for (const day of this.calendarDays) {
      if (day.monthName !== currentMonth) {
        if (currentMonth) {
          groups.push({ monthName: currentMonth, days: dayCount });
        }
        currentMonth = day.monthName;
        dayCount = 1;
      } else {
        dayCount++;
      }
    }

    if (currentMonth) {
      groups.push({ monthName: currentMonth, days: dayCount });
    }

    return groups;
  }

  getReservationForPropertyAndDate(propertyId: string, date: Date): ReservationListResponse | null {
    const matchingReservations = this.reservations.filter(r => {
      if (r.propertyId !== propertyId || !r.arrivalDate || !r.departureDate) {
        return false;
      }
      const arrival = this.parseDateOnly(r.arrivalDate);
      const departure = this.parseDateOnly(r.departureDate);
      if (!arrival || !departure) {
        return false;
      }
      const compareDate = new Date(date);
      compareDate.setHours(0, 0, 0, 0);
      return compareDate >= arrival && compareDate <= departure;
    });

    if (matchingReservations.length === 0) {
      return null;
    }

    matchingReservations.sort((a, b) => {
      const aIsExternal = this.isExternalCalendarReservation(a.reservationId);
      const bIsExternal = this.isExternalCalendarReservation(b.reservationId);
      if (aIsExternal !== bIsExternal) {
        return aIsExternal ? 1 : -1;
      }
      if (!a.arrivalDate || !b.arrivalDate) return 0;
      const dateA = this.parseDateOnly(a.arrivalDate);
      const dateB = this.parseDateOnly(b.arrivalDate);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });

    return matchingReservations[0];
  }

  getReservationStatusClass(reservation: ReservationListResponse | null, date: Date): string {
    if (!reservation) {
      return '';
    }

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    const arrival = this.parseDateOnly(reservation.arrivalDate);
    const departure = this.parseDateOnly(reservation.departureDate);
    if (!arrival || !departure) {
      return '';
    }

    if (compareDate.getTime() === arrival.getTime()) {
      return 'reservation-arrival';
    }

    if (compareDate.getTime() === departure.getTime()) {
      return 'reservation-departure';
    }
    return '';
  }

  getReservationColor(reservation: ReservationListResponse | null, date: Date): string | null {
    if (!reservation) {
      return null;
    }

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    const arrival = this.parseDateOnly(reservation.arrivalDate);
    const departure = this.parseDateOnly(reservation.departureDate);
    if (!arrival || !departure) {
      return null;
    }

    if (compareDate.getTime() === arrival.getTime() || compareDate.getTime() === departure.getTime()) {
      return this.colorMap.get(ReservationStatus.ArrivalDeparture) || null;
    }

    if (reservation.reservationStatusId === ReservationStatus.CheckedIn) {
      const checkedInBaseColor = this.colorMap.get(ReservationStatus.CheckedIn) || null;
      return this.getCheckedInColorByNotice(reservation, checkedInBaseColor);
    }

    const color = this.colorMap.get(reservation.reservationStatusId);
    return color || null;
  }

  getBlockedAvailabilityColor(): string | null {
    return this.colorMap.get(ReservationStatus.Offline) || null;
  }

  getTextColor(backgroundColor: string | null): string {
    if (!backgroundColor) {
      return '';
    }

    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > 128 ? '#000000' : '#ffffff';
  }

  /**
   * Single month: EOM/SOM/available per user formula.
   * EOM = last day of month - 1 (or -2 if last day is Departure).
   * SOM = 1 if first day visible and not arrival; 3 if day 1 is Arrival; arrival+2 if arrival in middle; or board first day if partial month.
   * Available = EOM - SOM (number of character slots from SOM through EOM).
   * Rules: name length <= available -> center with equal blanks; name length > available -> plain character cap (drop from the end of the string).
   */
  getCharactersForMonth(fullName: string, date: Date, arrivalDate?: Date | null, departureDate?: Date | null): string {
    const requestedDate = new Date(date);
    const year = requestedDate.getFullYear();
    const month = requestedDate.getMonth();
    const month1Based = month + 1;
    const lastDayOfMonth = new Date(year, month1Based, 0).getDate();

    const normalizedName = (fullName || '').toUpperCase();
    if (!normalizedName) {
      return ' '.repeat(lastDayOfMonth);
    }

    const arrDate = arrivalDate ? this.parseDateOnly(arrivalDate) : null;
    const depDate = departureDate ? this.parseDateOnly(departureDate) : null;

    const isDepartureOnLastDay = depDate && depDate.getFullYear() === year && depDate.getMonth() === month && depDate.getDate() === lastDayOfMonth;
    const EOM = isDepartureOnLastDay ? lastDayOfMonth - 2 : lastDayOfMonth - 1;

    const isFirstMonthOnBoard = this.startDate && this.startDate.getFullYear() === year && this.startDate.getMonth() === month;
    const firstDayVisible = this.startDate?.getDate() ?? 1;
    const isPartialFirstMonth = isFirstMonthOnBoard && firstDayVisible > 1;
    const isArrivalInThisMonth = arrDate && arrDate.getFullYear() === year && arrDate.getMonth() === month;
    const arrivalDay = isArrivalInThisMonth ? arrDate!.getDate() : 0;

    let SOM: number;
    if (isArrivalInThisMonth && arrivalDay === 1) {
      SOM = 3;
    } else if (isArrivalInThisMonth && arrivalDay > 1) {
      SOM = arrivalDay + 2;
    } else if (isPartialFirstMonth) {
      SOM = firstDayVisible;
    } else {
      SOM = 1;
    }

    const availableSpaces = Math.max(0, EOM - SOM + 1);

    let content: string;
    if (availableSpaces === 0) {
      content = '';
    } else if (normalizedName.length <= availableSpaces) {
      const availableForBlanks = availableSpaces - normalizedName.length;
      const leadingBlanks = Math.floor(availableForBlanks / 2);
      const trailingBlanks = availableForBlanks - leadingBlanks;
      content = ' '.repeat(leadingBlanks) + normalizedName + ' '.repeat(trailingBlanks);
    } else {
      content = normalizedName.slice(0, availableSpaces);
    }

    const prefix = ' '.repeat(SOM - 1);
    const suffix = ' '.repeat(lastDayOfMonth - EOM);
    return prefix + content + suffix;
  }

  getCharactersForReservation(fullName: string, availableSpaces: number): string {
    const normalizedName = (fullName || '').toUpperCase();
    if (availableSpaces <= 0) {
      return '';
    }

    if (!normalizedName) {
      return ' '.repeat(availableSpaces);
    }

    if (normalizedName.length > availableSpaces) {
      return normalizedName.slice(0, availableSpaces);
    }

    const availableForBlanks = availableSpaces - normalizedName.length;
    const leadingBlanks = Math.floor(availableForBlanks / 2);
    const trailingBlanks = availableForBlanks - leadingBlanks;
    return ' '.repeat(leadingBlanks) + normalizedName + ' '.repeat(trailingBlanks);
  }

  /**
   * Two consecutive partial months = last two months of the reservation (month before departure + departure month).
   * First month can be partial because the board starts mid-month (viewable space); second because reservation ends mid-month.
   * SOM (month 1): board first day if board starts in that month; else arrival+2 if arrival in that month; else 1.
   * EOM (month 2) = Departure - 2. EOM1 = last day of month 1 - 1.
   */
  getTwoMonthSpanAvailable(arrival: Date, departure: Date): { totalAvailable: number; getCharIndex: (d: Date) => number } {
    const y2 = departure.getFullYear();
    const m2 = departure.getMonth();
    const y1 = m2 === 0 ? y2 - 1 : y2;
    const m1 = m2 === 0 ? 11 : m2 - 1;

    const lastDay1 = new Date(y1, m1 + 1, 0).getDate();
    const lastDay2 = new Date(y2, m2 + 1, 0).getDate();
    const depDay = departure.getDate();

    const isBoardFirstMonth = this.startDate &&
      this.startDate.getFullYear() === y1 &&
      this.startDate.getMonth() === m1 &&
      (this.startDate.getDate() ?? 1) > 1;
    const firstDayVisible = this.startDate?.getDate() ?? 1;
    const arrivalInFirstMonth = arrival.getFullYear() === y1 && arrival.getMonth() === m1;

    let SOM: number;
    if (arrivalInFirstMonth) {
      SOM = arrival.getDate() + 2;
    } else if (isBoardFirstMonth) {
      SOM = firstDayVisible;
    } else {
      SOM = 1;
    }

    const EOM1 = lastDay1;
    const isFullSecondMonth = depDay === lastDay2;
    const EOM2 = isFullSecondMonth ? lastDay2 - 1 : Math.max(0, depDay - 2);

    const available1 = Math.max(0, EOM1 - SOM + 1);
    const available2 = EOM2;
    const totalAvailable = available1 + available2;

    const getCharIndex = (d: Date): number => {
      const yd = d.getFullYear();
      const md = d.getMonth();
      const day = d.getDate();
      if (yd === y1 && md === m1) {
        if (day >= SOM && day <= EOM1) return day - SOM;
        return -1;
      }
      if (yd === y2 && md === m2) {
        if (day >= 1 && day <= EOM2) return available1 + (day - 1);
        return -1;
      }
      return -1;
    };

    return { totalAvailable, getCharIndex };
  }

  getReservationDisplayText(reservation: ReservationListResponse | null, date: Date): string {
    if (!reservation) {
      return '';
    }
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    const arrival = this.parseDateOnly(reservation.arrivalDate);
    const departure = this.parseDateOnly(reservation.departureDate);
    if (!arrival || !departure) {
      return '';
    }

    if (compareDate.getTime() === arrival.getTime()) {
      return 'A';
    }
    if (compareDate.getTime() === departure.getTime()) {
      return 'D';
    }

    const cacheKey = `${reservation.reservationId}-${compareDate.getTime()}`;
    const cached = this.displayTextCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let result: string;

    if (reservation.reservationStatusId === ReservationStatus.OwnerBlocked) {
      result = 'O';
    } else if (reservation.reservationStatusId === ReservationStatus.Maintenance) {
      result = 'M';
    } else if (reservation.reservationStatusId === ReservationStatus.PreBooking ||
        reservation.reservationStatusId === ReservationStatus.Confirmed ||
        reservation.reservationStatusId === ReservationStatus.CheckedIn ||
        reservation.reservationStatusId === ReservationStatus.GaveNotice ||
        reservation.reservationStatusId === ReservationStatus.FirstRightRefusal) {
      if (!this.showReservationNames) {
        result = '';
        this.displayTextCache.set(cacheKey, result);
        return result;
      }
      const contact = reservation.contactId ? this.contacts.find(c => c.contactId === reservation.contactId) ?? null : null;
      const fullName = this.utilityService.getReservationBoardLabel(reservation, contact).toUpperCase();
      const reservationDays = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (reservationDays > 0 && this.shouldCenterAcrossReservation(arrival, departure)) {
        if (compareDate.getTime() === arrival.getTime()) {
          result = 'A';
        } else if (compareDate.getTime() === departure.getTime()) {
          result = 'D';
        } else {
          const { totalAvailable, getCharIndex } = this.getTwoMonthSpanAvailable(arrival, departure);
          const reservationChars = this.getCharactersForReservation(fullName, totalAvailable);
          const idx = getCharIndex(compareDate);
          if (idx >= 0 && idx < reservationChars.length) {
            result = reservationChars[idx];
          } else {
            result = ' ';
          }
        }
      } else {
        if (compareDate.getTime() === arrival.getTime()) {
          result = 'A';
        } else if (compareDate.getTime() === departure.getTime()) {
          result = 'D';
        } else {
          const monthChars = this.getCharactersForMonth(fullName, date, arrival, departure);
          const day = date.getDate();
          result = monthChars[day - 1] ?? ' ';
        }
      }
    } else {
      if (compareDate.getTime() === arrival.getTime()) {
        result = 'A';
      } else if (compareDate.getTime() === departure.getTime()) {
        result = 'D';
      } else {
        result = '';
      }
    }

    this.displayTextCache.set(cacheKey, result);
    return result;
  }

  getPropertyRoute(propertyId: string): string {
    return '/' + RouterUrl.replaceTokens(RouterUrl.Property, [propertyId]);
  }

  getPartnerContact(propertyId: string): PartnerContactResponse | null {
    const id = String(propertyId || '').trim();
    if (!id) {
      return null;
    }
    return this.partnerContactByPropertyId.get(id) ?? null;
  }

  getReservationLegendLabel(statusId: number): string {
    return getReservationStatus(statusId);
  }

  getReservationLegendColor(statusId: number): string {
    return this.colorMap.get(statusId) || '#94a3b8';
  }

  getBoardRentDisplay(property: BoardProperty): string {
    const useDaily = this.officeUseDailyOnBoardById.get(property.officeId) === true;
    const rate = useDaily ? property.dailyRate : property.monthlyRate;
    const suffix = useDaily ? '/D' : '/M';
    return `${this.formatCompactRate(rate)}${suffix}`;
  }

  getPropertyCodeClass(noticeStatusId: number | null | undefined): string {
    if (noticeStatusId === NoticeStatusType.GaveNotice) {
      return 'reservation-property-code-link--gave-notice';
    }
    if (noticeStatusId === NoticeStatusType.MonthToMonth) {
      return 'reservation-property-code-link--month-to-month';
    }
    return '';
  }

  getCheckedInColorByNotice(reservation: ReservationListResponse, baseColor: string | null): string | null {
    if (!baseColor) {
      return null;
    }

    const noticeDays = this.getReservationNoticeDays(reservation);
    if (noticeDays !== null) {
      const noticeColor = this.checkedInNoticeColorMap.get(noticeDays);
      if (noticeColor) {
        return noticeColor;
      }
    }

    return baseColor;
  }

  getReservationNoticeDays(reservation: ReservationListResponse): number | null {
    const rawText = String(reservation.reservationNoticeId ?? '').trim();
    if (rawText === '') {
      return null;
    }
    const notice = Number(rawText);
    if (!Number.isFinite(notice)) {
      return null;
    }

    if (notice === 14 || notice === 15 || notice === 30 || notice === 60) {
      return notice;
    }
    if (notice === ReservationNotice.ThirtyDays) {
      return 30;
    }
    if (notice === ReservationNotice.FifteenDays) {
      return 15;
    }
    if (notice === ReservationNotice.FourteenDays) {
      return 14;
    }
    if (notice === ReservationNotice.SixtyDays) {
      return 60;
    }
    if (notice === ReservationNotice.FirmEndDate) {
      return null;
    }
    return null;
  }

  //#endregion

  //#region Board Supporting Methods
  beginPartnerBoardTransition(): void {
    this.externalCalendarLoadSequence++;
    this.allPropertyRows = [];
    this.propertyRows = [];
    this.properties = [];
    this.apiReservations = [];
    this.externalCalendarReservations = [];
    this.reservations = [];
    this.partnerContactByPropertyId.clear();
    this.loadingPartnerContactIds.clear();
    this.hoveredPartnerPropertyId = null;
    this.partnerContactPanelPosition = { x: 0, y: 0 };
    this.displayTextCache.clear();
    this.isPartnerBoardLoading = true;
    this.markViewForCheck();
  }

  onOfficeDropdownChange(): void {
    this.lastLoadedOfficeId = null;
    this.syncSelectedAgentWithOfficeScope();
    if (this.dateRangeSticky) {
      this.persistStickyDateRange();
    }
    this.loadReservations(true);
    this.loadBoardProperties();
    this.markViewForCheck();
  }

  onAgentDropdownChange(): void {
    this.combineBoardReservations();
    this.markViewForCheck();
  }

  syncSelectedAgentWithOfficeScope(): void {
    if (!this.selectedAgentId) {
      return;
    }
    if (!this.agentOptions.some(agent => agent.agentId === this.selectedAgentId)) {
      this.selectedAgentId = null;
      this.combineBoardReservations();
    }
  }

  filterReservationsByAgent(reservations: ReservationListResponse[]): ReservationListResponse[] {
    const agentCode = this.getSelectedAgentCode();
    if (!agentCode) {
      return reservations;
    }
    const normalizedAgentCode = agentCode.toLowerCase();
    return (reservations || []).filter(reservation => (reservation.agentCode || '').trim().toLowerCase() === normalizedAgentCode);
  }

  applyBoardPropertyFilter(): void {
    if (!this.hasOwnerScope() && (this.furnishedSliderIndex === 2 || this.furnishedSliderIndex === 3 || this.furnishedSliderIndex === 4)) {
      this.propertyRows = this.allPropertyRows || [];
      this.loadExternalCalendarReservations();
      return;
    }

    const showUnfurnished = this.globalSelectionService.getFurnishedPropertySelection() === true;
    this.propertyRows = (this.allPropertyRows || []).filter(p => this.mappingService.toBooleanValue(p.unfurnished) === showUnfurnished);
    this.loadExternalCalendarReservations();
  }

  generateCalendarDays(): void {
    const days: CalendarDay[] = [];
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    const start = this.startDate ? this.parseDateOnly(this.startDate) ?? new Date() : new Date();
    const end = this.endDate ? this.parseDateOnly(this.endDate) ?? new Date() : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const currentDate = new Date(start);
    let lastMonth = -1;

    // Inclusive range
    while (currentDate.getTime() <= end.getTime()) {
      const date = new Date(currentDate);
      const dayOfWeek = dayNames[date.getDay()];
      const dayNumber = date.getDate();
      const monthIndex = date.getMonth();
      const monthName = monthNames[monthIndex];
      const isFirstOfMonth = monthIndex !== lastMonth;

      days.push({
        date: date,
        dayOfWeek: dayOfWeek,
        dayNumber: dayNumber,
        monthName: monthName,
        isFirstOfMonth: isFirstOfMonth
      });

      lastMonth = monthIndex;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.calendarDays = days;
    this.displayTextCache.clear();
  }

  parseDateOnly(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    // Parse YYYY-MM-DD as a local date to avoid timezone shifts.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(year, month, day);
      parsed.setHours(0, 0, 0, 0);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    const fallback = new Date(value);
    fallback.setHours(0, 0, 0, 0);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  isDateBlockedByAvailability(property: BoardProperty, date: Date): boolean {
    if (!property) {
      return false;
    }

    const compareDate = this.parseDateOnly(date);
    if (!compareDate) {
      return false;
    }

    const availableFromDate = this.parseDateOnly(property.availableFrom);
    if (availableFromDate && compareDate.getTime() < availableFromDate.getTime()) {
      return true;
    }

    const availableUntilDate = this.parseDateOnly(property.availableUntil);
    if (availableUntilDate && compareDate.getTime() > availableUntilDate.getTime()) {
      return true;
    }

    return false;
  }

  /**
   * Use two-month span only when we have two consecutive PARTIAL months (month before departure + departure month).
   * First month partial = board starts in that month after day 1, or arrival is in that month.
   * Second month partial = departure is before the last day of the month.
   * If either month is full, treat each month independently (single-month logic per month).
   */
  shouldCenterAcrossReservation(arrival: Date, departure: Date): boolean {
    const startMonthIndex = arrival.getFullYear() * 12 + arrival.getMonth();
    const endMonthIndex = departure.getFullYear() * 12 + departure.getMonth();
    if (endMonthIndex - startMonthIndex < 1) {
      return false;
    }

    const y2 = departure.getFullYear();
    const m2 = departure.getMonth();
    const y1 = m2 === 0 ? y2 - 1 : y2;
    const m1 = m2 === 0 ? 11 : m2 - 1;
    const lastDay2 = new Date(y2, m2 + 1, 0).getDate();
    const depDay = departure.getDate();

    const firstMonthPartial = (this.startDate &&
      this.startDate.getFullYear() === y1 &&
      this.startDate.getMonth() === m1 &&
      (this.startDate.getDate() ?? 1) > 1) ||
      (arrival.getFullYear() === y1 && arrival.getMonth() === m1);
    const secondMonthPartial = depDay < lastDay2;

    return firstMonthPartial && secondMonthPartial;
  }
  //#endregion

  //#region Navigation Methods
  navigateToReservation(reservationId: string, propertyId?: string | null): void {
    if (this.readOnly) {
      return;
    }
    const queryParams: Record<string, string> = { returnTo: 'reservation-board' };
    const normalizedPropertyId = String(propertyId ?? '').trim();
    if (normalizedPropertyId) {
      queryParams['propertyId'] = normalizedPropertyId;
    }
    this.router.navigate(['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])], {
      queryParams
    });
  }

  navigateToNewReservation(propertyId: string, date: Date): void {
    if (this.readOnly) {
      return;
    }
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const boardProperty = this.properties.find(property => property.propertyId === propertyId);
    const propertyRow = this.allPropertyRows.find(property => property.propertyId === propertyId);
    const officeId = boardProperty?.officeId ?? propertyRow?.officeId;
    const queryParams: Record<string, string> = {
      returnTo: 'reservation-board',
      propertyId,
      startDate: this.utilityService.formatDateOnlyForApi(selectedDate) ?? this.utilityService.todayAsCalendarDateString()
    };
    if (officeId != null && officeId > 0) {
      queryParams['officeId'] = String(officeId);
    }

    this.router.navigate(
      ['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, ['new'])],
      { queryParams }
    );
  }

  goToBoardSelection(): void {
    if (this.readOnly) {
      return;
    }
    const partnersBoard = this.partnersBoardToggleChecked;
    if (!this.userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board', partnersBoard } });
      return;
    }

    this.propertyService.getPropertySelection(this.userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board', selection, partnersBoard } });
      },
      error: () => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board', partnersBoard } });
      }
    });
  }

  onReservationCellClick(reservationId: string, propertyId: string, event?: MouseEvent): void {
    if (this.readOnly) {
      return;
    }

    if (event?.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.togglePropertySelection(propertyId);
      return;
    }
    if (this.isExternalCalendarReservation(reservationId)) {
      return;
    }
    this.navigateToReservation(reservationId, propertyId);
  }

  onEmptyCellClick(propertyId: string, date: Date, event?: MouseEvent): void {
    if (this.readOnly) {
      return;
    }
    if (event?.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.togglePropertySelection(propertyId);
      return;
    }
    this.navigateToNewReservation(propertyId, date);
  }

  onPropertyRowClick(propertyId: string, event: MouseEvent): void {
    if (this.readOnly || !event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.togglePropertySelection(propertyId);
  }

  onPropertyCodeClick(propertyId: string, event: MouseEvent): void {
    if (!this.isPropertyCodeNavigable) {
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.togglePropertySelection(propertyId);
      return;
    }

    this.router.navigate([this.getPropertyRoute(propertyId)], {
      queryParams: { returnTo: 'reservation-board' }
    });
  }

  loadPartnerContact(propertyId: string): void {
    const id = String(propertyId || '').trim();
    if (!this.partnersBoardToggleChecked || !id || this.partnerContactByPropertyId.has(id) || this.loadingPartnerContactIds.has(id)) {
      return;
    }

    this.loadingPartnerContactIds.add(id);
    this.partnerService.getPartnerContact(id).pipe(take(1)).subscribe({
      next: (contact: PartnerContactResponse | null) => {
        if (contact) {
          this.partnerContactByPropertyId.set(id, contact);
        }
        this.loadingPartnerContactIds.delete(id);
        this.markViewForCheck();
      },
      error: () => {
        this.loadingPartnerContactIds.delete(id);
      }
    });
  }

  onPartnerPropertyRowHover(propertyId: string, event: MouseEvent): void {
    if (!this.partnersBoardToggleChecked) {
      return;
    }
    this.hoveredPartnerPropertyId = String(propertyId || '').trim() || null;
    this.partnerContactPanelPosition = {
      x: event.clientX + 12,
      y: event.clientY + 12
    };
    if (this.hoveredPartnerPropertyId) {
      this.loadPartnerContact(this.hoveredPartnerPropertyId);
    }
    this.markViewForCheck();
  }

  onPartnerPropertyRowLeave(): void {
    if (!this.partnersBoardToggleChecked) {
      return;
    }
    this.hoveredPartnerPropertyId = null;
    this.markViewForCheck();
  }

  isPartnerContactLoading(propertyId: string): boolean {
    const id = String(propertyId || '').trim();
    return !!id && this.loadingPartnerContactIds.has(id);
  }

  formatPartnerContactField(value: string | null | undefined): string {
    const text = String(value || '').trim();
    return text || '—';
  }

  formatPartnerContactPhone(phone: string | null | undefined): string {
    return this.formatterService.phoneNumber(String(phone || '').trim()) || '—';
  }

  onPropertyRowContextMenu(event: MouseEvent): void {
    if (this.readOnly || this.selectedPropertyIds.size === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.boardContextMenuTrigger?.closeMenu();
    this.boardContextMenuTrigger?.openMenu();
    this.markViewForCheck();
  }

  isPropertySelected(propertyId: string): boolean {
    return this.selectedPropertyIds.has(propertyId);
  }

  onBoardPropertyStatusChange(property: BoardProperty, statusId: number): void {
    if (this.isPropertyStatusReadOnly || !property || this.updatingPropertyStatusIds.has(property.propertyId)) {
      return;
    }

    const previousStatusId = property.propertyStatusId;
    if (statusId === previousStatusId) {
      return;
    }

    this.updatingPropertyStatusIds.add(property.propertyId);
    property.propertyStatusId = statusId;
    property.statusLetter = getPropertyStatusLetter(statusId);
    this.syncPropertyStatusInSourceRows(property.propertyId, statusId);

    void this.propertyService.updateModifiedProperty(property.propertyId, { propertyStatusId: statusId }).then(() => {
      property.propertyStatusId = statusId;
      property.statusLetter = getPropertyStatusLetter(statusId);
      this.syncPropertyStatusInSourceRows(property.propertyId, statusId);
      this.toastr.success('Property status updated.', CommonMessage.Success);
      this.markViewForCheck();
    }).catch(() => {
      property.propertyStatusId = previousStatusId;
      property.statusLetter = getPropertyStatusLetter(previousStatusId);
      this.syncPropertyStatusInSourceRows(property.propertyId, previousStatusId);
      this.toastr.error('Unable to update property status.', CommonMessage.Error);
      this.markViewForCheck();
    }).finally(() => {
      this.updatingPropertyStatusIds.delete(property.propertyId);
      this.markViewForCheck();
    });
  }

  syncPropertyStatusInSourceRows(propertyId: string, statusId: number): void {
    const syncRow = (row: PropertyListResponse) => {
      if (row.propertyId === propertyId) {
        row.propertyStatusId = statusId;
      }
    };
    this.allPropertyRows.forEach(syncRow);
    this.propertyRows.forEach(syncRow);
    this.standardPropertyRowsCache?.forEach(syncRow);
    this.partnerPropertyRowsCache?.forEach(syncRow);
  }

  openBoardStatusDropdown(event: Event, dropdown: { open: () => void } | undefined): void {
    if (this.isPropertyStatusReadOnly) {
      return;
    }
    event.stopPropagation();
    dropdown?.open();
  }

  togglePropertySelection(propertyId: string): void {
    if (this.readOnly || !propertyId) {
      return;
    }

    if (this.selectedPropertyIds.has(propertyId)) {
      this.selectedPropertyIds.delete(propertyId);
      return;
    }

    this.selectedPropertyIds.add(propertyId);
  }

  createQuoteFromSelection(): void {
    if (this.readOnly) {
      return;
    }
    const selectedPropertyIds = Array.from(this.selectedPropertyIds);
    if (selectedPropertyIds.length === 0) {
      return;
    }

    this.router.navigateByUrl(`${RouterUrl.QuoteCreate}?propertyIds=${selectedPropertyIds.join(',')}&returnTo=reservation-board`);
  }

  formatCompactRate(value: number | null | undefined): string {
    const normalized = Number(value ?? 0);
    if (!Number.isFinite(normalized)) {
      return '$0';
    }
    const text = normalized % 1 === 0
      ? String(normalized)
      : String(normalized).replace(/\.0+$/, '');
    return `$${text}`;
  }

  formatBoardAddressForCell(address: string | null | undefined): string {
    const text = address ?? '';
    if (text.length <= this.boardAddressMaxChars) {
      return text;
    }
    return text.slice(0, this.boardAddressMaxChars) + '…';
  }

  buildCheckedInNoticeColorMap(colors: ColorResponse[]): Map<number, string> {
    const mapByNotice = new Map<number, string>();
    (colors || [])
      .filter(color => color.reservationStatusId === ReservationStatus.CheckedIn && color.noticeDays !== null && color.noticeDays !== undefined)
      .forEach(color => {
        const noticeDays = Number(color.noticeDays);
        if (Number.isFinite(noticeDays)) {
          mapByNotice.set(noticeDays, color.color);
        }
      });
    return mapByNotice;
  }

  combineBoardReservations(): void {
    const filteredApiReservations = this.filterReservationsByAgent(this.apiReservations);
    const externalReservations = this.getSelectedAgentCode() ? [] : this.externalCalendarReservations;
    this.reservations = [...filteredApiReservations, ...externalReservations];
    this.properties = this.mappingService.mapPropertiesToBoardProperties(this.propertyRows, this.reservations);
    this.displayTextCache.clear();
    this.markViewForCheck();
  }

  isExternalCalendarReservation(reservationId: string | null | undefined): boolean {
    return String(reservationId || '').startsWith(this.externalCalendarReservationIdPrefix);
  }
  //#endregion

  //#region Utility Methods
  onClearPins = (): void => {
    if (!this.dateRangeSticky) {
      return;
    }
    this.dateRangeSticky = false;
    this.markViewForCheck();
  };

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}