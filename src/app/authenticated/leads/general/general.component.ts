import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { LeadGeneralRequest, LeadGeneralResponse, LeadGeneralUpdateRequest } from '../models/lead-general.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

export type GeneralLeadFormClosed = { saved: boolean; generalId?: number };

@Component({
  standalone: true,
  selector: 'app-general',
  templateUrl: './general.component.html',
  styleUrls: ['./general.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class GeneralComponent implements OnInit, OnDestroy {
  embeddedInShell = input(false);
  shellLeadId = input<string | null>(null);
  officeId = input<number | null>(null);
  closed = output<GeneralLeadFormClosed>();
  officeSelectionRequired = output<void>();

  form: FormGroup;
  isServiceError = false;
  isPageReady = false;
  isAddMode = false;
  isSavingGeneralLead = false;
  lead: LeadGeneralResponse | null = null;
  leadStateOptions = LEAD_STATE_SELECT_OPTIONS;

  organizationId = '';
  offices: OfficeResponse[] = [];
  officeScopeResolved = false;
  preferredOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['general-lead']));
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private globalSelectionService: GlobalSelectionService,
    private officeService: OfficeService
  ) {
    this.form = this.buildForm();
    effect(() => {
      const id = this.officeId();
      void id;
      if (!this.embeddedInShell() || this.offices.length === 0 || !this.officeScopeResolved) {
        return;
      }
      this.resolveOfficeScope(this.officeId());
    });
    effect(() => {
      if (!this.embeddedInShell()) {
        return;
      }
      const id = this.shellLeadId();
      if (id == null || id === '') {
        return;
      }
      this.loadGeneral(id);
    });
  }

  //#region General
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    const user = this.authService.getUser();
    this.organizationId = user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = user?.defaultOfficeId ?? null;

    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length === 0) {
        return;
      }
      if (this.embeddedInShell()) {
        this.resolveOfficeScope(this.officeId());
        return;
      }
      this.resolveOfficeScope(officeId);
    });

    this.loadOffices();

    this.route.paramMap.pipe(takeUntil(this.destroy$), map(pm => pm.get('id')), filter(() => !this.embeddedInShell())).subscribe(id => this.loadGeneral(id));
  }

  saveGeneralLead(): void {
    if (this.isSavingGeneralLead) {
      return;
    }
    this.formatterService.formatPhoneControl(this.form.get('phone'));
    this.form.markAllAsTouched();
    const resolvedOfficeId = this.resolveSaveOfficeId();
    const hasValidOfficeSelection = resolvedOfficeId != null && resolvedOfficeId > 0;
    if (!hasValidOfficeSelection && this.embeddedInShell()) {
      this.officeSelectionRequired.emit();
    }
    if (this.form.invalid || !hasValidOfficeSelection) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      return;
    }
    const v = this.form.getRawValue();
    const body: LeadGeneralRequest = {
      leadStateId: Number(v.leadStateId),
      officeId: resolvedOfficeId,
      firstName: this.utilityService.trimOrNull(v.firstName),
      lastName: this.utilityService.trimOrNull(v.lastName),
      email: this.utilityService.trimOrNull(v.email),
      phone: this.utilityService.trimOrNull(v.phone),
      message: this.utilityService.trimOrNull(v.message),
      notes: this.utilityService.trimOrNull(v.notes),
      isActive: !!v.isActive
    };
    this.isSavingGeneralLead = true;
    if (this.isAddMode) {
      this.leadsService.createGeneralLead(body).pipe(take(1), takeUntil(this.destroy$)).subscribe({
        next: created => {
          this.toastr.success('General lead created.', CommonMessage.Success);
          if (this.embeddedInShell()) {
            this.isSavingGeneralLead = false;
            this.closed.emit({ saved: true, generalId: created.generalId });
            return;
          }
          void this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadGeneral, [String(created.generalId)]));
        },
        error: () => {
          this.toastr.error('Unable to create general lead.', CommonMessage.Error);
          this.isSavingGeneralLead = false;
        }
      });
      return;
    }
    const generalId = this.lead?.generalId;
    if (!generalId) {
      this.isSavingGeneralLead = false;
      return;
    }
    const updateBody: LeadGeneralUpdateRequest = { ...body, generalId };
    this.leadsService.updateGeneralLead(updateBody).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: row => {
        this.toastr.success('General lead updated.', CommonMessage.Success);
        this.lead = row;
        this.populateForm(row);
        this.isSavingGeneralLead = false;
        if (this.embeddedInShell()) {
          this.closed.emit({ saved: true, generalId: row.generalId });
        }
      },
      error: () => {
        this.toastr.error('Unable to update general lead.', CommonMessage.Error);
        this.isSavingGeneralLead = false;
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      leadStateId: [LeadStateType.New],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      message: ['', Validators.required],
      notes: [''],
      isActive: [true]
    });
  }

  resetForm(): void {
    this.form.reset({
      leadStateId: LeadStateType.New,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      message: '',
      notes: '',
      isActive: true
    });
  }

  populateForm(lead: LeadGeneralResponse): void {
    this.form.patchValue({
      leadStateId: lead.leadStateId,
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: this.formatterService.phoneNumber(lead.phone || '') || '',
      message: lead.message ?? '',
      notes: lead.notes ?? '',
      isActive: !!lead.isActive
    });
  }
  //#endregion

  //#region Form Response Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
  }
  
  resolveCreateOfficeId(): number | null {
    const fromShell = this.officeId();
    if (fromShell != null && fromShell > 0) {
      return fromShell;
    }
    const fromResolved = this.selectedOffice?.officeId ?? null;
    if (fromResolved != null && fromResolved > 0) {
      return fromResolved;
    }
    return this.globalSelectionService.getSelectedOfficeIdValue();
  }

  resolveSaveOfficeId(): number | null {
    const fromShell = this.officeId();
    if (this.embeddedInShell() && fromShell != null && fromShell > 0) {
      return fromShell;
    }
    if (this.isAddMode) {
      return this.resolveCreateOfficeId();
    }
    const fromLead = this.lead?.officeId ?? null;
    if (fromLead != null && fromLead > 0) {
      return fromLead;
    }
    return this.resolveCreateOfficeId();
  }
  
  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
        });
      },
      error: () => {
        this.offices = [];
      }
    });
  }

  loadGeneral(idParam: string | null): void {
    const raw = String(idParam || '').trim().toLowerCase();
    if (raw === 'new') {
      this.isAddMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.resetForm();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'general-lead');
      return;
    }

    this.isAddMode = false;
    this.isServiceError = false;
    const generalId = parseInt(String(idParam || '').trim(), 10);
    if (!generalId || Number.isNaN(generalId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'general-lead');
      return;
    }

    this.leadsService.getGeneralLeadById(generalId).pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'general-lead'))).subscribe({
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
  //#endregion

  //#region Utility Methods
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  back(): void {
    if (this.embeddedInShell()) {
      this.closed.emit({ saved: false });
      return;
    }
    this.ngZone.run(() => {
      void this.router.navigateByUrl(`${RouterUrl.Leads}?tab=general`);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
