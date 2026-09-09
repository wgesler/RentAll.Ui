import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, forkJoin, of, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { MappingService } from '../../../../services/mapping.service';
import { EntityType } from '../../../contacts/models/contact-enum';
import { ContactRequest, ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { runMobileLineListSave, shouldShowMobileLineFieldError } from '../../mobile-maintenance-detail/mobile-maintenance-line-list-validation';

interface PropertyContactEditRow {
  rowId: number;
  contactId?: string;
  contactCode: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
}

@Component({
  standalone: true,
  selector: 'app-mobile-property-contact-list',
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './mobile-property-contact-list.component.html',
  styleUrl: './mobile-property-contact-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobilePropertyContactListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;

  private contactService = inject(ContactService);
  private mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  rows: PropertyContactEditRow[] = [];
  private originalRowsById = new Map<string, PropertyContactEditRow>();
  private loadedContactsById = new Map<string, ContactResponse>();
  private rowCounter = 0;
  isLoading = false;
  isSaving = false;
  saveValidationAttempted = false;

  ngOnInit(): void {
    this.loadContacts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['officeId'] || changes['propertyCode']) && !changes['propertyCode']?.firstChange) {
      this.loadContacts();
    }
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      {
        rowId: ++this.rowCounter,
        contactCode: '',
        companyName: '',
        contactName: '',
        phone: '',
        email: ''
      }
    ];
    this.markViewForCheck();
  }

  removeRow(event: Event, row: PropertyContactEditRow): void {
    event.stopPropagation();
    event.preventDefault();
    if (row.contactId) {
      if (!window.confirm('Are you sure you want to delete this contact?')) {
        return;
      }
      this.isSaving = true;
      this.markViewForCheck();
      this.contactService.deleteContact(row.contactId).pipe(
        take(1),
        finalize(() => {
          this.isSaving = false;
          this.markViewForCheck();
        })
      ).subscribe({
        next: () => {
          this.toastr.success('Contact deleted successfully', CommonMessage.Success);
          this.loadContacts();
        },
        error: () => {
          this.toastr.error('Unable to delete contact.', CommonMessage.Error);
        }
      });
      return;
    }
    this.rows = this.rows.filter(current => current.rowId !== row.rowId);
    this.markViewForCheck();
  }

  saveContacts(): void {
    const payload = this.buildSavePayload();
    runMobileLineListSave(
      payload,
      () => this.persistContactRows(payload.rowsToSave),
      attempted => {
        this.saveValidationAttempted = attempted;
      },
      () => this.markViewForCheck()
    );
  }

  trackByRowId(_index: number, row: PropertyContactEditRow): number {
    return row.rowId;
  }

  showFieldError(isMissing: boolean): boolean {
    return shouldShowMobileLineFieldError(this.saveValidationAttempted, isMissing);
  }

  isContactNameMissing(row: PropertyContactEditRow): boolean {
    return !this.normalizeText(row.contactName) && !this.normalizeText(row.companyName);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadContacts(): void {
    this.isLoading = true;
    this.markViewForCheck();
    this.contactService.ensureContactsLoaded().pipe(
      take(1),
      switchMap(() => this.contactService.getAllContacts().pipe(take(1))),
      finalize(() => {
        this.isLoading = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: contacts => {
        const scoped = this.filterPropertyContacts(contacts || []);
        this.loadedContactsById.clear();
        scoped.forEach(contact => this.loadedContactsById.set(contact.contactId, contact));
        this.resetRowsFromContacts(scoped);
      },
      error: () => {
        this.rows = [];
        this.originalRowsById.clear();
        this.loadedContactsById.clear();
        this.markViewForCheck();
      }
    });
  }

  private filterPropertyContacts(contacts: ContactResponse[]): ContactResponse[] {
    const scopedPropertyCode = String(this.propertyCode || '').trim().toUpperCase();
    const scopeOfficeId = this.officeId;
    return (contacts || []).filter(contact => {
      if (contact.isActive === false) {
        return false;
      }
      if (contact.entityTypeId !== EntityType.Property) {
        return false;
      }
      if (scopeOfficeId != null) {
        const officeAccess = (contact.officeAccess || []).map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
        if (officeAccess.length > 0) {
          if (!officeAccess.includes(scopeOfficeId)) {
            return false;
          }
        } else if (Number(contact.officeId) !== scopeOfficeId) {
          return false;
        }
      }
      if (!scopedPropertyCode) {
        return true;
      }
      const codes = (contact.properties || [])
        .map(code => String(code || '').trim().toUpperCase())
        .filter(code => code.length > 0);
      return codes.includes(scopedPropertyCode);
    });
  }

  private resetRowsFromContacts(contacts: ContactResponse[]): void {
    this.originalRowsById.clear();
    this.rowCounter = 0;
    this.saveValidationAttempted = false;
    this.rows = contacts.map(contact => {
      const row = this.mapContactToRow(contact);
      this.originalRowsById.set(contact.contactId, this.cloneRow(row));
      return row;
    });
    this.markViewForCheck();
  }

  private mapContactToRow(contact: ContactResponse): PropertyContactEditRow {
    const combinedName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
    const contactName = (contact.fullName ?? contact.displayName ?? '').trim() || combinedName;
    return {
      rowId: ++this.rowCounter,
      contactId: contact.contactId,
      contactCode: contact.contactCode || '',
      companyName: contact.companyName || '',
      contactName,
      phone: contact.phone || '',
      email: contact.email || ''
    };
  }

  private buildSavePayload(): {
    hasChanges: boolean;
    hasInvalidRows: boolean;
    rowsToSave: PropertyContactEditRow[];
  } {
    const rowsToSave = this.rows.filter(row => this.isRowDirty(row) || !row.contactId);
    const hasInvalidRows = rowsToSave.some(row => this.isContactNameMissing(row));
    return {
      hasChanges: rowsToSave.length > 0,
      hasInvalidRows,
      rowsToSave
    };
  }

  private persistContactRows(rowsToSave: PropertyContactEditRow[]): void {
    if (rowsToSave.length === 0) {
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    forkJoin(rowsToSave.map(row => this.saveRow(row))).pipe(
      take(1),
      finalize(() => {
        this.isSaving = false;
        this.saveValidationAttempted = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Contacts saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.contactService.refreshContacts().pipe(take(1)).subscribe({
          next: () => this.loadContacts()
        });
      },
      error: () => {
        this.toastr.error('Unable to save contacts.', CommonMessage.Error);
      }
    });
  }

  private saveRow(row: PropertyContactEditRow) {
    const propertyCode = String(this.propertyCode || '').trim();
    if (row.contactId) {
      const contact = this.loadedContactsById.get(row.contactId);
      if (!contact) {
        return of(null);
      }
      const overrides: Partial<ContactRequest> = {
        companyName: this.normalizeText(row.companyName) || null,
        displayName: this.normalizeText(row.contactName) || null,
        firstName: this.normalizeText(row.contactName) || null,
        lastName: '',
        phone: this.normalizeText(row.phone) || null,
        email: this.resolveEmail(row, contact.email),
        properties: propertyCode ? this.mergePropertyCodes(contact.properties, propertyCode) : (contact.properties || [])
      };
      return this.contactService.updateContact(this.mappingService.mapContactResponseToUpdateRequest(contact, overrides));
    }

    const officeId = this.officeId ?? 0;
    const request: ContactRequest = {
      organizationId: this.authService.getUser()?.organizationId?.trim() ?? '',
      officeId,
      officeAccess: officeId > 0 ? [officeId] : [],
      entityTypeId: EntityType.Property,
      ownerTypeId: 0,
      vendorTypeId: 0,
      properties: propertyCode ? [propertyCode] : [],
      companyName: this.normalizeText(row.companyName) || null,
      displayName: this.normalizeText(row.contactName) || null,
      firstName: this.normalizeText(row.contactName) || null,
      lastName: '',
      phone: this.normalizeText(row.phone) || null,
      email: this.resolveEmail(row, ''),
      rating: 0,
      isInternational: false,
      isActive: true
    };
    return this.contactService.createContact(request);
  }

  private resolveEmail(row: PropertyContactEditRow, existingEmail: string | null | undefined): string {
    const trimmed = this.normalizeText(row.email);
    if (trimmed) {
      return trimmed;
    }
    const existing = String(existingEmail || '').trim();
    if (existing) {
      return existing;
    }
    const fallbackOfficeId = Number(this.officeId) > 0 ? Number(this.officeId) : 0;
    return `property-contact-${fallbackOfficeId}-${Date.now()}@rentall.local`;
  }

  private mergePropertyCodes(existing: string[] | undefined, propertyCode: string): string[] {
    const normalized = String(propertyCode || '').trim();
    const codes = (existing || [])
      .map(code => String(code || '').trim())
      .filter(code => code.length > 0);
    if (!normalized) {
      return codes;
    }
    return codes.some(code => code.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0)
      ? codes
      : [...codes, normalized];
  }

  private isRowDirty(row: PropertyContactEditRow): boolean {
    if (!row.contactId) {
      return true;
    }
    const original = this.originalRowsById.get(row.contactId);
    if (!original) {
      return true;
    }
    return this.normalizeText(original.contactCode) !== this.normalizeText(row.contactCode)
      || this.normalizeText(original.companyName) !== this.normalizeText(row.companyName)
      || this.normalizeText(original.contactName) !== this.normalizeText(row.contactName)
      || this.normalizeText(original.phone) !== this.normalizeText(row.phone)
      || this.normalizeText(original.email) !== this.normalizeText(row.email);
  }

  private normalizeText(value: string | null | undefined): string {
    return String(value || '').trim();
  }

  private cloneRow(row: PropertyContactEditRow): PropertyContactEditRow {
    return { ...row };
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
