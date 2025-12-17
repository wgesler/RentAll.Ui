import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { AgentService } from '../services/agent.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { AgentResponse, AgentRequest } from '../models/agent.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NavigationContextService } from '../../../services/navigation-context.service';

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agent.component.html',
  styleUrl: './agent.component.scss'
})

export class AgentComponent implements OnInit, OnChanges {
  @Input() agentId: string | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  private routeAgentId: string | null = null;
  agent: AgentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;

  constructor(
    public agentService: AgentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService
  ) {
    this.itemsToLoad.push('agent');
  }

  ngOnInit(): void {
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get agent ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeAgentId = paramMap.get('id');
          this.isAddMode = this.routeAgentId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('agent');
            this.buildForm();
          } else {
            this.getAgent(this.routeAgentId);
          }
        }
      });
      if (!this.isAddMode) {
        this.buildForm();
      }
    } else {
      // In embedded mode, use the input agentId
      if (this.agentId) {
        this.isAddMode = this.agentId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('agent');
          this.buildForm();
        } else {
          this.getAgent(this.agentId);
        }
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and agentId changes, reload agent
    if (this.embeddedMode && changes['agentId'] && !changes['agentId'].firstChange) {
      const newAgentId = changes['agentId'].currentValue;
      if (newAgentId && newAgentId !== 'new') {
        this.getAgent(newAgentId);
      } else if (newAgentId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('agent');
        this.buildForm();
      }
    }
  }

  getAgent(id?: string): void {
    const agentIdToUse = id || this.agentId || this.routeAgentId;
    if (!agentIdToUse || agentIdToUse === 'new') {
      return;
    }
    this.agentService.getAgentByGuid(agentIdToUse).pipe(take(1), finalize(() => { this.removeLoadItem('agent') })).subscribe({
      next: (response: AgentResponse) => {
        this.agent = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load agent info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveAgent(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const agentRequest: AgentRequest = {
      organizationId: user?.organizationId || '',
      agentCode: formValue.agentCode,
      description: formValue.description,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.agentService.createAgent(agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AgentList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create agent request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const agentIdToUse = this.agentId || this.routeAgentId;
      agentRequest.agentId = agentIdToUse;
      agentRequest.organizationId = this.agent?.organizationId || user?.organizationId || '';
      this.agentService.updateAgent(agentIdToUse, agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AgentList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update agent request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  buildForm(): void {
    this.form = this.fb.group({
      agentCode: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.agent && this.form) {
      this.form.patchValue({
        agentCode: this.agent.agentCode,
        description: this.agent.description,
        isActive: this.agent.isActive
      });
    }
  }

  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.AgentList);
    }
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}



