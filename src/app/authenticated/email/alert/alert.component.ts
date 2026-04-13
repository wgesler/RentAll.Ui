import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, forkJoin, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { EmailType } from '../models/email.enum';
import { getFrequencies } from '../../reservations/models/reservation-enum';
import { AlertRequest, AlertResponse } from '../models/alert.model';
import { AlertService } from '../services/alert.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';

@Component({
  standalone: true,
  selector: 'app-alert',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.scss'
})
export class AlertComponent implements OnInit, OnChanges, OnDestroy {
  readonly defaultFromName = 'The RentAll Exchange';

  @Input() alertId: string | null = null;
  @Input() alertResponse: AlertResponse | null = null;
  @Input() embeddedInEmailShell = false;
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  currentAlertId = 'new';
  alert: AlertResponse | null = null;
  form: FormGroup = this.buildForm();
  isLoading = false;
  isSubmitting = false;
  isServiceError = false;
  isAddMode = true;
  readonly alertEmailTypeId = EmailType.Alert;

  frequencyOptions = getFrequencies().filter(option => Number(option.value) > 0);
  offices: OfficeResponse[] = [];
  propertyOptions: { value: string; officeId: number; label: string }[] = [];
  reservationOptions: { value: string; officeId: number; propertyId: string; label: string }[] = [];
  destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private alertService: AlertService,
    private authService: AuthService,
    private officeService: OfficeService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private formatter: FormatterService,
    private toastr: ToastrService
  ) {}

  //#region Alert
  ngOnInit(): void {
    this.loadDropdownData();
    if (this.alertId) {
      this.initializeAlert(this.alertId);
      return;
    }
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      this.initializeAlert(paramMap.get('id') || 'new');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['alertId'] && !changes['alertId'].firstChange) {
      this.initializeAlert(changes['alertId'].currentValue || 'new');
      return;
    }
    if (changes['alertResponse'] && !changes['alertResponse'].firstChange && this.currentAlertId !== 'new') {
      const incomingAlert = changes['alertResponse'].currentValue as AlertResponse | null;
      if (incomingAlert && incomingAlert.alertId === this.currentAlertId) {
        this.populateFormFromAlert(incomingAlert);
      }
    }
    if ((changes['officeId'] || changes['propertyId'] || changes['reservationId']) && this.isAddMode) {
      this.patchDefaultValues();
    }
  }

  initializeAlert(id: string): void {
    this.currentAlertId = id || 'new';
    this.isAddMode = this.currentAlertId === 'new';
    this.isServiceError = false;
    this.alert = null;
    this.form.reset();
    if (this.isAddMode) {
      this.isLoading = false;
      this.patchDefaultValues();
      return;
    }
    if (this.alertResponse && this.alertResponse.alertId === this.currentAlertId) {
      this.isLoading = false;
      this.populateFormFromAlert(this.alertResponse);
      return;
    }
    this.loadAlert();
  }

  loadAlert(): void {
    this.isLoading = true;
    this.isServiceError = false;
    this.alertService.getAlertByGuid(this.currentAlertId).pipe(take(1)).subscribe({
      next: response => {
        this.populateFormFromAlert(response);
        this.isLoading = false;
      },
      error: () => {
        this.alert = null;
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }
    const user = this.authService.getUser();
    const value = this.form.getRawValue();
    const selectedOfficeId = value.officeId != null ? Number(value.officeId) : null;
    const selectedPropertyId = value.propertyId ? String(value.propertyId).trim() : null;
    const selectedReservationId = value.reservationId ? String(value.reservationId).trim() : null;
    const request: AlertRequest = {
      alertId: this.isAddMode ? undefined : (this.alert?.alertId || this.currentAlertId),
      organizationId: this.alert?.organizationId || this.organizationId || user?.organizationId || '',
      officeId: selectedOfficeId ?? this.alert?.officeId ?? user?.defaultOfficeId ?? 0,
      propertyId: selectedPropertyId || null,
      reservationId: selectedReservationId || null,
      fromRecipient: {
        email: String(user?.email || '').trim(),
        name: this.getCurrentUserName()
      },
      toRecipients: [{
        email: String(value.toEmail || '').trim(),
        name: this.alert?.toRecipients?.[0]?.name || ''
      }],
      ccRecipients: this.parseEmailAddresses(String(value.ccEmails || '').trim()),
      bccRecipients: this.parseEmailAddresses(String(value.bccEmails || '').trim()),
      subject: String(value.subject || '').trim(),
      plainTextContent: String(value.plainTextContent || ''),
      emailTypeId: this.alertEmailTypeId,
      startDate: value.startDate ? new Date(value.startDate).toISOString() : new Date().toISOString(),
      daysBeforeDeparture: selectedReservationId ? (String(value.daysBeforeDeparture || '').trim() || null) : null,
      frequencyId: Number(value.frequencyId || 0),
      isActive: value.isActive !== false
    };

    this.isSubmitting = true;
    const save$ = this.isAddMode
      ? this.alertService.createAlert(request)
      : this.alertService.updateAlert(request);

    save$.pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success(this.isAddMode ? 'Alert created successfully' : 'Alert updated successfully', CommonMessage.Success);
        if (this.embeddedInEmailShell) {
          this.savedEvent.emit();
          this.isSubmitting = false;
          return;
        }
        this.router.navigateByUrl(RouterUrl.EmailList);
      },
      error: () => {
        this.toastr.error('Failed to save alert', CommonMessage.Error);
        this.isSubmitting = false;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  get formattedCreatedOn(): string {
    return this.formatter.formatDateTimeString(this.alert?.createdOn) || (this.alert?.createdOn || '');
  }

  back(): void {
    if (this.embeddedInEmailShell) {
      this.backEvent.emit();
      return;
    }
    this.router.navigateByUrl(RouterUrl.AlertList);
  }

  buildForm(): FormGroup {
    return this.fb.group({
      officeId: new FormControl<number | null>(null, [Validators.required]),
      propertyId: new FormControl<string | null>(null),
      reservationId: new FormControl<string | null>(null),
      subject: new FormControl('', [Validators.required]),
      toEmail: new FormControl('', [Validators.required, Validators.email]),
      ccEmails: new FormControl(''),
      bccEmails: new FormControl(''),
      plainTextContent: new FormControl(''),
      startDate: new FormControl<Date | null>(null, [Validators.required]),
      daysBeforeDeparture: new FormControl({ value: '', disabled: true }),
      frequencyId: new FormControl<number | null>(null, [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  patchDefaultValues(): void {
    const user = this.authService.getUser();
    const contextOfficeId = user?.defaultOfficeId ?? null;
    const contextPropertyId = this.propertyId ? String(this.propertyId).trim() : null;
    const contextReservationId = this.reservationId ? String(this.reservationId).trim() : null;
    this.form.patchValue({
      officeId: contextOfficeId,
      propertyId: contextPropertyId,
      reservationId: contextReservationId,
      toEmail: user?.email || '',
      daysBeforeDeparture: '',
      startDate: new Date(),
      isActive: true
    });
    this.setDaysBeforeDepartureEnabled(contextReservationId);
  }

  parseEmailAddresses(value: string): { email: string; name: string }[] {
    return (value || '')
      .split(';')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .map(email => ({ email, name: '' }));
  }

  onDaysBeforeDepartureInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }
    const sanitized = input.value.replace(/\D+/g, '');
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    this.form.get('daysBeforeDeparture')?.setValue(sanitized, { emitEvent: false });
  }

  selectAllOnFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }
    setTimeout(() => input.select(), 0);
  }

  populateFormFromAlert(response: AlertResponse): void {
    this.alert = response;
    this.form.patchValue({
      officeId: response.officeId ?? this.officeId ?? null,
      propertyId: response.propertyId ?? null,
      reservationId: response.reservationId ?? null,
      subject: response.subject || '',
      toEmail: response.toRecipients?.[0]?.email || this.authService.getUser()?.email || '',
      ccEmails: (response.ccRecipients || []).map(recipient => recipient.email).join(', '),
      bccEmails: (response.bccRecipients || []).map(recipient => recipient.email).join(', '),
      plainTextContent: response.plainTextContent || '',
      startDate: response.startDate ? new Date(response.startDate) : null,
      daysBeforeDeparture: response.daysBeforeDeparture || '',
      frequencyId: response.frequencyId ?? null,
      isActive: response.isActive ?? true
    });
    this.setDaysBeforeDepartureEnabled(response.reservationId ?? null);
  }

  getCurrentUserName(): string {
    const user = this.authService.getUser();
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    return fullName || this.defaultFromName;
  }

  get filteredPropertyOptions(): { value: string; officeId: number; label: string }[] {
    const selectedOfficeId = this.form.get('officeId')?.value;
    if (selectedOfficeId == null) {
      return [...this.propertyOptions];
    }
    return this.propertyOptions.filter(option => option.officeId === Number(selectedOfficeId));
  }

  get filteredReservationOptions(): { value: string; officeId: number; propertyId: string; label: string }[] {
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
    const selectedPropertyId = this.form.get('propertyId')?.value;
    if (selectedPropertyId) {
      const property = this.propertyOptions.find(option => option.value === selectedPropertyId) || null;
      if (!property || (officeId != null && property.officeId !== officeId)) {
        this.form.patchValue({ propertyId: null }, { emitEvent: false });
      }
    }

    const selectedReservationId = this.form.get('reservationId')?.value;
    if (selectedReservationId) {
      const reservation = this.reservationOptions.find(option => option.value === selectedReservationId) || null;
      if (!reservation || (officeId != null && reservation.officeId !== officeId)) {
        this.form.patchValue({ reservationId: null }, { emitEvent: false });
      }
    }
  }

  onPropertyChanged(propertyId: string | null): void {
    const selectedReservationId = this.form.get('reservationId')?.value;
    if (!selectedReservationId) {
      return;
    }
    const reservation = this.reservationOptions.find(option => option.value === selectedReservationId) || null;
    if (!reservation || (propertyId && reservation.propertyId !== propertyId)) {
      this.form.patchValue({ reservationId: null }, { emitEvent: false });
      this.setDaysBeforeDepartureEnabled(null);
    }
  }

  onReservationChanged(reservationId: string | null): void {
    this.setDaysBeforeDepartureEnabled(reservationId);
    if (!reservationId) {
      return;
    }
    const reservation = this.reservationOptions.find(option => option.value === reservationId) || null;
    if (!reservation) {
      return;
    }
    this.form.patchValue({
      officeId: reservation.officeId,
      propertyId: reservation.propertyId
    }, { emitEvent: false });
  }

  setDaysBeforeDepartureEnabled(reservationId: string | null): void {
    const control = this.form.get('daysBeforeDeparture');
    if (!control) {
      return;
    }
    if (reservationId) {
      control.enable({ emitEvent: false });
      return;
    }
    control.setValue('', { emitEvent: false });
    control.disable({ emitEvent: false });
  }

  loadDropdownData(): void {
    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onOfficeChanged(value == null ? null : Number(value));
    });
    this.form.get('propertyId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onPropertyChanged(value == null ? null : String(value));
    });
    this.form.get('reservationId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.onReservationChanged(value == null ? null : String(value));
    });

    const user = this.authService.getUser();
    const organizationId = String(user?.organizationId || '').trim();
    const userId = String(user?.userId || '').trim();
    if (!organizationId || !userId) {
      return;
    }

    forkJoin({
      offices: this.officeService.ensureOfficesLoaded(organizationId),
      properties: this.propertyService.getPropertiesBySelectionCriteria(userId),
      reservations: this.reservationService.getReservationList()
    }).pipe(take(1)).subscribe({
      next: ({ offices, properties, reservations }) => {
        this.offices = offices || [];
        this.propertyOptions = (properties || []).map((property: PropertyListResponse) => ({
          value: property.propertyId,
          officeId: Number(property.officeId || 0),
          label: property.propertyCode || ''
        }));
        this.reservationOptions = (reservations || []).map((reservation: ReservationListResponse) => ({
          value: reservation.reservationId,
          officeId: Number(reservation.officeId || 0),
          propertyId: reservation.propertyId,
          label: `${reservation.reservationCode || ''}${reservation.tenantName ? ` - ${reservation.tenantName}` : ''}`
        }));
      },
      error: () => {
        this.offices = [];
        this.propertyOptions = [];
        this.reservationOptions = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
