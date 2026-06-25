import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ContactService } from '../../contacts/services/contact.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType, TermType, getTermType } from '../../contacts/models/contact-enum';
import { UtilityService } from '../../../services/utility.service';

export interface RentRollEditLineDialogData {
  propertyCode: string;
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
}

export interface RentRollEditLineDialogResult {
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
  chartOfAccountOptions: SearchableSelectOption<number>[] = [];
  readonly defaultTerms = getTermType(TermType.DueOnReceipt) || 'Due on receipt';
  private vendorById = new Map<string, ContactResponse>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RentRollEditLineDialogData,
    private dialogRef: MatDialogRef<RentRollEditLineDialogComponent, RentRollEditLineDialogResult | undefined>,
    private fb: FormBuilder,
    private chartOfAccountsService: ChartOfAccountsService,
    private contactService: ContactService,
    private utilityService: UtilityService
  ) {
    this.form = this.fb.group({
      vendorId: [(data.vendorId || '').trim()],
      vendorName: [data.vendorName || ''],
      terms: [{ value: data.terms || this.defaultTerms, disabled: true }],
      chartOfAccountId: [data.chartOfAccountId ?? null],
      startDate: [this.toDateControlValue(data.startDate)],
      endDate: [this.toDateControlValue(data.endDate)],
      deposit: [this.formatCurrencyInput(data.depositAmount)],
      oneTime: [this.formatCurrencyInput(data.oneTimeAmount)],
      monthly: [this.formatCurrencyInput(data.monthlyAmount)],
      daily: [this.formatCurrencyInput(data.dailyAmount)]
    });
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
      vendorId: this.normalizeOptionalText(value.vendorId),
      vendorName: (value.vendorName || '').toString().trim(),
      terms: (this.form.get('terms')?.value || '').toString().trim(),
      chartOfAccountId: this.parseNullablePositiveInteger(value.chartOfAccountId),
      startDate: this.toDateOnlyString(value.startDate),
      endDate: this.toDateOnlyString(value.endDate),
      deposit: this.parseNullableNumber(value.deposit),
      oneTime: this.parseNullableNumber(value.oneTime),
      monthly: this.parseNullableNumber(value.monthly),
      daily: this.parseNullableNumber(value.daily)
    });
  }

  toDateControlValue(value: string | null | undefined): Date | null {
    const raw = (value || '').toString().trim();
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  toDateOnlyString(value: unknown): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = `${value.getMonth() + 1}`.padStart(2, '0');
      const day = `${value.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const raw = (value || '').toString().trim();
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    const vendor = vendorId ? (this.vendorById.get(vendorId) || null) : null;
    const vendorName = vendor ? this.utilityService.getVendorDropdownLabel(vendor) : '';
    const terms = vendor ? (getTermType(vendor.paymentTermsId) || this.defaultTerms) : this.defaultTerms;
    this.form.patchValue({
      vendorId,
      vendorName
    }, { emitEvent: false });
    this.form.get('terms')?.setValue(terms, { emitEvent: false });
  }

  loadVendorOptions(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        const officeId = Number(this.data.officeId ?? 0);
        const vendors = (this.contactService.getAllContactsValue() || [])
          .filter(contact => contact.entityTypeId === EntityType.Vendor)
          .filter(contact => !officeId || this.utilityService.contactHasOfficeAccess(contact, officeId));
        this.vendorById = new Map<string, ContactResponse>();
        this.vendorOptions = vendors
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
      }
    });
  }

  loadChartOfAccountOptions(): void {
    const officeId = Number(this.data.officeId ?? 0);
    if (!officeId) {
      this.chartOfAccountOptions = [];
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.chartOfAccountOptions = (this.chartOfAccountsService.getChartOfAccountsForOffice(officeId) || [])
          .map(account => ({
            value: account.accountId,
            label: this.utilityService.getChartOfAccountDropdownLabel(account)
          }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      }
    });
  }
}
