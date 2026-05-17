import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { FormatterService } from '../../../services/formatter-service';
import { ContactService } from '../../contacts/services/contact.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { LeadOwnerResponse, LeadOwnerUpdateRequest } from '../../leads/models/lead-owner.model';
import { PublicOwnerFormResponse, PublicOwnerFormSubmitRequest } from '../../leads/models/owner-form-share.model';
import { LeadsService } from '../../leads/services/leads.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { OWNER_INFORMATION_CURRENCY_CONTROL_NAMES } from '../models/owner-information.model';
import { UtilityService } from '../../../services/utility.service';

@Component({
  standalone: true,
  selector: 'app-owner-information',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, ContactComponent],
  templateUrl: './owner-information.component.html',
  styleUrl: '../owner-shell/owner-shell.component.scss'
})
export class OwnerInformationComponent implements OnChanges, OnDestroy {
  @Input() token = '';
  @Input() ownerEntityTypeId!: number;
  @Input() ownerLeadId: number | null = null;
  @Input() selectedOfficeId: number | null = null;

  ownerForm: FormGroup = this.buildForm();
  isSaving = false;
  isPageReady = false;
  primaryOwnerContactId: string | null = null;
  primaryOwnerPrefill: Record<string, unknown> | null = null;
  additionalOwnerFormIds: number[] = [];
  nextAdditionalOwnerFormId = 1;
  additionalOwnerContactIdsByFormId: Record<number, string> = {};
  publicOwnerFormSnapshot: PublicOwnerFormResponse | null = null;
  leadOwnerSnapshot: LeadOwnerResponse | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-context']));
  hasLoadStateSubscription = false;
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private leadsService: LeadsService,
    private contactService: ContactService,
    private toastr: ToastrService,
    private utilityService: UtilityService
  ) {}

  //#region Owner-Information
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['token'] || changes['ownerLeadId']) {
      this.ensureLoadStateSubscription();
      this.itemsToLoad$.next(new Set(['owner-context']));
      this.loadOwnerContext();
    }
  }

  onPrimaryOwnerSaved(event: { saved?: boolean; contactId?: string; entityTypeId?: number }): void {
    if (!event?.saved) {
      return;
    }
    const contactId = String(event.contactId || '').trim();
    if (contactId) {
      this.primaryOwnerContactId = contactId;
    }
  }

  onAddAdditionalOwnerRequested(): void {
    this.additionalOwnerFormIds.push(this.nextAdditionalOwnerFormId);
    this.nextAdditionalOwnerFormId += 1;
  }

  onAdditionalOwnerSaved(formId: number, event: { saved?: boolean; contactId?: string; entityTypeId?: number }): void {
    if (!event?.saved) {
      return;
    }
    const contactId = String(event.contactId || '').trim();
    if (!contactId) {
      return;
    }
    this.additionalOwnerContactIdsByFormId[formId] = contactId;
  }

  onRemoveAdditionalOwnerRequested(formId: number): void {
    this.additionalOwnerFormIds = this.additionalOwnerFormIds.filter(id => id !== formId);
    const contactId = this.additionalOwnerContactIdsByFormId[formId];
    delete this.additionalOwnerContactIdsByFormId[formId];
    if (!contactId) {
      return;
    }
    this.contactService.deleteContact(contactId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  onSaveRequested(): void {
    this.ownerForm.markAllAsTouched();
    if (this.ownerForm.invalid || this.isSaving) {
      return;
    }
    if (this.token) {
      this.saveOwnerFormByToken();
      return;
    }
    this.saveLeadOwnerForm();
  }

  get resolvedOwnerLeadId(): number | null {
    return this.ownerLeadId ?? this.publicOwnerFormSnapshot?.ownerId ?? null;
  }

  get defaultOwnerOfficePrefill(): Record<string, unknown> | null {
    const officeId = Number(this.selectedOfficeId);
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return null;
    }
    return { officeId };
  }
  //#endregion

  //#region Load Data Methods
  ensureLoadStateSubscription(): void {
    if (this.hasLoadStateSubscription) {
      return;
    }
    this.hasLoadStateSubscription = true;
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
  }

  loadOwnerContext(): void {
    this.primaryOwnerContactId = null;
    this.primaryOwnerPrefill = null;
    this.additionalOwnerFormIds = [];
    this.additionalOwnerContactIdsByFormId = {};
    this.nextAdditionalOwnerFormId = 1;
    this.publicOwnerFormSnapshot = null;
    this.leadOwnerSnapshot = null;
    this.ownerForm.reset(this.getDefaultOwnerFormValue());
    this.primaryOwnerPrefill = this.defaultOwnerOfficePrefill;

    if (this.token) {
      this.loadOwnerFormByToken();
      return;
    }
    if (Number.isFinite(this.ownerLeadId) && Number(this.ownerLeadId) > 0) {
      this.loadOwnerLeadPrefill(Number(this.ownerLeadId));
      return;
    }
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-context');
  }

  loadOwnerFormByToken(): void {
    if (!this.token) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-context');
      return;
    }
    this.leadsService.getPublicOwnerFormByToken(this.token).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-context');
    })).subscribe({
      next: (response) => {
        this.publicOwnerFormSnapshot = response;
        this.applyOwnerFormResponse(response);
        const ownerId = Number(response.ownerId);
        if (Number.isFinite(ownerId) && ownerId > 0) {
          this.utilityService.addLoadItem(this.itemsToLoad$, 'owner-contact');
          this.loadPrimaryOwnerContactForLead(ownerId);
        }
      },
      error: () => {
        this.toastr.error('Owner form was not found, expired, or unavailable.', CommonMessage.Error);
      }
    });
  }

  loadOwnerLeadPrefill(ownerId: number): void {
    this.leadsService.getOwnerLeadById(ownerId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-context');
    })).subscribe({
      next: (ownerLead) => {
        this.leadOwnerSnapshot = ownerLead;
        this.applyLeadOwnerPrefill(ownerLead);
        this.utilityService.addLoadItem(this.itemsToLoad$, 'owner-contact');
        this.loadPrimaryOwnerContactForLead(ownerLead.ownerId);
      },
      error: () => {
        this.toastr.error('Owner lead could not be loaded for prefill.', CommonMessage.Error);
      }
    });
  }

  loadPrimaryOwnerContactForLead(ownerLeadId: number): void {
    this.contactService.getContacts().pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-contact');
    })).subscribe({
      next: (contacts) => {
        const ownerContacts = (contacts || []).filter(contact => Number(contact.entityTypeId) === Number(EntityType.Owner));
        const matchedContact = ownerContacts.find(contact => Number(contact.ownerLeadId) === Number(ownerLeadId));
        this.primaryOwnerContactId = matchedContact?.contactId ?? null;
      },
      error: () => {
        this.primaryOwnerContactId = null;
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group(this.getDefaultOwnerFormValue());
  }

  getDefaultOwnerFormValue(): Record<string, unknown> {
    return {
      adjustedGrossRentTarget: '',
      onlineFeeRentReady: '150',
      onlineCleanHourlyFee: '35',
      workingBalanceEscrow: '500',
      annualLinenTierStudio1Bedroom: false,
      annualLinenTier2Bedroom: false,
      annualLinenTier3Bedroom: false,
      annualLinenCustomAmount: '',
      furnishingKitchenItemsRequested: false,
      furnishingKitchenItemsAmount: '',
      furnishingFullUnitRequested: false,
      furnishingFullUnitEstimateAmount: '',
      furnishingFeeAmount: '',
      offlineFee: '150',
      propertyGoals: '',
      tellUsMoreAboutYourGoals: '',
      tellUsMoreAboutProperty: '',
      tellUsWhatYouLikeMostAboutYourProperty: '',
      tellUsAnyDrawbacks: '',
      preferredContactMethod: '',
      timeDateForContact: '',
      emailPhoneConsent: false,
      smsConsent: false
    };
  }

  applyOwnerFormResponse(response: PublicOwnerFormResponse): void {
    this.primaryOwnerPrefill = {
      firstName: response.form?.firstName ?? '',
      lastName: response.form?.lastName ?? '',
      email: response.form?.email ?? '',
      phone: response.form?.phone ?? '',
      address: response.form?.address ?? '',
      city: response.form?.city ?? '',
      state: response.form?.state ?? '',
      zip: response.form?.zip ?? '',
      officeId: this.selectedOfficeId ?? null
    };
    this.ownerForm.patchValue({
      adjustedGrossRentTarget: response.form?.adjustedGrossRentTarget ?? '',
      onlineFeeRentReady: response.form?.onlineFeeRentReady ?? '',
      onlineCleanHourlyFee: response.form?.onlineCleanHourlyFee ?? '',
      workingBalanceEscrow: response.form?.workingBalanceEscrow ?? '',
      annualLinenCustomAmount: response.form?.annualLinenCustomAmount ?? '',
      furnishingFeeAmount: response.form?.furnishingFeeAmount ?? '',
      offlineFee: response.form?.offlineFee ?? '',
      furnishingKitchenItemsRequested: !!response.form?.furnishingKitchenItemsRequested,
      furnishingKitchenItemsAmount: response.form?.furnishingKitchenItemsAmount ?? '',
      furnishingFullUnitRequested: !!response.form?.furnishingFullUnitRequested,
      furnishingFullUnitEstimateAmount: response.form?.furnishingFullUnitEstimateAmount ?? '',
      annualLinenTierStudio1Bedroom: !!response.form?.annualLinenTierStudio1Bedroom,
      annualLinenTier2Bedroom: !!response.form?.annualLinenTier2Bedroom,
      annualLinenTier3Bedroom: !!response.form?.annualLinenTier3Bedroom,
      propertyGoals: response.form?.propertyGoals ?? '',
      tellUsMoreAboutYourGoals: response.form?.tellUsMoreAboutYourGoals ?? '',
      tellUsMoreAboutProperty: response.form?.tellUsMoreAboutProperty ?? '',
      tellUsWhatYouLikeMostAboutYourProperty: response.form?.tellUsWhatYouLikeMostAboutYourProperty ?? '',
      tellUsAnyDrawbacks: response.form?.tellUsAnyDrawbacks ?? '',
      preferredContactMethod: response.form?.preferredContactMethod ?? '',
      timeDateForContact: response.form?.timeDateForContact ?? '',
      emailPhoneConsent: !!response.form?.emailPhoneConsent,
      smsConsent: !!response.form?.smsConsent
    });
    this.formatOwnerCurrencyFieldsForDisplay();
  }

  applyLeadOwnerPrefill(lead: LeadOwnerResponse): void {
    this.primaryOwnerPrefill = {
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      address: lead.address ?? '',
      city: lead.city ?? '',
      state: lead.state ?? '',
      zip: lead.zip ?? '',
      officeId: lead.officeId ?? null
    };
    this.ownerForm.patchValue({
      adjustedGrossRentTarget: lead.adjustedGrossRentTarget ?? '',
      onlineFeeRentReady: lead.onlineFee ?? '',
      onlineCleanHourlyFee: lead.onlineClean ?? '',
      workingBalanceEscrow: lead.workingBalance ?? '',
      annualLinenCustomAmount: lead.annualLinenAmount ?? '',
      offlineFee: lead.offlineFee ?? '',
      furnishingKitchenItemsRequested: !!lead.purchaseKitchenItems,
      furnishingKitchenItemsAmount: lead.kitchenBudget ?? '',
      furnishingFullUnitRequested: !!lead.furnishUnit,
      furnishingFullUnitEstimateAmount: lead.furnishBudget ?? '',
      annualLinenTierStudio1Bedroom: !!lead.oneBedroom,
      annualLinenTier2Bedroom: !!lead.twoBedroom,
      annualLinenTier3Bedroom: !!lead.threeBedroom,
      propertyGoals: lead.propertyGoals ?? '',
      tellUsMoreAboutYourGoals: lead.tellUsMoreAboutYourGoals ?? '',
      tellUsMoreAboutProperty: lead.tellUsMoreAboutProperty ?? '',
      tellUsWhatYouLikeMostAboutYourProperty: lead.tellUsWhatYouLikeMostAboutYourProperty ?? '',
      tellUsAnyDrawbacks: lead.tellUsAnyDrawbacks ?? '',
      preferredContactMethod: lead.preferredContactMethod ?? '',
      timeDateForContact: lead.timeDateForContact ?? '',
      emailPhoneConsent: !!lead.emailPhoneConsent,
      smsConsent: !!lead.smsConsent
    });
    this.formatOwnerCurrencyFieldsForDisplay();
  }

  saveOwnerFormByToken(): void {
    if (!this.token || !this.publicOwnerFormSnapshot) {
      return;
    }
    const raw = this.ownerForm.getRawValue() as Partial<PublicOwnerFormSubmitRequest>;
    const body: PublicOwnerFormSubmitRequest = this.normalizeOwnerCurrencyValuesForSubmit({
      ...this.publicOwnerFormSnapshot.form,
      ...raw
    } as PublicOwnerFormSubmitRequest);
    this.isSaving = true;
    this.leadsService.submitPublicOwnerFormByToken(this.token, body).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (response) => {
        this.publicOwnerFormSnapshot = response;
        this.applyOwnerFormResponse(response);
        this.toastr.success('Owner information saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save owner information.', CommonMessage.Error);
      }
    });
  }

  saveLeadOwnerForm(): void {
    if (!this.ownerLeadId || !this.leadOwnerSnapshot) {
      return;
    }
    const v = this.ownerForm.getRawValue() as PublicOwnerFormSubmitRequest;
    const body: LeadOwnerUpdateRequest = {
      ownerId: this.ownerLeadId,
      officeId: this.selectedOfficeId ?? this.leadOwnerSnapshot.officeId,
      leadStateId: this.leadOwnerSnapshot.leadStateId,
      agentId: this.leadOwnerSnapshot.agentId ?? null,
      firstName: this.leadOwnerSnapshot.firstName ?? null,
      lastName: this.leadOwnerSnapshot.lastName ?? null,
      email: this.leadOwnerSnapshot.email ?? null,
      phone: this.leadOwnerSnapshot.phone ?? null,
      locationOfProperty: this.leadOwnerSnapshot.locationOfProperty ?? null,
      programInterest: this.leadOwnerSnapshot.programInterest ?? null,
      whatIsPromptingContact: this.leadOwnerSnapshot.whatIsPromptingContact ?? null,
      timeFrame: this.leadOwnerSnapshot.timeFrame ?? null,
      targetRentReadyDate: this.leadOwnerSnapshot.targetRentReadyDate ?? null,
      propertyGoals: v.propertyGoals ?? null,
      tellUsMoreAboutYourGoals: v.tellUsMoreAboutYourGoals ?? null,
      yearsOfExperienceWithRentals: this.leadOwnerSnapshot.yearsOfExperienceWithRentals ?? null,
      tellUsMoreAboutProperty: v.tellUsMoreAboutProperty ?? null,
      address: this.leadOwnerSnapshot.address ?? null,
      city: this.leadOwnerSnapshot.city ?? null,
      state: this.leadOwnerSnapshot.state ?? null,
      zip: this.leadOwnerSnapshot.zip ?? null,
      adjustedGrossRentTarget: this.parseNullableDecimal(v.adjustedGrossRentTarget),
      onlineFee: this.parseNullableDecimal(v.onlineFeeRentReady),
      onlineClean: this.parseNullableDecimal(v.onlineCleanHourlyFee),
      workingBalance: this.parseNullableDecimal(v.workingBalanceEscrow),
      annualLinenAmount: this.parseNullableDecimal(v.annualLinenCustomAmount),
      offlineFee: this.parseNullableDecimal(v.offlineFee),
      purchaseKitchenItems: !!v.furnishingKitchenItemsRequested,
      kitchenBudget: this.parseNullableDecimal(v.furnishingKitchenItemsAmount),
      furnishUnit: !!v.furnishingFullUnitRequested,
      furnishBudget: this.parseNullableDecimal(v.furnishingFullUnitEstimateAmount),
      oneBedroom: !!v.annualLinenTierStudio1Bedroom,
      twoBedroom: !!v.annualLinenTier2Bedroom,
      threeBedroom: !!v.annualLinenTier3Bedroom,
      numberOfBeds: this.leadOwnerSnapshot.numberOfBeds ?? null,
      numberOfBaths: this.leadOwnerSnapshot.numberOfBaths ?? null,
      approxSqFootage: this.leadOwnerSnapshot.approxSqFootage ?? null,
      typeOfProperty: this.leadOwnerSnapshot.typeOfProperty ?? null,
      tellUsWhatYouLikeMostAboutYourProperty: v.tellUsWhatYouLikeMostAboutYourProperty ?? null,
      tellUsAnyDrawbacks: v.tellUsAnyDrawbacks ?? null,
      preferredContactMethod: v.preferredContactMethod ?? null,
      timeDateForContact: v.timeDateForContact ?? null,
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: this.leadOwnerSnapshot.isActive
    };
    this.isSaving = true;
    this.leadsService.updateOwnerLead(body).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (updated) => {
        this.leadOwnerSnapshot = updated;
        this.applyLeadOwnerPrefill(updated);
        this.toastr.success('Owner information saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save owner information.', CommonMessage.Error);
      }
    });
  }

  onCurrencyInput(event: Event, controlName: string): void {
    this.formatterService.formatCurrencyInput(event, this.ownerForm.get(controlName));
  }

  onCurrencyFocus(event: FocusEvent, controlName: string): void {
    this.formatterService.clearCurrencyOnFocus(event, this.ownerForm.get(controlName));
  }

  onCurrencyEnter(event: Event, controlName: string): void {
    this.formatterService.formatCurrencyOnEnter(event as KeyboardEvent, this.ownerForm.get(controlName), null);
  }

  onCurrencyBlur(controlName: string): void {
    this.formatterService.formatCurrencyOnBlur(this.ownerForm.get(controlName), null);
  }

  onCurrencyKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (['Backspace', 'Tab', 'End', 'Home', 'ArrowLeft', 'ArrowRight', 'Delete', 'Enter'].includes(key)) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (['a', 'c', 'v', 'x'].includes(key.toLowerCase())) {
        return;
      }
    }
    if (key === '.') {
      const el = event.target as HTMLInputElement;
      if (el?.value?.includes('.')) {
        event.preventDefault();
      }
      return;
    }
    if (!/^\d$/.test(key)) {
      event.preventDefault();
    }
  }

  formatOwnerCurrencyFieldsForDisplay(): void {
    for (const controlName of OWNER_INFORMATION_CURRENCY_CONTROL_NAMES) {
      const control = this.ownerForm.get(controlName);
      const raw = String(control?.value ?? '').trim();
      if (!raw) {
        continue;
      }
      this.formatterService.formatCurrencyOnBlur(control, null);
    }
  }

  normalizeOwnerCurrencyValuesForSubmit(body: PublicOwnerFormSubmitRequest): PublicOwnerFormSubmitRequest {
    const normalized = { ...body };
    for (const controlName of OWNER_INFORMATION_CURRENCY_CONTROL_NAMES) {
      const value = String((normalized as Record<string, unknown>)[controlName] ?? '').trim();
      if (!value) {
        continue;
      }
      (normalized as Record<string, unknown>)[controlName] = value.replace(/[$,\s]/g, '');
    }
    return normalized;
  }
  //#endregion

  //#region Utility Methods
  parseNullableDecimal(value: unknown): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }
    const normalized = raw.replace(/[$,\s]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
