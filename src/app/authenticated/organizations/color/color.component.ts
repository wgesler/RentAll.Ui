import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, forkJoin, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationStatus, getReservationStatuses } from '../../reservations/models/reservation-enum';
import { ColorRequest, ColorResponse } from '../models/color.model';
import { ColorService } from '../services/color.service';

@Component({
    standalone: true,
    selector: 'app-color',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './color.component.html',
    styleUrl: './color.component.scss'
})

export class ColorComponent implements OnInit, OnDestroy, OnChanges {

  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  colorService = inject(ColorService);
  router = inject(Router);
  fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  @ViewChild('firstInput') firstInputRef: MatSelect;
  
  isServiceError: boolean = false;
  color: ColorResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  reservationStatuses = getReservationStatuses();
  noticeDays: number | null = null;
  readonly checkedInNotice60FallbackColorId = 10;
  readonly checkedInNotice15FallbackColorId = 11;
  readonly checkedInNotice14FallbackColorId = 12;
  checkedInNotice14ColorId: number | null = null;
  checkedInNotice15ColorId: number | null = null;
  checkedInNotice60ColorId: number | null = null;
  showCheckedInNoticeVariants = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['color']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  //#region Color
  ngOnInit(): void {
    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new';
      if (this.isAddMode) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'color');
        this.buildForm();
        this.scheduleFocusFirstField();
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'color');
        if (!this.form) {
          this.buildForm();
        }
        this.scheduleFocusFirstField();
      }
    }
  }

  getColor(id?: string | number): void {
    const idToUse = id || this.id;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const colorIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(colorIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid color ID', CommonMessage.Error);
      return;
    }
    this.colorService.getColorById(colorIdNum).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'color'); })).subscribe({
      next: (response: ColorResponse) => {
        this.color = response;
        this.noticeDays = response.noticeDays ?? null;
        this.buildForm();
        this.populateForm();
        this.loadCheckedInNoticeVariants();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'color');
      }
    });
  }

  saveColor(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const colorRequest: ColorRequest = {
      organizationId: user?.organizationId || '',
      reservationStatusId: formValue.reservationStatusId,
      noticeDays: this.noticeDays,
      color: formValue.color
    };

    if (this.isAddMode) {
      this.colorService.createColor(colorRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: ColorResponse) => {
          this.toastr.success('Color created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    } else {
      const idToUse = this.id;
      const colorIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(colorIdNum)) {
        this.toastr.error('Invalid color ID', CommonMessage.Error);
        return;
      }
      colorRequest.colorId = colorIdNum;
      // Always use the current user's organizationId when updating
      colorRequest.organizationId = user?.organizationId || '';
      if (this.showCheckedInNoticeVariants) {
        this.saveCheckedInColorGroup(colorRequest);
        return;
      }

      this.colorService.updateColor(colorRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: ColorResponse) => {
          this.toastr.success('Color updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.savedEvent.emit();
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {
          this.toastr.error('Unable to update color.', CommonMessage.Error);
        }
      });
    }
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    this.form = this.fb.group({
      reservationStatusId: new FormControl('', [Validators.required]),
      color: new FormControl('', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      checkedInNotice60Color: new FormControl('', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      checkedInNotice15Color: new FormControl('', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      checkedInNotice14Color: new FormControl('', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)])
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

  //#region Form Response Methods
  onColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const colorValue = input.value;
    this.form.patchValue({ color: colorValue }, { emitEvent: true });
  }

  onNoticeColorChange(controlName: 'color' | 'checkedInNotice60Color' | 'checkedInNotice15Color' | 'checkedInNotice14Color', event: Event): void {
    const input = event.target as HTMLInputElement;
    this.form.patchValue({ [controlName]: input.value }, { emitEvent: true });
  }

  loadCheckedInNoticeVariants(): void {
    const isCheckedInBase = this.color?.reservationStatusId === ReservationStatus.CheckedIn && (this.color?.noticeDays === null || this.color?.noticeDays === undefined);
    this.showCheckedInNoticeVariants = isCheckedInBase;
    if (!isCheckedInBase) {
      return;
    }

    this.colorService.getColors().pipe(take(1)).subscribe({
      next: colors => {
        const checkedInRows = (colors || []).filter(c => c.reservationStatusId === ReservationStatus.CheckedIn);
        const notice60 = checkedInRows.find(c => c.noticeDays === 60) || checkedInRows.find(c => c.colorId === this.checkedInNotice60FallbackColorId) || null;
        const notice15 = checkedInRows.find(c => c.noticeDays === 15) || checkedInRows.find(c => c.colorId === this.checkedInNotice15FallbackColorId) || null;
        const notice14 = checkedInRows.find(c => c.noticeDays === 14) || checkedInRows.find(c => c.colorId === this.checkedInNotice14FallbackColorId) || null;

        this.checkedInNotice60ColorId = notice60?.colorId ?? this.checkedInNotice60FallbackColorId;
        this.checkedInNotice15ColorId = notice15?.colorId ?? this.checkedInNotice15FallbackColorId;
        this.checkedInNotice14ColorId = notice14?.colorId ?? this.checkedInNotice14FallbackColorId;

        this.form.patchValue({
          checkedInNotice60Color: notice60?.color ?? this.color?.color ?? '',
          checkedInNotice15Color: notice15?.color ?? this.color?.color ?? '',
          checkedInNotice14Color: notice14?.color ?? this.color?.color ?? ''
        });
      }
    });
  }

  saveCheckedInColorGroup(baseColorRequest: ColorRequest): void {
    const organizationId = baseColorRequest.organizationId || '';
    const updates: Observable<ColorResponse>[] = [this.colorService.updateColor(baseColorRequest).pipe(take(1))];
    const notice60Color = String(this.form.get('checkedInNotice60Color')?.value || '').trim();
    const notice15Color = String(this.form.get('checkedInNotice15Color')?.value || '').trim();
    const notice14Color = String(this.form.get('checkedInNotice14Color')?.value || '').trim();

    if (notice60Color) {
      updates.push(this.colorService.updateColor({
        colorId: this.checkedInNotice60ColorId ?? this.checkedInNotice60FallbackColorId,
        organizationId,
        reservationStatusId: ReservationStatus.CheckedIn,
        noticeDays: 60,
        color: notice60Color
      }).pipe(take(1)));
    }

    if (notice15Color) {
      updates.push(this.colorService.updateColor({
        colorId: this.checkedInNotice15ColorId ?? this.checkedInNotice15FallbackColorId,
        organizationId,
        reservationStatusId: ReservationStatus.CheckedIn,
        noticeDays: 15,
        color: notice15Color
      }).pipe(take(1)));
    }

    if (notice14Color) {
      updates.push(this.colorService.updateColor({
        colorId: this.checkedInNotice14ColorId ?? this.checkedInNotice14FallbackColorId,
        organizationId,
        reservationStatusId: ReservationStatus.CheckedIn,
        noticeDays: 14,
        color: notice14Color
      }).pipe(take(1)));
    }

    forkJoin(updates).pipe(finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        this.toastr.success('Checked In colors updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: () => {
        this.toastr.error('Unable to update Checked In color variants.', CommonMessage.Error);
      }
    });
  }

  focusFirstField(): void {
    this.firstInputRef?.focus();
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
      this.saveColor();
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

