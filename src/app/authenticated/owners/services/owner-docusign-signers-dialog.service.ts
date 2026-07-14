import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DocuSignSignersDialogComponent, DocuSignSignersDialogData } from '../../shared/modals/docusign-signers-dialog/docusign-signers-dialog.component';
import { DocuSignSignerConfig, OwnerDocuSignSignersPromptInput } from '../models/owner-docusign.model';
import { OwnerDocuSignSignerService } from './owner-docusign-signer.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerDocuSignSignersDialogService {
  dialog = inject(MatDialog);
  ownerDocuSignSignerService = inject(OwnerDocuSignSignerService);


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
      DocuSignSignersDialogComponent,
      DocuSignSignersDialogData,
      DocuSignSignerConfig[] | undefined
    >(DocuSignSignersDialogComponent, {
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
