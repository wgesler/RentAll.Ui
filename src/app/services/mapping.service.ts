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
import { FormatterService } from './formatter-service';
import { BoardProperty } from '../authenticated/reservation/models/reservation-board-model';
import { PropertyStatus } from '../authenticated/property/models/property-enums';
import { DocumentResponse, DocumentListDisplay } from '../authenticated/documents/models/document.model';
import { DocumentType } from '../authenticated/documents/models/document.enum';

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

  mapCompanies(companies: CompanyResponse[], contacts?: ContactResponse[], offices?: OfficeResponse[]): CompanyListDisplay[] {
    return companies.map<CompanyListDisplay>((o: CompanyResponse) => {
      let office = '';
      if (o.officeId && offices) {
        const officeObj = offices.find(off => off.officeId === o.officeId);
        office = officeObj?.name || '';
      }
      return {
        companyId: o.companyId,
        companyCode: o.companyCode,
        office: office || undefined,
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

  mapVendors(vendors: VendorResponse[], offices?: OfficeResponse[]): VendorListDisplay[] {
    return vendors.map<VendorListDisplay>((o: VendorResponse) => {
      let office = '';
      if (o.officeId && offices) {
        const officeObj = offices.find(off => off.officeId === o.officeId);
        office = officeObj?.name || '';
      }
      return {
        vendorId: o.vendorId,
        vendorCode: o.vendorCode,
        office: office || undefined,
        name: o.name,
        city: o.city,
        state: o.state,
        phone: this.formatPhoneNumber(o.phone),
        website: o.website,
        isActive: o.isActive,
      };
    });
  }

  mapContacts(contacts: ContactResponse[], offices?: OfficeResponse[]): ContactListDisplay[] {
    return contacts.map<ContactListDisplay>((o: ContactResponse) => {
      let office = '';
      if (o.officeId && offices) {
        const officeObj = offices.find(off => off.officeId === o.officeId);
        office = officeObj?.name || '';
      }
      return {
        contactId: o.contactId,
        contactCode: o.contactCode,
        office: office || undefined,
        fullName: o.firstName + ' ' + o.lastName,
        contactType: this.formatContactType(o.entityTypeId),
        phone: this.formatPhoneNumber(o.phone),
        email: o.email,
        isActive: typeof o.isActive === 'number' ? o.isActive === 1 : Boolean(o.isActive)
      };
    });
  }

  mapOfficesToDropdown(offices: OfficeResponse[]): { value: number, name: string }[] {
    return offices
      .filter(office => office.isActive)
      .map(office => ({
        value: office.officeId,
        name: office.name
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
      isActive: o.isActive,
      // Configuration display fields
      maintenanceEmail: o.maintenanceEmail,
      afterHoursPhone: this.formatPhoneNumber(o.afterHoursPhone),
      defaultDeposit: o.defaultDeposit || 0,
      defaultSdw: o.defaultSdw || 0
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

  mapProperties(properties: PropertyResponse[], contacts?: ContactResponse[], offices?: OfficeResponse[]): PropertyListDisplay[] {
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
      let office = '';
      if (o.officeId && offices) {
        const officeObj = offices.find(off => off.officeId === o.officeId);
        office = officeObj?.name || '';
      }
      // Use address1 as name since API doesn't have a name field
      const propertyName = o.address1 || o.propertyCode || '';
      return {
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        office: office || undefined,
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

  mapReservations(reservations: ReservationResponse[], contacts?: ContactResponse[], properties?: PropertyResponse[], companies?: CompanyResponse[], offices?: OfficeResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationResponse) => {
      let contactName = '';
      let companyName = 'N/A';
      if (o.contactId && contacts) {
        const contact = contacts.find(c => c.contactId === o.contactId);
        if (contact) {
          contactName = contact.firstName + ' ' + contact.lastName;
          if(contact.entityTypeId == EntityType.Company && companies) {
            const company = companies.find(comp => comp.companyId === contact.entityId);
            if (company) {
              companyName = company.name;
            }
          }
        } else {
          // If contact not found, use tenantName as fallback
          contactName = o.tenantName || '';
        }
      } else if (o.tenantName) {
        contactName = o.tenantName;
      }

      // Get propertyCode by looking it up from properties using propertyId
      let propertyCode = '';
      let officeId: number | undefined;
      if (o.propertyId && properties) {
        const property = properties.find(p => p.propertyId === o.propertyId);
        if (property) {
          propertyCode = property.propertyCode || '';
          officeId = property.officeId;
        }
      }

      // Get office name from property's officeId
      let office = '';
      if (officeId && offices) {
        const officeObj = offices.find(off => off.officeId === officeId);
        office = officeObj?.name || '';
      }

      return {
        reservationId: o.reservationId,
        reservationCode: o.reservationCode,
        office: office || undefined,
        propertyCode: propertyCode, 
        contactId: o.contactId || '',
        contactName: contactName || '',
        companyName: companyName || '',
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

  // Reservation Board Mapping Functions
  createContactMap(contacts: ContactResponse[]): Map<string, ContactResponse> {
    const contactMap = new Map<string, ContactResponse>();
    contacts.forEach(contact => {
      contactMap.set(contact.contactId, contact);
    });
    return contactMap;
  }

  createColorMap(colors: ColorResponse[]): Map<number, string> {
    const colorMap = new Map<number, string>();
    colors.forEach(color => {
      colorMap.set(color.reservationStatusId, color.color);
    });
    return colorMap;
  }

  getPropertyStatusLetter(statusId: number): string {
    const statusMap: { [key: number]: string } = {
      [PropertyStatus.NotProcessed]: 'N',
      [PropertyStatus.Cleaned]: 'C',
      [PropertyStatus.Inspected]: 'I',
      [PropertyStatus.Ready]: 'R',
      [PropertyStatus.Occupied]: 'O',
      [PropertyStatus.Maintenance]: 'M',
      [PropertyStatus.Offline]: 'F'
    };
    return statusMap[statusId] || '?';
  }

  getMonthlyRateFromReservation(propertyId: string, reservations: ReservationResponse[]): number | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find reservations for this property that are active today
    const activeReservations = reservations.filter(r => {
      if (r.propertyId !== propertyId || !r.arrivalDate || !r.departureDate) {
        return false;
      }
      const arrival = new Date(r.arrivalDate);
      arrival.setHours(0, 0, 0, 0);
      const departure = new Date(r.departureDate);
      departure.setHours(0, 0, 0, 0);
      return today >= arrival && today <= departure;
    });

    // If we have active reservations, use the first one (or most recent by arrival date)
    if (activeReservations.length > 0) {
      // Sort by arrival date descending to get the most recent
      activeReservations.sort((a, b) => {
        if (!a.arrivalDate || !b.arrivalDate) return 0;
        return new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime();
      });
      return activeReservations[0].billingRate;
    }

    // If no active reservation today, look for the most recent reservation for this property
    const propertyReservations = reservations.filter(r => r.propertyId === propertyId);
    if (propertyReservations.length > 0) {
      // Sort by arrival date descending to get the most recent
      propertyReservations.sort((a, b) => {
        if (!a.arrivalDate || !b.arrivalDate) return 0;
        return new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime();
      });
      return propertyReservations[0].billingRate;
    }

    return null;
  }

  mapPropertiesToBoardProperties(properties: PropertyResponse[], reservations: ReservationResponse[]): BoardProperty[] {
    return (properties || []).map(p => {
      const reservationMonthlyRate = this.getMonthlyRateFromReservation(p.propertyId, reservations);
      return {
        propertyId: p.propertyId,
        propertyCode: p.propertyCode,
        address: `${p.address1}${p.suite ? ' ' + p.suite : ''}`.trim(),
        monthlyRate: reservationMonthlyRate ?? p.monthlyRate ?? 0,
        bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
        statusLetter: this.getPropertyStatusLetter(p.propertyStatusId)
      };
    });
  }

  mapDocuments(documents: DocumentResponse[], offices?: OfficeResponse[]): DocumentListDisplay[] {
    return documents.map<DocumentListDisplay>((doc: DocumentResponse) => {
      // Convert documentTypeId (number) to DocumentType enum, then get the user-friendly label
      const documentType = doc.documentTypeId as DocumentType;
      const documentTypeName = this.getDocumentTypeLabel(documentType);
      const formattedCreatedOn = this.formatter.formatDateTimeString(doc.createdOn);
      const canView = this.isViewableInBrowser(doc.contentType, doc.fileExtension);
      
      // Find office name from officeId
      let office = '';
      if (doc.officeId && offices) {
        const officeObj = offices.find(o => o.officeId === doc.officeId);
        office = officeObj?.name || '';
      }
      
      return {
        ...doc,
        documentTypeName: documentTypeName,
        createdOn: formattedCreatedOn,
        canView: canView,
        office: office || undefined
      };
    });
  }

  // Helper method to get DocumentType label as string for display
  getDocumentTypeLabel(documentType: DocumentType): string {
    const typeLabels: { [key in DocumentType]: string } = {
      [DocumentType.Other]: 'Other',
      [DocumentType.PropertyLetter]: 'Welcome Letter',
      [DocumentType.ReservationLease]: 'Reservation Lease'
    };
    return typeLabels[documentType] || DocumentType[documentType] || 'Other';
  }

  // Check if document type can be viewed directly in browser
  isViewableInBrowser(contentType: string, fileExtension: string): boolean {
    if (!contentType && !fileExtension) {
      return false;
    }

    const ext = fileExtension?.toLowerCase() || '';
    const mimeType = contentType?.toLowerCase() || '';

    // PDFs - always viewable
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return true;
    }

    // Images - viewable
    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return true;
    }

    // HTML - viewable
    if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') {
      return true;
    }

    // Text files - viewable
    if (mimeType.startsWith('text/') || ext === 'txt') {
      return true;
    }

    // Office documents and other binary formats - not viewable in browser
    return false;
  }
}
