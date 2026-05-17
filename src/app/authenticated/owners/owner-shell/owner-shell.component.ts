import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, combineLatest, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { EntityType } from '../../contacts/models/contact-enum';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { OwnerInformationComponent } from '../owner-information/owner-information.component';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { AgreementFormComponent } from '../agreement-form/agreement-form.component';
import { FinancialPreferencesComponent } from '../financial-preferences/financial-preferences.component';
import { InsuranceComponent } from '../insurance/insurance.component';
import { ComplianceComponent } from '../compliance/compliance.component';
import { OwnersListComponent } from '../owners-list/owners-list.component';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyService } from '../../properties/services/property.service';

@Component({
  standalone: true,
  selector: 'app-owner-shell',
  imports: [
    CommonModule,
    MaterialModule,
    TitleBarSelectComponent,
    OwnerInformationComponent,
    PropertyInformationComponent,
    AgreementFormComponent,
    FinancialPreferencesComponent,
    InsuranceComponent,
    ComplianceComponent,
    OwnersListComponent
  ],
  templateUrl: './owner-shell.component.html',
  styleUrl: './owner-shell.component.scss'
})
export class OwnerShellComponent implements OnInit, OnDestroy {
  readonly newPropertyOptionValue = 'new';
  isOwnerListMode = false;
  isPageReady = false;
  selectedTabIndex = 0;
  selectedOfficeId: number | null = null;
  selectedPropertyId = this.newPropertyOptionValue;
  propertyCodeOptions: SearchableSelectOption[] = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  token = '';
  leadOwnerId: number | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  destroy$ = new Subject<void>();
  ownerEntityTypeId = EntityType.Owner;
  offices: OfficeResponse[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private officeService: OfficeService,
    private navigationContextService: NavigationContextService,
    private utilityService: UtilityService,
    private contactService: ContactService,
    private propertyService: PropertyService
  ) {}

  //#region Owner-Shell
  ngOnInit(): void {
    this.navigationContextService.setIsInOwnerMode(true);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.selectedTabIndex = 0;
    this.loadOffices();

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntil(this.destroy$)).subscribe(([paramMap, queryParamMap]) => {
      const token = String(paramMap.get('token') || '').trim();
      const leadOwnerId = Number(String(queryParamMap.get('leadOwnerId') || '').trim());
      this.syncOwnerShellFromRoute(token, leadOwnerId);
    });
  }

  syncOwnerShellFromRoute(token: string, leadOwnerId: number): void {
    this.token = token;
    const isUnauthorizedViewMode = this.isPublicOwnerTokenContext(token);
    this.navigationContextService.setIsInUnauthorizedViewMode(isUnauthorizedViewMode);
    this.navigationContextService.setIsInOwnerMode(!isUnauthorizedViewMode);
    this.leadOwnerId = null;
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];

    if (token) {
      this.isOwnerListMode = false;
      return;
    }

    if (Number.isFinite(leadOwnerId) && leadOwnerId > 0) {
      this.isOwnerListMode = false;
      this.leadOwnerId = leadOwnerId;
      if (this.selectedTabIndex === 1) {
        this.loadPropertyCodeOptions();
      }
      return;
    }

    this.isOwnerListMode = true;
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  onOfficeDropdownChange(value: string | number | null): void {
    if (value == null || value === '') {
      this.selectedOfficeId = null;
      if (this.selectedTabIndex === 1 && !this.isOwnerListMode) {
        this.loadPropertyCodeOptions();
      }
      return;
    }
    this.selectedOfficeId = Number(value);
    if (this.selectedTabIndex === 1 && !this.isOwnerListMode) {
      this.loadPropertyCodeOptions();
    }
  }

  onPropertyCodeDropdownChange(value: string | number | null): void {
    const selected = String(value ?? '').trim();
    this.selectedPropertyId = selected || this.newPropertyOptionValue;
  }

  onTabIndexChange(nextIndex: number): void {
    this.selectedTabIndex = nextIndex;
    if (nextIndex === 1 && !this.isOwnerListMode) {
      this.loadPropertyCodeOptions();
    }
  }

  //#endregion

  //#region Load Data Methods
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    })).subscribe({
      next: (allOffices) => {
        this.offices = allOffices || [];
        const defaultOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
        if (defaultOfficeId != null && this.offices.some(office => office.officeId === defaultOfficeId)) {
          this.selectedOfficeId = defaultOfficeId;
          return;
        }
        this.selectedOfficeId = this.offices.length === 1 ? this.offices[0].officeId : null;
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadPropertyCodeOptions(): void {
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
    const ownerLeadId = Number(this.leadOwnerId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      return;
    }

    this.contactService.getContacts().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: contacts => {
        const ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        );
        const ownerContactId = String(ownerContact?.contactId || '').trim();
        if (!ownerContactId) {
          return;
        }

        this.propertyService.getPropertiesByOwner(ownerContactId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: properties => {
            const scopedOfficeId = Number(this.selectedOfficeId);
            const filtered = (properties || []).filter(property =>
              property.isActive &&
              String(property.propertyId || '').trim() !== '' &&
              (!Number.isFinite(scopedOfficeId) || scopedOfficeId <= 0 || Number(property.officeId) === scopedOfficeId)
            );
            const rows = filtered
              .sort((a, b) => String(a.propertyCode || '').localeCompare(String(b.propertyCode || '')))
              .map(property => ({
                value: String(property.propertyId),
                label: String(property.propertyCode || '').trim() || 'Unnamed Property'
              }));
            if (rows.length === 0) {
              this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
              this.selectedPropertyId = this.newPropertyOptionValue;
              return;
            }
            this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }, ...rows];
            this.selectedPropertyId = this.propertyCodeOptions[0]?.value as string;
          },
          error: () => {
            this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
            this.selectedPropertyId = this.newPropertyOptionValue;
          }
        });
      },
      error: () => {
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.selectedPropertyId = this.newPropertyOptionValue;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  isPublicOwnerTokenContext(token: string): boolean {
    const hasToken = String(token || '').trim().length > 0;
    return hasToken && !this.authService.getIsLoggedIn();
  }

  onBackToOwnerList(): void {
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    void this.router.navigateByUrl(RouterUrl.OwnerShell);
  }

  ngOnDestroy(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
