import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
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
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agent.component.html',
  styleUrl: './agent.component.scss'
})

export class AgentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() agentId: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeAgentId: string | null = null;
  agent: AgentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agent', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public agentService: AgentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService,
    private formatterService: FormatterService,
    private mappingService: MappingService
  ) {
  }

  //#region
  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input agentId
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

  ngOnChanges(changes: SimpleChanges): void {
    // If agentId changes, reload agent
    if (changes['agentId'] && !changes['agentId'].firstChange) {
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
    this.agentService.getAgentByGuid(agentIdStr).pipe(take(1), finalize(() => { this.removeLoadItem('agent'); })).subscribe({
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
        this.removeLoadItem('agent');
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
      name: formValue.name,
      officeId: formValue.officeId ? Number(formValue.officeId) : undefined,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.agentService.createAgent(agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
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
      this.agentService.updateAgent(agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update agent request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }
  //#endregion
  
  //#region Data Loading Methods
  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.removeLoadItem('offices');
    });
  }
  //#endregion

  //#region Form Methods
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
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('agentCode'));
  } 

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
  //#endregion
}





