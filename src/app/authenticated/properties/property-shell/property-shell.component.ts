import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { PropertyTitleBarContext } from '../models/property-title-bar-context.model';
import { PropertyInformationComponent } from '../property-information/property-information.component';
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
    PropertyWelcomeLetterComponent,
    EmailListComponent,
    DocumentListComponent
  ],
  templateUrl: './property-shell.component.html',
  styleUrl: './property-shell.component.scss'
})
export class PropertyShellComponent implements OnInit, CanComponentDeactivate {
  @ViewChild('propertySection') propertySection?: PropertyComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;

  selectedTabIndex = 0;
  isHandlingTabGuard = false;

  readonly DocumentType = DocumentType;
  readonly EmailType = EmailType;

  titleBarOfficeId: number | null = null;
  titleBarReservationId: string | null = null;
  titleBarPropertyCode = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) {}

  //#region Property-Shell
  ngOnInit(): void {
    this.route.queryParams.subscribe(queryParams => {
      if (queryParams['tab'] === 'documents') {
        this.selectedTabIndex = 4;
      } else if (queryParams['tab'] === 'email') {
        this.selectedTabIndex = 3;
      } else {
        this.selectedTabIndex = 0;
      }
    });
  }
  //#endregion

  //#region Getter Methods
  get isHeaderOfficeEditable(): boolean {
    return !!this.propertySection?.isAdmin && this.selectedTabIndex <= 1;
  }

  get isHeaderPropertyCodeEditable(): boolean {
    return !!this.propertySection?.isAdmin && this.selectedTabIndex <= 1;
  }

  get officeOptions(): SearchableSelectOption[] {
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

  get sharedOfficeName(): string {
    const id = this.titleBarOfficeId;
    const offices = this.propertySection?.offices ?? [];
    if (id != null) {
      const o = offices.find(x => x.officeId === id);
      if (o?.name) {
        return o.name;
      }
    }
    return this.propertySection?.property?.officeName ?? '';
  }

  get sharedPropertyCode(): string | null {
    const shell = this.titleBarPropertyCode?.trim();
    if (shell) {
      return shell;
    }
    return this.propertySection?.sharedPropertyCode ?? null;
  }
  //#endregion

  //#region Top Bar Event Methods
  onTitleBarContextFromProperty(ctx: PropertyTitleBarContext): void {
    this.titleBarOfficeId = ctx.officeId;
    this.titleBarReservationId = ctx.reservationId;
    this.titleBarPropertyCode = ctx.propertyCode ?? '';
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.propertySection?.applyTitleBarOfficeSelection(value);
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.propertySection?.applyTitleBarReservationSelection(value);
    if (this.selectedTabIndex === 3) {
      this.propertyEmailList?.reload();
    }
    if (this.selectedTabIndex === 4) {
      this.propertyDocumentList?.reload();
    }
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
      officeId: this.titleBarOfficeId,
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
    this.propertySection?.applyTitleBarOfficeSelection(officeId);
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
      if (nextIndex === 3) {
        this.propertyEmailList?.reload();
      }
      if (nextIndex === 4) {
        this.propertyDocumentList?.reload();
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }

  routeTabQueryParam(tabIndex: number): void {
    let tab: string | null = null;
    if (tabIndex === 3) {
      tab = 'email';
    } else if (tabIndex === 4) {
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
