import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, finalize, map, skip, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { isServiceProvider } from '../../shared/access/role-access';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { DocumentConfig, EmailConfig } from '../../shared/base-document.component';
import { MaterialModule } from '../../../material.module';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';
import { ServiceType } from '../../shared/models/mixed-enums';
import { MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { buildMobileCalendarMaintenanceRows } from './mobile-dashboard-calendar-data';
import {
  MobileCalendarMaintenanceRow,
  MobileDashboardCalendarSnapshot,
  MobileScheduleCalendarMonth,
  MobileScheduleDotType
} from './mobile-dashboard-calendar.model';
import {
  DashboardScheduleMaintenanceFallbackRow,
  DashboardScheduleSnapshotContext,
  DashboardScheduleSnapshotService
} from '../../shared/services/dashboard-schedule-snapshot.service';
import {
  buildScheduleDetailFields,
  getScheduleDateCellDisplay,
  getScheduleRowKey,
  MobileScheduleDetailField
} from './mobile-dashboard-schedule-detail';
import {
  buildScheduleEmailBody,
  buildScheduleEmailSubject,
  buildScheduleExportFileName,
  buildScheduleExportHtml,
  buildScheduleExportStyles,
  buildScheduleTitleText,
  getScheduleExportColumns
} from './mobile-dashboard-schedule-email';
import {
  buildMobileScheduleDisplayColumns,
  buildMobileScheduleExportColumns
} from './mobile-dashboard-schedules-data';

@Component({
  standalone: true,
  selector: 'app-mobile-dashboard',
  imports: [CommonModule, MaterialModule, MobileListTableComponent],
  templateUrl: './mobile-dashboard.component.html',
  styleUrl: './mobile-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDashboardComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  private formatterService = inject(FormatterService);
  private userService = inject(UserService);
  private emailHtmlService = inject(EmailHtmlService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private scheduleSnapshotService = inject(DashboardScheduleSnapshotService);

  override itemsToLoad$ = new BehaviorSubject<Set<string>>(
    new Set(['activeReservations', 'propertyMaintenanceList', 'cleaners', 'carpetUsers', 'inspectors'])
  );

  housekeepingById = new Map<string, string>();
  carpetById = new Map<string, string>();
  inspectorById = new Map<string, string>();
  scheduleDisplayRows: MaintenanceListDisplay[] = [];
  scheduleListRows: MobileListRow[] = [];
  scheduleListColumns: ColumnSet = buildMobileScheduleDisplayColumns();
  scheduleRowByKey = new Map<string, MaintenanceListDisplay>();
  scheduleDetailFields: MobileScheduleDetailField[] = [];
  selectedServiceProviderId = '';
  selectedScheduleRowKey: string | null = null;
  emailHtml: EmailHtmlResponse | null = null;
  isPreparingEmail = false;

  snapshot: MobileDashboardCalendarSnapshot = {
    isReady: false,
    arrivalRows: [],
    departureRows: [],
    maintenanceRows: [],
    scheduleCleaningRows: [],
    scheduleCleaningColumns: {},
    serviceProviderOptions: []
  };

  scheduleCalendarWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  scheduleCalendarMonths: MobileScheduleCalendarMonth[] = [];
  scheduledDayKeys = new Set<string>();
  arrivalDayKeys = new Set<string>();
  departureDayKeys = new Set<string>();
  scheduleDotTypeByDayKey = new Map<string, Set<MobileScheduleDotType>>();
  selectedScheduleCalendarDayKey: string | null = null;
  assigneeUserIdForScope: string | null = null;

  get showServiceProviderFilter(): boolean {
    return !this.assigneeUserIdForScope;
  }

  //#region Mobile-Dashboard
  override ngOnInit(): void {
    const currentUserId = this.authService.getUser()?.userId?.trim() ?? '';
    this.assigneeUserIdForScope = isServiceProvider(this.authService.getUser()?.userGroups)
      ? this.utilityService.normalizeIdOrNull(currentUserId)
      : null;
    if (this.assigneeUserIdForScope) {
      this.selectedServiceProviderId = this.assigneeUserIdForScope;
    }

    this.loadHousekeepingUsers();
    this.loadCarpetUsers();
    this.loadInspectorUsers();
    this.loadEmailHtml();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      if (items.size === 0) {
        this.recomputeScopedBackendData();
      }
      this.markViewForCheck();
    });
    super.ngOnInit();
    this.globalOfficeSubscription?.unsubscribe();
    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      this.resolveOfficeScope(officeId);
      if (this.itemsToLoad$.value.size === 0) {
        this.recomputeScopedBackendData();
      }
    });
    if (this.itemsToLoad$.value.size === 0) {
      this.recomputeScopedBackendData();
    }
    this.refreshScheduleCalendars();
  }

  recomputeScopedBackendData(): void {
    this.recomputeBackendData(this.getEffectiveServiceProviderScopeId());
  }

  getEffectiveServiceProviderScopeId(): string | null {
    if (this.assigneeUserIdForScope) {
      return this.assigneeUserIdForScope;
    }
    return this.utilityService.normalizeIdOrNull(this.selectedServiceProviderId);
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1)).subscribe({
      next: response => {
        this.emailHtml = this.mappingService.mapEmailHtml(response);
        this.markViewForCheck();
      },
      error: () => {
        this.emailHtml = null;
      }
    });
  }

  loadHousekeepingUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'cleaners'))
    ).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
        this.housekeepingById = new Map(
          this.housekeepingUsers.map(user => [
            this.utilityService.normalizeId(user.userId),
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
          ])
        );
      },
      error: () => {
        this.housekeepingUsers = [];
        this.housekeepingById = new Map<string, string>();
      }
    });
  }

  loadCarpetUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Vendor]).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'carpetUsers'))
    ).subscribe({
      next: (users: UserResponse[]) => {
        this.carpetUsers = users || [];
        this.carpetById = new Map(
          this.carpetUsers.map(user => [
            this.utilityService.normalizeId(user.userId),
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
          ])
        );
      },
      error: () => {
        this.carpetUsers = [];
        this.carpetById = new Map<string, string>();
      }
    });
  }

  loadInspectorUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspectors'))
    ).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
        this.inspectorById = new Map(
          this.inspectorUsers.map(user => [
            this.utilityService.normalizeId(user.userId),
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
          ])
        );
      },
      error: () => {
        this.inspectorUsers = [];
        this.inspectorById = new Map<string, string>();
      }
    });
  }

  protected override onAfterRecomputeBackendData(assigneeUserId: string | null): void {
    void assigneeUserId;
    this.syncCalendarSnapshot();
    this.refreshScheduleCalendars();
    this.rebuildScheduleDisplayRows();
    this.markViewForCheck();
  }

  get serviceProviderSelectOptions(): { value: string; label: string }[] {
    return [
      { value: '', label: 'All Service Providers' },
      ...this.snapshot.serviceProviderOptions.map(option => ({
        value: option.userId,
        label: option.label
      }))
    ];
  }

  buildScheduleSnapshotContext(): DashboardScheduleSnapshotContext {
    return {
      utilityService: this.utilityService,
      mixedMappingService: this.mixedMappingService,
      mappingService: this.mappingService,
      formatterService: this.formatterService,
      filteredPropertyMaintenanceList: this.filteredPropertyMaintenanceList,
      filteredReservationPropertyMaintenanceList: this.filteredReservationPropertyMaintenanceList,
      arrivalReservations: this.arrivalReservations,
      departureReservations: this.departureReservations,
      cleaningReservations: this.cleaningReservations,
      onlineProperties: this.onlineProperties,
      offlineProperties: this.offlineProperties,
      housekeepingUsers: this.housekeepingUsers,
      carpetUsers: this.carpetUsers,
      inspectorUsers: this.inspectorUsers,
      housekeepingById: this.housekeepingById,
      carpetById: this.carpetById,
      inspectorById: this.inspectorById,
      currentMonthStartAtMidnight: this.currentMonthStartAtMidnight,
      nextMonthEndAtMidnight: this.nextMonthEndAtMidnight,
      getMaintenanceForPropertyId: (propertyId, propertyIdAlt) =>
        this.getMaintenanceListResponseForPropertyId(propertyId, propertyIdAlt),
      getServiceProviders: () => this.getServiceProviders(),
      includeStatusInventory: !this.getEffectiveServiceProviderScopeId()
    };
  }

  syncCalendarSnapshot(): void {
    try {
      this.applyCalendarSnapshot();
    } catch (error) {
      console.error('[MobileDashboardTrace] syncCalendarSnapshot failed', error);
      this.snapshot = {
        ...this.snapshot,
        isReady: true,
        scheduleCleaningRows: [],
        serviceProviderOptions: []
      };
    }
  }

  private applyCalendarSnapshot(): void {
    const maintenanceRows = buildMobileCalendarMaintenanceRows({
      arrivalReservations: this.arrivalReservations,
      departureReservations: this.departureReservations,
      cleaningReservations: this.cleaningReservations,
      onlineProperties: this.onlineProperties,
      offlineProperties: this.offlineProperties,
      filteredPropertyMaintenanceList: this.filteredPropertyMaintenanceList,
      filteredReservationPropertyMaintenanceList: this.filteredReservationPropertyMaintenanceList,
      includeStatusInventory: !this.getEffectiveServiceProviderScopeId(),
      context: {
        mixedMappingService: this.mixedMappingService,
        utilityService: this.utilityService,
        formatterService: this.formatterService,
        getMaintenanceForPropertyId: (propertyId, propertyIdAlt) =>
          this.getMaintenanceListResponseForPropertyId(propertyId, propertyIdAlt)
      }
    });

    const maintenanceFallbackRows: DashboardScheduleMaintenanceFallbackRow[] = maintenanceRows.map(row => ({
      propertyCode: row.propertyCode,
      propertyId: row.propertyId,
      reservationId: row.reservationId,
      cleaningDate: row.cleaningDate,
      carpetDate: row.carpetDate,
      inspectingDate: row.inspectingDate,
      eventType: row.eventType
    }));

    const scheduleSnapshot = this.scheduleSnapshotService.buildSnapshot(
      this.buildScheduleSnapshotContext(),
      maintenanceFallbackRows
    );
    let scheduleCleaningRows = scheduleSnapshot.scheduleCleaningRows;

    const scopeId = this.getEffectiveServiceProviderScopeId();
    if (scopeId) {
      scheduleCleaningRows = scheduleCleaningRows.filter(
        row => this.utilityService.normalizeId(row.cleanerUserId) === scopeId
      );
      if (this.assigneeUserIdForScope) {
        this.selectedServiceProviderId = this.assigneeUserIdForScope;
      }
    }

    this.snapshot = {
      isReady: true,
      arrivalRows: [...this.arrivalReservations]
        .sort((a, b) => (a.arrivalDateOrdinal ?? 0) - (b.arrivalDateOrdinal ?? 0))
        .map(row => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(row)),
      departureRows: [...this.departureReservations]
        .sort((a, b) => (a.departureDateOrdinal ?? 0) - (b.departureDateOrdinal ?? 0))
        .map(row => this.mixedMappingService.mapReservationPropertyMaintenanceToTurnoverDisplay(row)),
      maintenanceRows,
      scheduleCleaningRows,
      scheduleCleaningColumns: scheduleSnapshot.scheduleCleaningColumns,
      serviceProviderOptions: scheduleSnapshot.serviceProviderOptions
    };
  }

  getFilteredScheduleSourceRows(): MaintenanceListDisplay[] {
    const providerId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    if (!providerId) {
      return this.snapshot.scheduleCleaningRows;
    }
    return this.snapshot.scheduleCleaningRows.filter(
      row => this.utilityService.normalizeId(row.cleanerUserId) === providerId
    );
  }

  rebuildScheduleDisplayRows(): void {
    const selectedDate = this.selectedScheduleCalendarDayKey;
    const source = this.getFilteredScheduleSourceRows();

    if (
      this.selectedScheduleRowKey
      && !source.some(row => getScheduleRowKey(row) === this.selectedScheduleRowKey)
    ) {
      this.clearSelectedScheduleRow();
    }

    this.scheduleDisplayRows = source.map(row => {
      const sortDate = String((row as MaintenanceListDisplay & { scheduleSortDate?: string }).scheduleSortDate || '').trim();
      const rowDateKey = this.toDayKey(sortDate);
      const rowKey = getScheduleRowKey(row);
      const rowActive = this.selectedScheduleRowKey
        ? rowKey === this.selectedScheduleRowKey
        : !!selectedDate && rowDateKey === selectedDate;
      return {
        ...row,
        rowActive
      };
    });
    this.rebuildScheduleListRows();
  }

  rebuildScheduleListRows(): void {
    this.scheduleRowByKey = new Map(
      this.scheduleDisplayRows.map(row => [getScheduleRowKey(row), row] as const)
    );
    this.scheduleListRows = this.scheduleDisplayRows.map(row => {
      const rowKey = getScheduleRowKey(row);
      const extended = row as MaintenanceListDisplay & {
        scheduleSortDate?: string;
        serviceDate?: { text?: string | null } | string | null;
      };
      const serviceDate = getScheduleDateCellDisplay(extended.serviceDate)
        || String(extended.scheduleSortDate ?? '').trim();
      return {
        id: rowKey,
        propertyCode: String(row.propertyCode ?? '').trim(),
        serviceDate
      };
    });
  }

  onServiceProviderChange(userId: string): void {
    if (this.assigneeUserIdForScope) {
      return;
    }
    this.selectedServiceProviderId = userId;
    this.clearSelectedScheduleRow();
    this.recomputeBackendData(this.utilityService.normalizeIdOrNull(userId));
  }

  mapScheduleServiceKindToDotType(
    serviceKind: 'cleaning' | 'carpet' | 'inspecting' | 'maid' | undefined
  ): MobileScheduleDotType {
    switch (serviceKind) {
      case 'carpet':
        return 'green';
      case 'inspecting':
        return 'purple';
      case 'maid':
        return 'pink';
      default:
        return 'blue';
    }
  }

  onMobileScheduleRowClick(row: MobileListRow): void {
    const backingRow = this.scheduleRowByKey.get(row.id);
    if (!backingRow) {
      return;
    }
    this.onScheduleRowClick(backingRow);
  }

  onScheduleRowClick(row: MaintenanceListDisplay): void {
    const rowKey = getScheduleRowKey(row);
    this.selectedScheduleRowKey = rowKey;
    this.scheduleDetailFields = buildScheduleDetailFields(row, buildMobileScheduleExportColumns());
    this.markViewForCheck();
  }

  get selectedScheduleDetailTitle(): string {
    if (!this.selectedScheduleRowKey) {
      return 'Schedule';
    }
    const row = this.scheduleRowByKey.get(this.selectedScheduleRowKey);
    return String(row?.propertyCode ?? '').trim() || 'Schedule';
  }

  backFromScheduleDetail(): void {
    this.clearSelectedScheduleRow();
    this.rebuildScheduleDisplayRows();
    this.markViewForCheck();
  }

  clearSelectedScheduleRow(): void {
    this.selectedScheduleRowKey = null;
    this.scheduleDetailFields = [];
  }

  getSelectedServiceProviderLabel(): string {
    const selectedId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    if (!selectedId) {
      return 'All Service Providers';
    }
    const match = this.serviceProviderSelectOptions.find(option => option.value === selectedId);
    return match?.label || 'Selected Service Provider';
  }

  resolveScheduleExportOfficeId(): number | null {
    return this.selectedOffice?.officeId
      ?? this.scheduleDisplayRows.find(row => row.officeId != null)?.officeId
      ?? null;
  }

  resolveScheduleExportOfficeName(officeId: number): string {
    const office = this.offices.find(item => item.officeId === officeId);
    return office?.name || office?.officeCode || `Office ${officeId}`;
  }

  emailSchedule(): void {
    if (this.scheduleDisplayRows.length === 0) {
      this.toastr.warning('No schedule rows to email.', CommonMessage.Error);
      return;
    }

    const providerId = this.assigneeUserIdForScope
      ?? this.utilityService.normalizeId(this.selectedServiceProviderId);
    if (!providerId) {
      this.toastr.warning('Select a service provider before emailing the schedule.', CommonMessage.Error);
      return;
    }

    const scheduleSubject = (this.emailHtml?.scheduleSubject || '').trim();
    const scheduleBody = (this.emailHtml?.schedules || '').trim();
    if (!scheduleSubject || !scheduleBody) {
      this.toastr.warning('Schedule email template is not available.', CommonMessage.Error);
      return;
    }

    const organizationId = (this.authService.getUser()?.organizationId || '').trim();
    const selectedOfficeId = this.resolveScheduleExportOfficeId();
    if (!organizationId || selectedOfficeId == null) {
      this.toastr.warning('Organization or office is not available.', CommonMessage.Error);
      return;
    }

    const currentUser = this.authService.getUser();
    const fromEmail = (currentUser?.email || '').trim();
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const fromPhone = this.formatterService.phoneNumber(currentUser?.phone || '') || '';
    if (!fromEmail || !fromName) {
      this.toastr.warning('Current user email sender information is not available.', CommonMessage.Error);
      return;
    }

    this.isPreparingEmail = true;
    this.markViewForCheck();

    this.userService.getUserByGuid(providerId).pipe(
      take(1),
      map(user => ({
        email: (user.email || '').trim(),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || this.getSelectedServiceProviderLabel()
      })),
      finalize(() => {
        this.isPreparingEmail = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: recipient => {
        if (!recipient.email) {
          this.toastr.warning('Service provider user email is not available.', CommonMessage.Error);
          return;
        }

        const providerLabel = this.getSelectedServiceProviderLabel();
        const dateLabel = this.formatterService.formatDateString(this.utilityService.todayAsCalendarDateString()) || '';
        const titleText = buildScheduleTitleText(scheduleSubject, providerLabel);
        const exportColumns = getScheduleExportColumns(buildMobileScheduleExportColumns(), !!providerId);
        const previewHtml = buildScheduleExportHtml(
          this.scheduleDisplayRows,
          exportColumns,
          titleText,
          dateLabel
        );
        const emailConfig: EmailConfig = {
          subject: buildScheduleEmailSubject(titleText, dateLabel),
          toEmail: recipient.email,
          toName: recipient.name,
          fromEmail,
          fromName,
          documentType: DocumentType.Other,
          emailType: EmailType.Schedules,
          plainTextContent: '',
          htmlContent: buildScheduleEmailBody(scheduleBody, fromName, fromEmail, fromPhone, recipient.name),
          fileDetails: {
            fileName: buildScheduleExportFileName(providerLabel, this.utilityService.todayAsCalendarDateString() || 'export'),
            contentType: 'application/pdf',
            file: ''
          },
          errorMessage: 'Error sending schedule email. Please try again.'
        };
        const documentConfig: DocumentConfig = {
          previewIframeHtml: previewHtml,
          previewIframeStyles: buildScheduleExportStyles(),
          printStyleOptions: { landscape: true },
          organizationId,
          selectedOfficeId,
          selectedOfficeName: this.resolveScheduleExportOfficeName(selectedOfficeId),
          isDownloading: false
        };

        this.emailCreateDraftService.setDraft({
          emailConfig,
          documentConfig,
          returnUrl: this.router.url
        });
        void this.router.navigateByUrl(RouterUrl.MobileEmailCreate);
      },
      error: () => {
        this.toastr.error('Unable to load service provider user.', CommonMessage.Error);
      }
    });
  }

  refreshScheduleCalendars(): void {
    const keys = new Set<string>();
    const dotTypeByDayKey = new Map<string, Set<MobileScheduleDotType>>();

    for (const row of this.snapshot.maintenanceRows) {
      for (const dayEntry of this.getScheduleDayEntriesForRow(row)) {
        keys.add(dayEntry.dayKey);
        this.assignScheduleDotType(dotTypeByDayKey, dayEntry.dayKey, dayEntry.type);
      }
    }

    this.arrivalDayKeys = this.buildTurnoverDayKeys(
      this.snapshot.arrivalRows.map(row => row.arrivalDateDisplay)
    );
    this.departureDayKeys = this.buildTurnoverDayKeys(
      this.snapshot.departureRows.map(row => row.departureDateDisplay)
    );

    for (const dayKey of this.arrivalDayKeys) {
      keys.add(dayKey);
    }
    for (const dayKey of this.departureDayKeys) {
      keys.add(dayKey);
    }

    this.scheduledDayKeys = keys;
    this.scheduleDotTypeByDayKey = dotTypeByDayKey;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const titleFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    this.scheduleCalendarMonths = [0, 1].map(offset => {
      const anchor = new Date(year, month + offset, 1);
      return {
        title: titleFmt.format(anchor),
        cells: this.buildScheduleCalendarMonthCells(anchor)
      };
    });

    if (this.selectedScheduleCalendarDayKey) {
      this.applySelectedDay(this.selectedScheduleCalendarDayKey);
    } else {
      this.selectToday();
    }
  }

  buildTurnoverDayKeys(displayDates: Array<string | null | undefined>): Set<string> {
    const keys = new Set<string>();
    for (const displayDate of displayDates) {
      const dayKey = this.toDayKey(displayDate);
      if (dayKey) {
        keys.add(dayKey);
      }
    }
    return keys;
  }

  buildScheduleCalendarMonthCells(monthAnchor: Date): MobileScheduleCalendarMonth['cells'] {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const monthLastDay = new Date(year, month + 1, 0).getDate();
    const startPadding = firstDay.getDay();
    const todayKey = this.utilityService.formatDateOnlyForApi(new Date());
    const cells: MobileScheduleCalendarMonth['cells'] = [];

    const pushCell = (day: number | null, dateKey: string | null): void => {
      const weekDayColumn = cells.length % 7;
      cells.push({
        day,
        dateKey,
        isToday: !!dateKey && dateKey === todayKey,
        isWeekend: weekDayColumn === 0 || weekDayColumn === 6
      });
    };

    for (let i = 0; i < startPadding; i++) {
      pushCell(null, null);
    }
    for (let day = 1; day <= monthLastDay; day++) {
      const date = new Date(year, month, day);
      pushCell(day, this.utilityService.formatDateOnlyForApi(date));
    }
    while (cells.length % 7 !== 0) {
      pushCell(null, null);
    }
    return cells;
  }

  getScheduleDayEntriesForRow(row: MobileCalendarMaintenanceRow): { dayKey: string; type: MobileScheduleDotType }[] {
    const candidates: { value: string | null | undefined; type: MobileScheduleDotType }[] = [
      { value: row.cleaningDate, type: row.eventType === ServiceType.MaidService ? 'pink' : 'blue' },
      { value: row.carpetDate, type: 'green' },
      { value: row.inspectingDate, type: 'purple' }
    ];
    const entries = new Map<string, MobileScheduleDotType>();
    for (const candidate of candidates) {
      const dayKey = this.toDayKey(candidate.value);
      if (dayKey) {
        entries.set(dayKey, candidate.type);
      }
    }
    return Array.from(entries.entries()).map(([dayKey, type]) => ({ dayKey, type }));
  }

  assignScheduleDotType(
    dotTypeByDayKey: Map<string, Set<MobileScheduleDotType>>,
    dayKey: string,
    type: MobileScheduleDotType
  ): void {
    const existing = dotTypeByDayKey.get(dayKey);
    if (!existing) {
      dotTypeByDayKey.set(dayKey, new Set([type]));
      return;
    }
    existing.add(type);
  }

  isArrivalDay(dateKey: string | null): boolean {
    return !!dateKey && this.arrivalDayKeys.has(dateKey);
  }

  isDepartureDay(dateKey: string | null): boolean {
    return !!dateKey && this.departureDayKeys.has(dateKey);
  }

  hasScheduleDot(dateKey: string | null): boolean {
    if (!dateKey) {
      return false;
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    return !!types && types.size > 0;
  }

  getScheduleDotClass(dateKey: string | null): string {
    if (!dateKey) {
      return 'dot-blue';
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    if (!types || types.size === 0) {
      return 'dot-blue';
    }
    if (types.size === 1) {
      return `dot-${Array.from(types)[0]}`;
    }
    return 'dot-mixed';
  }

  getScheduleDotStyle(dateKey: string | null): Record<string, string> | null {
    if (!dateKey) {
      return null;
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    if (!types || types.size <= 1) {
      return null;
    }
    const colorByType: Record<MobileScheduleDotType, string> = {
      green: '#22c55e',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      pink: '#ec4899'
    };
    const orderedTypes: MobileScheduleDotType[] = ['green', 'blue', 'purple', 'pink'];
    const activeColors = orderedTypes.filter(type => types.has(type)).map(type => colorByType[type]);
    if (activeColors.length <= 1) {
      return null;
    }
    const slice = 360 / activeColors.length;
    const gradientStops = activeColors.map((color, index) => {
      const start = Math.round(index * slice);
      const end = Math.round((index + 1) * slice);
      return `${color} ${start}deg ${end}deg`;
    });
    return {
      background: `conic-gradient(from 210deg, ${gradientStops.join(', ')})`,
      boxShadow: '0 1px 2px rgba(30, 41, 59, 0.35)'
    };
  }

  onScheduleCalendarDayClick(dateKey: string | null): void {
    if (!dateKey) {
      return;
    }
    this.clearSelectedScheduleRow();
    this.applySelectedDay(dateKey);
    this.rebuildScheduleDisplayRows();
    this.markViewForCheck();
  }

  selectToday(): void {
    const todayKey = this.utilityService.formatDateOnlyForApi(new Date());
    if (todayKey) {
      this.applySelectedDay(todayKey);
    }
  }

  applySelectedDay(dateKey: string): void {
    this.selectedScheduleCalendarDayKey = dateKey;
  }

  toDayKey(value: string | null | undefined): string | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(String(value));
    if (!parsed) {
      return null;
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
  }

  goToProperty(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  goToReservation(event: { reservationId?: string | null; propertyId?: string | null }): void {
    const reservationId = (event?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }
    const queryParams: Record<string, string> = { returnUrl: this.router.url };
    const propertyId = (event?.propertyId || '').trim();
    if (propertyId) {
      queryParams['propertyId'] = propertyId;
    }
    void this.router.navigate([RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])], { queryParams });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion
}
