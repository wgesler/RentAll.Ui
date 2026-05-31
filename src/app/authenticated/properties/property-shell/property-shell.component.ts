import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, skip, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
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
export class PropertyShellComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  readonly DocumentType = DocumentType;
  @ViewChild('propertySection') propertySection?: PropertyComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;

  selectedTabIndex = 0;
  isHandlingTabGuard = false;
  isAddMode = false;
  organizationId = '';
  /** Page-level office filter: seeded from global; does not write global. */
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
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
    private globalSelectionService: GlobalSelectionService,
    private utilityService: UtilityService
  ) {}

  //#region Property-Shell
  ngOnInit(): void {
    this.isAdminUser = this.authService.isAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    this.loadOffices();
    this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        this.applyOfficeFromGlobal(officeId);
      });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.isAddMode = !id || id === 'new';
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

  //#region Getter Methods
  get isHeaderPropertyOfficeEditable(): boolean {
    return this.selectedTabIndex === 0;
  }

  get isHeaderPropertyCodeEditable(): boolean {
    return this.isAdminUser && this.selectedTabIndex === 0;
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get propertyOfficeOptions(): SearchableSelectOption[] {
    return this.propertySection?.officeOptions ?? [];
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

  get sharedPropertyOfficeName(): string {
    const id = this.titleBarPropertyOfficeId;
    const offices = this.propertySection?.offices ?? [];
    if (id != null) {
      const o = offices.find(x => x.officeId === id);
      if (o?.name) {
        return o.name;
      }
    }
    return this.propertySection?.sharedPropertyOfficeName ?? '';
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

  async onOfficeDropdownChange(value: string | number | null): Promise<void> {
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    if (this.shouldRouteToPropertyListForPageOfficeMismatch(officeId)) {
      const canLeave = await (this.propertySection?.confirmNavigationWithUnsavedChanges() ?? Promise.resolve(true));
      if (canLeave) {
        this.router.navigateByUrl(RouterUrl.PropertyList);
      }
    }
  }

  onPropertyOfficeDropdownChange(value: string | number | null): void {
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

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(
                this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
              );
            }
          } else if (this.selectedOfficeId != null) {
            this.applyPageOfficeScope(this.selectedOfficeId);
          }
        });
      },
      error: () => {
        this.offices = [];
      }
    });
  }

  private applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 1) {
      this.applyPageOfficeScope(this.offices[0].officeId);
    } else if (this.offices.length > 1) {
      const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
      this.applyPageOfficeScope(resolved);
    } else {
      this.selectedOfficeId = officeId;
      this.selectedOffice = null;
    }
  }

  /** Title-bar office change on this page only (never updates global selection). */
  private applyPageOfficeScope(officeId: number | null): void {
    if (this.offices.length > 0) {
      this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
      this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
    } else {
      this.selectedOffice = null;
      this.selectedOfficeId = officeId;
    }
  }

  shouldRouteToPropertyListForPageOfficeMismatch(officeId: number | null): boolean {
    if (this.isAddMode) {
      return false;
    }
    const propertyOfficeId = this.propertySection?.sharedPropertyOfficeId ?? null;
    if (officeId == null || propertyOfficeId == null) {
      return false;
    }
    return officeId !== propertyOfficeId;
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
