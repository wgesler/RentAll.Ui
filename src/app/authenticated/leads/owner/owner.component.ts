import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { EntityType, OwnerType } from '../../contacts/models/contact-enum';
import { ContactRequest } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { getPropertyTypes } from '../../properties/models/property-enums';
import { PropertyService } from '../../properties/services/property.service';
import { LeadOwnerRequest, LeadOwnerResponse, LeadOwnerUpdateRequest } from '../models/lead-owner.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

export type OwnerLeadFormClosed = { saved: boolean; ownerId?: number };

@Component({
  standalone: true,
  selector: 'app-owner',
  templateUrl: './owner.component.html',
  styleUrls: ['./owner.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class OwnerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shellLeadId: string | null = null;
  @Input() officeId: number | null = null;
  @Output() closed = new EventEmitter<OwnerLeadFormClosed>();
  @Output() officeSelectionRequired = new EventEmitter<void>();

  form: FormGroup;
  isServiceError = false;
  isPageReady = false;
  isAddMode = false;
  isSavingCreate = false;
  lead: LeadOwnerResponse | null = null;
  leadStateOptions = LEAD_STATE_SELECT_OPTIONS;
  organizationId = '';
  propertyTypeOptions = getPropertyTypes();
  allPropertyCodes: PropertyCodeResponse[] = [];
  propertyCodeOptions: PropertyCodeResponse[] = [];

  agents: AgentResponse[] = [];
  states: string[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-lead', 'property-codes']));
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private leadsService: LeadsService,
    private contactService: ContactService,
    private agentService: AgentService,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private commonService: CommonService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.buildForm();
  }

  //#region Owner
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
 
    this.loadPropertyCodes();
    this.loadAgents();
    this.loadStates();
    this.getOwnerLead(this.shellLeadId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.refreshPropertyCodeOptions();
      const currentCode = this.normalizePropertyCodeValue(this.form.get('propertyCode')?.value);
      if (currentCode && !this.propertyCodeOptions.some(
        property => String(property.propertyCode || '').trim().toUpperCase() === currentCode.toUpperCase()
      )) {
        this.form.patchValue({ propertyCode: null, propertyOffice: '' }, { emitEvent: false });
      }
      this.syncPropertyOfficeFromSelectedCode();
    }

    if (changes['shellLeadId'] && !changes['shellLeadId'].firstChange) {
      this.getOwnerLead(this.shellLeadId);
    }
  }

  getOwnerLead(idParam: string | null): void {
    const raw = String(idParam || '').trim().toLowerCase();
    if (raw === 'new') {
      this.isAddMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.formReset();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead');
      return;
    }

    this.isAddMode = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'owner-lead');
    this.isServiceError = false;
    const ownerId = parseInt(String(idParam || '').trim(), 10);
    if (!ownerId || Number.isNaN(ownerId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead');
      return;
    }

    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead'))).subscribe({
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

  saveOwnerLead(): void {
    if (this.isSavingCreate) {
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
    const body: LeadOwnerRequest = {
      leadStateId: Number(v.leadStateId),
      officeId: resolvedOfficeId,
      agentId: this.resolveAgentIdFromAgentCode(v.agentCode ?? null),
      firstName: this.utilityService.trimOrNull(v.firstName),
      lastName: this.utilityService.trimOrNull(v.lastName),
      email: this.utilityService.trimOrNull(v.email),
      phone: this.utilityService.trimOrNull(v.phone),
      locationOfProperty: this.utilityService.trimOrNull(v.locationOfProperty),
      programInterest: this.utilityService.trimOrNull(v.programInterest),
      whatIsPromptingContact: this.utilityService.trimOrNull(v.whatIsPromptingContact),
      timeFrame: v.timeFrame,
      targetRentReadyDate: this.utilityService.formatDateOnlyForApi(v.targetRentReadyDate),
      propertyGoals: this.utilityService.trimOrNull(v.propertyGoals),
      tellUsMoreAboutYourGoals: this.utilityService.trimOrNull(v.tellUsMoreAboutYourGoals),
      yearsOfExperienceWithRentals: this.utilityService.parseOptionalIntString(v.yearsOfExperienceWithRentals),
      tellUsMoreAboutProperty: this.utilityService.trimOrNull(v.tellUsMoreAboutProperty),
      address: this.utilityService.trimOrNull(v.address),
      city: this.utilityService.trimOrNull(v.city),
      state: this.utilityService.trimOrNull(v.state),
      zip: this.utilityService.trimOrNull(v.zip),
      numberOfBeds: this.utilityService.trimOrNull(v.numberOfBeds),
      numberOfBaths: this.utilityService.trimOrNull(v.numberOfBaths),
      approxSqFootage: this.utilityService.trimOrNull(v.approxSqFootage),
      propertyTypeId: v.propertyTypeId != null && v.propertyTypeId !== '' ? Number(v.propertyTypeId) : null,
      propertyCode: this.utilityService.trimOrNull(v.propertyCode),
      propertyOffice: this.utilityService.trimOrNull(v.propertyOffice),
      tellUsWhatYouLikeMostAboutYourProperty: this.utilityService.trimOrNull(v.tellUsWhatYouLikeMostAboutYourProperty),
      tellUsAnyDrawbacks: this.utilityService.trimOrNull(v.tellUsAnyDrawbacks),
      preferredContactMethod: this.utilityService.trimOrNull(v.preferredContactMethod),
      timeDateForContact: this.utilityService.trimOrNull(v.timeDateForContact),
      notes: this.utilityService.trimOrNull(v.notes),
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingCreate = true;
    if (this.isAddMode) {
      this.leadsService.createOwnerLead(body).pipe(take(1)).subscribe({
        next: created => {
          this.toastr.success('Owner lead created.', CommonMessage.Success);
          this.isSavingCreate = false;
          this.closed.emit({ saved: true, ownerId: created.ownerId });
        },
        error: () => {
          this.toastr.error('Unable to create owner lead.', CommonMessage.Error);
          this.isSavingCreate = false;
        }
      });
      return;
    }
    const ownerId = this.lead?.ownerId;
    if (!ownerId) {
      this.isSavingCreate = false;
      return;
    }
    const updateBody: LeadOwnerUpdateRequest = { ...body, ownerId };
    this.leadsService.updateOwnerLead(updateBody).pipe(take(1)).subscribe({
      next: row => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
        this.lead = row;
        this.populateForm(row);
        this.isSavingCreate = false;
        this.closed.emit({ saved: true, ownerId: row.ownerId });
      },
      error: () => {
        this.toastr.error('Unable to update owner lead.', CommonMessage.Error);
        this.isSavingCreate = false;
      }
    });
  }

  convertLeadToOwner(): void {
    const ownerId = Number(this.lead?.ownerId);
    if (!ownerId || Number.isNaN(ownerId)) {
      return;
    }
    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1)).subscribe({
      next: ownerLead => {
        const leadOwnerRequest = this.mappingService.mapLeadOwnerResponseToUpdateRequest(ownerLead);
        this.contactService.matchContactToLead(leadOwnerRequest).pipe(take(1)).subscribe({
          next: () => {
            this.contactService.refreshContacts().pipe(take(1)).subscribe({ next: () => {}, error: () => {} });
            this.ensureOwnerLeadInactiveAndOpen(ownerId);
          },
          error: (error: HttpErrorResponse) => {
            if (error.status !== 404) {
              this.ensureOwnerLeadInactiveAndOpen(ownerId);
              return;
            }
            const organizationId = String(this.authService.getUser()?.organizationId ?? '').trim();
            const officeId = Number(ownerLead.officeId);
            if (!organizationId || !Number.isFinite(officeId) || officeId <= 0) {
              this.toastr.error('Unable to create owner contact for this lead.', CommonMessage.Error);
              return;
            }
            const createContactRequest: ContactRequest = {
              ownerLeadId: ownerId,
              organizationId,
              officeId,
              officeAccess: [officeId],
              entityTypeId: EntityType.Owner,
              ownerTypeId: OwnerType.Individual,
              properties: [],
              firstName: ownerLead.firstName ?? null,
              lastName: ownerLead.lastName ?? null,
              address1: '',
              city: '',
              state: '',
              zip: '',
              phone: ownerLead.phone ?? null,
              email: ownerLead.email ?? '',
              rating: 0,
              isInternational: false,
              isActive: true
            };
            this.contactService.createContact(createContactRequest).pipe(take(1)).subscribe({
              next: () => {
                this.contactService.refreshContacts().pipe(take(1)).subscribe({ next: () => {}, error: () => {} });
                this.ensureOwnerLeadInactiveAndOpen(ownerId);
              },
              error: () => {
                this.ensureOwnerLeadInactiveAndOpen(ownerId);
              }
            });
          }
        });
      },
      error: () => {
        this.toastr.error('Unable to load owner lead for conversion.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    const defaults = this.defaultFormValues();
    return this.fb.group({
      ...defaults,
      firstName: [defaults.firstName, Validators.required],
      lastName: [defaults.lastName, Validators.required],
      email: [defaults.email, [Validators.required, Validators.email]],
      phone: [defaults.phone, Validators.required]
    });
  }

  formReset(): void {
    this.form.reset(this.defaultFormValues());
    this.refreshPropertyCodeOptions();
    this.syncPropertyOfficeFromSelectedCode();
  }

  populateForm(lead: LeadOwnerResponse): void {
    const agentId = String(lead.agentId ?? '').trim();
    const agentCode =
      !agentId ? null : (this.agents.find(a => String(a.agentId ?? '').trim() === agentId)?.agentCode ?? null);
    this.form.patchValue({
      leadStateId: lead.leadStateId,
      agentCode: agentCode != null && String(agentCode).trim() !== '' ? String(agentCode).trim() : null,
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: this.formatterService.phoneNumber(lead.phone || '') || '',
      locationOfProperty: lead.locationOfProperty ?? '',
      programInterest: lead.programInterest ?? '',
      whatIsPromptingContact: lead.whatIsPromptingContact ?? '',
      timeFrame: lead.timeFrame,
      targetRentReadyDate: this.utilityService.parseDateOnlyStringToDate(lead.targetRentReadyDate),
      propertyGoals: lead.propertyGoals ?? '',
      tellUsMoreAboutYourGoals: lead.tellUsMoreAboutYourGoals ?? '',
      yearsOfExperienceWithRentals: lead.yearsOfExperienceWithRentals != null ? String(lead.yearsOfExperienceWithRentals) : '',
      tellUsMoreAboutProperty: lead.tellUsMoreAboutProperty ?? '',
      address: lead.address ?? '',
      city: lead.city ?? '',
      state: this.utilityService.getStateCodeValue(lead.state),
      zip: lead.zip ?? '',
      numberOfBeds: lead.numberOfBeds ?? '',
      numberOfBaths: lead.numberOfBaths ?? '',
      approxSqFootage: lead.approxSqFootage ?? '',
      propertyTypeId: lead.propertyTypeId ?? null,
      propertyCode: this.normalizePropertyCodeValue(lead.propertyCode),
      propertyOffice: lead.propertyOffice ?? '',
      tellUsWhatYouLikeMostAboutYourProperty: lead.tellUsWhatYouLikeMostAboutYourProperty ?? '',
      tellUsAnyDrawbacks: lead.tellUsAnyDrawbacks ?? '',
      preferredContactMethod: lead.preferredContactMethod ?? '',
      timeDateForContact: lead.timeDateForContact ?? '',
      notes: lead.notes ?? '',
      emailPhoneConsent: !!lead.emailPhoneConsent,
      smsConsent: !!lead.smsConsent,
      isActive: !!lead.isActive
    });
    this.refreshPropertyCodeOptions();
    this.syncPropertyOfficeFromSelectedCode();
  }

  defaultFormValues() {
    return {
      leadStateId: LeadStateType.New,
      agentCode: null as string | null,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      locationOfProperty: '',
      programInterest: '',
      whatIsPromptingContact: '',
      timeFrame: null as boolean | null,
      targetRentReadyDate: null as Date | null,
      propertyGoals: '',
      tellUsMoreAboutYourGoals: '',
      yearsOfExperienceWithRentals: '',
      tellUsMoreAboutProperty: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      numberOfBeds: '',
      numberOfBaths: '',
      approxSqFootage: '',
      propertyTypeId: null as number | null,
      propertyCode: null as string | null,
      propertyOffice: '',
      tellUsWhatYouLikeMostAboutYourProperty: '',
      tellUsAnyDrawbacks: '',
      preferredContactMethod: '',
      timeDateForContact: '',
      notes: '',
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: true
    };
  }
  //#endregion

  //#region Form Response Methods
  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onDigitsOnlyInput(event: Event, controlName: 'yearsOfExperienceWithRentals'): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    if (input.value !== v) {
      input.value = v;
    }
    this.form.get(controlName)?.setValue(v, { emitEvent: false });
  }

  onPropertyCodeSelected(): void {
    this.syncPropertyOfficeFromSelectedCode();
  }

  agentSelectLabel(agent: AgentResponse): string {
    const name = String(agent.name ?? '').trim();
    if (name.length) {
      return name;
    }
    return String(agent.agentCode ?? '').trim() || '—';
  }

  resolveSaveOfficeId(): number | null {
    const fromShell = this.officeId;
    if (fromShell != null && fromShell > 0) {
      return fromShell;
    }
    const fromProperty = this.findPropertyCodeRow(this.form.get('propertyCode')?.value)?.officeId ?? null;
    if (fromProperty != null && fromProperty > 0) {
      return fromProperty;
    }
    const fromLead = this.lead?.officeId ?? null;
    if (fromLead != null && fromLead > 0) {
      return fromLead;
    }
    return null;
  }

  resolveAgentIdFromAgentCode(agentCode: string | null | undefined): string | null {
    const code = String(agentCode ?? '').trim();
    if (!code) {
      return null;
    }
    const match = this.agents.find(a => String(a.agentCode ?? '').trim() === code);
    return match?.agentId ? String(match.agentId).trim() : null;
  }

  ensureOwnerLeadInactiveAndOpen(ownerId: number): void {
    const complete = () => {
      this.ngZone.run(() => {
        void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${ownerId}`);
      });
    };
    if (this.lead?.isActive === false) {
      complete();
      return;
    }
    this.leadsService.patchOwnerLead(ownerId, body => {
      body.isActive = false;
    }).pipe(take(1)).subscribe({
      next: updated => {
        this.lead = updated;
        this.populateForm(updated);
        complete();
      },
      error: () => {
        this.toastr.error('Unable to set owner lead inactive.', CommonMessage.Error);
        complete();
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property-codes');
      this.refreshPropertyCodeOptions();
      this.syncPropertyOfficeFromSelectedCode();
      this.markViewForCheck();
    })).subscribe({
      next: codes => {
        this.allPropertyCodes = (codes || []).slice().sort((a, b) =>
          String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
        );
      },
      error: () => {
        this.allPropertyCodes = [];
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1)).subscribe({
      next: a => {
        this.agents = (a || []).filter(x => x.isActive);
        if (this.lead) {
          this.populateForm(this.lead);
        }
      },
      error: () => (this.agents = [])
    });
  }

  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length) {
      this.states = [...cachedStates];
    }
    this.commonService.getStates().pipe(filter(states => states && states.length > 0), take(1)).subscribe({
      next: states => {
        this.states = [...states];
        if (this.lead) {
          this.populateForm(this.lead);
        }
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Utility Methods
  refreshPropertyCodeOptions(): void {
    const scopeOfficeId = this.officeId != null && this.officeId > 0 ? this.officeId : null;
    const scoped = scopeOfficeId == null
      ? this.allPropertyCodes
      : this.allPropertyCodes.filter(property => Number(property.officeId) === scopeOfficeId);
    const byCode = new Map<string, PropertyCodeResponse>();
    scoped.forEach(property => {
      const code = String(property.propertyCode || '').trim();
      if (code) {
        byCode.set(code.toUpperCase(), property);
      }
    });
    const currentCode = this.normalizePropertyCodeValue(this.form.get('propertyCode')?.value);
    if (currentCode && !byCode.has(currentCode.toUpperCase())) {
      const leadOfficeName = String(this.lead?.propertyOffice || this.form.get('propertyOffice')?.value || '').trim();
      byCode.set(currentCode.toUpperCase(), {
        propertyId: '',
        propertyCode: currentCode,
        propertyLeaseTypeId: 0,
        shortAddress: '',
        officeId: Number(this.lead?.officeId) || 0,
        officeName: leadOfficeName
      });
    }
    this.propertyCodeOptions = Array.from(byCode.values()).sort((a, b) =>
      String(a.propertyCode || '').localeCompare(String(b.propertyCode || ''), undefined, { sensitivity: 'base' })
    );
  }

  findPropertyCodeRow(propertyCode: string | null | undefined): PropertyCodeResponse | null {
    const normalized = this.normalizePropertyCodeValue(propertyCode);
    if (!normalized) {
      return null;
    }
    return this.allPropertyCodes.find(
      property => String(property.propertyCode || '').trim().toUpperCase() === normalized.toUpperCase()
    ) ?? null;
  }

  syncPropertyOfficeFromSelectedCode(): void {
    const row = this.findPropertyCodeRow(this.form.get('propertyCode')?.value);
    const officeName = row?.officeName ? String(row.officeName).trim() : '';
    this.form.get('propertyOffice')?.setValue(officeName, { emitEvent: false });
  }

  normalizePropertyCodeValue(value: string | null | undefined): string | null {
    const code = String(value ?? '').trim();
    return code === '' ? null : code;
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
