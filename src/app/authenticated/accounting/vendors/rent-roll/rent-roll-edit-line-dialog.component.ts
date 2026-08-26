import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { take } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { ContactService } from '../../../contacts/services/contact.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { EntityType, TermType, getTermType } from '../../../contacts/models/contact-enum';
import { AuthService } from '../../../../services/auth.service';
import { UtilityService } from '../../../../services/utility.service';
import { OfficeService } from '../../../organizations/services/office.service';
import { PropertyService } from '../../../properties/services/property.service';
import { PropertyCodeResponse } from '../../../properties/models/property.model';
import { NewContactDialogService } from '../../../shared/contacts/new-contact-dialog.service';
import { RECEIPT_COMPANY_PROPERTY_ID, isReceiptCompanyPropertyId } from '../../../maintenance/models/receipt.model';

export interface RentRollEditLineDialogData {
  propertyId?: string | null;
  propertyCode: string;
  allowPropertySelection?: boolean;
  officeId: number | null;
  vendorId: string | null;
  vendorName: string;
  terms: string;
  chartOfAccountId: number | null;
  startDate: string | null;
  endDate: string | null;
  depositAmount: number;
  oneTimeAmount: number;
  monthlyAmount: number;
  dailyAmount: number;
  isRent: boolean;
  notes: string;
}

export interface RentRollEditLineDialogResult {
  officeId: number | null;
  propertyId: string | null;
  vendorId: string | null;
  vendorName: string;
  terms: string;
  chartOfAccountId: number | null;
  startDate: string | null;
  endDate: string | null;
  deposit: number | null;
  oneTime: number | null;
  monthly: number | null;
  daily: number | null;
  isRent: boolean;
  notes: string | null;
}

@Component({
  standalone: true,
  selector: 'app-rent-roll-edit-line-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './rent-roll-edit-line-dialog.component.html',
  styleUrl: './rent-roll-edit-line-dialog.component.scss'
})
export class RentRollEditLineDialogComponent {
  data = inject<RentRollEditLineDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<RentRollEditLineDialogComponent, RentRollEditLineDialogResult | undefined>>(MatDialogRef);
  private fb = inject(FormBuilder);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private contactService = inject(ContactService);
  private utilityService = inject(UtilityService);
  private propertyService = inject(PropertyService);
  private officeService = inject(OfficeService);
  private authService = inject(AuthService);
  private newContactDialogService = inject(NewContactDialogService);

  form: FormGroup;
  officeOptions: SearchableSelectOption<number>[] = [];
  vendorOptions: SearchableSelectOption<string>[] = [];
  propertyOptions: SearchableSelectOption<string>[] = [];
  chartOfAccountOptions: SearchableSelectOption<number>[] = [];
  readonly defaultTerms = getTermType(TermType.DueOnReceipt) || 'Due on receipt';
  private vendorById = new Map<string, ContactResponse>();
  private propertyOfficeById = new Map<string, number>();
  private allPropertyCodes: PropertyCodeResponse[] = [];

  constructor() {
    const data = this.data;

    this.form = this.fb.group({
      officeId: [this.parseNullablePositiveInteger(data.officeId), Validators.required],
      propertyId: [this.normalizeOptionalText(data.propertyId)],
      vendorId: [(data.vendorId || '').trim()],
      vendorName: [data.vendorName || ''],
      terms: [{ value: data.terms || this.defaultTerms, disabled: true }],
      chartOfAccountId: [data.chartOfAccountId ?? null],
      startDate: [this.toDateControlValue(data.startDate)],
      endDate: [this.toDateControlValue(data.endDate)],
      deposit: [this.formatCurrencyInput(data.depositAmount)],
      oneTime: [this.formatCurrencyInput(data.oneTimeAmount)],
      monthly: [this.formatCurrencyInput(data.monthlyAmount)],
      daily: [this.formatCurrencyInput(data.dailyAmount)],
      isRent: [!!data.isRent],
      notes: [(data.notes || '').trim()]
    });
    if (data.allowPropertySelection) {
      this.form.get('propertyId')?.setValidators([Validators.required]);
      this.form.get('propertyId')?.updateValueAndValidity({ emitEvent: false });
    }
    this.loadOfficeOptions();
    this.loadPropertyOptions();
    this.loadVendorOptions();
    this.loadChartOfAccountOptions();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.dialogRef.close({
      officeId: this.parseNullablePositiveInteger(value.officeId),
      propertyId: this.normalizeOptionalText(value.propertyId),
      vendorId: this.normalizeOptionalText(value.vendorId),
      vendorName: (value.vendorName || '').toString().trim(),
      terms: (this.form.get('terms')?.value || '').toString().trim(),
      chartOfAccountId: this.parseNullablePositiveInteger(value.chartOfAccountId),
      startDate: this.toDateOnlyString(value.startDate),
      endDate: this.toDateOnlyString(value.endDate),
      deposit: this.parseNullableNumber(value.deposit),
      oneTime: this.parseNullableNumber(value.oneTime),
      monthly: this.parseNullableNumber(value.monthly),
      daily: this.parseNullableNumber(value.daily),
      isRent: !!value.isRent,
      notes: this.normalizeOptionalText(value.notes)
    });
  }

