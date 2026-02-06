import { Injectable } from '@angular/core';
import { CompanyResponse, CompanyListDisplay } from '../authenticated/companies/models/company.model';
import { VendorResponse, VendorListDisplay } from '../authenticated/companies/models/vendor.model';
import { PropertyListDisplay, PropertyListResponse } from '../authenticated/properties/models/property.model';
import { ContactResponse, ContactListDisplay } from '../authenticated/clients/models/contact.model';
import { getEntityType } from '../authenticated/clients/models/contact-enum';
import { ReservationListResponse, ReservationListDisplay } from '../authenticated/reservations/models/reservation-model';
import { getReservationStatus } from '../authenticated/reservations/models/reservation-enum';
import { AgentResponse, AgentListDisplay } from '../authenticated/organizations/models/agent.model';
import { AreaResponse, AreaListDisplay } from '../authenticated/organizations/models/area.model';
import { BuildingResponse, BuildingListDisplay } from '../authenticated/organizations/models/building.model';
import { OfficeResponse, OfficeListDisplay } from '../authenticated/organizations/models/office.model';
import { RegionResponse, RegionListDisplay } from '../authenticated/organizations/models/region.model';
import { ColorResponse, ColorListDisplay } from '../authenticated/organizations/models/color.model';
import { OrganizationResponse, OrganizationListDisplay } from '../authenticated/organizations/models/organization.model';
import { FormatterService } from './formatter-service';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getPropertyStatusLetter } from '../authenticated/properties/models/property-enums';
import { DocumentResponse, DocumentListDisplay } from '../authenticated/documents/models/document.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { LedgerLineResponse, LedgerLineListDisplay } from '../authenticated/accounting/models/invoice.model';
import { getTransactionTypeLabel, TransactionType } from '../authenticated/accounting/models/accounting-enum';
import { CostCodesResponse, CostCodesListDisplay } from '../authenticated/accounting/models/cost-codes.model';
import { AccountingOfficeResponse, AccountingOfficeListDisplay } from '../authenticated/organizations/models/accounting-office.model';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(private formatter: FormatterService) { }
  
  //#region Map Functions (Alphabetical)
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
      reservationStatus: getReservationStatus(o.reservationStatusId),
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
        phone: this.formatter.phoneNumber(o.phone),
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
        contactType: getEntityType(o.entityTypeId),
        entityTypeId: o.entityTypeId, // Include entityTypeId for filtering
        phone: this.formatter.phoneNumber(o.phone),
        email: o.email,
        isActive: typeof o.isActive === 'number' ? o.isActive === 1 : Boolean(o.isActive)
      };
    });
  }

  mapCostCodes(costCodes: CostCodesResponse[], offices?: any[], transactionTypes?: { value: number, label: string }[]): CostCodesListDisplay[] {
    return costCodes.map<CostCodesListDisplay>((costCode: CostCodesResponse) => {
      // Find office name by officeId
      const office = offices?.find(o => o.officeId === costCode.officeId);
      const officeName = office?.name || '';
      // Set row color to green (lighter version of #4caf50) if transactionTypeId >= StartOfCredits (credit/payment types)
      const rowColor = costCode.transactionTypeId === TransactionType.Payment ? '#E8F5E9' : undefined;
      return {
        costCodeId: costCode.costCodeId,
        officeId: costCode.officeId,
        officeName: officeName,
        costCode: costCode.costCode || '',
        transactionTypeId: costCode.transactionTypeId,
        transactionType: getTransactionTypeLabel(costCode.transactionTypeId, transactionTypes),
        description: costCode.description || '',
        isActive: costCode.isActive ?? true, // Default to true if undefined
        rowColor: rowColor
      };
    });
  }

  mapDocuments(documents: DocumentResponse[]): DocumentListDisplay[] {
    return documents.map<DocumentListDisplay>((doc: DocumentResponse) => {
      // Convert documentTypeId (number) to DocumentType enum, then get the user-friendly label
      const documentType = doc.documentTypeId as DocumentType;
      const documentTypeName = getDocumentTypeLabel(documentType);
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

  mapLedgerLines(ledgerLines: LedgerLineResponse[], costCodes?: CostCodesResponse[], transactionTypes?: { value: number, label: string }[]): LedgerLineListDisplay[] {
    return ledgerLines.map<LedgerLineListDisplay>((line: LedgerLineResponse) => {
      const costCodeId = line.costCodeId || null;
      let matchingCostCode: CostCodesResponse | undefined = undefined;
      let costCode: string | null = null;
      let transactionTypeId: number | undefined = undefined;
      
      if (costCodeId && costCodes && costCodes.length > 0) {
        // Find cost code by costCodeId (costCodes array is already filtered by office if needed)
        matchingCostCode = costCodes.find(c => c.costCodeId === costCodeId);
        
        if (matchingCostCode) {
          costCode = matchingCostCode.costCode || null;
          transactionTypeId = matchingCostCode.transactionTypeId;
        }
      }
      
      // Translate transactionTypeId from CostCode to transactionType label for display
      const transactionTypeLabel = transactionTypeId !== undefined && transactionTypeId !== null 
        ? getTransactionTypeLabel(transactionTypeId, transactionTypes)
        : '';
      
      // Set row color to green (lighter version of #4caf50) if transactionTypeId >= StartOfCredits (credit/payment types)
      const rowColor = transactionTypeId !== undefined && transactionTypeId !== null && transactionTypeId === TransactionType.Payment ? '#E8F5E9' : undefined;
      
      const mapped: LedgerLineListDisplay & { transactionTypeId?: number } = {
        ledgerLineId: line.ledgerLineId,
        lineNumber: line.lineNumber,
        costCodeId: costCodeId, // From invoice.ledgerLine.costCodeId
        costCode: matchingCostCode 
          ? `${matchingCostCode.costCode}: ${matchingCostCode.description}` 
          : (costCodeId ? `Cost Code ${costCodeId}` : ''),
        transactionType: transactionTypeLabel, // Translated from CostCode.transactionTypeId
        description: line.description || '',
        amount: line.amount,
        isNew: false, // Existing lines are not new
        rowColor: rowColor
      };
      
      // Preserve transactionTypeId from CostCode for reference
      mapped.transactionTypeId = transactionTypeId;
      
      return mapped;
    });
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
      phone: this.formatter.phoneNumber(o.phone),
      fax: this.formatter.phoneNumber(o.fax),
      website: o.website,
      isActive: o.isActive,
      // Configuration display fields
      maintenanceEmail: o.maintenanceEmail,
      afterHoursPhone: this.formatter.phoneNumber(o.afterHoursPhone),
      defaultDeposit: o.defaultDeposit || 0,
      defaultSdw: o.defaultSdw || 0
    }));
  }

  mapOfficesToDropdown(offices: OfficeResponse[]): { value: number, name: string }[] {
    return offices
      .filter(office => office.isActive)
      .map(office => ({
        value: office.officeId,
        name: office.name
      }));
  }

  mapAccountingOffices(offices: AccountingOfficeResponse[]): AccountingOfficeListDisplay[] {
    return offices.map<AccountingOfficeListDisplay>((o: AccountingOfficeResponse) => ({
      officeId: o.officeId,
      name: o.name,
      address: o.city + ', ' + o.state,
      phone: this.formatter.phoneNumber(o.phone),
      fax: this.formatter.phoneNumber(o.fax),
      bankName: o.bankName,
      email: o.email,
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
      phone: this.formatter.phoneNumber(org.phone),
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

  mapPropertiesToBoardProperties(properties: PropertyListResponse[], reservations: ReservationListResponse[]): BoardProperty[] {
    return (properties || []).map(p => {
      return {
        propertyId: p.propertyId,
        propertyCode: p.propertyCode,
        address: p.shortAddress,
        monthlyRate: p.monthlyRate,
        bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
        statusLetter: getPropertyStatusLetter(p.propertyStatusId)
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
        creditDue: o.creditDue,
        hasCredit: o.creditDue > 0,
        reservationStatusId: o.reservationStatusId,
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
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
        phone: this.formatter.phoneNumber(o.phone),
        website: o.website,
        isActive: o.isActive,
      };
    });
  }
  //#endregion

  //#region Helper/Format Functions
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
  //#endregion

  //#region Reservation Board Mapping Functions
  createColorMap(colors: ColorResponse[]): Map<number, string> {
    const colorMap = new Map<number, string>();
    colors.forEach(color => {
      colorMap.set(color.reservationStatusId, color.color);
    });
    return colorMap;
  }
  //#endregion
}
