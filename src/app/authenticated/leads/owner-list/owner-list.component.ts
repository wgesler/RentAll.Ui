import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentService } from '../../organizations/services/agent.service';
import { LeadOwnerListDisplay } from '../models/lead-owner.model';
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

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allOwners: LeadOwnerListDisplay[] = [];
  ownersDisplay: LeadOwnerListDisplay[] = [];

  ownersDisplayedColumns: ColumnSet = {
    ownerId: { displayAs: 'Id', maxWidth: '8ch', alignment: 'center', wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '22ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '24ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '16ch', wrap: false },
    locationOfProperty: { displayAs: 'Location', maxWidth: '22ch', wrap: false },
    leadStateLabel: { displayAs: 'Status', maxWidth: '14ch', wrap: false },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owners']));

  destroy$ = new Subject<void>();

  private readonly agentIdToOfficeId = new Map<string, number>();

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private agentService: AgentService
  ) {
    effect(() => {
      this.officeId();
      this.applyOwnerFilters();
    });
  }

  //#region Owner-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadAgents();
    this.loadOwners();
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

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyOwnerFilters();
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

  goToOwner(event: LeadOwnerListDisplay): void {
    if (!event?.ownerId) {
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
        this.loadOwners();
      },
      error: () => {
        this.toastr.error('Unable to delete owner lead.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadAgents(): void {
    this.agentService
      .getAgents()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(agents => {
        this.agentIdToOfficeId.clear();
        for (const a of agents || []) {
          if (a.agentId) {
            this.agentIdToOfficeId.set(String(a.agentId).trim().toLowerCase(), a.officeId);
          }
        }
        this.applyOwnerFilters();
      });
  }

  loadOwners(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'owners');
    this.isServiceError = false;
    this.leadsService.getOwnerLeads().pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owners'))
    ).subscribe({
      next: rows => {
        this.allOwners = (rows || []).map(row => this.mappingService.mapLeadOwnerListRow(row));
        this.applyOwnerFilters();
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
  applyOwnerFilters(): void {
    let rows = [...this.allOwners];
    const scopeOfficeId = this.officeId();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.ownerPassesOfficeFilter(r, scopeOfficeId));
    }
    if (!this.showInactive) {
      rows = rows.filter(r => r.isActive !== false);
    }
    this.ownersDisplay = rows;
  }

  private ownerPassesOfficeFilter(row: LeadOwnerListDisplay, scopeOfficeId: number): boolean {
    if (!row.agentId) {
      return false;
    }
    const key = String(row.agentId).trim().toLowerCase();
    return (this.agentIdToOfficeId.get(key) ?? -1) === scopeOfficeId;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
