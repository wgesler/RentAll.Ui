import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { DocuSignSignerConfig, DocuSignSignerSlot } from '../../../owners/models/owner-docusign.model';
import { OwnerDocuSignSignerService } from '../../../owners/services/owner-docusign-signer.service';

export interface DocuSignSignersDialogData {
  formTitle: string;
  slots: DocuSignSignerSlot[];
  tenantContacts: ContactResponse[];
  owner2Contacts: ContactResponse[];
  noSignersConfigured?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-docusign-signers-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './docusign-signers-dialog.component.html',
  styleUrl: './docusign-signers-dialog.component.scss'
})
export class DocuSignSignersDialogComponent {
  data = inject<DocuSignSignersDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject<MatDialogRef<DocuSignSignersDialogComponent, DocuSignSignerConfig[] | undefined>>(MatDialogRef);
  ownerDocuSignSignerService = inject(OwnerDocuSignSignerService);

  slots: DocuSignSignerSlot[];

  constructor() {
    const data = this.data;

    this.slots = (data.slots || []).map(slot => ({ ...slot }));
  }

  //#region DocuSign Signers Dialog
  get canConfirm(): boolean {
    return this.ownerDocuSignSignerService.areSignerSlotsValid(this.slots);
  }

  get hasTenantSlots(): boolean {
    return this.slots.some(slot => slot.isTenant);
  }

  get hasOwner2Slots(): boolean {
    return this.slots.some(slot => slot.isOwner2);
  }

  removeSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot?.isRemovable) {
      return;
    }
    this.slots = this.slots.filter((_, slotIndex) => slotIndex !== index);
  }

  onTenantSelected(slot: DocuSignSignerSlot, contactId: string | null): void {
    this.updateSlotContact(slot, contactId, this.data.tenantContacts);
  }

  onOwner2Selected(slot: DocuSignSignerSlot, contactId: string | null): void {
    this.updateSlotContact(slot, contactId, this.data.owner2Contacts);
  }

  getContactLabel(contact: ContactResponse): string {
    const name = String(contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()).trim();
    const email = String(contact.email || '').trim();
    if (name && email) {
      return `${name} (${email})`;
    }
    return name || email || 'Contact';
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (!this.canConfirm) {
      return;
    }
    this.dialogRef.close(this.ownerDocuSignSignerService.slotsToSigners(this.slots));
  }

  updateSlotContact(
    slot: DocuSignSignerSlot,
    contactId: string | null,
    contacts: ContactResponse[]
  ): void {
    const normalizedContactId = String(contactId || '').trim();
    const contact = contacts.find(item =>
      String(item.contactId || '').trim() === normalizedContactId
    ) || null;
    const slotIndex = this.slots.findIndex(item => item.id === slot.id);
    if (slotIndex < 0) {
      return;
    }
    this.slots[slotIndex] = this.ownerDocuSignSignerService.applyContactToSlot(slot, contact);
  }
  //#endregion
}
