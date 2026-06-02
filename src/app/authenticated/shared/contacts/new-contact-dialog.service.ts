import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, take } from 'rxjs';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { EntityType, getEntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { SearchableSelectOption } from '../searchable-select/searchable-select.component';

const NEW_OWNER_OPTION_VALUE = '__new_owner__';
const NEW_VENDOR_OPTION_VALUE = '__new_vendor__';
const NEW_CONTACT_OPTION_VALUE = '__new_contact__';

export interface NewContactDialogOptions {
  entityTypeId: number;
  preselectPropertyOfficeId?: number | null;
  preselectPropertyCodes?: string[];
}

export interface EditContactDialogOptions {
  contact: ContactResponse;
  entityTypeId?: number;
}

export interface NewContactDialogResult {
  saved?: boolean;
  contactId?: string;
  entityTypeId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NewContactDialogService {
  constructor(private dialog: MatDialog) {}

  getNewContactOptionValue(entityTypeId: number): string {
    if (entityTypeId === EntityType.Owner) {
      return NEW_OWNER_OPTION_VALUE;
    }
    if (entityTypeId === EntityType.Vendor) {
      return NEW_VENDOR_OPTION_VALUE;
    }
    return NEW_CONTACT_OPTION_VALUE;
  }

  getNewContactOptionLabel(entityTypeId: number): string {
    const entityName = getEntityType(entityTypeId);
    return entityName ? `New ${entityName}` : 'New Contact';
  }

  isNewContactOptionValue(value: string | number | null | undefined, entityTypeId?: number): boolean {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return false;
    }
    if (entityTypeId != null) {
      return normalized === this.getNewContactOptionValue(entityTypeId);
    }
    return (
      normalized === NEW_OWNER_OPTION_VALUE
      || normalized === NEW_VENDOR_OPTION_VALUE
      || normalized === NEW_CONTACT_OPTION_VALUE
    );
  }

  isNewContactLabel(label: string | null | undefined, entityTypeId: number): boolean {
    return String(label ?? '').trim().toLowerCase() === this.getNewContactOptionLabel(entityTypeId).toLowerCase();
  }

  buildSearchableSelectOption(entityTypeId: number): SearchableSelectOption<string> {
    return {
      value: this.getNewContactOptionValue(entityTypeId),
      label: this.getNewContactOptionLabel(entityTypeId)
    };
  }

  buildListOption(entityTypeId: number): { contactId: string; label: string } {
    return {
      contactId: this.getNewContactOptionValue(entityTypeId),
      label: this.getNewContactOptionLabel(entityTypeId)
    };
  }

  prependNewContactListOption<T extends { contactId: string; label: string }>(
    entityTypeId: number,
    options: T[]
  ): T[] {
    const sentinelValue = this.getNewContactOptionValue(entityTypeId);
    const sentinelLabel = this.getNewContactOptionLabel(entityTypeId);
    const withoutSentinel = options.filter(
      option =>
        String(option.contactId || '').trim() !== sentinelValue
        && String(option.label || '').trim().toLowerCase() !== sentinelLabel.toLowerCase()
    );
    return [this.buildListOption(entityTypeId) as T, ...withoutSentinel];
  }

  openNewContactDialog(options: NewContactDialogOptions): Observable<NewContactDialogResult | undefined> {
    const officeId = Number(options.preselectPropertyOfficeId ?? 0);
    const data: Record<string, unknown> = {
      compactDialogMode: true,
      entityTypeId: options.entityTypeId,
      showDialogCancelButton: true
    };
    if (Number.isFinite(officeId) && officeId > 0) {
      data['preselectPropertyOfficeId'] = officeId;
    }
    if (options.preselectPropertyCodes?.length) {
      data['preselectPropertyCodes'] = options.preselectPropertyCodes;
    }

    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true,
      data
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: NewContactDialogResult) => dialogRef.close(result));

    return dialogRef.afterClosed().pipe(take(1));
  }

  openEditContactDialog(options: EditContactDialogOptions): Observable<NewContactDialogResult | undefined> {
    const entityTypeId = options.entityTypeId ?? options.contact.entityTypeId;
    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        preloadedContact: options.contact,
        entityTypeId,
        compactDialogMode: true,
        showDialogCancelButton: true
      }
    });

    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: NewContactDialogResult) => dialogRef.close(result));

    return dialogRef.afterClosed().pipe(take(1));
  }
}
