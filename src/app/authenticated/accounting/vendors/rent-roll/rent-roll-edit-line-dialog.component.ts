import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { take } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { ContactService } from '../../../contacts/services/contact.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { EntityType, TermType, getTermType } from '../../../contacts/models/contact-enum';
import { UtilityService } from '../../../../services/utility.service';
import { PropertyService } from '../../../properties/services/property.service';
import { PropertyCodeResponse } from '../../../properties/models/property.model';
import { NewContactDialogService } from '../../../shared/contacts/new-contact-dialog.service';

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
  form: FormGroup;
  vendorOptions: SearchableSelectOption<string>[] = [];
  propertyOptions: SearchableSelectOption<string>[] = [];
  chartOfAccountOptions: SearchableSelectOption<number>[] = [];
  readonly defaultTerms = getTermType(TermType.DueOnReceipt) || 'Due on receipt';
  private vendorById = new Map<string, ContactResponse>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RentRollEditLineDialogData,
    private dialogRef: MatDialogRef<RentRollEditLineDialogComponent, RentRollEditLineDialogResult | undefined>,
    private fb: FormBuilder,
    private chartOfAccountsService: ChartOfAccountsService,
    private contactService: ContactService,
    private utilityService: UtilityService,
    private propertyService: PropertyService,
    private newContactDialogService: NewContactDialogService
  ) {
    this.form = this.fb.group({
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
  }

  loadPropertyOptions(): void {
    const officeId = Number(this.data.officeId ?? 0);
    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(take(1)).subscribe({
          next: (properties: PropertyCodeResponse[]) => {
            const scopedProperties = (properties || [])
              .filter(property => !officeId || Number(property.officeId) === officeId);
            this.propertyOptions = scopedProperties
              .map(property => ({
                value: (property.propertyId || '').trim(),
                label: (property.propertyCode || '').trim() || (property.shortAddress || '').trim() || 'Property'
              }))
              .filter(option => !!option.value)
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

            const selectedPropertyId = this.normalizeOptionalText(this.form.get('propertyId')?.value);
            if (selectedPropertyId && !this.propertyOptions.some(option => option.value === selectedPropertyId)) {
              this.form.patchValue({ propertyId: null }, { emitEvent: false });
            }
          },
          error: () => {
            this.propertyOptions = [];
          }
        });
      }
    });
  }

  loadVendorOptions(preferredVendorId?: string | null): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        const officeId = Number(this.data.officeId ?? 0);
        const vendors = (this.contactService.getAllContactsValue() || [])
          .filter(contact => contact.entityTypeId === EntityType.Vendor)
          .filter(contact => !officeId || this.utilityService.contactHasOfficeAccess(contact, officeId));
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
      preselectPropertyOfficeId: this.data.officeId ?? null
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
    const officeId = Number(this.data.officeId ?? 0);
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
