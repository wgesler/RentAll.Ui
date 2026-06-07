import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ContactResponse } from '../../contacts/models/contact.model';
import {
  DocuSignSignerConfig,
  DocuSignSignerSlot,
  OwnerDocuSignSignerService
} from '../services/owner-docusign-signer.service';

export interface OwnerDocuSignSignersDialogData {
  formTitle: string;
  slots: DocuSignSignerSlot[];
  tenantContacts: ContactResponse[];
  owner2Contacts: ContactResponse[];
  noSignersConfigured?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-owner-docusign-signers-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-docusign-signers-dialog.component.html',
  styleUrl: './owner-docusign-signers-dialog.component.scss'
})
export class OwnerDocuSignSignersDialogComponent {
  slots: DocuSignSignerSlot[];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: OwnerDocuSignSignersDialogData,
    private dialogRef: MatDialogRef<OwnerDocuSignSignersDialogComponent, DocuSignSignerConfig[] | undefined>,
    private ownerDocuSignSignerService: OwnerDocuSignSignerService
  ) {
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
