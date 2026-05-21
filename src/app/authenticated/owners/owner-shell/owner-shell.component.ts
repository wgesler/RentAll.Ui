import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, catchError, combineLatest, concatMap, finalize, from, of, take, takeUntil, toArray } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { ownersFeatureEnabled } from '../../../config/feature-flags';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { StateFormResponse } from '../../organizations/models/state-form.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { StateFormService } from '../../organizations/services/state-form.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { OwnerInformationComponent } from '../owner-information/owner-information.component';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { OwnersListComponent } from '../owners-list/owners-list.component';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyService } from '../../properties/services/property.service';
import { OwnerAgreementInformationComponent } from '../owner-agreement-information/owner-agreement-information.component';
import { OwnerAgreementFormComponent } from '../owner-agreement-form/owner-agreement-form.component';
import { SharedFormEditorComponent } from '../../shared/forms/form-editor/form-editor.component';
import { SharedFormCreateComponent } from '../../shared/forms/form-create/form-create.component';
import { LeadsService } from '../../leads/services/leads.service';

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
  ownersFeatureEnabled = ownersFeatureEnabled;
  isOwnerListMode = false;
  isPageReady = false;
  selectedTabIndex = 0;
  selectedOfficeId: number | null = null;
  selectedPropertyId = this.newPropertyOptionValue;
  newPropertyCode = '';
  ownerLeadPropertyCode = '';
  propertyCodeOptions: SearchableSelectOption[] = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  token = '';
  leadOwnerId: number | null = null;
  currentOwnerStateCode = '';
  stateForms: StateFormResponse[] = [];
  dynamicFormViewState: Record<string, { isView: boolean; editedHtml: string | null }> = {};
  ownerEntityTypeId = EntityType.Owner;
  offices: OfficeResponse[] = [];
  canAccessInformationTab = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'stateForms']));
  destroy$ = new Subject<void>();


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private officeService: OfficeService,
    private navigationContextService: NavigationContextService,
    private utilityService: UtilityService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private stateFormService: StateFormService,
    private leadsService: LeadsService
  ) {}

  //#region Owner-Shell
  ngOnInit(): void {
    this.navigationContextService.setIsInOwnerMode(true);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.canAccessInformationTab = this.authService.isAdmin();
    this.selectedTabIndex = 0;
    this.loadOffices();

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntil(this.destroy$)).subscribe(([paramMap, queryParamMap]) => {
      const token = String(paramMap.get('token') || '').trim();
      const leadOwnerId = Number(String(queryParamMap.get('leadOwnerId') || '').trim());
      const officeId = Number(String(queryParamMap.get('officeId') || '').trim());
      this.syncOwnerShellFromRoute(token, leadOwnerId, officeId);
    });
  }

  syncOwnerShellFromRoute(token: string, leadOwnerId: number, officeId: number): void {
    this.token = token;
    const isUnauthorizedViewMode = this.isPublicOwnerTokenContext(token);
    this.navigationContextService.setIsInUnauthorizedViewMode(isUnauthorizedViewMode);
    this.navigationContextService.setIsInOwnerMode(!isUnauthorizedViewMode);
    this.leadOwnerId = null;
    this.currentOwnerStateCode = '';
    this.stateForms = [];
    this.dynamicFormViewState = {};
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];

    if (token) {
      this.isOwnerListMode = false;
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
      this.loadStateFormsForOwner();
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
      if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
        this.loadPropertyCodeOptions();
      }
      return;
    }
    this.selectedOfficeId = Number(value);
    if (this.tabUsesPropertySelection(this.selectedTabIndex) && !this.isOwnerListMode) {
      this.loadPropertyCodeOptions();
    }
  }

  onPropertyCodeDropdownChange(value: string | number | null): void {
    const selected = String(value ?? '').trim();
    this.selectedPropertyId = selected || this.newPropertyOptionValue;
    if (this.selectedPropertyId !== this.newPropertyOptionValue) {
      this.newPropertyCode = '';
      return;
    }
    if (!this.newPropertyCode.trim() && this.ownerLeadPropertyCode.trim()) {
      this.newPropertyCode = this.ownerLeadPropertyCode;
    }
  }

  onNewPropertyCodeChange(value: string): void {
    this.newPropertyCode = String(value ?? '').toUpperCase();
  }

  onTabIndexChange(nextIndex: number): void {
    this.selectedTabIndex = nextIndex;
    if (this.tabUsesPropertySelection(nextIndex) && !this.isOwnerListMode) {
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
      next: allOffices => {
        this.offices = allOffices || [];
        if (this.selectedOfficeId != null && this.offices.some(office => office.officeId === this.selectedOfficeId)) {
          return;
        }
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
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
    this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
    const ownerLeadId = Number(this.leadOwnerId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      return;
    }
    this.leadsService.getOwnerLeadById(ownerLeadId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: ownerLead => {
        this.ownerLeadPropertyCode = String(ownerLead.propertyCode || '').trim().toUpperCase();
        this.loadOwnerPropertyOptions(ownerLeadId);
      },
      error: () => {
        this.ownerLeadPropertyCode = '';
        this.loadOwnerPropertyOptions(ownerLeadId);
      }
    });
  }

  loadStateFormsForOwner(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForms');
    const ownerLeadId = Number(this.leadOwnerId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      this.currentOwnerStateCode = '';
      this.stateForms = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: contacts => {
        const ownerStateCode = this.resolveOwnerStateCode(contacts || [], ownerLeadId);
        this.currentOwnerStateCode = ownerStateCode;
        const requestedStates = [this.allStatesCode, ownerStateCode]
          .map(state => String(state || '').trim().toUpperCase())
          .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);
        if (requestedStates.length === 0) {
          this.stateForms = [];
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
          return;
        }

        from(requestedStates).pipe(
          concatMap(stateCode => this.stateFormService.getStateForms(stateCode).pipe(take(1), catchError(() => of([] as StateFormResponse[])))),
          toArray(),
          finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms')),
          takeUntil(this.destroy$)
        ).subscribe({
          next: responsesByState => {
            this.stateForms = this.mapOwnerStateForms(responsesByState.flat(), ownerStateCode);
          },
          error: () => {
            this.stateForms = [];
          }
        });
      },
      error: () => {
        this.currentOwnerStateCode = '';
        this.stateForms = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      }
    });
  }
  //#endregion

  loadOwnerPropertyOptions(ownerLeadId: number): void {
    this.contactService.getContacts().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: contacts => {
        const ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        );
        const ownerContactId = String(ownerContact?.contactId || '').trim();
        if (!ownerContactId) {
          this.selectedPropertyId = this.newPropertyOptionValue;
          this.newPropertyCode = this.ownerLeadPropertyCode;
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
            const rows = filtered.sort((a, b) => String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''))).map(property => ({
              value: String(property.propertyId),
              label: String(property.propertyCode || '').trim() || 'Unnamed Property'
            }));

            this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }, ...rows];
            if (this.ownerLeadPropertyCode) {
              this.selectedPropertyId = this.newPropertyOptionValue;
              this.newPropertyCode = this.ownerLeadPropertyCode;
              return;
            }
            if (rows.length > 0) {
              this.selectedPropertyId = String(rows[0].value);
              this.newPropertyCode = '';
              return;
            }
            this.selectedPropertyId = this.newPropertyOptionValue;
            this.newPropertyCode = '';
          },
          error: () => {
            this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
            this.selectedPropertyId = this.newPropertyOptionValue;
            this.newPropertyCode = this.ownerLeadPropertyCode;
          }
        });
      },
      error: () => {
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.selectedPropertyId = this.newPropertyOptionValue;
        this.newPropertyCode = this.ownerLeadPropertyCode;
      }
    });
  }

  //#region Utility Methods
  tabUsesPropertySelection(tabIndex: number): boolean {
    return tabIndex >= 1;
  }

  isPublicOwnerTokenContext(token: string): boolean {
    const hasToken = String(token || '').trim().length > 0;
    return hasToken && !this.authService.getIsLoggedIn();
  }

  onBackToOwnerList(): void {
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    void this.router.navigateByUrl(RouterUrl.OwnerShell);
  }

  resolveOwnerStateCode(contacts: ContactResponse[], ownerLeadId: number): string {
    const ownerContact = (contacts || []).find(contact =>
      Number(contact.entityTypeId) === Number(EntityType.Owner) &&
      Number(contact.ownerLeadId) === ownerLeadId
    );
    return String(ownerContact?.state || '').trim().toUpperCase();
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

  ngOnDestroy(): void {
    this.navigationContextService.setIsInOwnerMode(false);
    this.navigationContextService.setIsInUnauthorizedViewMode(false);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
