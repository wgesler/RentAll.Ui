import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, combineLatest, concatMap, defer, finalize, from, map, of, shareReplay, switchMap, take, takeUntil, toArray } from 'rxjs';
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
import { UtilityService } from '../../../services/utility.service';
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
  isOwnerAdmin = false;
  isOwnerListMode = false;
  isPageReady = false;
  selectedTabIndex = 0;
  // Guards the property-code/contact load so it runs once per owner context instead of on every tab
  // switch. Reset when the owner or office changes (those legitimately require a refresh).
  propertyContextLoaded = false;
  selectedOfficeId: number | null = null;
  selectedOrganizationId: string | null = null;
  selectedPropertyId = this.newPropertyOptionValue;
  newPropertyCode = '';
  propertyCodeTitleBarShowError = false;
  ownerLeadPropertyCode = '';
  ownerLeadPropertyAddress1 = '';
  ownerLeadPropertyCity = '';
  ownerLeadPropertyState = '';
  ownerLeadPropertyZip = '';
  selectedOwnerContactId: string | null = null;
  propertyCodeOptions: SearchableSelectOption[] = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  token = '';
  tokenPropertyOffice = '';
  leadOwnerId: number | null = null;
  currentPropertyStateCode = '';
  stateFormOrganizationId = '';
  stateFormsRequestId = 0;
  // Shared owner-agreement context: resolved once (lazily, on the first form tab that subscribes)
  // and replayed to every form tab so they stop re-fetching the same owner/property/office data.
  ownerAgreementContext$: Observable<OwnerAgreementContext> | null = null;
  stateForms: StateFormResponse[] = [];
  dynamicFormViewState: Record<string, { isView: boolean; editedHtml: string | null }> = {};
  ownerEntityTypeId = EntityType.Owner;
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  canAccessInformationTab = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'stateForms']));
  destroy$ = new Subject<void>();


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private navigationContextService: NavigationContextService,
    private utilityService: UtilityService,
    private ownersService: OwnersService,
    private toastr: ToastrService
  ) {}

  //#region Owner-Shell
  ngOnInit(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.canAccessInformationTab = this.authService.isAdmin();
    this.selectedTabIndex = 0;
    this.loadOffices();

    // One-way latch: the full-page spinner only covers the initial load. Once the shell is ready it
    // stays visible, so background reloads (state forms, property options on a tab switch or office
    // change) refresh in place instead of blanking and re-mounting the whole shell.
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      if (items.size === 0) {
        this.isPageReady = true;
      }
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntil(this.destroy$)).subscribe(([paramMap, queryParamMap]) => {
      const token = String(paramMap.get('token') || '').trim();
      const leadOwnerId = Number(String(queryParamMap.get('leadOwnerId') || '').trim());
      const officeId = Number(String(queryParamMap.get('officeId') || '').trim());
      const propertyCode = String(queryParamMap.get('propertyCode') || '').trim();
      const propertyOffice = String(queryParamMap.get('propertyOffice') || '').trim();
      this.syncOwnerShellFromRoute(token, leadOwnerId, officeId, propertyCode, propertyOffice);
    });
  }

  tabUsesPropertySelection(tabIndex: number): boolean {
    return tabIndex >= 1;
  }

  isPublicOwnerTokenContext(token: string): boolean {
    const hasToken = String(token || '').trim().length > 0;
    return hasToken && !this.authService.getIsLoggedIn();
  }

  isOwnerLinkMode(): boolean {
    return String(this.token || '').trim().length > 0;
  }
  //#endregion

  //#region Form Response Methods
  syncOwnerShellFromRoute(token: string, leadOwnerId: number, officeId: number, propertyCode: string, propertyOffice: string): void {
    this.token = token;
    this.tokenPropertyOffice = String(propertyOffice || '').trim();
    this.loadOffices();
    const isUnauthorizedViewMode = this.isPublicOwnerTokenContext(token);
    this.canAccessInformationTab = this.authService.isAdmin() && !this.isOwnerLinkMode();
    this.navigationContextService.setIsInUnauthorizedViewMode(isUnauthorizedViewMode);
    this.navigationContextService.setIsInOwnerMode(isUnauthorizedViewMode);
    this.leadOwnerId = null;
    this.propertyContextLoaded = false;
    this.selectedOrganizationId = null;
    this.currentPropertyStateCode = '';
    this.stateFormOrganizationId = '';
    this.stateForms = [];
    this.dynamicFormViewState = {};
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
    this.ownerLeadPropertyAddress1 = '';
    this.ownerLeadPropertyCity = '';
    this.ownerLeadPropertyState = '';
    this.ownerLeadPropertyZip = '';
    this.selectedOwnerContactId = null;
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];

    if (token) {
      this.isOwnerListMode = false;
      if (Number.isFinite(officeId) && officeId > 0) {
        this.selectedOfficeId = officeId;
        this.globalSelectionService.setSelectedOfficeId(officeId);
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
      this.leadOwnerId = leadOwnerId;
      if (Number.isFinite(officeId) && officeId > 0) {
        this.selectedOfficeId = officeId;
      }
      if (this.tabUsesPropertySelection(this.selectedTabIndex)) {
        this.loadPropertyCodeOptions();
      }
      this.refreshOwnerContactIdForContext();
      this.loadStateFormsForContext();
      this.rebuildOwnerAgreementContext();
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
    const fallbackLabel = resolvedOfficeName;
    return [{ value: selectedOfficeId, label: fallbackLabel }, ...base];
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
    // Office change invalidates the owner's property options; force a reload on the next property
    // tab visit (or immediately if already on one).
    this.propertyContextLoaded = false;
    if (value == null || value === '') {
      this.selectedOfficeId = null;
      if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
        this.loadPropertyCodeOptions();
      }
      this.rebuildOwnerAgreementContext();
      return;
    }
    this.selectedOfficeId = Number(value);
    if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
      this.loadPropertyCodeOptions();
    }
    this.rebuildOwnerAgreementContext();
  }

  onPropertyCodeDropdownChange(value: string | number | null): void {
    const selected = String(value ?? '').trim();
    this.selectedPropertyId = selected || this.newPropertyOptionValue;
    if (this.selectedPropertyId !== this.newPropertyOptionValue) {
      this.newPropertyCode = '';
      this.propertyCodeTitleBarShowError = false;
      // Selecting a property reloads its state-specific dynamic forms.
      this.reloadStateFormsForSelectedProperty();
      return;
    }
    if (!this.newPropertyCode.trim() && this.ownerLeadPropertyCode.trim()) {
      this.newPropertyCode = this.ownerLeadPropertyCode;
    }
    if (this.newPropertyCode.trim()) {
      this.propertyCodeTitleBarShowError = false;
    }
    // Back to "New Property": fall back to the lead-seeded state (or generic only if unknown).
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

  onTabIndexChange(nextIndex: number): void {
    this.selectedTabIndex = nextIndex;
    // Property options/contact are loaded once per owner context (here on the first visit to a
    // property tab, or on office/owner change). Re-loading on every switch reset the selected
    // property and re-triggered the load overlay, which made the whole shell flash.
    if (this.tabUsesPropertySelection(nextIndex) && !this.isOwnerListMode && !this.propertyContextLoaded) {
      this.loadPropertyCodeOptions();
      this.refreshOwnerContactIdForContext();
    }
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
  //#endregion

  //#region Load Data Methods
  loadOffices(): void {
    const token = String(this.token || '').trim();
    this.utilityService.addLoadItem(this.itemsToLoad$, 'offices');

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
    ]).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    })).subscribe({
      next: ([offices, organization]) => {
        const office = (offices || [])[0] || null;
        this.offices = office ? [office] : [];
        this.selectedOrganizationId = String(organization?.organizationId || office?.organizationId || '').trim() || null;
        const officeId = Number(office?.officeId);
        if (Number.isFinite(officeId) && officeId > 0) {
          this.selectedOfficeId = officeId;
          this.globalSelectionService.setSelectedOfficeId(officeId);
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
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }
    this.selectedOrganizationId = organizationId;
    this.officesSubscription?.unsubscribe();
    this.officesSubscription = this.ownersService.getOfficeListStreamByContext(null, organizationId).pipe(takeUntil(this.destroy$)).subscribe({
      next: offices => {
        this.offices = offices || [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        if (this.selectedOfficeId != null && this.offices.some(office => office.officeId === this.selectedOfficeId)) {
          return;
        }
        const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
        this.selectedOfficeId = globalOfficeId != null && this.offices.some(office => office.officeId === globalOfficeId)
          ? globalOfficeId
          : null;
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      }
    });
  }

  loadPropertyCodeOptions(): void {
    this.propertyContextLoaded = true;
    // In owner-link mode the property code comes from the token/route context and can represent
    // a brand-new property that does not exist in org property lists yet.
    // Try token-resolved property first; fall back to New Property context.
    if (this.isOwnerLinkMode()) {
      const token = String(this.token || '').trim();
      if (!token) {
        this.selectedPropertyId = this.newPropertyOptionValue;
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.newPropertyCode = String(this.newPropertyCode || '').trim().toUpperCase();
        return;
      }

      this.ownersService.getPropertyByContext(token, null).pipe(take(1),catchError(() => of(null))).subscribe(property => {
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

    // Load the owner lead (for the New Property address seed) and the owner's existing properties.
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
      // Owner has existing properties: present them as a dropdown, preload the first, and load that
      // property's state-specific forms on top of the generic (XX) set.
      this.selectedPropertyId = String(propertyOptions[0].value);
      this.newPropertyCode = '';
      this.reloadStateFormsForSelectedProperty();
      return;
    }

    // No existing properties: fall back to a single new-property code field seeded from the owner
    // lead. Only the generic (XX) forms apply until a property is created.
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = this.ownerLeadPropertyCode;
  }

  loadStateFormsForContext(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForms');
    const token = String(this.token || '').trim();
    const ownerLeadId = Number(this.leadOwnerId);
    const contactContextToken = token || null;
    if (!token && (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0)) {
      this.currentPropertyStateCode = '';
      this.stateForms = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      return;
    }
    combineLatest([
      this.ownersService.getOwnerFormByContext(contactContextToken).pipe(take(1), catchError(() => of(null))),
      this.ownersService.getOrganizationByContext(contactContextToken).pipe(take(1), catchError(() => of(null))),
      // In owner-link (token) mode the property is fixed by the token, so its state is known up
      // front and loaded alongside the generic set. Internal mode resolves the property via the
      // dropdown selection flow instead.
      token ? this.ownersService.getPropertyByContext(token, null).pipe(take(1), catchError(() => of(null))) : of(null)
    ]).pipe(take(1)).subscribe({
      next: ([form, organization, tokenProperty]) => {
        this.stateFormOrganizationId = String(organization?.organizationId || '').trim();
        if (token && !String(this.tokenPropertyOffice || '').trim()) {
          this.tokenPropertyOffice = String(form?.form?.propertyOffice || '').trim();
        }
        // Always include the state-independent (XX) generic forms (owner agreement, direct
        // deposit, etc.). For token mode also include the token property's state-specific forms;
        // for internal mode property-state forms arrive later via the dropdown selection flow.
        const tokenPropertyStateCode = String(tokenProperty?.state || '').trim().toUpperCase();
        this.currentPropertyStateCode = tokenPropertyStateCode;
        const requestedStates = [this.allStatesCode, tokenPropertyStateCode]
          .map(state => String(state || '').trim().toUpperCase())
          .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);
        this.loadStateFormsByRequestedStates(token || null, requestedStates, this.stateFormOrganizationId, tokenPropertyStateCode);
      },
      error: () => {
        this.stateFormOrganizationId = '';
        this.stateForms = [];
        this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      }
    });
  }

  // Rebuilds the shared owner-agreement context observable. `defer` makes the fetch fire on the
  // first subscription (the first form tab the user opens) reading the current selection, and
  // `shareReplay(1)` hands the same result to every other form tab. Reassigning on selection
  // changes forces the mounted tabs to re-subscribe and refetch with the new property/office.
  rebuildOwnerAgreementContext(): void {
    this.ownerAgreementContext$ = defer(() => {
      const token = String(this.token || '').trim() || null;
      const propertyId = this.selectedPropertyId === this.newPropertyOptionValue ? null : this.selectedPropertyId;
      return this.ownersService.getOwnerAgreementContextByContext(token, this.leadOwnerId, propertyId, this.selectedOfficeId);
    }).pipe(shareReplay(1));
  }

  // Triggered when a property is selected (dropdown change or single-property preload). Resolves
  // the selected property's state, then reloads the generic (XX) forms plus that state's forms.
  // PropertyListResponse has no state, so an existing property is fetched to read its address;
  // a not-yet-saved "new" property falls back to the lead-seeded state.
  reloadStateFormsForSelectedProperty(): void {
    // The shared agreement context also depends on the selected property; refresh it so the form
    // tabs pick up the new property/agreement data.
    this.rebuildOwnerAgreementContext();
    const token = String(this.token || '').trim();
    const seededState = String(this.ownerLeadPropertyState || '').trim().toUpperCase();
    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForms');

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
    // Guard against out-of-order completion: the generic (XX) load and a property-state reload
    // can be in flight together, so only the most recently requested load applies its result.
    const requestId = ++this.stateFormsRequestId;
    from(requestedStates).pipe(
      concatMap(stateCode => this.ownersService.getStateFormsByContext(token, stateCode, organizationId).pipe(take(1), catchError(() => of([] as StateFormResponse[])))),
      toArray(),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms'))).subscribe({
      next: responsesByState => {
        if (requestId !== this.stateFormsRequestId) {
          return;
        }
        this.stateForms = this.mapOwnerStateForms(responsesByState.flat(), preferredStateCode);
        if ((this.stateForms || []).length === 0) {
          this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
        }
      },
      error: () => {
        if (requestId !== this.stateFormsRequestId) {
          return;
        }
        this.stateForms = [];
        this.toastr.error('Unable to load owner state forms.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region State Form Methods
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
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    void this.router.navigateByUrl(RouterUrl.OwnerShell);
  }
  
  ngOnDestroy(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.officesSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
