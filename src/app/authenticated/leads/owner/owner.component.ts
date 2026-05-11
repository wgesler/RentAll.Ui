import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { LeadOwnerCreateRequest, LeadOwnerResponse } from '../models/lead-owner.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType, formatLeadStateLabel } from '../models/lead-enums';
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
  closed = output<OwnerLeadFormClosed>();

  isServiceError = false;
  isPageReady = false;
  isCreateMode = false;
  isSavingCreate = false;
  lead: LeadOwnerResponse | null = null;

  readonly leadStateOptions = LEAD_STATE_SELECT_OPTIONS;

  agents: AgentResponse[] = [];

  createForm = this.fb.group({
    leadStateId: [LeadStateType.New],
    agentCode: this.fb.control<string | null>(null),
    firstName: [''],
    lastName: [''],
    email: ['', Validators.email],
    phone: [''],
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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner']));

  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private leadsService: LeadsService,
    private agentService: AgentService,
    private utilityService: UtilityService,
    private formatterService: FormatterService
  ) {
    effect(() => {
      if (!this.embeddedInShell()) {
        return;
      }
      const id = this.shellLeadId();
      if (id == null || id === '') {
        return;
      }
      this.loadOwner(id);
    });
  }

  //#region Owner
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadAgents();

    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        map(pm => pm.get('id')),
        filter(() => !this.embeddedInShell())
      )
      .subscribe(id => this.loadOwner(id));
  }

  leadStateDisplay(leadStateId: number): string {
    return formatLeadStateLabel(leadStateId);
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

  saveNewOwner(): void {
    if (this.isSavingCreate) {
      return;
    }
    this.formatterService.formatPhoneControl(this.createForm.get('phone'));
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      const emailErr = this.createForm.get('email')?.errors?.['email'];
      this.toastr.error(
        emailErr ? 'Enter a valid email address.' : 'Please correct the highlighted fields.',
        CommonMessage.Error
      );
      return;
    }
    const v = this.createForm.getRawValue();
    const body: LeadOwnerCreateRequest = {
      leadStateId: Number(v.leadStateId),
      agentId: this.resolveAgentIdFromAgentCode(v.agentCode ?? null),
      firstName: this.trimOrNull(v.firstName),
      lastName: this.trimOrNull(v.lastName),
      email: this.trimOrNull(v.email),
      phone: this.trimOrNull(v.phone),
      locationOfProperty: this.trimOrNull(v.locationOfProperty),
      programInterest: this.trimOrNull(v.programInterest),
      whatIsPromptingContact: this.trimOrNull(v.whatIsPromptingContact),
      timeFrame: v.timeFrame,
      targetRentReadyDate: this.utilityService.formatDateOnlyForApi(v.targetRentReadyDate),
      propertyGoals: this.trimOrNull(v.propertyGoals),
      tellUsMoreAboutYourGoals: this.trimOrNull(v.tellUsMoreAboutYourGoals),
      yearsOfExperienceWithRentals: this.parseOptionalIntString(v.yearsOfExperienceWithRentals),
      tellUsMoreAboutProperty: this.trimOrNull(v.tellUsMoreAboutProperty),
      address: this.trimOrNull(v.address),
      city: this.trimOrNull(v.city),
      state: this.trimOrNull(v.state),
      zip: this.trimOrNull(v.zip),
      numberOfBeds: this.trimOrNull(v.numberOfBeds),
      numberOfBaths: this.trimOrNull(v.numberOfBaths),
      approxSqFootage: this.trimOrNull(v.approxSqFootage),
      typeOfProperty: this.trimOrNull(v.typeOfProperty),
      tellUsWhatYouLikeMostAboutYourProperty: this.trimOrNull(v.tellUsWhatYouLikeMostAboutYourProperty),
      tellUsAnyDrawbacks: this.trimOrNull(v.tellUsAnyDrawbacks),
      preferredContactMethod: this.trimOrNull(v.preferredContactMethod),
      timeDateForContact: this.trimOrNull(v.timeDateForContact),
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingCreate = true;
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
  }

  formatDate(value: string | null | undefined): string {
    return this.formatterService.formatDateString(value ?? undefined) || '—';
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.createForm.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.createForm.get('phone'));
  }

  onDigitsOnlyInput(event: Event, controlName: 'yearsOfExperienceWithRentals'): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    if (input.value !== v) {
      input.value = v;
    }
    this.createForm.get(controlName)?.setValue(v, { emitEvent: false });
  }

  //#endregion

  //#region Data Loading Methods
  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), takeUntil(this.destroy$), finalize(() => {})).subscribe({
      next: a => (this.agents = (a || []).filter(x => x.isActive)),
      error: () => (this.agents = [])
    });
  }

  loadOwner(idParam: string | null): void {
    const raw = String(idParam || '').trim().toLowerCase();
    if (raw === 'new') {
      this.isCreateMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.createForm.reset({
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
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner');
      return;
    }

    this.isCreateMode = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'owner');
    this.isServiceError = false;
    const ownerId = parseInt(String(idParam || '').trim(), 10);
    if (!ownerId || Number.isNaN(ownerId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner');
      return;
    }

    this.leadsService
      .getOwnerLeadById(ownerId)
      .pipe(
        take(1),
        takeUntil(this.destroy$),
        finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner'))
      )
      .subscribe({
        next: row => {
          this.lead = row;
        },
        error: () => {
          this.lead = null;
          this.isServiceError = true;
        }
      });
  }
  //#endregion

  //#region Utility Methods
  agentSelectLabel(agent: AgentResponse): string {
    const name = String(agent.name ?? '').trim();
    if (name.length) {
      return name;
    }
    return String(agent.agentCode ?? '').trim() || '—';
  }

  private resolveAgentIdFromAgentCode(agentCode: string | null | undefined): string | null {
    const code = String(agentCode ?? '').trim();
    if (!code) {
      return null;
    }
    const match = this.agents.find(a => String(a.agentCode ?? '').trim() === code);
    return match?.agentId ? String(match.agentId).trim() : null;
  }

  private trimOrNull(value: unknown): string | null {
    const s = String(value ?? '').trim();
    return s.length ? s : null;
  }

  private parseOptionalIntString(value: unknown): number | null {
    const s = String(value ?? '')
      .trim()
      .replace(/\D/g, '');
    if (!s) {
      return null;
    }
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
