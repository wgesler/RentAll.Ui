import { Injectable } from '@angular/core';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { DocuSignSignerConfig, DocuSignSignerSlot, OwnerDocuSignSignerContext } from '../models/owner-docusign.model';
import { OwnerIncludedOwnersService } from './owner-included-owners.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerDocuSignSignerService {
  constructor(public ownerIncludedOwnersService: OwnerIncludedOwnersService) {}

  //#region Role Parsing
  parseSignerRolesFromHtml(html: string): string[] {
    return this.collapseCompanyTenantRoles(this.parseExplicitSignerRoles(String(html || '')));
  }

  parseCorporateSignerRolesFromHtml(html: string): string[] {
    return this.parseCorporateExplicitSignerRoles(String(html || ''));
  }

  mergeSignerRoles(existing: string[], additional: string[]): string[] {
    const merged = [...(existing || [])];
    (additional || []).forEach(role => {
      const normalized = this.normalizeRole(role);
      if (!normalized || merged.includes(normalized)) {
        return;
      }
      merged.push(normalized);
    });
    return this.collapseCompanyTenantRoles(merged);
  }

  parseExplicitSignerRoles(html: string): string[] {
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

  parseCorporateExplicitSignerRoles(html: string): string[] {
    const commentMatch = html.match(/<!--\s*DocuSignSignersCorporate:\s*([^>]+?)-->/i);
    if (commentMatch?.[1]) {
      return this.normalizeRoleList(commentMatch[1]);
    }

    const metaMatch = html.match(/<meta[^>]+name=["']docusign-signers-corporate["'][^>]+content=["']([^"']+)["'][^>]*>/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']docusign-signers-corporate["'][^>]*>/i);
    if (metaMatch?.[1]) {
      return this.normalizeRoleList(metaMatch[1]);
    }

    return [];
  }

  collapseCompanyTenantRoles(roles: string[]): string[] {
    let normalizedRoles = (roles || []).map(role => this.normalizeRole(role)).filter(Boolean);

    if (normalizedRoles.includes('company') && normalizedRoles.includes('tenant')) {
      const collapsed: string[] = [];
      let addedCompanyTenant = false;
      normalizedRoles.forEach(role => {
        if (role === 'company' || role === 'tenant') {
          if (!addedCompanyTenant) {
            collapsed.push('companytenant');
            addedCompanyTenant = true;
          }
          return;
        }
        collapsed.push(role);
      });
      normalizedRoles = collapsed;
    }

    if (normalizedRoles.includes('companytenant')) {
      normalizedRoles = normalizedRoles.filter(role => role !== 'tenant' && role !== 'company');
    }

    return normalizedRoles;
  }

  normalizeRoleList(value: string): string[] {
    return String(value || '')
      .split(/[,;|]/)
      .map(role => this.normalizeRole(role))
      .filter(Boolean);
  }

  normalizeRole(role: string): string {
    return String(role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }
  //#endregion

  //#region Signer Slots
  buildSignerSlots(roles: string[], context: OwnerDocuSignSignerContext): DocuSignSignerSlot[] {
    const normalizedRoles = this.collapseCompanyTenantRoles(
      (roles || []).map(role => this.normalizeRole(role))
    );

    return normalizedRoles.map((role, index) => {
      const isCompanyTenant = this.isCompanyTenantRole(role);
      const isCompany = this.isCompanyRole(role);
      const isOwner2 = this.isOwner2Role(role);
      const tenantRoleIndex = this.getTenantRoleIndex(role);
      const isTenantRoleType = tenantRoleIndex != null;
      const companyTenantContact = isCompanyTenant
        ? this.resolveCompanyTenantContact(context)
        : null;
      const tenantContact = isTenantRoleType
        ? this.resolveTenantContactForRole(role, context)
        : null;
      const resolved = isCompanyTenant
        ? this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(companyTenantContact, index + 1)
        : isTenantRoleType
          ? this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(tenantContact, index + 1)
          : this.resolveSignerForRole(role, index + 1, context);
      const contactId = isCompanyTenant
        ? (String(companyTenantContact?.contactId || '').trim() || null)
        : isTenantRoleType
          ? (String(tenantContact?.contactId || '').trim() || null)
          : isCompany
            ? (String(context.primaryCompanyContact?.contactId || '').trim() || null)
            : this.resolveContactIdForRole(role, context);
      const isTenant = this.isSelectableTenantRole(role, tenantContact);

      return {
        id: `${role}-${index}`,
        role,
        label: this.getRoleDisplayLabel(role),
        email: String(resolved?.email || '').trim(),
        name: String(resolved?.name || '').trim(),
        contactId,
        isRemovable: this.isRemovableRole(role, normalizedRoles),
        isTenant,
        isOwner2,
        isCompany,
        isCompanyTenant
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

  applyContactToSlot(slot: DocuSignSignerSlot, contact: ContactResponse | null | undefined): DocuSignSignerSlot {
    const signer = this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(contact, 1);
    return {
      ...slot,
      contactId: String(contact?.contactId || '').trim() || null,
      email: String(signer?.email || '').trim(),
      name: String(signer?.name || '').trim()
    };
  }
  //#endregion

  //#region Role Helpers
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
      case 'company':
        return 'Company';
      case 'companytenant':
        return 'Company/Tenant';
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

  isCompanyRole(role: string): boolean {
    return this.normalizeRole(role) === 'company';
  }

  isCompanyTenantRole(role: string): boolean {
    return this.normalizeRole(role) === 'companytenant';
  }

  isOwner2Role(role: string): boolean {
    const normalized = this.normalizeRole(role);
    return ['owner2', 'additionalowner', 'landlord2'].includes(normalized);
  }

  isRemovableRole(role: string, roles: string[] = []): boolean {
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

  isSelectableTenantRole(
    role: string,
    tenantContact: ContactResponse | null | undefined
  ): boolean {
    const tenantRoleIndex = this.getTenantRoleIndex(role);
    if (tenantRoleIndex == null) {
      return false;
    }
    if (tenantRoleIndex >= 1) {
      return true;
    }
    return !tenantContact;
  }

  getTenantRoleIndex(role: string): number | null {
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
  //#endregion

  //#region Contact Resolution
  resolveCompanyTenantContact(
    context: OwnerDocuSignSignerContext
  ): ContactResponse | null {
    return context.primaryCompanyContact ?? context.primaryTenantContact ?? null;
  }

  resolveTenantContactForRole(
    role: string,
    context: OwnerDocuSignSignerContext
  ): ContactResponse | null {
    const tenantIndex = this.getTenantRoleIndex(role);
    if (tenantIndex !== 0) {
      return null;
    }
    return context.primaryTenantContact ?? null;
  }

  resolveContactIdForRole(role: string, context: OwnerDocuSignSignerContext): string | null {
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

  resolveSignerForRole(
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

      case 'company':
        return this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(
          context.primaryCompanyContact,
          routingOrder
        );

      case 'companytenant':
        return this.ownerIncludedOwnersService.buildDocuSignSignerFromContact(
          this.resolveCompanyTenantContact(context),
          routingOrder
        );

      default:
        return null;
    }
  }
  //#endregion

  //#region Contact Filtering
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

  contactHasOfficeAccess(contact: ContactResponse, officeId: number): boolean {
    const officeAccess = (contact.officeAccess || [])
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);
    if (officeAccess.length > 0) {
      return officeAccess.includes(officeId);
    }
    return Number(contact.officeId) === officeId;
  }
  //#endregion
}
