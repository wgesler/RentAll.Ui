import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { PropertyComponent } from '../property/property.component';
import { PropertyWelcomeLetterComponent } from '../property-welcome/property-welcome-letter.component';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
  standalone: true,
  selector: 'app-property-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TitlebarSelectComponent,
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
  @ViewChild('propertyInformationSection') propertyInformationSection?: PropertyInformationComponent;
  @ViewChild('propertyWelcomeLetterSection') propertyWelcomeLetterSection?: PropertyWelcomeLetterComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;

  selectedTabIndex = 0;
  listIsActiveFilter = true;
  isHandlingTabGuard = false;

  readonly DocumentType = DocumentType;
  readonly EmailType = EmailType;

  constructor(
    private route: ActivatedRoute,
    private router: Router
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

  //#region Header Methods
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

  get sharedOfficeName(): string {
    return this.propertySection?.sharedOfficeName ?? '';
  }

  get sharedPropertyCode(): string {
    return this.propertySection?.sharedPropertyCode ?? '';
  }

  get isHeaderOfficeEditable(): boolean {
    return !!this.propertySection?.isAdmin && this.selectedTabIndex <= 1;
  }

  get isHeaderPropertyCodeEditable(): boolean {
    return !!this.propertySection?.isAdmin && this.selectedTabIndex <= 1;
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.propertySection?.onOfficeDropdownChange(value);
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.propertySection?.onReservationDropdownChange(value);
    if (this.selectedTabIndex === 3) {
      this.propertyEmailList?.reload();
    }
    if (this.selectedTabIndex === 4) {
      this.propertyDocumentList?.reload();
    }
  }

  onPropertyCodeInput(event: Event): void {
    this.propertySection?.onCodeInput(event);
  }

  onPropertyCodeFocus(event: FocusEvent): void {
    this.propertySection?.onPropertyCodeFocus(event);
  }

  get selectedReservationId(): string | null {
    return this.propertySection?.sharedReservationId ?? null;
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

  get contextualIsActiveValue(): boolean {
    if (this.selectedTabIndex <= 2) {
      return !!this.propertySection?.form?.get('isActive')?.value;
    }
    return this.listIsActiveFilter;
  }

  onContextualIsActiveChange(checked: boolean): void {
    if (this.selectedTabIndex <= 2) {
      this.propertySection?.form?.patchValue({ isActive: checked });
      return;
    }

    this.listIsActiveFilter = checked;
    if (this.selectedTabIndex === 3) {
      this.propertyEmailList?.applyFilters();
    } else if (this.selectedTabIndex === 4) {
      this.propertyDocumentList?.applyFilters();
    }
  }

  get showContextualSave(): boolean {
    return this.selectedTabIndex <= 2;
  }

  get contextualSaveDisabled(): boolean {
    if (this.selectedTabIndex === 1) {
      return !this.propertyInformationSection || this.propertyInformationSection.isSubmitting || !this.propertyInformationSection.form?.valid;
    }
    if (this.selectedTabIndex === 2) {
      return !this.propertyWelcomeLetterSection || this.propertyWelcomeLetterSection.isSubmitting;
    }
    return !!this.propertySection?.isSubmitting || !this.propertySection?.form;
  }

  onContextualSave(): void {
    if (this.selectedTabIndex === 1) {
      this.propertyInformationSection?.savePropertyLetter();
      return;
    }
    if (this.selectedTabIndex === 2) {
      this.propertyWelcomeLetterSection?.saveWelcomeLetter();
      return;
    }
    this.propertySection?.saveProperty();
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
