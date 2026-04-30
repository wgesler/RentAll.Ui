import { Injectable } from '@angular/core';
import { TransactionType, getTransactionTypeLabel } from '../authenticated/accounting/models/accounting-enum';
import { CostCodesListDisplay, CostCodesResponse } from '../authenticated/accounting/models/cost-codes.model';
import { LedgerLineListDisplay, LedgerLineResponse } from '../authenticated/accounting/models/invoice.model';
import { EntityType, getEntityType } from '../authenticated/contacts/models/contact-enum';
import { ContactListDisplay, ContactResponse } from '../authenticated/contacts/models/contact.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../authenticated/documents/models/document.model';
import { AlertListDisplay, AlertResponse } from '../authenticated/email/models/alert.model';
import { EmailListDisplay, EmailResponse } from '../authenticated/email/models/email.model';
import { getEmailType } from '../authenticated/email/models/email.enum';
import { EmailHtmlResponse } from '../authenticated/email/models/email-html.model';
import { MaintenanceListResponse } from '../authenticated/maintenance/models/maintenance.model';
import { InspectionDisplayList, InspectionResponse } from '../authenticated/maintenance/models/inspection.model';
import { ReceiptDisplayList, ReceiptResponse, Split } from '../authenticated/maintenance/models/receipt.model';
import { getInspectionType, getWorkOrderType } from '../authenticated/maintenance/models/maintenance-enums';
import { WorkOrderDisplayList, WorkOrderResponse } from '../authenticated/maintenance/models/work-order.model';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../authenticated/organizations/models/accounting-office.model';
import { AgentListDisplay, AgentResponse } from '../authenticated/organizations/models/agent.model';
import { AreaListDisplay, AreaResponse } from '../authenticated/organizations/models/area.model';
import { BuildingListDisplay, BuildingResponse } from '../authenticated/organizations/models/building.model';
import { ColorListDisplay, ColorResponse } from '../authenticated/organizations/models/color.model';
import { OfficeListDisplay, OfficeResponse } from '../authenticated/organizations/models/office.model';
import { OrganizationListDisplay, OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { RegionListDisplay, RegionResponse } from '../authenticated/organizations/models/region.model';
import { ManagementFeeType, PropertyType, TrashDays, effectiveBedTypeIdForPropertySlot, getBedSizeType, getPropertyStatus, getPropertyStatusLetter, getPropertyType } from '../authenticated/properties/models/property-enums';
import { PropertyBedDropdownCell, PropertyListDisplay, PropertyListResponse, PropertyResponse } from '../authenticated/properties/models/property.model';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getFrequency, getReservationStatus } from '../authenticated/reservations/models/reservation-enum';
import { ExtraFeeLineRequest, ExtraFeeLineResponse, ReservationListDisplay, ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import { MaintenanceListDisplay, PropertyMaintenance, ReservationPropertyMaintenance } from '../authenticated/shared/models/mixed-models';
import { WorkOrderAmountService } from '../authenticated/maintenance/services/work-order-amount.service';
import { FormatterService } from './formatter-service';
import { UtilityService } from './utility.service';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  constructor(
    private formatter: FormatterService,
    private utility: UtilityService,
    private workOrderAmountService: WorkOrderAmountService
  ) { }
  
  //#region Organization Mapping
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
    return (buildings || []).map(o => ({ ...o }));
  }

  mapBuildingAmenitiesToPropertyFormPatch(building: BuildingResponse): Record<string, unknown> {
    return {
      heating: building.heating ?? false,
      ac: building.ac ?? false,
      elevator: building.elevator ?? false,
      security: building.security ?? false,
      gated: building.gated ?? false,
      petsAllowed: building.petsAllowed ?? false,
      dogsOkay: building.dogsOkay ?? false,
      catsOkay: building.catsOkay ?? false,
      poundLimit: building.poundLimit ?? '',
      trashPickupId: building.trashPickupId ?? TrashDays.None,
      trashRemoval: building.trashRemoval ?? '',
      washerDryerInBldg: building.washerDryerInBldg ?? false,
      deck: building.deck ?? false,
      patio: building.patio ?? false,
      yard: building.yard ?? false,
      garden: building.garden ?? false,
      commonPool: building.commonPool ?? false,
      privatePool: building.privatePool ?? false,
      jacuzzi: building.jacuzzi ?? false,
      sauna: building.sauna ?? false,
      gym: building.gym ?? false
    };
  }

  mapColors(colors: ColorResponse[]): ColorListDisplay[] {
    return colors.map<ColorListDisplay>((o: ColorResponse) => ({
      colorId: o.colorId,
      reservationStatusId: o.reservationStatusId,
      reservationStatus: getReservationStatus(o.reservationStatusId),
      color: o.color
    }));
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

  createColorMap(colors: ColorResponse[]): Map<number, string> {
    const colorMap = new Map<number, string>();
    colors.forEach(color => {
      colorMap.set(color.reservationStatusId, color.color);
    });
    return colorMap;
  }
  //#endregion

  //#region Contact Mapping
  mapContactResponse(raw: Record<string, unknown>): ContactResponse {
    const officeAccess = this.normalizeOfficeAccessNumbers(raw['officeAccess']);
    const rawOfficeId = raw['officeId'] ?? raw['defaultOfficeId'];
    const parsedOfficeId = Number(rawOfficeId);
    const officeId = Number.isFinite(parsedOfficeId) && parsedOfficeId > 0
      ? parsedOfficeId
      : (officeAccess[0] ?? 0);
    const base = raw as unknown as ContactResponse;
    const parsedEntityTypeId = Number(raw['entityTypeId']);
    const isVendor = Number.isFinite(parsedEntityTypeId) && parsedEntityTypeId === EntityType.Vendor;
    let vendorTypeId: number | null = null;
    if (isVendor) {
      const rawVt = raw['vendorTypeId'];
      if (rawVt != null && rawVt !== '') {
        const n = Number(rawVt);
        vendorTypeId = Number.isFinite(n) ? n : null;
      }
    }
    return {
      ...base,
      officeAccess,
      officeId,
      vendorTypeId
    };
  }

  mapContacts(contacts: ContactResponse[]): ContactListDisplay[] {
    return contacts.map<ContactListDisplay>((o: ContactResponse) => {
      const combinedName = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim();
      const displayName = (o.fullName ?? o.displayName ?? '').trim() || combinedName || o.companyName || '';
      const officeAccess = this.normalizeOfficeAccessNumbers(o.officeAccess);
      const officeName = (o.officeName || '').trim();
      const rawCodes = (o.properties ?? []) as string[] | string;
      const codesArray = Array.isArray(rawCodes) ? rawCodes : (typeof rawCodes === 'string' && rawCodes ? rawCodes.split(',').map(c => c.trim()).filter(c => c) : []);
      const propertyCodesDisplay = codesArray.length ? codesArray.join(', ') : undefined;
      return {
        contactId: o.contactId,
        contactCode: o.contactCode,
        officeId: Number.isFinite(Number(o.officeId)) ? Number(o.officeId) : 0,
        officeName,
        officeAccess,
        fullName: displayName,
        contactType: getEntityType(o.entityTypeId),
        entityTypeId: o.entityTypeId,
        ownerTypeId: o.ownerTypeId ?? null,
        companyName: o.companyName ?? null,
        companyEmail: o.companyEmail ?? null,
        phone: this.formatter.phoneNumber(o.phone),
        email: o.email,
        rating: o.rating ?? 0,
        ratingStars: (() => { const r = Math.min(5, Math.max(0, Math.round(o.rating ?? 0))); return '★'.repeat(r) + '☆'.repeat(5 - r); })(),
        isInternational: o.isInternational || false,
        isActive: typeof o.isActive === 'number' ? o.isActive === 1 : Boolean(o.isActive),
        propertyCodesDisplay
      };
    });
  }
  
  normalizeOfficeAccessNumbers(value: unknown): number[] {
    if (value == null || value === '') {
      return [];
    }
    if (Array.isArray(value)) {
      return Array.from(new Set(
        value
          .map(id => (typeof id === 'string' ? parseInt(id, 10) : Number(id)))
          .filter(id => Number.isFinite(id) && !Number.isNaN(id) && id > 0)
      ));
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) {
        return [];
      }
      if (s.startsWith('[')) {
        try {
          return this.normalizeOfficeAccessNumbers(JSON.parse(s) as unknown);
        } catch {
          return [];
        }
      }
      return Array.from(new Set(
        s.split(',')
          .map(part => parseInt(part.trim(), 10))
          .filter(id => Number.isFinite(id) && !Number.isNaN(id) && id > 0)
      ));
    }
    return [];
  }
  //#endregion

  //#region Accounting Mapping
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

  mapLedgerLines(ledgerLines: LedgerLineResponse[], costCodes?: CostCodesResponse[], transactionTypes?: { value: number, label: string }[]): LedgerLineListDisplay[] {
    return ledgerLines.map<LedgerLineListDisplay>((line: LedgerLineResponse) => {
      const costCodeId = line.costCodeId ?? null;
      let matchingCostCode: CostCodesResponse | undefined = undefined;
      let transactionTypeId: number | undefined = line.transactionTypeId;
      
      if (costCodeId !== null && costCodes && costCodes.length > 0) {
        // Find cost code by costCodeId (costCodes array is already filtered by office if needed)
        matchingCostCode = costCodes.find(c => c.costCodeId === costCodeId);
        
        if (matchingCostCode) {
          transactionTypeId = matchingCostCode.transactionTypeId;
        }
      }
      
      // Translate transactionTypeId to transactionType label for display.
      // Prefer CostCode-derived value when available, otherwise use API line.transactionTypeId.
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
          : (costCodeId != null ? `Cost Code ${costCodeId}` : ''),
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
  //#endregion

  //#region Document and Email Mapping
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
      organizationId: emailHtml?.organizationId ?? '',
      welcomeLetter: emailHtml?.welcomeLetter ?? '',
      corporateLetter: emailHtml?.corporateLetter ?? '',
      lease: emailHtml?.lease ?? '',
      corporateLease: emailHtml?.corporateLease ?? '',
      invoice: emailHtml?.invoice ?? '',
      corporateInvoice: emailHtml?.corporateInvoice ?? '',
      letterSubject: emailHtml?.letterSubject ?? '',
      leaseSubject: emailHtml?.leaseSubject ?? '',
      invoiceSubject: emailHtml?.invoiceSubject ?? '',
      createdOn: emailHtml?.createdOn ?? '',
      modifiedOn: emailHtml?.modifiedOn
    };
  }

  mapEmailListDisplays(emails: any): EmailListDisplay[] {
    if (!emails) {
      return [];
    }

    const emailArray = Array.isArray(emails) ? emails : [emails];
    return emailArray.map<EmailListDisplay>((email: EmailResponse | any) => ({
      // Treat attachmentPath as the linked document identifier/path.
      // Rows without attachments cannot open a document preview.
      emailId: email?.emailId ?? '',
      officeId: String(email?.officeId ?? ''),
      propertyId: email?.propertyId ?? undefined,
      reservationId: email?.reservationId ?? undefined,
      reservationCode: email?.reservationCode ?? '',
      officeName: email?.officeName ?? '',
      emailTypeName: getEmailType(Number(email?.emailTypeId ?? 0)),
      toEmail: this.getPrimaryRecipientEmail(email?.toRecipients, email?.toEmail),
      toName: this.getPrimaryRecipientName(email?.toRecipients, email?.toName),
      fromEmail: email?.fromRecipient?.email ?? email?.fromEmail ?? '',
      fromName: email?.fromRecipient?.name ?? email?.fromName ?? '',
      subject: email?.subject ?? '',
      attachmentName: email?.attachmentName ?? '',
      attachmentPath: email?.attachmentPath ?? '',
      documentId: email?.documentId ?? email?.attachmentDocumentId ?? undefined,
      emailTypeId: Number(email?.emailTypeId ?? 0),
      documentTypeId:
        email?.documentTypeId !== undefined && email?.documentTypeId !== null
          ? Number(email.documentTypeId)
          : undefined,
      canView: Boolean(
        email?.documentId ??
        email?.attachmentDocumentId ??
        email?.attachmentPath
      ),
      createdOn: this.formatter.formatDateTimeString(email?.createdOn) || (email?.createdOn ?? '')
    }));
  }

  getPrimaryRecipientEmail(recipients: any, fallback: string = ''): string {
    if (Array.isArray(recipients) && recipients.length > 0) {
      const first = recipients[0];
      return first?.email ?? fallback ?? '';
    }

    return fallback ?? '';
  }

  getPrimaryRecipientName(recipients: any, fallback: string = ''): string {
    if (Array.isArray(recipients) && recipients.length > 0) {
      const first = recipients[0];
      return first?.name ?? fallback ?? '';
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

  mapAlertListDisplays(alerts: any): AlertListDisplay[] {
    if (!alerts) {
      return [];
    }
    const alertArray = Array.isArray(alerts) ? alerts : [alerts];
    return alertArray.map<AlertListDisplay>((alert: AlertResponse | any) => ({
      alertId: alert?.alertId ?? '',
      officeId: String(alert?.officeId ?? ''),
      propertyId: alert?.propertyId ?? undefined,
      propertyCode: alert?.propertyCode ?? '',
      reservationId: alert?.reservationId ?? undefined,
      reservationCode: alert?.reservationCode ?? '',
      officeName: alert?.officeName ?? '',
      toEmail: this.getPrimaryRecipientEmail(alert?.toRecipients, alert?.toEmail),
      toName: this.getPrimaryRecipientName(alert?.toRecipients, alert?.toName),
      fromEmail: alert?.fromRecipient?.email ?? alert?.fromEmail ?? '',
      fromName: alert?.fromRecipient?.name ?? alert?.fromName ?? '',
      subject: alert?.subject ?? '',
      emailTypeId: Number(alert?.emailTypeId ?? 0),
      startDate: this.formatter.formatDateString(alert?.startDate) || (alert?.startDate ?? ''),
      nextAlertDate: this.formatter.formatDateString(alert?.nextAlertDate) || (alert?.nextAlertDate ?? ''),
      frequencyId: Number(alert?.frequencyId ?? 0),
      frequencyLabel: getFrequency(Number(alert?.frequencyId ?? 0)),
      lastNotifiedDate: this.formatter.formatDateString(alert?.sentOn) || (alert?.sentOn ?? ''),
      isActive: alert?.isActive !== false,
      createdOn: this.formatter.formatDateString(alert?.createdOn) || (alert?.createdOn ?? '')
    }));
  }

  mapAlertOfficeNames(alerts: AlertListDisplay[], offices: OfficeResponse[]): AlertListDisplay[] {
    if (!alerts || alerts.length === 0 || !offices || offices.length === 0) {
      return alerts || [];
    }
    const officeNameById = new Map<string, string>(
      offices.map(office => [office.officeId.toString(), office.name])
    );
    return alerts.map(alert => ({
      ...alert,
      officeName: officeNameById.get(alert.officeId) || alert.officeName || ''
    }));
  }

  //#endregion

  //#region Property Mapping
  mapProperties(properties: PropertyListResponse[]): PropertyListDisplay[] {
    const bedPanelClass = ['datatable-dropdown-panel', 'datatable-bed-dropdown-panel'];
    return properties.map<PropertyListDisplay>((o: PropertyListResponse) => {
      const bedroomId1 = this.readPropertyListBedroomTypeId(o, 1);
      const bedroomId2 = this.readPropertyListBedroomTypeId(o, 2);
      const bedroomId3 = this.readPropertyListBedroomTypeId(o, 3);
      const bedroomId4 = this.readPropertyListBedroomTypeId(o, 4);
      const bedrooms = o.bedrooms;
      return {
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        propertyLeaseTypeId: o.propertyLeaseTypeId,
        shortAddress: o.shortAddress,
        officeId: o.officeId,
        officeName: o.officeName,
        owner1Id: o.owner1Id,
        vendorId: o.vendorId,
        contactName: o.contactName,
        unitLevel: o.unitLevel,
        bedrooms,
        bathrooms: o.bathrooms,
        accomodates: o.accomodates,
        squareFeet: o.squareFeet,
        monthlyRate: o.monthlyRate,
        dailyRate: o.dailyRate,
        propertyTypeId: o.propertyTypeId,
        propertyType: (PropertyType[o.propertyTypeId as PropertyType] as string) ?? getPropertyType(o.propertyTypeId),
        departureFee: o.departureFee,
        petFee: o.petFee,
        maidServiceFee: o.maidServiceFee,
        propertyStatusId: o.propertyStatusId,
        bedroomId1,
        bedroomId2,
        bedroomId3,
        bedroomId4,
        bed1Text: this.buildBedSizeListDropdownCell(
          effectiveBedTypeIdForPropertySlot(1, bedrooms, bedroomId1),
          true,
          bedPanelClass
        ),
        bed2Text: this.buildBedSizeListDropdownCell(
          effectiveBedTypeIdForPropertySlot(2, bedrooms, bedroomId2),
          true,
          bedPanelClass
        ),
        bed3Text: this.buildBedSizeListDropdownCell(
          effectiveBedTypeIdForPropertySlot(3, bedrooms, bedroomId3),
          true,
          bedPanelClass
        ),
        bed4Text: this.buildBedSizeListDropdownCell(
          effectiveBedTypeIdForPropertySlot(4, bedrooms, bedroomId4),
          true,
          bedPanelClass
        ),
        isActive: o.isActive,
        unfurnished: this.toBooleanValue(o.unfurnished),
      };
    });
  }

  mapPropertyMaintenanceToPropertyListResponseForDashboard(pm: PropertyMaintenance): PropertyListResponse {
    return {
      propertyId: pm.propertyId,
      propertyCode: pm.propertyCode,
      propertyLeaseTypeId: 0,
      shortAddress: pm.shortAddress ?? '',
      officeId: pm.officeId,
      officeName: pm.officeName ?? '',
      owner1Id: null,
      vendorId: null,
      contactName: '',
      availableFrom: pm.availableFrom ?? null,
      availableUntil: pm.availableUntil ?? null,
      unitLevel: 0,
      bedrooms: pm.bedrooms,
      bathrooms: pm.bathrooms,
      accomodates: pm.accomodates,
      squareFeet: pm.squareFeet,
      propertyTypeId: 0,
      unfurnished: false,
      monthlyRate: 0,
      dailyRate: 0,
      departureFee: 0,
      petFee: 0,
      maidServiceFee: 0,
      propertyStatusId: pm.propertyStatusId,
      bedroomId1: pm.bedroomId1,
      bedroomId2: pm.bedroomId2,
      bedroomId3: pm.bedroomId3,
      bedroomId4: pm.bedroomId4,
      isActive: true
    };
  }

  mapPropertyResponse(raw: Record<string, unknown>): PropertyResponse {
    const leaseTypeId = raw['propertyLeaseTypeId'] ?? raw['propertyLeaseId'];
    const rest = { ...(raw as Record<string, unknown>) };
    delete rest['propertyLeaseTypeId'];
    delete rest['propertyLeaseId'];
    delete rest['bldgNo'];
    const bldgNoRaw = raw['bldgNo'];
    const bldgNo = bldgNoRaw != null && String(bldgNoRaw).trim() !== '' ? String(bldgNoRaw).trim() : undefined;
    return {
      ...rest,
      propertyLeaseTypeId: Number(leaseTypeId ?? 0),
      ...(bldgNo !== undefined ? { bldgNo } : {})
    } as unknown as PropertyResponse;
  }

  mapPropertyListRows(properties: PropertyListResponse[]): Array<PropertyListDisplay & { propertyStatusText: string; propertyStatusDropdown: { value: string; isOverridable: boolean; toString: () => string } }> {
    return this.mapProperties(properties || []).map(property => {
      const propertyStatusText = getPropertyStatus(property.propertyStatusId);
      return {
        ...property,
        propertyStatusText,
        propertyStatusDropdown: {
          value: propertyStatusText,
          isOverridable: true,
          toString: () => propertyStatusText
        }
      };
    });
  }

  mapManagementFeeTypeIdFromApi(raw: number | string | null | undefined): ManagementFeeType {
    if (raw === null || raw === undefined) {
      return ManagementFeeType.FlatRate;
    }
    if (typeof raw === 'string' && raw.toLowerCase() === 'percentage') {
      return ManagementFeeType.Percentage;
    }
    const n = Number(raw);
    if (n === ManagementFeeType.Percentage) {
      return ManagementFeeType.Percentage;
    }
    if (n === ManagementFeeType.Minimum) {
      return ManagementFeeType.Minimum;
    }
    return ManagementFeeType.FlatRate;
  }

  readPropertyListBedroomTypeId(listRow: PropertyListResponse, slot: 1 | 2 | 3 | 4): number {
    const v =
      slot === 1
        ? listRow.bedroomId1
        : slot === 2
          ? listRow.bedroomId2
          : slot === 3
            ? listRow.bedroomId3
            : listRow.bedroomId4;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  mapPropertiesToBoardProperties(properties: PropertyListResponse[], reservations: ReservationListResponse[]): BoardProperty[] {
    void reservations;
    return (properties || []).map(p => ({
      propertyId: p.propertyId,
      officeId: p.officeId,
      propertyCode: p.propertyCode,
      address: p.shortAddress,
      monthlyRate: p.monthlyRate,
      dailyRate: p.dailyRate,
      bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
      propertyStatusId: p.propertyStatusId,
      statusLetter: getPropertyStatusLetter(p.propertyStatusId),
      availableFrom: p.availableFrom,
      availableUntil: p.availableUntil
    }));
  }

  mapVacantPropertyLastDepartureDate(value: Date | null): string {
    if (!value) {
      return 'Never rented';
    }
    const api = this.utility.formatDateOnlyForApi(value);
    if (!api) {
      return 'Never rented';
    }
    return this.formatter.formatDateString(api) || 'Never rented';
  }

  buildPropertyRowBedDropdownCells(
    property: Pick<PropertyListDisplay, 'bedrooms' | 'bedroomId1' | 'bedroomId2' | 'bedroomId3' | 'bedroomId4'>,
    maintenanceRow: MaintenanceListResponse | null | undefined,
    dropdownReadOnly?: boolean
  ): Pick<MaintenanceListDisplay, 'bed1Text' | 'bed2Text' | 'bed3Text' | 'bed4Text'> {
    const panelClasses = ['datatable-dropdown-panel', 'datatable-bed-dropdown-panel'];
    const sourceId = (slot: 1 | 2 | 3 | 4): number => {
      const fromMaintenance =
        slot === 1
          ? maintenanceRow?.bedroomId1
          : slot === 2
            ? maintenanceRow?.bedroomId2
            : slot === 3
              ? maintenanceRow?.bedroomId3
              : maintenanceRow?.bedroomId4;
      const fromProperty =
        slot === 1
          ? property.bedroomId1
          : slot === 2
            ? property.bedroomId2
            : slot === 3
              ? property.bedroomId3
              : property.bedroomId4;
      return fromMaintenance ?? fromProperty;
    };
    return {
      bed1Text: this.buildBedSizeListDropdownCell(
        effectiveBedTypeIdForPropertySlot(1, property.bedrooms, sourceId(1)),
        true,
        panelClasses,
        dropdownReadOnly
      ),
      bed2Text: this.buildBedSizeListDropdownCell(
        effectiveBedTypeIdForPropertySlot(2, property.bedrooms, sourceId(2)),
        true,
        panelClasses,
        dropdownReadOnly
      ),
      bed3Text: this.buildBedSizeListDropdownCell(
        effectiveBedTypeIdForPropertySlot(3, property.bedrooms, sourceId(3)),
        true,
        panelClasses,
        dropdownReadOnly
      ),
      bed4Text: this.buildBedSizeListDropdownCell(
        effectiveBedTypeIdForPropertySlot(4, property.bedrooms, sourceId(4)),
        true,
        panelClasses,
        dropdownReadOnly
      )
    };
  }

  buildBedSizeListDropdownCell(
    bedroomId: number | null | undefined,
    isOverridable: boolean,
    panelClass?: string[],
    dropdownReadOnly?: boolean
  ): PropertyBedDropdownCell {
    const numeric =
      bedroomId === null || bedroomId === undefined ? undefined : Number(bedroomId);
    const key = numeric !== undefined && Number.isFinite(numeric) ? numeric : undefined;
    const value = getBedSizeType(key);
    return {
      value,
      isOverridable,
      ...(panelClass && panelClass.length > 0 ? { panelClass } : {}),
      ...(dropdownReadOnly === true ? { dropdownReadOnly: true } : {}),
      toString: () => value
    };
  }
  //#endregion

  //#region Maintenance Mapping

  mapInspection(inspection: InspectionResponse): InspectionResponse {
    return {
      ...inspection,
      isActive: this.toBooleanFlag((inspection as unknown as Record<string, unknown>)['isActive'])
    };
  }
  
  mapInspectionDisplays(inspections: InspectionResponse[]): InspectionDisplayList[] {
    return inspections.map<InspectionDisplayList>((inspection: InspectionResponse) => {
      return {
        inspectionId: inspection.inspectionId,
        officeId: inspection.officeId,
        officeName: inspection.officeName,
        propertyId: inspection.propertyId,
        propertyCode: inspection.propertyCode,
        reservationId: inspection.reservationId ?? '',
        reservationCode: inspection.reservationCode ?? '',
        maintenanceId: inspection.maintenanceId,
        inspectionTypeId: inspection.inspectionTypeId,
        inspectionType: getInspectionType(inspection.inspectionTypeId),
        documentPath: inspection.documentPath,
        isActive: inspection.isActive,
        modifiedOn: this.formatter.formatDateTimeString(inspection.modifiedOn),
        modifiedBy: inspection.modifiedBy
      };
    });
  }

  mapWorkOrderDisplays(workOrders: WorkOrderResponse[]): WorkOrderDisplayList[] {
    return (workOrders || []).map<WorkOrderDisplayList>((workOrder: WorkOrderResponse) => {
      const amount = this.workOrderAmountService.resolveWorkOrderDisplayAmount(workOrder);
      return {
        amount,
        amountDisplay: this.formatter.currencyUsd(amount),
        workOrderId: workOrder.workOrderId,
        workOrderCode: workOrder.workOrderCode ?? '',
        officeId: workOrder.officeId,
        officeName: workOrder.officeName,
        propertyId: workOrder.propertyId,
        propertyCode: workOrder.propertyCode,
        reservationId: workOrder.reservationId ?? null,
        reservationCode: workOrder.reservationCode ?? '',
        description: workOrder.description ?? '',
        workOrderTypeId: workOrder.workOrderTypeId,
        workOrderType: getWorkOrderType(workOrder.workOrderTypeId),
        applyMarkup: workOrder.applyMarkup === true,
        isActive: workOrder.isActive,
        modifiedOn: this.formatter.formatDateString(workOrder.modifiedOn),
        modifiedBy: workOrder.modifiedBy
      };
    });
  }

  mapReceiptDisplays(receipts: ReceiptResponse[]): ReceiptDisplayList[] {
    return (receipts || []).map((receipt: ReceiptResponse): ReceiptDisplayList => {
      const splits = (receipt.splits || []).map((split: Split) => ({
        amount: Number(split.amount) || 0,
        description: split.description || '',
        workOrder: split.workOrder || ''
      }));
      const splitTotalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
      const receiptAmount = Number(receipt.amount) || 0;
      const distinctWorkOrders = Array.from(
        new Set(
          splits
            .map(split => (split.workOrder || '').trim())
            .filter(code => code.length > 0)
        )
      );
      const workOrderDisplay = distinctWorkOrders.join(', ');
      const isSplitAmountValid = splitTotalAmount <= receiptAmount;

      return {
        receiptId: receipt.receiptId,
        officeId: receipt.officeId,
        officeName: receipt.officeName,
        propertyIds: receipt.propertyIds || [],
        propertyCode: (receipt.propertyIds || []).join(', '),
        maintenanceId: receipt.maintenanceId,
        description: receipt.description || '',
        descriptionDisplay: receipt.description || '',
        amount: receiptAmount,
        amountDisplay: this.formatter.currencyUsd(receiptAmount),
        splits,
        splitTotalAmount,
        splitTotalDisplay: this.formatter.currencyUsd(splitTotalAmount),
        splitSummaryDisplay: `${splits.length} split${splits.length === 1 ? '' : 's'}`,
        isSplitAmountValid,
        workOrderDisplay,
        receiptPath: receipt.receiptPath ?? null,
        isActive: receipt.isActive,
        modifiedOn: this.formatter.formatDateString(receipt.modifiedOn),
        modifiedBy: receipt.modifiedBy
      };
    });
  }
  //#endregion

  //#region Reservation and Dashboard Mapping
  mapReservationList(reservations: ReservationListResponse[]): ReservationListDisplay[] {
    return reservations.map<ReservationListDisplay>((o: ReservationListResponse) => {
      const companyName = String(o.companyName || '').trim();
      const tenantName = String(o.tenantName || '').trim();

      return {
        reservationId: this.utility.normalizeId(o.reservationId),
        reservationCode: o.reservationCode,
        propertyId: this.utility.normalizeId(o.propertyId),
        propertyCode: o.propertyCode,
        officeId: o.officeId,
        officeName: o.officeName,
        office: o.officeName || undefined,
        contactId: this.utility.normalizeId(o.contactId),
        contactName: o.contactName,
        tenantName: tenantName,
        companyId: this.utility.normalizeIdOrNull(o.companyId),
        companyName: companyName,
        agentCode: o.agentCode?? null,
        monthlyRate: o.monthlyRate,
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        reservationTypeId: o.reservationTypeId,
        reservationStatusId: o.reservationStatusId,
        hasPets: this.toBooleanValue(o.hasPets),
        maidUserId: this.utility.normalizeIdOrNull(o.maidUserId),
        maidStartDate: o.maidStartDate ?? null,
        frequencyId: o.frequencyId,
        maidService: undefined,
        currentInvoiceNo: o.currentInvoiceNo,
        paymentReceived: this.toBooleanValue(o.paymentReceived),
        welcomeLetterChecked: this.toBooleanValue(o.welcomeLetterChecked),
        welcomeLetterSent: this.toBooleanValue(o.welcomeLetterSent),
        readyForArrival: this.toBooleanValue(o.readyForArrival),
        code: this.toBooleanValue(o.code),
        departureLetterChecked: this.toBooleanValue(o.departureLetterChecked),
        departureLetterSent: this.toBooleanValue(o.departureLetterSent),
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
      };
    });
  }

  mapExtraFeeLinesResponseToRequest(lines: ExtraFeeLineResponse[] | null | undefined): ExtraFeeLineRequest[] {
    return (lines || []).map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      reservationId: line.reservationId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId,
      costCodeId: line.costCodeId
    }));
  }

  //#endregion

  //#region Helper/Format Functions
  toDateOnlyJsonString(value: unknown): string | null {
    return this.utility.toDateOnlyJsonString(value);
  }

  toBooleanValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
        return false;
      }
    }
    return false;
  }

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

  toBooleanFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  //#endregion
}
