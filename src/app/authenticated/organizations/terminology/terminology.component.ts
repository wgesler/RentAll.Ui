import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { TerminologyRequest, TerminologyResponse } from '../models/terminology.model';
import { TerminologyService } from '../services/terminology.service';

@Component({
  standalone: true,
  selector: 'app-terminology',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './terminology.component.html',
  styleUrl: './terminology.component.scss'
})
export class TerminologyComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() officeId: number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  private terminologyService = inject(TerminologyService);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

  terminology: TerminologyResponse | null = null;
  form: FormGroup;
  isSubmitting = false;
  isAddMode = false;
  isServiceError = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['terminology']));
  destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadForId(this.id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.loadForId(changes['id'].currentValue);
    }
  }

  loadForId(id: string | number | null): void {
    this.isAddMode = id === 'new';
    this.isServiceError = false;
    if (this.isAddMode) {
      this.terminology = null;
      this.buildForm();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'terminology');
      return;
    }
    const termId = typeof id === 'number' ? id : parseInt(String(id ?? ''), 10);
    if (!Number.isFinite(termId) || termId <= 0) {
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'terminology');
      return;
    }
    this.terminologyService.getTerminologyById(termId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'terminology'))).subscribe({
      next: response => {
        this.terminology = response;
        this.buildForm();
        this.form.patchValue({ term: response.term, replacement: response.replacement });
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Unable to load term.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  saveTerminology(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }
    const officeId = this.isAddMode ? this.officeId : this.terminology?.officeId;
    if (officeId == null || officeId <= 0) {
      this.toastr.error('Select an office before saving a term.', CommonMessage.Error);
      return;
    }
    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();
    const request: TerminologyRequest = {
      organizationId: this.terminology?.organizationId || user?.organizationId || '',
      officeId,
      term: String(formValue.term || '').trim(),
      replacement: String(formValue.replacement || '').trim()
    };
    this.isSubmitting = true;
    if (this.isAddMode) {
      this.terminologyService.createTerminology(request).pipe(take(1), finalize(() => { this.isSubmitting = false; this.markViewForCheck(); })).subscribe({
        next: () => {
          this.toastr.success('Term created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => this.showSaveError(err)
      });
      return;
    }
    request.termId = this.terminology?.termId;
    this.terminologyService.updateTerminology(request).pipe(take(1), finalize(() => { this.isSubmitting = false; this.markViewForCheck(); })).subscribe({
      next: () => {
        this.toastr.success('Term updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: (err: HttpErrorResponse) => this.showSaveError(err)
    });
  }

  showSaveError(err: HttpErrorResponse): void {
    this.toastr.error(err.status === 409 ? 'This term already exists for the office.' : 'Unable to save term.', CommonMessage.Error);
  }

  back(): void {
    this.backEvent.emit();
  }

  buildForm(): void {
    this.form = this.fb.group({
      term: new FormControl(this.terminology?.term || '', [Validators.required, Validators.maxLength(200)]),
      replacement: new FormControl(this.terminology?.replacement || '', [Validators.required, Validators.maxLength(200)])
    });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
