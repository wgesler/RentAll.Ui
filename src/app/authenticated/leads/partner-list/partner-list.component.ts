import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, input, OnChanges, OnDestroy, OnInit, output, SimpleChanges, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { LeadPartnerListDisplay, PartnerEditSelection } from '../models/lead-partner.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-partner-list',
  templateUrl: './partner-list.component.html',
  styleUrls: ['./partner-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PartnerListComponent implements OnInit, OnChanges, OnDestroy {
  officeId = input<number | null>(null);
  requestNewPartner = output<void>();
  requestEditPartner = output<PartnerEditSelection>();

  private toastr = inject(ToastrService);
  private mappingService = inject(MappingService);
  private leadsService = inject(LeadsService);
  private utilityService = inject(UtilityService);
  private officeService = inject(OfficeService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allPartners: LeadPartnerListDisplay[] = [];
  partnersDisplay: LeadPartnerListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;

  partnersDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', wrap: false },
    name: { displayAs: 'Name', maxWidth: '22ch', wrap: false },
    companyName: { displayAs: 'Company', maxWidth: '22ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '28ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '18ch', wrap: false },
    modifiedOn: { displayAs: 'Modified On', maxWidth: '22ch', wrap: false, alignment: 'center' },
    leadStateDropdown: { displayAs: 'Status', wrap: false, maxWidth: '20ch', options: LEAD_STATE_SELECT_OPTIONS.map(o => o.label) },
    businessPreview: { displayAs: 'Business', maxWidth: '24ch', wrap: false },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['partner-leads']));
  destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOffices();
    this.getPartnerLeads();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId());
    }
  }

  addPartnerLead(): void {
    this.requestNewPartner.emit();
  }

  getPartnerLeads(): void {
    this.itemsToLoad$.next(new Set([...this.itemsToLoad$.value, 'partner-leads']));
    this.isServiceError = false;
    this.leadsService.getPartnerLeads().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'partner-leads'))).subscribe({
      next: rows => {
        this.allPartners = (rows || []).map(row => this.mappingService.mapLeadPartnerListRow(row));
        this.applyPartnerFilters();
        this.leadsService.notifyLeadStateChanged();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.allPartners = [];
        this.partnersDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  goToPartner(event: LeadPartnerListDisplay): void {
    if (!event?.partnerId) {
      return;
    }
    this.requestEditPartner.emit({
      partnerId: event.partnerId,
      officeId: event.officeId ?? null
    });
  }

  deletePartner(event: LeadPartnerListDisplay): void {
    if (!event?.partnerId) {
      return;
    }
    this.leadsService.deletePartnerLead(event.partnerId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Partner lead deleted.', CommonMessage.Success);
        this.allPartners = this.allPartners.filter(row => row.partnerId !== event.partnerId);
        this.applyPartnerFilters();
        this.leadsService.notifyLeadStateChanged();
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to delete partner lead.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  buildLeadStateDropdownCell(leadStateId: number): LeadStateDropdownCell {
    const value = formatLeadStateLabel(leadStateId);
    return { value, isOverridable: true, toString: () => value };
  }

  onPartnerLeadStateDropdownChange(event: LeadPartnerListDisplay & { __changedDropdownColumn?: string }): void {
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
    this.applyPartnerLeadStateId(event.partnerId, nextLeadStateId);
    const row = this.allPartners.find(r => r.partnerId === event.partnerId);
    if (!row) {
      return;
    }
    this.leadsService.updatePartnerLead(this.mappingService.mapLeadPartnerListRowToUpdateRequest(row, row.isActive)).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Partner lead updated.', CommonMessage.Success);
        this.leadsService.notifyLeadStateChanged();
        this.markViewForCheck();
      },
      error: () => {
        this.applyPartnerLeadStateId(event.partnerId, previousLeadStateId);
        this.toastr.error('Unable to update partner lead.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  onPartnerCheckboxChange(event: LeadPartnerListDisplay & { __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean }): void {
    if ((event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }
    this.applyPartnerIsActiveValue(event.partnerId, nextValue);
    const body = this.mappingService.mapLeadPartnerListRowToUpdateRequest(event, nextValue);
    this.leadsService.updatePartnerLead(body).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Partner lead updated.', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.applyPartnerIsActiveValue(event.partnerId, previousValue);
        this.toastr.error('Unable to update partner lead.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  applyPartnerLeadStateId(partnerId: number, leadStateId: number): void {
    const patch = (rows: LeadPartnerListDisplay[]) => {
      const row = rows.find(x => x.partnerId === partnerId);
      if (row) {
        row.leadStateId = leadStateId;
        row.leadStateDropdown = this.buildLeadStateDropdownCell(leadStateId);
      }
    };
    patch(this.allPartners);
    patch(this.partnersDisplay);
  }

  applyPartnerIsActiveValue(partnerId: number, isActive: boolean): void {
    const patch = (rows: LeadPartnerListDisplay[]) => {
      const row = rows.find(r => r.partnerId === partnerId);
      if (row) {
        row.isActive = isActive;
      }
    };
    patch(this.allPartners);
    patch(this.partnersDisplay);
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.resolveOfficeScope(this.officeId() ?? null);
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  scopeOfficeIdForListFilter(): number | null {
    const id = this.officeId();
    return id != null && id > 0 ? id : null;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyPartnerFilters();
  }

  applyPartnerFilters(): void {
    let rows = [...this.allPartners];
    const scopeOfficeId = this.scopeOfficeIdForListFilter();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.partnerPassesOfficeFilter(r, scopeOfficeId));
    }
    rows = this.showInactive
      ? rows.filter(r => r.isActive === false)
      : rows.filter(r => r.isActive !== false);
    this.partnersDisplay = rows.map(row => ({
      ...row,
      leadAttentionDot: this.getLeadAttentionDotValue(row.leadStateId)
    }));
  }

  partnerPassesOfficeFilter(row: LeadPartnerListDisplay, scopeOfficeId: number): boolean {
    const rowOffice = Number(row.officeId);
    return !Number.isNaN(rowOffice) && rowOffice === Number(scopeOfficeId);
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.applyPartnerFilters();
  }

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
}
