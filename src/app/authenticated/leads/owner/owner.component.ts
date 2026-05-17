import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, filter, finalize, map, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AuthService } from '../../../services/auth.service';
import { EntityType, OwnerType } from '../../contacts/models/contact-enum';
import { ContactRequest } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
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
export class OwnerComponent implements OnInit, OnDestroy {
  embeddedInShell = input(false);
  shellLeadId = input<string | null>(null);
  officeId = input<number | null>(null);
  closed = output<OwnerLeadFormClosed>();
  officeSelectionRequired = output<void>();

  form: FormGroup;
  isServiceError = false;
  isPageReady = false;
  isAddMode = false;
  isSavingCreate = false;
  lead: LeadOwnerResponse | null = null;
  leadStateOptions = LEAD_STATE_SELECT_OPTIONS;
  organizationId = '';
  offices: OfficeResponse[] = [];
  globalOfficeSubscription?: Subscription;
  officeScopeResolved = false;
  preferredOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;

  agents: AgentResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-lead', 'agents']));
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
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
      this.loadOwnerLead(id);
    });
  }

  //#region Owner
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    const user = this.authService.getUser();
    this.organizationId = user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = user?.defaultOfficeId ?? null;

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
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
    this.loadAgents();

    this.route.paramMap .pipe(takeUntil(this.destroy$), map(pm => pm.get('id')), filter(() => !this.embeddedInShell())) .subscribe(id => this.loadOwnerLead(id));
  }

  loadOwnerLead(idParam: string | null): void {
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
    this.itemsToLoad$.next(new Set([...this.itemsToLoad$.value, 'owner-lead']));
    this.isServiceError = false;
    const ownerId = parseInt(String(idParam || '').trim(), 10);
    if (!ownerId || Number.isNaN(ownerId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead');
      return;
    }

    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead'))).subscribe({
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
    const resolvedOfficeId = this.isAddMode
      ? this.resolveCreateOfficeId()
      : (this.lead?.officeId ?? this.resolveCreateOfficeId());
    const hasValidOfficeSelection = resolvedOfficeId != null && resolvedOfficeId > 0;
    if (!hasValidOfficeSelection && this.embeddedInShell()) {
      this.officeSelectionRequired.emit();
    }
    if (this.form.invalid || !hasValidOfficeSelection) {
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
      typeOfProperty: this.utilityService.trimOrNull(v.typeOfProperty),
      tellUsWhatYouLikeMostAboutYourProperty: this.utilityService.trimOrNull(v.tellUsWhatYouLikeMostAboutYourProperty),
      tellUsAnyDrawbacks: this.utilityService.trimOrNull(v.tellUsAnyDrawbacks),
      preferredContactMethod: this.utilityService.trimOrNull(v.preferredContactMethod),
      timeDateForContact: this.utilityService.trimOrNull(v.timeDateForContact),
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingCreate = true;
    if (this.isAddMode) {
      this.leadsService.createOwnerLead(body).pipe(take(1), takeUntil(this.destroy$)).subscribe({
        next: created => {
          this.toastr.success('Owner lead created.', CommonMessage.Success);
          if (this.embeddedInShell()) {
            this.isSavingCreate = false;
            this.closed.emit({ saved: true, ownerId: created.ownerId });
            return;
          }
          void this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadOwner, [String(created.ownerId)]));
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
    this.leadsService.updateOwnerLead(updateBody).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: row => {
        this.toastr.success('Owner lead updated.', CommonMessage.Success);
        this.lead = row;
        this.populateForm(row);
        this.isSavingCreate = false;
        if (this.embeddedInShell()) {
          this.closed.emit({ saved: true, ownerId: row.ownerId });
        }
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
    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
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
              address1: ownerLead.address ?? '',
              city: ownerLead.city ?? '',
              state: ownerLead.state ?? '',
              zip: ownerLead.zip ?? '',
              phone: ownerLead.phone ?? null,
              email: ownerLead.email ?? '',
              rating: 0,
              isInternational: false,
              isActive: true
            };
            this.contactService.createContact(createContactRequest).pipe(take(1), takeUntil(this.destroy$)).subscribe({
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
    return this.fb.group({
      leadStateId: [LeadStateType.New],
      agentCode: this.fb.control<string | null>(null),
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      locationOfProperty: [''],
      programInterest: [''],
      whatIsPromptingContact: [''],
      timeFrame: this.fb.control<boolean | null>(null),
      targetRentReadyDate: this.fb.control<Date | null>(null),
      propertyGoals: [''],
      tellUsMoreAboutYourGoals: [''],
      yearsOfExperienceWithRentals: [''],
      tellUsMoreAboutProperty: [''],
      address: [''],
      city: [''],
      state: [''],
      zip: [''],
      numberOfBeds: [''],
      numberOfBaths: [''],
      approxSqFootage: [''],
      typeOfProperty: [''],
      tellUsWhatYouLikeMostAboutYourProperty: [''],
      tellUsAnyDrawbacks: [''],
      preferredContactMethod: [''],
      timeDateForContact: [''],
      emailPhoneConsent: [false],
      smsConsent: [false],
      isActive: [true]
    });
  }

  formReset(): void {
    this.form.reset({
      leadStateId: LeadStateType.New,
      agentCode: null,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      locationOfProperty: '',
      programInterest: '',
      whatIsPromptingContact: '',
      timeFrame: null,
      targetRentReadyDate: null,
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
      typeOfProperty: '',
      tellUsWhatYouLikeMostAboutYourProperty: '',
      tellUsAnyDrawbacks: '',
      preferredContactMethod: '',
      timeDateForContact: '',
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: true
    });
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
      state: lead.state ?? '',
      zip: lead.zip ?? '',
      numberOfBeds: lead.numberOfBeds ?? '',
      numberOfBaths: lead.numberOfBaths ?? '',
      approxSqFootage: lead.approxSqFootage ?? '',
      typeOfProperty: lead.typeOfProperty ?? '',
      tellUsWhatYouLikeMostAboutYourProperty: lead.tellUsWhatYouLikeMostAboutYourProperty ?? '',
      tellUsAnyDrawbacks: lead.tellUsAnyDrawbacks ?? '',
      preferredContactMethod: lead.preferredContactMethod ?? '',
      timeDateForContact: lead.timeDateForContact ?? '',
      emailPhoneConsent: !!lead.emailPhoneConsent,
      smsConsent: !!lead.smsConsent,
      isActive: !!lead.isActive
    });
  }
  //#endregion

  //#region Form Response Methods
  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  onDigitsOnlyInput(event: Event, controlName: 'yearsOfExperienceWithRentals'): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    if (input.value !== v) {
      input.value = v;
    }
    this.form.get(controlName)?.setValue(v, { emitEvent: false });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
  }

  agentSelectLabel(agent: AgentResponse): string {
    const name = String(agent.name ?? '').trim();
    if (name.length) {
      return name;
    }
    return String(agent.agentCode ?? '').trim() || '—';
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

  resolveAgentIdFromAgentCode(agentCode: string | null | undefined): string | null {
    const code = String(agentCode ?? '').trim();
    if (!code) {
      return null;
    }
    const match = this.agents.find(a => String(a.agentCode ?? '').trim() === code);
    return match?.agentId ? String(match.agentId).trim() : null;
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];

      },
      error: () => {
        this.offices = [];
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'))).subscribe({
      next: a => {
        this.agents = (a || []).filter(x => x.isActive);
        if (this.lead) {
          this.populateForm(this.lead);
        }
      },
      error: () => (this.agents = [])
    });
  }
  //#endregion

  //#region Utility Methods
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
    this.leadsService.getOwnerLeadById(ownerId).pipe(
      take(1),
      takeUntil(this.destroy$),
      map(owner => {
        const body = this.mappingService.mapLeadOwnerResponseToUpdateRequest(owner);
        body.isActive = false;
        return body;
      }),
      switchMap(body => this.leadsService.updateOwnerLead(body).pipe(take(1)))
    ).subscribe({
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

  back(): void {
    if (this.embeddedInShell()) {
      this.closed.emit({ saved: false });
      return;
    }
    this.ngZone.run(() => {
      void this.router.navigateByUrl(`${RouterUrl.Leads}?tab=owner`);
    });
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }
  
  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
