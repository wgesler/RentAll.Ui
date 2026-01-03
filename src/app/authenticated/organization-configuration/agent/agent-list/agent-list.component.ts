import { OnInit, Component, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { AgentResponse, AgentListDisplay } from '../models/agent.model';
import { AgentService } from '../services/agent.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-agent-list',
  templateUrl: './agent-list.component.html',
  styleUrls: ['./agent-list.component.scss'],
  standalone: true,
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
  offices: OfficeResponse[] = [];

  agentsDisplayedColumns: ColumnSet = {
    'agentCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'officeName': { displayAs: 'Primary Office', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public agentService: AgentService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  ngOnInit(): void {
    this.loadOffices();
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
        this.allAgents = this.mappingService.mapAgents(response, this.offices);
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

  // Data Loading Methods
  loadOffices(): void {
    this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = offices || [];
        this.getAgents();
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.getAgents();
      }
    });
  }

  // Filtering Methods
  applyFilters(): void {
    this.agentsDisplay = this.showInactive
      ? this.allAgents
      : this.allAgents.filter(agent => agent.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
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
}
