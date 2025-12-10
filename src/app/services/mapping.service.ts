import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/company/models/company.model';
import { PropertyResponse, PropertyListDisplay } from '../authenticated/property/models/property.model';
import { ContactResponse, ContactListDisplay } from '../authenticated/contact/models/contact.model';
import { ContactType } from '../authenticated/contact/models/contact-type';
import { UserResponse, UserListDisplay } from '../authenticated/user/models/user.model';
import { UserGroups } from '../authenticated/user/models/user-type';
import { FormatterService } from './formatter-service';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(private formatter: FormatterService) { }
  
  mapCompanies(companies: CompanyResponse[], contacts?: ContactResponse[]): CompanyListDisplay[] {
    return companies.map<CompanyListDisplay>((o: CompanyResponse) => {
      let contactName = '';
      let contactId = '';
      if (o.contactId && contacts) {
        const contact = contacts.find(c => c.contactId === o.contactId);
        if (contact) {
          contactName = contact.firstName + ' ' + contact.lastName;
          contactId = contact.contactId;
        }
      }
      return {
        companyId: o.companyId,
        companyCode: o.companyCode,
        name: o.name,
        contact: contactName || '',
        contactId: contactId || o.contactId || '',
        city: o.city,
        state: o.state,
        zip: o.zip,
        phone: this.formatPhoneNumber(o.phone),
        website: o.website,
        logoStorageId: o.logoStorageId,
        isActive: o.isActive,
      };
    });
  }

  mapProperties(properties: PropertyResponse[], contacts?: ContactResponse[]): PropertyListDisplay[] {
    return properties.map<PropertyListDisplay>((o: PropertyResponse) => {
      let ownerName = '';
      let contactId = '';
      if (o.contactId && contacts) {
        const contact = contacts.find(c => c.contactId === o.contactId);
        if (contact) {
          ownerName = contact.firstName + ' ' + contact.lastName;
          contactId = contact.contactId;
        }
      }
      // Use address1 as name since API doesn't have a name field
      const propertyName = o.address1 || o.propertyCode || '';
      return {
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        owner: ownerName || '',
        contactId: contactId || o.contactId || '',
        accomodates: o.accomodates,
        bedrooms: o.bedrooms,
        bathrooms: o.bathrooms,
        squareFeet: o.squareFeet,
        isActive: o.isActive, 
      };
    });
  }

  mapContacts(contacts: ContactResponse[]): ContactListDisplay[] {
    return contacts.map<ContactListDisplay>((o: ContactResponse) => ({
      contactId: o.contactId,
      contactCode: o.contactCode,
      fullName: o.firstName + ' ' + o.lastName,
      contactType: this.formatContactType(o.contactTypeId),
      phone: this.formatPhoneNumber(o.phone),
      email: o.email,
      isActive: typeof o.isActive === 'number' ? o.isActive === 1 : Boolean(o.isActive)
    }));
  }

  formatContactType(contactTypeId?: number): string {
    if (contactTypeId === undefined || contactTypeId === null) {
      return 'Unknown';
    }
    const typeLabels: { [key: number]: string } = {
      [ContactType.Unknown]: 'Unknown',
      [ContactType.Company]: 'Company',
      [ContactType.Owner]: 'Owner',
      [ContactType.Tenant]: 'Tenant',
      [ContactType.Rentor]: 'Rentor',
      [ContactType.Rentee]: 'Rentee'
    };
    return typeLabels[contactTypeId] || 'Unknown';
  }

  mapUsers(users: UserResponse[]): UserListDisplay[] {
    return users.map<UserListDisplay>((o: UserResponse) => {
      const userGroups = o.userGroups || [];
      return {
        userId: o.userId,
        firstName: o.firstName,
        lastName: o.lastName,
        fullName: o.firstName + ' ' + o.lastName,
        email: o.email,
        userGroups: userGroups,
        userGroupsDisplay: this.formatUserGroups(userGroups),
        isActive: o.isActive
      };
    });
  }

  formatUserGroups(userGroups: string[]): string {
    if (!userGroups || userGroups.length === 0) {
      return '';
    }
    const groupLabels: { [key: string]: string } = {
      'SuperAdmin': 'Super Admin',
      'Admin': 'Admin',
      'User': 'User',
      'Unknown': 'Unknown'
    };
    return userGroups.map(g => groupLabels[g] || g).join(', ');
  }

  formatPhoneNumber(phone?: string): string {
    if (!phone) return phone || '';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    }
    return phone;
  }
}
