import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, concatMap, filter, finalize, from, map, of, take, takeUntil, toArray } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../models/office.model';
import { TrackerContextType, getTrackerContextTypes, toTrackerContextType } from '../models/tracker-enum';
import { TrackerDefinitionListDisplay, TrackerDefinitionOptionRequest, TrackerDefinitionOptionResponse, TrackerDefinitionRequest } from '../models/tracker.model';
import { OfficeService } from '../services/office.service';
import { TrackerService } from '../services/tracker.service';

interface TrackerOptionEditorRow {
  trackerDefinitionOptionId?: string;
  label: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

@Component({
    standalone: true,
    selector: 'app-tracker',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './tracker.component.html',
    styleUrl: './tracker.component.scss'
})
export class TrackerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | null = null;
  @Input() embeddedInSettings: boolean = false;
  @Input() selectedOfficeId: number | null = null;
  @Input() selectedTrackerContextId: TrackerContextType | null = null;
  @Input() suggestedSortOrder: number | null = null;
  @Input() trackerData: TrackerDefinitionListDisplay | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;

  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  tracker: TrackerDefinitionListDisplay | null = null;
  trackerOptionType: 'single' | 'multi' = 'single';
  optionRows: TrackerOptionEditorRow[] = [];
  originalOptions: TrackerDefinitionOptionResponse[] = [];
  form: FormGroup;

  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  trackerContextOptions: { value: TrackerContextType, label: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public trackerService: TrackerService,
    public fb: FormBuilder,
    private authService: AuthService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private toastr: ToastrService,
    private utilityService: UtilityService
  ) {
  }

  //#region Tracker
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.loadTrackerContextOptions();

    if (this.id) {
      this.initializeModeFromId(this.id);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.initializeModeFromId(changes['id'].currentValue);
    }

    if (changes['selectedTrackerContextId'] && this.isAddMode) {
      this.applyContextScopeForAddMode();
    }

