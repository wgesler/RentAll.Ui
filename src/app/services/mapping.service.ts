import { Injectable } from '@angular/core';
import { TransactionType, getTransactionTypeLabel } from '../authenticated/accounting/models/accounting-enum';
import { CostCodesListDisplay, CostCodesResponse } from '../authenticated/accounting/models/cost-codes.model';
import { LedgerLineListDisplay, LedgerLineResponse } from '../authenticated/accounting/models/invoice.model';
import { CompanyListDisplay, CompanyResponse } from '../authenticated/companies/models/company.model';
import { VendorListDisplay, VendorResponse } from '../authenticated/companies/models/vendor.model';
import { getEntityType } from '../authenticated/contacts/models/contact-enum';
import { ContactListDisplay, ContactResponse } from '../authenticated/contacts/models/contact.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../authenticated/documents/models/document.model';
import { EmailListDisplay, EmailResponse } from '../authenticated/email/models/email.model';
import { EmailHtmlResponse } from '../authenticated/email/models/email-html.model';
import { InventoryDisplayList, InventoryResponse } from '../authenticated/maintenance/models/inventory.model';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../authenticated/organizations/models/accounting-office.model';
import { AgentListDisplay, AgentResponse } from '../authenticated/organizations/models/agent.model';
import { AreaListDisplay, AreaResponse } from '../authenticated/organizations/models/area.model';
import { BuildingListDisplay, BuildingResponse } from '../authenticated/organizations/models/building.model';
import { ColorListDisplay, ColorResponse } from '../authenticated/organizations/models/color.model';
import { OfficeListDisplay, OfficeResponse } from '../authenticated/organizations/models/office.model';
import { OrganizationListDisplay, OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { RegionListDisplay, RegionResponse } from '../authenticated/organizations/models/region.model';
import { getPropertyStatusLetter } from '../authenticated/properties/models/property-enums';
import { PropertyListDisplay, PropertyListResponse } from '../authenticated/properties/models/property.model';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getReservationStatus } from '../authenticated/reservations/models/reservation-enum';
import { ReservationListDisplay, ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import { FormatterService } from './formatter-service';

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
      // Treat as international if isInternational flag is true OR if address2 has value and city is null/empty
      const isInternational = Boolean(o.isInternational) || (Boolean(o.address2) && (!o.city || o.city.trim() === ''));
      // For international addresses, use address2 for city field; otherwise use city
      const cityValue = isInternational ? (o.address2 || '') : (o.city || '');
      
      return {
        companyId: o.companyId,
        companyCode: o.companyCode,
        officeId: o.officeId,
        officeName: o.officeName,
        name: o.name,
        city: cityValue,
        state: o.state,
        phone: this.formatter.phoneNumber(o.phone),
        website: o.website,
        isInternational: isInternational,
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
        isInternational: o.isInternational || false,
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

  mapEmailHtml(emailHtml: any): EmailHtmlResponse {
    return {
      organizationId: emailHtml?.organizationId ?? emailHtml?.OrganizationId ?? '',
      welcomeLetter: emailHtml?.welcomeLetter ?? emailHtml?.WelcomeLetter ?? '',
      corporateLetter: emailHtml?.corporateLetter ?? emailHtml?.CorporateLetter ?? '',
      lease: emailHtml?.lease ?? emailHtml?.Lease ?? '',
      invoice: emailHtml?.invoice ?? emailHtml?.Invoice ?? '',
      letterSubject: emailHtml?.letterSubject ?? emailHtml?.LetterSubject ?? '',
      leaseSubject: emailHtml?.leaseSubject ?? emailHtml?.LeaseSubject ?? '',
      invoiceSubject: emailHtml?.invoiceSubject ?? emailHtml?.InvoiceSubject ?? '',
      createdOn: emailHtml?.createdOn ?? emailHtml?.CreatedOn ?? '',
      modifiedOn: emailHtml?.modifiedOn ?? emailHtml?.ModifiedOn
    };
  }

  mapEmailHtmls(emailHtmlList: any): EmailHtmlResponse[] {
    if (!emailHtmlList) {
      return [];
    }

    if (Array.isArray(emailHtmlList)) {
      return emailHtmlList.map((item: any) => this.mapEmailHtml(item));
    }

    // Some endpoints can return a single object instead of an array.
    return [this.mapEmailHtml(emailHtmlList)];
  }

  mapEmailListDisplays(emails: any): EmailListDisplay[] {
    if (!emails) {
      return [];
    }

    const emailArray = Array.isArray(emails) ? emails : [emails];
    return emailArray.map<EmailListDisplay>((email: EmailResponse | any) => ({
      // Treat attachmentPath as the linked document identifier/path.
      // Rows without attachments cannot open a document preview.
      emailId: email?.emailId ?? email?.EmailId ?? '',
      officeId: String(email?.officeId ?? email?.OfficeId ?? ''),
      propertyId: email?.propertyId ?? email?.PropertyId ?? undefined,
      reservationId: email?.reservationId ?? email?.ReservationId ?? undefined,
      reservationCode: email?.reservationCode ?? email?.ReservationCode ?? '',
      officeName: email?.officeName ?? email?.OfficeName ?? '',
      toEmail: this.getPrimaryRecipientEmail(email?.toRecipients ?? email?.ToRecipients, email?.toEmail ?? email?.ToEmail),
      toName: this.getPrimaryRecipientName(email?.toRecipients ?? email?.ToRecipients, email?.toName ?? email?.ToName),
      fromEmail: (email?.fromRecipient ?? email?.FromRecipient)?.email ?? email?.fromEmail ?? email?.FromEmail ?? '',
      fromName: (email?.fromRecipient ?? email?.FromRecipient)?.name ?? email?.fromName ?? email?.FromName ?? '',
      subject: email?.subject ?? email?.Subject ?? '',
      attachmentName: email?.attachmentName ?? email?.AttachmentName ?? '',
      attachmentPath: email?.attachmentPath ?? email?.AttachmentPath ?? '',
      documentId: email?.documentId ?? email?.DocumentId ?? email?.attachmentDocumentId ?? email?.AttachmentDocumentId ?? undefined,
      emailTypeId: Number(email?.emailTypeId ?? email?.EmailTypeId ?? 0),
      canView: Boolean(
        email?.documentId ??
        email?.DocumentId ??
        email?.attachmentDocumentId ??
        email?.AttachmentDocumentId ??
        email?.attachmentPath ??
        email?.AttachmentPath
      ),
      createdOn: this.formatter.formatDateTimeString(email?.createdOn ?? email?.CreatedOn) || (email?.createdOn ?? email?.CreatedOn ?? '')
    }));
  }

  private getPrimaryRecipientEmail(recipients: any, fallback: string = ''): string {
    if (Array.isArray(recipients) && recipients.length > 0) {
      const first = recipients[0];
      return first?.email ?? first?.Email ?? fallback ?? '';
    }

    return fallback ?? '';
  }

  private getPrimaryRecipientName(recipients: any, fallback: string = ''): string {
    if (Array.isArray(recipients) && recipients.length > 0) {
      const first = recipients[0];
      return first?.name ?? first?.Name ?? fallback ?? '';
    }

    return fallback ?? '';
  }

  mapEmailOfficeNames(emails: EmailListDisplay[], offices: OfficeResponse[]): EmailListDisplay[] {
    if (!emails || emails.length === 0 || !offices || offices.length === 0) {
      return emails || [];
    }

    const officeNameById = new Map<string, string>(
      offices.map(office => [office.officeId.toString(), office.name])
    );

    return emails.map(email => ({
      ...email,
      officeName: officeNameById.get(email.officeId) || email.officeName || ''
    }));
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

  mapInventories(inventories: InventoryResponse[]): InventoryDisplayList[] {
    return inventories.map<InventoryDisplayList>((inventory: InventoryResponse) => {
      return {
        inventoryId: inventory.inventoryId,
        officeId: inventory.officeId,
        propertyId: inventory.propertyId,
        isActive: inventory.isActive,
        modifiedOn: inventory.modifiedOn,
        modifiedBy: inventory.modifiedBy
      };
    });
  }

  mapOffices(offices: OfficeResponse[]): OfficeListDisplay[] {
    return offices.map<OfficeListDisplay>((o: OfficeResponse) => {
      const isInternational = o.isInternational || false;
      const cityValue = isInternational ? o.address2 : o.city;
      const addressValue = cityValue && o.state ? cityValue + ',  ' + o.state : (cityValue || o.state || '');
      return {
        officeId: o.officeId,
        officeCode: o.officeCode,
        name: o.name,
        address: addressValue,
        address1: o.address1,
        address2: o.address2,
        suite: o.suite,
        city: cityValue,
        state: o.state,
        zip: o.zip,
        phone: this.formatter.phoneNumber(o.phone),
        fax: this.formatter.phoneNumber(o.fax),
        website: o.website,
        isInternational: isInternational,
        isActive: o.isActive,
        // Configuration display fields
        maintenanceEmail: o.maintenanceEmail,
        afterHoursPhone: this.formatter.phoneNumber(o.afterHoursPhone),
        defaultDeposit: o.defaultDeposit || 0,
        defaultSdw: o.defaultSdw || 0
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

  mapAccountingOffices(offices: AccountingOfficeResponse[], officeList?: OfficeResponse[]): AccountingOfficeListDisplay[] {
    return offices.map<AccountingOfficeListDisplay>((o: AccountingOfficeResponse) => {
      // Find office name by officeId
      const office = officeList?.find(off => off.officeId === o.officeId);
      const officeName = office?.name || '';
      return {
        officeId: o.officeId,
        officeName: officeName,
        name: o.name,
        address: o.city + ', ' + o.state,
        phone: this.formatter.phoneNumber(o.phone),
        fax: this.formatter.phoneNumber(o.fax),
        bankName: o.bankName,
        email: o.email,
        isActive: o.isActive
      };
    });
  }

  mapOrganizations(organizations: OrganizationResponse[]): OrganizationListDisplay[] {
    return organizations.map<OrganizationListDisplay>((org: OrganizationResponse) => {
      const isInternational = org.isInternational || false;
      return {
        organizationId: org.organizationId,
        organizationCode: org.organizationCode,
        name: org.name,
        address1: org.address1,
        address2: org.address2,
        suite: org.suite,
        city: isInternational ? org.address2 : org.city,
        state: org.state,
        zip: org.zip,
        phone: this.formatter.phoneNumber(org.phone),
        website: org.website,
        isInternational: isInternational,
        isActive: org.isActive
      };
    });
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
    return (properties || []).map(p => ({
      propertyId: p.propertyId,
      propertyCode: p.propertyCode,
      address: p.shortAddress,
      monthlyRate: p.monthlyRate,
      bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
      statusLetter: getPropertyStatusLetter(p.propertyStatusId),
      availableFrom: p.availableFrom,
      availableUntil: p.availableUntil
    }));
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
        agentId: o.agentId ?? null,
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
      const isInternational = o.isInternational || false;
      return {
        vendorId: o.vendorId,
        vendorCode: o.vendorCode,
        officeId: o.officeId,
        officeName: o.officeName,
        name: o.name,
        city: isInternational ? o.address2 : o.city,
        state: o.state,
        phone: this.formatter.phoneNumber(o.phone),
        website: o.website,
        isInternational: isInternational,
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
