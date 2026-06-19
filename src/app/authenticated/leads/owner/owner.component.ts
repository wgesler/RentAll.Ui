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
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
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
  @Output() officeChange = new EventEmitter<number | null>();

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
  offices: OfficeResponse[] = [];

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
    private officeService: OfficeService,
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
    this.loadOffices();
    this.loadAgents();
    this.loadStates();
    this.getOwnerLead(this.shellLeadId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.syncPropertyOfficeFromShell();
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
      propertyOffice: this.resolvePropertyOfficeName(v.propertyOfficeId),
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
    this.syncPropertyOfficeFromShell();
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
      propertyCode: String(lead.propertyCode ?? '').trim().toUpperCase(),
      propertyOfficeId: this.resolvePropertyOfficeIdFromLead(lead),
      tellUsWhatYouLikeMostAboutYourProperty: lead.tellUsWhatYouLikeMostAboutYourProperty ?? '',
      tellUsAnyDrawbacks: lead.tellUsAnyDrawbacks ?? '',
      preferredContactMethod: lead.preferredContactMethod ?? '',
      timeDateForContact: lead.timeDateForContact ?? '',
      notes: lead.notes ?? '',
      emailPhoneConsent: !!lead.emailPhoneConsent,
      smsConsent: !!lead.smsConsent,
      isActive: !!lead.isActive
    });
    this.syncPropertyOfficeFromShell();
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
      propertyCode: '',
      propertyOfficeId: null as number | null,
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

  onPropertyCodeBlur(): void {
    const control = this.form.get('propertyCode');
    const normalized = String(control?.value ?? '').trim().toUpperCase();
    control?.setValue(normalized, { emitEvent: false });
    this.syncPropertyOfficeFromSelectedCode();
  }

  onPropertyOfficeSelected(): void {
    const officeId = Number(this.form.get('propertyOfficeId')?.value);
    if (Number.isFinite(officeId) && officeId > 0) {
      this.officeChange.emit(officeId);
    }
  }

  agentSelectLabel(agent: AgentResponse): string {
    const name = String(agent.name ?? '').trim();
    if (name.length) {
      return name;
    }
    return String(agent.agentCode ?? '').trim() || '—';
  }

  resolveSaveOfficeId(): number | null {
    const fromForm = Number(this.form.get('propertyOfficeId')?.value);
    if (Number.isFinite(fromForm) && fromForm > 0) {
      return fromForm;
    }
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
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe({
          next: offices => {
            this.offices = offices || [];
            this.syncPropertyOfficeFromShell();
            if (this.lead) {
              const officeId = this.resolvePropertyOfficeIdFromLead(this.lead);
              if (officeId != null) {
                this.form.patchValue({ propertyOfficeId: officeId }, { emitEvent: false });
              }
            }
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property-codes');
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
  findPropertyCodeRow(propertyCode: string | null | undefined): PropertyCodeResponse | null {
    const normalized = String(propertyCode ?? '').trim();
    if (!normalized) {
      return null;
    }
    return this.allPropertyCodes.find(
      property => String(property.propertyCode || '').trim().toUpperCase() === normalized.toUpperCase()
    ) ?? null;
  }

  syncPropertyOfficeFromSelectedCode(): void {
    if (this.officeId != null && this.officeId > 0) {
      return;
    }
    const row = this.findPropertyCodeRow(this.form.get('propertyCode')?.value);
    const officeId = Number(row?.officeId);
    if (Number.isFinite(officeId) && officeId > 0) {
      this.form.get('propertyOfficeId')?.setValue(officeId, { emitEvent: false });
    }
  }

  syncPropertyOfficeFromShell(): void {
    const shellOfficeId = Number(this.officeId);
    if (!Number.isFinite(shellOfficeId) || shellOfficeId <= 0) {
      return;
    }
    this.form.get('propertyOfficeId')?.setValue(shellOfficeId, { emitEvent: false });
  }

  resolvePropertyOfficeIdFromLead(lead: LeadOwnerResponse): number | null {
    const officeId = Number(lead.officeId);
    if (Number.isFinite(officeId) && officeId > 0) {
      return officeId;
    }
    const officeName = String(lead.propertyOffice || '').trim();
    if (!officeName) {
      return null;
    }
    const match = this.offices.find(office => String(office.name || '').trim() === officeName);
    return match?.officeId ?? null;
  }

  resolvePropertyOfficeName(officeId: number | null | undefined): string | null {
    const normalizedOfficeId = Number(officeId);
    if (!Number.isFinite(normalizedOfficeId) || normalizedOfficeId <= 0) {
      return null;
    }
    const officeName = this.offices.find(office => office.officeId === normalizedOfficeId)?.name;
    return this.utilityService.trimOrNull(officeName);
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
