import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, skip, take, Subject, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentListDisplay, agentHasOfficeAccess, normalizeAgentOffices } from '../models/agent.model';
import { OfficeResponse } from '../models/office.model';
import { AgentService } from '../services/agent.service';
import { GlobalSelectionService } from '../services/global-selection.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-agent-list',
    templateUrl: './agent-list.component.html',
    styleUrls: ['./agent-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class AgentListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  /** When true (default), filter by the header office selector. Settings embed sets this false and passes officeId. */
  @Input() useGlobalOfficeSelection = true;
  @Output() agentSelected = new EventEmitter<string | number | null>();
  agentService = inject(AgentService);
  toastr = inject(ToastrService);
  mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allAgents: AgentListDisplay[] = [];
  agentsDisplay: AgentListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officeScopeResolved = false;

  agentsDisplayedColumns: ColumnSet = {
    'agentCode': { displayAs: 'Code', maxWidth: '20ch' },
    'officeName': { displayAs: 'Offices', maxWidth: '25ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'officeScope']));

  //#region Agent-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.loadAgents();

    if (this.useGlobalOfficeSelection) {
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(officeId);
          this.markViewForCheck();
        }
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.useGlobalOfficeSelection && changes['officeId'] && this.offices.length > 0) {
      this.resolveOfficeScope(changes['officeId'].currentValue);
      this.markViewForCheck();
    }
  }

  addAgent(): void {
    this.agentSelected.emit('new');
  }

  loadAgents(): void {
    this.agentService.ensureAgentsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'); })).subscribe({
      next: () => {
        this.agentService.getAllAgents().pipe(takeUntil(this.destroy$)).subscribe(agents => {
          this.allAgents = this.mappingService.mapAgents(agents || [], this.offices);
          this.applyFilters();
          this.markViewForCheck();
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.allAgents = [];
        this.agentsDisplay = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents');
        this.markViewForCheck();
      }
    });
  }

  deleteAgent(agent: AgentListDisplay): void {
    this.agentService.deleteAgent(agent.agentId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Agent deleted successfully', CommonMessage.Success);
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToAgent(event: AgentListDisplay): void {
    this.agentSelected.emit(event.agentId);
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        this.offices = this.globalSelectionService.filterOfficeListForUser(allOffices || []);
        this.resolveOfficeScope(this.useGlobalOfficeSelection ? this.globalSelectionService.getSelectedOfficeIdValue() : this.officeId);
        this.markViewForCheck();
      });
    });
  }
  //#endregion

  //#region Filtering Methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allAgents;
    if (this.selectedOffice) {
      filtered = filtered.filter(agent => agentHasOfficeAccess(agent, this.selectedOffice!.officeId));
    } else {
      const accessibleOfficeIds = new Set(this.offices.map(office => office.officeId));
      if (accessibleOfficeIds.size > 0) {
        filtered = filtered.filter(agent =>
          normalizeAgentOffices(agent.offices, agent.officeId).some(id => accessibleOfficeIds.has(id))
        );
      }
    }

    this.agentsDisplay = this.showInactive
      ? filtered.filter(agent => agent.isActive === false)
      : filtered.filter(agent => agent.isActive === true);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Form Response Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
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
