import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/company/models/company.model';
import { VendorResponse, VendorListDisplay } from '../authenticated/vendor/models/vendor.model';
import { PropertyListDisplay, PropertyListResponse } from '../authenticated/property/models/property.model';
import { ContactResponse, ContactListDisplay } from '../authenticated/contact/models/contact.model';
import { EntityType } from '../authenticated/contact/models/contact-type';
import { UserResponse, UserListDisplay } from '../authenticated/user/models/user.model';
import { ReservationListResponse, ReservationListDisplay } from '../authenticated/reservation/models/reservation-model';
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
import { LedgerLineResponse, LedgerLineListDisplay } from '../authenticated/accounting/models/invoice.model';
import { TransactionType, AccountingType } from '../authenticated/accounting/models/accounting-enum';
import { CostCodesResponse, CostCodesListDisplay } from '../authenticated/accounting/models/cost-codes.model';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(private formatter: FormatterService) { }
  
  mapAgents(agents: AgentResponse[]): AgentListDisplay[] {
    return agents.map<AgentListDisplay>((o: AgentResponse) => {
      return {
        agentId: o.agentId,
        agentCode: o.agentCode,
        officeId: o.officeId,
        officeName: o.officeName,
        name: o.name,
        isActive: o.isActive
      };
    });
  }

  mapAreas(areas: AreaResponse[]): AreaListDisplay[] {
    return areas.map<AreaListDisplay>((o: AreaResponse) => {
      return {
        areaId: o.areaId,
        areaCode: o.areaCode,
        officeId: o.officeId,
        officeName: o.officeName,
        name: o.name,
        description: o.description,
        isActive: o.isActive
      };
    });
  }

  mapBuildings(buildings: BuildingResponse[]): BuildingListDisplay[] {
    return buildings.map<BuildingListDisplay>((o: BuildingResponse) => {
      return {
        buildingId: o.buildingId,
        buildingCode: o.buildingCode,
        name: o.name,
        description: o.description,
        officeId: o.officeId,
        officeName: o.officeName,
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
        officeId: o.officeId,
        officeName: o.officeName,
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
        officeId: o.officeId,
        officeName: o.officeName,
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
    return contacts.map<ContactListDisplay>((o: ContactResponse) => {
      return {
        contactId: o.contactId,
        contactCode: o.contactCode,
        officeId: o.officeId,
        officeName: o.officeName,
        fullName: o.fullName,
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
      address: o.city + ',  ' + o.state, 
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

  mapProperties(properties: PropertyListResponse[]): PropertyListDisplay[] {
    return properties.map<PropertyListDisplay>((o: PropertyListResponse) => {
      return {
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        shortAddress: o.shortAddress,
        officeId: o.officeId,
        officeName: o.officeName,
        owner1Id: o.owner1Id,
        ownerName: o.ownerName,
        bedrooms: o.bedrooms,
        bathrooms: o.bathrooms,
        accomodates: o.accomodates,
        squareFeet: o.squareFeet,
        monthlyRate: o.monthlyRate,
        dailyRate: o.dailyRate,
        departureFee: o.departureFee,
        petFee: o.petFee,
        maidServiceFee: o.maidServiceFee,
        propertyStatusId: o.propertyStatusId,
        isActive: o.isActive, 
      };
    });
  }

  mapRegions(regions: RegionResponse[]): RegionListDisplay[] {
    return regions.map<RegionListDisplay>((o: RegionResponse) => {
      return {
        regionId: o.regionId,
        regionCode: o.regionCode,
        officeId: o.officeId,
        officeName: o.officeName,
        name: o.name,
        description: o.description,
        isActive: o.isActive
      };
    });
  }

  // Map ReservationListResponse[] (full detail) to ReservationListDisplay
  mapReservations(reservations: ReservationListResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationListResponse) => {
      return {
        reservationId: o.reservationId,
        reservationCode: o.reservationCode,
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        officeId: o.officeId,
        officeName: o.officeName,
        office: o.officeName || undefined,
        contactId: o.contactId || '',
        contactName: o.contactName,
        tenantName: o.tenantName,
        companyName: o.companyName,
        agentCode: o.agentCode,
        monthlyRate: o.monthlyRate,
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        reservationStatusId: o.reservationStatusId,
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
      };
    });
  }

  // Map ReservationListResponse[] (list view) to ReservationListDisplay
  mapReservationList(reservations: ReservationListResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationListResponse) => {
      return {
        reservationId: o.reservationId,
        reservationCode: o.reservationCode,
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        officeId: o.officeId,
        officeName: o.officeName,
        office: o.officeName || undefined,
        contactId: o.contactId,
        contactName: o.contactName,
        tenantName: o.tenantName,
        companyName: o.companyName || 'N/A',
        agentCode: o.agentCode,
        monthlyRate: o.monthlyRate,
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        reservationStatusId: o.reservationStatusId,
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
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

  mapPropertiesToBoardProperties(properties: PropertyListResponse[], reservations: ReservationListResponse[]): BoardProperty[] {
    return (properties || []).map(p => {
      return {
        propertyId: p.propertyId,
        propertyCode: p.propertyCode,
        address: p.shortAddress,
        monthlyRate: p.monthlyRate,
        bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
        statusLetter: this.getPropertyStatusLetter(p.propertyStatusId)
      };
    });
  }

  mapDocuments(documents: DocumentResponse[]): DocumentListDisplay[] {
    return documents.map<DocumentListDisplay>((doc: DocumentResponse) => {
      // Convert documentTypeId (number) to DocumentType enum, then get the user-friendly label
      const documentType = doc.documentTypeId as DocumentType;
      const documentTypeName = this.getDocumentTypeLabel(documentType);
      const formattedCreatedOn = this.formatter.formatDateTimeString(doc.createdOn);
      const canView = this.isViewableInBrowser(doc.contentType, doc.fileExtension);
      
      return {
        ...doc,
        documentTypeName: documentTypeName,
        createdOn: formattedCreatedOn,
        canView: canView,
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

  getTransactionTypeLabel(transactionType: number): string {
    const types = ['Debit', 'Credit', 'Payment', 'Refund', 'Charge', 'Deposit', 'Adjustment'];
    return types[transactionType] || 'Unknown';
  }

  getAccountTypeLabel(accountType: number): string {
    const types = [
      'Bank',
      'Accounts Receivable',
      'Other Current Asset',
      'Fixed Asset',
      'Accounts Payable',
      'Credit Card',
      'Other Current Liability',
      'Long Term Liability',
      'Equity',
      'Income',
      'Cost of Goods Sold',
      'Expense'
    ];
    return types[accountType] || 'Unknown';
  }

  mapCostCodes(costCodes: CostCodesResponse[], offices?: any[]): CostCodesListDisplay[] {
    return costCodes.map<CostCodesListDisplay>((costCode: CostCodesResponse) => {
      // Find office name by officeId
      const office = offices?.find(o => o.officeId === costCode.officeId);
      const officeName = office?.name || '';
      return {
        costCodeId: costCode.costCodeId,
        officeId: costCode.officeId,
        officeName: officeName,
        costCode: costCode.costCode || '',
        transactionTypeId: costCode.transactionTypeId,
        transactionType: this.getTransactionTypeLabel(costCode.transactionTypeId),
        description: costCode.description || '',
        isActive: costCode.isActive ?? true // Default to true if undefined
      };
    });
  }

  mapLedgerLines(ledgerLines: LedgerLineResponse[], costCodes?: CostCodesResponse[], officeId?: number): LedgerLineListDisplay[] {
    console.log('mapLedgerLines called', { 
      ledgerLinesCount: ledgerLines?.length, 
      costCodesCount: costCodes?.length, 
      officeId 
    });
    
    return ledgerLines.map<LedgerLineListDisplay>((line: LedgerLineResponse) => {
      console.log('Processing ledger line:', { 
        ledgerLineId: line.ledgerLineId, 
        costCodeId: line.costCodeId, 
        transactionTypeId: line.transactionTypeId 
      });
      
      const costCodeId = line.costCodeId || null;
      let matchingCostCode: CostCodesResponse | undefined = undefined;
      let costCode: string | null = null;
      let transactionTypeId: number | undefined = undefined;
      
      if (costCodeId && costCodes && costCodes.length > 0) {
        console.log('Looking up costCodeId:', costCodeId, 'in costCodes array');
        matchingCostCode = officeId 
          ? costCodes.find(c => c.costCodeId === costCodeId && c.officeId === officeId)
          : costCodes.find(c => c.costCodeId === costCodeId);
        
        console.log('Matching CostCode found:', matchingCostCode);
        
        if (matchingCostCode) {
          costCode = matchingCostCode.costCode || null;
          transactionTypeId = matchingCostCode.transactionTypeId;
          console.log('From CostCode object:', { 
            costCode, 
            transactionTypeId 
          });
        } else {
          console.log('No matching CostCode found for costCodeId:', costCodeId);
        }
      } else {
        console.log('Cannot lookup - missing costCodeId or costCodes', { 
          costCodeId, 
          hasCostCodes: !!costCodes, 
          costCodesLength: costCodes?.length 
        });
      }
      
      // Translate transactionTypeId from CostCode to transactionType label for display
      const transactionTypeLabel = transactionTypeId !== undefined && transactionTypeId !== null 
        ? this.getTransactionTypeLabel(transactionTypeId)
        : '';
      
      console.log('Transaction type label:', transactionTypeLabel, 'from transactionTypeId:', transactionTypeId);
      
      const mapped: LedgerLineListDisplay & { transactionTypeId?: number } = {
        Id: line.ledgerLineId,
        costCodeId: costCodeId, // From invoice.ledgerLine.costCodeId
        costCode: costCode, // Display value retrieved from CostCodes
        transactionType: transactionTypeLabel, // Translated from CostCode.transactionTypeId
        description: line.description || '',
        amount: line.amount,
        isNew: false // Existing lines are not new
      };
      
      // Preserve transactionTypeId from CostCode for reference
      mapped.transactionTypeId = transactionTypeId;
      
      console.log('Mapped ledger line result:', mapped);
      
      return mapped;
    });
  }
}
