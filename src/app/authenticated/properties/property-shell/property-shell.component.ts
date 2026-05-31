import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, skip, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { PropertyTitleBarContext } from '../models/property-title-bar-context.model';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { PropertyListingComponent } from '../property-listing/property-listing.component';
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
    PropertyWelcomeLetterComponent,
    EmailListComponent,
    DocumentListComponent
  ],
  templateUrl: './property-shell.component.html',
  styleUrl: './property-shell.component.scss'
})
export class PropertyShellComponent implements OnInit, AfterViewInit, OnDestroy, CanComponentDeactivate {
  readonly DocumentType = DocumentType;
  @ViewChild('propertySection') propertySection?: PropertyComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;

  selectedTabIndex = 0;
  isHandlingTabGuard = false;
  isAddMode = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  private initialOfficeScopeApplied = false;

  titleBarPropertyOfficeId: number | null = null;
  titleBarReservationId: string | null = null;
  titleBarPropertyCode = '';
  isAdminUser = false;
  destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private authService: AuthService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService
  ) {}

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
      this.isAddMode = !id || id === 'new';
      if (this.isAddMode && !wasAddMode && this.offices.length > 0) {
        queueMicrotask(() => this.initializeAddModeOfficeFromShell());
      }
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      if (queryParams['tab'] === 'documents') {
        this.selectedTabIndex = 5;
      } else if (queryParams['tab'] === 'email') {
        this.selectedTabIndex = 4;
      } else if (queryParams['tab'] === 'listing') {
        this.selectedTabIndex = 3;
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
    return this.isAdminUser && this.selectedTabIndex === 0;
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get reservationOptions(): SearchableSelectOption[] {
    const reservations = this.propertySection?.availableReservations ?? [];
    return reservations.map(r => ({
      value: r.value.reservationId,
      label: r.label
    }));
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
    this.titleBarPropertyOfficeId = ctx.officeId;
    this.titleBarReservationId = ctx.reservationId;
    this.titleBarPropertyCode = ctx.propertyCode ?? '';
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.propertySection?.applyTitleBarPropertyOfficeSelection(value);
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.propertySection?.applyTitleBarReservationSelection(value);
    if (this.selectedTabIndex === 4) {
      this.propertyEmailList?.reload();
    }
    if (this.selectedTabIndex === 5) {
      this.propertyDocumentList?.reload();
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
      propertyId: this.propertySection?.isAddMode ? null : (this.propertySection?.propertyId ?? null),
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
    this.propertySection?.applyTitleBarReservationSelection(reservationId);
  }

  onChildTabOfficeChange(officeId: number | null): void {
    this.propertySection?.applyTitleBarPropertyOfficeSelection(officeId);
  }
  //#endregion

  //#region Office scope
  private loadOffices(): void {
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

  private applyOfficeFromGlobal(officeId: number | null): void {
    if (!this.isAddMode || this.offices.length === 0) {
      return;
    }
    if (this.offices.length === 1) {
      this.titleBarPropertyOfficeId = this.offices[0].officeId;
      this.propertySection?.applyTitleBarPropertyOfficeSelection(this.offices[0].officeId);
      return;
    }
    const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
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
    this.selectedTabIndex = nextIndex;

    try {
      if (previousTabIndex === 0 && this.propertySection) {
        const canLeave = await this.propertySection.confirmNavigationWithUnsavedChanges();
        if (!canLeave) {
          this.selectedTabIndex = previousTabIndex;
          return;
        }
      }

      this.routeTabQueryParam(nextIndex);
      if (nextIndex === 2 && this.propertySection && !this.propertySection.isAddMode && this.propertySection.propertyId) {
        this.propertySection.loadReservations();
      }
      if (nextIndex === 4) {
        this.propertyEmailList?.reload();
      }
      if (nextIndex === 5) {
        this.propertyDocumentList?.reload();
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }

  routeTabQueryParam(tabIndex: number): void {
    let tab: string | null = null;
    if (tabIndex === 3) {
      tab = 'listing';
    } else if (tabIndex === 4) {
      tab = 'email';
    } else if (tabIndex === 5) {
      tab = 'documents';
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
    const canLeave = await (this.propertySection?.confirmNavigationWithUnsavedChanges() ?? Promise.resolve(true));
    if (!canLeave) {
      return;
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
    return this.propertySection?.canDeactivate() ?? true;
  }
  //#endregion
}
