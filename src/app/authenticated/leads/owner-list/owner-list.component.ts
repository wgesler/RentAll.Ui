import { CommonModule } from '@angular/common';
import { Clipboard } from '@angular/cdk/clipboard';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, input, NgZone, OnChanges, OnDestroy, OnInit, output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, finalize, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { ownersFeatureEnabled } from '../../../config/feature-flags';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType, OwnerType } from '../../contacts/models/contact-enum';
import { ContactRequest } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { LeadOwnerListDisplay, LeadOwnerUpdateRequest } from '../models/lead-owner.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

export type OwnerEditSelection = { ownerId: number; officeId: number | null };

@Component({
  standalone: true,
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class OwnerListComponent implements OnInit, OnChanges, OnDestroy {
  embeddedInShell = input(false);
  officeId = input<number | null>(null);
  requestNewOwner = output<void>();
  requestEditOwner = output<OwnerEditSelection>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allOwners: LeadOwnerListDisplay[] = [];
  ownersDisplay: LeadOwnerListDisplay[] = [];

  offices: OfficeResponse[] = [];
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  ownersFeatureEnabled = ownersFeatureEnabled;
  isInOwnerMode = false;

  ownersDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', sort: false, wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '25ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '30ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '20ch', wrap: false },
    leadStateDropdown: { displayAs: 'Status', wrap: false, maxWidth: '20ch', sort: false, options: LEAD_STATE_SELECT_OPTIONS.map(o => o.label) },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-leads']));
  destroy$ = new Subject<void>();

  constructor(
    private clipboard: Clipboard,
    private router: Router,
    private ngZone: NgZone,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private formatterService: FormatterService,
    private leadsService: LeadsService,
    private contactService: ContactService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private authService: AuthService,
    private navigationContextService: NavigationContextService
  ) { }

  //#region Owner-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    if (!this.embeddedInShell()) {
      this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.offices.length === 0) {
          return;
        }
        this.resolveOfficeScope(officeId);
      });
    }

    this.loadOffices();
    this.loadOwnerLeads();
    this.navigationContextService.getIsInOwnerMode().pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.isInOwnerMode = value;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embeddedInShell()) {
      return;
    }
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId());
    }
  }

  addOwnerLead(): void {
    if (this.embeddedInShell()) {
      this.requestNewOwner.emit();
      return;
    }
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadOwner, ['new']));
    });
  }

  goToOwnerLead(event: LeadOwnerListDisplay): void {
    if (!event?.ownerId) {
      return;
    }
    const source = event as unknown as Record<string, unknown>;
    const rawOfficeId = source['officeId'] ?? source['defaultOfficeId'];
    const parsedOfficeId = Number(rawOfficeId);
    const ownerOfficeId = Number.isFinite(parsedOfficeId) && parsedOfficeId > 0
      ? parsedOfficeId
      : null;
    if (this.embeddedInShell()) {
      this.requestEditOwner.emit({
        ownerId: event.ownerId,
        officeId: ownerOfficeId
      });
      return;
    }
    if (this.isInOwnerMode) {
      this.ngZone.run(() => {
        void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${event.ownerId}`);
      });
      return;
    }
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadOwner, [String(event.ownerId)]));
    });
  }

  deleteOwner(event: LeadOwnerListDisplay): void {
    if (!event?.ownerId) {
      return;
    }
    this.leadsService.deleteOwnerLead(event.ownerId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner lead deleted.', CommonMessage.Success);
        this.loadOwnerLeads();
      },
      error: () => {
        this.toastr.error('Unable to delete owner lead.', CommonMessage.Error);
      }
    });
  }

  copyOwnerFormLink(event: LeadOwnerListDisplay): void {
    const ownerId = Number(event?.ownerId);
    if (!ownerId) {
      return;
    }
    const source = event as unknown as Record<string, unknown>;
    const propertyCode = String(source['propertyCode'] || '').trim().toUpperCase();
    const propertyOffice = String(source['propertyOffice'] || '').trim();
    if (!propertyCode || !propertyOffice) {
      this.toastr.error('Property Code and Property Office are required before sending an owner link.', CommonMessage.Error);
      return;
    }
    const rawOfficeId = source['officeId'] ?? source['defaultOfficeId'];
    const parsedOfficeId = Number(rawOfficeId);
    const officeId = Number.isFinite(parsedOfficeId) && parsedOfficeId > 0 ? parsedOfficeId : null;
    this.leadsService.createOwnerFormShareLink(ownerId).pipe(take(1)).subscribe({
      next: (response) => {
        const shareUrl = this.leadsService.getPublicOwnerFormUrl(response.token, { officeId, propertyCode, propertyOffice });
        const copied = this.clipboard.copy(shareUrl);
        if (copied) {
          this.toastr.success('Owner form link copied to clipboard.', CommonMessage.Success);
          return;
        }
        this.toastr.error('Unable to copy owner form link.', CommonMessage.Error);
      },
      error: () => {
        this.toastr.error('Unable to generate owner form share link.', CommonMessage.Error);
      }
    });
  }

  openOwnerFromLead(event: LeadOwnerListDisplay): void {
    const ownerId = Number(event?.ownerId);
    if (!ownerId || Number.isNaN(ownerId)) {
      return;
    }
    const openOwnerShell = () => {
      this.ngZone.run(() => {
        void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${ownerId}`);
      });
    };
    const openOwnerShellWithInactiveLead = () => {
      this.ensureOwnerLeadInactive(ownerId, openOwnerShell);
    };

    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1)).subscribe({
      next: ownerLead => {
        const leadOwnerRequest = this.mappingService.mapLeadOwnerResponseToUpdateRequest(ownerLead);
        this.contactService.matchContactToLead(leadOwnerRequest).pipe(take(1)).subscribe({
          next: () => {
            this.contactService.refreshContacts().pipe(take(1)).subscribe({ next: () => {}, error: () => {} });
            openOwnerShellWithInactiveLead();
          },
          error: (error: HttpErrorResponse) => {
            if (error.status !== 404) {
              openOwnerShellWithInactiveLead();
              return;
            }

            const organizationId = String(this.authService.getUser()?.organizationId ?? '').trim();
            const officeId = Number(ownerLead.officeId);
            if (!organizationId || !Number.isFinite(officeId) || officeId <= 0) {
              this.toastr.error('Unable to create owner contact for this lead.', CommonMessage.Error);
              return;
            }

            const createContactRequest: ContactRequest = {
              ownerLeadId: ownerId,
              organizationId,
              officeId,
              officeAccess: [officeId],
              entityTypeId: EntityType.Owner,
              ownerTypeId: OwnerType.Individual,
              properties: [],
              firstName: ownerLead.firstName ?? null,
              lastName: ownerLead.lastName ?? null,
              address1: ownerLead.address ?? '',
              city: ownerLead.city ?? '',
              state: ownerLead.state ?? '',
              zip: ownerLead.zip ?? '',
              phone: ownerLead.phone ?? null,
              email: ownerLead.email ?? '',
              rating: 0,
              isInternational: false,
              isActive: true
            };

            this.contactService.createContact(createContactRequest).pipe(take(1)).subscribe({
              next: () => {
                this.contactService.refreshContacts().pipe(take(1)).subscribe({ next: () => {}, error: () => {} });
                openOwnerShellWithInactiveLead();
              },
              error: () => {
                openOwnerShellWithInactiveLead();
              }
            });
          }
        });
      },
      error: () => {
        openOwnerShellWithInactiveLead();
      }
    });
  }

  ensureOwnerLeadInactive(ownerId: number, onComplete: () => void): void {
    const row = this.allOwners.find(owner => owner.ownerId === ownerId);
    if (!row) {
      onComplete();
      return;
    }
    if (row.isActive === false) {
      onComplete();
      return;
    }

    this.applyOwnerIsActiveValue(ownerId, false);
    this.updateOwnerLeadFromServer(ownerId, body => {
      body.isActive = false;
    }).pipe(take(1)).subscribe({
      next: () => {
        onComplete();
      },
      error: () => {
        this.applyOwnerIsActiveValue(ownerId, true);
        this.toastr.error('Unable to set owner lead inactive.', CommonMessage.Error);
        onComplete();
      }
    });
  }

  //#endregion

  //#region Form Build methods
  buildLeadStateDropdownCell(leadStateId: number): LeadStateDropdownCell {
    const value = formatLeadStateLabel(leadStateId);
    return {
      value,
      isOverridable: true,
      toString: () => value
    };
  }
  //#endregion

  //#region Form Response Methods
  onOwnerLeadStateDropdownChange(event: LeadOwnerListDisplay & { __changedDropdownColumn?: string }): void {
    if ((event as { __changedDropdownColumn?: string }).__changedDropdownColumn !== 'leadStateDropdown') {
      return;
    }
    const selectedLabel = String(event.leadStateDropdown?.value ?? '').trim();
    const match = LEAD_STATE_SELECT_OPTIONS.find(o => o.label === selectedLabel);
    if (!match) {
      event.leadStateDropdown = this.buildLeadStateDropdownCell(event.leadStateId);
      return;
    }
    const nextLeadStateId = match.value;
    if (nextLeadStateId === event.leadStateId) {
      return;
    }
    const previousLeadStateId = event.leadStateId;
    this.applyOwnerLeadStateId(event.ownerId, nextLeadStateId);
    this.updateOwnerLeadFromServer(event.ownerId, body => {
      body.leadStateId = nextLeadStateId;
    }).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
        this.leadsService.notifyLeadStateChanged();
      },
      error: () => {
        this.applyOwnerLeadStateId(event.ownerId, previousLeadStateId);
        this.toastr.error('Unable to update owner lead.', CommonMessage.Error);
      }
    });
  }

  onOwnerCheckboxChange(event: LeadOwnerListDisplay & { __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean }): void {
    if ((event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }
    this.applyOwnerIsActiveValue(event.ownerId, nextValue);
    this.updateOwnerLeadFromServer(event.ownerId, body => {
      body.isActive = nextValue;
    }).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyOwnerIsActiveValue(event.ownerId, previousValue);
        this.toastr.error('Unable to update owner lead.', CommonMessage.Error);
      }
    });
  }

  applyOwnerLeadStateId(ownerId: number, leadStateId: number): void {
    const patch = (rows: LeadOwnerListDisplay[]) => {
      const r = rows.find(x => x.ownerId === ownerId);
      if (r) {
        r.leadStateId = leadStateId;
        r.leadStateDropdown = this.buildLeadStateDropdownCell(leadStateId);
      }
    };
    patch(this.allOwners);
    patch(this.ownersDisplay);
  }

  applyOwnerIsActiveValue(ownerId: number, isActive: boolean): void {
    const patch = (rows: LeadOwnerListDisplay[]) => {
      const row = rows.find(r => r.ownerId === ownerId);
      if (row) {
        row.isActive = isActive;
      }
    };
    patch(this.allOwners);
    patch(this.ownersDisplay);
  }

  updateOwnerLeadFromServer(ownerId: number, applyPatch: (body: LeadOwnerUpdateRequest) => void) {
    return this.leadsService.getOwnerLeadById(ownerId).pipe(take(1), switchMap(owner => {
      const body = this.mappingService.mapLeadOwnerResponseToUpdateRequest(owner);
      applyPatch(body);
      return this.leadsService.updateOwnerLead(body).pipe(take(1));
    }));
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      return;
    }
    this.officeService
      .ensureOfficesLoaded(organizationId)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: allOffices => {
          this.offices = allOffices || [];
          const initialOfficeId = this.embeddedInShell()
            ? this.officeId()
            : this.globalSelectionService.getSelectedOfficeIdValue();
          this.resolveOfficeScope(initialOfficeId ?? null);
        },
        error: () => {
          this.offices = [];
        }
      });
  }

  loadOwnerLeads(): void {
    this.itemsToLoad$.next(new Set([...this.itemsToLoad$.value, 'owner-leads']));
    this.isServiceError = false;
    this.leadsService.getOwnerLeads().pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-leads'))).subscribe({
      next: rows => {
        this.allOwners = (rows || []).map(row => this.mappingService.mapLeadOwnerListRow(row));
        this.applyOwnerFilters();
        this.leadsService.notifyLeadStateChanged();
      },
      error: () => {
        this.isServiceError = true;
        this.allOwners = [];
        this.ownersDisplay = [];
      }
    });
  }
  //#endregion

  //#region Filter Methods
  scopeOfficeIdForListFilter(): number | null {
    if (this.embeddedInShell()) {
      const id = this.officeId();
      return id != null && id > 0 ? id : null;
    }
    const globalId = this.globalSelectionService.getSelectedOfficeIdValue();
    return globalId != null && globalId > 0 ? globalId : null;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyOwnerFilters();
  }

  applyOwnerFilters(): void {
    let rows = [...this.allOwners];
    const scopeOfficeId = this.scopeOfficeIdForListFilter();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.ownerPassesOfficeFilter(r, scopeOfficeId));
    }
    if (!this.showInactive) {
      rows = rows.filter(r => r.isActive !== false);
    }
    this.ownersDisplay = rows.map(row => ({
      ...row,
      phone: this.formatterService.phoneNumber(row.phone || '') || '',
      leadAttentionDot: this.getLeadAttentionDotValue(row.leadStateId)
    }));
  }

  ownerPassesOfficeFilter(row: LeadOwnerListDisplay, scopeOfficeId: number): boolean {
    const rowOffice = Number(row.officeId);
    return !Number.isNaN(rowOffice) && rowOffice === Number(scopeOfficeId);
  }
  //#endregion

  //#region Office Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyOwnerFilters();
  }

  getLeadAttentionDotValue(leadStateId: number): string {
    return leadStateId === LeadStateType.New ? '●' : '';
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
