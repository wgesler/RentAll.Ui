import { Injectable } from '@angular/core';
import { ContactResponse } from '../../contacts/models/contact.model';

@Injectable({
  providedIn: 'root'
})
export class OwnerIncludedOwnersService {
  getContactDisplayName(contact: ContactResponse | null | undefined): string {
    if (!contact) {
      return '';
    }
    return String(contact.fullName || '').trim()
      || `${String(contact.firstName || '').trim()} ${String(contact.lastName || '').trim()}`.trim();
  }

  resolveContactById(contactId: string, contacts: ContactResponse[]): ContactResponse | null {
    const normalizedId = String(contactId || '').trim();
    if (!normalizedId) {
      return null;
    }
    return (contacts || []).find(contact => String(contact.contactId || '').trim() === normalizedId) || null;
  }

  /** Primary owner plus up to one additional owner (two-signature forms such as direct deposit). */
  buildTwoOwnerNames(
    primaryContact: ContactResponse | null | undefined,
    additionalOwnerContactIds: string[],
    contacts: ContactResponse[]
  ): string {
    const secondOwnerId = String(additionalOwnerContactIds?.[0] || '').trim();
    const limitedAdditionalIds = secondOwnerId ? [secondOwnerId] : [];
    return this.buildConcatenatedOwnerNames(primaryContact, limitedAdditionalIds, contacts);
  }

  buildConcatenatedOwnerNames(
    primaryContact: ContactResponse | null | undefined,
    additionalOwnerContactIds: string[],
    contacts: ContactResponse[]
  ): string {
    const names: string[] = [];
    const seen = new Set<string>();

    const appendName = (name: string): void => {
      const normalized = String(name || '').trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      names.push(normalized);
    };

    appendName(this.getContactDisplayName(primaryContact));

    const contactById = new Map(
      (contacts || []).map(contact => [String(contact.contactId || '').trim(), contact])
    );

    for (const contactId of additionalOwnerContactIds || []) {
      const normalizedId = String(contactId || '').trim();
      if (!normalizedId) {
        continue;
      }
      appendName(this.getContactDisplayName(contactById.get(normalizedId)));
    }

    return names.join(', ');
  }

  buildDocuSignSignerFromContact(
    contact: ContactResponse | null | undefined,
    routingOrder: number
  ): { email: string; name: string; routingOrder: number } | null {
    const email = String(contact?.email || '').trim();
    const name = this.getContactDisplayName(contact);
    if (!email || !name) {
      return null;
    }
    return { email, name, routingOrder };
  }

  resolveOwner1AndOwner2Names(
    primaryContact: ContactResponse | null | undefined,
    additionalOwnerContactIds: string[],
    contacts: ContactResponse[],
    propertyOwner1Name = '',
    propertyOwner2Name = ''
  ): { owner1Name: string; owner2Name: string; ownerPairSeparator: string } {
    let owner1Name = this.getContactDisplayName(primaryContact) || String(propertyOwner1Name || '').trim();
    const secondOwnerId = String(additionalOwnerContactIds[0] || '').trim();
    const includedOwner2Name = secondOwnerId
      ? this.getContactDisplayName(this.resolveContactById(secondOwnerId, contacts))
      : '';
    let owner2Name = includedOwner2Name || String(propertyOwner2Name || '').trim();

    if (owner2Name && owner2Name.toLowerCase() === owner1Name.toLowerCase()) {
      owner2Name = '';
    }
    if (!owner1Name && owner2Name) {
      owner1Name = owner2Name;
      owner2Name = '';
    }

    return {
      owner1Name,
      owner2Name,
      ownerPairSeparator: owner2Name ? ', ' : ''
    };
  }
}
