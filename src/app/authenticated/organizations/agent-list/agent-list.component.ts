import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, take, Subject, takeUntil} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentListDisplay, AgentResponse } from '../models/agent.model';
import { AgentService } from '../services/agent.service';

@Component({
    standalone: true,
    selector: 'app-agent-list',
    templateUrl: './agent-list.component.html',
    styleUrls: ['./agent-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class AgentListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() agentSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allAgents: AgentListDisplay[] = [];
  agentsDisplay: AgentListDisplay[] = [];

  agentsDisplayedColumns: ColumnSet = {
    'agentCode': { displayAs: 'Code', maxWidth: '20ch' },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents']));

  constructor(
    public agentService: AgentService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  //#region Agent-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.getAgents();
  }

  addAgent(): void {
    if (this.embeddedInSettings) {
      this.agentSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Agent, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'); })).subscribe({
      next: (response: AgentResponse[]) => {
        this.allAgents = this.mappingService.mapAgents(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents');
        this.markViewForCheck();
      }
    });
  }

  deleteAgent(agent: AgentListDisplay): void {
    this.agentService.deleteAgent(agent.agentId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Agent deleted successfully', CommonMessage.Success);
        this.getAgents();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToAgent(event: AgentListDisplay): void {
    if (this.embeddedInSettings) {
      this.agentSelected.emit(event.agentId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Agent, [event.agentId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Filtering Methods
  applyFilters(): void {
    this.agentsDisplay = this.showInactive
      ? this.allAgents
      : this.allAgents.filter(agent => agent.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
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
