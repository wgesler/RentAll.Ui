import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { getStringQueryParam } from '../../shared/query-param.utils';
import { LeadRentalCreateRequest, LeadRentalResponse } from '../models/lead-rental.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType, formatLeadStateLabel } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

export type RentalLeadFormClosed = { saved: boolean; rentalId?: number };

@Component({
  standalone: true,
  selector: 'app-rental',
  templateUrl: './rental.component.html',
  styleUrls: ['./rental.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class RentalComponent implements OnInit, OnDestroy {
  embeddedInShell = input(false);
  shellLeadId = input<string | null>(null);
  closed = output<RentalLeadFormClosed>();

  isServiceError = false;
  isPageReady = false;
  isCreateMode = false;
  isSavingCreate = false;
  lead: LeadRentalResponse | null = null;

  readonly leadStateOptions = LEAD_STATE_SELECT_OPTIONS;

  activeProperties: PropertyListResponse[] = [];
  agents: AgentResponse[] = [];

  createForm = this.fb.group({
    leadStateId: [LeadStateType.New],
    agentCode: this.fb.control<string | null>(null),
    firstName: [''],
    lastName: [''],
    email: ['', Validators.email],
    phone: [''],
    desiredLocation: [''],
    propertyRefId: this.fb.control<string | null>(null),
    estimatedArrivalDate: this.fb.control<Date | null>(null),
    estimatedDepartureDate: this.fb.control<Date | null>(null),
    maxMonthlyBudget: [''],
    minBedrooms: [''],
    numberOfOccupants: [''],
    whatBringsYouToTown: [''],
    howDidYouFindUs: [''],
    tellUsMoreAboutHowYouFoundUs: [''],
    petFriendly: this.fb.control<boolean | null>(null),
    decisionDate: this.fb.control<Date | null>(null),
    organizationName: [''],
    additionalInformation: [''],
    iNeedAsap: [false],
    emailPhoneConsent: [false],
    smsConsent: [false],
    isActive: [true]
  });

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rental']));

  destroy$ = new Subject<void>();
  private routePropertyRefPrefillApplied = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private leadsService: LeadsService,
    private agentService: AgentService,
    private propertyService: PropertyService,
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
      this.loadRental(id);
    });
  }

  //#region Rental
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadActiveProperties();
    this.loadAgents();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.isNewRentalLeadFlow()) {
        return;
      }
      this.applyPropertyRefFromRouteIfNeeded();
      this.normalizePropertyRefToKnownPropertyCode();
    });

    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        map(pm => pm.get('id')),
        filter(() => !this.embeddedInShell())
      )
      .subscribe(id => this.loadRental(id));
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
      this.router.navigateByUrl(RouterUrl.Leads);
    });
  }

  saveNewRental(): void {
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
    const body: LeadRentalCreateRequest = {
      leadStateId: Number(v.leadStateId),
      agentId: this.resolveAgentIdFromAgentCode(v.agentCode ?? null),
      firstName: this.trimOrNull(v.firstName),
      lastName: this.trimOrNull(v.lastName),
      email: this.trimOrNull(v.email),
      phone: this.trimOrNull(v.phone),
      desiredLocation: this.trimOrNull(v.desiredLocation),
      propertyRefId: this.trimOrNull(v.propertyRefId ?? null),
      estimatedArrivalDate: this.utilityService.formatDateOnlyForApi(v.estimatedArrivalDate),
      estimatedDepartureDate: this.utilityService.formatDateOnlyForApi(v.estimatedDepartureDate),
      maxMonthlyBudget: this.parseOptionalNumberString(v.maxMonthlyBudget),
      minBedrooms: this.parseOptionalIntString(v.minBedrooms),
      numberOfOccupants: this.trimOrNull(v.numberOfOccupants),
      whatBringsYouToTown: this.trimOrNull(v.whatBringsYouToTown),
      howDidYouFindUs: this.trimOrNull(v.howDidYouFindUs),
      tellUsMoreAboutHowYouFoundUs: this.trimOrNull(v.tellUsMoreAboutHowYouFoundUs),
      petFriendly: v.petFriendly,
      decisionDate: this.utilityService.formatDateOnlyForApi(v.decisionDate),
      organizationName: this.trimOrNull(v.organizationName),
      additionalInformation: this.trimOrNull(v.additionalInformation),
      iNeedAsap: !!v.iNeedAsap,
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingCreate = true;
    this.leadsService.createRentalLead(body).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: created => {
        this.toastr.success('Rental lead created.', CommonMessage.Success);
        if (this.embeddedInShell()) {
          this.isSavingCreate = false;
          this.closed.emit({ saved: true, rentalId: created.rentalId });
          return;
        }
        void this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadRental, [String(created.rentalId)]));
      },
      error: () => {
        this.toastr.error('Unable to create rental lead.', CommonMessage.Error);
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

  onMaxMonthlyBudgetDecimalInput(event: Event): void {
    this.formatterService.formatDecimalInput(event, this.createForm.get('maxMonthlyBudget'));
  }

  onMaxMonthlyBudgetFocus(event: FocusEvent): void {
    const ctrl = this.createForm.get('maxMonthlyBudget');
    const input = event.target as HTMLInputElement;
    const raw = String(ctrl?.value ?? '').trim();
    if (!raw) {
      return;
    }
    const n = this.parseMoneyStringToNumber(raw);
    if (n === null || Number.isNaN(n)) {
      return;
    }
    const plain = n.toFixed(2);
    ctrl?.setValue(plain, { emitEvent: true });
    if (input.value !== plain) {
      input.value = plain;
    }
  }

  onMaxMonthlyBudgetBlur(): void {
    const ctrl = this.createForm.get('maxMonthlyBudget');
    const raw = String(ctrl?.value ?? '').trim();
    if (!raw) {
      ctrl?.setValue('');
      return;
    }
    const n = this.parseMoneyStringToNumber(raw);
    if (n === null || Number.isNaN(n)) {
      ctrl?.setValue('');
      return;
    }
    ctrl?.setValue(this.formatterService.currencyUsd(n));
  }

  onDigitsOnlyInput(event: Event, controlName: 'minBedrooms' | 'numberOfOccupants'): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    if (input.value !== v) {
      input.value = v;
    }
    this.createForm.get(controlName)?.setValue(v, { emitEvent: false });
  }

  //#endregion

  //#region Data Loading Methods
  loadActiveProperties(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.activeProperties = [];
      return;
    }
    this.propertyService
      .getActivePropertiesBySelectionCriteria(userId)
      .pipe(take(1), takeUntil(this.destroy$), finalize(() => {}))
      .subscribe({
        next: p => {
          this.activeProperties = p || [];
          if (this.isNewRentalLeadFlow()) {
            this.normalizePropertyRefToKnownPropertyCode();
          }
        },
        error: () => (this.activeProperties = [])
      });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), takeUntil(this.destroy$), finalize(() => {})).subscribe({ next: a => (this.agents = (a || []).filter(x => x.isActive)), error: () => (this.agents = []) });
  }

  loadRental(idParam: string | null): void {
    const raw = String(idParam || '').trim().toLowerCase();
    if (raw === 'new') {
      this.isCreateMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.routePropertyRefPrefillApplied = false;
      this.createForm.reset({
        leadStateId: LeadStateType.New,
        agentCode: null,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        desiredLocation: '',
        propertyRefId: null,
        estimatedArrivalDate: null,
        estimatedDepartureDate: null,
        maxMonthlyBudget: '',
        minBedrooms: '',
        numberOfOccupants: '',
        whatBringsYouToTown: '',
        howDidYouFindUs: '',
        tellUsMoreAboutHowYouFoundUs: '',
        petFriendly: null,
        decisionDate: null,
        organizationName: '',
        additionalInformation: '',
        iNeedAsap: false,
        emailPhoneConsent: false,
        smsConsent: false,
        isActive: true
      });
      this.applyPropertyRefFromRouteIfNeeded();
      this.normalizePropertyRefToKnownPropertyCode();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental');
      return;
    }

    this.isCreateMode = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'rental');
    this.isServiceError = false;
    const rentalId = parseInt(String(idParam || '').trim(), 10);
    if (!rentalId || Number.isNaN(rentalId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental');
      return;
    }

    this.leadsService
      .getRentalLeadById(rentalId)
      .pipe(
        take(1),
        takeUntil(this.destroy$),
        finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental'))
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

  propertyRefExtraMatOptionValue(): string | null {
    if (!this.isCreateMode) {
      return null;
    }
    const raw = String(this.createForm.get('propertyRefId')?.value ?? '').trim();
    if (!raw) {
      return null;
    }
    const known = this.activeProperties.some(p => String(p.propertyCode ?? '').trim() === raw);
    return known ? null : raw;
  }

  private isNewRentalLeadFlow(): boolean {
    if (this.embeddedInShell()) {
      return String(this.shellLeadId() ?? '').trim().toLowerCase() === 'new';
    }
    return String(this.route.snapshot.paramMap.get('id') ?? '').trim().toLowerCase() === 'new';
  }

  private applyPropertyRefFromRouteIfNeeded(): void {
    if (this.routePropertyRefPrefillApplied) {
      return;
    }
    const fromQuery = this.readPropertyRefIdFromRouteQuery();
    if (!fromQuery) {
      return;
    }
    this.createForm.patchValue({ propertyRefId: fromQuery });
    this.routePropertyRefPrefillApplied = true;
  }

  private readPropertyRefIdFromRouteQuery(): string | null {
    let current: ActivatedRoute | null = this.route;
    while (current) {
      const q = current.snapshot.queryParams as Record<string, unknown>;
      const v = getStringQueryParam(q, 'propertyRefId') ?? getStringQueryParam(q, 'propertyRef');
      if (v) {
        return v;
      }
      current = current.parent;
    }
    return null;
  }

  private normalizePropertyRefToKnownPropertyCode(): void {
    const ctrl = this.createForm.get('propertyRefId');
    const raw = String(ctrl?.value ?? '').trim();
    if (!raw || !this.activeProperties.length) {
      return;
    }
    const match = this.activeProperties.find(
      p => String(p.propertyCode ?? '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (match) {
      ctrl?.setValue(String(match.propertyCode ?? '').trim(), { emitEvent: false });
    }
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

  private parseMoneyStringToNumber(raw: string): number | null {
    const t = raw.trim();
    if (!t) {
      return null;
    }
    const normalized = t.replace(/[$,\s]/g, '');
    if (normalized === '' || normalized === '.') {
      return null;
    }
    const n = Number(normalized);
    return Number.isNaN(n) ? null : n;
  }

  private parseOptionalNumberString(value: unknown): number | null {
    const s = String(value ?? '').trim();
    if (!s) {
      return null;
    }
    const normalized = s.replace(/[$,\s]/g, '');
    if (!normalized || normalized === '.') {
      return null;
    }
    const n = Number(normalized);
    return Number.isNaN(n) ? null : n;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
