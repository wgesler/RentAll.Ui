import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatTabGroup } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription, catchError, combineLatest, concatMap, defer, from, map, of, shareReplay, skip, switchMap, take, takeUntil, toArray } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { EntityType } from '../../contacts/models/contact-enum';
import { OfficeResponse } from '../../organizations/models/office.model';
import { PropertyListResponse } from '../../properties/models/property.model';
import { StateFormResponse } from '../../organizations/models/state-form.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { OwnerInformationComponent } from '../owner-information/owner-information.component';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { OwnersListComponent } from '../owners-list/owners-list.component';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { AuthService } from '../../../services/auth.service';
import { OwnerAgreementInformationComponent } from '../owner-agreement-information/owner-agreement-information.component';
import { OwnerAgreementFormComponent } from '../owner-agreement-form/owner-agreement-form.component';
import { SharedFormEditorComponent } from '../../shared/forms/form-editor/form-editor.component';
import { SharedFormCreateComponent } from '../../shared/forms/form-create/form-create.component';
import { OwnerAgreementContext, OwnersService } from '../services/owners.service';

@Component({
  standalone: true,
  selector: 'app-owner-shell',
  imports: [
    CommonModule,
    MaterialModule,
    TitleBarSelectComponent,
    OwnerInformationComponent,
    PropertyInformationComponent,
    OwnerAgreementInformationComponent,
    OwnerAgreementFormComponent,
    SharedFormEditorComponent,
    SharedFormCreateComponent,
    OwnersListComponent
  ],
  templateUrl: './owner-shell.component.html',
  styleUrl: './owner-shell.component.scss'
})
export class OwnerShellComponent implements OnInit, OnDestroy {
  readonly newPropertyOptionValue = 'new';
  readonly allStatesCode = 'XX';
  readonly ownerEntityTypeId = EntityType.Owner;

  isOwnerAdmin = false;
  isOwnerListMode = false;
  canAccessInformationTab = false;
  selectedTabIndex = 0;
  token = '';
  leadOwnerId: number | null = null;
  ownerAgreementContext$: Observable<OwnerAgreementContext> | null = null;
  destroy$ = new Subject<void>();

  selectedOfficeId: number | null = null;
  selectedOrganizationId: string | null = null;
  tokenPropertyOffice = '';
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  private initialOfficeScopeApplied = false;

  selectedPropertyId = this.newPropertyOptionValue;
  newPropertyCode = '';
  propertyCodeTitleBarShowError = false;
  propertyCodeOptions: SearchableSelectOption[] = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  propertyContextLoaded = false;
  selectedOwnerContactId: string | null = null;
  ownerLeadPropertyCode = '';
  ownerLeadPropertyAddress1 = '';
  ownerLeadPropertyCity = '';
  ownerLeadPropertyState = '';
  ownerLeadPropertyZip = '';

  currentPropertyStateCode = '';
  stateFormOrganizationId = '';
  stateFormsRequestId = 0;
  stateForms: StateFormResponse[] = [];
  dynamicFormViewState: Record<string, { isView: boolean; editedHtml: string | null }> = {};