    if (changes['suggestedSortOrder'] && this.isAddMode) {
      this.applySuggestedSortOrder();
    }
  }

  initializeModeFromId(id: string | null): void {
    this.isAddMode = id === 'new';
    if (this.isAddMode) {
      this.tracker = null;
      this.trackerOptionType = 'single';
      this.optionRows = [];
      this.originalOptions = [];
      this.buildForm();
      if (this.selectedOfficeId != null) {
        this.form.patchValue({ officeId: this.selectedOfficeId }, { emitEvent: false });
      }
      this.applyContextScopeForAddMode();
      this.applySuggestedSortOrder();
      this.scheduleFocusFirstField();
      return;
    }
    if (id && this.trackerData) {
      this.tracker = this.trackerData;
      this.originalOptions = [...(this.trackerData.options || [])];
      this.buildForm();
      this.populateForm();
      return;
    }

    this.isServiceError = true;
  }

  saveTracker(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.authService.getUser();
    if (!user?.organizationId) {
      this.toastr.error('Organization is required', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const trackerRequest: TrackerDefinitionRequest = {
      organizationId: user.organizationId,
      officeId: Number(formValue.officeId),
      trackerContextId: toTrackerContextType(formValue.trackerContextId),
      displayName: formValue.displayName,
      description: formValue.description || undefined,
      sortOrder: Number(formValue.sortOrder) || 0,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.trackerService.createTrackerDefinition(trackerRequest).pipe(take(1),
        concatMap(created => this.saveOptionChanges(created.trackerDefinitionId).pipe(map(() => created))),
        finalize(() => this.isSubmitting = false)).subscribe({
        next: () => {
          this.toastr.success('Tracker created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
      return;
    }

    if (!this.id) {
      this.isSubmitting = false;
      return;
    }

    trackerRequest.trackerDefinitionId = this.id;
    this.trackerService.updateTrackerDefinition(trackerRequest).pipe(take(1),
      concatMap(() => this.saveOptionChanges(this.id as string)),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        this.toastr.success('Tracker updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
    });
  }

  loadTrackerContextOptions(): void {
    this.trackerContextOptions = getTrackerContextTypes()
      .filter(context => context.value > TrackerContextType.Unknown)
      .map(context => ({
        value: toTrackerContextType(context.value),
        label: context.label
      }));
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      officeId: new FormControl(null, [Validators.required]),
      trackerContextId: new FormControl(null, [Validators.required]),
      displayName: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      sortOrder: new FormControl(0, [Validators.required, Validators.min(0)]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (!this.tracker || !this.form) {
      return;
    }
    this.form.patchValue({
      officeId: this.tracker.officeId,
      trackerContextId: this.tracker.trackerContextId,
      displayName: this.tracker.displayName,
      description: this.tracker.description || '',
      sortOrder: this.tracker.sortOrder,
      isActive: this.tracker.isActive
    }, { emitEvent: false });

    this.trackerOptionType = this.originalOptions.length > 0 ? 'multi' : 'single';
    this.optionRows = this.originalOptions.map(option => ({
      trackerDefinitionOptionId: option.trackerDefinitionOptionId,
      label: option.label,
      description: option.optionDescription || '',
      sortOrder: option.optionSortOrder,
      isActive: option.isActive
    }));
  }
  //#endregion

  //#region Form Response Methods
  applyContextScopeForAddMode(): void {
    if (!this.form || !this.isAddMode) {
      return;
    }

    const trackerContextControl = this.form.get('trackerContextId');
    if (!trackerContextControl) {
      return;
    }

    const hasScopedContext = this.selectedTrackerContextId != null && this.selectedTrackerContextId > TrackerContextType.Unknown;
    if (hasScopedContext) {
      trackerContextControl.patchValue(this.selectedTrackerContextId, { emitEvent: false });
      trackerContextControl.disable({ emitEvent: false });
      return;
    }

    trackerContextControl.enable({ emitEvent: false });
  }

  applySuggestedSortOrder(): void {
    if (!this.form || !this.isAddMode || this.suggestedSortOrder == null) {
      return;
    }

    const sortControl = this.form.get('sortOrder');
    if (!sortControl) {
      return;
    }

    if (!sortControl.dirty || sortControl.value == null || Number(sortControl.value) === 0) {
      sortControl.patchValue(this.suggestedSortOrder, { emitEvent: false });
    }
  }

  onTrackerOptionTypeChange(optionType: 'single' | 'multi'): void {
    this.trackerOptionType = optionType;
    if (optionType === 'multi' && this.optionRows.length === 0) {
      this.addOptionRow();
    }
  }

  addOptionRow(): void {
    this.optionRows.push({
      label: '',
      description: '',
      sortOrder: this.optionRows.length,
      isActive: true
    });
  }

  removeOptionRow(index: number): void {
    if (index < 0 || index >= this.optionRows.length) {
      return;
    }
    this.optionRows.splice(index, 1);
    this.optionRows = this.optionRows.map((row, idx) => ({
      ...row,
      sortOrder: idx
    }));
  }

  saveOptionChanges(trackerDefinitionId: string): Observable<void> {
    const originalById = new Map((this.originalOptions || []).map(option => [option.trackerDefinitionOptionId, option]));
    const normalizedRows = this.trackerOptionType === 'multi'
      ? this.optionRows
          .map((row, idx) => ({
            ...row,
            label: (row.label || '').trim(),
            description: (row.description || '').trim(),
            sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : idx
          }))
          .filter(row => row.label.length > 0)
      : [];

    const commands: Observable<unknown>[] = [];

    const normalizedIds = new Set<string>();
    normalizedRows.forEach(row => {
      if (row.trackerDefinitionOptionId) {
        normalizedIds.add(row.trackerDefinitionOptionId);
      }
    });

    if (this.trackerOptionType === 'single') {
      this.originalOptions.forEach(option => {
        commands.push(this.trackerService.deleteTrackerDefinitionOption(option.trackerDefinitionOptionId));
      });
    } else {
      this.originalOptions.forEach(option => {
        if (!normalizedIds.has(option.trackerDefinitionOptionId)) {
          commands.push(this.trackerService.deleteTrackerDefinitionOption(option.trackerDefinitionOptionId));
        }
      });

      normalizedRows.forEach(row => {
        const optionRequest: TrackerDefinitionOptionRequest = {
          trackerDefinitionId: trackerDefinitionId,
          label: row.label,
          description: row.description || undefined,
          sortOrder: row.sortOrder,
          isActive: row.isActive
        };

        if (row.trackerDefinitionOptionId && originalById.has(row.trackerDefinitionOptionId)) {
          optionRequest.trackerDefinitionOptionId = row.trackerDefinitionOptionId;
          commands.push(this.trackerService.updateTrackerDefinitionOption(optionRequest));
          return;
        }

        commands.push(this.trackerService.createTrackerDefinitionOption(optionRequest));
      });
    }

    if (commands.length === 0) {
      return of(void 0);
    }

    return from(commands).pipe(concatMap(command => command), toArray(), map(() => void 0));
  }

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

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (this.form?.valid && !this.isSubmitting) {
      this.saveTracker();
    }
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
  //#endregion
}
