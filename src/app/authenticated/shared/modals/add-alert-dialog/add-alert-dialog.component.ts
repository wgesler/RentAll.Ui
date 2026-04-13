import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { catchError, finalize, forkJoin, of, Subject, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { EmailType } from '../../../email/models/email.enum';
import { AlertRequest } from '../../../email/models/alert.model';
import { AlertService } from '../../../email/services/alert.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { PropertyListResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';
import { getFrequencies } from '../../../reservations/models/reservation-enum';
import { ReservationListResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';

export interface AddAlertDialogData {
  officeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  source?: 'property' | 'reservation' | 'maintenance' | null;
}

type AlertPropertyOption = {
  propertyId: string;
  officeId: number;
  label: string;
};

type AlertReservationOption = {
  reservationId: string;
  officeId: number;
  propertyId: string;
  label: string;
};

@Component({
  standalone: true,
  selector: 'app-add-alert-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './add-alert-dialog.component.html',
  styleUrl: './add-alert-dialog.component.scss'
})
export class AddAlertDialogComponent implements OnInit, OnDestroy {
  form: FormGroup = this.buildForm();
  isSubmitting = false;
  isLoading = true;
  destroy$ = new Subject<void>();

  offices: OfficeResponse[] = [];
  propertyOptions: AlertPropertyOption[] = [];
  reservationOptions: AlertReservationOption[] = [];
  frequencyOptions = getFrequencies().filter(option => Number(option.value) > 0);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private officeService: OfficeService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private alertService: AlertService,
    private toastr: ToastrService,
    private dialogRef: MatDialogRef<AddAlertDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddAlertDialogData
  ) {}

  //#region Add-Alert-Dialog
  ngOnInit(): void {
    this.setupFormSubscriptions();
    this.loadDialogData();
  }

  save(): void {
    this.form.markAllAsTouched();
    if (!this.form.valid || this.isSubmitting) {
      return;
    }

    const user = this.authService.getUser();
    const value = this.form.getRawValue();
    const officeId = Number(value.officeId || 0);
    if (!officeId) {
      this.toastr.error('Office is required', CommonMessage.Error);
      return;
    }

    const propertyId = value.propertyId ? String(value.propertyId).trim() : null;
    const reservationId = value.reservationId ? String(value.reservationId).trim() : null;
    const fromName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'RentAll User';
    const fromEmail = String(user?.email || '').trim();
    const toEmail = String(value.toEmail || '').trim();

    const request: AlertRequest = {
      organizationId: user?.organizationId || '',
      officeId,
      propertyId,
      reservationId,
      fromRecipient: {
        email: fromEmail,
        name: fromName
      },
      toRecipients: [{
        email: toEmail,
        name: ''
      }],
      ccRecipients: this.parseEmailAddresses(String(value.ccEmails || '').trim()),
      bccRecipients: this.parseEmailAddresses(String(value.bccEmails || '').trim()),
      subject: String(value.subject || '').trim(),
      plainTextContent: String(value.plainTextContent || ''),
      emailTypeId: this.resolveEmailTypeId(propertyId, reservationId),
      startDate: value.startDate ? new Date(value.startDate).toISOString() : new Date().toISOString(),
      frequencyId: Number(value.frequencyId || 0)
    };

    this.isSubmitting = true;
    this.alertService.createAlert(request).pipe(take(1), finalize(() => { this.isSubmitting = false; })).subscribe({
      next: () => {
        this.toastr.success('Alert created successfully', CommonMessage.Success);
        this.dialogRef.close(true);
      },
      error: () => {
        this.toastr.error('Failed to save alert', CommonMessage.Error);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      officeId: new FormControl<number | null>(null, [Validators.required]),
      propertyId: new FormControl<string | null>(null),
      reservationId: new FormControl<string | null>(null),
      toEmail: new FormControl('', [Validators.required, Validators.email]),
      fromEmail: new FormControl({ value: '', disabled: true }, [Validators.required, Validators.email]),
      ccEmails: new FormControl(''),
      bccEmails: new FormControl(''),
      startDate: new FormControl<Date | null>(new Date(), [Validators.required]),
      frequencyId: new FormControl<number | null>(null, [Validators.required]),
      subject: new FormControl('', [Validators.required]),
      plainTextContent: new FormControl('')
    });
  }

  setupFormSubscriptions(): void {
    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onOfficeChanged(value == null ? null : Number(value));
    });

    this.form.get('propertyId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onPropertyChanged(value == null ? null : String(value));
    });

    this.form.get('reservationId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onReservationChanged(value == null ? null : String(value));
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadDialogData(): void {
    const user = this.authService.getUser();
    const organizationId = String(user?.organizationId || '').trim();
    const userId = String(user?.userId || '').trim();

    this.form.patchValue({
      toEmail: user?.email || '',
      fromEmail: user?.email || ''
    }, { emitEvent: false });

    if (!organizationId || !userId) {
      this.isLoading = false;
      return;
    }

    forkJoin({
      offices: this.officeService.ensureOfficesLoaded(organizationId).pipe(catchError(() => of([]))),
      properties: this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(catchError(() => of([]))),
      reservations: this.reservationService.getReservationList().pipe(catchError(() => of([])))
    }).pipe(take(1), finalize(() => { this.isLoading = false; })).subscribe({
      next: ({ offices, properties, reservations }) => {
        this.offices = offices || [];
        this.propertyOptions = (properties || []).map(property => this.mapPropertyOption(property));
        this.reservationOptions = (reservations || []).map(reservation => this.mapReservationOption(reservation));
        this.applyInitialSelections();
      },
      error: () => {
        this.offices = [];
        this.propertyOptions = [];
        this.reservationOptions = [];
      }
    });
  }

  applyInitialSelections(): void {
    const user = this.authService.getUser();
    const requestedOfficeId = this.data?.officeId ?? user?.defaultOfficeId ?? null;
    const requestedPropertyId = this.data?.propertyId ? String(this.data.propertyId).trim() : null;
    const requestedReservationId = this.data?.reservationId ? String(this.data.reservationId).trim() : null;

    const officeId = requestedOfficeId != null && this.offices.some(office => office.officeId === requestedOfficeId)
      ? requestedOfficeId
      : (this.offices.find(office => office.officeId === (user?.defaultOfficeId ?? -1))?.officeId ?? null);

    this.form.patchValue({
      officeId,
      propertyId: requestedPropertyId,
      reservationId: requestedReservationId
    }, { emitEvent: true });
  }
  //#endregion

  //#region Utility Methods
  get filteredPropertyOptions(): AlertPropertyOption[] {
    const selectedOfficeId = this.form.get('officeId')?.value;
    if (selectedOfficeId == null) {
      return [...this.propertyOptions];
    }
    return this.propertyOptions.filter(option => option.officeId === Number(selectedOfficeId));
  }

  get filteredReservationOptions(): AlertReservationOption[] {
    const selectedOfficeId = this.form.get('officeId')?.value;
    const selectedPropertyId = this.form.get('propertyId')?.value;

    return this.reservationOptions.filter(option => {
      if (selectedOfficeId != null && option.officeId !== Number(selectedOfficeId)) {
        return false;
      }
      if (selectedPropertyId && option.propertyId !== selectedPropertyId) {
        return false;
      }
      return true;
    });
  }

  onOfficeChanged(officeId: number | null): void {
    const propertyId = this.form.get('propertyId')?.value;
    if (propertyId) {
      const property = this.propertyOptions.find(option => option.propertyId === propertyId);
      if (!property || (officeId != null && property.officeId !== officeId)) {
        this.form.patchValue({ propertyId: null }, { emitEvent: false });
      }
    }

    const reservationId = this.form.get('reservationId')?.value;
    if (reservationId) {
      const reservation = this.reservationOptions.find(option => option.reservationId === reservationId);
      if (!reservation || (officeId != null && reservation.officeId !== officeId)) {
        this.form.patchValue({ reservationId: null }, { emitEvent: false });
      }
    }
  }

  onPropertyChanged(propertyId: string | null): void {
    const reservationId = this.form.get('reservationId')?.value;
    if (!reservationId) {
      return;
    }

    const reservation = this.reservationOptions.find(option => option.reservationId === reservationId);
    if (!reservation) {
      this.form.patchValue({ reservationId: null }, { emitEvent: false });
      return;
    }

    if (propertyId && reservation.propertyId !== propertyId) {
      this.form.patchValue({ reservationId: null }, { emitEvent: false });
    }
  }

  onReservationChanged(reservationId: string | null): void {
    if (!reservationId) {
      return;
    }

    const reservation = this.reservationOptions.find(option => option.reservationId === reservationId);
    if (!reservation) {
      return;
    }

    const selectedOfficeId = this.form.get('officeId')?.value;
    if (selectedOfficeId == null || Number(selectedOfficeId) !== reservation.officeId) {
      this.form.patchValue({ officeId: reservation.officeId }, { emitEvent: false });
    }

    const selectedPropertyId = this.form.get('propertyId')?.value;
    if (!selectedPropertyId || selectedPropertyId !== reservation.propertyId) {
      this.form.patchValue({ propertyId: reservation.propertyId }, { emitEvent: false });
    }
  }

  mapPropertyOption(property: PropertyListResponse): AlertPropertyOption {
    return {
      propertyId: property.propertyId,
      officeId: Number(property.officeId || 0),
      label: property.propertyCode || ''
    };
  }

  mapReservationOption(reservation: ReservationListResponse): AlertReservationOption {
    const displayName = reservation.tenantName || reservation.contactName || reservation.companyName || '';
    return {
      reservationId: reservation.reservationId,
      officeId: Number(reservation.officeId || 0),
      propertyId: reservation.propertyId,
      label: `${reservation.reservationCode || ''}${displayName ? ` - ${displayName}` : ''}`
    };
  }

  resolveEmailTypeId(propertyId: string | null, reservationId: string | null): number {
    if (reservationId) {
      return EmailType.ReservationAlert;
    }
    if (propertyId) {
      return EmailType.PropertyAlert;
    }
    if (this.data?.source === 'maintenance') {
      return EmailType.MaintenanceAlert;
    }
    return EmailType.GeneralAlert;
  }

  parseEmailAddresses(value: string): { email: string; name: string }[] {
    return (value || '')
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .map(email => ({ email, name: '' }));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
