import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { AgentService } from '../services/agent.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { AgentResponse, AgentRequest } from '../models/agent.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agent.component.html',
  styleUrl: './agent.component.scss'
})

export class AgentComponent implements OnInit, OnChanges {
  @Input() agentId: string | number | null = null;
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
  offices: OfficeResponse[] = [];

  constructor(
    public agentService: AgentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService
  ) {
    this.itemsToLoad.push('agent');
  }

  ngOnInit(): void {
    this.loadOffices();
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
        this.isAddMode = this.agentId === 'new' || this.agentId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('agent');
          this.buildForm();
        } else {
          this.getAgent(this.agentId.toString());
        }
      }
    }
  }

  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) return;

    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === orgId && o.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Agent Component - Error loading offices:', err);
        this.offices = [];
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and agentId changes, reload agent
    if (this.embeddedMode && changes['agentId'] && !changes['agentId'].firstChange) {
      const newId = changes['agentId'].currentValue;
      if (newId && newId !== 'new') {
        this.getAgent(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('agent');
        this.buildForm();
      }
    }
  }

  getAgent(id?: string | number): void {
    const idToUse = id || this.agentId || this.routeAgentId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const agentIdStr = idToUse.toString();
    this.agentService.getAgentByGuid(agentIdStr).pipe(take(1), finalize(() => { this.removeLoadItem('agent') })).subscribe({
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

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ agentCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
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
      name: formValue.name,
      officeId: formValue.officeId ? Number(formValue.officeId) : undefined,
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
      const idToUse = this.agentId || this.routeAgentId;
      const agentIdStr = idToUse?.toString() || '';
      agentRequest.agentId = agentIdStr;
      agentRequest.organizationId = this.agent?.organizationId || user?.organizationId || '';
      this.agentService.updateAgent(agentIdStr, agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
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

  // Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      agentCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      officeId: new FormControl(null),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.agent && this.form) {
      this.form.patchValue({
        agentCode: this.agent.agentCode?.toUpperCase() || '',
        name: this.agent.name,
        officeId: this.agent.officeId || null,
        isActive: this.agent.isActive
      });
    }
  }

  // Utilty Methods
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


