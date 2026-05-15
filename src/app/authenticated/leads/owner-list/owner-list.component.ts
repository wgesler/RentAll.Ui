import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { LeadOwnerListDisplay } from '../models/lead-owner.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class OwnerListComponent implements OnInit, OnDestroy {
  embeddedInShell = input(false);
  officeId = input<number | null>(null);
  requestNewOwner = output<void>();
  requestEditOwner = output<number>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allOwners: LeadOwnerListDisplay[] = [];
  ownersDisplay: LeadOwnerListDisplay[] = [];

  offices: OfficeResponse[] = [];
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  ownersDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', sort: false, wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '25ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '30ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '20ch', wrap: false },
    leadStateDropdown: { displayAs: 'State', wrap: false, maxWidth: '20ch', sort: false, options: LEAD_STATE_SELECT_OPTIONS.map(o => o.label) },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-leads']));
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private formatterService: FormatterService,
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private authService: AuthService
  ) {
    effect(() => {
      const id = this.officeId();
      void id;
      if (!this.embeddedInShell() || this.offices.length === 0) {
        return;
      }
      this.resolveOfficeScope(this.officeId());
    });
  }

  //#region Owner-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length === 0) {
        return;
      }
      if (this.embeddedInShell()) {
        this.resolveOfficeScope(this.officeId());
        return;
      }
      this.resolveOfficeScope(officeId);
    });

    this.loadOffices();
    this.loadOwnerLeads();
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
    if (this.embeddedInShell()) {
      this.requestEditOwner.emit(event.ownerId);
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
    const row = this.allOwners.find(r => r.ownerId === event.ownerId);
    if (!row) {
      return;
    }
    this.leadsService.updateOwnerLead(this.mappingService.mapLeadOwnerListRowToUpdateRequest(row, row.isActive)).pipe(take(1)).subscribe({
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
    const body = this.mappingService.mapLeadOwnerListRowToUpdateRequest(event, nextValue);
    this.leadsService.updateOwnerLead(body).pipe(take(1)).subscribe({
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