  toDateControlValue(value: string | null | undefined): Date | null {
    return this.utilityService.parseCalendarDateInput(value ?? null);
  }

  toDateOnlyString(value: unknown): string | null {
    return this.utilityService.toDateOnlyJsonString(value);
  }

  parseNullableNumber(value: unknown): number | null {
    const raw = (value || '').toString().trim();
    if (!raw) {
      return null;
    }
    const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  parseNullablePositiveInteger(value: unknown): number | null {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.trunc(parsed);
  }

  normalizeOptionalText(value: unknown): string | null {
    const raw = (value || '').toString().trim();
    return raw.length > 0 ? raw : null;
  }

  formatCurrencyInput(value: number | null | undefined): string {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) {
      return '$0.00';
    }
    return `$${parsed.toFixed(2)}`;
  }

  onCurrencyBlur(controlName: 'deposit' | 'oneTime' | 'monthly' | 'daily'): void {
    const control = this.form.get(controlName);
    if (!control) {
      return;
    }
    const parsed = this.parseNullableNumber(control.value);
    control.setValue(this.formatCurrencyInput(parsed ?? 0), { emitEvent: false });
  }

  onVendorChange(value: string | number | null): void {
    const vendorId = this.normalizeOptionalText(value);
    if (this.newContactDialogService.isNewContactOptionValue(vendorId, EntityType.Vendor)) {
      this.form.patchValue({
        vendorId: null,
        vendorName: ''
      }, { emitEvent: false });
      this.form.get('terms')?.setValue(this.defaultTerms, { emitEvent: false });
      this.openNewVendorDialog();
      return;
    }
    const vendor = vendorId ? (this.vendorById.get(vendorId) || null) : null;
    const vendorName = vendor ? this.utilityService.getVendorDropdownLabel(vendor) : '';
    const terms = vendor ? (getTermType(vendor.paymentTermsId) || this.defaultTerms) : this.defaultTerms;
    this.form.patchValue({
      vendorId,
      vendorName
    }, { emitEvent: false });
    this.form.get('terms')?.setValue(terms, { emitEvent: false });
  }

  onPropertyChange(value: string | number | null): void {
    const propertyId = this.normalizeOptionalText(value);
    this.form.patchValue({
      propertyId
    }, { emitEvent: false });
    this.applyOfficeFromSelectedProperty();
  }

  onOfficeChange(value: string | number | null): void {
    const officeId = this.parseNullablePositiveInteger(value);
    const previousOfficeId = this.parseNullablePositiveInteger(this.form.get('officeId')?.value);
    this.form.patchValue({ officeId }, { emitEvent: false });
    if (officeId !== previousOfficeId) {
      const selectedPropertyId = this.normalizeOptionalText(this.form.get('propertyId')?.value);
      const propertyMatchesOffice = !!selectedPropertyId
        && (isReceiptCompanyPropertyId(selectedPropertyId)
          || this.propertyOfficeById.get(selectedPropertyId) === officeId);
      this.form.patchValue({
        propertyId: this.data.allowPropertySelection && !propertyMatchesOffice
          ? null
          : this.form.get('propertyId')?.value,
        vendorId: null,
        vendorName: '',
        chartOfAccountId: null
      }, { emitEvent: false });
      this.form.get('terms')?.setValue(this.defaultTerms, { emitEvent: false });
    }
    this.applyPropertyOptions();
    this.loadVendorOptions();
    this.loadChartOfAccountOptions();
  }

  applyOfficeFromSelectedProperty(): void {
    const propertyId = this.normalizeOptionalText(this.form.get('propertyId')?.value);
    if (!propertyId || isReceiptCompanyPropertyId(propertyId)) {
      return;
    }

    const propertyOfficeId = this.propertyOfficeById.get(propertyId) ?? null;
    if (!propertyOfficeId) {
      return;
    }

    const currentOfficeId = this.parseNullablePositiveInteger(this.form.get('officeId')?.value);
    if (currentOfficeId === propertyOfficeId) {
      return;
    }

    this.form.patchValue({ officeId: propertyOfficeId }, { emitEvent: false });
    this.applyPropertyOptions();
    this.loadVendorOptions();
    this.loadChartOfAccountOptions();
  }

