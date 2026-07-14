import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AgentRequest, AgentResponse } from '../models/agent.model';
import { OfficeResponse } from '../models/office.model';
import { AgentService } from '../services/agent.service';
import { GlobalSelectionService } from '../services/global-selection.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-agent',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './agent.component.html',
    styleUrl: './agent.component.scss'
})

export class AgentComponent implements OnInit, OnDestroy, OnChanges {

  @Input() agentId: string | number | null = null;
  @Input() officeId: number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  agentService = inject(AgentService);
  router = inject(Router);
  fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private formatterService = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;
  
  isServiceError: boolean = false;
  routeAgentId: string | null = null;
  agent: AgentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agent', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  //#region Agent
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    // Use the input agentId
    if (this.agentId) {
      this.isAddMode = this.agentId === 'new' || this.agentId === 'new';
      if (this.isAddMode) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agent');
        this.buildForm();
        this.applyDefaultOfficeOnAdd();
        this.scheduleFocusFirstField();
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agent');
        this.buildForm();
        this.applyDefaultOfficeOnAdd();
        this.scheduleFocusFirstField();
      }
    }
    if (changes['officeId'] && this.isAddMode && this.form) {
      this.applyDefaultOfficeOnAdd();
    }
  }

  getAgent(id?: string | number): void {
    const idToUse = id || this.agentId || this.routeAgentId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const agentIdStr = idToUse.toString();
    this.agentService.getAgentByGuid(agentIdStr).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agent'); })).subscribe({
      next: (response: AgentResponse) => {
        this.agent = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agent');
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
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    } else {
      const idToUse = this.agentId || this.routeAgentId;
      const agentIdStr = idToUse?.toString() || '';
      agentRequest.agentId = agentIdStr;
      agentRequest.organizationId = this.agent?.organizationId || user?.organizationId || '';
      this.agentService.updateAgent(agentRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AgentResponse) => {
          this.toastr.success('Agent updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    }
  }
  //#endregion
  
  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = this.globalSelectionService.filterOfficeListForUser(offices || []);
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        if (this.isAddMode && this.form) {
          this.applyDefaultOfficeOnAdd();
        }
      });
    });
  }
  //#endregion

  //#region Form Methods
  applyDefaultOfficeOnAdd(): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    const scopedOfficeId = this.officeId ?? this.globalSelectionService.getSelectedOfficeIdValue();
    const defaultOffice = this.utilityService.resolveSelectedOfficeById(this.offices, scopedOfficeId);
    if (defaultOffice) {
      this.form.patchValue({ officeId: defaultOffice.officeId }, { emitEvent: false });
    }
  }
  buildForm(): void {
    this.form = this.fb.group({
      agentCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      officeId: new FormControl(null, [Validators.required]),
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

  //#region Form Response Methods
  focusFirstField(): void {
    const el = this.firstInputRef?.nativeElement;
    if (el?.focus) {
      el.focus();
    }
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }

  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('agentCode'));
  } 

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (this.form?.valid && !this.isSubmitting) {
      this.saveAgent();
    }
  }
  //#endregion

  //#region Utility Methods
  back(): void {
    this.backEvent.emit();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}





