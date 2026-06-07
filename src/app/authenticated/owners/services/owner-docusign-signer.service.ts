import { Injectable } from '@angular/core';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { OwnerIncludedOwnersService } from './owner-included-owners.service';

export interface DocuSignSignerConfig {
  email: string;
  name: string;
  routingOrder: number;
}

export interface DocuSignSignerSlot {
  id: string;
  role: string;
  label: string;
  email: string;
  name: string;
  contactId: string | null;
  isRemovable: boolean;
  isTenant: boolean;
  isOwner2: boolean;
}

export interface OwnerDocuSignSignerContext {
  primaryOwnerContact: ContactResponse | null | undefined;
  additionalOwnerContactIds: string[];
  contacts: ContactResponse[];
  agent: { email: string; name: string } | null | undefined;
}

@Injectable({
  providedIn: 'root'
})
export class OwnerDocuSignSignerService {
  constructor(private ownerIncludedOwnersService: OwnerIncludedOwnersService) {}

  parseSignerRolesFromHtml(html: string): string[] {
    return this.parseExplicitSignerRoles(String(html || ''));
  }

  buildSignerSlots(roles: string[], context: OwnerDocuSignSignerContext): DocuSignSignerSlot[] {
    return roles.map((role, index) => {
      const isTenant = this.isTenantRole(role);
      const isOwner2 = this.isOwner2Role(role);
      const resolved = isTenant ? null : this.resolveSignerForRole(role, index + 1, context);
      const contactId = isTenant ? null : this.resolveContactIdForRole(role, context);

      return {
        id: `${role}-${index}`,
        role,
        label: this.getRoleDisplayLabel(role),
        email: String(resolved?.email || '').trim(),
        name: String(resolved?.name || '').trim(),
        contactId,
        isRemovable: this.isRemovableRole(role),
        isTenant,
        isOwner2
      };
    });
  }

  slotsToSigners(slots: DocuSignSignerSlot[]): DocuSignSignerConfig[] {
    return slots.map((slot, index) => ({
      email: String(slot.email || '').trim(),
      name: String(slot.name || '').trim(),
      routingOrder: index + 1
    }));
  }

  areSignerSlotsValid(slots: DocuSignSignerSlot[]): boolean {
    return slots.length > 0 && slots.every(slot =>
      !!String(slot.email || '').trim() && !!String(slot.name || '').trim()
    );
  }

  filterOwner2Contacts(
    contacts: ContactResponse[],
    officeId: number | null | undefined,
    primaryOwnerContactId: string | null | undefined
  ): ContactResponse[] {
    const scopeOfficeId = Number(officeId);
    const excludedContactId = String(primaryOwnerContactId || '').trim().toLowerCase();

    return (contacts || [])
      .filter(contact => contact.isActive !== false)
      .filter(contact => Number(contact.entityTypeId) === Number(EntityType.Owner))
      .filter(contact => {
        const contactId = String(contact.contactId || '').trim().toLowerCase();
        return !excludedContactId || contactId !== excludedContactId;
      })
      .filter(contact =>
        !Number.isFinite(scopeOfficeId) || scopeOfficeId <= 0 || this.contactHasOfficeAccess(contact, scopeOfficeId)
      )
      .sort((left, right) =>
        this.ownerIncludedOwnersService.getContactDisplayName(left)
          .localeCompare(this.ownerIncludedOwnersService.getContactDisplayName(right))
      );
  }

  filterTenantContacts(contacts: ContactResponse[], officeId: number | null | undefined): ContactResponse[] {
    const scopeOfficeId = Number(officeId);
    if (!Number.isFinite(scopeOfficeId) || scopeOfficeId <= 0) {
      return [];
    }

    return (contacts || [])
      .filter(contact => contact.isActive !== false)
      .filter(contact => Number(contact.entityTypeId) === Number(EntityType.Tenant))
      .filter(contact => this.contactHasOfficeAccess(contact, scopeOfficeId))
      .sort((left, right) =>
        this.ownerIncludedOwnersService.getContactDisplayName(left)
          .localeCompare(this.ownerIncludedOwnersService.getContactDisplayName(right))
      );
  }

