import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ContactResponse } from '../../contacts/models/contact.model';
import {
  OwnerDocuSignSignersDialogComponent,
  OwnerDocuSignSignersDialogData
} from '../modals/owner-docusign-signers-dialog.component';
import {
  DocuSignSignerConfig,
  OwnerDocuSignSignerContext,
  OwnerDocuSignSignerService
} from './owner-docusign-signer.service';

export interface OwnerDocuSignSignersPromptInput {
  formTitle: string;
  roles: string[];
  context: OwnerDocuSignSignerContext;
  officeId: number | null | undefined;
  contacts: ContactResponse[];
}

@Injectable({
  providedIn: 'root'
})
export class OwnerDocuSignSignersDialogService {
  constructor(
    private dialog: MatDialog,
    private ownerDocuSignSignerService: OwnerDocuSignSignerService
  ) {}

  async promptForSigners(input: OwnerDocuSignSignersPromptInput): Promise<DocuSignSignerConfig[] | null> {
    const roles = (input.roles || []).filter(Boolean);
    const noSignersConfigured = roles.length === 0;
    const tenantContacts = noSignersConfigured
      ? []
      : this.ownerDocuSignSignerService.filterTenantContacts(input.contacts || [], input.officeId);
    const owner2Contacts = noSignersConfigured
      ? []
      : this.ownerDocuSignSignerService.filterOwner2Contacts(
          input.contacts || [],
          input.officeId,
          input.context.primaryOwnerContact?.contactId
        );
    const slots = noSignersConfigured
      ? []
      : this.ownerDocuSignSignerService.buildSignerSlots(roles, input.context);
    const dialogRef = this.dialog.open<
      OwnerDocuSignSignersDialogComponent,
      OwnerDocuSignSignersDialogData,
      DocuSignSignerConfig[] | undefined
    >(OwnerDocuSignSignersDialogComponent, {
      width: '42rem',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        formTitle: input.formTitle,
        slots,
        tenantContacts,
        owner2Contacts,
        noSignersConfigured
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result || result.length === 0) {
      return null;
    }
    return result;
  }
}
