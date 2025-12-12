import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { AgentResponse, AgentListDisplay } from '../models/agent.model';
import { AgentService } from '../services/agent.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-agent-list',
  templateUrl: './agent-list.component.html',
  styleUrls: ['./agent-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class AgentListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  agentsDisplayedColumns: ColumnSet = {
    'agentCode': { displayAs: 'Agent Code', maxWidth: '15ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allAgents: AgentListDisplay[] = [];
  agentsDisplay: AgentListDisplay[] = [];

  constructor(
    public agentService: AgentService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('agents');
  }

  ngOnInit(): void {
    this.getAgents();
  }

  addAgent(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Agent, ['new']));
  }

  getAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.removeLoadItem('agents') })).subscribe({
      next: (response: AgentResponse[]) => {
        this.allAgents = this.mappingService.mapAgents(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Agents', CommonMessage.ServiceError);
        }
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

  applyFilters(): void {
    this.agentsDisplay = this.showInactive
      ? this.allAgents
      : this.allAgents.filter(agent => agent.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  goToAgent(event: AgentListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Agent, [event.agentId]));
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}


