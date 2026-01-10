import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/company/models/company.model';
import { VendorResponse, VendorListDisplay } from '../authenticated/vendor/models/vendor.model';
import { PropertyResponse, PropertyListDisplay } from '../authenticated/property/models/property.model';
import { ContactResponse, ContactListDisplay } from '../authenticated/contact/models/contact.model';
import { EntityType } from '../authenticated/contact/models/contact-type';
import { UserResponse, UserListDisplay } from '../authenticated/user/models/user.model';
import { UserGroups } from '../authenticated/user/models/user-type';
import { ReservationResponse, ReservationListDisplay } from '../authenticated/reservation/models/reservation-model';
import { ReservationStatus } from '../authenticated/reservation/models/reservation-enum';
import { AgentResponse, AgentListDisplay } from '../authenticated/organization-configuration/agent/models/agent.model';
import { AreaResponse, AreaListDisplay } from '../authenticated/organization-configuration/area/models/area.model';
import { BuildingResponse, BuildingListDisplay } from '../authenticated/organization-configuration/building/models/building.model';
import { OfficeResponse, OfficeListDisplay } from '../authenticated/organization-configuration/office/models/office.model';
import { RegionResponse, RegionListDisplay } from '../authenticated/organization-configuration/region/models/region.model';
import { ColorResponse, ColorListDisplay } from '../authenticated/organization-configuration/color/models/color.model';
import { OrganizationResponse, OrganizationListDisplay } from '../authenticated/organization/models/organization.model';
import { OfficeConfigurationResponse, OfficeConfigurationListDisplay } from '../authenticated/organization-configuration/office-configuration/models/office-configuration.model';
import { FormatterService } from './formatter-service';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(private formatter: FormatterService) { }
  
  mapAgents(agents: AgentResponse[], offices?: OfficeResponse[]): AgentListDisplay[] {
    return agents.map<AgentListDisplay>((o: AgentResponse) => {
      let officeName = '';
      if (o.officeId && offices) {
        const office = offices.find(off => off.officeId === o.officeId);
        officeName = office?.name || '';
      }
      return {
        agentId: o.agentId,
        agentCode: o.agentCode,
        officeId: o.officeId,
        officeName: officeName || undefined,
        name: o.name,
        isActive: o.isActive
      };
    });
  }

  mapAreas(areas: AreaResponse[], offices?: OfficeResponse[]): AreaListDisplay[] {
    return areas.map<AreaListDisplay>((o: AreaResponse) => {
      let officeName = '';
      if (o.officeId && offices) {
        const office = offices.find(off => String(off.officeId) === String(o.officeId));
        officeName = office?.name || '';
      }
      return {
        areaId: o.areaId,
        areaCode: o.areaCode,
        officeId: o.officeId,
        officeName: officeName || undefined,
        name: o.name,
        description: o.description,
        isActive: o.isActive
      };
    });
  }

  mapBuildings(buildings: BuildingResponse[], offices?: OfficeResponse[]): BuildingListDisplay[] {
    return buildings.map<BuildingListDisplay>((o: BuildingResponse) => {
      let officeName = '';
      if (o.officeId && offices) {
        const office = offices.find(off => String(off.officeId) === String(o.officeId));
        officeName = office?.name || '';
      }
      return {
        buildingId: o.buildingId,
        buildingCode: o.buildingCode,
        name: o.name,
        description: o.description,
        officeId: o.officeId,
        officeName: officeName || undefined,
        hoaName: o.hoaName,
        hoaPhone: o.hoaPhone,
        hoaEmail: o.hoaEmail,
        isActive: o.isActive
      };
    });
  }

  mapColors(colors: ColorResponse[]): ColorListDisplay[] {
    return colors.map<ColorListDisplay>((o: ColorResponse) => ({
      colorId: o.colorId,
      reservationStatusId: o.reservationStatusId,
      reservationStatus: this.formatReservationStatus(o.reservationStatusId),
      color: o.color
    }));
  }

  mapCompanies(companies: CompanyResponse[], contacts?: ContactResponse[]): CompanyListDisplay[] {
    return companies.map<CompanyListDisplay>((o: CompanyResponse) => {
      return {
        companyId: o.companyId,
        companyCode: o.companyCode,
        name: o.name,
        city: o.city,
        state: o.state,
        zip: o.zip,
        phone: this.formatPhoneNumber(o.phone),
        website: o.website,
        isActive: o.isActive,
      };
    });
  }

  mapVendors(vendors: VendorResponse[]): VendorListDisplay[] {
    return vendors.map<VendorListDisplay>((o: VendorResponse) => {
      return {
        vendorId: o.vendorId,
        vendorCode: o.vendorCode,
        name: o.name,
        city: o.city,
        state: o.state,
        phone: this.formatPhoneNumber(o.phone),
        website: o.website,
        isActive: o.isActive,
      };
    });
  }

  mapContacts(contacts: ContactResponse[]): ContactListDisplay[] {
    return contacts.map<ContactListDisplay>((o: ContactResponse) => ({
      contactId: o.contactId,
      contactCode: o.contactCode,
      fullName: o.firstName + ' ' + o.lastName,
      contactType: this.formatContactType(o.entityTypeId),
      phone: this.formatPhoneNumber(o.phone),
      email: o.email,
      isActive: typeof o.isActive === 'number' ? o.isActive === 1 : Boolean(o.isActive)
    }));
  }

  mapOffices(offices: OfficeResponse[]): OfficeListDisplay[] {
    return offices.map<OfficeListDisplay>((o: OfficeResponse) => ({
      officeId: o.officeId,
      officeCode: o.officeCode,
      name: o.name,
      address1: o.address1,
      address2: o.address2,
      suite: o.suite,
      city: o.city,
      state: o.state,
      zip: o.zip,
      phone: this.formatPhoneNumber(o.phone),
      fax: this.formatPhoneNumber(o.fax),
      website: o.website,
      isActive: o.isActive
    }));
  }

  mapOrganizations(organizations: OrganizationResponse[]): OrganizationListDisplay[] {
    return organizations.map<OrganizationListDisplay>((org: OrganizationResponse) => ({
      organizationId: org.organizationId,
      organizationCode: org.organizationCode,
      name: org.name,
      address1: org.address1,
      address2: org.address2,
      suite: org.suite,
      city: org.city,
      state: org.state,
      zip: org.zip,
      phone: this.formatPhoneNumber(org.phone),
      website: org.website,
      isActive: org.isActive
    }));
  }

  mapProperties(properties: PropertyResponse[], contacts?: ContactResponse[]): PropertyListDisplay[] {
    return properties.map<PropertyListDisplay>((o: PropertyResponse) => {
      let ownerName = '';
      let owner1Id = '';
      if (o.owner1Id && contacts) {
        const contact = contacts.find(c => c.contactId === o.owner1Id);
        if (contact) {
          ownerName = contact.firstName + ' ' + contact.lastName;
          owner1Id = contact.contactId;
        }
      }
      // Use address1 as name since API doesn't have a name field
      const propertyName = o.address1 || o.propertyCode || '';
      return {
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        owner: ownerName || '',
        owner1Id: owner1Id || o.owner1Id || '',
        owner2Id: o.owner2Id || '',
        owner3Id: o.owner3Id || '',
        accomodates: o.accomodates,
        bedrooms: o.bedrooms,
        bathrooms: o.bathrooms,
        squareFeet: o.squareFeet,
        monthlyRate: o.monthlyRate,
        isActive: o.isActive, 
      };
    });
  }

  mapRegions(regions: RegionResponse[], offices?: OfficeResponse[]): RegionListDisplay[] {
    return regions.map<RegionListDisplay>((o: RegionResponse) => {
      let officeName = '';
      if (o.officeId && offices) {
        const office = offices.find(off => String(off.officeId) === String(o.officeId));
        officeName = office?.name || '';
      }
      return {
        regionId: o.regionId,
        regionCode: o.regionCode,
        officeId: o.officeId,
        officeName: officeName || undefined,
        name: o.name,
        description: o.description,
        isActive: o.isActive
      };
    });
  }

  mapReservations(reservations: ReservationResponse[], contacts?: ContactResponse[], properties?: PropertyResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationResponse) => {
      let contactName = '';
      if (o.contactId && contacts) {
        const contact = contacts.find(c => c.contactId === o.contactId);
        if (contact) {
          contactName = contact.firstName + ' ' + contact.lastName;
        } else {
          // If contact not found, use tenantName as fallback
          contactName = o.tenantName || '';
        }
      } else if (o.tenantName) {
        contactName = o.tenantName;
      }

      // Get propertyCode by looking it up from properties using propertyId
      let propertyCode = '';
      if (o.propertyId && properties) {
        const property = properties.find(p => p.propertyId === o.propertyId);
        if (property) {
          propertyCode = property.propertyCode || '';
        }
      }

      return {
        reservationId: o.reservationId,
        reservationCode: o.reservationCode,
        propertyCode: propertyCode, 
        contactId: o.contactId || '',
        contactName: contactName || '',
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        reservationStatus: this.formatReservationStatus(o.reservationStatusId),
        reservationStatusId: o.reservationStatusId, // Added for proper sorting
        isActive: o.isActive
      };
    });
  }

  mapUsers(users: UserResponse[]): UserListDisplay[] {
    return users.map<UserListDisplay>((o: UserResponse) => {
      const userGroups = o.userGroups || [];
      return {
        userId: o.userId,
        organizationName: o.organizationName,
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

  mapOfficeConfigurations(configs: OfficeConfigurationResponse[]): OfficeConfigurationListDisplay[] {
    return configs.map<OfficeConfigurationListDisplay>((o: OfficeConfigurationResponse) => ({
      officeId: o.officeId,
      officeCode: o.officeCode || '',
      officeName: o.name || '',
      maintenanceEmail: o.maintenanceEmail,
      afterHoursPhone: this.formatter.phoneNumber(o.afterHoursPhone),
      defaultDeposit: o.defaultDeposit,
      defaultSdw:o.defaultSdw,
      isActive: o.isActive
    }));
  }

  // Helper/format functions
  formatContactType(contactTypeId?: number): string {
    if (contactTypeId === undefined || contactTypeId === null) {
      return 'Unknown';
    }
    const typeLabels: { [key: number]: string } = {
      [EntityType.Unknown]: 'Unknown',
      [EntityType.Company]: 'Company',
      [EntityType.Owner]: 'Owner',
      [EntityType.Tenant]: 'Tenant',      
      [EntityType.Vendor]: 'Vendor'
    };
    return typeLabels[contactTypeId] || 'Unknown';
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

  formatReservationStatus(reservationStatusId?: number): string {
    if (reservationStatusId === undefined || reservationStatusId === null) {
      return 'Unknown';
    }
    const statusLabels: { [key: number]: string } = {
      [ReservationStatus.PreBooking]: 'Pre-Booking',
      [ReservationStatus.Confirmed]: 'Confirmed',
      [ReservationStatus.CheckedIn]: 'Checked In',
      [ReservationStatus.GaveNotice]: 'Gave Notice',
      [ReservationStatus.FirstRightRefusal]: 'First Right of Refusal',
      [ReservationStatus.Maintenance]: 'Maintenance',
      [ReservationStatus.OwnerBlocked]: 'Owner Blocked',
      [ReservationStatus.ArrivalDeparture]: 'Arrival/Departure' 
    };
    return statusLabels[reservationStatusId] || 'Unknown';
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
}
