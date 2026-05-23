import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, catchError, combineLatest, concatMap, finalize, from, of, switchMap, take, takeUntil, toArray } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { OfficeResponse } from '../../organizations/models/office.model';
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
import { OwnersService } from '../services/owners.service';

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
  selectedOfficeId: number | null = null;
  selectedOrganizationId: string | null = null;
  selectedPropertyId = this.newPropertyOptionValue;
  newPropertyCode = '';
  ownerLeadPropertyCode = '';
  selectedOwnerContactId: string | null = null;
  propertyCodeOptions: SearchableSelectOption[] = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
  token = '';
  tokenPropertyOffice = '';
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

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
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

  syncOwnerShellFromRoute(token: string, leadOwnerId: number, officeId: number, propertyCode: string, propertyOffice: string): void {
    this.token = token;
    this.tokenPropertyOffice = String(propertyOffice || '').trim();
    this.loadOffices();
    const isUnauthorizedViewMode = this.isPublicOwnerTokenContext(token);
    this.canAccessInformationTab = this.authService.isAdmin() && !this.isOwnerLinkMode();
    this.navigationContextService.setIsInUnauthorizedViewMode(isUnauthorizedViewMode);
    this.navigationContextService.setIsInOwnerMode(isUnauthorizedViewMode);
    this.leadOwnerId = null;
    this.selectedOrganizationId = null;
    this.currentOwnerStateCode = '';
    this.stateForms = [];
    this.dynamicFormViewState = {};
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
    this.selectedPropertyId = this.newPropertyOptionValue;
    this.newPropertyCode = '';
    this.ownerLeadPropertyCode = '';
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
      this.loadStateFormsForToken();
      return;
    }

    if (Number.isFinite(leadOwnerId) && leadOwnerId > 0) {
      this.isOwnerListMode = false;
      this.leadOwnerId = leadOwnerId;
      if (Number.isFinite(officeId) && officeId > 0) {
        this.selectedOfficeId = officeId;
        this.globalSelectionService.setSelectedOfficeId(officeId);
      }
      if (this.tabUsesPropertySelection(this.selectedTabIndex)) {
        this.loadPropertyCodeOptions();
      }
      this.refreshOwnerContactIdForContext();
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
      this.refreshOwnerContactIdForContext();
    }
  }
  //#endregion

  //#region Load Data Methods
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId && this.isPublicOwnerTokenContext(this.token)) {
      this.loadPublicOwnerOffices();
      return;
    }
    if (!organizationId) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.selectedOrganizationId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }
    this.selectedOrganizationId = organizationId;

    this.ownersService.ensureOfficesLoaded(organizationId).pipe(take(1),finalize(() => {
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
        this.applyPublicOwnerOfficeSelection();
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadPublicOwnerOffices(): void {
    const token = String(this.token || '').trim();
    if (!token) {
      this.offices = [];
      this.selectedOfficeId = null;
      this.selectedOrganizationId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'offices');
    // Seed office context from token-specific endpoint so child forms can bind a real officeId
    // even when route carries only propertyOffice text (for example "Denver").
    this.ownersService.getPublicOwnerOfficeByToken(token).pipe(take(1), catchError(() => of(null))).subscribe({
      next: office => {
        if (!office) {
          return;
        }
        const officeId = Number(office.officeId);
        const officeName = String(office.name || '').trim();
        if (Number.isFinite(officeId) && officeId > 0) {
          this.selectedOfficeId = officeId;
          this.globalSelectionService.setSelectedOfficeId(officeId);
        }
        if (officeName) {
          this.tokenPropertyOffice = officeName;
        }
        if (this.offices.length === 0) {
          this.offices = [office];
          const organizationId = String(office.organizationId || '').trim();
          this.selectedOrganizationId = organizationId || null;
          this.ownersService.setOfficesForContext(organizationId || null, this.offices);
        }
      },
      error: () => {}
    });

    this.ownersService.getPublicOwnerOrganizationByToken(token).pipe(take(1),
      switchMap(organization => {
        const organizationId = String(organization?.organizationId || '').trim();
        if (!organizationId) {
          return of({ organizationId: '', offices: [] as OfficeResponse[] });
        }
        return this.ownersService.loadAllOffices(organizationId).pipe(
          take(1),
          catchError(() => of([] as OfficeResponse[])),
          switchMap(offices => of({ organizationId, offices }))
        );
      }),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))
    ).subscribe({
      next: result => {
        const organizationId = String(result?.organizationId || '').trim();
        this.selectedOrganizationId = organizationId || null;
        const offices = result?.offices || [];
        this.offices = offices || [];
        this.ownersService.setOfficesForContext(organizationId || null, this.offices);
        if (this.offices.length > 0) {
          this.applyPublicOwnerOfficeSelection();
          return;
        }
        this.loadPublicOwnerOfficeFallback(token);
      },
      error: () => {
        this.loadPublicOwnerOfficeFallback(token);
      }
    });
  }

  loadPublicOwnerOfficeFallback(token: string): void {
    this.ownersService.getPublicOwnerOfficeByToken(token).pipe(take(1)).subscribe({
      next: office => {
        this.offices = office ? [office] : [];
        const inferredOrganizationId = String(this.authService.getUser()?.organizationId || '').trim() || String(office?.organizationId || '').trim();
        this.selectedOrganizationId = inferredOrganizationId || null;
        this.ownersService.setOfficesForContext(inferredOrganizationId || null, this.offices);
        if (office?.officeId && Number(office.officeId) > 0) {
          this.selectedOfficeId = Number(office.officeId);
          this.globalSelectionService.setSelectedOfficeId(Number(office.officeId));
        }
        const officeName = String(office?.name || '').trim();
        if (officeName) {
          this.tokenPropertyOffice = officeName;
        }
      },
      error: () => {
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  loadPropertyCodeOptions(): void {
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

      this.ownersService.getPropertyByContext(token, null).pipe(
        take(1),
        catchError(() => of(null))
      ).subscribe(property => {
        const propertyId = String(property?.propertyId || '').trim();
        const propertyCode = String(property?.propertyCode || '').trim().toUpperCase();
        if (propertyId) {
          this.propertyCodeOptions = [
            { value: this.newPropertyOptionValue, label: 'New Property' },
            { value: propertyId, label: propertyCode || 'Existing Property' }
          ];
          this.selectedPropertyId = propertyId;
          this.newPropertyCode = '';
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

    this.ownersService.getOwnerByContext(null, ownerLeadId).pipe(take(1)).subscribe({
      next: ownerLead => {
        if (!ownerLead) {
          this.ownerLeadPropertyCode = '';
          this.loadOwnerPropertyOptions(ownerLeadId);
          return;
        }
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

    this.ownersService.ensureContactsLoaded().pipe(take(1)).subscribe({
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
          concatMap(stateCode => this.ownersService.getStateForms(stateCode).pipe(take(1), catchError(() => of([] as StateFormResponse[])))),
          toArray(),
          finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms'))
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

  loadStateFormsForToken(): void {
    const token = String(this.token || '').trim();
    if (!token) {
      this.currentOwnerStateCode = '';
      this.stateForms = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForms');
    this.ownersService.getPublicOwnerFormByToken(token).pipe(take(1)).subscribe({
      next: response => {
        const ownerStateCode = String(response?.form?.state || '').trim().toUpperCase();
        this.currentOwnerStateCode = ownerStateCode;
        if (!String(this.tokenPropertyOffice || '').trim()) {
          this.tokenPropertyOffice = String(response?.form?.propertyOffice || '').trim();
        }
        this.applyPublicOwnerOfficeSelection();
        const requestedStates = [this.allStatesCode, ownerStateCode]
          .map(state => String(state || '').trim().toUpperCase())
          .filter((state, index, array) => state.length === 2 && array.indexOf(state) === index);
        if (requestedStates.length === 0) {
          this.stateForms = [];
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
          return;
        }
        this.ownersService.getPublicOwnerStateFormsByToken(token).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms'))).subscribe({
           next: stateForms => {
            this.stateForms = this.mapOwnerStateForms(stateForms || [], ownerStateCode);
          },
          error: () => {
            // Fallback: if public endpoint is unavailable, try existing organization endpoint
            // (works when requester is authenticated in the current app session).
            from(requestedStates).pipe(
              concatMap(stateCode => this.ownersService.getStateForms(stateCode).pipe(take(1), catchError(() => of([] as StateFormResponse[])))),
              toArray()
            ).subscribe({
              next: responsesByState => {
                this.stateForms = this.mapOwnerStateForms(responsesByState.flat(), ownerStateCode);
                if ((this.stateForms || []).length === 0) {
                  this.toastr.error('Unable to load owner state forms for this link.', CommonMessage.Error);
                }
              },
              error: () => {
                this.stateForms = [];
                this.toastr.error('Unable to load owner state forms for this link.', CommonMessage.Error);
              }
            });
          }
        });
      },
      error: () => {
        this.currentOwnerStateCode = '';
        this.stateForms = [];
        this.toastr.error('Unable to load owner state forms for this link.', CommonMessage.Error);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForms');
      }
    });
  }
  //#endregion

  loadOwnerPropertyOptions(ownerLeadId: number): void {
    this.ownersService.getContacts().pipe(take(1)).subscribe({
      next: contacts => {
        const ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        );
        const ownerContactId = String(ownerContact?.contactId || '').trim();
        this.selectedOwnerContactId = ownerContactId || null;
        if (!ownerContactId) {
          this.selectedPropertyId = this.newPropertyOptionValue;
          this.newPropertyCode = this.ownerLeadPropertyCode;
          return;
        }

        this.ownersService.getPropertiesByOwner(ownerContactId).pipe(take(1)).subscribe({
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
        this.selectedOwnerContactId = null;
        this.propertyCodeOptions = [{ value: this.newPropertyOptionValue, label: 'New Property' }];
        this.selectedPropertyId = this.newPropertyOptionValue;
        this.newPropertyCode = this.ownerLeadPropertyCode;
      }
    });
  }

  refreshOwnerContactIdForContext(): void {
    const token = String(this.token || '').trim();
    if (token) {
      this.ownersService.getOwnerContactByContext(token, null).pipe(
        take(1),
        catchError(() => of(null))
      ).subscribe(contact => {
        const contactId = String(contact?.contactId || '').trim();
        this.selectedOwnerContactId = contactId || null;
      });
      return;
    }

    const ownerLeadId = Number(this.leadOwnerId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      this.selectedOwnerContactId = null;
      return;
    }

    this.ownersService.getContacts().pipe(take(1), catchError(() => of([] as ContactResponse[]))).subscribe(contacts => {
      const ownerContact = (contacts || []).find(contact =>
        Number(contact.entityTypeId) === Number(EntityType.Owner) &&
        Number(contact.ownerLeadId) === ownerLeadId
      );
      const ownerContactId = String(ownerContact?.contactId || '').trim();
      this.selectedOwnerContactId = ownerContactId || null;
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

  isOwnerLinkMode(): boolean {
    return String(this.token || '').trim().length > 0;
  }

  applyPublicOwnerOfficeSelection(): void {
    if (!this.isPublicOwnerTokenContext(this.token)) {
      return;
    }

    const selectedOfficeId = Number(this.selectedOfficeId);
    if (Number.isFinite(selectedOfficeId) && selectedOfficeId > 0 && this.offices.some(office => office.officeId === selectedOfficeId)) {
      this.globalSelectionService.setSelectedOfficeId(selectedOfficeId);
      return;
    }

    const officeName = String(this.tokenPropertyOffice || '').trim().toLowerCase();
    if (officeName) {
      const exactMatch = this.offices.find(office => String(office.name || '').trim().toLowerCase() === officeName);
      if (exactMatch) {
        this.selectedOfficeId = exactMatch.officeId;
        this.tokenPropertyOffice = String(exactMatch.name || '').trim();
        this.globalSelectionService.setSelectedOfficeId(exactMatch.officeId);
        return;
      }
      const partialMatch = this.offices.find(office => String(office.name || '').trim().toLowerCase().includes(officeName));
      if (partialMatch) {
        this.selectedOfficeId = partialMatch.officeId;
        this.tokenPropertyOffice = String(partialMatch.name || '').trim();
        this.globalSelectionService.setSelectedOfficeId(partialMatch.officeId);
        return;
      }
    }

    if (this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
      this.tokenPropertyOffice = String(this.offices[0].name || '').trim();
      this.globalSelectionService.setSelectedOfficeId(this.offices[0].officeId);
    }
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