  @ViewChild(MatTabGroup) ownerShellTabGroup?: MatTabGroup;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private navigationContextService: NavigationContextService,
    private ownersService: OwnersService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Owner-Shell
  ngOnInit(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.canAccessInformationTab = this.authService.isAdmin();
    this.selectedTabIndex = 0;
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    this.setupOfficeDropdownReactions();
    this.loadOffices();
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntil(this.destroy$)).subscribe(([paramMap, queryParamMap]) => {
      const token = String(paramMap.get('token') || '').trim();
      const leadOwnerId = Number(String(queryParamMap.get('leadOwnerId') || '').trim());
      const officeId = Number(String(queryParamMap.get('officeId') || '').trim());
      const propertyCode = String(queryParamMap.get('propertyCode') || '').trim();
      const propertyOffice = String(queryParamMap.get('propertyOffice') || '').trim();
      this.syncOwnerShellFromRoute(token, leadOwnerId, officeId, propertyCode, propertyOffice);
    });
  }

  syncOwnerShellFromRoute(token: string, leadOwnerId: number, officeId: number, propertyCode: string, propertyOffice: string): void {
    this.token = token;
    this.tokenPropertyOffice = String(propertyOffice || '').trim();
    this.loadOffices();
    const isUnauthorizedViewMode = this.isPublicOwnerTokenContext(token);
    this.canAccessInformationTab = this.authService.isAdmin() && !this.isOwnerLinkMode();
    this.navigationContextService.setIsInUnauthorizedViewMode(isUnauthorizedViewMode);
    this.navigationContextService.setIsInOwnerMode(isUnauthorizedViewMode);
    this.resetPropertyDropdownState();
    this.resetStateFormsContext();

    if (token) {
      this.isOwnerListMode = false;
      this.leadOwnerId = null;
      if (Number.isFinite(officeId) && officeId > 0) {
        this.applyPageOfficeScope(officeId);
      }
      this.selectedPropertyId = this.newPropertyOptionValue;
      this.newPropertyCode = String(propertyCode || '').trim().toUpperCase();
      this.refreshOwnerContactIdForContext();
      this.loadStateFormsForContext();
      this.rebuildOwnerAgreementContext();
      return;
    }

    if (Number.isFinite(leadOwnerId) && leadOwnerId > 0) {
      this.isOwnerListMode = false;
      this.selectedTabIndex = 0;
      this.leadOwnerId = leadOwnerId;
      if (Number.isFinite(officeId) && officeId > 0) {
        this.applyPageOfficeScope(officeId);
      }
      this.loadPropertyCodeOptions();
      this.refreshOwnerContactIdForContext();
      this.rebuildOwnerAgreementContext();
      return;
    }

    this.isOwnerListMode = true;
    this.leadOwnerId = null;
  }

  tabUsesPropertySelection(tabIndex: number): boolean {
    return tabIndex >= 1;
  }

  /** Mirrors reservation Lease tab: mount once office + property context exist; stays alive when switching tabs. */
  canMountOwnerAgreementTab(): boolean {
    if (this.selectedOfficeId == null) {
      return false;
    }
    if (this.isPublicOwnerTokenContext(this.token)) {
      return true;
    }
    return this.selectedPropertyId !== this.newPropertyOptionValue;
  }

  isPublicOwnerTokenContext(token: string): boolean {
    const hasToken = String(token || '').trim().length > 0;
    return hasToken && !this.authService.getIsLoggedIn();
  }

  isOwnerLinkMode(): boolean {
    return String(this.token || '').trim().length > 0;
  }

  onTabIndexChange(nextIndex: number): void {
    this.selectedTabIndex = nextIndex;
    if (this.tabUsesPropertySelection(nextIndex) && !this.isOwnerListMode && !this.propertyContextLoaded) {
      this.loadPropertyCodeOptions();
      this.refreshOwnerContactIdForContext();
    }
  }

  rebuildOwnerAgreementContext(): void {
    this.ownerAgreementContext$ = defer(() => {
      const token = String(this.token || '').trim() || null;
      const propertyId = this.selectedPropertyId === this.newPropertyOptionValue ? null : this.selectedPropertyId;
      return this.ownersService.getOwnerAgreementContextByContext(token, this.leadOwnerId, propertyId, this.selectedOfficeId);
    }).pipe(shareReplay(1));
  }

  onOwnerAgreementContextRefresh(): void {
    if (this.isOwnerListMode || !this.canMountOwnerAgreementTab()) {
      return;
    }
    this.rebuildOwnerAgreementContext();
  }
  //#endregion

  //#region Office Dropdown
  setupOfficeDropdownReactions(): void {
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.isOwnerLinkMode() || this.isPublicOwnerTokenContext(this.token)) {
        return;
      }
      this.applyOfficeFromGlobal(officeId);
    });
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get officeOptionsForDisplay(): SearchableSelectOption[] {
    const base = this.officeOptions;
    const selectedOfficeId = Number(this.selectedOfficeId);
    if (!this.isOwnerLinkMode() || !Number.isFinite(selectedOfficeId) || selectedOfficeId <= 0) {
      return base;
    }
    const hasSelected = base.some(option => Number(option.value) === selectedOfficeId);
    if (hasSelected) {
      return base;
    }
    const resolvedOfficeName = String(this.tokenPropertyOffice || '').trim()
      || String(this.offices.find(office => office.officeId === selectedOfficeId)?.name || '').trim()
      || 'Office';
    return [{ value: selectedOfficeId, label: resolvedOfficeName }, ...base];
  }

  get selectedOfficeLabel(): string {
    const selected = this.offices.find(office => office.officeId === this.selectedOfficeId);
    if (selected) {
      return String(selected.name || '').trim();
    }
    if (this.isPublicOwnerTokenContext(this.token)) {
      return this.tokenPropertyOffice || '';
    }
    return '';
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.propertyContextLoaded = false;
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
      this.loadPropertyCodeOptions();
    }
    this.rebuildOwnerAgreementContext();
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 1) {
      this.applyPageOfficeScope(this.offices[0].officeId);
    } else if (this.offices.length > 1) {
      const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
      this.applyPageOfficeScope(resolved);
    } else {
      this.applyPageOfficeScope(officeId);
    }
    if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
      this.propertyContextLoaded = false;
      this.loadPropertyCodeOptions();
    }
    this.rebuildOwnerAgreementContext();
  }

  applyPageOfficeScope(officeId: number | null): void {
    const numericValue = Number(officeId);
    this.selectedOfficeId = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  loadOffices(): void {
    const token = String(this.token || '').trim();
    if (token) {
      this.loadOfficeByOwnerContext(token);
      return;
    }
    this.loadOfficesForInternalUser();
  }

  loadOfficeByOwnerContext(token: string): void {
    combineLatest([
      this.ownersService.getOfficeListByContext(token, null).pipe(take(1), catchError(() => of([] as OfficeResponse[]))),
      this.ownersService.getOrganizationByContext(token).pipe(take(1), catchError(() => of(null)))
    ]).pipe(take(1)).subscribe({
      next: ([offices, organization]) => {
        const office = (offices || [])[0] || null;
        this.offices = office ? [office] : [];
        this.selectedOrganizationId = String(organization?.organizationId || office?.organizationId || '').trim() || null;
        const officeId = Number(office?.officeId);
        if (Number.isFinite(officeId) && officeId > 0) {
          this.applyPageOfficeScope(officeId);
        }
        const officeName = String(office?.name || '').trim();
        if (officeName) {
          this.tokenPropertyOffice = officeName;
        }
      },
      error: () => {
        this.offices = [];
        this.selectedOrganizationId = null;
        this.selectedOfficeId = null;
      }
    });
  }

  loadOfficesForInternalUser(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.selectedOrganizationId = null;
      return;
    }
    this.selectedOrganizationId = organizationId;
    this.officesSubscription?.unsubscribe();
    this.officesSubscription = this.ownersService.getOfficeListStreamByContext(null, organizationId).pipe(takeUntil(this.destroy$)).subscribe({
      next: offices => {
        this.offices = (offices || []).filter(o => o.isActive);
        if (!this.initialOfficeScopeApplied) {
          this.initialOfficeScopeApplied = true;
          if (this.offices.length === 1) {
            this.applyPageOfficeScope(this.offices[0].officeId);
          } else {
            this.applyOfficeFromGlobal(
              this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
            );
          }
        } else if (this.selectedOfficeId != null && this.offices.some(office => office.officeId === this.selectedOfficeId)) {
          return;
        } else if (this.selectedOfficeId != null) {
          this.applyPageOfficeScope(this.selectedOfficeId);
        }
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }
  //#endregion

  //#region Property Dropdown
  resetPropertyDropdownState(): void {
    this.propertyContextLoaded = false;
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
    this.ownerLeadPropertyAddress1 = '';
    this.ownerLeadPropertyCity = '';
    this.ownerLeadPropertyState = '';
    this.ownerLeadPropertyZip = '';
    this.selectedOwnerContactId = null;
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  }

  onPropertyCodeDropdownChange(value: string | number | null): void {
    const selected = String(value ?? '').trim();
    this.selectedPropertyId = selected || this.newPropertyOptionValue;
    if (this.selectedPropertyId !== this.newPropertyOptionValue) {
      this.newPropertyCode = '';
      this.propertyCodeTitleBarShowError = false;
      this.reloadStateFormsForSelectedProperty();
      return;
    }
    if (!this.newPropertyCode.trim() && this.ownerLeadPropertyCode.trim()) {
      this.newPropertyCode = this.ownerLeadPropertyCode;
    }
    if (this.newPropertyCode.trim()) {
      this.propertyCodeTitleBarShowError = false;
    }
    this.reloadStateFormsForSelectedProperty();
  }

  onNewPropertyCodeChange(value: string): void {
    this.newPropertyCode = String(value ?? '').toUpperCase();
    if (this.newPropertyCode.trim()) {
      this.propertyCodeTitleBarShowError = false;
    }
  }

  onTitleBarPropertyCodeInvalid(): void {
    this.propertyCodeTitleBarShowError = true;
  }

  refreshOwnerContactIdForContext(): void {
    const token = String(this.token || '').trim() || null;
    const ownerLeadId = Number(this.leadOwnerId);
    const resolvedLeadOwnerId = !token && Number.isFinite(ownerLeadId) && ownerLeadId > 0 ? ownerLeadId : null;
    if (!token && resolvedLeadOwnerId == null) {
      this.selectedOwnerContactId = null;
      return;
    }
    this.ownersService.getOwnerContactByContext(token, resolvedLeadOwnerId).pipe(take(1), catchError(() => of(null))).subscribe(ownerContact => {
      const ownerContactId = String(ownerContact?.contactId || '').trim();
      this.selectedOwnerContactId = ownerContactId || null;
    });
  }

  loadPropertyCodeOptions(): void {
    this.propertyContextLoaded = true;
    if (this.isOwnerLinkMode()) {
      const token = String(this.token || '').trim();
      if (!token) {
        this.selectedPropertyId = this.newPropertyOptionValue;
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.newPropertyCode = String(this.newPropertyCode || '').trim().toUpperCase();
        return;
      }

      this.ownersService.getPropertyByContext(token, null).pipe(take(1), catchError(() => of(null))).subscribe(property => {
        const propertyId = String(property?.propertyId || '').trim();
        const propertyCode = String(property?.propertyCode || '').trim().toUpperCase();
        if (propertyId) {
          this.propertyCodeOptions = [
            { value: this.newPropertyOptionValue, label: 'New Property' },
            { value: propertyId, label: propertyCode || 'Existing Property' }
          ];
          this.selectedPropertyId = propertyId;
          this.newPropertyCode = '';
          this.reloadStateFormsForSelectedProperty();
          return;
        }

        this.selectedPropertyId = this.newPropertyOptionValue;
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.newPropertyCode = String(this.newPropertyCode || '').trim().toUpperCase();
      });
      return;
    }

    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
    const ownerLeadId = Number(this.leadOwnerId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      return;
    }

    combineLatest([
      this.ownersService.getOwnerByContext(null, ownerLeadId).pipe(take(1), catchError(() => of(null))),
      this.ownersService.getOwnerContactByContext(null, ownerLeadId).pipe(take(1), catchError(() => of(null)))
    ]).pipe(
      take(1),
      switchMap(([ownerLead, ownerContact]) => {
        this.ownerLeadPropertyCode = String(ownerLead?.propertyCode || '').trim().toUpperCase();
        this.ownerLeadPropertyAddress1 = String(ownerLead?.address || '').trim();
        this.ownerLeadPropertyCity = String(ownerLead?.city || '').trim();
        this.ownerLeadPropertyState = String(ownerLead?.state || '').trim().toUpperCase();
        this.ownerLeadPropertyZip = String(ownerLead?.zip || '').trim();
        const ownerContactId = String(ownerContact?.contactId || '').trim();
        return this.ownersService.getOwnerPropertiesByContext(ownerContactId).pipe(take(1), catchError(() => of([] as PropertyListResponse[])));
      })
    ).subscribe({
      next: properties => this.applyOwnerPropertyOptions(properties || []),
      error: () => this.applyOwnerPropertyOptions([])
    });
  }

  applyOwnerPropertyOptions(properties: PropertyListResponse[]): void {
    const existingProperties = (properties || []).filter(property => String(property?.propertyId || '').trim());
    const propertyOptions: SearchableSelectOption[] = existingProperties.map(property => ({
      value: String(property.propertyId).trim(),
      label: String(property.propertyCode || '').trim().toUpperCase() || 'Property'
    }));

    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }, ...propertyOptions];

    if (propertyOptions.length > 0) {
      this.selectedPropertyId = String(propertyOptions[0].value);
      this.newPropertyCode = '';
      this.reloadStateFormsForSelectedProperty();
      return;
    }

    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = this.ownerLeadPropertyCode;
    this.reloadStateFormsForSelectedProperty();
  }
  //#endregion

  //#region State Forms
  resetStateFormsContext(): void {
    this.currentPropertyStateCode = '';
    this.stateFormOrganizationId = '';
    this.stateForms = [];
    this.dynamicFormViewState = {};
  }

  loadStateFormsForContext(): void {
    const token = String(this.token || '').trim();
    const ownerLeadId = Number(this.leadOwnerId);
    const contactContextToken = token || null;
    if (!token && (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0)) {
      this.resetStateFormsContext();
      return;
    }
    const internalOrganizationId = String(
      this.selectedOrganizationId || this.authService.getUser()?.organizationId || ''
    ).trim();
    combineLatest([
      this.ownersService.getOwnerFormByContext(contactContextToken).pipe(take(1), catchError(() => of(null))),
      token
        ? this.ownersService.getOrganizationByContext(contactContextToken).pipe(take(1), catchError(() => of(null)))
        : of(null),
      token ? this.ownersService.getPropertyByContext(token, null).pipe(take(1), catchError(() => of(null))) : of(null)
    ]).pipe(take(1)).subscribe({
      next: ([form, organization, tokenProperty]) => {
        this.stateFormOrganizationId = String(organization?.organizationId || internalOrganizationId).trim();
        if (token && !String(this.tokenPropertyOffice || '').trim()) {
          this.tokenPropertyOffice = String(form?.form?.propertyOffice || '').trim();
        }
        const tokenPropertyStateCode = String(tokenProperty?.state || '').trim().toUpperCase();
        this.currentPropertyStateCode = tokenPropertyStateCode;
        const requestedStates = [this.allStatesCode, tokenPropertyStateCode]
          .map(state => String(state || '').trim().toUpperCase())
          .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);
        this.loadStateFormsByRequestedStates(token || null, requestedStates, this.stateFormOrganizationId, tokenPropertyStateCode);
      },
      error: () => {
        this.stateFormOrganizationId = '';
        this.applyLoadedStateForms([], '');
        this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
      }
    });
  }

  reloadStateFormsForSelectedProperty(): void {
    this.rebuildOwnerAgreementContext();
    const token = String(this.token || '').trim();
    const seededState = String(this.ownerLeadPropertyState || '').trim().toUpperCase();
    const propertyState$ = this.selectedPropertyId === this.newPropertyOptionValue
      ? of(seededState)
      : this.ownersService.getPropertyByContext(token || null, this.selectedPropertyId).pipe(
          take(1),
          map(property => String(property?.state || seededState).trim().toUpperCase()),
          catchError(() => of(seededState))
        );

    propertyState$.pipe(take(1)).subscribe(propertyStateCode => {
      this.currentPropertyStateCode = propertyStateCode;
      const requestedStates = [this.allStatesCode, propertyStateCode]
        .map(state => String(state || '').trim().toUpperCase())
        .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);
      this.loadStateFormsByRequestedStates(token || null, requestedStates, this.stateFormOrganizationId, propertyStateCode);
    });
  }

  loadStateFormsByRequestedStates(token: string | null, requestedStates: string[], organizationId: string, preferredStateCode: string): void {
    const requestId = ++this.stateFormsRequestId;
    from(requestedStates).pipe(
      concatMap(stateCode => this.ownersService.getStateFormsByContext(token, stateCode, organizationId).pipe(take(1), catchError(() => of([] as StateFormResponse[])))),
      toArray()
    ).subscribe({
      next: responsesByState => {
        if (requestId !== this.stateFormsRequestId) {
          return;
        }
        this.applyLoadedStateForms(responsesByState.flat(), preferredStateCode);
      },
      error: () => {
        if (requestId !== this.stateFormsRequestId) {
          return;
        }
        this.applyLoadedStateForms([], preferredStateCode);
        this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
      }
    });
  }

  applyLoadedStateForms(forms: StateFormResponse[], preferredStateCode: string): void {
    this.stateForms = this.mapOwnerStateForms(forms, preferredStateCode);
    if ((this.stateForms || []).length === 0) {
      this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
    }
    this.refreshOwnerShellTabStrip();
  }

  /** MatTabGroup (OnPush) does not always repaint the tab header when @for adds mat-tab children. */
  refreshOwnerShellTabStrip(): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      this.ownerShellTabGroup?.updatePagination();
      this.ownerShellTabGroup?.realignInkBar();
    });
  }

  mapOwnerStateForms(forms: StateFormResponse[], ownerStateCode: string): StateFormResponse[] {
    const normalizedOwnerState = String(ownerStateCode || '').trim().toUpperCase();
    const uniqueByFormName = new Map<string, StateFormResponse>();

    for (const form of forms || []) {
      const formNameKey = String(form?.formName || '').trim().toLowerCase();
      const formHtml = String(form?.formAsHtml || '').trim();
      if (!formNameKey || !formHtml) {
        continue;
      }

      const existing = uniqueByFormName.get(formNameKey);
      if (!existing) {
        uniqueByFormName.set(formNameKey, form);
        continue;
      }

      const existingState = String(existing.stateCode || '').trim().toUpperCase();
      const incomingState = String(form.stateCode || '').trim().toUpperCase();
      const incomingIsOwnerState = normalizedOwnerState && incomingState === normalizedOwnerState;
      const existingIsOwnerState = normalizedOwnerState && existingState === normalizedOwnerState;
      if (incomingIsOwnerState && !existingIsOwnerState) {
        uniqueByFormName.set(formNameKey, form);
      }
    }

    return Array.from(uniqueByFormName.values()).sort((a, b) => String(a.formName || '').localeCompare(String(b.formName || '')));
  }

  getDynamicFormKey(stateForm: StateFormResponse): string {
    const stateFormId = Number(stateForm?.stateFormId);
    if (Number.isFinite(stateFormId) && stateFormId > 0) {
      return `state-form-${stateFormId}`;
    }
    const fallbackName = String(stateForm?.formName || '').trim().toLowerCase();
    return `state-form-name-${fallbackName}`;
  }

  isDynamicFormInViewMode(formKey: string): boolean {
    return !!this.dynamicFormViewState[formKey]?.isView;
  }

  getDynamicFormEditedHtml(stateForm: StateFormResponse): string {
    const formKey = this.getDynamicFormKey(stateForm);
    const edited = this.dynamicFormViewState[formKey]?.editedHtml || '';
    if (edited.trim()) {
      return edited;
    }
    return String(stateForm?.formAsHtml || '');
  }

  onDynamicFormViewRequested(formKey: string, editedHtml: string): void {
    this.dynamicFormViewState[formKey] = {
      isView: true,
      editedHtml: editedHtml || ''
    };
  }

  onDynamicFormEditRequested(formKey: string): void {
    const current = this.dynamicFormViewState[formKey];
    this.dynamicFormViewState[formKey] = {
      isView: false,
      editedHtml: current?.editedHtml || null
    };
  }
  //#endregion

  //#region Utility Methods
  onBackToOwnerList(): void {
    this.applyPageOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue());
    void this.router.navigateByUrl(RouterUrl.OwnerShell);
  }

  ngOnDestroy(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.officesSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
