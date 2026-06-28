import { CommonModule } from '@angular/common';
import { Clipboard } from '@angular/cdk/clipboard';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, input, NgZone, OnChanges, OnDestroy, OnInit, output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType, OwnerType } from '../../contacts/models/contact-enum';
import { ContactRequest } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { LeadOwnerListDisplay, OwnerEditSelection } from '../models/lead-owner.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerListComponent implements OnInit, OnChanges, OnDestroy {
  officeId = input<number | null>(null);
  requestNewOwner = output<void>();
  requestEditOwner = output<OwnerEditSelection>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allOwners: LeadOwnerListDisplay[] = [];
  ownersDisplay: LeadOwnerListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  isOwnerAdmin = false;

  ownersDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', sort: false, wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '25ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '30ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '20ch', wrap: false },
    modifiedOn: { displayAs: 'Modified On', maxWidth: '22ch', wrap: false, alignment: 'center' },
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
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  //#region Owner-List
  ngOnInit(): void {
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';

    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.loadOffices();
    this.loadOwnerLeads();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId());
    }
  }

  addOwnerLead(): void {
    this.requestNewOwner.emit();
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
    this.requestEditOwner.emit({
      ownerId: event.ownerId,
      officeId: ownerOfficeId
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
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to delete owner lead.', CommonMessage.Error);
        this.markViewForCheck();
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
          this.markViewForCheck();
          return;
        }
        this.toastr.error('Unable to copy owner form link.', CommonMessage.Error);
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to generate owner form share link.', CommonMessage.Error);
        this.markViewForCheck();
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
              this.markViewForCheck();
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
              address1: '',
              city: '',
              state: '',
              zip: '',
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
        this.markViewForCheck();
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
    this.leadsService.patchOwnerLead(ownerId, body => {
      body.isActive = false;
    }).pipe(take(1)).subscribe({
      next: () => {
        onComplete();
        this.markViewForCheck();
      },
      error: () => {
        this.applyOwnerIsActiveValue(ownerId, true);
        this.toastr.error('Unable to set owner lead inactive.', CommonMessage.Error);
        onComplete();
        this.markViewForCheck();
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
    this.leadsService.patchOwnerLead(event.ownerId, body => {
      body.leadStateId = nextLeadStateId;
    }).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
        this.leadsService.notifyLeadStateChanged();
        this.markViewForCheck();
      },
      error: () => {
        this.applyOwnerLeadStateId(event.ownerId, previousLeadStateId);
        this.toastr.error('Unable to update owner lead.', CommonMessage.Error);
        this.markViewForCheck();
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
    this.leadsService.patchOwnerLead(event.ownerId, body => {
      body.isActive = nextValue;
    }).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.applyOwnerIsActiveValue(event.ownerId, previousValue);
        this.toastr.error('Unable to update owner lead.', CommonMessage.Error);
        this.markViewForCheck();
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
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          const initialOfficeId = this.officeId();
          this.resolveOfficeScope(initialOfficeId ?? null);
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  loadOwnerLeads(): void {
    this.itemsToLoad$.next(new Set([...this.itemsToLoad$.value, 'owner-leads']));
    this.isServiceError = false;
    this.leadsService.getOwnerLeads().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-leads'))).subscribe({
      next: rows => {
        this.allOwners = (rows || []).map(row => this.mappingService.mapLeadOwnerListRow(row));
        this.applyOwnerFilters();
        this.leadsService.notifyLeadStateChanged();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.allOwners = [];
        this.ownersDisplay = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  scopeOfficeIdForListFilter(): number | null {
    const id = this.officeId();
    return id != null && id > 0 ? id : null;
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
    rows = this.showInactive
      ? rows.filter(r => r.isActive === false)
      : rows.filter(r => r.isActive !== false);
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

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.applyOwnerFilters();
  }
  //#endregion

  //#region Utility Methods
  getLeadAttentionDotValue(leadStateId: number): string {
    return leadStateId === LeadStateType.New ? '●' : '';
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
    
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
