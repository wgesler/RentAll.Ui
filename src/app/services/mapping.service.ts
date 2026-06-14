import { Injectable } from '@angular/core';
import { TransactionType, getAccountTypeLabel, getSourceTypeLabel, getTransactionTypeLabel } from '../authenticated/accounting/models/accounting-enum';
import { ChartOfAccountListDisplay, ChartOfAccountResponse } from '../authenticated/accounting/models/chart-of-accounts.model';
import { CostCodesListDisplay, CostCodesRequest, CostCodesResponse } from '../authenticated/accounting/models/cost-codes.model';
import { InvoiceResponse, LedgerLineListDisplay, LedgerLineResponse } from '../authenticated/accounting/models/invoice.model';
import { JournalEntryLineDetailDisplay, JournalEntryLineListDisplay, JournalEntryLineResponse, JournalEntryLineSearchResponse, JournalEntryResponse } from '../authenticated/accounting/models/journal-entry.model';
import { EntityType, getEntityType } from '../authenticated/contacts/models/contact-enum';
import { ContactListDisplay, ContactRequest, ContactResponse } from '../authenticated/contacts/models/contact.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../authenticated/documents/models/document.model';
import { AlertListDisplay, AlertResponse } from '../authenticated/email/models/alert.model';
import { EmailListDisplay, EmailResponse } from '../authenticated/email/models/email.model';
import { getEmailType } from '../authenticated/email/models/email.enum';
import { EmailHtmlResponse } from '../authenticated/email/models/email-html.model';
import { MaintenanceListResponse } from '../authenticated/maintenance/models/maintenance.model';
import { InspectionDisplayList, InspectionResponse } from '../authenticated/maintenance/models/inspection.model';
import { ReceiptDisplayList, ReceiptRequest, ReceiptResponse, Split } from '../authenticated/maintenance/models/receipt.model';
import { getInspectionType, getReceiptType, getWorkOrderType } from '../authenticated/maintenance/models/maintenance-enums';
import { WorkOrderDisplayList, WorkOrderRequest, WorkOrderResponse } from '../authenticated/maintenance/models/work-order.model';
import { AccountingOfficeListDisplay, AccountingOfficeRequest, AccountingOfficeResponse } from '../authenticated/organizations/models/accounting-office.model';
import { AgentListDisplay, AgentResponse } from '../authenticated/organizations/models/agent.model';
import { AreaListDisplay, AreaResponse } from '../authenticated/organizations/models/area.model';
import { BuildingListDisplay, BuildingResponse } from '../authenticated/organizations/models/building.model';
import { ColorListDisplay, ColorResponse } from '../authenticated/organizations/models/color.model';
import { OfficeListDisplay, OfficeResponse } from '../authenticated/organizations/models/office.model';
import { OrganizationListDisplay, OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { BankCardRequest, BankCardResponse } from '../authenticated/organizations/models/bank.model';
import { RegionListDisplay, RegionResponse } from '../authenticated/organizations/models/region.model';
import { StateFormListDisplay, StateFormResponse } from '../authenticated/organizations/models/state-form.model';
import { TrackerConfigurationDefinitionResponse, TrackerDefinitionListDisplay, TrackerDefinitionResponse } from '../authenticated/organizations/models/tracker.model';
import { getTrackerContextCode, getTrackerContextType } from '../authenticated/organizations/models/tracker-enum';
import { ManagementFeeType, PropertyLeaseType, PropertyType, TrashDays, effectiveBedTypeIdForPropertySlot, getBedSizeType, getPropertyStatus, getPropertyStatusLetter, getPropertyType } from '../authenticated/properties/models/property-enums';
import { PropertyBedDropdownCell, PropertyListDisplay, PropertyListResponse, PropertyResponse } from '../authenticated/properties/models/property.model';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getFrequency, getReservationStatus, ReservationStatus, ReservationType } from '../authenticated/reservations/models/reservation-enum';
import { ExternalCalendarImportEvent } from '../authenticated/reservations/models/external-calendar-import.model';
import { ExtraFeeLineRequest, ExtraFeeLineResponse, ReservationListDisplay, ReservationListResponse } from '../authenticated/reservations/models/reservation-model';
import { LeadGeneralListDisplay, LeadGeneralResponse, LeadGeneralUpdateRequest } from '../authenticated/leads/models/lead-general.model';
import { LeadOwnerRequest, LeadOwnerListDisplay, LeadOwnerResponse, LeadOwnerUpdateRequest } from '../authenticated/leads/models/lead-owner.model';
import { UnifiedLeadRow } from '../authenticated/leads/models/lead-reports.model';
import { LeadRentalListDisplay, LeadRentalRequest, LeadRentalResponse } from '../authenticated/leads/models/lead-rental.model';
import { formatLeadStateLabel } from '../authenticated/leads/models/lead-enums';
import { getTicketStateType } from '../authenticated/tickets/models/ticket-enum';
import { TicketListDisplay, TicketRequest, TicketResponse, TicketStateDropdownCell } from '../authenticated/tickets/models/ticket-models';
import { MaintenanceListDisplay, PropertyMaintenance } from '../authenticated/shared/models/mixed-models';
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

  mapStateForms(stateForms: StateFormResponse[]): StateFormListDisplay[] {
    return (stateForms || []).map<StateFormListDisplay>((o: StateFormResponse) => ({
      stateFormId: o.stateFormId,
      stateCode: o.stateCode,
      formName: o.formName,
      path: o.path,
      hasDocument: o.path ? 'Yes' : 'No',
      hasHtml: o.formAsHtml ? 'Yes' : 'No'
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
        yearEndMonth: o.yearEndMonth ?? 12,
        yearEndDay: o.yearEndDay ?? 31,
        isInternational: isInternational,
        isActive: o.isActive,
        // Configuration display fields
        maintenanceEmail: o.maintenanceEmail,
        afterHoursPhone: this.formatter.phoneNumber(o.afterHoursPhone),
        defaultDeposit: o.defaultDeposit || 0,
        defaultSdw: o.defaultSdw || 0,
        quotePreface: o.quotePreface ?? null,
        quoteSuffix: o.quoteSuffix ?? null,
        quoteDisclaimer: o.quoteDisclaimer ?? null
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

  mapTrackerDefinitions(trackers: (TrackerDefinitionResponse | TrackerConfigurationDefinitionResponse)[]): TrackerDefinitionListDisplay[] {
    return (trackers || []).map<TrackerDefinitionListDisplay>((t: TrackerDefinitionResponse | TrackerConfigurationDefinitionResponse) => ({
      trackerDefinitionId: t.trackerDefinitionId,
      organizationId: t.organizationId,
      officeId: t.officeId,
      officeName: t.officeName,
      trackerContextId: t.trackerContextId,
      trackerContextCode: t.trackerContextCode || getTrackerContextCode(t.trackerContextId),
      trackerContextLabel: getTrackerContextType(t.trackerContextId),
      displayName: t.displayName,
      description: t.description,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
      options: (t as TrackerConfigurationDefinitionResponse).options || []
    }));
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
    const rawPaymentTermsId = raw['paymentTermsId'] ?? raw['PaymentTermsId'];
    const paymentTermsId =
      rawPaymentTermsId === undefined || rawPaymentTermsId === null || rawPaymentTermsId === ''
        ? null
        : (Number.isFinite(Number(rawPaymentTermsId)) ? Number(rawPaymentTermsId) : null);

    return {
      ...base,
      officeAccess,
      officeId,
      vendorTypeId,
      paymentTermsId
    };
  }

  /** Full contact PUT body from API response — use for inline saves so optional fields are not cleared. */
  mapContactResponseToUpdateRequest(
    contact: ContactResponse,
    overrides: Partial<ContactRequest> = {}
  ): ContactRequest {
    const { fullName: _fullName, officeName: _officeName, ...requestBase } = contact;
    const officeAccess = this.normalizeOfficeAccessNumbers(contact.officeAccess);
    const resolvedOfficeAccess = officeAccess.length > 0
      ? officeAccess
      : (Number.isFinite(Number(contact.officeId)) && Number(contact.officeId) > 0 ? [Number(contact.officeId)] : []);
    const isActive =
      typeof contact.isActive === 'number' ? contact.isActive === 1 : !!contact.isActive;

    return {
      ...requestBase,
      contactId: contact.contactId,
      organizationId: contact.organizationId,
      officeId: contact.officeId,
      officeAccess: resolvedOfficeAccess,
      entityTypeId: contact.entityTypeId,
      ownerTypeId: contact.ownerTypeId ?? null,
      vendorTypeId: contact.vendorTypeId ?? null,
      properties: contact.properties ?? [],
      paymentTermsId: contact.paymentTermsId ?? null,
      bankName: contact.bankName ?? null,
      routingNumber: contact.routingNumber ?? null,
      accountNumber: contact.accountNumber ?? null,
      markup: contact.markup ?? null,
      revenueSplitOwner: contact.revenueSplitOwner ?? null,
      revenueSplitOffice: contact.revenueSplitOffice ?? null,
      workingCapitalBalance: contact.workingCapitalBalance ?? null,
      linenAndTowelFee: contact.linenAndTowelFee ?? null,
      isActive,
      ...overrides
    };
  }

  mapPublicOwnerContact(form: unknown): ContactResponse | null {
    if (!form || typeof form !== 'object') {
      return null;
    }
    const source = form as Record<string, unknown>;
    const firstName = String(source['firstName'] || '').trim();
    const lastName = String(source['lastName'] || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      firstName,
      lastName,
      fullName,
      email: String(source['email'] || '').trim(),
      address1: String(source['address'] || '').trim(),
      address2: '',
      city: String(source['city'] || '').trim(),
      state: String(source['state'] || '').trim(),
      zip: String(source['zip'] || '').trim()
    } as ContactResponse;
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
        ownerLeadId: o.ownerLeadId ?? null,
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
        isOwnerReady: typeof o.isOwnerReady === 'number' ? o.isOwnerReady === 1 : o.isOwnerReady === true,
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

  mapAccountingOfficeResponseToRequest(
    office: AccountingOfficeResponse,
    overrides?: Partial<AccountingOfficeRequest>
  ): AccountingOfficeRequest {
    return {
      organizationId: office.organizationId,
      officeId: office.officeId,
      name: office.name,
      address1: office.address1,
      address2: office.address2,
      suite: office.suite,
      city: office.city,
      state: office.state,
      zip: office.zip,
      phone: office.phone,
      fax: office.fax || '',
      email: office.email,
      website: office.website,
      bankName: office.bankName,
      bankRouting: office.bankRouting,
      bankAccount: office.bankAccount,
      bankSwiftCode: office.bankSwiftCode,
      bankAddress: office.bankAddress,
      bankPhone: office.bankPhone,
      bankCards: this.mapBankCardsToRequests(office.bankCards),
      workOrderNo: office.workOrderNo,
      logoPath: office.logoPath,
      isActive: office.isActive,
      ...overrides
    };
  }

  mapBankCardsToRequests(cards?: BankCardResponse[] | null): BankCardRequest[] {
    if (!cards?.length) {
      return [];
    }

    return cards.map(card => ({
      bankCardId: (card.bankCardId || 0) > 0 ? card.bankCardId : undefined,
      cardTypeId: Number(card.cardTypeId) || 0,
      cardName: (card.cardName || '').trim(),
      cardNumber: this.formatter.stripCreditCardFormatting(card.rawCardNumber || card.cardNumber || ''),
      costCodeId: Number(card.costCodeId) || 0
    }));
  }

  mapBankCardsFromResponse(cards?: BankCardResponse[] | null): BankCardResponse[] {
    if (!cards || cards.length === 0) return [];
    return cards.map(card => {
      const normalizedLastFour = this.normalizeBankCardLastFour(card.lastFour, card.cardNumber);
      const rawCardNumber = this.formatter.stripCreditCardFormatting(card.cardNumber || '');
      return {
        bankCardId: card.bankCardId,
        organizationId: card.organizationId,
        officeId: card.officeId,
        cardTypeId: Number(card.cardTypeId) || 0,
        cardName: card.cardName || '',
        displayName: card.displayName || '',
        cardNumber: this.formatBankCardNumberForDisplay(card.cardNumber, normalizedLastFour, (card.bankCardId || 0) > 0),
        rawCardNumber,
        lastFour: normalizedLastFour,
        costCodeId: Number(card.costCodeId) || 0
      };
    });
  }

  normalizeBankCardLastFour(lastFour?: string | null, cardNumber?: string | null): string {
    const raw = (lastFour || '').replace(/\D/g, '');
    if (raw.length >= 4) {
      return raw.slice(-4);
    }
    const source = (cardNumber || '').replace(/\D/g, '');
    return source.length >= 4 ? source.slice(-4) : '';
  }

  mapBankCardDisplay(card: BankCardResponse): string {
    if ((card?.bankCardId || 0) === 0) {
      return card?.cardNumber || '';
    }
    const digits = (card?.cardNumber || '').replace(/\D/g, '');
    const finalLastFour = this.normalizeBankCardLastFour(card?.lastFour, card?.cardNumber);
    if (!digits || !finalLastFour) return '';
    const starCount = Math.max(0, digits.length - finalLastFour.length);
    return `${'*'.repeat(starCount)}${finalLastFour}`;
  }

  private formatBankCardNumberForDisplay(cardNumber?: string | null, lastFour?: string | null, isPersisted: boolean = true): string {
    const raw = (cardNumber || '').replace(/\s+/g, '');
    if (!raw) {
      return '';
    }

    if (!isPersisted) {
      const editableDigits = raw.replace(/\D/g, '');
      return this.groupCardNumber(editableDigits);
    }

    const normalizedLastFour = this.normalizeBankCardLastFour(lastFour, cardNumber);
    let masked: string;
    if (raw.includes('*')) {
      masked = raw.replace(/[^*\d]/g, '');
    } else {
      const digits = raw.replace(/\D/g, '');
      if (!digits) {
        return '';
      }
      const suffix = normalizedLastFour || digits.slice(-4);
      const defaultTotalLength = 16;
      const starCount = digits.length > suffix.length
        ? digits.length - suffix.length
        : Math.max(0, defaultTotalLength - suffix.length);
      masked = `${'*'.repeat(starCount)}${suffix}`;
    }

    return this.groupCardNumber(masked);
  }

  private groupCardNumber(value: string): string {
    return (value.match(/.{1,4}/g) || []).join(' ');
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

  mapCostCodeUpdateRequest(costCode: CostCodesResponse, isActive: boolean): CostCodesRequest {
    return {
      costCodeId: costCode.costCodeId,
      organizationId: costCode.organizationId,
      officeId: costCode.officeId,
      costCode: costCode.costCode || '',
      transactionTypeId: costCode.transactionTypeId,
      description: costCode.description || '',
      isActive
    };
  }

  mapChartOfAccounts(
    accounts: ChartOfAccountResponse[],
    offices?: { officeId: number; name?: string }[],
    accountTypes?: { value: number; label: string }[]
  ): ChartOfAccountListDisplay[] {
    return accounts.map<ChartOfAccountListDisplay>(account => {
      const office = offices?.find(o => o.officeId === account.officeId);
      return {
        organizationId: account.organizationId,
        officeId: account.officeId,
        officeName: office?.name || '',
        accountId: account.accountId,
        accountNo: account.accountNo || '',
        accountTypeId: account.accountTypeId,
        accountType: getAccountTypeLabel(account.accountTypeId, accountTypes),
        name: account.name || '',
        isSubaccount: account.isSubaccount === true,
        isSubaccountDisplay: account.isSubaccount ? 'Yes' : 'No',
        subAccountId: account.subAccountId ?? null,
        description: account.description || '',
        note: account.note || ''
      };
    });
  }

  mapJournalEntryLineSearchResponse(raw: Record<string, unknown>): JournalEntryLineSearchResponse {
    const base = raw as unknown as JournalEntryLineSearchResponse;
    return {
      ...base,
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? base.journalEntryCode ?? ''),
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? base.propertyCode ?? '').trim() || null,
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? base.reservationCode ?? '').trim() || null,
      contactName: String(raw['contactName'] ?? raw['ContactName'] ?? base.contactName ?? '').trim() || null,
      transactionDate: this.utility.coerceCalendarDateStringFromApi(raw['transactionDate'] ?? raw['TransactionDate'] ?? base.transactionDate) ?? base.transactionDate ?? '',
      postingDate: this.utility.coerceCalendarDateStringFromApi(raw['postingDate'] ?? raw['PostingDate'] ?? base.postingDate) ?? base.postingDate ?? ''
    };
  }

  mapJournalEntryResponse(raw: Record<string, unknown>): JournalEntryResponse {
    const base = raw as unknown as JournalEntryResponse;
    const rawLines = (raw['journalEntryLines'] ?? raw['JournalEntryLines'] ?? base.journalEntryLines ?? []) as Record<string, unknown>[];
    return {
      ...base,
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? base.journalEntryCode ?? ''),
      transactionDate: this.utility.coerceCalendarDateStringFromApi(raw['transactionDate'] ?? raw['TransactionDate'] ?? base.transactionDate) ?? base.transactionDate ?? '',
      postingDate: this.utility.coerceCalendarDateStringFromApi(raw['postingDate'] ?? raw['PostingDate'] ?? base.postingDate) ?? base.postingDate ?? '',
      journalEntryLines: rawLines.map(line => this.mapJournalEntryLineResponse(line))
    };
  }

  mapJournalEntryLineResponse(raw: Record<string, unknown>): JournalEntryLineResponse {
    const base = raw as unknown as JournalEntryLineResponse;
    return {
      ...base,
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? base.propertyCode ?? '').trim() || null,
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? base.reservationCode ?? '').trim() || null,
      contactName: String(raw['contactName'] ?? raw['ContactName'] ?? base.contactName ?? '').trim() || null
    };
  }

  mapJournalEntryLineListDisplay(
    lines: JournalEntryLineSearchResponse[],
    chartOfAccounts?: ChartOfAccountResponse[],
    sourceTypes?: { value: number; label: string }[]
  ): JournalEntryLineListDisplay[] {
    const sortedLines = [...(lines ?? [])].sort((left, right) => {
      const dateCompare = (left.transactionDate || '').localeCompare(right.transactionDate || '');
      if (dateCompare !== 0) {
        return dateCompare;
      }

      const createdCompare = (left.createdOn || '').localeCompare(right.createdOn || '');
      if (createdCompare !== 0) {
        return createdCompare;
      }

      return (left.journalEntryLineId || '').localeCompare(right.journalEntryLineId || '');
    });

    let runningBalance = 0;

    return sortedLines.map(line => {
      const transactionDate = line.transactionDate || '';
      const description = (line.memo || line.journalEntryMemo || '').trim();
      const debitValue = Number(line.debit) || 0;
      const creditValue = Number(line.credit) || 0;
      const sortDateValue = transactionDate ? Date.parse(`${transactionDate}T00:00:00`) : 0;
      const account = chartOfAccounts?.find(item =>
        item.accountId === line.chartOfAccountId &&
        item.officeId === line.officeId
      );
      const accountNo = (account?.accountNo || '').trim();
      const accountName = (account?.name || '').trim();
      const accountLabel = accountNo && accountName
        ? `${accountNo}:${accountName}`
        : accountNo || accountName || String(line.chartOfAccountId);
      runningBalance += debitValue - creditValue;

      return {
        journalEntryLineId: line.journalEntryLineId,
        journalEntryId: line.journalEntryId,
        officeId: line.officeId,
        transactionDate: this.formatter.formatDateString(transactionDate),
        journalEntryCode: (line.journalEntryCode || '').trim(),
        source: getSourceTypeLabel(line.sourceTypeId, sourceTypes),
        propertyCode: (line.propertyCode || '').trim(),
        reservationCode: (line.reservationCode || '').trim(),
        contactId: line.contactId ?? null,
        contactName: (line.contactName || '').trim(),
        account: accountLabel,
        description,
        debit: debitValue ? this.formatter.currency(debitValue) : '',
        credit: creditValue ? this.formatter.currency(creditValue) : '',
        balance: this.formatter.currency(runningBalance),
        debitValue,
        creditValue,
        balanceValue: runningBalance,
        isPosted: line.isPosted,
        isVoided: line.isVoided,
        sortDateValue
      };
    });
  }

  mapJournalEntryLineDetailDisplay(
    lines: JournalEntryLineResponse[],
    chartOfAccounts?: ChartOfAccountResponse[],
    officeId?: number | null
  ): JournalEntryLineDetailDisplay[] {
    return (lines ?? []).map((line, index) => {
      const account = chartOfAccounts?.find(item =>
        item.accountId === line.chartOfAccountId &&
        (officeId == null || item.officeId === officeId)
      );
      const debitValue = Number(line.debit) || 0;
      const creditValue = Number(line.credit) || 0;

      const accountNo = (account?.accountNo || '').trim();
      const accountName = (account?.name || '').trim();
      const accountLabel = accountNo && accountName
        ? `${accountNo}:${accountName}`
        : accountNo || accountName || String(line.chartOfAccountId);

      return {
        lineNo: index + 1,
        journalEntryLineId: line.journalEntryLineId,
        chartOfAccountId: line.chartOfAccountId,
        account: accountLabel,
        propertyCode: (line.propertyCode || '').trim(),
        reservationCode: (line.reservationCode || '').trim(),
        contactName: (line.contactName || '').trim(),
        memo: line.memo || '',
        debit: debitValue ? this.formatter.currency(debitValue) : '',
        credit: creditValue ? this.formatter.currency(creditValue) : '',
        debitValue,
        creditValue
      };
    });
  }

  mapInvoiceResponse(raw: Record<string, unknown>): InvoiceResponse {
    const base = raw as unknown as InvoiceResponse;
    const invoiceDate =
      this.utility.coerceCalendarDateStringFromApi(raw['invoiceDate'] ?? raw['InvoiceDate'] ?? base.invoiceDate) ??
      base.invoiceDate ??
      '';
    const dueDate =
      this.utility.coerceCalendarDateStringFromApi(raw['dueDate'] ?? raw['DueDate'] ?? base.dueDate) ??
      invoiceDate;
    const accountingPeriod =
      this.utility.coerceCalendarDateStringFromApi(
        raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? base.accountingPeriod
      ) ?? this.firstDayOfMonthCalendarDate(invoiceDate);
    const createdOn =
      this.utility.coerceDateTimeOffsetStringFromApi(raw['createdOn'] ?? raw['CreatedOn'] ?? base.createdOn) ??
      base.createdOn ??
      '';
    const modifiedOn =
      this.utility.coerceDateTimeOffsetStringFromApi(raw['modifiedOn'] ?? raw['ModifiedOn'] ?? base.modifiedOn) ??
      base.modifiedOn ??
      '';
    const invoicePeriod = String(raw['invoicePeriod'] ?? raw['InvoicePeriod'] ?? base.invoicePeriod ?? '');
    const { startDate, endDate } = this.utility.invoicePeriodStartEnd(
      invoicePeriod,
      base.startDate,
      base.endDate
    );

    return {
      ...base,
      invoiceDate,
      dueDate,
      accountingPeriod,
      invoicePeriod: invoicePeriod || base.invoicePeriod,
      startDate,
      endDate,
      createdOn,
      modifiedOn,
      ledgerLines: base.ledgerLines ?? []
    };
  }

  /** First calendar day of the month for `YYYY-MM-DD` (or `YYYY-MM` prefix). */
  private firstDayOfMonthCalendarDate(calendarDate: string): string {
    const match = /^(\d{4})-(\d{2})/.exec(calendarDate.trim());
    if (!match) {
      return calendarDate;
    }
    return `${match[1]}-${match[2]}-01`;
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
          ? this.utility.getCostCodeDropdownLabel(matchingCostCode)
          : this.utility.getCostCodeDropdownLabel(null, costCodeId ?? undefined),
        transactionType: transactionTypeLabel, // Translated from CostCode.transactionTypeId
        description: line.description || '',
        amount: line.amount,
        ledgerLineDate: line.ledgerLineDate,
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
      propertyCode: email?.propertyCode ?? '',
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
      ticketId: alert?.ticketId ?? undefined,
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

  //#region Ticket Mapping
  mapTicketToDisplay(ticket: TicketResponse, ticketStateTypeOptions: string[]): TicketListDisplay {
    return {
      ...ticket,
      ticketCode: ticket.ticketCode || '',
      created: this.formatter.formatDateString(ticket.createdOn) || '',
      modified: this.formatter.formatDateString(ticket.modifiedOn) || '',
      propertyCode: ticket.propertyCode || '',
      reservationCode: ticket.reservationCode || '',
      assigneeName: ticket.assigneeName || ticket.assignee || '',
      agentName: ticket.agentName || ticket.agent || '',
      title: ticket.title || '',
      propertyId: ticket.propertyId || '',
      reservationId: ticket.reservationId || '',
      description: ticket.description || '',
      isActive: ticket.isActive,
      ticketStateTypeText: this.mapTicketStateDropdownCell(getTicketStateType(ticket.ticketStateTypeId), ticketStateTypeOptions)
    } as TicketListDisplay;
  }

  mapTicketStateDropdownCell(label: string, ticketStateTypeOptions: string[]): TicketStateDropdownCell {
    const normalizedLabel = label || '';
    return {
      value: normalizedLabel,
      isOverridable: true,
      options: ticketStateTypeOptions,
      panelClass: ['datatable-dropdown-panel', 'datatable-dropdown-panel-open-left'],
      toString: () => normalizedLabel
    };
  }

  mapTicketUpdateRequest(ticket: TicketResponse, updates: Partial<TicketRequest>): TicketRequest {
    return {
      ticketId: ticket.ticketId,
      organizationId: ticket.organizationId,
      officeId: ticket.officeId,
      propertyId: ticket.propertyId ?? null,
      assigneeId: ticket.assigneeId ?? null,
      agentId: ticket.agentId ?? null,
      reservationId: ticket.reservationId ?? null,
      ticketCode: ticket.ticketCode ?? null,
      title: ticket.title,
      description: ticket.description,
      ticketStateTypeId: ticket.ticketStateTypeId,
      needPermissionToEnter: ticket.needPermissionToEnter,
      permissionGranted: ticket.permissionGranted,
      ownerContacted: ticket.ownerContacted,
      confirmedWithTenant: ticket.confirmedWithTenant,
      followedUpWithOwner: ticket.followedUpWithOwner,
      workOrderCompleted: ticket.workOrderCompleted,
      notes: ticket.notes && ticket.notes.length > 0
        ? ticket.notes.map(note => ({
            ticketNoteId: note.ticketNoteId,
            ticketId: note.ticketId,
            note: note.note
          }))
        : null,
      isActive: ticket.isActive,
      ...updates
    };
  }
  //#endregion

  //#region Lead mapping
  mapLeadRentalListRow(lead: LeadRentalResponse): LeadRentalListDisplay {
    const stateLabel = formatLeadStateLabel(lead.leadStateId);
    const fullName = [lead.firstName, lead.lastName].map(part => String(part || '').trim()).filter(part => part !== '').join(' ') || '—';
    const phone = this.formatter.phoneNumber(lead.phone || '') || null;
    const createdOn = this.formatter.formatDateTimeString(lead.createdOn) || (lead.createdOn ?? '');
    const modifiedOn = this.formatter.formatDateTimeString(lead.modifiedOn) || (lead.modifiedOn ?? '');
    const modifiedByName = String(lead.modifiedByName ?? '').trim() || (lead.modifiedBy ?? '');
    return {
      ...lead,
      phone,
      createdOn,
      modifiedOn,
      modifiedByName,
      quotePath: lead.quotePath ?? null,
      fullName,
      leadAttentionDot: '',
      leadStateDropdown: {
        value: stateLabel,
        isOverridable: true,
        toString: () => stateLabel
      },
      isActive: lead.isActive !== false
    };
  }

  mapLeadGeneralListRow(lead: LeadGeneralResponse): LeadGeneralListDisplay {
    const trimmedMessage = String(lead.message ?? '').trim();
    const messagePreview =
      trimmedMessage.length === 0 ? '—' : trimmedMessage.length <= 30 ? trimmedMessage : `${trimmedMessage.slice(0, 30)}...`;
    const stateLabel = formatLeadStateLabel(lead.leadStateId);
    const fullName = [lead.firstName, lead.lastName].map(part => String(part || '').trim()).filter(part => part !== '').join(' ') || '—';
    const phone = this.formatter.phoneNumber(lead.phone || '') || null;
    const createdOn = this.formatter.formatDateTimeString(lead.createdOn) || (lead.createdOn ?? '');
    const modifiedOn = this.formatter.formatDateTimeString(lead.modifiedOn) || (lead.modifiedOn ?? '');
    const modifiedByName = String(lead.modifiedByName ?? '').trim() || (lead.modifiedBy ?? '');
    return {
      ...lead,
      phone,
      createdOn,
      modifiedOn,
      modifiedByName,
      fullName,
      leadAttentionDot: '',
      messagePreview,
      leadStateDropdown: {
        value: stateLabel,
        isOverridable: true,
        toString: () => stateLabel
      },
      isActive: lead.isActive !== false
    };
  }

  mapLeadGeneralListRowToUpdateRequest(row: LeadGeneralListDisplay, isActive: boolean): LeadGeneralUpdateRequest {
    const { fullName, messagePreview, leadAttentionDot, leadStateDropdown, ...rest } = row;
    return {
      ...rest,
      isActive
    };
  }

  mapLeadGeneralToRentalRequest(lead: LeadGeneralListDisplay): LeadRentalRequest {
    return {
      leadStateId: lead.leadStateId,
      officeId: lead.officeId,
      agentId: null,
      firstName: this.utility.trimOrNull(lead.firstName),
      lastName: this.utility.trimOrNull(lead.lastName),
      email: this.utility.trimOrNull(lead.email),
      phone: this.utility.trimOrNull(lead.phone),
      desiredLocation: null,
      propertyRefId: null,
      estimatedArrivalDate: null,
      estimatedDepartureDate: null,
      maxMonthlyBudget: null,
      minBedrooms: null,
      numberOfOccupants: null,
      whatBringsYouToTown: null,
      howDidYouFindUs: null,
      tellUsMoreAboutHowYouFoundUs: null,
      petFriendly: null,
      decisionDate: null,
      organizationName: null,
      additionalInformation: this.utility.trimOrNull(lead.message),
      notes: null,
      quotePath: null,
      iNeedAsap: false,
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: lead.isActive
    };
  }

  mapLeadGeneralToOwnerRequest(lead: LeadGeneralListDisplay): LeadOwnerRequest {
    return {
      leadStateId: lead.leadStateId,
      officeId: lead.officeId,
      agentId: null,
      firstName: this.utility.trimOrNull(lead.firstName),
      lastName: this.utility.trimOrNull(lead.lastName),
      email: this.utility.trimOrNull(lead.email),
      phone: this.utility.trimOrNull(lead.phone),
      locationOfProperty: null,
      programInterest: null,
      whatIsPromptingContact: null,
      timeFrame: null,
      targetRentReadyDate: null,
      propertyGoals: this.utility.trimOrNull(lead.message),
      tellUsMoreAboutYourGoals: null,
      yearsOfExperienceWithRentals: null,
      tellUsMoreAboutProperty: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      numberOfBeds: null,
      numberOfBaths: null,
      approxSqFootage: null,
      propertyTypeId: null,
      propertyCode: null,
      propertyOffice: null,
      tellUsWhatYouLikeMostAboutYourProperty: null,
      tellUsAnyDrawbacks: null,
      preferredContactMethod: null,
      timeDateForContact: null,
      notes: null,
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: lead.isActive
    };
  }

  mapContactToOwnerLeadRequest(contact: ContactResponse): LeadOwnerRequest {
    return {
      officeId: Number(contact.officeId),
      leadStateId: 1,
      agentId: null,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      email: String(contact.email ?? '').trim() || null,
      phone: contact.phone ?? null,
      locationOfProperty: null,
      programInterest: null,
      whatIsPromptingContact: null,
      timeFrame: null,
      targetRentReadyDate: null,
      propertyGoals: null,
      tellUsMoreAboutYourGoals: null,
      yearsOfExperienceWithRentals: null,
      tellUsMoreAboutProperty: null,
      address: contact.address1 ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      zip: contact.zip ?? null,
      numberOfBeds: null,
      numberOfBaths: null,
      approxSqFootage: null,
      propertyTypeId: null,
      propertyCode: null,
      propertyOffice: null,
      tellUsWhatYouLikeMostAboutYourProperty: null,
      tellUsAnyDrawbacks: null,
      preferredContactMethod: null,
      timeDateForContact: null,
      notes: null,
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: false
    };
  }

  mapContactToOwnerLeadLinkRequest(contact: ContactResponse, ownerLeadId: number): ContactRequest {
    return this.mapContactResponseToUpdateRequest(contact, { ownerLeadId });
  }

  mapLeadOwnerListRow(lead: LeadOwnerResponse): LeadOwnerListDisplay {
    const stateLabel = formatLeadStateLabel(lead.leadStateId);
    const fullName = [lead.firstName, lead.lastName].map(part => String(part || '').trim()).filter(part => part !== '').join(' ') || '—';
    const phone = this.formatter.phoneNumber(lead.phone || '') || null;
    const createdOn = this.formatter.formatDateTimeString(lead.createdOn) || (lead.createdOn ?? '');
    const modifiedOn = this.formatter.formatDateTimeString(lead.modifiedOn) || (lead.modifiedOn ?? '');
    const modifiedByName = String(lead.modifiedByName ?? '').trim() || (lead.modifiedBy ?? '');
    return {
      ...lead,
      phone,
      createdOn,
      modifiedOn,
      modifiedByName,
      fullName,
      leadAttentionDot: '',
      leadStateDropdown: {
        value: stateLabel,
        isOverridable: true,
        toString: () => stateLabel
      },
      isActive: lead.isActive !== false
    };
  }

  mapLeadRentalListRowToUpdateRequest(row: LeadRentalListDisplay, isActive: boolean): LeadRentalRequest {
    const { fullName, leadAttentionDot, leadStateDropdown, ...rest } = row;
    return {
      ...rest,
      quotePath: rest.quotePath ?? null,
      isActive,
      iNeedAsap: rest.iNeedAsap ?? false,
      emailPhoneConsent: rest.emailPhoneConsent ?? false,
      smsConsent: rest.smsConsent ?? false
    };
  }

  mapLeadRentalResponseToUpdateRequest(lead: LeadRentalResponse, quotePathOverride?: string | null): LeadRentalRequest {
    return {
      rentalId: lead.rentalId,
      leadStateId: lead.leadStateId,
      officeId: lead.officeId,
      agentId: lead.agentId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      desiredLocation: lead.desiredLocation,
      propertyRefId: lead.propertyRefId,
      estimatedArrivalDate: lead.estimatedArrivalDate,
      estimatedDepartureDate: lead.estimatedDepartureDate,
      maxMonthlyBudget: lead.maxMonthlyBudget,
      minBedrooms: lead.minBedrooms,
      numberOfOccupants: lead.numberOfOccupants,
      whatBringsYouToTown: lead.whatBringsYouToTown,
      howDidYouFindUs: lead.howDidYouFindUs,
      tellUsMoreAboutHowYouFoundUs: lead.tellUsMoreAboutHowYouFoundUs,
      petFriendly: lead.petFriendly,
      decisionDate: lead.decisionDate,
      organizationName: lead.organizationName,
      additionalInformation: lead.additionalInformation,
      notes: lead.notes,
      quotePath: quotePathOverride ?? lead.quotePath ?? null,
      iNeedAsap: lead.iNeedAsap ?? false,
      emailPhoneConsent: lead.emailPhoneConsent ?? false,
      smsConsent: lead.smsConsent ?? false,
      isActive: lead.isActive ?? false
    };
  }

  mapLeadOwnerListRowToUpdateRequest(row: LeadOwnerListDisplay, isActive: boolean): LeadOwnerUpdateRequest {
    const { fullName, leadAttentionDot, leadStateDropdown, ...rest } = row;
    return {
      ...rest,
      isActive,
      emailPhoneConsent: rest.emailPhoneConsent ?? false,
      smsConsent: rest.smsConsent ?? false
    };
  }

  mapLeadOwnerResponseToUpdateRequest(lead: LeadOwnerResponse): LeadOwnerUpdateRequest {
    return {
      ownerId: lead.ownerId,
      officeId: lead.officeId,
      leadStateId: lead.leadStateId,
      agentId: lead.agentId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      locationOfProperty: lead.locationOfProperty,
      programInterest: lead.programInterest,
      whatIsPromptingContact: lead.whatIsPromptingContact,
      timeFrame: lead.timeFrame,
      targetRentReadyDate: lead.targetRentReadyDate,
      propertyGoals: lead.propertyGoals,
      tellUsMoreAboutYourGoals: lead.tellUsMoreAboutYourGoals,
      yearsOfExperienceWithRentals: lead.yearsOfExperienceWithRentals,
      tellUsMoreAboutProperty: lead.tellUsMoreAboutProperty,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      adjustedGrossRentTarget: lead.adjustedGrossRentTarget ?? null,
      onlineFee: lead.onlineFee ?? null,
      onlineClean: lead.onlineClean ?? null,
      workingBalance: lead.workingBalance ?? null,
      annualLinenAmount: lead.annualLinenAmount ?? null,
      offlineFee: lead.offlineFee ?? null,
      purchaseKitchenItems: lead.purchaseKitchenItems ?? false,
      kitchenBudget: lead.kitchenBudget ?? null,
      furnishUnit: lead.furnishUnit ?? false,
      furnishBudget: lead.furnishBudget ?? null,
      oneBedroom: lead.oneBedroom ?? false,
      twoBedroom: lead.twoBedroom ?? false,
      threeBedroom: lead.threeBedroom ?? false,
      numberOfBeds: lead.numberOfBeds,
      numberOfBaths: lead.numberOfBaths,
      approxSqFootage: lead.approxSqFootage,
      propertyTypeId: lead.propertyTypeId,
      propertyCode: lead.propertyCode,
      propertyOffice: lead.propertyOffice,
      tellUsWhatYouLikeMostAboutYourProperty: lead.tellUsWhatYouLikeMostAboutYourProperty,
      tellUsAnyDrawbacks: lead.tellUsAnyDrawbacks,
      preferredContactMethod: lead.preferredContactMethod,
      timeDateForContact: lead.timeDateForContact,
      notes: lead.notes,
      emailPhoneConsent: lead.emailPhoneConsent ?? false,
      smsConsent: lead.smsConsent ?? false,
      isActive: lead.isActive ?? false
    };
  }

  mapLeadRentalReportRows(rows: LeadRentalResponse[]): UnifiedLeadRow[] {
    return (rows || []).map(row => {
      const source = row as unknown as Record<string, unknown>;
      return {
        leadType: 'Rental',
        officeId: Number(row.officeId || 0),
        leadStateId: Number(row.leadStateId || 0),
        agentId: row.agentId,
        agentLabel: this.resolveLeadReportAgentLabelFromPayload(source, row.agentId),
        createdOn: this.resolveLeadReportCreatedOn(source)
      };
    });
  }

  mapLeadOwnerReportRows(rows: LeadOwnerResponse[]): UnifiedLeadRow[] {
    return (rows || []).map(row => {
      const source = row as unknown as Record<string, unknown>;
      return {
        leadType: 'Owner',
        officeId: Number(row.officeId || 0),
        leadStateId: Number(row.leadStateId || 0),
        agentId: row.agentId,
        agentLabel: this.resolveLeadReportAgentLabelFromPayload(source, row.agentId),
        createdOn: this.resolveLeadReportCreatedOn(source)
      };
    });
  }

  mapLeadGeneralReportRows(rows: LeadGeneralResponse[]): UnifiedLeadRow[] {
    return (rows || []).map(row => {
      const source = row as unknown as Record<string, unknown>;
      return {
        leadType: 'General',
        officeId: Number(row.officeId || 0),
        leadStateId: Number(row.leadStateId || 0),
        agentId: null,
        agentLabel: 'N/A (General)',
        createdOn: this.resolveLeadReportCreatedOn(source)
      };
    });
  }

  resolveLeadReportAgentLabelFromPayload(source: Record<string, unknown>, fallbackAgentId: string | null): string {
    const agentName = String(source['agentName'] ?? '').trim();
    if (agentName) {
      return agentName;
    }
    const agentCode = String(source['agentCode'] ?? '').trim();
    if (agentCode) {
      return agentCode;
    }
    const agentId = String(fallbackAgentId || '').trim();
    return agentId || 'Unassigned';
  }

  resolveLeadReportCreatedOn(source: Record<string, unknown>): Date | null {
    const rawCreatedOn =
      source['createdOn']
      ?? source['CreatedOn']
      ?? source['createdDate']
      ?? source['CreatedDate']
      ?? source['dateCreated']
      ?? source['DateCreated']
      ?? null;
    if (!rawCreatedOn) {
      return null;
    }
    return this.utility.parseCalendarDateInput(String(rawCreatedOn));
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
        contactName: this.resolvePropertyListContactName(o),
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
        onlineChecked: o.onlineChecked === true,
        offlineChecked: o.offlineChecked === true,
        externalCalendar: o.externalCalendar ?? null,
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
      onlineChecked: pm.onlineChecked === true,
      offlineChecked: pm.offlineChecked === true,
      isActive: true
    };
  }

  resolvePropertyListContactName(property: PropertyListResponse): string {
    const contactName = String(property.contactName || '').trim();
    const leaseTypeId = Number(property.propertyLeaseTypeId);
    const isVendorLeaseType = leaseTypeId === PropertyLeaseType.Direct || leaseTypeId === PropertyLeaseType.ThirdParty;
    if (!isVendorLeaseType) {
      return contactName;
    }

    const raw = property as unknown as Record<string, unknown>;
    const vendorCompanyName = String(raw['vendorCompanyName'] ?? raw['companyName'] ?? raw['vendorName'] ?? '').trim();
    const vendorFirstName = String(raw['vendorFirstName'] ?? raw['firstName'] ?? '').trim();
    const vendorLastName = String(raw['vendorLastName'] ?? raw['lastName'] ?? '').trim();

    return this.utility.getVendorDropdownLabel({
      companyName: vendorCompanyName || contactName,
      firstName: vendorFirstName,
      lastName: vendorLastName
    });
  }

  mapPropertyResponse(raw: Record<string, unknown>): PropertyResponse {
    const leaseTypeId = raw['propertyLeaseTypeId'] ?? raw['propertyLeaseId'];
    const rest = { ...(raw as Record<string, unknown>) };
    delete rest['propertyLeaseTypeId'];
    delete rest['propertyLeaseId'];
    delete rest['bldgNo'];
    const bldgNoRaw = raw['bldgNo'];
    const bldgNo = bldgNoRaw != null && String(bldgNoRaw).trim() !== '' ? String(bldgNoRaw).trim() : undefined;
    const description = raw['description'] ?? raw['Description'];
    const amenities = raw['amenities'] ?? raw['Amenities'];
    const notes = raw['notes'] ?? raw['Notes'];
    const externalCalendar = raw['externalCalendar'] ?? raw['ExternalCalendar'];
    return {
      ...rest,
      propertyLeaseTypeId: Number(leaseTypeId ?? 0),
      description: description == null ? null : String(description),
      amenities: amenities == null ? null : String(amenities),
      notes: notes == null ? null : String(notes),
      externalCalendar: externalCalendar == null ? null : String(externalCalendar),
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

  mapWorkOrderUpdateRequest(
    sourceWorkOrder: WorkOrderResponse,
    changedCheckboxColumn: 'isActive' | 'enteredInQb',
    nextValue: boolean
  ): WorkOrderRequest {
    return {
      workOrderId: sourceWorkOrder.workOrderId,
      workOrderCode: sourceWorkOrder.workOrderCode,
      organizationId: sourceWorkOrder.organizationId,
      officeId: sourceWorkOrder.officeId,
      propertyId: sourceWorkOrder.propertyId,
      reservationId: sourceWorkOrder.reservationId ?? null,
      reservationCode: sourceWorkOrder.reservationCode ?? null,
      description: sourceWorkOrder.description ?? '',
      workOrderTypeId: sourceWorkOrder.workOrderTypeId,
      applyMarkup: sourceWorkOrder.applyMarkup === true,
      workOrderDate: sourceWorkOrder.workOrderDate,
      useDepartureFee: sourceWorkOrder.useDepartureFee === true,
      workOrderItems: (sourceWorkOrder.workOrderItems || []).map(item => ({
        workOrderItemId: item.workOrderItemId,
        workOrderId: item.workOrderId,
        description: item.description ?? '',
        receiptId: item.receiptId,
        laborHours: item.laborHours ?? 0,
        laborCost: item.laborCost ?? 0,
        itemAmount: item.itemAmount ?? 0
      })),
      isActive: changedCheckboxColumn === 'isActive' ? nextValue : sourceWorkOrder.isActive,
      enteredInQb: changedCheckboxColumn === 'enteredInQb' ? nextValue : sourceWorkOrder.enteredInQb
    };
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
        workOrderDate: this.formatter.formatDateString(workOrder.workOrderDate),
        enteredInQb: workOrder.enteredInQb === true,
        isActive: workOrder.isActive,
        createdBy: workOrder.createdBy ?? workOrder.modifiedBy ?? ''
      };
    });
  }

  mapReceiptResponse(raw: ReceiptResponse | Record<string, unknown>): ReceiptResponse {
    const base = raw as ReceiptResponse;
    const rawRecord = raw as Record<string, unknown>;
    const receiptDate =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['receiptDate'] ?? rawRecord['ReceiptDate'] ?? base.receiptDate
      ) ??
      base.receiptDate ??
      '';
    const dueDate =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['dueDate'] ?? rawRecord['DueDate'] ?? base.dueDate
      ) ??
      receiptDate;
    const accountingPeriod =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['accountingPeriod'] ?? rawRecord['AccountingPeriod'] ?? base.accountingPeriod
      ) ??
      receiptDate;
    const billNumberRaw = rawRecord['billNumber'] ?? rawRecord['BillNumber'] ?? base.billNumber;
    const billNumber =
      billNumberRaw == null || String(billNumberRaw).trim().length === 0
        ? null
        : String(billNumberRaw).trim();
    const paidDate =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['paidDate'] ?? rawRecord['PaidDate'] ?? base.paidDate
      ) ?? null;
    const createdOn =
      this.utility.coerceDateTimeOffsetStringFromApi(
        rawRecord['createdOn'] ?? rawRecord['CreatedOn'] ?? base.createdOn
      ) ??
      base.createdOn ??
      '';
    const invoiceIdRaw = rawRecord['invoiceId'] ?? rawRecord['InvoiceId'] ?? base.invoiceId;
    const invoiceId = invoiceIdRaw == null || String(invoiceIdRaw).trim().length === 0
      ? null
      : String(invoiceIdRaw).trim();
    const receiptCodeRaw = rawRecord['receiptCode'] ?? rawRecord['ReceiptCode'] ?? base.receiptCode;
    const receiptCode = String(receiptCodeRaw ?? base.receiptCode ?? '').trim();
    const receiptGuidRaw = rawRecord['receiptGuid'] ?? rawRecord['ReceiptGuid'] ?? base.receiptGuid;
    const receiptGuid = String(receiptGuidRaw ?? base.receiptGuid ?? '').trim();
    const paymentTypeIdRaw = rawRecord['paymentTypeId'] ?? rawRecord['PaymentTypeId'] ?? base.paymentTypeId;
    const paymentTypeId = paymentTypeIdRaw == null ? 0 : Number(paymentTypeIdRaw);
    const checkPrintedRaw = rawRecord['checkPrinted'] ?? rawRecord['CheckPrinted'] ?? base.checkPrinted;
    const checkPrinted = checkPrintedRaw === true || checkPrintedRaw === 'true' || checkPrintedRaw === 1;

    return {
      ...base,
      receiptDate,
      dueDate,
      accountingPeriod,
      billNumber,
      paidDate,
      createdOn,
      invoiceId,
      receiptCode,
      receiptGuid,
      paymentTypeId: Number.isFinite(paymentTypeId) ? paymentTypeId : 0,
      checkPrinted,
      splits: this.mapReceiptSplitsFromApi(base.splits)
    };
  }

  mapReceiptSplitsFromApi(splits: Split[] | undefined | null): Split[] {
    const mapped = (splits || []).map(split => this.mapReceiptSplitFromApi(split));
    const seenSplitIds = new Set<number>();
    return mapped.filter(split => {
      const splitId = Number(split.receiptSplitId ?? 0);
      if (!Number.isFinite(splitId) || splitId <= 0) {
        return true;
      }
      if (seenSplitIds.has(splitId)) {
        return false;
      }
      seenSplitIds.add(splitId);
      return true;
    });
  }

  readSplitChartOfAccountId(split: Split | Record<string, unknown> | undefined | null): number | null {
    if (!split) {
      return null;
    }
    const record = split as Split & Record<string, unknown>;
    const accountId = Number(
      record.chartOfAccountId
      ?? record['ChartOfAccountId']
      ?? record.accountId
      ?? record['AccountId']
      ?? 0
    );
    return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
  }

  mapReceiptSplitFromApi(raw: Split | Record<string, unknown>): Split {
    const record = raw as Split & Record<string, unknown>;
    const chartOfAccountId = this.readSplitChartOfAccountId(record) ?? undefined;
    const receiptTypeId = Number(record.receiptTypeId ?? record['ReceiptTypeId'] ?? 0);
    return {
      receiptSplitId: (record.receiptSplitId ?? record['ReceiptSplitId'] ?? null) as number | null,
      amount: Number(record.amount ?? record['Amount'] ?? 0) || 0,
      description: String(record.description ?? record['Description'] ?? '').trim(),
      workOrderId: (record.workOrderId ?? record['WorkOrderId'] ?? null) as string | null,
      workOrderCode: String(record.workOrderCode ?? record['WorkOrderCode'] ?? record.workOrder ?? record['WorkOrder'] ?? '').trim(),
      workOrder: String(record.workOrder ?? record['WorkOrder'] ?? record.workOrderCode ?? record['WorkOrderCode'] ?? '').trim(),
      receiptTypeId: Number.isFinite(receiptTypeId) ? receiptTypeId : 0,
      chartOfAccountId: chartOfAccountId ?? null,
      accountId: chartOfAccountId ?? null,
      chartOfAccountDisplayName: String(
        record.chartOfAccountDisplayName ?? record['ChartOfAccountDisplayName'] ?? ''
      ).trim() || null
    };
  }

  mapReceiptSplitsForRequest(splits: Split[] | undefined | null): Split[] {
    return this.mapReceiptSplitsFromApi(splits).map(split => {
      const chartOfAccountId = this.readSplitChartOfAccountId(split);
      return {
        receiptSplitId: split.receiptSplitId ?? null,
        amount: Number(split.amount) || 0,
        description: String(split.description ?? '').trim(),
        workOrderId: split.workOrderId ?? null,
        workOrderCode: split.workOrderCode != null && String(split.workOrderCode).trim().length > 0
          ? String(split.workOrderCode).trim()
          : '',
        workOrder: split.workOrder != null && String(split.workOrder).trim().length > 0
          ? String(split.workOrder).trim()
          : '',
        receiptTypeId: split.receiptTypeId ?? 0,
        chartOfAccountId,
        accountId: chartOfAccountId
      };
    });
  }

  mapReceiptUpdateRequest(
    receipt: ReceiptResponse,
    updates: Partial<Pick<ReceiptRequest, 'bankCardId' | 'vendorId' | 'vendorName' | 'receiptDate' | 'isActive'>> = {}
  ): ReceiptRequest {
    const hasBankCardId = Object.prototype.hasOwnProperty.call(updates, 'bankCardId');
    const hasVendorId = Object.prototype.hasOwnProperty.call(updates, 'vendorId');
    const hasVendorName = Object.prototype.hasOwnProperty.call(updates, 'vendorName');
    const hasReceiptDate = Object.prototype.hasOwnProperty.call(updates, 'receiptDate');
    const hasIsActive = Object.prototype.hasOwnProperty.call(updates, 'isActive');

    return {
      receiptId: receipt.receiptId,
      organizationId: receipt.organizationId,
      officeId: receipt.officeId,
      propertyIds: [...(receipt.propertyIds || [])],
      receiptDate: hasReceiptDate ? (updates.receiptDate || '') : (receipt.receiptDate || ''),
      dueDate: receipt.dueDate,
      accountingPeriod: receipt.accountingPeriod,
      billNumber: receipt.billNumber ?? null,
      ticketId: receipt.ticketId || '',
      amount: Number(receipt.amount) || 0,
      paidAmount: Number(receipt.paidAmount ?? 0) || 0,
      paidDate: receipt.paidDate ?? null,
      description: String(receipt.description ?? '').trim(),
      bankCardId: hasBankCardId ? (updates.bankCardId ?? null) : (receipt.bankCardId ?? null),
      vendorId: hasVendorId ? (updates.vendorId ?? null) : (receipt.vendorId ?? null),
      vendorName: hasVendorName ? (updates.vendorName ?? null) : (receipt.vendorName ?? null),
      splits: this.mapReceiptSplitsForRequest(receipt.splits),
      receiptPath: receipt.receiptPath ?? null,
      isActive: hasIsActive ? (updates.isActive ?? receipt.isActive) : receipt.isActive
    };
  }

  mapReceiptDisplays(receipts: ReceiptResponse[]): ReceiptDisplayList[] {
    return (receipts || []).map((receipt: ReceiptResponse): ReceiptDisplayList => {
      const splits = this.mapReceiptSplitsFromApi(receipt.splits);
      const splitTotalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
      const receiptAmount = Number(receipt.amount) || 0;
      const distinctWorkOrders = Array.from(
        new Set(
          splits
            .map(split => (split.workOrder || '').trim())
            .filter(code => code.length > 0)
        )
      );
      const distinctReceiptTypes = Array.from(
        new Set(
          splits
            .map(split => getReceiptType(split.receiptTypeId))
            .filter(typeLabel => typeLabel.length > 0)
        )
      );
      const workOrderDisplay = distinctWorkOrders.join(', ');
      const receiptTypeDisplay = distinctReceiptTypes.join(', ');
      const distinctAccounts = Array.from(
        new Set(
          splits
            .map(split => (split.chartOfAccountDisplayName || '').trim())
            .filter(label => label.length > 0)
        )
      );
      const accountDisplay = distinctAccounts.join(', ');
      const isFirstSplitBill = Number(receipt.bankCardId ?? 0) === 0;
      const vendorDisplay = (receipt.vendorName || '').trim();
      const isSplitAmountValid = splitTotalAmount <= receiptAmount;
      const paidAmountValue = Number((receipt as ReceiptResponse & { paidAmount?: number }).paidAmount ?? 0) || 0;
      const dueAmountValue = Math.max(0, receiptAmount - paidAmountValue);

      return {
        receiptId: receipt.receiptId,
        receiptGuid: receipt.receiptGuid,
        receiptCode: receipt.receiptCode,
        invoiceId: (receipt as ReceiptResponse & { invoiceId?: string | null }).invoiceId ?? null,
        officeId: receipt.officeId,
        officeName: receipt.officeName,
        propertyIds: receipt.propertyIds || [],
        receiptDate: this.formatter.formatDateString(receipt.receiptDate),
        billNumber: (receipt.billNumber || '').trim() || '—',
        dueDate: this.formatter.formatDateString(receipt.dueDate),
        accountingPeriod: receipt.accountingPeriod,
        period: this.formatter.formatInvoiceListAccountingPeriod(receipt.accountingPeriod),
        created: this.formatter.formatInvoiceListCreatedOn(receipt.createdOn),
        propertyCode: '',
        ticketId: receipt.ticketId,
        description: receipt.description || '',
        descriptionDisplay: receipt.description || '',
        amount: receiptAmount,
        amountDisplay: this.formatter.currencyUsd(receiptAmount),
        paidAmountValue,
        dueAmountValue,
        paidAmount: this.formatter.currencyUsd(paidAmountValue),
        paidDate: receipt.paidDate ? this.formatter.formatDateString(receipt.paidDate) : null,
        dueAmount: this.formatter.currencyUsd(dueAmountValue),
        splits,
        splitTotalAmount,
        splitTotalDisplay: this.formatter.currencyUsd(splitTotalAmount),
        splitSummaryDisplay: `${splits.length} split${splits.length === 1 ? '' : 's'}`,
        bankCardId: receipt.bankCardId ?? null,
        vendorId: receipt.vendorId ?? null,
        vendorName: receipt.vendorName ?? null,
        bankCardDisplayName: (receipt.bankCardDisplayName || '').trim(),
        accountDisplay,
        vendorDisplay,
        vendorDisplayReadOnly: !isFirstSplitBill,
        isSplitAmountValid,
        workOrderDisplay,
        receiptTypeDisplay,
        receiptPath: receipt.receiptPath ?? null,
        isActive: receipt.isActive,
        createdBy: receipt.createdBy ?? receipt.createdByName ?? '',
        createdByName: receipt.createdByName ?? receipt.createdBy ?? '',
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
        billingTypeId: o.billingTypeId ?? null,
        billingRate: o.billingRate ?? 0,
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

  mapExternalCalendarEventsToReservationList(
    property: Pick<PropertyListResponse, 'propertyId' | 'propertyCode' | 'officeId' | 'officeName' | 'monthlyRate'>,
    events: ExternalCalendarImportEvent[]
  ): ReservationListResponse[] {
    const defaultLabel = 'External Calendar';
    return (events || []).map((event, index) => {
      const summary = String(event.summary || '').trim() || defaultLabel;
      const uid = String(event.uid || '').trim() || `${event.arrivalDate}-${event.departureDate}-${index}`;
      return {
        reservationId: `extcal:${property.propertyId}:${uid}`,
        reservationCode: summary,
        propertyId: property.propertyId,
        propertyCode: property.propertyCode,
        officeId: property.officeId,
        officeName: property.officeName,
        contactId: '',
        contactName: summary,
        companyId: null,
        companyName: null,
        tenantName: summary,
        agentCode: null,
        billingTypeId: null,
        billingRate: 0,
        monthlyRate: property.monthlyRate,
        arrivalDate: event.arrivalDate,
        departureDate: event.departureDate,
        reservationTypeId: ReservationType.Individual,
        reservationStatusId: ReservationStatus.Confirmed,
        hasPets: false,
        maidUserId: null,
        maidStartDate: null,
        frequencyId: 0,
        maidServiceFee: 0,
        currentInvoiceNo: 0,
        isActive: true,
        createdOn: event.arrivalDate
      };
    });
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
