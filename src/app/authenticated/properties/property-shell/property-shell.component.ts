import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, skip, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { PropertyTitleBarContext } from '../models/property-title-bar-context.model';
import { PropertyResponse } from '../models/property.model';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { PropertyDepartureLetterComponent } from '../property-departure/property-departure-letter.component';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { PropertyListingComponent } from '../property-listing/property-listing.component';
import { PropertyReservationHistoryComponent } from '../property-reservation-history/property-reservation-history.component';
import { PropertyComponent } from '../property/property.component';
import { PropertyWelcomeLetterComponent } from '../property-welcome/property-welcome-letter.component';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';

@Component({
  standalone: true,
  selector: 'app-property-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TitleBarSelectComponent,
    PropertyComponent,
    PropertyInformationComponent,
    PropertyListingComponent,
    PropertyReservationHistoryComponent,
    PropertyWelcomeLetterComponent,
    PropertyDepartureLetterComponent,
    EmailListComponent
  ],
  templateUrl: './property-shell.component.html',
  styleUrl: './property-shell.component.scss'
})
export class PropertyShellComponent implements OnInit, AfterViewInit, OnDestroy, CanComponentDeactivate {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private utilityService = inject(UtilityService);

  @ViewChild('propertySection') propertySection?: PropertyComponent;
  @ViewChild(PropertyWelcomeLetterComponent) propertyWelcomeLetter?: PropertyWelcomeLetterComponent;
  @ViewChild(PropertyDepartureLetterComponent) propertyDepartureLetter?: PropertyDepartureLetterComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;

  readonly welcomeLetterTabIndex = 2;
  readonly departureLetterTabIndex = 3;
  readonly listingTabIndex = 4;
  readonly historyTabIndex = 5;
  readonly emailTabIndex = 6;

  selectedTabIndex = 0;
  isHandlingTabGuard = false;
  isAddMode = false;
  routePropertyId: string | null = null;
  organizationId = '';
  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  private initialOfficeScopeApplied = false;

  titleBarPropertyOfficeId: number | null = null;
  titleBarReservationId: string | null = null;
  titleBarPropertyCode = '';
  propertyReservations: ReservationListResponse[] = [];
  shellReservationOptions: SearchableSelectOption[] = [];
  isAdminUser = false;
  destroy$ = new Subject<void>();

