import { CommonModule } from '@angular/common';
import { Component, input, NgZone, OnChanges, OnDestroy, OnInit, output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, concatMap, finalize, take, takeUntil } from 'rxjs';
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
import { LeadGeneralListDisplay } from '../models/lead-general.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-general-list',
  templateUrl: './general-list.component.html',
  styleUrls: ['./general-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class GeneralListComponent implements OnInit, OnChanges, OnDestroy {
  embeddedInShell = input(false);
  officeId = input<number | null>(null);
  requestNewGeneral = output<void>();
  requestEditGeneral = output<number>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allGenerals: LeadGeneralListDisplay[] = [];
  generalsDisplay: LeadGeneralListDisplay[] = [];

  offices: OfficeResponse[] = [];
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  generalsDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', sort: false, wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '25ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '30ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '20ch', wrap: false },
    modifiedOn: { displayAs: 'Modified On', maxWidth: '22ch', wrap: false, alignment: 'center' },
    leadStateDropdown: { displayAs: 'Status', wrap: false, maxWidth: '20ch', sort: false, options: LEAD_STATE_SELECT_OPTIONS.map(o => o.label) },
    messagePreview: { displayAs: 'Message', maxWidth: '25ch', wrap: false },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['general-leads']));
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
  ) { }

  //#region General-List
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
    this.loadGeneralLeads();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embeddedInShell()) {
      return;
    }
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId());
    }
  }

  addGeneralLead(): void {
    if (this.embeddedInShell()) {
      this.requestNewGeneral.emit();
      return;
    }
    this.ngZone.run(() => {
      void this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadGeneral, ['new']));
    });
  }

  goToGeneral(event: LeadGeneralListDisplay): void {
    if (!event?.generalId) {
      return;
    }
    if (this.embeddedInShell()) {
      this.requestEditGeneral.emit(event.generalId);
      return;
    }
    this.ngZone.run(() => {
      void this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadGeneral, [String(event.generalId)]));
    });
  }

  deleteGeneral(event: LeadGeneralListDisplay): void {
    if (!event?.generalId) {
      return;
    }
    this.leadsService.deleteGeneralLead(event.generalId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('General lead deleted.', CommonMessage.Success);
        this.loadGeneralLeads();
      },
      error: () => {
        this.toastr.error('Unable to delete general lead.', CommonMessage.Error);
      }
    });
  }

  convertGeneralToRental(event: LeadGeneralListDisplay): void {
    if (!event?.generalId) {
      return;
    }

    const createBody = this.mappingService.mapLeadGeneralToRentalRequest(event);
    this.leadsService.createRentalLead(createBody).pipe(take(1), concatMap(() => this.leadsService.deleteGeneralLead(event.generalId))).subscribe({
      next: () => {
        this.toastr.success('General lead moved to Rental leads.', CommonMessage.Success);
        this.loadGeneralLeads();
      },
      error: () => {
        this.toastr.error('Unable to move general lead to Rental leads.', CommonMessage.Error);
      }
    });
  }

  convertGeneralToOwner(event: LeadGeneralListDisplay): void {
    if (!event?.generalId) {
      return;
    }

    const createBody = this.mappingService.mapLeadGeneralToOwnerRequest(event);
    this.leadsService.createOwnerLead(createBody).pipe(take(1),concatMap(() => this.leadsService.deleteGeneralLead(event.generalId))).subscribe({
      next: () => {
        this.toastr.success('General lead moved to Owner leads.', CommonMessage.Success);
        this.loadGeneralLeads();
      },
      error: () => {
        this.toastr.error('Unable to move general lead to Owner leads.', CommonMessage.Error);
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
  onGeneralLeadStateDropdownChange(event: LeadGeneralListDisplay & { __changedDropdownColumn?: string }): void {
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
    this.applyGeneralLeadStateId(event.generalId, nextLeadStateId);
    const row = this.allGenerals.find(r => r.generalId === event.generalId);
    if (!row) {
      return;
    }
    this.leadsService.updateGeneralLead(this.mappingService.mapLeadGeneralListRowToUpdateRequest(row, row.isActive)).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('General lead updated.', CommonMessage.Success);
        this.leadsService.notifyLeadStateChanged();
      },
      error: () => {
        this.applyGeneralLeadStateId(event.generalId, previousLeadStateId);
        this.toastr.error('Unable to update general lead.', CommonMessage.Error);
      }
    });
  }

  onGeneralCheckboxChange(
    event: LeadGeneralListDisplay & { __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean }
  ): void {
    if ((event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }
    this.applyGeneralIsActiveValue(event.generalId, nextValue);
    const body = this.mappingService.mapLeadGeneralListRowToUpdateRequest(event, nextValue);
    this.leadsService.updateGeneralLead(body).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('General lead updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyGeneralIsActiveValue(event.generalId, previousValue);
        this.toastr.error('Unable to update general lead.', CommonMessage.Error);
      }
    });
  }

  applyGeneralLeadStateId(generalId: number, leadStateId: number): void {
    const patch = (rows: LeadGeneralListDisplay[]) => {
      const r = rows.find(x => x.generalId === generalId);
      if (r) {
        r.leadStateId = leadStateId;
        r.leadStateDropdown = this.buildLeadStateDropdownCell(leadStateId);
      }
    };
    patch(this.allGenerals);
    patch(this.generalsDisplay);
  }

  applyGeneralIsActiveValue(generalId: number, isActive: boolean): void {
    const patch = (rows: LeadGeneralListDisplay[]) => {
      const row = rows.find(r => r.generalId === generalId);
      if (row) {
        row.isActive = isActive;
      }
    };
    patch(this.allGenerals);
    patch(this.generalsDisplay);
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

  loadGeneralLeads(): void {
    this.isServiceError = false;
    this.leadsService.getGeneralLeads().pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'general-leads'))).subscribe({
      next: rows => {
        this.allGenerals = (rows || []).map(row => this.mappingService.mapLeadGeneralListRow(row));
        this.applyGeneralFilters();
        this.leadsService.notifyLeadStateChanged();
      },
      error: () => {
        this.isServiceError = true;
        this.allGenerals = [];
        this.generalsDisplay = [];
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
    this.applyGeneralFilters();
  }

  applyGeneralFilters(): void {
    let rows = [...this.allGenerals];
    const scopeOfficeId = this.scopeOfficeIdForListFilter();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.generalPassesOfficeFilter(r, scopeOfficeId));
    }
    if (!this.showInactive) {
      rows = rows.filter(r => r.isActive !== false);
    }
    this.generalsDisplay = rows.map(row => ({
      ...row,
      phone: this.formatterService.phoneNumber(row.phone || '') || '',
      leadAttentionDot: this.getLeadAttentionDotValue(row.leadStateId)
    }));
  }

  generalPassesOfficeFilter(row: LeadGeneralListDisplay, scopeOfficeId: number): boolean {
    const rowOffice = Number(row.officeId);
    return !Number.isNaN(rowOffice) && rowOffice === Number(scopeOfficeId);
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyGeneralFilters();
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
