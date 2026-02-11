import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { ReservationStatus } from '../../reservations/models/reservation-enum';
import { ColorRequest, ColorResponse } from '../models/color.model';
import { ColorService } from '../services/color.service';

@Component({
    selector: 'app-color',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './color.component.html',
    styleUrl: './color.component.scss'
})

export class ColorComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeColorId: string | null = null;
  color: ColorResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  reservationStatuses = [
    { value: ReservationStatus.PreBooking, label: 'Pre-Booking' },
    { value: ReservationStatus.Confirmed, label: 'Confirmed' },
    { value: ReservationStatus.CheckedIn, label: 'Checked In' },
    { value: ReservationStatus.GaveNotice, label: 'Gave Notice' },
    { value: ReservationStatus.FirstRightRefusal, label: 'First Right of Refusal' },
    { value: ReservationStatus.Maintenance, label: 'Maintenance' },
    { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' }
  ];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['color']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public colorService: ColorService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService
  ) {
  }

  //#region Color
  ngOnInit(): void {
    // Check for returnTo query parameter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new';
      if (this.isAddMode) {
        this.removeLoadItem('color');
        this.buildForm();
      } else {
        this.getColor(this.id);
      }
    } else {
      // Build form even if no ID initially (ID will come via ngOnChanges)
      this.buildForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If id changes, reload color
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.isAddMode = false;
        if (!this.form) {
          this.buildForm();
        }
        this.getColor(newId);
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('color');
        if (!this.form) {
          this.buildForm();
        }
      }
    }
  }

  getColor(id?: string | number): void {
    const idToUse = id || this.id || this.routeColorId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const colorIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(colorIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid color ID', CommonMessage.Error);
      return;
    }
    this.colorService.getColorById(colorIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('color'); })).subscribe({
      next: (response: ColorResponse) => {
        this.color = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load color info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('color');
      }
    });
  }

  saveColor(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const colorRequest: ColorRequest = {
      organizationId: user?.organizationId || '',
      reservationStatusId: formValue.reservationStatusId,
      color: formValue.color
    };

    if (this.isAddMode) {
      this.colorService.createColor(colorRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: ColorResponse) => {
          this.toastr.success('Color created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Create color request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeColorId;
      const colorIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(colorIdNum)) {
        this.toastr.error('Invalid color ID', CommonMessage.Error);
        return;
      }
      colorRequest.colorId = colorIdNum;
      // Always use the current user's organizationId when updating
      colorRequest.organizationId = user?.organizationId || '';
      this.colorService.updateColor(colorRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: ColorResponse) => {
          this.toastr.success('Color updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update color request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  onColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const colorValue = input.value;
    this.form.patchValue({ color: colorValue }, { emitEvent: true });
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    this.form = this.fb.group({
      reservationStatusId: new FormControl('', [Validators.required]),
      color: new FormControl('', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)])
    });
  }

  populateForm(): void {
    if (this.color && this.form) {
      this.form.patchValue({
        reservationStatusId: this.color.reservationStatusId,
        color: this.color.color
      });
    }
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
  //#endregion
}

