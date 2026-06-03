import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { FormatterService } from '../../../services/formatter-service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { LeadOwnerResponse, LeadOwnerUpdateRequest } from '../../leads/models/lead-owner.model';
import { PublicOwnerFormResponse, PublicOwnerFormSubmitRequest } from '../../leads/models/owner-form-share.model';
import { CommonMessage } from '../../../enums/common-message.enum';
import { OWNER_INFORMATION_CURRENCY_CONTROL_NAMES } from '../models/owner-information.model';
import { UtilityService } from '../../../services/utility.service';
import { OwnersService } from '../services/owners.service';

@Component({
  standalone: true,
  selector: 'app-owner-information',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, ContactComponent],
  templateUrl: './owner-information.component.html',
  styleUrl: '../owner-shell/owner-shell.component.scss'
})
export class OwnerInformationComponent implements OnInit, OnChanges, OnDestroy {
  @Input() token = '';
  @Input() ownerEntityTypeId!: number;
  @Input() ownerLeadId: number | null = null;
  @Input() ownerContactId: string | null = null;
  @Input() selectedOfficeId: number | null = null;

  ownerForm: FormGroup = this.buildForm();
  isSaving = false;
  primaryOwnerContactId: string | null = null;
  primaryOwnerPrefill: Record<string, unknown> | null = null;
  additionalOwnerFormIds: number[] = [];
  nextAdditionalOwnerFormId = 1;
  additionalOwnerContactIdsByFormId: Record<number, string> = {};
  publicOwnerFormSnapshot: PublicOwnerFormResponse | null = null;
  leadOwnerSnapshot: LeadOwnerResponse | null = null;
  publicOwnerContactCode: string | null = null;
  contacts: ContactResponse[] = [];
  currentContact: ContactResponse | null = null;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['owner-form', 'owner-lead']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private contactService: ContactService,
    private ownersService: OwnersService,
    private toastr: ToastrService,
    private utilityService: UtilityService
  ) {}

  //#region Owner-Information
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isPageReady = this.itemsToLoad$.value.size === 0;
    });
    this.resetOwnerInformationState();
    this.loadOwnerForm();
    this.loadOwnerLead();
    this.loadContacts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ownerContactId'] && !changes['ownerContactId'].firstChange) {
      this.syncCurrentContactFromList();
    }
    if (changes['selectedOfficeId'] && !changes['selectedOfficeId'].firstChange) {
      const officeId = Number(this.selectedOfficeId);
      const resolvedOfficeId = Number.isFinite(officeId) && officeId > 0 ? officeId : null;
      if (this.primaryOwnerPrefill) {
        this.primaryOwnerPrefill = {
          ...this.primaryOwnerPrefill,
          officeId: resolvedOfficeId
        };
      } else if (resolvedOfficeId != null) {
        this.primaryOwnerPrefill = { officeId: resolvedOfficeId };
      }
    }
  }

  resetOwnerInformationState(): void {
    this.primaryOwnerContactId = null;
    this.primaryOwnerPrefill = null;
    this.additionalOwnerFormIds = [];
    this.additionalOwnerContactIdsByFormId = {};
    this.nextAdditionalOwnerFormId = 1;
    this.publicOwnerFormSnapshot = null;
    this.leadOwnerSnapshot = null;
    this.publicOwnerContactCode = null;
    this.contacts = [];
    this.currentContact = null;
    this.ownerForm.reset(this.getDefaultOwnerFormValue());
    this.primaryOwnerPrefill = this.defaultOwnerOfficePrefill;
  }
  //#endregion

  //#region Load Data Methods
  loadOwnerForm(): void {
    this.ownersService.getOwnerFormByContext(this.token).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-form'); })).subscribe({
      next: (response) => {
        if (!response) {
          return;
        }
        this.publicOwnerFormSnapshot = response;
        this.applyOwnerFormResponse(response);
      },
      error: () => {}
    });
  }

  loadOwnerLead(): void {
    this.ownersService.getOwnerByContext(this.token, this.ownerLeadId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-lead'); })).subscribe({
      next: (ownerLead) => {
        if (!ownerLead) {
          return;
        }
        this.leadOwnerSnapshot = ownerLead;
        this.applyOwnerLeadPrefill(ownerLead);
      },
      error: () => {
        this.toastr.error('Owner lead could not be loaded for prefill.', CommonMessage.Error);
      }
    });
  }

  loadContacts(): void {
    if (String(this.token || '').trim()) {
      this.ownersService.getOwnerContactByContext(this.token, this.ownerLeadId).pipe(take(1)).subscribe({
        next: (contact) => {
          if (!contact) {
            return;
          }
          this.applyResolvedOwnerContact(contact);
        },
        error: () => {}
      });
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.contacts = contacts || [];
          this.syncCurrentContactFromList();
        });
      },
      error: () => {
        this.contacts = [];
        this.syncCurrentContactFromList();
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
      address: '',
      city: '',
      state: '',
      zip: '',
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

  applyOwnerLeadPrefill(lead: LeadOwnerResponse): void {
    this.primaryOwnerPrefill = {
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      address: '',
      city: '',
      state: '',
      zip: '',
      officeId: Number(lead.officeId) > 0 ? Number(lead.officeId) : (this.selectedOfficeId ?? null)
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

  applyLeadOwnerContactPrefill(contact: ContactResponse): void {
    this.primaryOwnerPrefill = {
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      address: contact.address1 ?? '',
      city: contact.city ?? '',
      state: contact.state ?? '',
      zip: contact.zip ?? '',
      officeId: Number(contact.officeId) > 0 ? Number(contact.officeId) : (this.selectedOfficeId ?? null),
      contactCode: String(contact.contactCode || '').trim() || null
    };
  }

  applyPublicOwnerContactPrefill(contact: ContactResponse): void {
    this.publicOwnerContactCode = String(contact.contactCode || '').trim() || null;
    this.primaryOwnerPrefill = {
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      address: contact.address1 ?? '',
      city: contact.city ?? '',
      state: contact.state ?? '',
      zip: contact.zip ?? '',
      officeId: Number(contact.officeId) > 0 ? Number(contact.officeId) : (this.selectedOfficeId ?? null),
      contactCode: this.publicOwnerContactCode
    };
  }

  syncCurrentContactFromList(): void {
    const contactId = String(this.ownerContactId || '').trim();
    if (contactId) {
      const contact = this.contacts.find(c => String(c.contactId || '').trim() === contactId) || null;
      this.applyResolvedOwnerContact(contact, contactId);
      return;
    }

    const ownerLeadId = Number(this.ownerLeadId);
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      return;
    }

    const contact = this.contacts.find(c =>
      Number(c.entityTypeId) === Number(EntityType.Owner) &&
      Number(c.ownerLeadId) === ownerLeadId
    ) || null;
    this.applyResolvedOwnerContact(contact);
  }

  applyResolvedOwnerContact(contact: ContactResponse | null, contactId?: string | null): void {
    const resolvedContactId = String(contact?.contactId || contactId || '').trim() || null;
    this.primaryOwnerContactId = resolvedContactId;
    this.currentContact = contact;
    if (!contact) {
      return;
    }
    if (String(this.token || '').trim()) {
      this.applyPublicOwnerContactPrefill(contact);
      return;
    }
    this.applyLeadOwnerContactPrefill(contact);
  }
  //#endregion

  //#region Save Methods
  onPrimaryOwnerSaved(event: { saved?: boolean; contactId?: string; entityTypeId?: number }): void {
    if (!event?.saved) {
      return;
    }
    const contactId = String(event.contactId || '').trim();
    if (contactId) {
      this.primaryOwnerContactId = contactId;
      this.syncCurrentContactFromList();
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
    this.ownersService.deleteOwnerContactByContext(contactId).pipe(take(1)).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  onSaveRequested(): void {
    this.ownerForm.markAllAsTouched();
    if (this.ownerForm.invalid || this.isSaving) {
      return;
    }
    if (String(this.token || '').trim()) {
      this.saveOwnerFormByToken();
      return;
    }
    this.saveLeadOwnerForm();
  }

  saveOwnerFormByToken(): void {
    if (!String(this.token || '').trim() || !this.publicOwnerFormSnapshot) {
      return;
    }
    const raw = this.ownerForm.getRawValue() as Partial<PublicOwnerFormSubmitRequest>;
    const body: PublicOwnerFormSubmitRequest = this.normalizeOwnerCurrencyValuesForSubmit({
      ...this.publicOwnerFormSnapshot.form,
      ...raw
    } as PublicOwnerFormSubmitRequest);
    this.isSaving = true;
    this.ownersService.submitOwnerFormByContext(this.token, body).pipe(take(1), finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (response) => {
        if (!response) {
          this.toastr.error('Unable to save owner information.', CommonMessage.Error);
          return;
        }
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
      propertyTypeId: this.leadOwnerSnapshot.propertyTypeId ?? null,
      propertyCode: this.leadOwnerSnapshot.propertyCode ?? null,
      propertyOffice: this.leadOwnerSnapshot.propertyOffice ?? null,
      tellUsWhatYouLikeMostAboutYourProperty: v.tellUsWhatYouLikeMostAboutYourProperty ?? null,
      tellUsAnyDrawbacks: v.tellUsAnyDrawbacks ?? null,
      preferredContactMethod: v.preferredContactMethod ?? null,
      timeDateForContact: v.timeDateForContact ?? null,
      notes: this.leadOwnerSnapshot.notes ?? null,
      emailPhoneConsent: !!v.emailPhoneConsent,
      smsConsent: !!v.smsConsent,
      isActive: this.leadOwnerSnapshot.isActive
    };
    this.isSaving = true;
    this.ownersService.updateOwnerByContext(body).pipe(take(1), finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (updated) => {
        if (!updated) {
          this.toastr.error('Unable to save owner information.', CommonMessage.Error);
          return;
        }
        this.leadOwnerSnapshot = updated;
        this.applyOwnerLeadPrefill(updated);
        this.toastr.success('Owner information saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save owner information.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Response Methods
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

  parseNullableDecimal(value: unknown): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }
    const normalized = raw.replace(/[$,\s]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
