import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/company/models/company.model';
import { PropertyResponse, PropertyListDisplay } from '../authenticated/property/models/property.model';
import { ContactResponse, ContactListDisplay } from '../authenticated/contact/models/contact.model';
import { EntityType } from '../authenticated/contact/models/contact-type';
import { UserResponse, UserListDisplay } from '../authenticated/user/models/user.model';
import { UserGroups } from '../authenticated/user/models/user-type';
import { ReservationResponse, ReservationListDisplay } from '../authenticated/reservation/models/reservation-model';
import { ReservationStatus } from '../authenticated/reservation/models/reservation-enum';
import { AgentResponse, AgentListDisplay } from '../authenticated/agent/models/agent.model';
import { AreaResponse, AreaListDisplay } from '../authenticated/area/models/area.model';
import { BuildingResponse, BuildingListDisplay } from '../authenticated/building/models/building.model';
import { FranchiseResponse, FranchiseListDisplay } from '../authenticated/franchise/models/franchise.model';
import { RegionResponse, RegionListDisplay } from '../authenticated/region/models/region.model';
import { ColorResponse, ColorListDisplay } from '../authenticated/color/models/color.model';
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
      contactType: this.formatContactType(o.entityTypeId),
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
      [EntityType.Unknown]: 'Unknown',
      [EntityType.Company]: 'Company',
      [EntityType.Owner]: 'Owner',
      [EntityType.Tenant]: 'Tenant',      
      [EntityType.Vendor]: 'Vendor'
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

  mapReservations(reservations: ReservationResponse[], contacts?: ContactResponse[], properties?: PropertyResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationResponse) => {
      let contactName = '';
      if (o.clientId && contacts) {
        const contact = contacts.find(c => c.contactId === o.clientId);
        if (contact) {
          contactName = contact.firstName + ' ' + contact.lastName;
        } else {
          // If contact not found, use tenantName as fallback
          contactName = o.tenantName || '';
        }
      } else if (o.tenantName) {
        contactName = o.tenantName;
      }

      // Get propertyCode from reservation response, or look it up from properties if missing
      let propertyCode = o.propertyCode || '';
      if (!propertyCode && o.propertyId && properties) {
        const property = properties.find(p => p.propertyId === o.propertyId);
        if (property) {
          propertyCode = property.propertyCode || '';
        }
      }

      return {
        reservationId: o.reservationId,
        propertyCode: propertyCode, 
        contactId: o.clientId || '',
        contactName: contactName || '',
        arrivalDate: o.arrivalDate,
        departureDate: o.departureDate,
        reservationStatus: this.formatReservationStatus(o.reservationStatusId),
        isActive: o.isActive
      };
    });
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

  mapAgents(agents: AgentResponse[]): AgentListDisplay[] {
    return agents.map<AgentListDisplay>((o: AgentResponse) => ({
      agentId: o.agentId,
      agentCode: o.agentCode,
      description: o.description,
      isActive: o.isActive
    }));
  }

  mapAreas(areas: AreaResponse[]): AreaListDisplay[] {
    return areas.map<AreaListDisplay>((o: AreaResponse) => ({
      areaId: o.areaId,
      areaCode: o.areaCode,
      description: o.description,
      isActive: o.isActive
    }));
  }

  mapBuildings(buildings: BuildingResponse[]): BuildingListDisplay[] {
    return buildings.map<BuildingListDisplay>((o: BuildingResponse) => ({
      buildingId: o.buildingId,
      buildingCode: o.buildingCode,
      description: o.description,
      isActive: o.isActive
    }));
  }

  mapFranchises(franchises: FranchiseResponse[]): FranchiseListDisplay[] {
    return franchises.map<FranchiseListDisplay>((o: FranchiseResponse) => ({
      franchiseId: o.franchiseId,
      franchiseCode: o.franchiseCode,
      description: o.description,
      isActive: o.isActive
    }));
  }

  mapRegions(regions: RegionResponse[]): RegionListDisplay[] {
    return regions.map<RegionListDisplay>((o: RegionResponse) => ({
      regionId: o.regionId,
      regionCode: o.regionCode,
      description: o.description,
      isActive: o.isActive
    }));
  }

  mapColors(colors: ColorResponse[]): ColorListDisplay[] {
    return colors.map<ColorListDisplay>((o: ColorResponse) => ({
      colorId: o.colorId,
      reservationStatusId: o.reservationStatusId,
      reservationStatus: this.formatReservationStatus(o.reservationStatusId),
      color: o.color
    }));
  }
}