  selectedOfficeId(): number {
    return this.parseNullablePositiveInteger(this.form.get('officeId')?.value) ?? 0;
  }

  loadOfficeOptions(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    if (!organizationId) {
      this.officeOptions = [];
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe({
          next: offices => {
            this.officeOptions = (offices || [])
              .filter(office => office.organizationId === organizationId && office.isActive)
              .map(office => ({
                value: office.officeId,
                label: office.name
              }))
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
          },
          error: () => {
            this.officeOptions = [];
          }
        });
      },
      error: () => {
        this.officeOptions = [];
      }
    });
  }

  loadPropertyOptions(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(take(1)).subscribe({
          next: (properties: PropertyCodeResponse[]) => {
            this.allPropertyCodes = properties || [];
            this.propertyOfficeById = new Map<string, number>();
            for (const property of this.allPropertyCodes) {
              const propertyId = (property.propertyId || '').trim();
              const officeId = Number(property.officeId || 0);
              if (propertyId && Number.isFinite(officeId) && officeId > 0) {
                this.propertyOfficeById.set(propertyId, officeId);
              }
            }
            this.applyOfficeFromSelectedProperty();
            this.applyPropertyOptions();
          },
          error: () => {
            this.allPropertyCodes = [];
            this.propertyOfficeById = new Map<string, number>();
            this.propertyOptions = [];
          }
        });
      }
    });
  }

  applyPropertyOptions(): void {
    const officeId = this.selectedOfficeId();
    const scopedProperties = this.allPropertyCodes
      .filter(property => !officeId || Number(property.officeId) === officeId);
    this.propertyOptions = [
      { value: RECEIPT_COMPANY_PROPERTY_ID, label: 'Company' },
      ...scopedProperties
        .map(property => ({
          value: (property.propertyId || '').trim(),
          label: (property.propertyCode || '').trim() || (property.shortAddress || '').trim() || 'Property'
        }))
        .filter(option => !!option.value)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    ];

    const selectedPropertyId = this.normalizeOptionalText(this.form.get('propertyId')?.value);
    if (selectedPropertyId && !this.propertyOptions.some(option => option.value === selectedPropertyId)) {
      if (!isReceiptCompanyPropertyId(selectedPropertyId)) {
        this.form.patchValue({ propertyId: null }, { emitEvent: false });
      }
    }
  }

  loadVendorOptions(preferredVendorId?: string | null): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        const officeId = this.selectedOfficeId();
        const vendors = (this.contactService.getAllContactsValue() || [])
          .filter(contact => contact.entityTypeId === EntityType.Vendor)
          .filter(contact => !!officeId && this.utilityService.contactHasOfficeAccess(contact, officeId));
        this.vendorById = new Map<string, ContactResponse>();
        const vendorOptions = vendors
          .map(contact => {
            const vendorId = String(contact.contactId || '').trim();
            if (!vendorId) {
              return null;
            }
            this.vendorById.set(vendorId, contact);
            return {
              value: vendorId,
              label: this.utilityService.getVendorDropdownLabel(contact)
            } as SearchableSelectOption<string>;
          })
          .filter((option): option is SearchableSelectOption<string> => !!option)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        const newVendorOption = this.newContactDialogService.buildSearchableSelectOption(EntityType.Vendor);
        this.vendorOptions = [newVendorOption, ...vendorOptions];
        const normalizedPreferredVendorId = this.normalizeOptionalText(preferredVendorId);
        if (normalizedPreferredVendorId && this.vendorById.has(normalizedPreferredVendorId)) {
          this.onVendorChange(normalizedPreferredVendorId);
        }
      }
    });
  }

  openNewVendorDialog(): void {
    this.newContactDialogService.openNewContactDialog({
      entityTypeId: EntityType.Vendor,
      preselectPropertyOfficeId: this.selectedOfficeId() || null
    }).pipe(take(1)).subscribe(result => {
      const contactId = String(result?.contactId || '').trim();
      if (!result?.saved || !contactId) {
        return;
      }
      this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
        next: () => {
          this.loadVendorOptions(contactId);
        }
      });
    });
  }

  loadChartOfAccountOptions(): void {
    const officeId = this.selectedOfficeId();
    if (!officeId) {
      this.chartOfAccountOptions = [];
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(take(1)).subscribe(accounts => {
        this.chartOfAccountOptions = (accounts || [])
          .filter(account => account.officeId === officeId)
          .map(account => ({
            value: account.accountId,
            label: this.utilityService.getChartOfAccountDropdownLabel(account)
          }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      });
    });
  }
}
