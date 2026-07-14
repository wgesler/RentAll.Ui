import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { AgentService } from '../../organizations/services/agent.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { LeadRentalRequest, LeadRentalResponse } from '../models/lead-rental.model';
import { LEAD_STATE_SELECT_OPTIONS, LeadStateType } from '../models/lead-enums';
import { RentalQuotePropertyOption, RentalQuotePropertySelectDialogComponent } from '../rental-list/rental-quote-property-select-dialog.component';
import { LeadsService } from '../services/leads.service';

export type RentalLeadFormClosed = { saved: boolean; rentalId?: number };

@Component({
  standalone: true,
  selector: 'app-rental',
  templateUrl: './rental.component.html',
  styleUrls: ['./rental.component.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class RentalComponent implements OnInit, OnChanges, OnDestroy {

  @Input() shellLeadId: string | null = null;
  @Input() officeId: number | null = null;
  @Output() closed = new EventEmitter<RentalLeadFormClosed>();
  @Output() officeSelectionRequired = new EventEmitter<void>();
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private leadsService = inject(LeadsService);
  private agentService = inject(AgentService);
  private propertyService = inject(PropertyService);
  private utilityService = inject(UtilityService);
  private formatterService = inject(FormatterService);
  private officeService = inject(OfficeService);
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  isServiceError = false;
  isPageReady = false;
  isAddMode = false;
  isSavingCreate = false;
  lead: LeadRentalResponse | null = null;
  leadStateOptions = LEAD_STATE_SELECT_OPTIONS;

  organizationId = '';
  offices: OfficeResponse[] = [];
  officeScopeResolved = false;
  selectedOffice: OfficeResponse | null = null;
  activeProperties: PropertyListResponse[] = [];
  agents: AgentResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rental-lead']));
  destroy$ = new Subject<void>();

  constructor() {
    this.form = this.buildForm();
  }

  //#region Rental
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.loadOffices();
    this.loadActiveProperties();
    this.loadAgents();
    this.getRentalLead(this.shellLeadId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId);
    }

    if (changes['shellLeadId'] && !changes['shellLeadId'].firstChange) {
      this.getRentalLead(this.shellLeadId);
    }
  }

  getRentalLead(idParam: string | null): void {
    const raw = String(idParam || '').trim().toLowerCase();
    if (raw === 'new') {
      this.isAddMode = true;
      this.isServiceError = false;
      this.lead = null;
      this.resetForm();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental-lead');
      return;
    }

    this.isAddMode = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'rental-lead');
    this.isServiceError = false;
    const rentalId = parseInt(String(idParam || '').trim(), 10);
    if (!rentalId || Number.isNaN(rentalId)) {
      this.lead = null;
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental-lead');
      return;
    }

    this.leadsService.getRentalLeadById(rentalId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental-lead'))).subscribe({
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

  saveRentalLead(): void {
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
    const body: LeadRentalRequest = {
      rentalId: this.isAddMode ? undefined : this.lead?.rentalId,
      leadStateId: Number(v.leadStateId),
      officeId: resolvedOfficeId,
      agentId: this.resolveAgentIdFromAgentCode(v.agentCode ?? null),
      firstName: this.utilityService.trimOrNull(v.firstName),
      lastName: this.utilityService.trimOrNull(v.lastName),
      email: this.utilityService.trimOrNull(v.email),
      phone: this.utilityService.trimOrNull(v.phone),
      desiredLocation: this.utilityService.trimOrNull(v.desiredLocation),
      propertyRefId: this.utilityService.trimOrNull(v.propertyRefId ?? null),
      estimatedArrivalDate: this.utilityService.formatDateOnlyForApi(v.estimatedArrivalDate),
      estimatedDepartureDate: this.utilityService.formatDateOnlyForApi(v.estimatedDepartureDate),
      maxMonthlyBudget: this.utilityService.parseOptionalNumberString(v.maxMonthlyBudget),
      minBedrooms: this.utilityService.parseOptionalIntString(v.minBedrooms),
      numberOfOccupants: this.utilityService.trimOrNull(v.numberOfOccupants),
      whatBringsYouToTown: this.utilityService.trimOrNull(v.whatBringsYouToTown),
      howDidYouFindUs: this.utilityService.trimOrNull(v.howDidYouFindUs),
      tellUsMoreAboutHowYouFoundUs: this.utilityService.trimOrNull(v.tellUsMoreAboutHowYouFoundUs),
      petFriendly: v.petFriendly,
      decisionDate: this.utilityService.formatDateOnlyForApi(v.decisionDate),
      organizationName: this.utilityService.trimOrNull(v.organizationName),
      additionalInformation: this.utilityService.trimOrNull(v.additionalInformation),
      notes: this.utilityService.trimOrNull(v.notes),
      quotePath: this.utilityService.trimOrNull(this.lead?.quotePath ?? null),
      iNeedAsap: !!v.iNeedAsap,
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: !!v.isActive
    };
    this.isSavingCreate = true;
    if (this.isAddMode) {
      this.leadsService.createRentalLead(body).pipe(take(1)).subscribe({
        next: created => {
          this.toastr.success('Rental lead created.', CommonMessage.Success);
          this.isSavingCreate = false;
          this.closed.emit({ saved: true, rentalId: created.rentalId });
        },
        error: () => {
          this.toastr.error('Unable to create rental lead.', CommonMessage.Error);
          this.isSavingCreate = false;
        }
      });
      return;
    }
    const rentalId = this.lead?.rentalId;
    if (!rentalId) {
      this.isSavingCreate = false;
      return;
    }
    const updateBody: LeadRentalRequest = { ...body, rentalId };
    this.leadsService.updateRentalLead(updateBody).pipe(take(1)).subscribe({
      next: row => {
        this.toastr.success('Rental lead updated.', CommonMessage.Success);
        this.lead = row;
        this.populateForm(row);
        this.isSavingCreate = false;
        this.closed.emit({ saved: true, rentalId: row.rentalId });
      },
      error: () => {
        this.toastr.error('Unable to update rental lead.', CommonMessage.Error);
        this.isSavingCreate = false;
      }
    });
  }

  generateQuote(): void {
    const preparedForName = `${String(this.form.get('firstName')?.value || '').trim()} ${String(this.form.get('lastName')?.value || '').trim()}`.trim();
    const quoteEmail = String(this.form.get('email')?.value || '').trim();
    const preparedBy = this.getCurrentUserFullName();
    const quoteValidFor = this.getQuoteValidForDateOneWeekFromToday();
    const selectedPropertyCode = String(this.form.get('propertyRefId')?.value || '').trim().toLowerCase();

    const options: RentalQuotePropertyOption[] = (this.activeProperties || [])
      .map(property => ({
        propertyId: String(property.propertyId || '').trim(),
        propertyCode: String(property.propertyCode || '').trim()
      }))
      .filter(property => property.propertyId !== '' && property.propertyCode !== '')
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));
    if (options.length === 0) {
      this.toastr.warning('No active properties are available to generate a quote.', 'Warning');
      return;
    }

    const preselectedPropertyIds = selectedPropertyCode
      ? options.filter(property => property.propertyCode.toLowerCase() === selectedPropertyCode).map(property => property.propertyId)
      : [];

    this.dialog.open(RentalQuotePropertySelectDialogComponent, {
      width: '28rem',
      data: {
        options,
        selectedPropertyIds: preselectedPropertyIds
      }
    }).afterClosed().pipe(take(1)).subscribe(selectedPropertyIds => {
      const selectedPropertyIdValues = Array.isArray(selectedPropertyIds) ? selectedPropertyIds : [];
      const normalizedPropertyIds: string[] = Array.from(
        new Set(
          selectedPropertyIdValues
            .map(propertyId => String(propertyId || '').trim())
            .filter(propertyId => propertyId !== '')
        )
      );
      if (normalizedPropertyIds.length === 0) {
        return;
      }
      const quotePath = this.buildQuoteCreatePath(
        normalizedPropertyIds,
        preparedForName,
        quoteEmail,
        preparedBy,
        quoteValidFor,
        this.lead?.rentalId ?? undefined
      );
      this.navigateToQuoteCreate(quotePath);
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
      notes: [''],
      iNeedAsap: [false],
      emailPhoneConsent: [false],
      smsConsent: [false],
      isActive: [true]
    });
  }

  resetForm(): void {
    this.form.reset({
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
      notes: '',
      iNeedAsap: false,
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: true
    });
  }

  populateForm(lead: LeadRentalResponse): void {
    const agentId = String(lead.agentId ?? '').trim();
    const agentCode =
      !agentId ? null : (this.agents.find(a => String(a.agentId ?? '').trim() === agentId)?.agentCode ?? null);
    const maxBudget =
      lead.maxMonthlyBudget != null && !Number.isNaN(Number(lead.maxMonthlyBudget))
        ? this.formatterService.currencyUsd(Number(lead.maxMonthlyBudget))
        : '';
    this.form.patchValue({
      leadStateId: lead.leadStateId,
      agentCode: agentCode != null && String(agentCode).trim() !== '' ? String(agentCode).trim() : null,
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: this.formatterService.phoneNumber(lead.phone || '') || '',
      desiredLocation: lead.desiredLocation ?? '',
      propertyRefId: lead.propertyRefId ?? null,
      estimatedArrivalDate: this.utilityService.parseDateOnlyStringToDate(lead.estimatedArrivalDate),
      estimatedDepartureDate: this.utilityService.parseDateOnlyStringToDate(lead.estimatedDepartureDate),
      maxMonthlyBudget: maxBudget,
      minBedrooms: lead.minBedrooms != null ? String(lead.minBedrooms) : '',
      numberOfOccupants: lead.numberOfOccupants ?? '',
      whatBringsYouToTown: lead.whatBringsYouToTown ?? '',
      howDidYouFindUs: lead.howDidYouFindUs ?? '',
      tellUsMoreAboutHowYouFoundUs: lead.tellUsMoreAboutHowYouFoundUs ?? '',
      petFriendly: lead.petFriendly,
      decisionDate: this.utilityService.parseDateOnlyStringToDate(lead.decisionDate),
      organizationName: lead.organizationName ?? '',
      additionalInformation: lead.additionalInformation ?? '',
      notes: lead.notes ?? '',
      iNeedAsap: !!lead.iNeedAsap,
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

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onMaxMonthlyBudgetDecimalInput(event: Event): void {
    this.formatterService.formatDecimalInput(event, this.form.get('maxMonthlyBudget'));
  }

  onMaxMonthlyBudgetFocus(event: FocusEvent): void {
    const ctrl = this.form.get('maxMonthlyBudget');
    const input = event.target as HTMLInputElement;
    const raw = String(ctrl?.value ?? '').trim();
    if (!raw) {
      return;
    }
    const n = this.utilityService.parseOptionalNumberString(raw);
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
    const ctrl = this.form.get('maxMonthlyBudget');
    const raw = String(ctrl?.value ?? '').trim();
    if (!raw) {
      ctrl?.setValue('');
      return;
    }
    const n = this.utilityService.parseOptionalNumberString(raw);
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
    this.form.get(controlName)?.setValue(v, { emitEvent: false });
  }

  agentSelectLabel(agent: AgentResponse): string {
    const name = String(agent.name ?? '').trim();
    if (name.length) {
      return name;
    }
    return String(agent.agentCode ?? '').trim() || '—';
  }

  propertyRefExtraMatOptionValue(): string | null {
    if (!this.isAddMode) {
      return null;
    }
    const raw = String(this.form.get('propertyRefId')?.value ?? '').trim();
    if (!raw) {
      return null;
    }
    const known = this.activeProperties.some(p => String(p.propertyCode ?? '').trim() === raw);
    return known ? null : raw;
  }

  resolveSaveOfficeId(): number | null {
    const fromShell = this.normalizeShellOfficeId();
    if (this.isAddMode) {
      return fromShell;
    }
    const fromLead = Number(this.lead?.officeId ?? 0);
    if (Number.isFinite(fromLead) && fromLead > 0) {
      return fromLead;
    }
    return fromShell;
  }

  normalizeShellOfficeId(): number | null {
    const officeId = Number(this.officeId ?? 0);
    return Number.isFinite(officeId) && officeId > 0 ? officeId : null;
  }

  normalizePropertyRefToKnownPropertyCode(): void {
    const ctrl = this.form.get('propertyRefId');
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

  resolveAgentIdFromAgentCode(agentCode: string | null | undefined): string | null {
    const code = String(agentCode ?? '').trim();
    if (!code) {
      return null;
    }
    const match = this.agents.find(a => String(a.agentCode ?? '').trim() === code);
    return match?.agentId ? String(match.agentId).trim() : null;
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
  }

  buildQuoteCreatePath(
    propertyIds: string[],
    preparedForName: string,
    quoteEmail: string,
    preparedBy: string,
    quoteValidFor: string,
    rentalId?: number
  ): string {
    const queryParams: string[] = ['returnTo=property-list'];
    if (propertyIds.length > 0) {
      queryParams.push(`propertyIds=${propertyIds.join(',')}`);
    }
    if (preparedForName) {
      queryParams.push(`qpfn=${encodeURIComponent(preparedForName)}`);
    }
    if (quoteEmail) {
      queryParams.push(`qem=${encodeURIComponent(quoteEmail)}`);
    }
    if (preparedBy) {
      queryParams.push(`qag=${encodeURIComponent(preparedBy)}`);
    }
    if (quoteValidFor) {
      queryParams.push(`qvf=${encodeURIComponent(quoteValidFor)}`);
    }
    if (rentalId && rentalId > 0) {
      queryParams.push(`lrid=${rentalId}`);
    }
    return `${RouterUrl.QuoteCreate}?${queryParams.join('&')}`;
  }

  navigateToQuoteCreate(quotePath: string): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(quotePath);
    });
  }

  getCurrentUserFullName(): string {
    const currentUser = this.authService.getUser();
    return `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
  }

  getQuoteValidForDateOneWeekFromToday(): string {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toLocaleDateString('en-US');
  }
  //#endregion

  //#region Data Loading Methods
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

  loadActiveProperties(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.activeProperties = [];
      return;
    }
    this.propertyService.getActivePropertiesBySelectionCriteria(userId).pipe(take(1)).subscribe({
      next: p => {
        this.activeProperties = p || [];
        if (this.lead) {
          this.populateForm(this.lead);
        }
        this.normalizePropertyRefToKnownPropertyCode();
      },
      error: () => (this.activeProperties = [])
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
  //#endregion

  //#region Utility Methods
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
