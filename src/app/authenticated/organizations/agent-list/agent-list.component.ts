import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentListDisplay, AgentResponse } from '../models/agent.model';
import { AgentService } from '../services/agent.service';
import { OfficeService } from '../services/office.service';

@Component({
    selector: 'app-agent-list',
    templateUrl: './agent-list.component.html',
    styleUrls: ['./agent-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
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
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public agentService: AgentService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  //#region Agent-List
  ngOnInit(): void {
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
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.removeLoadItem('agents'); })).subscribe({
      next: (response: AgentResponse[]) => {
        this.allAgents = this.mappingService.mapAgents(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Agents', CommonMessage.ServiceError);
        }
        this.removeLoadItem('agents');
      }
    });
  }

  deleteAgent(agent: AgentListDisplay): void {
    if (confirm(`Are you sure you want to delete ${agent.agentCode}?`)) {
      this.agentService.deleteAgent(agent.agentId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Agent deleted successfully', CommonMessage.Success);
          this.getAgents();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete agent. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete agent', CommonMessage.Error);
          }
        }
      });
    }
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
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