  getRoleDisplayLabel(role: string): string {
    const normalized = this.normalizeRole(role);
    switch (normalized) {
      case 'owner':
      case 'owner1':
      case 'landlord':
      case 'landlord1':
        return 'Owner';
      case 'owner2':
      case 'additionalowner':
      case 'landlord2':
        return 'Owner 2';
      case 'agent':
      case 'broker':
        return 'Agent';
      case 'tenant':
        return 'Tenant';
      default: {
        const tenantMatch = normalized.match(/^tenant(\d+)$/);
        if (tenantMatch) {
          return `Tenant ${tenantMatch[1]}`;
        }
        return role;
      }
    }
  }

  isTenantRole(role: string): boolean {
    return this.getTenantRoleIndex(role) != null;
  }

  isOwner2Role(role: string): boolean {
    const normalized = this.normalizeRole(role);
    return ['owner2', 'additionalowner', 'landlord2'].includes(normalized);
  }

  isRemovableRole(role: string): boolean {
    if (this.isOwner2Role(role)) {
      return true;
    }
    const normalized = this.normalizeRole(role);
    const tenantMatch = normalized.match(/^tenant(\d+)$/);
    if (tenantMatch) {
      return Number(tenantMatch[1]) >= 2;
    }
    return false;
  }

  applyContactToSlot(slot: DocuSignSignerSlot, contact: ContactResponse | null | undefined): DocuSignSignerSlot {
    const signer = this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(contact, 1);
    return {
      ...slot,
      contactId: String(contact?.contactId || '').trim() || null,
      email: String(signer?.email || '').trim(),
      name: String(signer?.name || '').trim()
    };
  }

  private getTenantRoleIndex(role: string): number | null {
    const normalized = this.normalizeRole(role);
    if (normalized === 'tenant') {
      return 0;
    }
    const match = normalized.match(/^tenant(\d+)$/);
    if (!match) {
      return null;
    }
    const index = Number.parseInt(match[1], 10) - 1;
    return Number.isFinite(index) && index >= 0 ? index : null;
  }

  private contactHasOfficeAccess(contact: ContactResponse, officeId: number): boolean {
    const officeAccess = (contact.officeAccess || [])
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);
    if (officeAccess.length > 0) {
      return officeAccess.includes(officeId);
    }
    return Number(contact.officeId) === officeId;
  }

  private resolveContactIdForRole(role: string, context: OwnerDocuSignSignerContext): string | null {
    const normalized = this.normalizeRole(role);
    switch (normalized) {
      case 'owner':
      case 'owner1':
      case 'landlord':
      case 'landlord1':
        return String(context.primaryOwnerContact?.contactId || '').trim() || null;
      case 'owner2':
      case 'additionalowner':
      case 'landlord2':
        return String(context.additionalOwnerContactIds[0] || '').trim() || null;
      default:
        return null;
    }
  }

  private parseExplicitSignerRoles(html: string): string[] {
    const commentMatch = html.match(/<!--\s*DocuSignSigners:\s*([^>]+?)-->/i);
    if (commentMatch?.[1]) {
      return this.normalizeRoleList(commentMatch[1]);
    }

    const metaMatch = html.match(/<meta[^>]+name=["']docusign-signers["'][^>]+content=["']([^"']+)["'][^>]*>/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']docusign-signers["'][^>]*>/i);
    if (metaMatch?.[1]) {
      return this.normalizeRoleList(metaMatch[1]);
    }

    return [];
  }

  private normalizeRoleList(value: string): string[] {
    return String(value || '')
      .split(/[,;|]/)
      .map(role => this.normalizeRole(role))
      .filter(Boolean);
  }

  private normalizeRole(role: string): string {
    return String(role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  private resolveSignerForRole(
    role: string,
    routingOrder: number,
    context: OwnerDocuSignSignerContext
  ): DocuSignSignerConfig | null {
    const normalizedRole = this.normalizeRole(role);

    switch (normalizedRole) {
      case 'owner':
      case 'owner1':
      case 'landlord':
      case 'landlord1':
        return this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(
          context.primaryOwnerContact,
          routingOrder
        );

      case 'owner2':
      case 'additionalowner':
      case 'landlord2': {
        const secondOwnerId = String(context.additionalOwnerContactIds[0] || '').trim();
        const owner2Contact = secondOwnerId
          ? this.ownerIncludedOwnersService.resolveContactById(secondOwnerId, context.contacts)
          : null;
        return this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(owner2Contact, routingOrder);
      }

      case 'agent':
      case 'broker': {
        const email = String(context.agent?.email || '').trim();
        const name = String(context.agent?.name || '').trim();
        if (!email || !name) {
          return null;
        }
        return { email, name, routingOrder };
      }

      default:
        return null;
    }
  }
}
