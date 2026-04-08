import { Injectable } from '@angular/core';
import { TransactionType, getTransactionTypeLabel } from '../authenticated/accounting/models/accounting-enum';
import { CostCodesListDisplay, CostCodesResponse } from '../authenticated/accounting/models/cost-codes.model';
import { LedgerLineListDisplay, LedgerLineResponse } from '../authenticated/accounting/models/invoice.model';
import { EntityType, getEntityType } from '../authenticated/contacts/models/contact-enum';
import { ContactListDisplay, ContactResponse } from '../authenticated/contacts/models/contact.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../authenticated/documents/models/document.model';
import { EmailListDisplay, EmailResponse } from '../authenticated/email/models/email.model';
import { EmailHtmlResponse } from '../authenticated/email/models/email-html.model';
import { MaintenanceListBedDropdownCell, MaintenanceListDisplay, MaintenanceListPropertyRow, MaintenanceListResponse, MaintenanceListStatusDropdownCell, MaintenanceListUserDropdownCell } from '../authenticated/maintenance/models/maintenance.model';
import { InspectionDisplayList, InspectionResponse } from '../authenticated/maintenance/models/inspection.model';
import { ReceiptDisplayList, ReceiptResponse } from '../authenticated/maintenance/models/receipt.model';
import { getWorkOrderType } from '../authenticated/maintenance/models/maintenance-enums';
import { WorkOrderDisplayList, WorkOrderResponse } from '../authenticated/maintenance/models/work-order.model';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../authenticated/organizations/models/accounting-office.model';
import { AgentListDisplay, AgentResponse } from '../authenticated/organizations/models/agent.model';
import { AreaListDisplay, AreaResponse } from '../authenticated/organizations/models/area.model';
import { BuildingListDisplay, BuildingResponse } from '../authenticated/organizations/models/building.model';
import { ColorListDisplay, ColorResponse } from '../authenticated/organizations/models/color.model';
import { OfficeListDisplay, OfficeResponse } from '../authenticated/organizations/models/office.model';
import { OrganizationListDisplay, OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { RegionListDisplay, RegionResponse } from '../authenticated/organizations/models/region.model';
import { ManagementFeeType, PropertyType, TrashDays, getBedSizeType, getPropertyStatus, getPropertyStatusLetter, getPropertyType } from '../authenticated/properties/models/property-enums';
import { PropertyListDisplay, PropertyListResponse, PropertyResponse } from '../authenticated/properties/models/property.model';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getReservationStatus } from '../authenticated/reservations/models/reservation-enum';
import { ReservationListDisplay, ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import { UserResponse } from '../authenticated/users/models/user.model';
import { FormatterService } from './formatter-service';

export type MaintenanceListLoadResponse = {
  properties?: PropertyListResponse[] | null;
  maintenanceList?: MaintenanceListResponse[] | null;
};

/** Per-property snapshot from the active reservation list for maintenance rows (current stay only). */
export type MaintenanceListCurrentReservationSnapshot = {
  petsAllowed: boolean;
  departureDate: string;
  departureSortTime: number;
};

export type MaintenanceListCurrentReservationByPropertyId = Map<string, MaintenanceListCurrentReservationSnapshot>;

export type MaintenanceListMappingContext = {
  housekeepingUsers: UserResponse[];
  inspectorUsers: UserResponse[];
  housekeepingById: Map<string, string>;
  inspectorById: Map<string, string>;
  isInspectorView: boolean;
  inspectorPropertyIds: Set<string>;
  currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId;
};

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

  mapContactResponse(raw: Record<string, unknown>): ContactResponse {
    return raw as unknown as ContactResponse;
  }

  mapContacts(contacts: ContactResponse[]): ContactListDisplay[] {
    return contacts.map<ContactListDisplay>((o: ContactResponse) => {
      const combinedName = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim();
      const displayName = (o.fullName ?? o.displayName ?? '').trim() || combinedName || o.companyName || '';
      const rawCodes = (o.properties ?? []) as string[] | string;
      const codesArray = Array.isArray(rawCodes) ? rawCodes : (typeof rawCodes === 'string' && rawCodes ? rawCodes.split(',').map(c => c.trim()).filter(c => c) : []);
      const propertyCodesDisplay = codesArray.length ? codesArray.join(', ') : undefined;
      return {
        contactId: o.contactId,
        contactCode: o.contactCode,
        officeId: o.officeId,
        officeName: o.officeName,
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
      emailId: email?.emailId ?? '',
      officeId: String(email?.officeId ?? ''),
      propertyId: email?.propertyId ?? undefined,
      reservationId: email?.reservationId ?? undefined,
      reservationCode: email?.reservationCode ?? '',
      officeName: email?.officeName ?? '',
      toEmail: this.getPrimaryRecipientEmail(email?.toRecipients, email?.toEmail),
      toName: this.getPrimaryRecipientName(email?.toRecipients, email?.toName),
      fromEmail: email?.fromRecipient?.email ?? email?.fromEmail ?? '',
      fromName: email?.fromRecipient?.name ?? email?.fromName ?? '',
      subject: email?.subject ?? '',
      attachmentName: email?.attachmentName ?? '',
      attachmentPath: email?.attachmentPath ?? '',
      documentId: email?.documentId ?? email?.attachmentDocumentId ?? undefined,
      emailTypeId: Number(email?.emailTypeId ?? 0),
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

  mapLedgerLines(ledgerLines: LedgerLineResponse[], costCodes?: CostCodesResponse[], transactionTypes?: { value: number, label: string }[]): LedgerLineListDisplay[] {
    return ledgerLines.map<LedgerLineListDisplay>((line: LedgerLineResponse) => {
      const costCodeId = line.costCodeId || null;
      let matchingCostCode: CostCodesResponse | undefined = undefined;
      let costCode: string | null = null;
      let transactionTypeId: number | undefined = line.transactionTypeId;
      
      if (costCodeId && costCodes && costCodes.length > 0) {
        // Find cost code by costCodeId (costCodes array is already filtered by office if needed)
        matchingCostCode = costCodes.find(c => c.costCodeId === costCodeId);
        
        if (matchingCostCode) {
          costCode = matchingCostCode.costCode || null;
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

  mapInspectionDisplays(inspections: InspectionResponse[]): InspectionDisplayList[] {
    return inspections.map<InspectionDisplayList>((inspection: InspectionResponse) => {
      return {
        inspectionId: inspection.inspectionId,
        officeId: inspection.officeId,
        officeName: inspection.officeName,
        propertyId: inspection.propertyId,
        propertyCode: inspection.propertyCode,
        maintenanceId: inspection.maintenanceId,
        documentPath: inspection.documentPath,
        isActive: inspection.isActive,
        modifiedOn: this.formatter.formatDateTimeString(inspection.modifiedOn),
        modifiedBy: inspection.modifiedBy
      };
    });
  }

  mapWorkOrderDisplays(workOrders: WorkOrderResponse[]): WorkOrderDisplayList[] {
    return (workOrders || []).map<WorkOrderDisplayList>((workOrder: WorkOrderResponse) => ({
      workOrderId: workOrder.workOrderId,
      officeId: workOrder.officeId,
      officeName: workOrder.officeName,
      propertyId: workOrder.propertyId,
      propertyCode: workOrder.propertyCode,
      reservationCode: workOrder.reservationCode ?? '',
      description: workOrder.description ?? '',
      workOrderTypeId: workOrder.workOrderTypeId,
      workOrderType: getWorkOrderType(workOrder.workOrderTypeId),
      isActive: workOrder.isActive,
      modifiedOn: this.formatter.formatDateString(workOrder.modifiedOn),
      modifiedBy: workOrder.modifiedBy
    }));
  }

  mapReceiptDisplays(receipts: ReceiptResponse[]): ReceiptDisplayList[] {
    return (receipts || []).map((receipt: ReceiptResponse): ReceiptDisplayList => ({
      receiptId: receipt.receiptId,
      officeId: receipt.officeId,
      officeName: receipt.officeName,
      propertyId: receipt.propertyId,
      propertyCode: receipt.propertyCode,
      maintenanceId: receipt.maintenanceId,
      workOrderCode: receipt.workOrderCode ?? '',
      description: receipt.description,
      amount: receipt.amount ?? 0,
      amountDisplay: '$' + this.formatter.currency(receipt.amount ?? 0),
      receiptPath: receipt.receiptPath ?? null,
      isActive: receipt.isActive,
      modifiedOn: this.formatter.formatDateString(receipt.modifiedOn),
      modifiedBy: receipt.modifiedBy
    }));
  }

  mapInspections(inspections: InspectionResponse[]): InspectionResponse[] {
    return inspections.map<InspectionResponse>((inspection: InspectionResponse) => this.mapInspection(inspection));
  }

  mapInspection(inspection: InspectionResponse): InspectionResponse {
    return {
      ...inspection,
      isActive: this.toBooleanFlag((inspection as unknown as Record<string, unknown>)['isActive'])
    };
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

  toBooleanFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
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
        propertyLeaseId: o.propertyLeaseId,
        shortAddress: o.shortAddress,
        officeId: o.officeId,
        officeName: o.officeName,
        owner1Id: o.owner1Id,
        vendorId: o.vendorId,
        contactName: o.contactName,
        unitLevel: o.unitLevel,
        bedrooms: o.bedrooms,
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
        bedroomId1: o.bedroomId1,
        bedroomId2: o.bedroomId2,
        bedroomId3: o.bedroomId3,
        bedroomId4: o.bedroomId4,
        lastFilterChangeDate: o.lastFilterChangeDate ?? undefined,
        lastSmokeChangeDate: o.lastSmokeChangeDate ?? undefined,
        licenseDate: o.licenseDate ?? undefined,
        hvacServiced: o.hvacServiced ?? undefined,
        fireplaceServiced: o.fireplaceServiced ?? undefined,
        isActive: o.isActive,
      };
    });
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

  mapMaintenanceListRows(maintenanceRows: MaintenanceListResponse[]): MaintenanceListResponse[] {
    return (maintenanceRows || []).map((row: MaintenanceListResponse) => ({
      ...row
    }));
  }

  mapMaintenancePropertyDisplayRows(
    properties: PropertyListResponse[],
    maintenanceRows: MaintenanceListResponse[]
  ): MaintenanceListPropertyRow[] {
    const propertyRows = this.mapPropertyListRows(properties || []);
    const maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
    (maintenanceRows || []).forEach(row => { if (row?.propertyId) { maintenanceByPropertyId.set(row.propertyId, row);} });

    return propertyRows.map(property => {
      const maintenanceRow = maintenanceByPropertyId.get(property.propertyId);
      const isDateMissing = (dateValue: string | null | undefined): boolean =>
        !dateValue || String(dateValue).trim() === '';

      const isDateOlderThanYears = (
        dateValue: string | null | undefined,
        years: number
      ): boolean => {
        if (isDateMissing(dateValue)) {
          return false;
        }

        const parsedDate = new Date(dateValue);
        if (Number.isNaN(parsedDate.getTime())) {
          return true;
        }

        const threshold = new Date();
        threshold.setFullYear(threshold.getFullYear() - years);
        return parsedDate < threshold;
      };

      const isDateOlderThanMonths = (
        dateValue: string | null | undefined,
        months: number
      ): boolean => {
        if (isDateMissing(dateValue)) {
          return false;
        }

        const parsedDate = new Date(dateValue);
        if (Number.isNaN(parsedDate.getTime())) {
          return true;
        }

        const threshold = new Date();
        threshold.setMonth(threshold.getMonth() - months);
        return parsedDate <= threshold;
      };

      const hasAnyTooOldDate =
        isDateOlderThanYears(maintenanceRow?.licenseDate, 1) ||
        isDateOlderThanMonths(maintenanceRow?.lastFilterChangeDate, 4) ||
        isDateOlderThanYears(maintenanceRow?.lastBatteryChangeDate, 1) ||
        isDateOlderThanYears(maintenanceRow?.hvacServiced, 1) ||
        isDateOlderThanYears(maintenanceRow?.fireplaceServiced, 1) ||
        isDateOlderThanYears(maintenanceRow?.lastSmokeChangeDate, 10);

      const hasAnyMissingRequiredDate =
        isDateMissing(maintenanceRow?.lastFilterChangeDate) ||
        isDateMissing(maintenanceRow?.lastSmokeChangeDate) ||
        isDateMissing(maintenanceRow?.lastBatteryChangeDate) ||
        isDateMissing(maintenanceRow?.hvacServiced);

      const hasAnyNearDueDate =
        isDateOlderThanMonths(maintenanceRow?.licenseDate, 11) ||
        isDateOlderThanMonths(maintenanceRow?.lastFilterChangeDate, 3) ||
        isDateOlderThanMonths(maintenanceRow?.lastBatteryChangeDate, 11) ||
        isDateOlderThanMonths(maintenanceRow?.hvacServiced, 11) ||
        isDateOlderThanMonths(maintenanceRow?.fireplaceServiced, 11) ||
        isDateOlderThanMonths(maintenanceRow?.lastSmokeChangeDate, 119);

      const needsMaintenanceState: 'red' | 'yellow' | 'green' | 'grey' = hasAnyMissingRequiredDate
        ? 'grey'
        : hasAnyTooOldDate
          ? 'red'
          : hasAnyNearDueDate
            ? 'yellow'
            : 'green';
      const needsMaintenance = needsMaintenanceState !== 'green';
      const mapBedDropdown = (bedroomId?: number): MaintenanceListBedDropdownCell => {
        const value = getBedSizeType(bedroomId);
        return {
          value,
          isOverridable: true,
          panelClass: ['datatable-dropdown-panel', 'datatable-bed-dropdown-panel'],
          toString: () => value
        };
      };

      const row: MaintenanceListPropertyRow = {
        ...property,
        propertyAddress: property.shortAddress ?? '',
        cleaner: maintenanceRow?.cleanerUserId ?? '',
        cleaningDate: this.formatter.formatDateString(maintenanceRow?.cleaningDate ?? undefined),
        carpet: maintenanceRow?.carpetUserId ?? '',
        carpetDate: this.formatter.formatDateString(maintenanceRow?.carpetDate ?? undefined),
        inspector: maintenanceRow?.inspectorUserId ?? '',
        inspectingDate: this.formatter.formatDateString(maintenanceRow?.inspectingDate ?? undefined),
        bed1Text: mapBedDropdown(maintenanceRow?.bedroomId1),
        bed2Text: mapBedDropdown(maintenanceRow?.bedroomId2),
        bed3Text: mapBedDropdown(maintenanceRow?.bedroomId3),
        bed4Text: mapBedDropdown(maintenanceRow?.bedroomId4),
        petsAllowed: maintenanceRow?.petsAllowed ?? false,
        needsMaintenance: needsMaintenance,
        needsMaintenanceState,
        licenseDate: this.formatter.formatDateString(maintenanceRow?.licenseDate ?? undefined),
        lastFilterChangeDate: this.formatter.formatDateString(maintenanceRow?.lastFilterChangeDate ?? undefined),
        lastSmokeChangeDate: this.formatter.formatDateString(maintenanceRow?.lastSmokeChangeDate ?? undefined),
        hvacServiced: this.formatter.formatDateString(maintenanceRow?.hvacServiced ?? undefined),
        fireplaceServiced: this.formatter.formatDateString(maintenanceRow?.fireplaceServiced ?? undefined)
      };
      return row;
    });
  }

  mapMaintenanceListDisplayRows(
    properties: PropertyListResponse[],
    maintenanceRows: MaintenanceListResponse[],
    context: MaintenanceListMappingContext
  ): MaintenanceListDisplay[] {
    const {
      housekeepingUsers,
      inspectorUsers,
      housekeepingById,
      inspectorById,
      isInspectorView,
      inspectorPropertyIds,
      currentReservationByPropertyId
    } = context;

    const rows = this.mapMaintenancePropertyDisplayRows(properties || [], maintenanceRows || []).map((property): MaintenanceListDisplay => {
      const reservationRow = this.getMaintenanceListCurrentReservationFields(property.propertyId, currentReservationByPropertyId);
      return {
        ...property,
        cleanerUserId: property.cleaner ?? null,
        carpetUserId: property.carpet ?? null,
        inspectorUserId: property.inspector ?? null,
        propertyStatusDropdown: this.buildMaintenanceStatusDropdownCell(property.propertyStatusText),
        cleaner: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(property.cleaner ?? '', property.officeId, housekeepingUsers, housekeepingById, ''),
          this.getMaintenanceUserOptionsForOffice(housekeepingUsers, property.officeId, 'Clear Selection')
        ),
        carpet: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(property.carpet ?? '', property.officeId, housekeepingUsers, housekeepingById, ''),
          this.getMaintenanceUserOptionsForOffice(housekeepingUsers, property.officeId, 'Clear Selection')
        ),
        inspector: this.buildMaintenanceUserDropdownCell(
          this.resolveMaintenanceUserName(property.inspector ?? '', property.officeId, inspectorUsers, inspectorById, ''),
          this.getMaintenanceUserOptionsForOffice(inspectorUsers, property.officeId, 'Clear Selection')
        ),
        departureDate: reservationRow.departureDate,
        departureSortTime: reservationRow.departureSortTime,
        petsAllowed: reservationRow.petsAllowed
      };
    });

    return isInspectorView && inspectorPropertyIds.size > 0
      ? rows.filter(property => inspectorPropertyIds.has(String(property.propertyId || '').trim().toLowerCase()))
      : rows;
  }

  mapMaintenanceListRowsFromCurrentReservationData(
    rows: MaintenanceListDisplay[],
    currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId
  ): MaintenanceListDisplay[] {
    return (rows || []).map(row => ({
      ...row,
      ...this.getMaintenanceListCurrentReservationFields(row.propertyId, currentReservationByPropertyId)
    }));
  }

  mapMaintenanceListDisplayRowsFromLoadResponse(
    loadResponse: MaintenanceListLoadResponse,
    context: MaintenanceListMappingContext
  ): MaintenanceListDisplay[] {
    return this.mapMaintenanceListDisplayRows(
      loadResponse.properties || [],
      loadResponse.maintenanceList || [],
      context
    );
  }

  mapPropertyResponse(raw: Record<string, unknown>): PropertyResponse {
    const { propertyLeaseTypeId, ...rest } = raw as Record<string, unknown> & {
      propertyLeaseTypeId: number;
    };
    return {
      ...rest,
      propertyLeaseId: Number(propertyLeaseTypeId)
    } as unknown as PropertyResponse;
  }

  mapPropertiesToBoardProperties(properties: PropertyListResponse[], reservations: ReservationListResponse[]): BoardProperty[] {
    return (properties || []).map(p => ({
      propertyId: p.propertyId,
      propertyCode: p.propertyCode,
      address: p.shortAddress,
      monthlyRate: p.monthlyRate,
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
    return this.formatter.formatDateString(value.toISOString()) || 'Never rented';
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
      const companyName = String(o.displayName || o.companyName || '').trim();

      const tenantName = String(o.tenantName || o.contactName || '').trim();

      return {
        reservationId: o.reservationId,
        reservationCode: o.reservationCode,
        reservationTypeId: o.reservationTypeId,
        propertyId: o.propertyId,
        propertyCode: o.propertyCode,
        officeId: o.officeId,
        officeName: o.officeName,
        office: o.officeName || undefined,
        contactId: o.contactId,
        entityTypeId: o.entityTypeId ?? null,
        contactName: o.contactName,
        tenantName: tenantName,
        companyName: companyName,
        agentCode: o.agentCode?? null,
        monthlyRate: o.monthlyRate,
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        paymentReceived: this.toBooleanValue(o.paymentReceived),
        welcomeLetterChecked: this.toBooleanValue(o.welcomeLetterChecked),
        welcomeLetterSent: this.toBooleanValue(o.welcomeLetterSent),
        readyForArrival: this.toBooleanValue(o.readyForArrival),
        code: this.toBooleanValue(o.code),
        departureLetterChecked: this.toBooleanValue(o.departureLetterChecked),
        departureLetterSent: this.toBooleanValue(o.departureLetterSent),
        creditDue: o.creditDue,
        hasCredit: o.creditDue > 0,
        reservationStatusId: o.reservationStatusId,
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
      };
    });
  }
  //#endregion

  //#region Helper/Format Functions
  buildMaintenanceStatusDropdownCell(label: string): MaintenanceListStatusDropdownCell {
    return {
      value: label,
      isOverridable: true,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  buildMaintenanceUserDropdownCell(label: string, options: string[]): MaintenanceListUserDropdownCell {
    return {
      value: label,
      isOverridable: true,
      options,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => label
    };
  }

  resolveMaintenanceUserName(
    userIdOrName: string,
    officeId: number,
    users: UserResponse[],
    userById: Map<string, string>,
    defaultLabel: string
  ): string {
    if (!userIdOrName || userIdOrName === 'Clear Selection' || userIdOrName === 'Select Cleaner' || userIdOrName === 'Select Inspector') {
      return defaultLabel;
    }
    const officeUser = users.find(user => user.userId === userIdOrName && (user.officeAccess || []).includes(officeId));
    if (officeUser) {
      return `${officeUser.firstName ?? ''} ${officeUser.lastName ?? ''}`.trim();
    }
    return userById.get(userIdOrName) ?? userIdOrName;
  }

  getMaintenanceUserOptionsForOffice(users: UserResponse[], officeId: number, defaultLabel: string): string[] {
    const names = users
      .filter(user => (user.officeAccess || []).includes(officeId))
      .map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim())
      .filter(name => name !== '');
    return [defaultLabel, ...names];
  }

  private static readonly maintenanceListNoDepartureSortTime = Number.MAX_SAFE_INTEGER;

  getMaintenanceListCurrentReservationFields(
    propertyId: string | null | undefined,
    currentReservationByPropertyId: MaintenanceListCurrentReservationByPropertyId
  ): MaintenanceListCurrentReservationSnapshot {
    const normalizedPropertyId = String(propertyId || '').trim().toLowerCase();
    if (!normalizedPropertyId) {
      return {
        petsAllowed: false,
        departureDate: 'N/A',
        departureSortTime: MappingService.maintenanceListNoDepartureSortTime
      };
    }
    return (
      currentReservationByPropertyId.get(normalizedPropertyId) ?? {
        petsAllowed: false,
        departureDate: 'N/A',
        departureSortTime: MappingService.maintenanceListNoDepartureSortTime
      }
    );
  }

  /** Single pass: current stay per property → maintenance list row fields (pets + departure display). */
  getReservationData(reservations: ReservationListResponse[] | null | undefined): MaintenanceListCurrentReservationByPropertyId {
    type Agg = { departureTime: number; departureDate: string; petsAllowed: boolean };
    const byProperty = new Map<string, Agg>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const reservation of reservations || []) {
      if (!reservation.isActive || !reservation.propertyId || !reservation.arrivalDate || !reservation.departureDate) {
        continue;
      }

      const arrivalDate = new Date(reservation.arrivalDate);
      const departureDate = new Date(reservation.departureDate);
      if (Number.isNaN(arrivalDate.getTime()) || Number.isNaN(departureDate.getTime())) {
        continue;
      }
      arrivalDate.setHours(0, 0, 0, 0);
      departureDate.setHours(0, 0, 0, 0);

      if (today.getTime() < arrivalDate.getTime() || today.getTime() > departureDate.getTime()) {
        continue;
      }

      const normalizedPropertyId = String(reservation.propertyId ?? '').trim().toLowerCase();
      if (!normalizedPropertyId) {
        continue;
      }

      const departureTime = departureDate.getTime();
      const departureDateDisplay = this.formatter.formatDateString(reservation.departureDate) || '';
      const hasPets = reservation.hasPets === true;
      const existing = byProperty.get(normalizedPropertyId);

      if (!existing || departureTime > existing.departureTime) {
        byProperty.set(normalizedPropertyId, {
          departureTime,
          departureDate: departureDateDisplay,
          petsAllowed: (existing?.petsAllowed ?? false) || hasPets
        });
      } else {
        byProperty.set(normalizedPropertyId, {
          ...existing,
          petsAllowed: existing.petsAllowed || hasPets
        });
      }
    }

    const result: MaintenanceListCurrentReservationByPropertyId = new Map();
    byProperty.forEach((v, k) => {
      const departureDate = v.departureDate.trim() !== '' ? v.departureDate : 'N/A';
      result.set(k, {
        departureDate,
        petsAllowed: v.petsAllowed,
        departureSortTime: v.departureTime
      });
    });
    return result;
  }

  parseDateOrNull(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  toIsoDateOrNull(value: unknown): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
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