  //#region Property-Shell
  ngOnInit(): void {
    this.isAdminUser = this.authService.isAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        this.applyOfficeFromGlobal(officeId);
      });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const id = paramMap.get('id');
      const wasAddMode = this.isAddMode;
      const previousPropertyId = this.routePropertyId;
      this.isAddMode = id === 'new';
      this.routePropertyId = this.isAddMode ? null : id;
      if (this.isAddMode || id !== previousPropertyId) {
        this.propertyReservations = [];
        this.shellReservationOptions = [];
      }
      if (!this.isAddMode && this.routePropertyId) {
        this.loadShellReservations();
      }
      if (this.isAddMode && !wasAddMode && this.offices.length > 0) {
        queueMicrotask(() => this.initializeAddModeOfficeFromShell());
      }
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      if (queryParams['tab'] === 'email') {
        this.selectedTabIndex = this.emailTabIndex;
      } else if (queryParams['tab'] === 'reservation-history') {
        this.selectedTabIndex = this.historyTabIndex;
      } else if (queryParams['tab'] === 'listing') {
        this.selectedTabIndex = this.listingTabIndex;
      } else if (queryParams['tab'] === 'departure-letter') {
        this.selectedTabIndex = this.departureLetterTabIndex;
      } else if (queryParams['tab'] === 'welcome-letter') {
        this.selectedTabIndex = this.welcomeLetterTabIndex;
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.isAddMode) {
      queueMicrotask(() => this.initializeAddModeOfficeFromShell());
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

  //#region Getter Methods
  /** Add-mode shell office; null means All Offices until the user picks one. */
  get addModeOfficeId(): number | null {
    return this.titleBarPropertyOfficeId;
  }

  get displayOfficeId(): number | null {
    return this.titleBarPropertyOfficeId ?? this.propertySection?.sharedPropertyOfficeId ?? null;
  }

  get isHeaderPropertyCodeEditable(): boolean {
    if (this.selectedTabIndex !== 0) {
      return false;
    }

    const isAddOrCopyMode = this.propertySection?.isAddMode ?? this.isAddMode;
    if (isAddOrCopyMode) {
      return true;
    }

    return this.isAdminUser;
  }

  get showShellContextTitleBar(): boolean {
    return !!this.propertySection?.form
      || (this.selectedTabIndex !== 0 && !this.isAddMode && !!this.routePropertyId);
  }

  get shellPropertyId(): string | null {
    return this.isAddMode ? null : (this.propertySection?.propertyId ?? this.routePropertyId);
  }

  get shellReservations(): ReservationListResponse[] {
    return this.propertyReservations;
  }

  get shellProperty(): PropertyResponse | null {
    return this.propertySection?.property ?? null;
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get reservationOptions(): SearchableSelectOption[] {
    return this.shellReservationOptions;
  }

  get selectedReservationId(): string | null {
    return this.titleBarReservationId;
  }

  get sharedPropertyCode(): string | null {
    const shell = this.titleBarPropertyCode?.trim();
    if (shell) {
      return shell;
    }
    return this.propertySection?.sharedPropertyCode ?? null;
  }

  get emailTypeOptions(): SearchableSelectOption[] {
    return (this.propertyEmailList?.emailTypeOptions || []).map(option => ({
      value: option.value,
      label: option.label
    }));
  }

  get selectedEmailTypeId(): number | null {
    return this.propertyEmailList?.selectedEmailTypeId ?? null;
  }

  //#endregion

  //#region Top Bar Event Methods
  onTitleBarContextFromProperty(ctx: PropertyTitleBarContext): void {
    const previousReservationId = this.titleBarReservationId;
    const previousOfficeId = this.titleBarPropertyOfficeId;
    this.titleBarPropertyOfficeId = ctx.officeId;
    this.titleBarPropertyCode = ctx.propertyCode ?? '';
    if (previousOfficeId !== ctx.officeId) {
      this.titleBarReservationId = null;
      this.refreshShellReservationOptions();
    } else {
      this.titleBarReservationId = ctx.reservationId;
    }
    this.syncLetterTabToTitleBarReservation(previousReservationId, this.titleBarReservationId);
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.propertySection?.applyTitleBarPropertyOfficeSelection(value);
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.titleBarReservationId = this.normalizeTitleBarReservationId(value);
    this.propertySection?.applyTitleBarReservationSelection(value);
    if (this.selectedTabIndex === this.emailTabIndex) {
      this.propertyEmailList?.reload();
    }
  }

  onHeaderEmailTypeDropdownChange(value: string | number | null): void {
    if (!this.propertyEmailList) {
      return;
    }
    this.propertyEmailList.onEmailTypeDropdownChange(value);
  }

  onPropertyCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    input.value = upperValue;
    this.titleBarPropertyCode = upperValue;
    this.propertySection?.applyTitleBarPropertyCode(upperValue);
  }

  onPropertyCodeFocus(event: FocusEvent): void {
    this.propertySection?.onPropertyCodeFocus(event);
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.titleBarPropertyOfficeId,
      propertyId: this.isAddMode ? null : this.shellPropertyId,
      reservationId: this.titleBarReservationId ?? null,
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
  //#endregion

  //#region Top Bar Child Updates
  onChildTabReservationChange(reservationId: string | null): void {
    const normalizedId = this.normalizeTitleBarReservationId(reservationId);
    this.titleBarReservationId = normalizedId;
    this.propertySection?.applyTitleBarReservationSelection(reservationId);
  }

normalizeTitleBarReservationId(value: string | number | null | undefined): string | null {
    return value == null || value === '' ? null : String(value);
  }

syncLetterTabToTitleBarReservation(
    previousReservationId: string | null,
    nextReservationId: string | null
  ): void {
    if (previousReservationId === nextReservationId) {
      return;
    }
    if (this.selectedTabIndex === this.welcomeLetterTabIndex) {
      this.propertyWelcomeLetter?.onTitleBarReservationIdUpdate(nextReservationId);
      return;
    }
    if (this.selectedTabIndex === this.departureLetterTabIndex) {
      this.propertyDepartureLetter?.onTitleBarReservationIdUpdate(nextReservationId);
    }
  }

  onChildTabOfficeChange(officeId: number | null): void {
    this.propertySection?.applyTitleBarPropertyOfficeSelection(officeId);
  }
  //#endregion

  //#region Reservation Loading Methods
  loadShellReservations(): void {
    if (this.isAddMode || !this.routePropertyId) {
      this.propertyReservations = [];
      this.shellReservationOptions = [];
      return;
    }

    this.reservationService.getReservationsByPropertyId(this.routePropertyId).pipe(take(1)).subscribe({
      next: (reservations) => {
        this.propertyReservations = reservations || [];
        this.refreshShellReservationOptions();
      },
      error: () => {
        this.propertyReservations = [];
        this.shellReservationOptions = [];
      }
    });
  }

  refreshShellReservationOptions(): void {
    const officeId = this.titleBarPropertyOfficeId;
    const filtered = officeId == null
      ? this.propertyReservations
      : this.propertyReservations.filter(r => Number(r.officeId) === officeId);

    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(take(1)).subscribe(contacts => {
          this.shellReservationOptions = filtered.map(r => ({
            value: r.reservationId,
            label: this.utilityService.getReservationDropdownLabel(r, (contacts || []).find(c => c.contactId === r.contactId) ?? null)
          }));
        });
      },
      error: () => {
        this.shellReservationOptions = filtered.map(r => ({
          value: r.reservationId,
          label: this.utilityService.getReservationDropdownLabel(r, null)
        }));
      }
    });
  }
  //#endregion

  //#region Office scope
loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(
            o => o.organizationId === this.organizationId && o.isActive
          );
          this.showOfficeDropdown = this.offices.length > 1;

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.isAddMode) {
              this.initializeAddModeOfficeFromShell();
            }
          }
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
      }
    });
  }

  /** Add-mode shell office from query param or global; does not write global. */
  initializeAddModeOfficeFromShell(): void {
    if (!this.isAddMode || this.offices.length === 0) {
      return;
    }

    let initialOfficeId: number | null = null;
    const queryOfficeId = this.route.snapshot.queryParamMap.get('officeId');
    if (queryOfficeId) {
      const parsed = Number(queryOfficeId);
      if (!Number.isNaN(parsed) && this.offices.some(office => office.officeId === parsed)) {
        initialOfficeId = parsed;
      }
    } else {
      const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      if (globalOfficeId != null && this.offices.some(office => office.officeId === globalOfficeId)) {
        initialOfficeId = globalOfficeId;
      }
    }

    if (this.offices.length === 1) {
      initialOfficeId = this.offices[0].officeId;
    }

    this.titleBarPropertyOfficeId = initialOfficeId;
    this.propertySection?.initializeOfficeFromShell(initialOfficeId);
  }

applyOfficeFromGlobal(officeId: number | null): void {
    if (!this.isAddMode || this.offices.length === 0) {
      return;
    }
    const resolved = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.titleBarPropertyOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
    this.titleBarPropertyOfficeId = resolved;
    this.propertySection?.applyTitleBarPropertyOfficeSelection(resolved);
  }
  //#endregion

  //#region Tab Methods
  async onTabIndexChange(nextIndex: number): Promise<void> {
    if (this.isHandlingTabGuard || nextIndex === this.selectedTabIndex) {
      return;
    }

    this.isHandlingTabGuard = true;
    const previousTabIndex = this.selectedTabIndex;

    try {
      if (previousTabIndex === 0 && nextIndex !== 0 && this.propertySection) {
        const canLeave = await this.propertySection.confirmNavigationWithUnsavedChanges();
        if (!canLeave) {
          return;
        }
      }

      this.selectedTabIndex = nextIndex;
      this.routeTabQueryParam(nextIndex);
      if (nextIndex === this.emailTabIndex) {
        queueMicrotask(() => this.propertyEmailList?.reload());
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }

  routeTabQueryParam(tabIndex: number): void {
    let tab: string | null = null;
    if (tabIndex === this.welcomeLetterTabIndex) {
      tab = 'welcome-letter';
    } else if (tabIndex === this.departureLetterTabIndex) {
      tab = 'departure-letter';
    } else if (tabIndex === this.listingTabIndex) {
      tab = 'listing';
    } else if (tabIndex === this.historyTabIndex) {
      tab = 'reservation-history';
    } else if (tabIndex === this.emailTabIndex) {
      tab = 'email';
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Navigation Methods
  async back(): Promise<void> {
    if (this.selectedTabIndex === 0) {
      const canLeave = await (this.propertySection?.confirmNavigationWithUnsavedChanges() ?? Promise.resolve(true));
      if (!canLeave) {
        return;
      }
    }

    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo === 'reservation-board') {
      this.router.navigateByUrl(RouterUrl.ReservationBoard);
      return;
    }
    if (returnTo === 'maintenance-list') {
      this.router.navigateByUrl(RouterUrl.MaintenanceList);
      return;
    }
    this.router.navigateByUrl(RouterUrl.PropertyList);
  }

  canDeactivate(): Promise<boolean> | boolean {
    if (this.selectedTabIndex !== 0) {
      return true;
    }
    return this.propertySection?.canDeactivate() ?? true;
  }
  //#endregion
}
