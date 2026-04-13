import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { EmailType } from '../models/email.enum';
import { getFrequencies } from '../../reservations/models/reservation-enum';
import { AlertRequest, AlertResponse } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Component({
  standalone: true,
  selector: 'app-alert',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.scss'
})
export class AlertComponent implements OnInit, OnChanges {
  readonly defaultFromName = 'The RentAll Exchange';
  readonly defaultFromEmail = 'wendy.gesler@rentallexchange.com';

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

  frequencyOptions = getFrequencies().filter(option => Number(option.value) > 0);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private alertService: AlertService,
    private authService: AuthService,
    private formatter: FormatterService,
    private toastr: ToastrService
  ) {}

  //#region Alert
  ngOnInit(): void {
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
    const selectedOfficeId = this.officeId ?? null;
    const selectedPropertyId = this.propertyId ? String(this.propertyId).trim() : null;
    const selectedReservationId = this.reservationId ? String(this.reservationId).trim() : null;
    const selectedEmailTypeId = selectedReservationId ? EmailType.ReservationAlert
      : (selectedPropertyId ? EmailType.PropertyAlert : EmailType.GeneralAlert);
    const request: AlertRequest = {
      alertId: this.isAddMode ? undefined : (this.alert?.alertId || this.currentAlertId),
      organizationId: this.alert?.organizationId || this.organizationId || user?.organizationId || '',
      officeId: selectedOfficeId ?? this.alert?.officeId ?? user?.defaultOfficeId ?? 0,
      propertyId: selectedPropertyId || null,
      reservationId: selectedReservationId || null,
      fromRecipient: {
        email: String(user?.email || '').trim() || String(value.fromEmail || '').trim() || this.defaultFromEmail,
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
      emailTypeId: selectedEmailTypeId,
      startDate: value.startDate ? new Date(value.startDate).toISOString() : new Date().toISOString(),
      frequencyId: Number(value.frequencyId || 0)
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
      subject: new FormControl('', [Validators.required]),
      toEmail: new FormControl('', [Validators.required, Validators.email]),
      fromEmail: new FormControl('', [Validators.required, Validators.email]),
      ccEmails: new FormControl(''),
      bccEmails: new FormControl(''),
      plainTextContent: new FormControl(''),
      startDate: new FormControl<Date | null>(null, [Validators.required]),
      frequencyId: new FormControl<number | null>(null, [Validators.required])
    });
  }

  patchDefaultValues(): void {
    const user = this.authService.getUser();
    this.form.patchValue({
      toEmail: user?.email || '',
      fromEmail: user?.email || this.defaultFromEmail,
      startDate: new Date()
    });
  }

  parseEmailAddresses(value: string): { email: string; name: string }[] {
    return (value || '')
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .map(email => ({ email, name: '' }));
  }

  populateFormFromAlert(response: AlertResponse): void {
    this.alert = response;
    this.form.patchValue({
      subject: response.subject || '',
      toEmail: response.toRecipients?.[0]?.email || this.authService.getUser()?.email || '',
      fromEmail: this.authService.getUser()?.email || response.fromRecipient?.email || this.defaultFromEmail,
      ccEmails: (response.ccRecipients || []).map(recipient => recipient.email).join(', '),
      bccEmails: (response.bccRecipients || []).map(recipient => recipient.email).join(', '),
      plainTextContent: response.plainTextContent || '',
      startDate: response.startDate ? new Date(response.startDate) : null,
      frequencyId: response.frequencyId ?? null
    });
  }

  getCurrentUserName(): string {
    const user = this.authService.getUser();
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    return fullName || this.defaultFromName;
  }
  //#endregion
}
