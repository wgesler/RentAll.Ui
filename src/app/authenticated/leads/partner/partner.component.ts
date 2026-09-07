import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { LeadPartnerRequest, LeadPartnerResponse, LeadPartnerUpdateRequest } from '../models/lead-partner.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

export type PartnerLeadFormClosed = { saved: boolean; partnerId?: number };

@Component({
  standalone: true,
  selector: 'app-partner',
  templateUrl: './partner.component.html',
  styleUrls: ['./partner.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class PartnerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shellLeadId: string | null = null;
  @Input() officeId: number | null = null;
  @Output() closed = new EventEmitter<PartnerLeadFormClosed>();
  @Output() officeSelectionRequired = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private leadsService = inject(LeadsService);
  private utilityService = inject(UtilityService);
  private formatterService = inject(FormatterService);
  private officeService = inject(OfficeService);
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  isServiceError = false;
  isPageReady = false;
  isAddMode = false;
  isSavingPartnerLead = false;
  lead: LeadPartnerResponse | null = null;
  leadStateOptions = LEAD_STATE_SELECT_OPTIONS;

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['partner-lead']));
  destroy$ = new Subject<void>();

  constructor() {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOffices();
    this.getPartnerLead(this.shellLeadId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId);
    }
    if (changes['shellLeadId'] && !changes['shellLeadId'].firstChange) {
      this.getPartnerLead(this.shellLeadId);
    }
  }

  getPartnerLead(idParam: string | null): void {
    if (idParam === 'new') {
      this.isAddMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.resetForm();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'partner-lead');
      return;
    }

    if (idParam == null || String(idParam).trim() === '') {
      this.isAddMode = false;
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'partner-lead');
      return;
    }

    this.isAddMode = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'partner-lead');
    this.isServiceError = false;
    const partnerId = parseInt(String(idParam || '').trim(), 10);
    if (!partnerId || Number.isNaN(partnerId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'partner-lead');
      return;
    }

    this.leadsService.getPartnerLeadById(partnerId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'partner-lead'))).subscribe({
      next: row => {
        this.lead = row;
        this.populateForm(row);
      },
      error: () => {
        this.lead = null;
        this.isServiceError = true;
      }
    });
  }

  savePartnerLead(): void {
    if (this.isSavingPartnerLead) {
      return;
    }
    this.formatterService.formatPhoneControl(this.form.get('phone'));
    this.form.markAllAsTouched();
    const resolvedOfficeId = this.resolveSaveOfficeId();
    const hasValidOfficeSelection = resolvedOfficeId != null && resolvedOfficeId > 0;
    if (!hasValidOfficeSelection) {
      this.officeSelectionRequired.emit();
    }
    if (this.form.invalid || !hasValidOfficeSelection) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      return;
    }
    const v = this.form.getRawValue();
    const body: LeadPartnerRequest = {
      partnerId: this.isAddMode ? undefined : this.lead?.partnerId,
      leadStateId: Number(v.leadStateId),
      officeId: resolvedOfficeId,
      name: this.utilityService.trimOrNull(v.name),
      companyName: this.utilityService.trimOrNull(v.companyName),
      title: this.utilityService.trimOrNull(v.title),
      email: this.utilityService.trimOrNull(v.email),
      phone: this.utilityService.trimOrNull(v.phone),
      marketsCitiesServed: this.utilityService.trimOrNull(v.marketsCitiesServed),
      furnishedPropertiesInPortfolio: this.utilityService.trimOrNull(v.furnishedPropertiesInPortfolio),
      aboutYourBusiness: this.utilityService.trimOrNull(v.aboutYourBusiness),
      notes: this.utilityService.trimOrNull(v.notes),
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingPartnerLead = true;
    if (this.isAddMode) {
      this.leadsService.createPartnerLead(body).pipe(take(1)).subscribe({
        next: created => {
          this.toastr.success('Partner lead created.', CommonMessage.Success);
          this.isSavingPartnerLead = false;
          this.closed.emit({ saved: true, partnerId: created.partnerId });
        },
        error: () => {
          this.toastr.error('Unable to create partner lead.', CommonMessage.Error);
          this.isSavingPartnerLead = false;
        }
      });
      return;
    }
    const partnerId = this.lead?.partnerId;
    if (!partnerId) {
      this.isSavingPartnerLead = false;
      return;
    }
    const updateBody: LeadPartnerUpdateRequest = { ...body, partnerId };
    this.leadsService.updatePartnerLead(updateBody).pipe(take(1)).subscribe({
      next: row => {
        this.toastr.success('Partner lead updated.', CommonMessage.Success);
        this.lead = row;
        this.populateForm(row);
        this.isSavingPartnerLead = false;
        this.closed.emit({ saved: true, partnerId: row.partnerId });
      },
      error: () => {
        this.toastr.error('Unable to update partner lead.', CommonMessage.Error);
        this.isSavingPartnerLead = false;
      }
    });
  }

  buildForm(): FormGroup {
    return this.fb.group({
      leadStateId: [LeadStateType.New],
      name: ['', Validators.required],
      companyName: [''],
      title: [''],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      marketsCitiesServed: [''],
      furnishedPropertiesInPortfolio: [''],
      aboutYourBusiness: [''],
      notes: [''],
      emailPhoneConsent: [false],
      smsConsent: [false],
      isActive: [true]
    });
  }

  resetForm(): void {
    this.form.reset({
      leadStateId: LeadStateType.New,
      name: '',
      companyName: '',
      title: '',
      email: '',
      phone: '',
      marketsCitiesServed: '',
      furnishedPropertiesInPortfolio: '',
      aboutYourBusiness: '',
      notes: '',
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: true
    });
  }

  populateForm(lead: LeadPartnerResponse): void {
    this.form.patchValue({
      leadStateId: lead.leadStateId,
      name: lead.name ?? '',
      companyName: lead.companyName ?? '',
      title: lead.title ?? '',
      email: lead.email ?? '',
      phone: this.formatterService.phoneNumber(lead.phone || '') || '',
      marketsCitiesServed: lead.marketsCitiesServed ?? '',
      furnishedPropertiesInPortfolio: lead.furnishedPropertiesInPortfolio ?? '',
      aboutYourBusiness: lead.aboutYourBusiness ?? '',
      notes: lead.notes ?? '',
      emailPhoneConsent: !!lead.emailPhoneConsent,
      smsConsent: !!lead.smsConsent,
      isActive: !!lead.isActive
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  resolveSaveOfficeId(): number | null {
    const fromShell = this.officeId;
    if (fromShell != null && fromShell > 0) {
      return fromShell;
    }
    const fromLead = this.lead?.officeId ?? null;
    if (fromLead != null && fromLead > 0) {
      return fromLead;
    }
    return null;
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe({
          next: offices => {
            this.offices = offices || [];
            this.resolveOfficeScope(this.officeId);
            this.cdr.markForCheck();
          },
          error: () => {
            this.offices = [];
            this.cdr.markForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.cdr.markForCheck();
      }
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
