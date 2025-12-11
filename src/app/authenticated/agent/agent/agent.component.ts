import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agent.component.html',
  styleUrl: './agent.component.scss'
})

export class AgentComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  agentId: string;
  agent: AgentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;

  constructor(
    public agentService: AgentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService
  ) {
    this.itemsToLoad.push('agent');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.agentId = paramMap.get('id');
        this.isAddMode = this.agentId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('agent');
          this.buildForm();
        } else {
          this.getAgent();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getAgent(): void {
    this.agentService.getAgentByGuid(this.agentId).pipe(take(1), finalize(() => { this.removeLoadItem('agent') })).subscribe({
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
    const agentRequest: AgentRequest = {
      agentCode: formValue.agentCode,
      description: formValue.description,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.agentService.createAgent(agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.AgentList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create agent request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      agentRequest.agentId = this.agentId;
      this.agentService.updateAgent(this.agentId, agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.AgentList);
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
    this.router.navigateByUrl(RouterUrl.AgentList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

