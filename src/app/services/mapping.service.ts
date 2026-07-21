import { Injectable, inject } from '@angular/core';
import { AccountType, Class, SourceType, SourceTypeLabels, TransactionType, getAccountTypeLabel, getSourceTypeCode, getSourceTypeLabel, getTransactionTypeLabel, isCreditNormalAccountType, isJournalEntrySourceNavigable } from '../authenticated/accounting/models/accounting-enum';
import { ArAgingBucketDefinition, ArAgingBucketId, ArAgingCustomerRow, ArAgingDetailBuildRequest, ArAgingDetailReportResult, ArAgingDetailRow, ArAgingInvoiceDetail, ArAgingJeDetailBuildRequest, ArAgingReportBuildRequest, ArAgingReportResult, ArAgingReservationRow, buildArAgingBucketDefinitions, buildArAgingCompanySortKey, buildArAgingContactSortKey, compareArAgingCustomerSortKeys, compareArAgingInvoiceSortKeys, createEmptyArAgingBucketAmounts, resolveArAgingBucketId, sortArAgingCustomerRows } from '../authenticated/accounting/models/ar-aging-report.model';
import { ApAgingBillDetail, ApAgingBucketDefinition, ApAgingBucketId, ApAgingDetailBuildRequest, ApAgingDetailReportResult, ApAgingDetailRow, ApAgingPropertyRow, ApAgingReportBuildRequest, ApAgingReportResult, ApAgingVendorRow, OwnerApAgingReportBuildRequest, buildApAgingBucketDefinitions, compareApAgingBillSortKeys, compareApAgingVendorSortKeys, createEmptyApAgingBucketAmounts, resolveApAgingBucketId, sortApAgingVendorRows } from '../authenticated/accounting/models/ap-aging-report.model';
import { FINANCIAL_REPORT_TOTAL_COLUMN_ID, FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID, FinancialReportBuildRequest, FinancialReportColumn, FinancialReportColumnContext, FinancialReportDrillDownContext, FinancialReportDrillDownSpec, FinancialReportKind, FinancialReportResult, FinancialReportTreeNode } from '../authenticated/accounting/models/financial-report.model';
import { ChartOfAccountListDisplay, ChartOfAccountRequest, ChartOfAccountResponse } from '../authenticated/accounting/models/chart-of-accounts.model';
import { CostCodesListDisplay, CostCodesRequest, CostCodesResponse } from '../authenticated/accounting/models/cost-codes.model';
import { InvoiceRequest, InvoiceResponse, LedgerLineListDisplay, LedgerLineResponse } from '../authenticated/accounting/models/invoice.model';
import { JournalEntryLineDetailDisplay, JournalEntryLineListDisplay, JournalEntryLineResponse, JournalEntryLineSearchResponse, JournalEntryRecapRowDisplay, JournalEntryResponse, RecapReportResponse, TransferReportResponse, TransferReportRowDisplay } from '../authenticated/accounting/models/journal-entry.model';
import { PrintableReportDocument, PrintableReportRow, PrintableReportRowKind } from '../authenticated/accounting/models/printable-report.model';
import { ReconcileAccountReportBuildRequest, ReconcileAccountReportResult, ReconcileAccountReportRow, ReconcileAccountReportView } from '../authenticated/accounting/models/reconcile-account-report.model';
import { ReconcileLineDisplay } from '../authenticated/accounting/models/reconcile.model';
import { OwnerStatementListDisplay, OwnerStatementMonthLineListDisplay, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementOfficeGroup, OwnerStatementPropertyActivityLineDisplay, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest, OwnerStatementPropertyRow, OwnerStatementResponse, OwnerStatementSearchRequest, OwnerStatementSearchResponse, OwnerStatementVisibleRow } from '../authenticated/accounting/models/owner-statement.model';
import { OwnerAccrualReportResponse, OwnerAccrualReportRowResponse, OwnerCashReportResponse, OwnerCashReportRowResponse, OwnerReportsBundleResponse } from '../authenticated/accounting/models/owner-report.model';
import { EscrowReportBuildRequest, EscrowReportResult, EscrowReportRow } from '../authenticated/accounting/models/escrow-report.model';
import { SecurityDepositDetailLineResponse, SecurityDepositDetailResponse, SecurityDepositDetailReturnLineResponse } from '../authenticated/accounting/models/security-deposit-report.model';
import { RentRollPropertyAgreement, RentRollRow } from '../authenticated/accounting/models/rent-roll.model';
import { EntityType, getEntityType, getPaymentTermDays, getTermType } from '../authenticated/contacts/models/contact-enum';
import { ContactListDisplay, ContactRequest, ContactResponse } from '../authenticated/contacts/models/contact.model';
import { DocumentType, getDocumentTypeLabel } from '../authenticated/documents/models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../authenticated/documents/models/document.model';
import { AlertListDisplay, AlertResponse } from '../authenticated/email/models/alert.model';
import { EmailListDisplay, EmailResponse } from '../authenticated/email/models/email.model';
import { getEmailType } from '../authenticated/email/models/email.enum';
import { EmailHtmlResponse } from '../authenticated/email/models/email-html.model';
import { MaintenanceListResponse } from '../authenticated/maintenance/models/maintenance.model';
import { MaintenanceListSearchRequest } from '../authenticated/maintenance/models/maintenance-search.model';
import { InspectionDisplayList, InspectionResponse } from '../authenticated/maintenance/models/inspection.model';
import { ReceiptDisplayList, ReceiptRequest, ReceiptResponse, Split } from '../authenticated/maintenance/models/receipt.model';
import { DepositDisplayList, DepositRequest, DepositResponse, DepositSplit } from '../authenticated/accounting/models/deposit.model';
import { TransferDisplayList, TransferFlatReportAccountIds, TransferFlatReportRowDisplay, TransferRequest, TransferResponse, TransferSplit } from '../authenticated/accounting/models/transfer.model';
import { getInspectionType, getReceiptType, getWorkOrderType } from '../authenticated/maintenance/models/maintenance-enums';
import { WorkOrderDisplayList, WorkOrderRequest, WorkOrderResponse } from '../authenticated/maintenance/models/work-order.model';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../authenticated/organizations/models/accounting-office.model';
import { AgentListDisplay, AgentResponse } from '../authenticated/organizations/models/agent.model';
import { AreaListDisplay, AreaResponse } from '../authenticated/organizations/models/area.model';
import { BuildingListDisplay, BuildingResponse } from '../authenticated/organizations/models/building.model';
import { ColorListDisplay, ColorResponse } from '../authenticated/organizations/models/color.model';
import { OfficeListDisplay, OfficeResponse } from '../authenticated/organizations/models/office.model';
import { OrganizationListDisplay, OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { BankCardResponse } from '../authenticated/organizations/models/bank.model';
import { RegionListDisplay, RegionResponse } from '../authenticated/organizations/models/region.model';
import { StateFormListDisplay, StateFormResponse } from '../authenticated/organizations/models/state-form.model';
import { TrackerConfigurationDefinitionResponse, TrackerDefinitionListDisplay, TrackerDefinitionResponse } from '../authenticated/organizations/models/tracker.model';
import { getTrackerContextCode, getTrackerContextType } from '../authenticated/organizations/models/tracker-enum';
import { ManagementFeeType, PropertyLeaseType, PropertyType, TrashDays, effectiveBedTypeIdForPropertySlot, getBedSizeType, getPropertyStatus, getPropertyStatusLetter, getPropertyType } from '../authenticated/properties/models/property-enums';
import { PropertyAgreementLineResponse } from '../authenticated/properties/models/property-agreement.model';
import { PropertyBedDropdownCell, PropertyListDisplay, PropertyListResponse, PropertyResponse } from '../authenticated/properties/models/property.model';
import { BoardProperty } from '../authenticated/reservations/models/reservation-board-model';
import { getFrequency, getReservationStatus, ReservationStatus, ReservationType } from '../authenticated/reservations/models/reservation-enum';
import { ExternalCalendarImportEvent } from '../authenticated/reservations/models/external-calendar-import.model';
import { ExtraFeeLineRequest, ExtraFeeLineResponse, ReservationCodeResponse, ReservationDepartureResponse, ReservationListDisplay, ReservationListResponse, ReservationResponse, UnreturnedSecurityDepositsResponse, UnreturnedSecurityDepositDisplay } from '../authenticated/reservations/models/reservation-model';
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
  private formatter = inject(FormatterService);
  private utility = inject(UtilityService);
  private workOrderAmountService = inject(WorkOrderAmountService);

  
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
    return (colors || [])
      .filter(o => o.noticeDays === null || o.noticeDays === undefined)
      .map<ColorListDisplay>((o: ColorResponse) => ({
        colorId: o.colorId,
        reservationStatusId: o.reservationStatusId,
        reservationStatus: getReservationStatus(o.reservationStatusId),
        noticeDays: null,
        sortOrder: o.reservationStatusId,
        color: o.color
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
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
      if (color.noticeDays === null || color.noticeDays === undefined) {
        colorMap.set(color.reservationStatusId, color.color);
      }
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
    const rawOwnerTypeId = raw['ownerTypeId'];
    const rawVendorTypeId = raw['vendorTypeId'];
    const ownerTypeId = Number.isFinite(Number(rawOwnerTypeId)) ? Number(rawOwnerTypeId) : 0;
    const vendorTypeId = Number.isFinite(Number(rawVendorTypeId)) ? Number(rawVendorTypeId) : 0;
    const rawPaymentTermsId = raw['paymentTermsId'] ?? raw['PaymentTermsId'];
    const paymentTermsId =
      rawPaymentTermsId === undefined || rawPaymentTermsId === null || rawPaymentTermsId === ''
        ? null
        : (Number.isFinite(Number(rawPaymentTermsId)) ? Number(rawPaymentTermsId) : null);

    return {
      ...base,
      officeAccess,
      officeId,
      ownerTypeId,
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
      ownerTypeId: contact.ownerTypeId ?? 0,
      vendorTypeId: contact.vendorTypeId ?? 0,
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
        ownerTypeId: o.ownerTypeId ?? 0,
        vendorTypeId: o.vendorTypeId ?? 0,
        properties: codesArray,
        companyName: o.companyName ?? null,
        companyEmail: o.companyEmail ?? null,
        phone: this.formatter.phoneNumber(o.phone),
        email: this.utility.getDisplayContactEmail(o.email),
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
        chartOfAccountId: this.normalizeBankCardChartOfAccountId(card.chartOfAccountId)
      };
    });
  }

  normalizeBankCardChartOfAccountId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

formatBankCardNumberForDisplay(cardNumber?: string | null, lastFour?: string | null, isPersisted: boolean = true): string {
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

groupCardNumber(value: string): string {
    return (value.match(/.{1,4}/g) || []).join(' ');
  }
  
  mapCostCodes(
    costCodes: CostCodesResponse[],
    offices?: any[],
    transactionTypes?: { value: number, label: string }[],
    chartOfAccounts?: ChartOfAccountResponse[]
  ): CostCodesListDisplay[] {
    const chartOfAccountLookup = this.buildChartOfAccountLookupByOfficeAndAccountNo(chartOfAccounts);

    return costCodes.map<CostCodesListDisplay>((costCode: CostCodesResponse) => {
      const office = offices?.find(o => o.officeId === costCode.officeId);
      const officeName = office?.name || '';
      const rowColor = costCode.transactionTypeId === TransactionType.Payment ? '#E8F5E9' : undefined;
      const matchedChartOfAccount = chartOfAccountLookup.get(`${costCode.officeId}|${this.normalizeAccountCodeForMatch(costCode.costCode)}`);

      return {
        costCodeId: costCode.costCodeId,
        officeId: costCode.officeId,
        officeName: officeName,
        costCode: costCode.costCode || '',
        transactionTypeId: costCode.transactionTypeId,
        transactionType: getTransactionTypeLabel(costCode.transactionTypeId, transactionTypes),
        description: costCode.description || '',
        chartOfAccountDisplay: matchedChartOfAccount ? this.formatChartOfAccountListLabel(matchedChartOfAccount) : '',
        isActive: costCode.isActive ?? true,
        rowColor: rowColor
      };
    });
  }

buildChartOfAccountLookupByOfficeAndAccountNo(chartOfAccounts?: ChartOfAccountResponse[]): Map<string, ChartOfAccountResponse> {
    const lookup = new Map<string, ChartOfAccountResponse>();
    for (const account of chartOfAccounts ?? []) {
      const normalizedAccountNo = this.normalizeAccountCodeForMatch(account.accountNo);
      if (!normalizedAccountNo) {
        continue;
      }
      lookup.set(`${account.officeId}|${normalizedAccountNo}`, account);
    }
    return lookup;
  }

normalizeAccountCodeForMatch(value: string | null | undefined): string {
    return String(value ?? '')
      .split(/\s+/)
      .filter(part => part.length > 0)
      .join(' ')
      .trim()
      .toLowerCase();
  }

isBankAccountNumber(accountNo: string | null | undefined): boolean {
    const match = String(accountNo ?? '').trim().match(/^(\d+)/);
    if (!match) {
      return false;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed < 4000;
  }

  formatChartOfAccountListLabel(account: ChartOfAccountResponse): string {
    return `${account.accountNo} - ${account.name}`;
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

  mapChartOfAccountSubaccountParentUpdate(account: ChartOfAccountResponse, parentAccountId: number | null): ChartOfAccountRequest {
    const isSubaccount = parentAccountId != null && parentAccountId > 0;
    return {
      accountId: account.accountId,
      organizationId: account.organizationId,
      officeId: account.officeId,
      accountNo: account.accountNo || '',
      accountTypeId: account.accountTypeId,
      name: account.name || '',
      isSubaccount,
      subAccountId: isSubaccount ? parentAccountId : null,
      description: account.description ?? null,
      endingBalance: this.isBankAccountNumber(account.accountNo) ? account.endingBalance ?? null : null,
      statementDate: this.isBankAccountNumber(account.accountNo) ? account.statementDate ?? null : null,
      note: account.note ?? null
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
        endingBalanceDisplay: this.isBankAccountNumber(account.accountNo) && account.endingBalance != null
          ? this.formatter.currencyUsd(account.endingBalance)
          : '',
        statementDateDisplay: this.isBankAccountNumber(account.accountNo) && account.statementDate
          ? this.formatter.formatDateString(account.statementDate)
          : '',
        note: account.note || ''
      };
    });
  }

  mapJournalEntryLineSearchResponse(raw: Record<string, unknown>): JournalEntryLineSearchResponse {
    const base = raw as unknown as JournalEntryLineSearchResponse;
    return {
      ...base,
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? base.journalEntryCode ?? ''),
      sourceCode: String(raw['sourceCode'] ?? raw['SourceCode'] ?? base.sourceCode ?? '').trim() || null,
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? base.propertyCode ?? '').trim() || null,
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? base.reservationCode ?? '').trim() || null,
      contactName: String(raw['contactName'] ?? raw['ContactName'] ?? base.contactName ?? '').trim() || null,
      checkNumber: String(raw['checkNumber'] ?? raw['CheckNumber'] ?? base.checkNumber ?? '').trim() || null,
      transactionDate: this.utility.coerceCalendarDateStringFromApi(raw['transactionDate'] ?? raw['TransactionDate'] ?? base.transactionDate) ?? base.transactionDate ?? '',
      accountingPeriod: this.utility.coerceCalendarDateStringFromApi(raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? raw['postingDate'] ?? raw['PostingDate'] ?? base.accountingPeriod) ?? base.accountingPeriod ?? '',
      postingStatusId: Number(raw['postingStatusId'] ?? raw['PostingStatusId'] ?? base.postingStatusId ?? 0),
      clearedOn: this.utility.coerceCalendarDateStringFromApi(raw['clearedOn'] ?? raw['ClearedOn'] ?? base.clearedOn) ?? base.clearedOn ?? null,
      // IsCleared is the reconcile check mark. Do not derive it from ClearedOn.
      isCleared: this.resolveIsClearedFlag(raw['isCleared'] ?? raw['IsCleared'] ?? base.isCleared)
    };
  }

  mapReconcileLineDisplays(lines: JournalEntryLineSearchResponse[], side: 'debit' | 'credit'): ReconcileLineDisplay[] {
    const filteredLines = (lines ?? []).filter(line => side === 'debit' ? Number(line.debit || 0) > 0 : Number(line.credit || 0) > 0);
    const sortedLines = [...filteredLines].sort((left, right) => {
      const leftDate = left.transactionDate || '';
      const rightDate = right.transactionDate || '';
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }

      return (left.journalEntryCode || '').localeCompare(right.journalEntryCode || '');
    });

    return sortedLines.map(line => {
      const amountValue = side === 'debit' ? Number(line.debit || 0) : Number(line.credit || 0);
      const transactionDateSortValue = String(line.transactionDate || '').trim();
      return {
        journalEntryLineId: line.journalEntryLineId,
        transactionDate: this.formatter.formatDateString(transactionDateSortValue),
        transactionDateSortValue,
        type: getSourceTypeLabel(line.sourceTypeId, SourceTypeLabels),
        checkRef: this.resolveJournalEntryLineSourceDisplay(line),
        payee: (line.contactName || '').trim(),
        memo: (line.memo || line.journalEntryMemo || '').trim(),
        amountValue,
        isCleared: line.isCleared === true
      };
    });
  }

  mapJournalEntryResponse(raw: Record<string, unknown>): JournalEntryResponse {
    const base = raw as unknown as JournalEntryResponse;
    const rawLines = (raw['journalEntryLines'] ?? raw['JournalEntryLines'] ?? base.journalEntryLines ?? []) as Record<string, unknown>[];
    const rawIsCashOnly = raw['isCashOnly'] ?? raw['IsCashOnly'] ?? base.isCashOnly;
    return {
      ...base,
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? base.officeId ?? 0),
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? base.journalEntryCode ?? ''),
      sourceCode: String(raw['sourceCode'] ?? raw['SourceCode'] ?? base.sourceCode ?? '').trim() || null,
      sourceTypeId: Number(raw['sourceTypeId'] ?? raw['SourceTypeId'] ?? base.sourceTypeId ?? SourceType.Journal),
      transactionDate: this.utility.coerceCalendarDateStringFromApi(raw['transactionDate'] ?? raw['TransactionDate'] ?? base.transactionDate) ?? base.transactionDate ?? '',
      accountingPeriod: this.utility.coerceCalendarDateStringFromApi(raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? raw['postingDate'] ?? raw['PostingDate'] ?? base.accountingPeriod) ?? base.accountingPeriod ?? '',
      postingStatusId: Number(raw['postingStatusId'] ?? raw['PostingStatusId'] ?? base.postingStatusId ?? 0),
      isCashOnly: rawIsCashOnly === true || rawIsCashOnly === 1 || rawIsCashOnly === '1',
      memo: String(raw['memo'] ?? raw['Memo'] ?? base.memo ?? ''),
      journalEntryLines: rawLines.map(line => this.mapJournalEntryLineResponse(line))
    };
  }

  mapJournalEntryLineResponse(raw: Record<string, unknown>): JournalEntryLineResponse {
    const base = raw as unknown as JournalEntryLineResponse;
    return {
      ...base,
      journalEntryLineId: String(raw['journalEntryLineId'] ?? raw['JournalEntryLineId'] ?? base.journalEntryLineId ?? ''),
      chartOfAccountId: Number(raw['chartOfAccountId'] ?? raw['ChartOfAccountId'] ?? base.chartOfAccountId ?? 0),
      debit: Number(raw['debit'] ?? raw['Debit'] ?? base.debit ?? 0),
      credit: Number(raw['credit'] ?? raw['Credit'] ?? base.credit ?? 0),
      memo: String(raw['memo'] ?? raw['Memo'] ?? base.memo ?? ''),
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? base.propertyCode ?? '').trim() || null,
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? base.reservationCode ?? '').trim() || null,
      contactName: String(raw['contactName'] ?? raw['ContactName'] ?? base.contactName ?? '').trim() || null
    };
  }

  mapRecapReportResponse(raw: Record<string, unknown>): RecapReportResponse {
    const rowsRaw = raw['rows'] ?? raw['Rows'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapRecapReportRow(row as Record<string, unknown>))
      : [];

    return { rows };
  }

  mapRecapReportRow(raw: Record<string, unknown>): JournalEntryRecapRowDisplay {
    const sourceTypeRaw = raw['sourceTypeId'] ?? raw['SourceTypeId'];
    const parsedSourceTypeId = sourceTypeRaw == null || sourceTypeRaw === '' ? null : Number(sourceTypeRaw);
    const sourceTypeId = parsedSourceTypeId != null && Number.isFinite(parsedSourceTypeId) ? parsedSourceTypeId : null;
    const ownerPaymentValue = Math.max(0, Number(raw['ownerPaymentValue'] ?? raw['OwnerPaymentValue'] ?? 0));
    const ownerRentActualValue = Number(raw['ownerRentActualValue'] ?? raw['OwnerRentActualValue'] ?? 0);

    return {
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? ''),
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? ''),
      accountingPeriod: String(raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? ''),
      source: String(raw['source'] ?? raw['Source'] ?? ''),
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? ''),
      sourceTypeId,
      sourceId: String(raw['sourceId'] ?? raw['SourceId'] ?? '').trim() || null,
      sourceLinkable: Boolean(raw['sourceLinkable'] ?? raw['SourceLinkable'] ?? false),
      activityType: String(raw['activityType'] ?? raw['ActivityType'] ?? ''),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0) || null,
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? '').trim() || null,
      reservationId: String(raw['reservationId'] ?? raw['ReservationId'] ?? '').trim() || null,
      transactionDate: String(raw['transactionDate'] ?? raw['TransactionDate'] ?? ''),
      expectedIncome: String(raw['expectedIncome'] ?? raw['ExpectedIncome'] ?? ''),
      rentPlus4000: String(raw['rentPlus4000'] ?? raw['RentPlus4000'] ?? ''),
      ownerRent: String(raw['ownerRent'] ?? raw['OwnerRent'] ?? ''),
      ownerRentActual: this.formatter.currencyUsd(ownerRentActualValue),
      securityDeposit: String(raw['securityDeposit'] ?? raw['SecurityDeposit'] ?? ''),
      sdw: String(raw['sdw'] ?? raw['Sdw'] ?? raw['SDW'] ?? ''),
      fee: String(raw['fee'] ?? raw['Fee'] ?? ''),
      payment: String(raw['payment'] ?? raw['Payment'] ?? ''),
      prePayment: String(raw['prePayment'] ?? raw['PrePayment'] ?? ''),
      unPaid: String(raw['unPaid'] ?? raw['UnPaid'] ?? ''),
      ownerExpense: String(raw['ownerExpense'] ?? raw['OwnerExpense'] ?? ''),
      ownerPayment: this.formatter.currencyUsd(ownerPaymentValue),
      expectedIncomeValue: Number(raw['expectedIncomeValue'] ?? raw['ExpectedIncomeValue'] ?? 0),
      rentPlus4000Value: Number(raw['rentPlus4000Value'] ?? raw['RentPlus4000Value'] ?? 0),
      ownerRentValue: Number(raw['ownerRentValue'] ?? raw['OwnerRentValue'] ?? 0),
      ownerRentActualValue,
      securityDepositValue: Number(raw['securityDepositValue'] ?? raw['SecurityDepositValue'] ?? 0),
      sdwValue: Number(raw['sdwValue'] ?? raw['SdwValue'] ?? raw['SDWValue'] ?? 0),
      feeValue: Number(raw['feeValue'] ?? raw['FeeValue'] ?? 0),
      paymentValue: Number(raw['paymentValue'] ?? raw['PaymentValue'] ?? 0),
      prePaymentValue: Number(raw['prePaymentValue'] ?? raw['PrePaymentValue'] ?? 0),
      unPaidValue: Number(raw['unPaidValue'] ?? raw['UnPaidValue'] ?? 0),
      ownerExpenseValue: Number(raw['ownerExpenseValue'] ?? raw['OwnerExpenseValue'] ?? 0),
      ownerPaymentValue,
      sortDateValue: Number(raw['sortDateValue'] ?? raw['SortDateValue'] ?? 0),
      journalEntryId: String(raw['journalEntryId'] ?? raw['JournalEntryId'] ?? '').trim() || undefined,
      journalEntryLineId: String(raw['journalEntryLineId'] ?? raw['JournalEntryLineId'] ?? '').trim() || undefined
    };
  }

  mapTransferReportResponse(raw: Record<string, unknown>): TransferReportResponse {
    const rowsRaw = raw['rows'] ?? raw['Rows'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapTransferReportRow(row as Record<string, unknown>))
      : [];

    return { rows };
  }

  mapTransferReportRow(raw: Record<string, unknown>): TransferReportRowDisplay {
    const sourceTypeRaw = raw['sourceTypeId'] ?? raw['SourceTypeId'];
    const parsedSourceTypeId = sourceTypeRaw == null || sourceTypeRaw === '' ? null : Number(sourceTypeRaw);
    const sourceTypeId = parsedSourceTypeId != null && Number.isFinite(parsedSourceTypeId) ? parsedSourceTypeId : null;
    const ownerRentValue = Number(raw['ownerRentValue'] ?? raw['OwnerRentValue'] ?? 0);
    const ownerRentActualValue = Number(raw['ownerRentActualValue'] ?? raw['OwnerRentActualValue'] ?? 0);
    const businessValue = Number(raw['businessValue'] ?? raw['BusinessValue'] ?? (
      Number(raw['expectedIncomeValue'] ?? raw['ExpectedIncomeValue'] ?? 0)
      - ownerRentActualValue
      - Number(raw['securityDepositValue'] ?? raw['SecurityDepositValue'] ?? 0)
      - Number(raw['sdwValue'] ?? raw['SdwValue'] ?? raw['SDWValue'] ?? 0)
    ));
    const expectedIncomeValue = Number(raw['expectedIncomeValue'] ?? raw['ExpectedIncomeValue'] ?? 0);
    const securityDepositValue = Number(raw['securityDepositValue'] ?? raw['SecurityDepositValue'] ?? 0);
    const sdwValue = Number(raw['sdwValue'] ?? raw['SdwValue'] ?? raw['SDWValue'] ?? 0);
    const balanceValue = Math.round((
      expectedIncomeValue - ownerRentActualValue - securityDepositValue - sdwValue - businessValue
      + Number.EPSILON
    ) * 100) / 100;

    return {
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? ''),
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? ''),
      accountingPeriod: String(raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? ''),
      source: String(raw['source'] ?? raw['Source'] ?? ''),
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? ''),
      sourceTypeId,
      sourceId: String(raw['sourceId'] ?? raw['SourceId'] ?? '').trim() || null,
      sourceLinkable: Boolean(raw['sourceLinkable'] ?? raw['SourceLinkable'] ?? false),
      activityType: String(raw['activityType'] ?? raw['ActivityType'] ?? ''),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0) || null,
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? '').trim() || null,
      reservationId: String(raw['reservationId'] ?? raw['ReservationId'] ?? '').trim() || null,
      transactionDate: String(raw['transactionDate'] ?? raw['TransactionDate'] ?? ''),
      expectedIncome: String(raw['expectedIncome'] ?? raw['ExpectedIncome'] ?? ''),
      rentPlus4000: String(raw['rentPlus4000'] ?? raw['RentPlus4000'] ?? ''),
      ownerRent: String(raw['ownerRent'] ?? raw['OwnerRent'] ?? ''),
      ownerRentActual: String(raw['ownerRentActual'] ?? raw['OwnerRentActual'] ?? this.formatter.currencyUsd(ownerRentActualValue)),
      business: String(raw['business'] ?? raw['Business'] ?? this.formatter.currencyUsd(businessValue)),
      securityDeposit: String(raw['securityDeposit'] ?? raw['SecurityDeposit'] ?? ''),
      sdw: String(raw['sdw'] ?? raw['Sdw'] ?? raw['SDW'] ?? ''),
      fee: String(raw['fee'] ?? raw['Fee'] ?? ''),
      balance: this.formatter.currencyUsd(balanceValue),
      balanceIsAlert: balanceValue !== 0,
      expectedIncomeValue,
      rentPlus4000Value: Number(raw['rentPlus4000Value'] ?? raw['RentPlus4000Value'] ?? 0),
      ownerRentValue,
      ownerRentActualValue,
      businessValue,
      securityDepositValue,
      sdwValue,
      feeValue: Number(raw['feeValue'] ?? raw['FeeValue'] ?? 0),
      balanceValue,
      sortDateValue: Number(raw['sortDateValue'] ?? raw['SortDateValue'] ?? 0),
      journalEntryId: String(raw['journalEntryId'] ?? raw['JournalEntryId'] ?? '').trim() || undefined,
      journalEntryLineId: String(raw['journalEntryLineId'] ?? raw['JournalEntryLineId'] ?? '').trim() || undefined
    };
  }

resolveJournalEntryLineSourceDisplay(
    line: JournalEntryLineSearchResponse,
    sourceTypes?: { value: number; label: string }[]
  ): string {
    const sourceCode = (line.sourceCode || '').trim();
    if (sourceCode) {
      return sourceCode;
    }

    if (line.sourceTypeId === SourceType.Reservation) {
      const reservationCode = (line.reservationCode || '').trim();
      if (reservationCode) {
        return reservationCode;
      }
    }

    return getSourceTypeLabel(line.sourceTypeId, sourceTypes);
  }

  mapJournalEntryLineListDisplay(
    lines: JournalEntryLineSearchResponse[],
    chartOfAccounts?: ChartOfAccountResponse[],
    sourceTypes?: { value: number; label: string }[],
    displayNewestFirst = false
  ): JournalEntryLineListDisplay[] {
    const sourceLines = lines ?? [];
    const journalEntryCreatedOn = this.buildJournalEntryCreatedOnLookup(sourceLines);
    const chronologicalLines = [...sourceLines].sort((left, right) =>
      this.compareJournalEntryLinesForListDisplay(left, right, false, journalEntryCreatedOn)
    );

    let runningBalance = 0;
    const mappedByLineId = new Map<string, JournalEntryLineListDisplay>();

    chronologicalLines.forEach(line => {
      const transactionDate = line.transactionDate || '';
      const lineMemo = (line.memo || '').trim();
      const journalEntryMemo = (line.journalEntryMemo || '').trim();
      const description = lineMemo || journalEntryMemo;
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

      mappedByLineId.set(line.journalEntryLineId, {
        journalEntryLineId: line.journalEntryLineId,
        journalEntryId: line.journalEntryId,
        officeId: line.officeId,
        transactionDate: this.formatter.formatDateString(transactionDate),
        journalEntryCode: (line.journalEntryCode || '').trim(),
        checkNumber: (line.checkNumber || '').trim() || undefined,
        source: this.resolveJournalEntryLineSourceDisplay(line, sourceTypes),
        sourceTypeId: line.sourceTypeId ?? null,
        sourceId: line.sourceId ?? null,
        sourceLinkable: isJournalEntrySourceNavigable(line.sourceTypeId) && !!(line.sourceId || '').trim(),
        propertyId: line.propertyId ?? null,
        propertyCode: (line.propertyCode || '').trim(),
        reservationId: line.reservationId ?? null,
        reservationCode: (line.reservationCode || '').trim(),
        contactId: line.contactId ?? null,
        contactName: (line.contactName || '').trim(),
        account: accountLabel,
        description,
        journalEntryMemo,
        debit: debitValue ? this.formatter.currency(debitValue) : '',
        credit: creditValue ? this.formatter.currency(creditValue) : '',
        balance: this.formatter.currency(runningBalance),
        debitValue,
        creditValue,
        balanceValue: runningBalance,
        postingStatusId: Number(line.postingStatusId ?? 0),
        sortDateValue
      });
    });

    const displayLines = [...sourceLines].sort((left, right) =>
      this.compareJournalEntryLinesForListDisplay(left, right, displayNewestFirst, journalEntryCreatedOn)
    );

    return displayLines
      .map(line => mappedByLineId.get(line.journalEntryLineId))
      .filter((line): line is JournalEntryLineListDisplay => !!line);
  }

buildJournalEntryCreatedOnLookup(lines: JournalEntryLineSearchResponse[]): Map<string, string> {
    const journalEntryCreatedOn = new Map<string, string>();

    lines.forEach(line => {
      const journalEntryId = (line.journalEntryId || '').trim();
      if (!journalEntryId) {
        return;
      }

      const createdOn = (line.createdOn || '').trim();
      const existing = journalEntryCreatedOn.get(journalEntryId) || '';
      if (createdOn.localeCompare(existing) > 0) {
        journalEntryCreatedOn.set(journalEntryId, createdOn);
      }
    });

    return journalEntryCreatedOn;
  }

compareJournalEntryLinesForListDisplay(
    left: JournalEntryLineSearchResponse,
    right: JournalEntryLineSearchResponse,
    newestFirst: boolean,
    journalEntryCreatedOn: Map<string, string>
  ): number {
    const direction = newestFirst ? -1 : 1;
    const dateCompare = (left.transactionDate || '').localeCompare(right.transactionDate || '');
    if (dateCompare !== 0) {
      return dateCompare * direction;
    }

    if ((left.journalEntryId || '') !== (right.journalEntryId || '')) {
      const leftEntryCreated = journalEntryCreatedOn.get(left.journalEntryId) || '';
      const rightEntryCreated = journalEntryCreatedOn.get(right.journalEntryId) || '';
      const entryCreatedCompare = leftEntryCreated.localeCompare(rightEntryCreated);
      if (entryCreatedCompare !== 0) {
        return entryCreatedCompare * direction;
      }

      return (left.journalEntryId || '').localeCompare(right.journalEntryId || '') * direction;
    }

    const lineCreatedCompare = (left.createdOn || '').localeCompare(right.createdOn || '');
    if (lineCreatedCompare !== 0) {
      return lineCreatedCompare;
    }

    return (left.journalEntryLineId || '').localeCompare(right.journalEntryLineId || '');
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
    const journalEntryIdRaw = raw['journalEntryId'] ?? raw['JournalEntryId'] ?? base.journalEntryId;
    const journalEntryId = journalEntryIdRaw == null || String(journalEntryIdRaw).trim().length === 0
      ? null
      : String(journalEntryIdRaw).trim();
    const { startDate, endDate } = this.utility.invoicePeriodStartEnd(
      invoicePeriod,
      base.startDate,
      base.endDate
    );

    const rawLedgerLines = raw['ledgerLines'] ?? raw['LedgerLines'] ?? base.ledgerLines;
    const ledgerLines = (Array.isArray(rawLedgerLines) ? rawLedgerLines : [])
      .map(line => this.normalizeLedgerLineResponse(line));

    return {
      ...base,
      invoiceDate,
      dueDate,
      accountingPeriod,
      invoicePeriod: invoicePeriod || base.invoicePeriod,
      journalEntryId,
      postingStatusId: this.mapOptionalPostingStatusId(raw, base.postingStatusId),
      startDate,
      endDate,
      createdOn,
      modifiedOn,
      ledgerLines
    };
  }

  mapPreBillingInvoiceToCreateRequest(invoice: InvoiceResponse, organizationId: string): InvoiceRequest {
    const ledgerLines = (invoice.ledgerLines ?? []).map((line, index) => ({
      lineNumber: line.lineNumber > 0 ? line.lineNumber : index + 1,
      reservationId: line.reservationId ?? invoice.reservationId ?? null,
      costCodeId: line.costCodeId,
      transactionTypeId: line.transactionTypeId,
      amount: Number(line.amount) || 0,
      description: line.description || '',
      ledgerLineDate: line.ledgerLineDate || invoice.invoiceDate
    }));

    return {
      organizationId,
      officeId: invoice.officeId,
      officeName: invoice.officeName,
      invoiceCode: invoice.invoiceCode,
      reservationId: invoice.reservationId ?? null,
      reservationCode: invoice.reservationCode ?? null,
      propertyId: invoice.propertyId ?? null,
      propertyCode: invoice.propertyCode ?? null,
      contactId: invoice.contactId ?? null,
      contactName: invoice.contactName ?? null,
      responsibleParty: invoice.responsibleParty ?? invoice.contactName ?? null,
      startDate: invoice.startDate,
      endDate: invoice.endDate,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      accountingPeriod: invoice.accountingPeriod,
      invoicePeriod: invoice.invoicePeriod,
      totalAmount: Number(invoice.totalAmount) || 0,
      paidAmount: 0,
      notes: invoice.notes ?? null,
      isActive: true,
      ledgerLines
    };
  }

normalizeLedgerLineResponse(line: unknown): LedgerLineResponse {
    const raw = (line ?? {}) as Record<string, unknown>;
    const costCodeId = Number(raw['costCodeId'] ?? raw['CostCodeId'] ?? 0);
    const transactionTypeId = Number(raw['transactionTypeId'] ?? raw['TransactionTypeId'] ?? 0);
    return {
      ledgerLineId: String(raw['ledgerLineId'] ?? raw['LedgerLineId'] ?? ''),
      invoiceId: String(raw['invoiceId'] ?? raw['InvoiceId'] ?? ''),
      lineNumber: Number(raw['lineNumber'] ?? raw['LineNumber'] ?? 0),
      reservationId: (raw['reservationId'] ?? raw['ReservationId'] ?? null) as string | null,
      costCodeId: Number.isFinite(costCodeId) ? costCodeId : 0,
      transactionTypeId: Number.isFinite(transactionTypeId) ? transactionTypeId : 0,
      amount: Number(raw['amount'] ?? raw['Amount'] ?? 0),
      description: String(raw['description'] ?? raw['Description'] ?? ''),
      ledgerLineDate: this.utility.coerceCalendarDateStringFromApi(
        raw['ledgerLineDate'] ?? raw['LedgerLineDate']
      ) ?? String(raw['ledgerLineDate'] ?? raw['LedgerLineDate'] ?? '')
    };
  }

  /** First calendar day of the month for `YYYY-MM-DD` (or `YYYY-MM` prefix). */
firstDayOfMonthCalendarDate(calendarDate: string): string {
    const match = /^(\d{4})-(\d{2})/.exec(calendarDate.trim());
    if (!match) {
      return calendarDate;
    }
    return `${match[1]}-${match[2]}-01`;
  }

mapOptionalJournalEntryId(raw: Record<string, unknown>, base?: string | null): string | null {
    const rawVal = raw['journalEntryId'] ?? raw['JournalEntryId'] ?? base;
    if (rawVal == null || String(rawVal).trim().length === 0) {
      return null;
    }
    return String(rawVal).trim();
  }

mapOptionalPostingStatusId(raw: Record<string, unknown>, base?: number | null): number | null {
    const rawVal = raw['postingStatusId'] ?? raw['PostingStatusId'] ?? base;
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
      return null;
    }
    const parsed = Number(rawVal);
    return Number.isFinite(parsed) ? parsed : null;
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
      ownerStatement: emailHtml?.ownerStatement ?? '',
      letterSubject: emailHtml?.letterSubject ?? '',
      leaseSubject: emailHtml?.leaseSubject ?? '',
      invoiceSubject: emailHtml?.invoiceSubject ?? '',
      ownerStatementSubject: emailHtml?.ownerStatementSubject ?? '',
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
    const noticeStatusId = raw['noticeStatusId'] ?? raw['NoticeStatusId'];
    const noticeToVacateId = raw['noticeToVacateId'] ?? raw['NoticeToVacateId'];
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
    const confirmationNo = raw['confirmationNo'] ?? raw['ConfirmationNo'];
    return {
      ...rest,
      propertyLeaseTypeId: Number(leaseTypeId ?? 0),
      noticeStatusId: Number(noticeStatusId ?? 0),
      noticeToVacateId: Number(noticeToVacateId ?? 0),
      description: description == null ? null : String(description),
      amenities: amenities == null ? null : String(amenities),
      notes: notes == null ? null : String(notes),
      externalCalendar: externalCalendar == null ? null : String(externalCalendar),
      confirmationNo: confirmationNo == null ? null : String(confirmationNo),
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
      noticeStatusId: p.noticeStatusId ?? 0,
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

  mergeWorkOrderForQuickSave(
    sourceWorkOrder: WorkOrderResponse,
    cachedWorkOrder?: WorkOrderResponse | null,
    displayRow?: WorkOrderDisplayList | null
  ): WorkOrderResponse {
    return this.mapWorkOrderResponse({
      ...sourceWorkOrder,
      propertyId: sourceWorkOrder.propertyId ?? cachedWorkOrder?.propertyId ?? displayRow?.propertyId ?? null,
      reservationId: sourceWorkOrder.reservationId ?? cachedWorkOrder?.reservationId ?? displayRow?.reservationId ?? null,
      reservationCode: sourceWorkOrder.reservationCode ?? cachedWorkOrder?.reservationCode ?? displayRow?.reservationCode ?? null,
      title: this.resolveWorkOrderTitle(sourceWorkOrder, cachedWorkOrder, displayRow),
      description: String(
        sourceWorkOrder.description
        ?? cachedWorkOrder?.description
        ?? displayRow?.description
        ?? ''
      ).trim()
    });
  }

  mapWorkOrderResponse(raw: WorkOrderResponse | Record<string, unknown>): WorkOrderResponse {
    const base = raw as WorkOrderResponse;
    const rawRecord = raw as Record<string, unknown>;
    const workOrderItems = this.mapWorkOrderItemsFromApi(rawRecord, base.workOrderItems);

    return {
      ...base,
      workOrderItems,
      journalEntryId: this.mapOptionalJournalEntryId(rawRecord, base.journalEntryId),
      postingStatusId: this.mapOptionalPostingStatusId(rawRecord, base.postingStatusId)
    };
  }

  mapWorkOrderItemsFromApi(
    raw: Record<string, unknown>,
    fallback: WorkOrderResponse['workOrderItems'] | undefined
  ): WorkOrderResponse['workOrderItems'] {
    const collection = raw['workOrderItems'] ?? raw['WorkOrderItems'];
    if (!Array.isArray(collection)) {
      return fallback ?? [];
    }

    return collection.map(item => this.mapWorkOrderItemFromApi(item as Record<string, unknown>));
  }

  mapWorkOrderItemFromApi(raw: Record<string, unknown>): WorkOrderResponse['workOrderItems'][number] {
    return {
      workOrderItemId: String(raw['workOrderItemId'] ?? raw['WorkOrderItemId'] ?? '').trim(),
      workOrderId: String(raw['workOrderId'] ?? raw['WorkOrderId'] ?? '').trim(),
      description: String(raw['description'] ?? raw['Description'] ?? '').trim(),
      receiptId: (() => {
        const value = String(raw['receiptId'] ?? raw['ReceiptId'] ?? '').trim();
        return value.length > 0 ? value : undefined;
      })(),
      laborHours: Number(raw['laborHours'] ?? raw['LaborHours'] ?? 0) || 0,
      laborCost: Number(raw['laborCost'] ?? raw['LaborCost'] ?? 0) || 0,
      itemAmount: Number(raw['itemAmount'] ?? raw['ItemAmount'] ?? 0) || 0
    };
  }

  mapWorkOrderSaveRequest(
    sourceWorkOrder: WorkOrderResponse,
    updates: Partial<Pick<WorkOrderRequest, 'isActive' | 'enteredInQb' | 'title' | 'description'>> = {}
  ): WorkOrderRequest {
    const hasIsActive = Object.prototype.hasOwnProperty.call(updates, 'isActive');
    const hasEnteredInQb = Object.prototype.hasOwnProperty.call(updates, 'enteredInQb');
    const hasTitle = Object.prototype.hasOwnProperty.call(updates, 'title');
    const hasDescription = Object.prototype.hasOwnProperty.call(updates, 'description');

    return {
      workOrderId: sourceWorkOrder.workOrderId,
      workOrderCode: sourceWorkOrder.workOrderCode,
      organizationId: sourceWorkOrder.organizationId,
      officeId: sourceWorkOrder.officeId,
      propertyId: sourceWorkOrder.propertyId ?? null,
      reservationId: sourceWorkOrder.reservationId ?? null,
      reservationCode: sourceWorkOrder.reservationCode ?? null,
      title: hasTitle
        ? String(updates.title ?? '').trim()
        : this.resolveWorkOrderTitle(sourceWorkOrder),
      description: hasDescription
        ? String(updates.description ?? '').trim()
        : String(sourceWorkOrder.description ?? '').trim(),
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
      isActive: hasIsActive ? (updates.isActive === true) : sourceWorkOrder.isActive,
      enteredInQb: hasEnteredInQb ? (updates.enteredInQb === true) : (sourceWorkOrder.enteredInQb === true)
    };
  }

  mapWorkOrderUpdateRequest(
    sourceWorkOrder: WorkOrderResponse,
    changedCheckboxColumn: 'isActive' | 'enteredInQb',
    nextValue: boolean
  ): WorkOrderRequest {
    return this.mapWorkOrderSaveRequest(
      sourceWorkOrder,
      changedCheckboxColumn === 'isActive'
        ? { isActive: nextValue }
        : { enteredInQb: nextValue }
    );
  }

resolveWorkOrderTitle(
    sourceWorkOrder: WorkOrderResponse,
    cachedWorkOrder?: WorkOrderResponse | null,
    displayRow?: WorkOrderDisplayList | null
  ): string {
    const candidates = [
      sourceWorkOrder.title,
      cachedWorkOrder?.title,
      displayRow?.title
    ];

    for (const candidate of candidates) {
      const trimmed = String(candidate ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }

    const description = String(
      sourceWorkOrder.description
      ?? cachedWorkOrder?.description
      ?? displayRow?.description
      ?? ''
    ).trim();
    if (!description) {
      return '';
    }

    const firstSentence = description.split(/[.!?](?:\s|$)/)[0]?.trim() ?? '';
    return (firstSentence || description).slice(0, 1000);
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
        title: this.resolveWorkOrderTitle(workOrder),
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

  mapOwnerStatementDisplay(statement: OwnerStatementResponse): OwnerStatementListDisplay {
    const expectedValue = Number(statement.expected) || 0;
    const prePaidValue = Number(statement.prePaid) || 0;
    const paidIncomeValue = Number(statement.paidIncome) || 0;
    const outstandingValue = Number(statement.outstanding) || 0;
    const incomeValue = Number(statement.income) || 0;
    const expensesValue = Number(statement.expenses) || 0;
    const balanceValue = Number(statement.balance) || 0;
    const workingCapitalValue = Number(statement.workingCapital) || 0;
    const workingCapitalBalanceDueValue = Number(statement.workingCapitalBalanceDue) || 0;

    return {
      officeId: Number(statement.officeId) || 0,
      officeName: statement.officeName || '',
      ownerName: statement.ownerNameLine,
      propertyCode: statement.propertyCode || '',
      expected: this.formatter.currencyUsd(expectedValue),
      prePaid: this.formatter.currencyUsd(prePaidValue),
      paidIncome: this.formatter.currencyUsd(paidIncomeValue),
      outstanding: this.formatter.currencyUsd(outstandingValue),
      income: this.formatter.currencyUsd(incomeValue),
      expenses: this.formatter.currencyUsd(expensesValue),
      balance: this.formatter.currencyUsd(balanceValue),
      workingCapital: this.formatter.currencyUsd(workingCapitalValue),
      workingCapitalBalanceDue: this.formatter.currencyUsd(workingCapitalBalanceDueValue),
      expectedValue,
      prePaidValue,
      paidIncomeValue,
      outstandingValue,
      incomeValue,
      expensesValue,
      balanceValue,
      workingCapitalValue,
      workingCapitalBalanceDueValue
    };
  }

  mapOwnerStatementDisplays(statements: OwnerStatementResponse[]): OwnerStatementListDisplay[] {
    return (statements || []).map(statement => this.mapOwnerStatementDisplay(statement));
  }

  mapOwnerReportSearchRequest(searchRequest?: MaintenanceListSearchRequest | null): OwnerStatementSearchRequest {
    return {
      officeIds: (searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: searchRequest?.propertyId ?? null,
      startDate: searchRequest?.startDate ?? null,
      endDate: searchRequest?.endDate ?? null
    };
  }

  mapOwnerCashReportResponse(raw: Record<string, unknown>): OwnerCashReportResponse {
    const rowsRaw = raw['rows'] ?? raw['Rows'] ?? [];
    const activityLinesRaw = raw['propertyActivityLines'] ?? raw['PropertyActivityLines'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapOwnerCashReportRow(row as Record<string, unknown>))
      : [];
    const propertyActivityLines = Array.isArray(activityLinesRaw)
      ? activityLinesRaw.map(line => this.mapOwnerCashReportPropertyActivityLine(line as Record<string, unknown>))
      : [];

    return { rows, propertyActivityLines };
  }

  mapOwnerCashReportRow(raw: Record<string, unknown>): OwnerCashReportRowResponse {
    const companyNameRaw = raw['companyName'] ?? raw['CompanyName'];
    return {
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? '').trim(),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0),
      officeName: String(raw['officeName'] ?? raw['OfficeName'] ?? ''),
      ownerId: String(raw['ownerId'] ?? raw['OwnerId'] ?? '').trim() || null,
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? ''),
      companyName: companyNameRaw == null || String(companyNameRaw).trim() === '' ? null : String(companyNameRaw).trim(),
      ownerNames: String(raw['ownerNames'] ?? raw['OwnerNames'] ?? ''),
      ownerNameLine: String(raw['ownerNameLine'] ?? raw['OwnerNameLine'] ?? ''),
      startingBalance: Number(raw['startingBalance'] ?? raw['StartingBalance'] ?? 0),
      receivedIncome: Number(raw['receivedIncome'] ?? raw['ReceivedIncome'] ?? 0),
      ownerExpenses: Number(raw['ownerExpenses'] ?? raw['OwnerExpenses'] ?? 0),
      ownerPayment: Number(raw['ownerPayment'] ?? raw['OwnerPayment'] ?? 0),
      endingBalance: Number(raw['endingBalance'] ?? raw['EndingBalance'] ?? 0),
      workingCapital: Number(raw['workingCapital'] ?? raw['WorkingCapital'] ?? 0)
    };
  }

  mapOwnerCashReportPropertyActivityLine(raw: Record<string, unknown>): OwnerStatementPropertyActivityLineResponse {
    return {
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? '').trim(),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0),
      activityId: String(raw['activityId'] ?? raw['ActivityId'] ?? '').trim() || null,
      sourceId: String(raw['sourceId'] ?? raw['SourceId'] ?? '').trim() || null,
      journalEntryLineId: String(raw['journalEntryLineId'] ?? raw['JournalEntryLineId'] ?? '').trim() || null,
      activityType: String(raw['activityType'] ?? raw['ActivityType'] ?? ''),
      activityDate: this.utility.coerceCalendarDateStringFromApi(raw['activityDate'] ?? raw['ActivityDate']) ?? '',
      accountingPeriod: String(raw['accountingPeriod'] ?? raw['AccountingPeriod'] ?? '').trim(),
      documentCode: String(raw['documentCode'] ?? raw['DocumentCode'] ?? ''),
      sourceDocumentCode: String(raw['sourceDocumentCode'] ?? raw['SourceDocumentCode'] ?? ''),
      description: String(raw['description'] ?? raw['Description'] ?? ''),
      expectedIncome: Number(raw['expectedIncome'] ?? raw['ExpectedIncome'] ?? 0),
      receivedIncome: Number(raw['receivedIncome'] ?? raw['ReceivedIncome'] ?? 0),
      prepaidIncome: Number(raw['prepaidIncome'] ?? raw['PrepaidIncome'] ?? 0),
      expenses: Number(raw['expenses'] ?? raw['Expenses'] ?? 0),
      ownerPayment: Number(raw['ownerPayment'] ?? raw['OwnerPayment'] ?? 0)
    };
  }

  mapOwnerCashReportToOwnerReportSearchResponse(report: OwnerCashReportResponse): OwnerStatementSearchResponse {
    return {
      summaries: (report.rows ?? []).map(row => ({
        officeId: row.officeId,
        officeName: row.officeName,
        ownerId: row.ownerId ?? null,
        propertyId: row.propertyId,
        propertyCode: row.propertyCode,
        companyName: row.companyName ?? null,
        ownerNames: row.ownerNames,
        ownerNameLine: row.ownerNameLine,
        expected: 0,
        prePaid: 0,
        paidIncome: 0,
        outstanding: 0,
        income: row.receivedIncome,
        expenses: row.ownerExpenses,
        balance: row.receivedIncome - row.ownerExpenses,
        startingBalance: row.startingBalance,
        workingCapital: row.workingCapital,
        workingCapitalBalanceDue: row.receivedIncome - row.ownerExpenses,
        ownerPayment: row.ownerPayment,
        endingBalance: row.endingBalance
      })),
      propertyActivityLines: report.propertyActivityLines ?? []
    };
  }

  mapOwnerAccrualReportResponse(raw: Record<string, unknown>): OwnerAccrualReportResponse {
    const rowsRaw = raw['rows'] ?? raw['Rows'] ?? [];
    const activityLinesRaw = raw['propertyActivityLines'] ?? raw['PropertyActivityLines'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapOwnerAccrualReportRow(row as Record<string, unknown>))
      : [];
    const propertyActivityLines = Array.isArray(activityLinesRaw)
      ? activityLinesRaw.map(line => this.mapOwnerCashReportPropertyActivityLine(line as Record<string, unknown>))
      : [];

    return { rows, propertyActivityLines };
  }

  mapOwnerReportsBundleResponse(raw: Record<string, unknown>): OwnerReportsBundleResponse {
    const cashRaw = (raw['cash'] ?? raw['Cash'] ?? {}) as Record<string, unknown>;
    const accrualRaw = (raw['accrual'] ?? raw['Accrual'] ?? {}) as Record<string, unknown>;
    const recapRaw = (raw['recap'] ?? raw['Recap'] ?? {}) as Record<string, unknown>;
    return {
      cash: this.mapOwnerCashReportResponse(cashRaw),
      accrual: this.mapOwnerAccrualReportResponse(accrualRaw),
      recap: this.mapRecapReportResponse(recapRaw)
    };
  }

  mapOwnerAccrualReportRow(raw: Record<string, unknown>): OwnerAccrualReportRowResponse {
    const companyNameRaw = raw['companyName'] ?? raw['CompanyName'];
    return {
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? '').trim(),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0),
      officeName: String(raw['officeName'] ?? raw['OfficeName'] ?? ''),
      ownerId: String(raw['ownerId'] ?? raw['OwnerId'] ?? '').trim() || null,
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? ''),
      companyName: companyNameRaw == null || String(companyNameRaw).trim() === '' ? null : String(companyNameRaw).trim(),
      ownerNames: String(raw['ownerNames'] ?? raw['OwnerNames'] ?? ''),
      ownerNameLine: String(raw['ownerNameLine'] ?? raw['OwnerNameLine'] ?? ''),
      startingBalance: Number(raw['startingBalance'] ?? raw['StartingBalance'] ?? 0),
      invoicedIncome: Number(raw['invoicedIncome'] ?? raw['InvoicedIncome'] ?? 0),
      prepaidIncome: Number(raw['prepaidIncome'] ?? raw['PrepaidIncome'] ?? 0),
      paidIncome: Number(raw['paidIncome'] ?? raw['PaidIncome'] ?? 0),
      unpaidIncome: Number(raw['unpaidIncome'] ?? raw['UnpaidIncome'] ?? 0),
      ownerExpenses: Number(raw['ownerExpenses'] ?? raw['OwnerExpenses'] ?? 0),
      ownerProfit: Number(raw['ownerProfit'] ?? raw['OwnerProfit'] ?? 0)
    };
  }

  mapOwnerAccrualReportToOwnerReportSearchResponse(report: OwnerAccrualReportResponse): OwnerStatementSearchResponse {
    return {
      summaries: (report.rows ?? []).map(row => ({
        officeId: row.officeId,
        officeName: row.officeName,
        ownerId: row.ownerId ?? null,
        propertyId: row.propertyId,
        propertyCode: row.propertyCode,
        companyName: row.companyName ?? null,
        ownerNames: row.ownerNames,
        ownerNameLine: row.ownerNameLine,
        expected: row.invoicedIncome,
        prePaid: row.prepaidIncome,
        paidIncome: row.paidIncome,
        outstanding: row.unpaidIncome,
        income: row.paidIncome,
        expenses: row.ownerExpenses,
        balance: row.ownerProfit,
        startingBalance: row.startingBalance,
        workingCapital: 0,
        workingCapitalBalanceDue: row.ownerProfit,
        ownerPayment: 0,
        endingBalance: 0
      })),
      propertyActivityLines: report.propertyActivityLines ?? []
    };
  }

  mapOwnerReportOfficeGroups(reports: OwnerStatementResponse[]): OwnerStatementOfficeGroup[] {
    const officeMap = new Map<string, { officeId: number; officeName: string; properties: OwnerStatementPropertyRow[] }>();
    (reports || []).forEach(report => {
      const officeId = Number(report.officeId) || 0;
      const officeName = (report.officeName || '').trim();
      const officeKey = `${officeId}::${officeName.toLowerCase()}`;
      if (!officeMap.has(officeKey)) {
        officeMap.set(officeKey, { officeId, officeName, properties: [] });
      }

      officeMap.get(officeKey)!.properties.push({
        propertyId: report.propertyId || '',
        companyName: report.companyName ?? null,
        ownerNames: report.ownerNames,
        ownerNameLine: report.ownerNameLine,
        ownerId: (report.ownerId || '').trim(),
        propertyCode: report.propertyCode || '',
        expected: Number(report.expected) || 0,
        prePaid: Number(report.prePaid) || 0,
        paidIncome: Number(report.paidIncome) || 0,
        outstanding: Number(report.outstanding) || 0,
        income: Number(report.income) || 0,
        expenses: Number(report.expenses) || 0,
        balance: Number(report.balance) || 0,
        startingBalance: Number(report.startingBalance) || 0,
        workingCapital: Number(report.workingCapital) || 0,
        workingCapitalBalanceDue: Number(report.workingCapitalBalanceDue) || 0,
        ownerPayment: Number(report.ownerPayment) || 0,
        endingBalance: Number(report.endingBalance) || 0
      });
    });

    const officeGroups = Array.from(officeMap.values()).map(office => {
      const properties = [...office.properties].sort((a, b) => (a.propertyCode || '').localeCompare(b.propertyCode || ''));
      const resolvedOfficeName = office.officeName || `Office ${office.officeId}`;
      return {
        rowId: `office:${office.officeId}`,
        officeId: office.officeId,
        officeName: resolvedOfficeName,
        properties,
        expected: properties.reduce((sum, property) => sum + property.expected, 0),
        prePaid: properties.reduce((sum, property) => sum + property.prePaid, 0),
        paidIncome: properties.reduce((sum, property) => sum + property.paidIncome, 0),
        outstanding: properties.reduce((sum, property) => sum + property.outstanding, 0),
        income: properties.reduce((sum, property) => sum + property.income, 0),
        expenses: properties.reduce((sum, property) => sum + property.expenses, 0),
        balance: properties.reduce((sum, property) => sum + property.balance, 0),
        startingBalance: properties.reduce((sum, property) => sum + property.startingBalance, 0),
        workingCapital: properties.reduce((sum, property) => sum + property.workingCapital, 0),
        workingCapitalBalanceDue: properties.reduce((sum, property) => sum + property.workingCapitalBalanceDue, 0),
        ownerPayment: properties.reduce((sum, property) => sum + property.ownerPayment, 0),
        endingBalance: properties.reduce((sum, property) => sum + property.endingBalance, 0)
      };
    });

    return officeGroups.sort((a, b) => a.officeName.localeCompare(b.officeName));
  }

  mapOwnerReportPropertyActivityDisplays(propertyRowId: string, lines: OwnerStatementPropertyActivityLineResponse[]): OwnerStatementPropertyActivityLineDisplay[] {
    return (lines || []).map((line, index) => {
      const expectedIncomeValue = Number(line.expectedIncome) || 0;
      const paidIncomeValue = Number(line.receivedIncome) || 0;
      const prePaidValue = Number(line.prepaidIncome) || 0;
      const expensesValue = Number(line.expenses) || 0;
      const unpaidValue = Math.max(0, expectedIncomeValue - paidIncomeValue);
      const ownerProfitValue = paidIncomeValue - expensesValue;

      return {
        rowId: `${propertyRowId}:activity:${index}`,
        activityId: (line.activityId || '').trim() || null,
        sourceId: (line.sourceId || '').trim() || null,
        journalEntryLineId: (line.journalEntryLineId || '').trim() || null,
        activityType: line.activityType || '',
        activityDate: this.formatOwnerReportMonthDay(line.activityDate),
        accountingPeriod: (line.accountingPeriod || '').trim() || this.formatOwnerReportMonthDay(line.activityDate),
        documentCode: line.documentCode || '',
        description: line.description || '',
        expectedIncome: this.formatter.currencyUsd(expectedIncomeValue),
        receivedIncome: this.formatter.currencyUsd(paidIncomeValue),
        expenses: this.formatter.currencyUsd(expensesValue),
        ownerPayment: this.formatter.currencyUsd(prePaidValue),
        expectedIncomeValue,
        paidIncomeValue,
        prePaidValue,
        expensesValue,
        unpaidValue,
        ownerProfitValue
      };
    });
  }

  mapOwnerReportPropertyActivityByPropertyRowId(
    lines: OwnerStatementPropertyActivityLineResponse[],
    reportKind: 'accrual' | 'cash' = 'accrual'
  ): Map<string, OwnerStatementPropertyActivityLineDisplay[]> {
    const grouped = new Map<string, OwnerStatementPropertyActivityLineResponse[]>();
    (lines || []).forEach(line => {
      const officeId = Number(line.officeId) || 0;
      const propertyId = (line.propertyId || '').trim();
      if (officeId <= 0 || !propertyId) {
        return;
      }

      const propertyRowId = `property:${officeId}:${propertyId}`;
      const existing = grouped.get(propertyRowId) || [];
      existing.push(line);
      grouped.set(propertyRowId, existing);
    });

    const result = new Map<string, OwnerStatementPropertyActivityLineDisplay[]>();
    grouped.forEach((propertyLines, propertyRowId) => {
      const filteredLines = propertyLines.filter(line => {
        const expectedIncome = Number(line.expectedIncome) || 0;
        const receivedIncome = Number(line.receivedIncome) || 0;
        const prepaidIncome = Number(line.prepaidIncome) || 0;
        const ownerPayment = Number(line.ownerPayment) || 0;
        const expenses = Number(line.expenses) || 0;
        if (reportKind === 'cash') {
          return receivedIncome !== 0 || ownerPayment !== 0 || expenses !== 0;
        }

        return expectedIncome !== 0 || receivedIncome !== 0 || prepaidIncome !== 0 || expenses !== 0;
      });
      if (filteredLines.length === 0) {
        return;
      }

      const sortedLines = this.sortOwnerReportPropertyActivityLines(filteredLines, reportKind);
      result.set(propertyRowId, this.mapOwnerReportPropertyActivityDisplays(propertyRowId, sortedLines));
    });

    return result;
  }

  formatOwnerReportMonthDay(inputDate: string): string {
    if (!inputDate) {
      return '';
    }

    const date = this.utility.parseCalendarDateInput(inputDate);
    if (!date) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}.${year}`;
  }

  mapOwnerReportPropertyActivityStateRow(propertyRowId: string, message: string): OwnerStatementVisibleRow {
    return {
      rowId: `${propertyRowId}:state`,
      kind: 'propertyActivity',
      depth: 3,
      primaryLabel: message,
      propertyCode: '',
      itemDescription: '',
      activityCode: '',
      expected: '',
      expectedValue: 0,
      prePaid: '',
      prePaidValue: 0,
      paidIncome: '',
      paidIncomeValue: 0,
      outstanding: '',
      outstandingValue: 0,
      income: '',
      incomeValue: 0,
      expenses: '',
      expensesValue: 0,
      balance: '',
      balanceValue: 0,
      startingBalance: '',
      startingBalanceValue: 0,
      workingCapital: '',
      workingCapitalValue: 0,
      workingCapitalBalanceDue: '',
      workingCapitalBalanceDueValue: 0,
      ownerPayment: '',
      ownerPaymentValue: 0,
      endingBalance: '',
      endingBalanceValue: 0,
      expandable: false,
      expanded: false
    };
  }

  mapOwnerStatementMonthLineSearchRequest(searchRequest?: MaintenanceListSearchRequest | null): OwnerStatementMonthLineSearchRequest {
    return {
      officeIds: (searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: searchRequest?.propertyId ?? null,
      startDate: searchRequest?.startDate ?? null,
      endDate: searchRequest?.endDate ?? null
    };
  }

  mapOwnerCashReportToMonthLines(report: OwnerCashReportResponse, request: OwnerStatementMonthLineSearchRequest): OwnerStatementMonthLineResponse[] {
    const periodStartDate = (request.startDate ?? '').trim();
    const periodEndDate = (request.endDate ?? request.startDate ?? '').trim();
    const monthDate = periodEndDate || periodStartDate;

    return (report.rows ?? []).map(row => {
      const ownerId = (row.ownerId || '').trim();
      const propertyId = (row.propertyId || '').trim();
      return {
        ownerStatementLineId: [row.officeId, ownerId, propertyId].join('|'),
        officeId: row.officeId,
        officeName: row.officeName,
        ownerId,
        ownerName: row.ownerNameLine,
        propertyId,
        propertyCode: row.propertyCode,
        companyName: row.companyName ?? null,
        ownerNames: row.ownerNames,
        monthDate,
        periodStartDate,
        periodEndDate: periodEndDate || periodStartDate,
        expected: 0,
        prePaid: 0,
        paidIncome: 0,
        outstanding: 0,
        startingBalance: row.startingBalance,
        income: row.receivedIncome,
        expenses: row.ownerExpenses,
        balance: row.receivedIncome - row.ownerExpenses,
        ownerPayment: row.ownerPayment,
        endingBalance: row.endingBalance,
        workingCapital: row.workingCapital,
        workingCapitalBalanceDue: row.receivedIncome - row.ownerExpenses
      };
    });
  }

  mapOwnerStatementMonthLineDisplays(rows: OwnerStatementMonthLineResponse[]): OwnerStatementMonthLineListDisplay[] {
    return (rows || []).map(row => ({
      ownerStatementLineId: (row.ownerStatementLineId || '').trim(),
      officeId: row.officeId,
      ownerId: (row.ownerId || '').trim(),
      propertyId: (row.propertyId || '').trim(),
      officeName: (row.officeName || '').trim(),
      ownerName: (row.ownerName || '').trim(),
      propertyCode: (row.propertyCode || '').trim(),
      companyName: row.companyName ?? null,
      ownerNames: (row.ownerNames || row.ownerName || '').trim(),
      monthDate: (row.monthDate || '').trim(),
      periodStartDate: (row.periodStartDate || row.monthDate || '').trim(),
      periodEndDate: (row.periodEndDate || row.monthDate || '').trim(),
      monthDisplay: this.formatOwnerStatementPeriodDisplay(row.periodStartDate ?? row.monthDate, row.periodEndDate ?? row.monthDate),
      startingBalance: this.formatter.currencyUsd(Number(row.startingBalance) || 0),
      income: this.formatter.currencyUsd(Number(row.income) || 0),
      expenses: this.formatter.currencyUsd(Number(row.expenses) || 0),
      ownerPayment: this.formatter.currencyUsd(Number(row.ownerPayment) || 0),
      endingBalance: this.formatter.currencyUsd(Number(row.endingBalance) || 0),
      workingCapital: this.formatter.currencyUsd(Number(row.workingCapital) || 0)
    }));
  }

  formatOwnerStatementPeriodDisplay(startDate: string | null | undefined, endDate: string | null | undefined): string {
    const start = this.formatOwnerStatementMonthDate(startDate);
    const end = this.formatOwnerStatementMonthDate(endDate);
    if (!start && !end) {
      return '';
    }
    if (!start || start === end) {
      return end || start;
    }
    return `${start} - ${end}`;
  }

  formatOwnerStatementPeriodTitle(startDate: string | null | undefined, endDate: string | null | undefined): string {
    const start = this.utility.parseCalendarDateInput(startDate);
    const end = this.utility.parseCalendarDateInput(endDate ?? startDate);
    if (!start && !end) {
      return '';
    }
    if (!start || !end) {
      const date = start ?? end!;
      return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    const startMonth = start.toLocaleString('en-US', { month: 'long' });
    const endMonth = end.toLocaleString('en-US', { month: 'long' });
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    if (startMonth === endMonth && startYear === endYear) {
      return `${startMonth} ${startYear}`;
    }
    if (startYear === endYear) {
      return `${startMonth} - ${endMonth} ${endYear}`;
    }
    return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
  }

  /** Owner statement month label in MM.YY form, e.g. "05.26" or "05.26 - 06.26". */
  formatOwnerStatementPeriodMonthLabel(startDate: string | null | undefined, endDate: string | null | undefined): string {
    return this.formatOwnerStatementPeriodDisplay(startDate, endDate);
  }

  formatOwnerStatementMonthDate(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = `${date.getFullYear()}`.slice(-2);
    return `${month}.${year}`;
  }

  filterOwnerStatementPropertyActivityLines(
    lines: OwnerStatementPropertyActivityLineResponse[],
    request: OwnerStatementPropertyActivityLineSearchRequest
  ): OwnerStatementPropertyActivityLineResponse[] {
    const propertyId = (request.propertyId || '').trim();
    const rangeStart = this.utility.parseCalendarDateInput(request.startDate);
    const rangeEnd = this.utility.parseCalendarDateInput(request.endDate ?? request.startDate);

    return (lines ?? [])
      .filter(line => {
        if ((line.propertyId || '').trim() !== propertyId) {
          return false;
        }

        const activityDate = this.utility.parseCalendarDateInput(line.activityDate);
        if (!activityDate) {
          return false;
        }

        const activity = this.utility.formatDateOnlyForApi(activityDate);
        const start = rangeStart ? this.utility.formatDateOnlyForApi(rangeStart) : null;
        const end = rangeEnd ? this.utility.formatDateOnlyForApi(rangeEnd) : start;
        if (start && activity < start) {
          return false;
        }
        if (end && activity > end) {
          return false;
        }
        return true;
      })
      .sort((a, b) => this.compareOwnerReportPropertyActivityLines(a, b, 'accrual'));
  }

sortOwnerReportPropertyActivityLines(
    lines: OwnerStatementPropertyActivityLineResponse[],
    reportKind: 'accrual' | 'cash'
  ): OwnerStatementPropertyActivityLineResponse[] {
    return [...(lines || [])].sort((a, b) => this.compareOwnerReportPropertyActivityLines(a, b, reportKind));
  }

compareOwnerReportPropertyActivityLines(
    a: OwnerStatementPropertyActivityLineResponse,
    b: OwnerStatementPropertyActivityLineResponse,
    reportKind: 'accrual' | 'cash'
  ): number {
    if (reportKind === 'cash') {
      const dateCompare = this.utility.compareCalendarDateStrings(a.activityDate, b.activityDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      const periodCompare = this.compareOwnerReportAccountingPeriods(a.accountingPeriod, b.accountingPeriod);
      if (periodCompare !== 0) {
        return periodCompare;
      }
    } else {
      const periodCompare = this.compareOwnerReportAccountingPeriods(a.accountingPeriod, b.accountingPeriod);
      if (periodCompare !== 0) {
        return periodCompare;
      }

      const dateCompare = this.utility.compareCalendarDateStrings(a.activityDate, b.activityDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }
    }

    const sortOrderCompare = this.getOwnerReportActivityLineSortOrder(a) - this.getOwnerReportActivityLineSortOrder(b);
    if (sortOrderCompare !== 0) {
      return sortOrderCompare;
    }

    return (a.documentCode || '').localeCompare(b.documentCode || '', undefined, { sensitivity: 'base' });
  }

compareOwnerReportAccountingPeriods(
    a: string | null | undefined,
    b: string | null | undefined
  ): number {
    const toOrdinal = (value: string | null | undefined): number | null => {
      const trimmed = (value || '').trim();
      if (!trimmed) {
        return null;
      }

      const monthYearMatch = /^(\d{2})\.(\d{2})$/.exec(trimmed);
      if (monthYearMatch) {
        const month = Number(monthYearMatch[1]);
        const year = 2000 + Number(monthYearMatch[2]);
        if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12) {
          return year * 100 + month;
        }
      }

      return this.utility.parseCalendarDateToOrdinal(trimmed);
    };

    const left = toOrdinal(a);
    const right = toOrdinal(b);
    if (left === null && right === null) {
      return 0;
    }
    if (left === null) {
      return -1;
    }
    if (right === null) {
      return 1;
    }
    return left - right;
  }

getOwnerReportActivityLineSortOrder(line: OwnerStatementPropertyActivityLineResponse): number {
    const expectedIncome = Number(line.expectedIncome) || 0;
    const receivedIncome = Number(line.receivedIncome) || 0;
    const prepaidIncome = Number(line.prepaidIncome) || 0;
    const expenses = Number(line.expenses) || 0;

    if (expenses !== 0 && expectedIncome === 0 && receivedIncome === 0 && prepaidIncome === 0) {
      return 3;
    }
    if (expectedIncome > receivedIncome) {
      return 0;
    }
    if (prepaidIncome !== 0 && expectedIncome === 0 && receivedIncome === 0) {
      return 2;
    }
    if (expectedIncome === 0 && receivedIncome !== 0) {
      return 2;
    }
    return 1;
  }

  resolveIsClearedFlag(value: unknown): boolean {
    if (value === true || value === 1) {
      return true;
    }

    if (value === false || value === 0 || value == null) {
      return false;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }

    return false;
  }

  parseCurrencyValue(value: string | null | undefined): number {
    const raw = String(value || '').trim();
    if (!raw) {
      return 0;
    }

    const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
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
    const receiptIdRaw = rawRecord['receiptId'] ?? rawRecord['ReceiptId'] ?? base.receiptId;
    const receiptId = String(receiptIdRaw ?? '').trim();
    const paymentTypeIdRaw = rawRecord['paymentTypeId'] ?? rawRecord['PaymentTypeId'] ?? base.paymentTypeId;
    const paymentTypeId = paymentTypeIdRaw == null ? 0 : Number(paymentTypeIdRaw);
    const checkPrintedRaw = rawRecord['checkPrinted'] ?? rawRecord['CheckPrinted'] ?? base.checkPrinted;
    const checkPrinted = checkPrintedRaw === true || checkPrintedRaw === 'true' || checkPrintedRaw === 1;
    const isUtilityRaw = rawRecord['isUtility'] ?? rawRecord['IsUtility'] ?? base.isUtility;
    const isUtility = isUtilityRaw === true || isUtilityRaw === 'true' || isUtilityRaw === 1;
    const agreementLineIdRaw = rawRecord['agreementLineId'] ?? rawRecord['AgreementLineId'] ?? base.agreementLineId;
    const parsedAgreementLineId = Number(agreementLineIdRaw);
    const agreementLineId = Number.isFinite(parsedAgreementLineId) && parsedAgreementLineId > 0
      ? parsedAgreementLineId
      : null;
    const agreementLineNotesRaw = rawRecord['agreementLineNotes'] ?? rawRecord['AgreementLineNotes'] ?? base.agreementLineNotes;
    const agreementLineNotes = agreementLineNotesRaw == null ? null : String(agreementLineNotesRaw).trim() || null;

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
      receiptId,
      paymentTypeId: Number.isFinite(paymentTypeId) ? paymentTypeId : 0,
      checkPrinted,
      isUtility,
      agreementLineId,
      agreementLineNotes,
      journalEntryId: this.mapOptionalJournalEntryId(rawRecord, base.journalEntryId),
      postingStatusId: this.mapOptionalPostingStatusId(rawRecord, base.postingStatusId),
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
    const chartOfAccountId = Number(
      record.chartOfAccountId
      ?? record['ChartOfAccountId']
      ?? 0
    );
    return Number.isFinite(chartOfAccountId) && chartOfAccountId > 0 ? chartOfAccountId : null;
  }

  mapReceiptSplitFromApi(raw: Split | Record<string, unknown>): Split {
    const record = raw as Split & Record<string, unknown>;
    const chartOfAccountId = this.readSplitChartOfAccountId(record) ?? undefined;
    const receiptTypeId = Number(record.receiptTypeId ?? record['ReceiptTypeId'] ?? 0);
    return {
      receiptSplitId: (record.receiptSplitId ?? record['ReceiptSplitId'] ?? null) as number | null,
      amount: Number(record.amount ?? record['Amount'] ?? 0) || 0,
      description: String(record.description ?? record['Description'] ?? '').trim(),
      propertyId: String(record.propertyId ?? record['PropertyId'] ?? '').trim() || null,
      workOrderId: (record.workOrderId ?? record['WorkOrderId'] ?? null) as string | null,
      workOrderCode: String(record.workOrderCode ?? record['WorkOrderCode'] ?? record.workOrder ?? record['WorkOrder'] ?? '').trim(),
      workOrder: String(record.workOrder ?? record['WorkOrder'] ?? record.workOrderCode ?? record['WorkOrderCode'] ?? '').trim(),
      receiptTypeId: Number.isFinite(receiptTypeId) ? receiptTypeId : 0,
      chartOfAccountId: chartOfAccountId ?? null,
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
        propertyId: String(split.propertyId ?? '').trim() || null,
        workOrderId: split.workOrderId ?? null,
        workOrderCode: split.workOrderCode != null && String(split.workOrderCode).trim().length > 0
          ? String(split.workOrderCode).trim()
          : null,
        workOrder: split.workOrder != null && String(split.workOrder).trim().length > 0
          ? String(split.workOrder).trim()
          : null,
        receiptTypeId: split.receiptTypeId ?? 0,
        chartOfAccountId
      };
    });
  }

  mapReceiptUpdateRequest(
    receipt: ReceiptResponse,
    updates: Partial<Pick<ReceiptRequest, 'bankCardId' | 'vendorId' | 'vendorName' | 'receiptDate' | 'isActive' | 'isUtility'>> = {}
  ): ReceiptRequest {
    const hasBankCardId = Object.prototype.hasOwnProperty.call(updates, 'bankCardId');
    const hasVendorId = Object.prototype.hasOwnProperty.call(updates, 'vendorId');
    const hasVendorName = Object.prototype.hasOwnProperty.call(updates, 'vendorName');
    const hasReceiptDate = Object.prototype.hasOwnProperty.call(updates, 'receiptDate');
    const hasIsActive = Object.prototype.hasOwnProperty.call(updates, 'isActive');
    const hasIsUtility = Object.prototype.hasOwnProperty.call(updates, 'isUtility');

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
      agreementLineId: receipt.agreementLineId ?? null,
      receiptPath: receipt.receiptPath ?? null,
      isUtility: hasIsUtility ? (updates.isUtility ?? receipt.isUtility ?? false) : (receipt.isUtility ?? false),
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
      const receiptTypeTooltip = distinctReceiptTypes.join(', ');
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
      const notes = String((receipt as ReceiptResponse & { notes?: string | null }).notes ?? receipt.agreementLineNotes ?? '').trim();
      return {
        receiptId: receipt.receiptId,
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
        agreementLineId: receipt.agreementLineId ?? null,
        notes,
        infoHidden: false,
        bankCardDisplayName: (receipt.bankCardDisplayName || '').trim(),
        accountDisplay,
        vendorDisplay,
        vendorDisplayReadOnly: !isFirstSplitBill,
        isSplitAmountValid,
        workOrderDisplay,
        receiptTypeDisplay,
        receiptTypeTooltip,
        receiptPath: receipt.receiptPath ?? null,
        isUtility: receipt.isUtility ?? false,
        isActive: receipt.isActive,
        createdBy: receipt.createdBy ?? receipt.createdByName ?? '',
        createdByName: receipt.createdByName ?? receipt.createdBy ?? '',
        modifiedOn: this.formatter.formatDateString(receipt.modifiedOn),
        modifiedBy: receipt.modifiedBy
      };
    });
  }
  //#endregion

  //#region Deposit Mapping
  mapDepositResponse(raw: DepositResponse | Record<string, unknown>): DepositResponse {
    const base = raw as DepositResponse;
    const rawRecord = raw as Record<string, unknown>;
    const depositDate =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['depositDate'] ?? rawRecord['DepositDate'] ?? base.depositDate
      ) ??
      base.depositDate ??
      '';
    const accountingPeriod =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['accountingPeriod'] ?? rawRecord['AccountingPeriod'] ?? base.accountingPeriod
      ) ??
      depositDate;
    const createdOn =
      this.utility.coerceDateTimeOffsetStringFromApi(
        rawRecord['createdOn'] ?? rawRecord['CreatedOn'] ?? base.createdOn
      ) ??
      base.createdOn ??
      '';
    const depositCodeRaw = rawRecord['depositCode'] ?? rawRecord['DepositCode'] ?? base.depositCode;
    const depositCode = String(depositCodeRaw ?? base.depositCode ?? '').trim();
    const depositIdRaw = rawRecord['depositId'] ?? rawRecord['DepositId'] ?? base.depositId;
    const depositId = String(depositIdRaw ?? '').trim();
    const journalEntryIdRaw = rawRecord['journalEntryId'] ?? rawRecord['JournalEntryId'] ?? base.journalEntryId;
    const journalEntryId = journalEntryIdRaw == null || String(journalEntryIdRaw).trim().length === 0
      ? null
      : String(journalEntryIdRaw).trim();

    const propertyIdRaw = rawRecord['propertyId'] ?? rawRecord['PropertyId'] ?? base.propertyId;
    const propertyId = propertyIdRaw == null || String(propertyIdRaw).trim().length === 0
      ? null
      : String(propertyIdRaw).trim();
    const modifiedOn =
      this.utility.coerceDateTimeOffsetStringFromApi(
        rawRecord['modifiedOn'] ?? rawRecord['ModifiedOn'] ?? base.modifiedOn
      ) ??
      base.modifiedOn ??
      '';
    const bankAccountIdRaw = rawRecord['bankAccountId'] ?? rawRecord['BankAccountId'] ?? base.bankAccountId;
    const parsedBankAccountId = Number(bankAccountIdRaw ?? 0);
    const bankAccountId = Number.isFinite(parsedBankAccountId) && parsedBankAccountId > 0
      ? parsedBankAccountId
      : null;
    const createdBy = String(rawRecord['createdBy'] ?? rawRecord['CreatedBy'] ?? base.createdBy ?? base.createdByName ?? '').trim();
    const createdByName = String(rawRecord['createdByName'] ?? rawRecord['CreatedByName'] ?? base.createdByName ?? createdBy).trim();
    const modifiedBy = String(rawRecord['modifiedBy'] ?? rawRecord['ModifiedBy'] ?? base.modifiedBy ?? '').trim();
    const isActiveRaw = rawRecord['isActive'] ?? rawRecord['IsActive'] ?? base.isActive;
    const isActive = isActiveRaw === true || isActiveRaw === 'true' || isActiveRaw === 1;
    const mappedSplits = this.mapDepositSplitsFromApi(
      (rawRecord['splits'] ?? rawRecord['Splits'] ?? base.splits) as DepositSplit[] | undefined | null
    );
    const mappedPropertyIds = this.normalizeDepositPropertyIds(
      rawRecord['propertyIds'] ?? rawRecord['PropertyIds'] ?? base.propertyIds
    );

    return {
      ...base,
      depositDate,
      accountingPeriod,
      createdOn,
      modifiedOn,
      depositCode,
      depositId,
      journalEntryId,
      propertyId,
      organizationId: String(rawRecord['organizationId'] ?? rawRecord['OrganizationId'] ?? base.organizationId ?? '').trim(),
      officeId: Number(rawRecord['officeId'] ?? rawRecord['OfficeId'] ?? base.officeId ?? 0) || 0,
      officeName: String(rawRecord['officeName'] ?? rawRecord['OfficeName'] ?? base.officeName ?? '').trim(),
      description: String(rawRecord['description'] ?? rawRecord['Description'] ?? base.description ?? '').trim(),
      amount: Number(rawRecord['amount'] ?? rawRecord['Amount'] ?? base.amount ?? 0) || 0,
      bankAccountId,
      bankAccountDisplayName: String(rawRecord['bankAccountDisplayName'] ?? rawRecord['BankAccountDisplayName'] ?? base.bankAccountDisplayName ?? '').trim(),
      isActive,
      createdBy: createdBy || createdByName,
      createdByName: createdByName || createdBy,
      modifiedBy,
      postingStatusId: this.mapOptionalPostingStatusId(rawRecord, base.postingStatusId),
      splits: mappedSplits,
      propertyIds: this.resolveDepositPropertyIds(mappedSplits, mappedPropertyIds, propertyId)
    };
  }

normalizeDepositPropertyIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(propertyId => String(propertyId ?? '').trim())
      .filter(propertyId => propertyId.length > 0);
  }

resolveDepositPropertyIds(
    splits: DepositSplit[] | undefined | null,
    existing: string[] | undefined | null,
    headerPropertyId?: string | null
  ): string[] {
    const normalizedExisting = this.normalizeDepositPropertyIds(existing);
    if (normalizedExisting.length > 0) {
      return normalizedExisting;
    }
    const propertyIds = new Set<string>();
    const normalizedHeaderPropertyId = (headerPropertyId || '').trim();
    if (normalizedHeaderPropertyId.length > 0) {
      propertyIds.add(normalizedHeaderPropertyId);
    }
    (splits || [])
      .map(split => (split.propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .forEach(propertyId => propertyIds.add(propertyId));
    return Array.from(propertyIds);
  }

  mapDepositSplitsFromApi(splits: DepositSplit[] | undefined | null): DepositSplit[] {
    const mapped = (splits || []).map(split => this.mapDepositSplitFromApi(split));
    const seenSplitIds = new Set<number>();
    return mapped.filter(split => {
      const splitId = Number(split.depositSplitId ?? 0);
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

  mapDepositSplitFromApi(raw: DepositSplit | Record<string, unknown>): DepositSplit {
    const record = raw as DepositSplit & Record<string, unknown>;
    const chartOfAccountId = Number(record.chartOfAccountId ?? record['ChartOfAccountId'] ?? 0);
    return {
      depositSplitId: (record.depositSplitId ?? record['DepositSplitId'] ?? null) as number | null,
      amount: Number(record.amount ?? record['Amount'] ?? 0) || 0,
      description: String(record.description ?? record['Description'] ?? '').trim(),
      propertyId: String(record.propertyId ?? record['PropertyId'] ?? '').trim() || null,
      propertyCode: String(record.propertyCode ?? record['PropertyCode'] ?? '').trim() || null,
      reservationId: String(record.reservationId ?? record['ReservationId'] ?? '').trim() || null,
      reservationCode: String(record.reservationCode ?? record['ReservationCode'] ?? '').trim() || null,
      contactId: String(record.contactId ?? record['ContactId'] ?? '').trim() || null,
      contactName: String(record.contactName ?? record['ContactName'] ?? '').trim() || null,
      journalEntryLineId: String(record.journalEntryLineId ?? record['JournalEntryLineId'] ?? '').trim() || null,
      chartOfAccountId: Number.isFinite(chartOfAccountId) && chartOfAccountId > 0 ? chartOfAccountId : null,
      chartOfAccountDisplayName: String(record.chartOfAccountDisplayName ?? record['ChartOfAccountDisplayName'] ?? '').trim() || null
    };
  }

  mapDepositDisplays(deposits: DepositResponse[]): DepositDisplayList[] {
    return (deposits || []).map((deposit: DepositResponse): DepositDisplayList => {
      const splits = this.mapDepositSplitsFromApi(deposit.splits);
      const splitTotalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
      const depositAmount = Number(deposit.amount) || 0;
      const distinctAccounts = Array.from(
        new Set(
          splits
            .map(split => (split.chartOfAccountDisplayName || '').trim())
            .filter(label => label.length > 0)
        )
      );
      const propertyIds = this.resolveDepositPropertyIds(splits, deposit.propertyIds, deposit.propertyId);
      return {
        depositId: deposit.depositId,
        depositCode: deposit.depositCode,
        officeId: deposit.officeId,
        officeName: deposit.officeName,
        propertyIds,
        depositDate: this.formatter.formatDateString(deposit.depositDate),
        period: this.formatter.formatListAccountingPeriodDot(deposit.accountingPeriod),
        propertyId: this.resolvePrimaryPropertyId(propertyIds, deposit.propertyId, splits),
        propertyCode: this.buildDepositPropertyCodesDisplay(propertyIds, splits),
        reservationId: this.resolvePrimaryReservationId(splits),
        reservationCode: this.buildDepositReservationCodesDisplay(splits),
        contactName: this.buildDepositContactNamesDisplay(splits),
        descriptionDisplay: deposit.description || '',
        amount: depositAmount,
        amountDisplay: this.formatter.currencyUsd(depositAmount),
        splits,
        splitTotalAmount,
        splitTotalDisplay: this.formatter.currencyUsd(splitTotalAmount),
        splitSummaryDisplay: `${splits.length} split${splits.length === 1 ? '' : 's'}`,
        bankAccountId: deposit.bankAccountId ?? null,
        bankAccountDisplay: (deposit.bankAccountDisplayName || '').trim(),
        accountDisplay: distinctAccounts.join(', '),
        isSplitAmountValid: splitTotalAmount <= depositAmount,
        isActive: deposit.isActive,
        createdBy: deposit.createdBy ?? deposit.createdByName ?? '',
        createdByName: deposit.createdByName ?? deposit.createdBy ?? '',
        modifiedOn: this.formatter.formatDateString(deposit.modifiedOn),
        modifiedBy: deposit.modifiedBy
      };
    });
  }

buildDepositPropertyCodesDisplay(propertyIds: string[], splits: DepositSplit[]): string {
    const codes = new Set<string>();
    (propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .forEach(propertyId => {
        const splitCode = (splits || [])
          .find(split => (split.propertyId || '').trim() === propertyId)?.propertyCode;
        if ((splitCode || '').trim().length > 0) {
          codes.add((splitCode || '').trim());
        }
      });
    return Array.from(codes).join(', ');
  }

  resolvePrimaryPropertyId(
    propertyIds: string[],
    headerPropertyId?: string | null,
    splits?: Array<{ propertyId?: string | null }>
  ): string | null {
    const fromHeader = (headerPropertyId || '').trim();
    if (fromHeader.length > 0) {
      return fromHeader;
    }

    for (const propertyId of propertyIds || []) {
      const trimmedPropertyId = (propertyId || '').trim();
      if (trimmedPropertyId.length > 0) {
        return trimmedPropertyId;
      }
    }

    for (const split of splits || []) {
      const trimmedPropertyId = (split.propertyId || '').trim();
      if (trimmedPropertyId.length > 0) {
        return trimmedPropertyId;
      }
    }

    return null;
  }

  resolvePrimaryReservationId(splits?: Array<{ reservationId?: string | null }>): string | null {
    for (const split of splits || []) {
      const trimmedReservationId = (split.reservationId || '').trim();
      if (trimmedReservationId.length > 0) {
        return trimmedReservationId;
      }
    }

    return null;
  }

buildDepositReservationCodesDisplay(splits: DepositSplit[]): string {
    const codes = Array.from(
      new Set(
        (splits || [])
          .map(split => (split.reservationCode || '').trim())
          .filter(code => code.length > 0)
      )
    );
    return codes.join(', ');
  }

buildDepositContactNamesDisplay(splits: DepositSplit[]): string {
    const names = Array.from(
      new Set(
        (splits || [])
          .map(split => (split.contactName || '').trim())
          .filter(name => name.length > 0)
      )
    );
    return names.join(', ');
  }

  mapDepositUpdateRequest(deposit: DepositResponse, isActive: boolean): DepositRequest {
    const splits = this.mapDepositSplitsFromApi(deposit.splits).map(split => ({
      depositSplitId: split.depositSplitId ?? null,
      amount: Number(split.amount) || 0,
      description: (split.description || '').trim(),
      propertyId: split.propertyId ?? null,
      reservationId: split.reservationId ?? null,
      contactId: split.contactId ?? null,
      journalEntryLineId: split.journalEntryLineId ?? null,
      chartOfAccountId: split.chartOfAccountId ?? null
    }));

    return {
      depositId: deposit.depositId,
      organizationId: deposit.organizationId,
      officeId: deposit.officeId,
      depositDate: deposit.depositDate,
      accountingPeriod: deposit.accountingPeriod,
      amount: Number(deposit.amount) || 0,
      description: (deposit.description || '').trim(),
      propertyId: deposit.propertyId ?? null,
      bankAccountId: deposit.bankAccountId ?? null,
      splits,
      journalEntryId: deposit.journalEntryId ?? null,
      isActive
    };
  }
  //#endregion

  //#region Transfer Mapping
  mapTransferResponse(raw: TransferResponse | Record<string, unknown>): TransferResponse {
    const base = raw as TransferResponse;
    const rawRecord = raw as Record<string, unknown>;
    const transferDate =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['transferDate'] ?? rawRecord['TransferDate'] ?? base.transferDate
      ) ??
      base.transferDate ??
      '';
    const accountingPeriod =
      this.utility.coerceCalendarDateStringFromApi(
        rawRecord['accountingPeriod'] ?? rawRecord['AccountingPeriod'] ?? base.accountingPeriod
      ) ??
      transferDate;
    const createdOn =
      this.utility.coerceDateTimeOffsetStringFromApi(
        rawRecord['createdOn'] ?? rawRecord['CreatedOn'] ?? base.createdOn
      ) ??
      base.createdOn ??
      '';
    const transferCodeRaw = rawRecord['transferCode'] ?? rawRecord['TransferCode'] ?? base.transferCode;
    const transferCode = String(transferCodeRaw ?? base.transferCode ?? '').trim();
    const transferIdRaw = rawRecord['transferId'] ?? rawRecord['TransferId'] ?? base.transferId;
    const transferId = String(transferIdRaw ?? '').trim();
    const journalEntryIdRaw = rawRecord['journalEntryId'] ?? rawRecord['JournalEntryId'] ?? base.journalEntryId;
    const journalEntryId = journalEntryIdRaw == null || String(journalEntryIdRaw).trim().length === 0
      ? null
      : String(journalEntryIdRaw).trim();

    const propertyIdRaw = rawRecord['propertyId'] ?? rawRecord['PropertyId'] ?? base.propertyId;
    const propertyId = propertyIdRaw == null || String(propertyIdRaw).trim().length === 0
      ? null
      : String(propertyIdRaw).trim();
    const modifiedOn =
      this.utility.coerceDateTimeOffsetStringFromApi(
        rawRecord['modifiedOn'] ?? rawRecord['ModifiedOn'] ?? base.modifiedOn
      ) ??
      base.modifiedOn ??
      '';
    const bankAccountIdRaw = rawRecord['bankAccountId'] ?? rawRecord['BankAccountId'] ?? base.bankAccountId;
    const parsedBankAccountId = Number(bankAccountIdRaw ?? 0);
    const bankAccountId = Number.isFinite(parsedBankAccountId) && parsedBankAccountId > 0
      ? parsedBankAccountId
      : null;
    const createdBy = String(rawRecord['createdBy'] ?? rawRecord['CreatedBy'] ?? base.createdBy ?? base.createdByName ?? '').trim();
    const createdByName = String(rawRecord['createdByName'] ?? rawRecord['CreatedByName'] ?? base.createdByName ?? createdBy).trim();
    const modifiedBy = String(rawRecord['modifiedBy'] ?? rawRecord['ModifiedBy'] ?? base.modifiedBy ?? '').trim();
    const isActiveRaw = rawRecord['isActive'] ?? rawRecord['IsActive'] ?? base.isActive;
    const isActive = isActiveRaw === false || isActiveRaw === 'false' || isActiveRaw === 0 ? false : true;
    const hasBeenTransferedRaw = rawRecord['hasBeenTransfered'] ?? rawRecord['HasBeenTransfered'] ?? base.hasBeenTransfered;
    const hasBeenTransfered = hasBeenTransferedRaw === true || hasBeenTransferedRaw === 'true' || hasBeenTransferedRaw === 1;
    const mappedSplits = this.mapTransferSplitsFromApi(
      (rawRecord['splits'] ?? rawRecord['Splits'] ?? base.splits) as TransferSplit[] | undefined | null
    );
    const mappedPropertyIds = this.normalizeTransferPropertyIds(
      rawRecord['propertyIds'] ?? rawRecord['PropertyIds'] ?? base.propertyIds
    );

    return {
      ...base,
      transferDate,
      accountingPeriod,
      createdOn,
      modifiedOn,
      transferCode,
      transferId,
      journalEntryId,
      propertyId,
      organizationId: String(rawRecord['organizationId'] ?? rawRecord['OrganizationId'] ?? base.organizationId ?? '').trim(),
      officeId: Number(rawRecord['officeId'] ?? rawRecord['OfficeId'] ?? base.officeId ?? 0) || 0,
      officeName: String(rawRecord['officeName'] ?? rawRecord['OfficeName'] ?? base.officeName ?? '').trim(),
      description: String(rawRecord['description'] ?? rawRecord['Description'] ?? base.description ?? '').trim(),
      amount: Number(rawRecord['amount'] ?? rawRecord['Amount'] ?? base.amount ?? 0) || 0,
      bankAccountId,
      bankAccountDisplayName: String(rawRecord['bankAccountDisplayName'] ?? rawRecord['BankAccountDisplayName'] ?? base.bankAccountDisplayName ?? '').trim(),
      isActive,
      hasBeenTransfered,
      createdBy: createdBy || createdByName,
      createdByName: createdByName || createdBy,
      modifiedBy,
      postingStatusId: this.mapOptionalPostingStatusId(rawRecord, base.postingStatusId),
      splits: mappedSplits,
      propertyIds: this.resolveTransferPropertyIds(mappedSplits, mappedPropertyIds, propertyId)
    };
  }

normalizeTransferPropertyIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(propertyId => String(propertyId ?? '').trim())
      .filter(propertyId => propertyId.length > 0);
  }

resolveTransferPropertyIds(
    splits: TransferSplit[] | undefined | null,
    existing: string[] | undefined | null,
    headerPropertyId?: string | null
  ): string[] {
    const normalizedExisting = this.normalizeTransferPropertyIds(existing);
    if (normalizedExisting.length > 0) {
      return normalizedExisting;
    }
    const propertyIds = new Set<string>();
    const normalizedHeaderPropertyId = (headerPropertyId || '').trim();
    if (normalizedHeaderPropertyId.length > 0) {
      propertyIds.add(normalizedHeaderPropertyId);
    }
    (splits || [])
      .map(split => (split.propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .forEach(propertyId => propertyIds.add(propertyId));
    return Array.from(propertyIds);
  }

  mapTransferSplitsFromApi(splits: TransferSplit[] | undefined | null): TransferSplit[] {
    const mapped = (splits || []).map(split => this.mapTransferSplitFromApi(split));
    const seenSplitIds = new Set<number>();
    return mapped.filter(split => {
      const splitId = Number(split.transferSplitId ?? 0);
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

  mapTransferSplitFromApi(raw: TransferSplit | Record<string, unknown>): TransferSplit {
    const record = raw as TransferSplit & Record<string, unknown>;
    const chartOfAccountId = Number(record.chartOfAccountId ?? record['ChartOfAccountId'] ?? 0);
    return {
      transferSplitId: (record.transferSplitId ?? record['TransferSplitId'] ?? null) as number | null,
      amount: Number(record.amount ?? record['Amount'] ?? 0) || 0,
      description: String(record.description ?? record['Description'] ?? '').trim(),
      propertyId: String(record.propertyId ?? record['PropertyId'] ?? '').trim() || null,
      propertyCode: String(record.propertyCode ?? record['PropertyCode'] ?? '').trim() || null,
      reservationId: String(record.reservationId ?? record['ReservationId'] ?? '').trim() || null,
      reservationCode: String(record.reservationCode ?? record['ReservationCode'] ?? '').trim() || null,
      contactId: String(record.contactId ?? record['ContactId'] ?? '').trim() || null,
      contactName: String(record.contactName ?? record['ContactName'] ?? '').trim() || null,
      journalEntryLineId: String(record.journalEntryLineId ?? record['JournalEntryLineId'] ?? '').trim() || null,
      chartOfAccountId: Number.isFinite(chartOfAccountId) && chartOfAccountId > 0 ? chartOfAccountId : null,
      chartOfAccountDisplayName: String(record.chartOfAccountDisplayName ?? record['ChartOfAccountDisplayName'] ?? '').trim() || null,
      sourceJournalEntryLineAmount: this.parseOptionalAmount(record.sourceJournalEntryLineAmount ?? record['SourceJournalEntryLineAmount'])
    };
  }

  parseOptionalAmount(value: unknown): number | null {
    if (value == null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  resolveTransferFlatReportEscrowDepositValue(group: TransferSplit[], rowTotalValue: number): number {
    for (const split of group) {
      const sourceAmount = Number(split.sourceJournalEntryLineAmount);
      if (Number.isFinite(sourceAmount) && sourceAmount !== 0) {
        return this.roundCurrency(Math.abs(sourceAmount));
      }
    }

    return rowTotalValue;
  }

  mapTransferDisplays(transfers: TransferResponse[]): TransferDisplayList[] {
    return (transfers || []).map((transfer: TransferResponse): TransferDisplayList => {
      const splits = this.mapTransferSplitsFromApi(transfer.splits);
      const splitTotalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
      const transferAmount = Number(transfer.amount) || 0;
      const distinctAccounts = Array.from(
        new Set(
          splits
            .map(split => (split.chartOfAccountDisplayName || '').trim())
            .filter(label => label.length > 0)
        )
      );
      const propertyIds = this.resolveTransferPropertyIds(splits, transfer.propertyIds, transfer.propertyId);
      return {
        transferId: transfer.transferId,
        transferCode: transfer.transferCode,
        officeId: transfer.officeId,
        officeName: transfer.officeName,
        propertyIds,
        transferDate: this.formatter.formatDateString(transfer.transferDate),
        period: this.formatter.formatListAccountingPeriodDot(transfer.accountingPeriod),
        propertyId: this.resolvePrimaryPropertyId(propertyIds, transfer.propertyId, splits),
        propertyCode: this.buildTransferPropertyCodesDisplay(propertyIds, splits),
        reservationId: this.resolvePrimaryReservationId(splits),
        reservationCode: this.buildTransferReservationCodesDisplay(splits),
        contactName: this.buildTransferContactNamesDisplay(splits),
        descriptionDisplay: this.formatTransferDescriptionDisplay(transfer.description),
        amount: transferAmount,
        amountDisplay: this.formatter.currencyUsd(transferAmount),
        splits,
        splitTotalAmount,
        splitTotalDisplay: this.formatter.currencyUsd(splitTotalAmount),
        splitSummaryDisplay: `${splits.length} split${splits.length === 1 ? '' : 's'}`,
        bankAccountId: transfer.bankAccountId ?? null,
        bankAccountDisplay: (transfer.bankAccountDisplayName || '').trim(),
        accountDisplay: distinctAccounts.join(', '),
        isSplitAmountValid: splitTotalAmount <= transferAmount,
        hasBeenTransfered: transfer.hasBeenTransfered === true,
        isActive: transfer.isActive,
        createdBy: transfer.createdBy ?? transfer.createdByName ?? '',
        createdByName: transfer.createdByName ?? transfer.createdBy ?? '',
        modifiedOn: this.formatter.formatDateString(transfer.modifiedOn),
        modifiedBy: transfer.modifiedBy
      };
    });
  }

  formatTransferDescriptionDisplay(description: string | null | undefined): string {
    const normalized = (description || '').trim();
    if (!normalized || normalized.localeCompare('Transfer', undefined, { sensitivity: 'accent' }) === 0) {
      return 'Transfer to Escrow Accounts';
    }

    return normalized;
  }

buildTransferPropertyCodesDisplay(propertyIds: string[], splits: TransferSplit[]): string {
    const codes = new Set<string>();
    (propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0)
      .forEach(propertyId => {
        const splitCode = (splits || [])
          .find(split => (split.propertyId || '').trim() === propertyId)?.propertyCode;
        if ((splitCode || '').trim().length > 0) {
          codes.add((splitCode || '').trim());
        }
      });
    return Array.from(codes).join(', ');
  }

buildTransferReservationCodesDisplay(splits: TransferSplit[]): string {
    const codes = Array.from(
      new Set(
        (splits || [])
          .map(split => (split.reservationCode || '').trim())
          .filter(code => code.length > 0)
      )
    );
    return codes.join(', ');
  }

buildTransferContactNamesDisplay(splits: TransferSplit[]): string {
    const names = Array.from(
      new Set(
        (splits || [])
          .map(split => (split.contactName || '').trim())
          .filter(name => name.length > 0)
      )
    );
    return names.join(', ');
  }

  mapTransferToFlatReportRows(transfer: TransferResponse, accountIds: TransferFlatReportAccountIds): TransferFlatReportRowDisplay[] {
    const splits = this.mapTransferSplitsFromApi(transfer.splits).filter(split => Number(split.amount) !== 0);
    if (splits.length === 0) {
      return [];
    }

    const groups = new Map<string, TransferSplit[]>();
    splits.forEach((split, index) => {
      const lineId = (split.journalEntryLineId || '').trim();
      const key = lineId || `split-${split.transferSplitId ?? index}`;
      const group = groups.get(key) ?? [];
      group.push(split);
      groups.set(key, group);
    });

    const transferDate = this.formatter.formatDateString(transfer.transferDate);
    const dateRange = this.formatter.formatListAccountingPeriodDot(transfer.accountingPeriod) || transferDate;
    const location = (transfer.officeName || '').trim();

    return Array.from(groups.values()).map(group => {
      let businessValue = 0;
      let ownerEscrowValue = 0;
      let secDepValue = 0;
      let sdwValue = 0;

      group.forEach(split => {
        const amount = Number(split.amount) || 0;
        const accountId = Number(split.chartOfAccountId ?? 0);
        if (accountId > 0 && accountId === Number(accountIds.businessAccountId ?? 0)) {
          businessValue = this.roundCurrency(businessValue + amount);
        } else if (accountId > 0 && accountId === Number(accountIds.ownersAccountId ?? 0)) {
          ownerEscrowValue = this.roundCurrency(ownerEscrowValue + amount);
        } else if (accountId > 0 && accountId === Number(accountIds.secDepAccountId ?? 0)) {
          secDepValue = this.roundCurrency(secDepValue + amount);
        } else if (accountId > 0 && accountId === Number(accountIds.sdwAccountId ?? 0)) {
          sdwValue = this.roundCurrency(sdwValue + amount);
        } else if (accountId > 0 && accountId === Number(accountIds.escrowDepositAccountId ?? 0)) {
          // Escrow deposit is the source column; ignore destination mis-posts here.
        } else {
          businessValue = this.roundCurrency(businessValue + amount);
        }
      });

      const rowTotalValue = this.roundCurrency(businessValue + ownerEscrowValue + secDepValue + sdwValue);
      const escrowDepositValue = this.resolveTransferFlatReportEscrowDepositValue(group, rowTotalValue);
      const outOfBalanceValue = this.roundCurrency(escrowDepositValue - rowTotalValue);
      const context = group[0];
      const reservationCode = (context.reservationCode || '').trim()
        || (transfer.transferCode || '').trim();
      const propertyCode = (context.propertyCode || '').trim();
      const contactName = (context.contactName || '').trim();
      const description = (context.description || transfer.description || '').trim();

      return {
        transferDate,
        type: 'Transfer',
        propertyId: (context.propertyId || transfer.propertyId || '').trim() || null,
        propertyCode,
        reservationId: (context.reservationId || '').trim() || null,
        reservationCode,
        dateRange: description || dateRange,
        escrowDeposit: this.formatFlatReportAmount(escrowDepositValue),
        escrowDepositValue,
        business: this.formatFlatReportAmount(businessValue),
        businessValue,
        ownerEscrow: this.formatFlatReportAmount(ownerEscrowValue),
        ownerEscrowValue,
        secDep: this.formatFlatReportAmount(secDepValue),
        secDepValue,
        sdw: this.formatFlatReportAmount(sdwValue),
        sdwValue,
        location,
        contactName,
        rowTotal: this.formatFlatReportAmount(rowTotalValue),
        rowTotalValue,
        outOfBalance: this.formatFlatReportAmount(outOfBalanceValue),
        outOfBalanceValue
      };
    });
  }

formatFlatReportAmount(value: number): string {
    if (!Number.isFinite(value)) {
      return this.formatter.currencyUsd(0);
    }
    return this.formatter.currencyUsd(value);
  }

roundCurrency(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  mapTransferUpdateRequest(transfer: TransferResponse, isActive: boolean): TransferRequest {
    const splits = this.mapTransferSplitsFromApi(transfer.splits).map(split => ({
      transferSplitId: split.transferSplitId ?? null,
      amount: Number(split.amount) || 0,
      description: (split.description || '').trim(),
      propertyId: split.propertyId ?? null,
      reservationId: split.reservationId ?? null,
      contactId: split.contactId ?? null,
      journalEntryLineId: split.journalEntryLineId ?? null,
      chartOfAccountId: split.chartOfAccountId ?? null
    }));

    return {
      transferId: transfer.transferId,
      organizationId: transfer.organizationId,
      officeId: transfer.officeId,
      transferDate: transfer.transferDate,
      accountingPeriod: transfer.accountingPeriod,
      amount: Number(transfer.amount) || 0,
      description: (transfer.description || '').trim(),
      propertyId: transfer.propertyId ?? null,
      bankAccountId: transfer.bankAccountId ?? null,
      splits,
      journalEntryId: transfer.journalEntryId ?? null,
      isActive
    };
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
        noticeStatusId: Number(o.noticeStatusId ?? 0),
        officeId: o.officeId,
        officeName: o.officeName,
        office: o.officeName || undefined,
        contactId: this.utility.normalizeId(o.contactId),
        contactName: o.contactName,
        tenantName,
        companyId: this.utility.normalizeIdOrNull(o.companyId),
        companyName,
        agentCode: o.agentCode ?? null,
        monthlyRate: Number(o.monthlyRate ?? 0),
        dailyRate: Number(o.dailyRate ?? 0),
        billingRate: Number(o.billingRate ?? 0),
        billingTypeId: Number(o.billingTypeId ?? 0),
        arrivalDate: this.formatter.formatDateString(o.arrivalDate),
        departureDate: this.formatter.formatDateString(o.departureDate),
        reservationTypeId: o.reservationTypeId,
        reservationStatusId: o.reservationStatusId,
        reservationNoticeId: Number(o.reservationNoticeId ?? 0),
        hasPets: this.toBooleanValue(o.hasPets),
        maidUserId: this.utility.normalizeIdOrNull(o.maidUserId),
        maidStartDate: o.maidStartDate ?? null,
        frequencyId: Number(o.frequencyId ?? 0),
        maidServiceFee: Number(o.maidServiceFee ?? 0),
        currentInvoiceNo: Number(o.currentInvoiceNo ?? 0),
        aCleanerUserId: this.utility.normalizeIdOrNull(o.aCleanerUserId),
        aCleaningDate: o.aCleaningDate ?? null,
        aCarpetUserId: this.utility.normalizeIdOrNull(o.aCarpetUserId),
        aCarpetDate: o.aCarpetDate ?? null,
        aInspectorUserId: this.utility.normalizeIdOrNull(o.aInspectorUserId),
        aInspectingDate: o.aInspectingDate ?? null,
        dCleanerUserId: this.utility.normalizeIdOrNull(o.dCleanerUserId),
        dCleaningDate: o.dCleaningDate ?? null,
        dCarpetUserId: this.utility.normalizeIdOrNull(o.dCarpetUserId),
        dCarpetDate: o.dCarpetDate ?? null,
        dInspectorUserId: this.utility.normalizeIdOrNull(o.dInspectorUserId),
        dInspectingDate: o.dInspectingDate ?? null,
        isActive: o.isActive,
        createdOn: this.formatter.formatDateTimeString(o.createdOn)
      };
    });
  }

  mapUnreturnedSecurityDepositsResponse(raw: UnreturnedSecurityDepositsResponse | ReservationDepartureResponse[] | Record<string, unknown> | null | undefined): UnreturnedSecurityDepositsResponse {
    if (!raw) {
      return this.createEmptyUnreturnedSecurityDepositsResponse();
    }

    if (Array.isArray(raw)) {
      const rows = raw.map(row => this.mapReservationDepartureResponse(row as unknown as Record<string, unknown>));
      return {
        ...this.createEmptyUnreturnedSecurityDepositsResponse(),
        rows,
        totalDepositsOwed: this.roundFinancialReportAmount(rows.reduce((sum, row) => sum + Number(row.deposit || 0), 0))
      };
    }

    if (this.isUnreturnedSecurityDepositsResponse(raw)) {
      const rows = (raw.rows ?? []).map(row => this.mapReservationDepartureResponse(row as unknown as Record<string, unknown>));
      return {
        rows,
        totalDepositsOwed: Number(raw.totalDepositsOwed ?? 0),
        escrowBalance: Number(raw.escrowBalance ?? 0),
        discrepancy: Number(raw.discrepancy ?? 0),
        escrowAccountLabel: String(raw.escrowAccountLabel ?? '').trim()
      };
    }

    const record = raw as Record<string, unknown>;
    const rowsRaw = record['rows'] ?? record['Rows'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapReservationDepartureResponse(row as Record<string, unknown>))
      : [];

    return {
      rows,
      totalDepositsOwed: Number(record['totalDepositsOwed'] ?? record['TotalDepositsOwed'] ?? 0),
      escrowBalance: Number(record['escrowBalance'] ?? record['EscrowBalance'] ?? 0),
      discrepancy: Number(record['discrepancy'] ?? record['Discrepancy'] ?? 0),
      escrowAccountLabel: String(record['escrowAccountLabel'] ?? record['EscrowAccountLabel'] ?? '').trim()
    };
  }

  isUnreturnedSecurityDepositsResponse(value: unknown): value is UnreturnedSecurityDepositsResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return 'rows' in value && 'totalDepositsOwed' in value && 'escrowBalance' in value && 'discrepancy' in value;
  }

  createEmptyUnreturnedSecurityDepositsResponse(): UnreturnedSecurityDepositsResponse {
    return {
      rows: [],
      totalDepositsOwed: 0,
      escrowBalance: 0,
      discrepancy: 0,
      escrowAccountLabel: ''
    };
  }

  mapReservationDepartureResponse(raw: Record<string, unknown>): ReservationDepartureResponse {
    const agentCode = String(raw['agentCode'] ?? raw['AgentCode'] ?? '').trim();
    const companyName = String(raw['companyName'] ?? raw['CompanyName'] ?? '').trim();

    return {
      reservationId: this.utility.normalizeId(String(raw['reservationId'] ?? raw['ReservationId'] ?? '')),
      reservationCode: String(raw['reservationCode'] ?? raw['ReservationCode'] ?? ''),
      propertyId: this.utility.normalizeId(String(raw['propertyId'] ?? raw['PropertyId'] ?? '')),
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? ''),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0),
      officeName: String(raw['officeName'] ?? raw['OfficeName'] ?? ''),
      agentCode: agentCode || null,
      contactId: this.utility.normalizeId(String(raw['contactId'] ?? raw['ContactId'] ?? '')),
      contactName: String(raw['contactName'] ?? raw['ContactName'] ?? ''),
      companyId: this.utility.normalizeIdOrNull(String(raw['companyId'] ?? raw['CompanyId'] ?? '')),
      companyName: companyName || null,
      tenantName: String(raw['tenantName'] ?? raw['TenantName'] ?? ''),
      monthlyRate: Number(raw['monthlyRate'] ?? raw['MonthlyRate'] ?? 0),
      dailyRate: Number(raw['dailyRate'] ?? raw['DailyRate'] ?? 0),
      billingRate: Number(raw['billingRate'] ?? raw['BillingRate'] ?? 0),
      billingTypeId: Number(raw['billingTypeId'] ?? raw['BillingTypeId'] ?? 0),
      arrivalDate: this.utility.coerceCalendarDateStringFromApi(raw['arrivalDate'] ?? raw['ArrivalDate']) ?? '',
      departureDate: this.utility.coerceCalendarDateStringFromApi(raw['departureDate'] ?? raw['DepartureDate']) ?? '',
      reservationTypeId: Number(raw['reservationTypeId'] ?? raw['ReservationTypeId'] ?? 0),
      reservationStatusId: Number(raw['reservationStatusId'] ?? raw['ReservationStatusId'] ?? 0),
      hasPets: !!(raw['hasPets'] ?? raw['HasPets']),
      depositTypeId: Number(raw['depositTypeId'] ?? raw['DepositTypeId'] ?? 0),
      deposit: Number(raw['deposit'] ?? raw['Deposit'] ?? 0),
      depositReturned: !!(raw['depositReturned'] ?? raw['DepositReturned']),
      securityDepositReturnDate: this.utility.coerceCalendarDateStringFromApi(raw['securityDepositReturnDate'] ?? raw['SecurityDepositReturnDate']) ?? '',
      collectedAmount: Number(raw['collectedAmount'] ?? raw['CollectedAmount'] ?? raw['paidAmount'] ?? raw['PaidAmount'] ?? 0),
      returnedAmount: Number(raw['returnedAmount'] ?? raw['ReturnedAmount'] ?? 0),
      transferredAmount: Number(raw['transferredAmount'] ?? raw['TransferredAmount'] ?? 0),
      owedAmount: Number(raw['owedAmount'] ?? raw['OwedAmount'] ?? 0),
      balanceAmount: Number(raw['balanceAmount'] ?? raw['BalanceAmount'] ?? 0),
      journalEntryId: this.utility.normalizeIdOrNull(String(raw['journalEntryId'] ?? raw['JournalEntryId'] ?? '')),
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? '').trim(),
      paidJournalEntryId: this.utility.normalizeIdOrNull(String(raw['paidJournalEntryId'] ?? raw['PaidJournalEntryId'] ?? '')),
      paidJournalEntryCode: String(raw['paidJournalEntryCode'] ?? raw['PaidJournalEntryCode'] ?? '').trim(),
      invoiceId: this.utility.normalizeIdOrNull(String(raw['invoiceId'] ?? raw['InvoiceId'] ?? '')),
      invoiceCode: String(raw['invoiceCode'] ?? raw['InvoiceCode'] ?? '').trim()
    };
  }

  mapSecurityDepositDetailResponse(raw: Record<string, unknown> | SecurityDepositDetailResponse | null | undefined): SecurityDepositDetailResponse {
    if (!raw) {
      return this.createEmptySecurityDepositDetailResponse();
    }

    if (this.isSecurityDepositDetailResponse(raw)) {
      return raw;
    }

    const record = raw as Record<string, unknown>;
    const reservationRaw = (record['reservation'] ?? record['Reservation'] ?? {}) as Record<string, unknown>;

    return {
      reservation: this.mapReservationDepartureResponse(reservationRaw),
      depositAmount: Number(record['depositAmount'] ?? record['DepositAmount'] ?? 0),
      collectedAmount: Number(record['collectedAmount'] ?? record['CollectedAmount'] ?? 0),
      owedAmount: Number(record['owedAmount'] ?? record['OwedAmount'] ?? 0),
      balanceAmount: Number(record['balanceAmount'] ?? record['BalanceAmount'] ?? 0),
      returnedAmount: Number(record['returnedAmount'] ?? record['ReturnedAmount'] ?? 0),
      remainingReturnAmount: Number(record['remainingReturnAmount'] ?? record['RemainingReturnAmount'] ?? 0),
      securityDepositCharges: this.mapSecurityDepositDetailLines(record['securityDepositCharges'] ?? record['SecurityDepositCharges']),
      outstandingCharges: this.mapSecurityDepositDetailLines(record['outstandingCharges'] ?? record['OutstandingCharges']),
      securityDepositPayments: this.mapSecurityDepositDetailLines(record['securityDepositPayments'] ?? record['SecurityDepositPayments']),
      returnPayments: this.mapSecurityDepositDetailReturnLines(record['returnPayments'] ?? record['ReturnPayments'])
    };
  }

  isSecurityDepositDetailResponse(value: unknown): value is SecurityDepositDetailResponse {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return 'reservation' in value && 'securityDepositCharges' in value && 'securityDepositPayments' in value;
  }

  createEmptySecurityDepositDetailResponse(): SecurityDepositDetailResponse {
    return {
      reservation: this.mapReservationDepartureResponse({}),
      depositAmount: 0,
      collectedAmount: 0,
      owedAmount: 0,
      balanceAmount: 0,
      returnedAmount: 0,
      remainingReturnAmount: 0,
      securityDepositCharges: [],
      outstandingCharges: [],
      securityDepositPayments: [],
      returnPayments: []
    };
  }

  mapSecurityDepositDetailLines(raw: unknown): SecurityDepositDetailLineResponse[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map(line => this.mapSecurityDepositDetailLine(line as Record<string, unknown>));
  }

  mapSecurityDepositDetailLine(raw: Record<string, unknown>): SecurityDepositDetailLineResponse {
    return {
      invoiceId: this.utility.normalizeIdOrNull(String(raw['invoiceId'] ?? raw['InvoiceId'] ?? '')),
      invoiceCode: String(raw['invoiceCode'] ?? raw['InvoiceCode'] ?? '').trim(),
      ledgerLineId: this.utility.normalizeIdOrNull(String(raw['ledgerLineId'] ?? raw['LedgerLineId'] ?? '')),
      lineDate: this.utility.coerceCalendarDateStringFromApi(raw['lineDate'] ?? raw['LineDate']) ?? null,
      description: String(raw['description'] ?? raw['Description'] ?? '').trim(),
      amount: Number(raw['amount'] ?? raw['Amount'] ?? 0),
      journalEntryId: this.utility.normalizeIdOrNull(String(raw['journalEntryId'] ?? raw['JournalEntryId'] ?? '')),
      journalEntryCode: String(raw['journalEntryCode'] ?? raw['JournalEntryCode'] ?? '').trim()
    };
  }

  mapSecurityDepositDetailReturnLines(raw: unknown): SecurityDepositDetailReturnLineResponse[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map(line => {
      const record = line as Record<string, unknown>;
      return {
        journalEntryId: this.utility.normalizeId(String(record['journalEntryId'] ?? record['JournalEntryId'] ?? '')),
        journalEntryCode: String(record['journalEntryCode'] ?? record['JournalEntryCode'] ?? '').trim(),
        transactionDate: this.utility.coerceCalendarDateStringFromApi(record['transactionDate'] ?? record['TransactionDate']) ?? '',
        memo: String(record['memo'] ?? record['Memo'] ?? '').trim(),
        amount: Number(record['amount'] ?? record['Amount'] ?? 0)
      };
    });
  }

  mapUnreturnedSecurityDeposits(response: UnreturnedSecurityDepositsResponse | ReservationDepartureResponse[] | null | undefined): UnreturnedSecurityDepositDisplay[] {
    const rows = Array.isArray(response)
      ? response
      : (response?.rows || []);

    return (rows || []).map(row => {
      const companyName = String(row.companyName || '').trim();
      const tenantName = String(row.tenantName || '').trim();
      const contactName = String(row.contactName || '').trim();

      const collectedAmount = Number(row.collectedAmount ?? 0);
      const owedAmount = Number(row.owedAmount ?? 0);
      const transferredAmount = Number(row.transferredAmount ?? 0);
      const returnedBalanceAmount = this.roundFinancialReportAmount(
        Math.max(0, Number(row.balanceAmount ?? collectedAmount - owedAmount))
      );
      const paidAmount = Number(row.returnedAmount ?? 0);
      const remainingReturnAmount = this.roundFinancialReportAmount(Math.max(0, returnedBalanceAmount - paidAmount));
      const remainingTransferAmount = this.roundFinancialReportAmount(Math.max(0, owedAmount - transferredAmount));
      const depositReturned = !!row.depositReturned;
      const depositComplete = Number(row.deposit ?? 0) > 0
        && collectedAmount > 0
        && this.roundFinancialReportAmount(collectedAmount) === this.roundFinancialReportAmount(paidAmount + transferredAmount);

      return {
        reservationId: this.utility.normalizeId(row.reservationId),
        reservationCode: row.reservationCode,
        propertyCode: row.propertyCode,
        officeId: row.officeId,
        invoiceId: this.utility.normalizeId(row.invoiceId ?? ''),
        invoiceCode: String(row.invoiceCode ?? '').trim(),
        contactName,
        tenantName,
        companyName,
        arrivalDate: this.formatter.formatDateString(row.arrivalDate),
        departureDate: this.formatter.formatDateString(row.departureDate),
        securityDepositReturnDate: this.formatter.formatDateString(row.securityDepositReturnDate),
        depositDisplay: this.formatter.currencyUsd(row.deposit),
        deposit: Number(row.deposit ?? 0),
        collectedDisplay: this.formatter.currencyUsd(collectedAmount),
        collectedAmount,
        owedDisplay: this.formatter.currencyUsd(owedAmount),
        owedAmount,
        returnedBalanceAmount,
        returnedDisplay: this.formatter.currencyUsd(returnedBalanceAmount),
        paidDisplay: this.formatter.currencyUsd(paidAmount),
        paidAmount,
        transferredDisplay: this.formatter.currencyUsd(transferredAmount),
        transferredAmount,
        journalEntryId: this.utility.normalizeId(row.paidJournalEntryId ?? ''),
        journalEntryCode: String(row.paidJournalEntryCode ?? '').trim(),
        paidJournalEntryId: this.utility.normalizeId(row.paidJournalEntryId ?? ''),
        paidJournalEntryCode: String(row.paidJournalEntryCode ?? '').trim(),
        depositReturned,
        depositComplete,
        payableDisabled: depositReturned || collectedAmount <= 0 || remainingReturnAmount <= 0,
        transferDisabled: collectedAmount <= 0 || collectedAmount <= returnedBalanceAmount || remainingTransferAmount <= 0
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
    property: Pick<PropertyListResponse, 'propertyId' | 'propertyCode' | 'officeId' | 'officeName' | 'monthlyRate' | 'dailyRate'>,
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
        noticeStatusId: 0,
        officeId: property.officeId,
        officeName: property.officeName,
        contactId: '',
        contactName: summary,
        companyId: null,
        companyName: null,
        tenantName: summary,
        agentCode: null,
        monthlyRate: property.monthlyRate,
        dailyRate: property.dailyRate,
        billingRate: 0,
        billingTypeId: 0,
        arrivalDate: event.arrivalDate,
        departureDate: event.departureDate,
        reservationTypeId: ReservationType.Individual,
        reservationStatusId: ReservationStatus.Confirmed,
        reservationNoticeId: 0,
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

  //#region Financial Report Mapping
  private readonly financialReportProfitLossAccountTypes = [
    AccountType.Income,
    AccountType.OtherIncome,
    AccountType.CostOfGoodsSold,
    AccountType.Expense,
    AccountType.OtherExpense
  ];

  /** Year-end close JEs posted the day after fiscal year-end; excluded from P&L activity. */
  isRetainedEarningsCloseJournalEntryLine(
    line: Pick<JournalEntryLineSearchResponse, 'journalEntryMemo' | 'sourceTypeId'>
  ): boolean {
    const sourceTypeId = Number(line.sourceTypeId);
    const memo = line.journalEntryMemo?.trim() ?? '';
    return sourceTypeId === SourceType.Journal
      && memo.toLowerCase().startsWith('retained earnings for ');
  }

  shouldExcludeRetainedEarningsCloseFromProfitLossActivity(
    line: JournalEntryLineSearchResponse,
    accountTypeId: number | undefined
  ): boolean {
    return this.isRetainedEarningsCloseJournalEntryLine(line)
      && this.isFinancialReportProfitLossAccountType(accountTypeId);
  }

  buildFinancialReport(request: FinancialReportBuildRequest): FinancialReportResult {
    request = {
      ...request,
      reportClass: this.normalizeFinancialReportClass(request.reportClass)
    };
    if (request.reportKind === 'balanceSheet') {
      return this.buildBalanceSheetReport(request);
    }
    return this.buildProfitLossReport(request);
  }

  normalizeFinancialReportClass(reportClass: Class | number | null | undefined): Class {
    const normalized = Number(reportClass);
    if (!Number.isFinite(normalized) || normalized < Class.TotalOnly || normalized > Class.Account) {
      return Class.TotalOnly;
    }
    return normalized as Class;
  }

  buildProfitLossReport(request: FinancialReportBuildRequest): FinancialReportResult {
    const filteredAccounts = this.filterFinancialReportAccounts(request.accounts, request.chartOfAccountId, [
      AccountType.Income,
      AccountType.OtherIncome,
      AccountType.CostOfGoodsSold,
      AccountType.Expense,
      AccountType.OtherExpense
    ]);
    const { accounts, chartOfAccountId, accountIdRemap } = this.prepareFinancialReportScope(
      filteredAccounts,
      request.chartOfAccountId
    );
    const columnContext = this.buildFinancialReportColumnContext(
      request.reportClass ?? Class.TotalOnly,
      request.startDate,
      request.endDate,
      false,
      request.lines,
      accounts
    );
    const rawAmountsByAccountId = this.aggregateProfitLossAmountsByAccountIdAndColumn(
      request.lines,
      request.startDate,
      request.endDate,
      filteredAccounts,
      columnContext,
      accountIdRemap
    );
    const amountsByAccountIdAndColumn = this.consolidateFinancialReportAmountsByAccountIdAndColumn(
      rawAmountsByAccountId,
      accountIdRemap,
      columnContext.columnIds,
      filteredAccounts,
      'activity'
    );
    const incomeAccounts = accounts.filter(account => account.accountTypeId === AccountType.Income || account.accountTypeId === AccountType.OtherIncome);
    const cogsAccounts = accounts.filter(account => account.accountTypeId === AccountType.CostOfGoodsSold);
    const expenseAccounts = accounts.filter(account => account.accountTypeId === AccountType.Expense || account.accountTypeId === AccountType.OtherExpense);
    const incomeTree = this.buildFinancialReportAccountTree(incomeAccounts, amountsByAccountIdAndColumn, chartOfAccountId, columnContext);
    const cogsTree = this.buildFinancialReportAccountTree(cogsAccounts, amountsByAccountIdAndColumn, chartOfAccountId, columnContext);
    const expenseTree = this.buildFinancialReportAccountTree(expenseAccounts, amountsByAccountIdAndColumn, chartOfAccountId, columnContext);
    const totalIncome = this.sumFinancialReportTreeAmounts(incomeTree);
    const totalCogs = this.sumFinancialReportTreeAmounts(cogsTree);
    const totalExpense = this.sumFinancialReportTreeAmounts(expenseTree);
    const grossProfit = this.roundFinancialReportAmount(totalIncome - totalCogs);
    const netIncome = this.roundFinancialReportAmount(grossProfit - totalExpense);
    const incomeColumnAmounts = this.sumFinancialReportTreeColumnAmounts(incomeTree, columnContext);
    const cogsColumnAmounts = this.sumFinancialReportTreeColumnAmounts(cogsTree, columnContext);
    const expenseColumnAmounts = this.sumFinancialReportTreeColumnAmounts(expenseTree, columnContext);
    const grossProfitColumnAmounts = this.subtractFinancialReportColumnAmounts(incomeColumnAmounts, cogsColumnAmounts, columnContext);
    const netIncomeColumnAmounts = this.subtractFinancialReportColumnAmounts(grossProfitColumnAmounts, expenseColumnAmounts, columnContext);
    const incomeDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.Income, AccountType.OtherIncome],
      mode: 'activity'
    };
    const cogsDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.CostOfGoodsSold],
      mode: 'activity'
    };
    const expenseDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.Expense, AccountType.OtherExpense],
      mode: 'activity'
    };
    const grossProfitDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.Income, AccountType.OtherIncome, AccountType.CostOfGoodsSold],
      mode: 'activity'
    };
    const netIncomeDrillDown: FinancialReportDrillDownSpec = {
      includeProfitLossActivity: true,
      mode: 'activity'
    };

    return {
      reportTitle: 'Profit & Loss',
      periodLabel: this.buildFinancialReportPeriodLabel(request.startDate, request.endDate, false),
      columns: columnContext.columns,
      showTotalColumn: columnContext.showTotalColumn,
      drillDownContext: this.buildFinancialReportDrillDownContext(
        'profitLoss',
        columnContext,
        accounts,
        accountIdRemap,
        request.startDate,
        request.endDate
      ),
      sections: [
        this.buildFinancialReportSectionNode('section-income', 'Income', incomeTree, totalIncome, incomeColumnAmounts, 0, incomeDrillDown),
        this.buildFinancialReportTotalNode('total-income', 'Total Income', totalIncome, incomeColumnAmounts, 0, incomeDrillDown),
        this.buildFinancialReportSectionNode('section-cogs', 'Cost of Goods Sold', cogsTree, totalCogs, cogsColumnAmounts, 0, cogsDrillDown),
        this.buildFinancialReportTotalNode('total-cogs', 'Total COGS', totalCogs, cogsColumnAmounts, 0, cogsDrillDown),
        this.buildFinancialReportSummaryNode('summary-gross-profit', 'Gross Profit', grossProfit, grossProfitColumnAmounts, 0, grossProfitDrillDown),
        this.buildFinancialReportSectionNode('section-expense', 'Expense', expenseTree, totalExpense, expenseColumnAmounts, 0, expenseDrillDown),
        this.buildFinancialReportTotalNode('total-expense', 'Total Expense', totalExpense, expenseColumnAmounts, 0, expenseDrillDown),
        this.buildFinancialReportSummaryNode('summary-net-income', 'Net Income', netIncome, netIncomeColumnAmounts, 0, netIncomeDrillDown)
      ]
    };
  }

  buildBalanceSheetReport(request: FinancialReportBuildRequest): FinancialReportResult {
    const asOfDate = this.resolveFinancialReportBalanceSheetAsOfDate(request.endDate);
    request = {
      ...request,
      startDate: this.resolveAsOfReportYearStartDate(asOfDate),
      endDate: asOfDate
    };

    const balanceFilteredAccounts = this.filterFinancialReportAccounts(request.accounts, request.chartOfAccountId, [
      AccountType.Bank,
      AccountType.AccountsReceivable,
      AccountType.OtherCurrentAsset,
      AccountType.FixedAsset,
      AccountType.OtherAsset,
      AccountType.AccountsPayable,
      AccountType.CreditCard,
      AccountType.OtherCurrentLiability,
      AccountType.LongTermLiability,
      AccountType.Equity
    ]);
    const { accounts: balanceAccounts, chartOfAccountId, accountIdRemap } = this.prepareFinancialReportScope(
      balanceFilteredAccounts,
      request.chartOfAccountId
    );
    const columnContext = this.buildFinancialReportColumnContext(
      request.reportClass ?? Class.TotalOnly,
      request.startDate,
      request.endDate,
      true,
      request.lines,
      balanceAccounts
    );
    const rawBalanceAmountsByAccountId = this.aggregateBalanceSheetAmountsByAccountIdAndColumn(
      request.lines,
      request.endDate,
      balanceFilteredAccounts,
      columnContext,
      accountIdRemap
    );
    const balanceAmountsByAccountIdAndColumn = this.consolidateFinancialReportAmountsByAccountIdAndColumn(
      rawBalanceAmountsByAccountId,
      accountIdRemap,
      columnContext.columnIds,
      balanceFilteredAccounts,
      'balance'
    );
    const plFilteredAccounts = this.filterFinancialReportAccounts(request.accounts, request.chartOfAccountId, [
      AccountType.Income,
      AccountType.OtherIncome,
      AccountType.CostOfGoodsSold,
      AccountType.Expense,
      AccountType.OtherExpense
    ]);
    const { accounts: plAccounts, accountIdRemap: plAccountIdRemap } = this.prepareFinancialReportScope(
      plFilteredAccounts,
      request.chartOfAccountId
    );
    const rawProfitLossAmountsByAccountId = this.aggregateProfitLossAmountsByAccountIdAndColumn(
      request.lines,
      request.startDate,
      request.endDate,
      plFilteredAccounts,
      columnContext,
      plAccountIdRemap
    );
    const profitLossAmountsByAccountIdAndColumn = this.consolidateFinancialReportAmountsByAccountIdAndColumn(
      rawProfitLossAmountsByAccountId,
      plAccountIdRemap,
      columnContext.columnIds,
      plFilteredAccounts,
      'activity'
    );
    // Balance-sheet Net Income is year-to-date through each column (as-of), not that period alone.
    const netIncomeColumnAmounts = this.finalizeFinancialReportColumnAmounts(
      this.subtractFinancialReportColumnAmounts(
        this.subtractFinancialReportColumnAmounts(
          this.sumFinancialReportAmountsForAccountTypesColumnAmounts(profitLossAmountsByAccountIdAndColumn, plAccounts, columnContext, AccountType.Income, AccountType.OtherIncome),
          this.sumFinancialReportAmountsForAccountTypesColumnAmounts(profitLossAmountsByAccountIdAndColumn, plAccounts, columnContext, AccountType.CostOfGoodsSold),
          columnContext
        ),
        this.sumFinancialReportAmountsForAccountTypesColumnAmounts(profitLossAmountsByAccountIdAndColumn, plAccounts, columnContext, AccountType.Expense, AccountType.OtherExpense),
        columnContext
      ),
      columnContext,
      'balance'
    );
    const netIncome = this.getFinancialReportTotalFromColumnAmounts(netIncomeColumnAmounts, columnContext);

    const assetAccounts = balanceAccounts.filter(account =>
      account.accountTypeId === AccountType.Bank
      || account.accountTypeId === AccountType.AccountsReceivable
      || account.accountTypeId === AccountType.OtherCurrentAsset
      || account.accountTypeId === AccountType.FixedAsset
      || account.accountTypeId === AccountType.OtherAsset);
    const liabilityAccounts = balanceAccounts.filter(account =>
      account.accountTypeId === AccountType.AccountsPayable
      || account.accountTypeId === AccountType.CreditCard
      || account.accountTypeId === AccountType.OtherCurrentLiability
      || account.accountTypeId === AccountType.LongTermLiability);
    const equityAccounts = balanceAccounts.filter(account => account.accountTypeId === AccountType.Equity);

    const currentAssetTree = this.buildFinancialReportAccountTree(
      assetAccounts.filter(account =>
        account.accountTypeId === AccountType.Bank
        || account.accountTypeId === AccountType.AccountsReceivable
        || account.accountTypeId === AccountType.OtherCurrentAsset),
      balanceAmountsByAccountIdAndColumn,
      chartOfAccountId,
      columnContext
    );
    const fixedAssetTree = this.buildFinancialReportAccountTree(
      assetAccounts.filter(account => account.accountTypeId === AccountType.FixedAsset),
      balanceAmountsByAccountIdAndColumn,
      chartOfAccountId,
      columnContext
    );
    const otherAssetTree = this.buildFinancialReportAccountTree(
      assetAccounts.filter(account => account.accountTypeId === AccountType.OtherAsset),
      balanceAmountsByAccountIdAndColumn,
      chartOfAccountId,
      columnContext
    );
    const currentLiabilityTree = this.buildFinancialReportAccountTree(
      liabilityAccounts.filter(account =>
        account.accountTypeId === AccountType.AccountsPayable
        || account.accountTypeId === AccountType.CreditCard
        || account.accountTypeId === AccountType.OtherCurrentLiability),
      balanceAmountsByAccountIdAndColumn,
      chartOfAccountId,
      columnContext
    );
    const longTermLiabilityTree = this.buildFinancialReportAccountTree(
      liabilityAccounts.filter(account => account.accountTypeId === AccountType.LongTermLiability),
      balanceAmountsByAccountIdAndColumn,
      chartOfAccountId,
      columnContext
    );
    const equityTree = this.buildFinancialReportAccountTree(equityAccounts, balanceAmountsByAccountIdAndColumn, chartOfAccountId, columnContext);

    const totalCurrentAssets = this.sumFinancialReportTreeAmounts(currentAssetTree);
    const totalFixedAssets = this.sumFinancialReportTreeAmounts(fixedAssetTree);
    const totalOtherAssets = this.sumFinancialReportTreeAmounts(otherAssetTree);
    const totalAssets = this.roundFinancialReportAmount(totalCurrentAssets + totalFixedAssets + totalOtherAssets);
    const totalCurrentLiabilities = this.sumFinancialReportTreeAmounts(currentLiabilityTree);
    const totalLongTermLiabilities = this.sumFinancialReportTreeAmounts(longTermLiabilityTree);
    const totalLiabilities = this.roundFinancialReportAmount(totalCurrentLiabilities + totalLongTermLiabilities);
    const totalEquityAccounts = this.sumFinancialReportTreeAmounts(equityTree);
    const totalEquity = this.roundFinancialReportAmount(totalEquityAccounts + netIncome);
    const totalLiabilitiesAndEquity = this.roundFinancialReportAmount(totalLiabilities + totalEquity);
    const totalAssetsColumnAmounts = this.sumFinancialReportTreeColumnAmounts([...currentAssetTree, ...fixedAssetTree, ...otherAssetTree], columnContext);
    const totalCurrentAssetsColumnAmounts = this.sumFinancialReportTreeColumnAmounts(currentAssetTree, columnContext);
    const totalFixedAssetsColumnAmounts = this.sumFinancialReportTreeColumnAmounts(fixedAssetTree, columnContext);
    const totalOtherAssetsColumnAmounts = this.sumFinancialReportTreeColumnAmounts(otherAssetTree, columnContext);
    const totalCurrentLiabilitiesColumnAmounts = this.sumFinancialReportTreeColumnAmounts(currentLiabilityTree, columnContext);
    const totalLongTermLiabilitiesColumnAmounts = this.sumFinancialReportTreeColumnAmounts(longTermLiabilityTree, columnContext);
    const totalLiabilitiesColumnAmounts = this.addFinancialReportColumnAmounts(totalCurrentLiabilitiesColumnAmounts, totalLongTermLiabilitiesColumnAmounts, columnContext);
    const totalEquityAccountsColumnAmounts = this.sumFinancialReportTreeColumnAmounts(equityTree, columnContext);
    const totalEquityColumnAmounts = this.addFinancialReportColumnAmounts(totalEquityAccountsColumnAmounts, netIncomeColumnAmounts, columnContext);
    const totalLiabilitiesAndEquityColumnAmounts = this.addFinancialReportColumnAmounts(totalLiabilitiesColumnAmounts, totalEquityColumnAmounts, columnContext);

    const currentAssetDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.Bank, AccountType.AccountsReceivable, AccountType.OtherCurrentAsset],
      mode: 'balance'
    };
    const fixedAssetDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.FixedAsset],
      mode: 'balance'
    };
    const otherAssetDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.OtherAsset],
      mode: 'balance'
    };
    const totalAssetsDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [
        AccountType.Bank,
        AccountType.AccountsReceivable,
        AccountType.OtherCurrentAsset,
        AccountType.FixedAsset,
        AccountType.OtherAsset
      ],
      mode: 'balance'
    };
    const currentLiabilityDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.AccountsPayable, AccountType.CreditCard, AccountType.OtherCurrentLiability],
      mode: 'balance'
    };
    const longTermLiabilityDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.LongTermLiability],
      mode: 'balance'
    };
    const totalLiabilitiesDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [
        AccountType.AccountsPayable,
        AccountType.CreditCard,
        AccountType.OtherCurrentLiability,
        AccountType.LongTermLiability
      ],
      mode: 'balance'
    };
    const netIncomeDrillDown: FinancialReportDrillDownSpec = {
      includeProfitLossActivity: true,
      mode: 'activity'
    };
    const totalEquityDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [AccountType.Equity],
      includeProfitLossActivity: true,
      mode: 'balance'
    };
    const totalLiabilitiesAndEquityDrillDown: FinancialReportDrillDownSpec = {
      accountTypeIds: [
        AccountType.AccountsPayable,
        AccountType.CreditCard,
        AccountType.OtherCurrentLiability,
        AccountType.LongTermLiability,
        AccountType.Equity
      ],
      includeProfitLossActivity: true,
      mode: 'balance'
    };

    const assetChildNodes: FinancialReportTreeNode[] = [];
    if (currentAssetTree.length > 0) {
      assetChildNodes.push(this.buildFinancialReportSectionNode('section-current-assets', 'Current Assets', currentAssetTree, totalCurrentAssets, totalCurrentAssetsColumnAmounts, 1, currentAssetDrillDown));
    }
    if (fixedAssetTree.length > 0) {
      assetChildNodes.push(this.buildFinancialReportSectionNode('section-fixed-assets', 'Fixed Assets', fixedAssetTree, totalFixedAssets, totalFixedAssetsColumnAmounts, 1, fixedAssetDrillDown));
    }
    if (otherAssetTree.length > 0) {
      assetChildNodes.push(this.buildFinancialReportSectionNode('section-other-assets', 'Other Assets', otherAssetTree, totalOtherAssets, totalOtherAssetsColumnAmounts, 1, otherAssetDrillDown));
    }
    assetChildNodes.push(this.buildFinancialReportTotalNode('total-assets', 'TOTAL ASSETS', totalAssets, totalAssetsColumnAmounts, 1, totalAssetsDrillDown));

    const assetSections: FinancialReportTreeNode[] = [
      this.buildFinancialReportSectionNode('section-assets', 'ASSETS', assetChildNodes, totalAssets, totalAssetsColumnAmounts, 0, totalAssetsDrillDown)
    ];

    const liabilityEquityChildNodes: FinancialReportTreeNode[] = [];
    if (currentLiabilityTree.length > 0) {
      liabilityEquityChildNodes.push(this.buildFinancialReportSectionNode('section-current-liabilities', 'Current Liabilities', currentLiabilityTree, totalCurrentLiabilities, totalCurrentLiabilitiesColumnAmounts, 1, currentLiabilityDrillDown));
    }
    if (longTermLiabilityTree.length > 0) {
      liabilityEquityChildNodes.push(this.buildFinancialReportSectionNode('section-long-term-liabilities', 'Long Term Liabilities', longTermLiabilityTree, totalLongTermLiabilities, totalLongTermLiabilitiesColumnAmounts, 1, longTermLiabilityDrillDown));
    }
    liabilityEquityChildNodes.push(this.buildFinancialReportTotalNode('total-liabilities', 'Total Liabilities', totalLiabilities, totalLiabilitiesColumnAmounts, 1, totalLiabilitiesDrillDown));
    const equityNodes = [
      ...equityTree,
      this.buildFinancialReportLineItemNode('line-net-income', 'Net Income', netIncome, netIncomeColumnAmounts, 1, netIncomeDrillDown)
    ];
    liabilityEquityChildNodes.push(this.buildFinancialReportSectionNode('section-equity', 'Equity', equityNodes, totalEquity, totalEquityColumnAmounts, 1, totalEquityDrillDown));
    liabilityEquityChildNodes.push(this.buildFinancialReportTotalNode('total-equity', 'Total Equity', totalEquity, totalEquityColumnAmounts, 1, totalEquityDrillDown));
    liabilityEquityChildNodes.push(this.buildFinancialReportTotalNode('total-liabilities-equity', 'TOTAL LIABILITIES & EQUITY', totalLiabilitiesAndEquity, totalLiabilitiesAndEquityColumnAmounts, 1, totalLiabilitiesAndEquityDrillDown));

    const liabilityEquitySections: FinancialReportTreeNode[] = [
      this.buildFinancialReportSectionNode('section-liabilities-equity', 'LIABILITIES & EQUITY', liabilityEquityChildNodes, totalLiabilitiesAndEquity, totalLiabilitiesAndEquityColumnAmounts, 0, totalLiabilitiesAndEquityDrillDown)
    ];

    return {
      reportTitle: 'Balance Sheet',
      periodLabel: this.buildFinancialReportPeriodLabel(request.startDate, request.endDate, true),
      columns: columnContext.columns,
      showTotalColumn: columnContext.showTotalColumn,
      drillDownContext: this.buildFinancialReportDrillDownContext(
        'balanceSheet',
        columnContext,
        balanceAccounts,
        accountIdRemap,
        request.startDate,
        request.endDate
      ),
      sections: [...assetSections, ...liabilityEquitySections]
    };
  }

  buildFinancialReportColumnContext(
    reportClass: Class,
    startDate: string | null,
    endDate: string | null,
    balanceSheet: boolean,
    lines: JournalEntryLineSearchResponse[],
    accounts: ChartOfAccountResponse[]
  ): FinancialReportColumnContext {
    const normalizedReportClass = this.normalizeFinancialReportClass(reportClass);
    const columnStartDate = balanceSheet
      ? this.resolveFinancialReportBalanceSheetColumnStartDate(startDate, endDate, normalizedReportClass)
      : startDate;
    const columnEndDate = endDate;

    if (normalizedReportClass === Class.TotalOnly) {
      const totalColumn: FinancialReportColumn = {
        columnId: FINANCIAL_REPORT_TOTAL_COLUMN_ID,
        label: this.buildFinancialReportColumnHeaderLabel(columnStartDate, columnEndDate, balanceSheet)
      };
      return {
        reportClass: normalizedReportClass,
        columns: [totalColumn],
        showTotalColumn: false,
        columnIds: [FINANCIAL_REPORT_TOTAL_COLUMN_ID],
        isTimeBased: false,
        balanceSheet
      };
    }

    const dataColumns = this.isFinancialReportTimeBasedClass(normalizedReportClass)
      ? this.buildFinancialReportTimePeriodColumns(normalizedReportClass, columnStartDate, columnEndDate)
      : this.buildFinancialReportEntityColumns(normalizedReportClass, lines, accounts);

    const columns = dataColumns.length > 0
      ? dataColumns
      : [{
        columnId: FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID,
        label: 'Unassigned'
      }];

    return {
      reportClass: normalizedReportClass,
      columns,
      showTotalColumn: true,
      columnIds: columns.map(column => column.columnId),
      isTimeBased: this.isFinancialReportTimeBasedClass(normalizedReportClass),
      balanceSheet
    };
  }

  isFinancialReportTimeBasedClass(reportClass: Class): boolean {
    return reportClass === Class.Month
      || reportClass === Class.Quarter
      || reportClass === Class.Year;
  }

  buildFinancialReportTimePeriodColumns(
    reportClass: Class,
    startDate: string | null,
    endDate: string | null
  ): FinancialReportColumn[] {
    const normalizedStartDate = this.normalizeFinancialReportDate(startDate);
    const normalizedEndDate = this.normalizeFinancialReportDate(endDate);
    const start = this.formatter.parseCalendarPrefixToLocalDate(normalizedStartDate);
    const end = this.formatter.parseCalendarPrefixToLocalDate(normalizedEndDate);
    if (!start || !end) {
      return [];
    }

    const columns: FinancialReportColumn[] = [];
    if (reportClass === Class.Month) {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor.getTime() <= endMonth.getTime()) {
        const periodStartDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const periodEndDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        columns.push(this.buildFinancialReportTimePeriodColumn(
          `month-${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
          periodStartDate,
          normalizedStartDate,
          periodEndDate,
          normalizedEndDate
        ));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return columns;
    }

    if (reportClass === Class.Quarter) {
      let cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
      const endQuarterStart = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
      while (cursor.getTime() <= endQuarterStart.getTime()) {
        const quarterIndex = Math.floor(cursor.getMonth() / 3) + 1;
        const periodStartDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const periodEndDate = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 0);
        columns.push(this.buildFinancialReportTimePeriodColumn(
          `quarter-${cursor.getFullYear()}-${quarterIndex}`,
          periodStartDate,
          normalizedStartDate,
          periodEndDate,
          normalizedEndDate,
          `Q${quarterIndex} ${String(cursor.getFullYear() % 100).padStart(2, '0')}`
        ));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
      }
      return columns;
    }

    for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
      const periodStartDate = new Date(year, 0, 1);
      const periodEndDate = new Date(year, 11, 31);
      columns.push(this.buildFinancialReportTimePeriodColumn(
        `year-${year}`,
        periodStartDate,
        normalizedStartDate,
        periodEndDate,
        normalizedEndDate,
        String(year)
      ));
    }
    return columns;
  }

  buildFinancialReportTimePeriodColumn(
    columnId: string,
    periodStartDate: Date,
    reportStartDate: string | null,
    periodEndDate: Date,
    reportEndDate: string | null,
    labelOverride?: string
  ): FinancialReportColumn {
    const periodStart = this.normalizeFinancialReportDate(this.utility.formatDateOnlyForApi(periodStartDate));
    const periodEnd = this.normalizeFinancialReportDate(this.utility.formatDateOnlyForApi(periodEndDate));
    const clampedStart = reportStartDate && periodStart && reportStartDate > periodStart ? reportStartDate : periodStart;
    const clampedEnd = reportEndDate && periodEnd && reportEndDate < periodEnd ? reportEndDate : periodEnd;
    const labelDate = this.formatter.parseCalendarPrefixToLocalDate(clampedEnd || periodEnd);
    const label = labelOverride || (labelDate
      ? `${labelDate.toLocaleDateString('en-US', { month: 'short' })} ${String(labelDate.getFullYear() % 100).padStart(2, '0')}`
      : columnId);

    return {
      columnId,
      label,
      periodStart: clampedStart,
      periodEnd: clampedEnd
    };
  }

  buildFinancialReportEntityColumns(
    reportClass: Class,
    lines: JournalEntryLineSearchResponse[],
    accounts: ChartOfAccountResponse[]
  ): FinancialReportColumn[] {
    const entityMap = new Map<string, string>();

    if (reportClass === Class.Account) {
      accounts.forEach(account => {
        entityMap.set(String(account.accountId), this.formatFinancialReportAccountLabel(account));
      });
      return this.sortFinancialReportEntityColumns(entityMap);
    }

    (lines || []).forEach(line => {
      if (!this.isFinancialReportLineEligibleForClass(line, reportClass)) {
        return;
      }
      const columnId = this.resolveFinancialReportEntityColumnId(line, reportClass, accounts);
      const label = this.resolveFinancialReportEntityColumnLabel(line, reportClass, accounts, columnId);
      entityMap.set(columnId, label);
    });

    return this.sortFinancialReportEntityColumns(entityMap);
  }

  sortFinancialReportEntityColumns(entityMap: Map<string, string>): FinancialReportColumn[] {
    return [...entityMap.entries()]
      .sort((left, right) => {
        if (left[0] === FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID) {
          return 1;
        }
        if (right[0] === FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID) {
          return -1;
        }
        return left[1].localeCompare(right[1], undefined, { numeric: true, sensitivity: 'base' });
      })
      .map(([columnId, label]) => ({ columnId, label }));
  }

  isFinancialReportLineEligibleForClass(line: JournalEntryLineSearchResponse, reportClass: Class): boolean {
    const sourceTypeId = line.sourceTypeId ?? null;
    switch (reportClass) {
      case Class.Customer:
        return this.isFinancialReportCustomerSourceType(sourceTypeId);
      case Class.Vendor:
        return this.isFinancialReportVendorSourceType(sourceTypeId);
      case Class.Employee:
        return this.isFinancialReportEmployeeSourceType(sourceTypeId);
      case Class.OtherName:
        return !this.isFinancialReportCustomerSourceType(sourceTypeId)
          && !this.isFinancialReportVendorSourceType(sourceTypeId)
          && !this.isFinancialReportEmployeeSourceType(sourceTypeId);
      default:
        return true;
    }
  }

  isFinancialReportCustomerSourceType(sourceTypeId: number | null): boolean {
    return sourceTypeId === SourceType.Invoice
      || sourceTypeId === SourceType.InvoicePayment
      || sourceTypeId === SourceType.InvoiceCredit
      || sourceTypeId === SourceType.Receipt
      || sourceTypeId === SourceType.CreditMemo
      || sourceTypeId === SourceType.Deposit;
  }

  isFinancialReportVendorSourceType(sourceTypeId: number | null): boolean {
    return sourceTypeId === SourceType.Bill
      || sourceTypeId === SourceType.BillPayment
      || sourceTypeId === SourceType.BillCredit;
  }

  isFinancialReportEmployeeSourceType(sourceTypeId: number | null): boolean {
    return sourceTypeId === SourceType.Paycheck
      || sourceTypeId === SourceType.PayrollLiabilityCheck;
  }

  resolveFinancialReportEntityColumnId(
    line: JournalEntryLineSearchResponse,
    reportClass: Class,
    accounts: ChartOfAccountResponse[]
  ): string {
    void accounts;
    switch (reportClass) {
      case Class.Customer:
      case Class.Vendor:
      case Class.Employee:
      case Class.OtherName:
        return line.contactId?.trim() || line.contactName?.trim() || FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID;
      case Class.Class:
        return line.propertyCode?.trim() || line.propertyId?.trim() || FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID;
      case Class.Item:
        return line.costCodeId != null && line.costCodeId > 0
          ? String(line.costCodeId)
          : FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID;
      case Class.CustomerJob:
        return line.reservationId?.trim() || line.reservationCode?.trim() || FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID;
      case Class.Account:
        return String(line.chartOfAccountId);
      default:
        return FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID;
    }
  }

  resolveFinancialReportEntityColumnLabel(
    line: JournalEntryLineSearchResponse,
    reportClass: Class,
    accounts: ChartOfAccountResponse[],
    columnId: string
  ): string {
    if (columnId === FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID) {
      return 'Unassigned';
    }

    switch (reportClass) {
      case Class.Customer:
      case Class.Vendor:
      case Class.Employee:
      case Class.OtherName:
        return line.contactName?.trim() || 'Unknown Contact';
      case Class.Class:
        return line.propertyCode?.trim() || 'Unknown Property';
      case Class.Item:
        return line.costCodeId != null && line.costCodeId > 0 ? `Item ${line.costCodeId}` : 'Unassigned';
      case Class.CustomerJob:
        return line.reservationCode?.trim() || 'Unknown Reservation';
      case Class.Account: {
        const account = accounts.find(item => String(item.accountId) === columnId);
        return account ? this.formatFinancialReportAccountLabel(account) : columnId;
      }
      default:
        return columnId;
    }
  }

  resolveFinancialReportLineColumnId(
    line: JournalEntryLineSearchResponse,
    columnContext: FinancialReportColumnContext,
    accounts: ChartOfAccountResponse[]
  ): string | null {
    if (columnContext.reportClass === Class.TotalOnly) {
      return FINANCIAL_REPORT_TOTAL_COLUMN_ID;
    }

    if (columnContext.isTimeBased) {
      return this.resolveFinancialReportTimePeriodColumnId(line.transactionDate, columnContext.columns);
    }

    if (!this.isFinancialReportLineEligibleForClass(line, columnContext.reportClass)) {
      return null;
    }

    const columnId = this.resolveFinancialReportEntityColumnId(line, columnContext.reportClass, accounts);
    return columnContext.columnIds.includes(columnId) ? columnId : null;
  }

  resolveFinancialReportTimePeriodColumnId(
    transactionDate: string | null | undefined,
    columns: FinancialReportColumn[]
  ): string | null {
    const lineDate = this.normalizeFinancialReportDate(transactionDate);
    if (!lineDate) {
      return null;
    }

    for (const column of columns) {
      const periodStart = this.normalizeFinancialReportDate(column.periodStart);
      const periodEnd = this.normalizeFinancialReportDate(column.periodEnd);
      if (periodStart && lineDate < periodStart) {
        continue;
      }
      if (periodEnd && lineDate > periodEnd) {
        continue;
      }
      return column.columnId;
    }

    return null;
  }

  aggregateProfitLossAmountsByAccountIdAndColumn(
    lines: JournalEntryLineSearchResponse[],
    startDate: string | null,
    endDate: string | null,
    accounts: ChartOfAccountResponse[],
    columnContext: FinancialReportColumnContext,
    accountIdRemap?: Map<number, number>
  ): Map<number, Map<string, { debit: number; credit: number }>> {
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const totals = new Map<number, Map<string, { debit: number; credit: number }>>();
    const cumulativeBalanceSheetColumns = columnContext.balanceSheet && columnContext.isTimeBased;

    for (const line of lines || []) {
      if (accountTypeById.get(line.chartOfAccountId) === undefined) {
        continue;
      }
      if (this.shouldExcludeRetainedEarningsCloseFromProfitLossActivity(line, accountTypeById.get(line.chartOfAccountId))) {
        continue;
      }
      if (!this.isJournalEntryLineInDateRange(line.transactionDate, startDate, endDate)) {
        continue;
      }

      const accountId = accountIdRemap?.get(line.chartOfAccountId) ?? line.chartOfAccountId;
      // P&L report: one period column. Balance sheet: roll into every column whose as-of end is on/after the line (YTD).
      const targetColumnIds = cumulativeBalanceSheetColumns
        ? columnContext.columns
          .filter(column => this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, column.periodEnd || endDate))
          .map(column => column.columnId)
        : [this.resolveFinancialReportLineColumnId(line, columnContext, accounts)].filter((columnId): columnId is string => !!columnId);

      if (targetColumnIds.length === 0) {
        continue;
      }

      targetColumnIds.forEach(columnId => {
        const accountTotals = totals.get(accountId) || new Map<string, { debit: number; credit: number }>();
        const columnTotals = accountTotals.get(columnId) || { debit: 0, credit: 0 };
        columnTotals.debit += Number(line.debit) || 0;
        columnTotals.credit += Number(line.credit) || 0;
        accountTotals.set(columnId, columnTotals);
        totals.set(accountId, accountTotals);
      });
    }

    return totals;
  }

  aggregateBalanceSheetAmountsByAccountIdAndColumn(
    lines: JournalEntryLineSearchResponse[],
    endDate: string | null,
    accounts: ChartOfAccountResponse[],
    columnContext: FinancialReportColumnContext,
    accountIdRemap?: Map<number, number>
  ): Map<number, Map<string, { debit: number; credit: number }>> {
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const totals = new Map<number, Map<string, { debit: number; credit: number }>>();

    for (const line of lines || []) {
      if (accountTypeById.get(line.chartOfAccountId) === undefined) {
        continue;
      }
      if (!this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, endDate)) {
        continue;
      }

      const accountId = accountIdRemap?.get(line.chartOfAccountId) ?? line.chartOfAccountId;
      const targetColumnIds = columnContext.isTimeBased
        ? columnContext.columns
          .filter(column => this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, column.periodEnd || endDate))
          .map(column => column.columnId)
        : [this.resolveFinancialReportLineColumnId(line, columnContext, accounts)].filter((columnId): columnId is string => !!columnId);

      if (targetColumnIds.length === 0) {
        continue;
      }

      targetColumnIds.forEach(columnId => {
        const accountTotals = totals.get(accountId) || new Map<string, { debit: number; credit: number }>();
        const columnTotals = accountTotals.get(columnId) || { debit: 0, credit: 0 };
        columnTotals.debit += Number(line.debit) || 0;
        columnTotals.credit += Number(line.credit) || 0;
        accountTotals.set(columnId, columnTotals);
        totals.set(accountId, accountTotals);
      });
    }

    return totals;
  }

  consolidateFinancialReportAmountsByAccountIdAndColumn(
    rawTotals: Map<number, Map<string, { debit: number; credit: number }>>,
    accountIdRemap: Map<number, number>,
    columnIds: string[],
    accounts: ChartOfAccountResponse[],
    mode: 'activity' | 'balance'
  ): Map<number, Map<string, number>> {
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const consolidated = new Map<number, Map<string, number>>();

    rawTotals.forEach((columnTotals, accountId) => {
      const canonicalAccountId = accountIdRemap.get(accountId) ?? accountId;
      const accountTypeId = accountTypeById.get(canonicalAccountId) ?? accountTypeById.get(accountId);
      if (accountTypeId === undefined) {
        return;
      }

      const accountAmounts = consolidated.get(canonicalAccountId) || new Map<string, number>();
      columnTotals.forEach((value, columnId) => {
        if (!columnIds.includes(columnId)) {
          return;
        }
        const signedAmount = this.signedFinancialReportAmount(accountTypeId, value.debit, value.credit, mode);
        accountAmounts.set(columnId, this.roundFinancialReportAmount((accountAmounts.get(columnId) || 0) + signedAmount));
      });
      consolidated.set(canonicalAccountId, accountAmounts);
    });

    return consolidated;
  }

  getFinancialReportAccountColumnAmounts(
    columnAmounts: Map<string, number> | undefined,
    columnContext: FinancialReportColumnContext
  ): Record<string, number> {
    const amounts = this.createEmptyFinancialReportColumnAmounts(columnContext.columnIds, columnContext.showTotalColumn);
    (columnAmounts || new Map<string, number>()).forEach((amount, columnId) => {
      if (amounts[columnId] !== undefined) {
        amounts[columnId] = this.roundFinancialReportAmount(amount);
      }
    });
    return this.finalizeFinancialReportColumnAmounts(amounts, columnContext, 'balance');
  }

  createEmptyFinancialReportColumnAmounts(columnIds: string[], includeTotal: boolean): Record<string, number> {
    const amounts: Record<string, number> = {};
    columnIds.forEach(columnId => {
      amounts[columnId] = 0;
    });
    if (includeTotal) {
      amounts[FINANCIAL_REPORT_TOTAL_COLUMN_ID] = 0;
    }
    return amounts;
  }

  finalizeFinancialReportColumnAmounts(
    amounts: Record<string, number>,
    columnContext: FinancialReportColumnContext,
    mode: 'activity' | 'balance' = 'activity'
  ): Record<string, number> {
    if (columnContext.showTotalColumn) {
      amounts[FINANCIAL_REPORT_TOTAL_COLUMN_ID] = this.resolveFinancialReportTotalColumnAmount(amounts, columnContext, mode);
    }
    return amounts;
  }

  resolveFinancialReportTotalColumnAmount(
    amounts: Record<string, number>,
    columnContext: FinancialReportColumnContext,
    mode: 'activity' | 'balance'
  ): number {
    if (columnContext.balanceSheet && columnContext.isTimeBased && mode === 'balance') {
      const lastColumnId = columnContext.columnIds[columnContext.columnIds.length - 1];
      return this.roundFinancialReportAmount(lastColumnId ? (amounts[lastColumnId] || 0) : 0);
    }

    return this.roundFinancialReportAmount(
      columnContext.columnIds.reduce((sum, columnId) => sum + (amounts[columnId] || 0), 0)
    );
  }

  getFinancialReportTotalFromColumnAmounts(
    columnAmounts: Record<string, number>,
    columnContext: FinancialReportColumnContext
  ): number {
    if (columnContext.showTotalColumn) {
      return this.roundFinancialReportAmount(columnAmounts[FINANCIAL_REPORT_TOTAL_COLUMN_ID] || 0);
    }
    return this.roundFinancialReportAmount(columnAmounts[FINANCIAL_REPORT_TOTAL_COLUMN_ID] || columnAmounts[columnContext.columnIds[0]] || 0);
  }

  addFinancialReportColumnAmounts(
    left: Record<string, number>,
    right: Record<string, number>,
    columnContext: FinancialReportColumnContext
  ): Record<string, number> {
    const amounts = this.createEmptyFinancialReportColumnAmounts(columnContext.columnIds, columnContext.showTotalColumn);
    Object.keys(amounts).forEach(key => {
      amounts[key] = this.roundFinancialReportAmount((left[key] || 0) + (right[key] || 0));
    });
    return amounts;
  }

  subtractFinancialReportColumnAmounts(
    left: Record<string, number>,
    right: Record<string, number>,
    columnContext: FinancialReportColumnContext
  ): Record<string, number> {
    const amounts = this.createEmptyFinancialReportColumnAmounts(columnContext.columnIds, columnContext.showTotalColumn);
    Object.keys(amounts).forEach(key => {
      amounts[key] = this.roundFinancialReportAmount((left[key] || 0) - (right[key] || 0));
    });
    return amounts;
  }

  sumFinancialReportTreeColumnAmounts(
    nodes: FinancialReportTreeNode[],
    columnContext: FinancialReportColumnContext
  ): Record<string, number> {
    return (nodes || []).reduce(
      (totals, node) => this.addFinancialReportColumnAmounts(totals, node.columnAmounts, columnContext),
      this.createEmptyFinancialReportColumnAmounts(columnContext.columnIds, columnContext.showTotalColumn)
    );
  }

  sumFinancialReportAmountsForAccountTypesAndColumn(
    amountsByAccountIdAndColumn: Map<number, Map<string, number>>,
    accounts: ChartOfAccountResponse[],
    columnContext: FinancialReportColumnContext,
    ...accountTypeIds: AccountType[]
  ): number {
    return this.getFinancialReportTotalFromColumnAmounts(
      this.sumFinancialReportAmountsForAccountTypesColumnAmounts(amountsByAccountIdAndColumn, accounts, columnContext, ...accountTypeIds),
      columnContext
    );
  }

  sumFinancialReportAmountsForAccountTypesColumnAmounts(
    amountsByAccountIdAndColumn: Map<number, Map<string, number>>,
    accounts: ChartOfAccountResponse[],
    columnContext: FinancialReportColumnContext,
    ...accountTypeIds: AccountType[]
  ): Record<string, number> {
    const allowedTypes = new Set<number>(accountTypeIds);
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const totals = this.createEmptyFinancialReportColumnAmounts(columnContext.columnIds, columnContext.showTotalColumn);

    amountsByAccountIdAndColumn.forEach((columnAmounts, accountId) => {
      const accountTypeId = accountTypeById.get(accountId);
      if (accountTypeId === undefined || !allowedTypes.has(accountTypeId)) {
        return;
      }
      Object.keys(totals).forEach(key => {
        totals[key] = this.roundFinancialReportAmount(totals[key] + (columnAmounts.get(key) || 0));
      });
    });

    return totals;
  }

  aggregateProfitLossAmountsByAccountId(
    lines: import('../authenticated/accounting/models/journal-entry.model').JournalEntryLineSearchResponse[],
    startDate: string | null,
    endDate: string | null,
    accounts: ChartOfAccountResponse[]
  ): Map<number, number> {
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const totals = new Map<number, { debit: number; credit: number }>();

    for (const line of lines || []) {
      const accountTypeId = accountTypeById.get(line.chartOfAccountId);
      if (accountTypeId === undefined) {
        continue;
      }
      if (this.shouldExcludeRetainedEarningsCloseFromProfitLossActivity(line, accountTypeId)) {
        continue;
      }
      if (!this.isJournalEntryLineInDateRange(line.transactionDate, startDate, endDate)) {
        continue;
      }

      const current = totals.get(line.chartOfAccountId) || { debit: 0, credit: 0 };
      current.debit += Number(line.debit) || 0;
      current.credit += Number(line.credit) || 0;
      totals.set(line.chartOfAccountId, current);
    }

    const amounts = new Map<number, number>();
    totals.forEach((value, accountId) => {
      const accountTypeId = accountTypeById.get(accountId);
      if (accountTypeId === undefined) {
        return;
      }
      amounts.set(accountId, this.signedFinancialReportAmount(accountTypeId, value.debit, value.credit, 'activity'));
    });
    return amounts;
  }

  aggregateBalanceSheetAmountsByAccountId(
    lines: import('../authenticated/accounting/models/journal-entry.model').JournalEntryLineSearchResponse[],
    endDate: string | null,
    accounts: ChartOfAccountResponse[]
  ): Map<number, number> {
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    const totals = new Map<number, { debit: number; credit: number }>();

    for (const line of lines || []) {
      const accountTypeId = accountTypeById.get(line.chartOfAccountId);
      if (accountTypeId === undefined) {
        continue;
      }
      if (!this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, endDate)) {
        continue;
      }

      const current = totals.get(line.chartOfAccountId) || { debit: 0, credit: 0 };
      current.debit += Number(line.debit) || 0;
      current.credit += Number(line.credit) || 0;
      totals.set(line.chartOfAccountId, current);
    }

    const amounts = new Map<number, number>();
    totals.forEach((value, accountId) => {
      const accountTypeId = accountTypeById.get(accountId);
      if (accountTypeId === undefined) {
        return;
      }
      amounts.set(accountId, this.signedFinancialReportAmount(accountTypeId, value.debit, value.credit, 'balance'));
    });
    return amounts;
  }

  buildFinancialReportAccountTree(
    accounts: ChartOfAccountResponse[],
    amountsByAccountIdAndColumn: Map<number, Map<string, number>>,
    chartOfAccountId: number | null,
    columnContext: FinancialReportColumnContext
  ): FinancialReportTreeNode[] {
    const allowedAccountIds = this.resolveFinancialReportAllowedAccountIds(accounts, chartOfAccountId);
    const scopedAccounts = accounts
      .filter(account => allowedAccountIds.has(account.accountId))
      .sort((left, right) => this.compareFinancialReportAccounts(left, right));
    const accountById = new Map(scopedAccounts.map(account => [account.accountId, account]));
    const childrenByParentId = new Map<number, ChartOfAccountResponse[]>();

    scopedAccounts.forEach(account => {
      const parentAccountId = account.isSubaccount ? account.subAccountId ?? null : null;
      if (parentAccountId != null && accountById.has(parentAccountId)) {
        const siblings = childrenByParentId.get(parentAccountId) || [];
        siblings.push(account);
        childrenByParentId.set(parentAccountId, siblings);
      }
    });

    const rootAccounts = scopedAccounts.filter(account => {
      const parentAccountId = account.isSubaccount ? account.subAccountId ?? null : null;
      return parentAccountId == null || !accountById.has(parentAccountId);
    });

    return rootAccounts
      .map(account => this.buildFinancialReportAccountNode(account, childrenByParentId, amountsByAccountIdAndColumn, columnContext, 1))
      .filter(node => node.amount !== 0 || node.childNodes.length > 0);
  }

  buildFinancialReportAccountNode(
    account: ChartOfAccountResponse,
    childrenByParentId: Map<number, ChartOfAccountResponse[]>,
    amountsByAccountIdAndColumn: Map<number, Map<string, number>>,
    columnContext: FinancialReportColumnContext,
    depth: number
  ): FinancialReportTreeNode {
    const childAccounts = (childrenByParentId.get(account.accountId) || [])
      .slice()
      .sort((left, right) => this.compareFinancialReportAccounts(left, right));
    const childNodes = childAccounts
      .map(childAccount => this.buildFinancialReportAccountNode(childAccount, childrenByParentId, amountsByAccountIdAndColumn, columnContext, depth + 1))
      .filter(node => node.amount !== 0 || node.childNodes.length > 0);
    const ownColumnAmounts = this.getFinancialReportAccountColumnAmounts(amountsByAccountIdAndColumn.get(account.accountId), columnContext);
    const columnAmounts = this.addFinancialReportColumnAmounts(
      ownColumnAmounts,
      this.sumFinancialReportTreeColumnAmounts(childNodes, columnContext),
      columnContext
    );
    const amount = this.getFinancialReportTotalFromColumnAmounts(columnAmounts, columnContext);
    const accountIds = this.collectFinancialReportAccountIdsFromTree([
      {
        nodeId: `account-${account.accountId}`,
        label: '',
        amount: 0,
        columnAmounts: {},
        depth: 0,
        rowKind: 'account',
        accountId: account.accountId,
        childNodes
      }
    ]);

    return {
      nodeId: `account-${account.accountId}`,
      label: this.formatFinancialReportAccountLabel(account),
      amount,
      columnAmounts,
      depth,
      rowKind: 'account',
      accountId: account.accountId,
      drillDownSpec: {
        accountIds,
        mode: columnContext.balanceSheet ? 'balance' : 'activity'
      },
      childNodes
    };
  }

  buildFinancialReportSectionNode(
    nodeId: string,
    label: string,
    childNodes: FinancialReportTreeNode[],
    amount: number,
    columnAmounts: Record<string, number>,
    depth = 0,
    drillDownSpec?: FinancialReportDrillDownSpec
  ): FinancialReportTreeNode {
    return {
      nodeId,
      label,
      amount: this.roundFinancialReportAmount(amount),
      columnAmounts,
      depth,
      rowKind: 'section',
      drillDownSpec,
      childNodes
    };
  }

  buildFinancialReportTotalNode(
    nodeId: string,
    label: string,
    amount: number,
    columnAmounts: Record<string, number>,
    depth = 0,
    drillDownSpec?: FinancialReportDrillDownSpec
  ): FinancialReportTreeNode {
    return {
      nodeId,
      label,
      amount: this.roundFinancialReportAmount(amount),
      columnAmounts,
      depth,
      rowKind: 'total',
      drillDownSpec,
      childNodes: []
    };
  }

  buildFinancialReportSummaryNode(
    nodeId: string,
    label: string,
    amount: number,
    columnAmounts: Record<string, number>,
    depth = 0,
    drillDownSpec?: FinancialReportDrillDownSpec
  ): FinancialReportTreeNode {
    return {
      nodeId,
      label,
      amount: this.roundFinancialReportAmount(amount),
      columnAmounts,
      depth,
      rowKind: 'summary',
      drillDownSpec,
      childNodes: []
    };
  }

  buildFinancialReportLineItemNode(
    nodeId: string,
    label: string,
    amount: number,
    columnAmounts: Record<string, number>,
    depth = 0,
    drillDownSpec?: FinancialReportDrillDownSpec
  ): FinancialReportTreeNode {
    return {
      nodeId,
      label,
      amount: this.roundFinancialReportAmount(amount),
      columnAmounts,
      depth,
      rowKind: 'account',
      drillDownSpec,
      childNodes: []
    };
  }

  prepareFinancialReportScope(
    filteredAccounts: ChartOfAccountResponse[],
    chartOfAccountId: number | null
  ): {
    accounts: ChartOfAccountResponse[];
    chartOfAccountId: number | null;
    accountIdRemap: Map<number, number>;
  } {
    const { accounts, accountIdRemap, remapChartOfAccountId } = this.consolidateFinancialReportAccountsByCode(filteredAccounts);
    return {
      accounts,
      chartOfAccountId: remapChartOfAccountId(chartOfAccountId),
      accountIdRemap
    };
  }

  consolidateFinancialReportAccountsByCode(accounts: ChartOfAccountResponse[]): {
    accounts: ChartOfAccountResponse[];
    accountIdRemap: Map<number, number>;
    remapChartOfAccountId(chartOfAccountId: number | null): number | null;
  } {
    const sortedAccounts = [...(accounts || [])].sort((left, right) => this.compareFinancialReportAccounts(left, right));
    const accountById = new Map(sortedAccounts.map(account => [account.accountId, account]));
    const canonicalByKey = new Map<string, ChartOfAccountResponse>();
    const accountIdRemap = new Map<number, number>();

    sortedAccounts.forEach(account => {
      const key = this.financialReportAccountKey(account);
      const canonicalAccount = canonicalByKey.get(key);
      if (!canonicalAccount) {
        canonicalByKey.set(key, account);
        accountIdRemap.set(account.accountId, account.accountId);
        return;
      }
      accountIdRemap.set(account.accountId, canonicalAccount.accountId);
    });

    const consolidatedAccounts = [...canonicalByKey.values()].map(account => {
      let subAccountId = account.subAccountId ?? null;
      let isSubaccount = account.isSubaccount;
      if (isSubaccount && subAccountId != null) {
        const parentAccount = accountById.get(subAccountId);
        if (parentAccount) {
          const parentKey = this.financialReportAccountKey(parentAccount);
          subAccountId = canonicalByKey.get(parentKey)?.accountId ?? null;
        } else {
          subAccountId = null;
        }
      }
      if (subAccountId == null) {
        isSubaccount = false;
      }

      return {
        ...account,
        subAccountId,
        isSubaccount
      };
    });

    return {
      accounts: consolidatedAccounts.sort((left, right) => this.compareFinancialReportAccounts(left, right)),
      accountIdRemap,
      remapChartOfAccountId: (selectedChartOfAccountId: number | null) => {
        if (selectedChartOfAccountId == null || selectedChartOfAccountId <= 0) {
          return selectedChartOfAccountId;
        }
        return accountIdRemap.get(selectedChartOfAccountId) ?? selectedChartOfAccountId;
      }
    };
  }

  consolidateFinancialReportAmountsByAccountId(
    amountsByAccountId: Map<number, number>,
    accountIdRemap: Map<number, number>
  ): Map<number, number> {
    const consolidatedAmounts = new Map<number, number>();
    amountsByAccountId.forEach((amount, accountId) => {
      const canonicalAccountId = accountIdRemap.get(accountId) ?? accountId;
      consolidatedAmounts.set(
        canonicalAccountId,
        this.roundFinancialReportAmount((consolidatedAmounts.get(canonicalAccountId) || 0) + amount)
      );
    });
    return consolidatedAmounts;
  }

  financialReportAccountKey(account: ChartOfAccountResponse): string {
    return `${account.accountTypeId}:${(account.accountNo || '').trim()}`;
  }

  filterFinancialReportAccounts(
    accounts: ChartOfAccountResponse[],
    chartOfAccountId: number | null,
    accountTypeIds: AccountType[]
  ): ChartOfAccountResponse[] {
    const allowedTypes = new Set<number>(accountTypeIds);
    const scopedAccounts = (accounts || []).filter(account => allowedTypes.has(account.accountTypeId));
    const allowedAccountIds = this.resolveFinancialReportAllowedAccountIds(scopedAccounts, chartOfAccountId);
    return scopedAccounts.filter(account => allowedAccountIds.has(account.accountId));
  }

  resolveFinancialReportAllowedAccountIds(
    accounts: ChartOfAccountResponse[],
    chartOfAccountId: number | null
  ): Set<number> {
    const accountById = new Map((accounts || []).map(account => [account.accountId, account]));
    if (chartOfAccountId == null || chartOfAccountId <= 0) {
      return new Set(accountById.keys());
    }
    if (!accountById.has(chartOfAccountId)) {
      return new Set<number>();
    }

    const childrenByParentId = new Map<number, number[]>();
    accountById.forEach(account => {
      const parentAccountId = account.isSubaccount ? account.subAccountId ?? null : null;
      if (parentAccountId != null && accountById.has(parentAccountId)) {
        const siblings = childrenByParentId.get(parentAccountId) || [];
        siblings.push(account.accountId);
        childrenByParentId.set(parentAccountId, siblings);
      }
    });

    const allowedAccountIds = new Set<number>();
    const visit = (accountId: number) => {
      if (!accountById.has(accountId) || allowedAccountIds.has(accountId)) {
        return;
      }
      allowedAccountIds.add(accountId);
      (childrenByParentId.get(accountId) || []).forEach(childAccountId => visit(childAccountId));
    };
    visit(chartOfAccountId);
    return allowedAccountIds;
  }

  signedFinancialReportAmount(
    accountTypeId: number,
    debit: number,
    credit: number,
    mode: 'activity' | 'balance'
  ): number {
    const normalizedDebit = Number(debit) || 0;
    const normalizedCredit = Number(credit) || 0;
    if (isCreditNormalAccountType(accountTypeId)) {
      return this.roundFinancialReportAmount(normalizedCredit - normalizedDebit);
    }
    return this.roundFinancialReportAmount(normalizedDebit - normalizedCredit);
  }

  sumFinancialReportTreeAmounts(nodes: FinancialReportTreeNode[]): number {
    return this.roundFinancialReportAmount((nodes || []).reduce((sum, node) => sum + node.amount, 0));
  }

  sumFinancialReportAmountsForAccountTypes(
    amountsByAccountId: Map<number, number>,
    accounts: ChartOfAccountResponse[],
    ...accountTypeIds: AccountType[]
  ): number {
    const allowedTypes = new Set<number>(accountTypeIds);
    const accountTypeById = new Map(accounts.map(account => [account.accountId, account.accountTypeId]));
    let total = 0;
    amountsByAccountId.forEach((amount, accountId) => {
      const accountTypeId = accountTypeById.get(accountId);
      if (accountTypeId !== undefined && allowedTypes.has(accountTypeId)) {
        total += amount;
      }
    });
    return this.roundFinancialReportAmount(total);
  }

  isJournalEntryLineInDateRange(
    transactionDate: string | null | undefined,
    startDate: string | null,
    endDate: string | null
  ): boolean {
    const lineDate = this.normalizeFinancialReportDate(transactionDate);
    if (!lineDate) {
      return false;
    }
    const normalizedStartDate = this.normalizeFinancialReportDate(startDate);
    const normalizedEndDate = this.normalizeFinancialReportDate(endDate);
    if (normalizedStartDate && lineDate < normalizedStartDate) {
      return false;
    }
    if (normalizedEndDate && lineDate > normalizedEndDate) {
      return false;
    }
    return true;
  }

  isJournalEntryLineOnOrBeforeDate(transactionDate: string | null | undefined, endDate: string | null): boolean {
    const lineDate = this.normalizeFinancialReportDate(transactionDate);
    if (!lineDate) {
      return false;
    }
    const normalizedEndDate = this.normalizeFinancialReportDate(endDate);
    if (normalizedEndDate && lineDate > normalizedEndDate) {
      return false;
    }
    return true;
  }

  normalizeFinancialReportDate(value: string | null | undefined): string | null {
    const normalized = this.utility.toDateOnlyJsonString(value);
    return normalized || null;
  }

  resolveFinancialReportBalanceSheetAsOfDate(endDate: string | null | undefined): string {
    return this.normalizeFinancialReportDate(endDate)
      ?? this.normalizeFinancialReportDate(this.utility.formatDateOnlyForApi(new Date()))
      ?? '';
  }

  resolveAsOfReportYearStartDate(asOfDate: string | null | undefined): string | null {
    return this.utility.resolveYearStartDateFromAsOf(this.normalizeFinancialReportDate(asOfDate));
  }

  resolveFinancialReportBalanceSheetColumnStartDate(
    startDate: string | null,
    endDate: string | null,
    reportClass: Class
  ): string | null {
    if (!this.isFinancialReportTimeBasedClass(reportClass)) {
      return null;
    }

    const normalizedStartDate = this.normalizeFinancialReportDate(startDate);
    if (normalizedStartDate) {
      return normalizedStartDate;
    }

    return this.resolveAsOfReportYearStartDate(endDate);
  }


  formatFinancialReportAsOfDate(dateString: string | null | undefined): string {
    const date = this.formatter.parseCalendarPrefixToLocalDate(this.normalizeFinancialReportDate(dateString) ?? undefined);
    if (!date) {
      return '';
    }

    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = String(date.getDate());
    const year = String(date.getFullYear());
    return `${month} ${day}, ${year}`;
  }

  buildFinancialReportColumnHeaderLabel(startDate: string | null, endDate: string | null, balanceSheet: boolean): string {
    if (balanceSheet) {
      return this.formatFinancialReportAsOfDate(endDate);
    }

    const formatMonthYear = (date: Date): string => {
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = String(date.getFullYear() % 100).padStart(2, '0');
      return `${month} ${year}`;
    };

    const start = this.formatter.parseCalendarPrefixToLocalDate(startDate);
    const end = this.formatter.parseCalendarPrefixToLocalDate(endDate);
    if (start && end) {
      const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
      const endYear = String(end.getFullYear() % 100).padStart(2, '0');
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${endMonth} ${endYear}`;
      }
      if (start.getFullYear() !== end.getFullYear()) {
        const startYear = String(start.getFullYear() % 100).padStart(2, '0');
        return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
      }
      return `${startMonth} - ${endMonth} ${endYear}`;
    }
    if (end) {
      return formatMonthYear(end);
    }
    if (start) {
      return formatMonthYear(start);
    }
    return '';
  }

  buildFinancialReportPeriodLabel(startDate: string | null, endDate: string | null, balanceSheet: boolean): string {
    if (balanceSheet) {
      const formattedEndDate = this.formatFinancialReportAsOfDate(endDate);
      return formattedEndDate ? `As of ${formattedEndDate}` : 'As of';
    }

    const start = this.formatter.parseCalendarPrefixToLocalDate(startDate);
    const end = this.formatter.parseCalendarPrefixToLocalDate(endDate);
    if (start && end) {
      const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
      const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
      const endYear = end.getFullYear();
      if (start.getFullYear() !== endYear) {
        return `${startMonth} ${start.getFullYear()} - ${endMonth} ${endYear}`;
      }
      return `${startMonth} - ${endMonth} ${endYear}`;
    }
    if (end) {
      const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
      return `${endMonth} ${end.getFullYear()}`;
    }
    if (start) {
      const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
      return `${startMonth} ${start.getFullYear()}`;
    }
    return '';
  }

  formatFinancialReportAccountLabel(account: ChartOfAccountResponse): string {
    const accountNo = (account.accountNo || '').trim();
    const name = (account.name || '').trim();
    if (accountNo && name) {
      return `${accountNo} - ${name}`;
    }
    return accountNo || name || 'Account';
  }

  compareFinancialReportAccounts(left: ChartOfAccountResponse, right: ChartOfAccountResponse): number {
    const leftLabel = `${left.accountNo || ''} ${left.name || ''}`.trim();
    const rightLabel = `${right.accountNo || ''} ${right.name || ''}`.trim();
    return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });
  }

  roundFinancialReportAmount(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  buildEscrowReport(request: EscrowReportBuildRequest): EscrowReportResult {
    const selectedPropertyId = (request.propertyId || '').trim() || null;
    const lastRecapByProperty = this.buildEscrowLastRecapAmountsByProperty(request.recapRows || []);
    const rows: EscrowReportRow[] = (request.accrualRows || [])
      .filter(row => {
        const propertyId = String(row.propertyId || '').trim();
        return !selectedPropertyId || propertyId === selectedPropertyId;
      })
      .map(row => {
        const propertyId = String(row.propertyId || '').trim();
        const recapAmounts = lastRecapByProperty.get(propertyId);
        const arBalance = this.roundFinancialReportAmount(Number(row.unpaidIncome) || 0);
        const prepaids = this.roundFinancialReportAmount(
          recapAmounts?.prepaids ?? (Number(row.prepaidIncome) || 0)
        );
        const notCollected = this.roundFinancialReportAmount(recapAmounts?.notCollected ?? 0);
        const total = this.roundFinancialReportAmount(arBalance - prepaids - notCollected);
        const e2 = total < 0 ? 0 : total;
        return {
          rowId: `${row.officeId}-${propertyId || row.propertyCode}`,
          ownerName: (row.ownerNames || row.ownerNameLine || row.companyName || '').trim() || '—',
          propertyId,
          propertyCode: (row.propertyCode || '').trim() || '—',
          officeId: row.officeId,
          arBalance,
          prepaids,
          notCollected,
          total,
          e2
        };
      })
      .filter(row =>
        Math.abs(row.arBalance) > 0.005
        || Math.abs(row.prepaids) > 0.005
        || Math.abs(row.notCollected) > 0.005
        || Math.abs(row.total) > 0.005
      )
      .sort((left, right) =>
        left.ownerName.localeCompare(right.ownerName, undefined, { sensitivity: 'base' })
        || left.propertyCode.localeCompare(right.propertyCode, undefined, { sensitivity: 'base' })
      );

    const totals = rows.reduce(
      (acc, row) => ({
        arBalance: this.roundFinancialReportAmount(acc.arBalance + row.arBalance),
        prepaids: this.roundFinancialReportAmount(acc.prepaids + row.prepaids),
        notCollected: this.roundFinancialReportAmount(acc.notCollected + row.notCollected),
        total: this.roundFinancialReportAmount(acc.total + row.total),
        e2: this.roundFinancialReportAmount(acc.e2 + row.e2)
      }),
      { arBalance: 0, prepaids: 0, notCollected: 0, total: 0, e2: 0 }
    );

    const cushion = this.roundFinancialReportAmount(Number(request.cushion) || 0);
    const escrowBankBalance = this.roundFinancialReportAmount(Number(request.escrowBankBalance) || 0);
    const officeName = (request.officeName || '').trim();

    return {
      reportTitle: 'Escrow Report',
      periodLabel: `As of ${request.asOfDateLabel}`,
      entityLineLabel: officeName || null,
      rows,
      totals,
      cushion,
      escrowBankBalance,
      escrowBankAccountLabel: (request.escrowBankAccountLabel || '').trim() || 'Escrow Owners',
      transfer: this.roundFinancialReportAmount(escrowBankBalance + totals.total - cushion)
    };
  }

  recalculateEscrowTransfer(result: EscrowReportResult, cushion: number): EscrowReportResult {
    const nextCushion = this.roundFinancialReportAmount(Number(cushion) || 0);
    return {
      ...result,
      cushion: nextCushion,
      transfer: this.roundFinancialReportAmount(result.escrowBankBalance + result.totals.total - nextCushion)
    };
  }

  mapEscrowReportResponse(raw: Record<string, unknown>): EscrowReportResult {
    const rowsRaw = raw['rows'] ?? raw['Rows'] ?? [];
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw.map(row => this.mapEscrowReportRow(row as Record<string, unknown>))
      : [];
    const totalsRaw = (raw['totals'] ?? raw['Totals'] ?? {}) as Record<string, unknown>;

    return {
      reportTitle: String(raw['reportTitle'] ?? raw['ReportTitle'] ?? 'Escrow Report'),
      periodLabel: String(raw['periodLabel'] ?? raw['PeriodLabel'] ?? ''),
      entityLineLabel: (() => {
        const value = String(raw['entityLineLabel'] ?? raw['EntityLineLabel'] ?? '').trim();
        return value || null;
      })(),
      rows,
      totals: {
        arBalance: this.roundFinancialReportAmount(Number(totalsRaw['arBalance'] ?? totalsRaw['ArBalance'] ?? 0)),
        prepaids: this.roundFinancialReportAmount(Number(totalsRaw['prepaids'] ?? totalsRaw['Prepaids'] ?? 0)),
        notCollected: this.roundFinancialReportAmount(Number(totalsRaw['notCollected'] ?? totalsRaw['NotCollected'] ?? 0)),
        total: this.roundFinancialReportAmount(Number(totalsRaw['total'] ?? totalsRaw['Total'] ?? 0)),
        e2: this.roundFinancialReportAmount(Number(totalsRaw['e2'] ?? totalsRaw['E2'] ?? 0))
      },
      cushion: this.roundFinancialReportAmount(Number(raw['cushion'] ?? raw['Cushion'] ?? 0)),
      escrowBankBalance: this.roundFinancialReportAmount(Number(raw['escrowBankBalance'] ?? raw['EscrowBankBalance'] ?? 0)),
      escrowBankAccountLabel: String(raw['escrowBankAccountLabel'] ?? raw['EscrowBankAccountLabel'] ?? 'Escrow Owners').trim() || 'Escrow Owners',
      transfer: this.roundFinancialReportAmount(Number(raw['transfer'] ?? raw['Transfer'] ?? 0))
    };
  }

  mapEscrowReportRow(raw: Record<string, unknown>): EscrowReportRow {
    return {
      rowId: String(raw['rowId'] ?? raw['RowId'] ?? ''),
      ownerName: String(raw['ownerName'] ?? raw['OwnerName'] ?? '—'),
      propertyId: String(raw['propertyId'] ?? raw['PropertyId'] ?? ''),
      propertyCode: String(raw['propertyCode'] ?? raw['PropertyCode'] ?? '—'),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? 0),
      arBalance: this.roundFinancialReportAmount(Number(raw['arBalance'] ?? raw['ArBalance'] ?? 0)),
      prepaids: this.roundFinancialReportAmount(Number(raw['prepaids'] ?? raw['Prepaids'] ?? 0)),
      notCollected: this.roundFinancialReportAmount(Number(raw['notCollected'] ?? raw['NotCollected'] ?? 0)),
      total: this.roundFinancialReportAmount(Number(raw['total'] ?? raw['Total'] ?? 0)),
      e2: this.roundFinancialReportAmount(Number(raw['e2'] ?? raw['E2'] ?? 0))
    };
  }

  sumEscrowAssetAccountBalance(lines: JournalEntryLineSearchResponse[]): number {
    return this.roundFinancialReportAmount(
      (lines || []).reduce((sum, line) => sum + (Number(line.debit) || 0) - (Number(line.credit) || 0), 0)
    );
  }

buildEscrowLastRecapAmountsByProperty(
    recapRows: JournalEntryRecapRowDisplay[]
  ): Map<string, { prepaids: number; notCollected: number }> {
    const byPropertyReservation = new Map<string, JournalEntryRecapRowDisplay>();
    (recapRows || []).forEach(row => {
      const propertyId = String(row.propertyId || '').trim();
      if (!propertyId) {
        return;
      }

      const reservationKey = String(row.reservationCode || row.reservationId || '').trim() || 'no-reservation';
      const key = `${propertyId}|${reservationKey}`;
      const existing = byPropertyReservation.get(key);
      if (!existing) {
        byPropertyReservation.set(key, row);
        return;
      }

      const existingPeriod = String(existing.accountingPeriod || '');
      const nextPeriod = String(row.accountingPeriod || '');
      const periodCompare = nextPeriod.localeCompare(existingPeriod, undefined, { sensitivity: 'base' });
      if (periodCompare > 0 || (periodCompare === 0 && (row.sortDateValue || 0) >= (existing.sortDateValue || 0))) {
        byPropertyReservation.set(key, row);
      }
    });

    const totals = new Map<string, { prepaids: number; notCollected: number }>();
    byPropertyReservation.forEach(row => {
      const propertyId = String(row.propertyId || '').trim();
      const existing = totals.get(propertyId) || { prepaids: 0, notCollected: 0 };
      totals.set(propertyId, {
        prepaids: this.roundFinancialReportAmount(existing.prepaids + (Number(row.prePaymentValue) || 0)),
        notCollected: this.roundFinancialReportAmount(existing.notCollected + (Number(row.unPaidValue) || 0))
      });
    });
    return totals;
  }

  //#region Drill-Down
  buildFinancialReportDrillDownContext(
    reportKind: FinancialReportKind,
    columnContext: FinancialReportColumnContext,
    scopedAccounts: ChartOfAccountResponse[],
    accountIdRemap: Map<number, number>,
    startDate: string | null,
    endDate: string | null
  ): FinancialReportDrillDownContext {
    return {
      reportKind,
      columnContext,
      scopedAccounts,
      accountIdRemap,
      startDate,
      endDate
    };
  }

  findFinancialReportTreeNode(nodes: FinancialReportTreeNode[], nodeId: string): FinancialReportTreeNode | null {
    for (const node of nodes || []) {
      if (node.nodeId === nodeId) {
        return node;
      }
      const childMatch = this.findFinancialReportTreeNode(node.childNodes, nodeId);
      if (childMatch) {
        return childMatch;
      }
    }
    return null;
  }

  collectFinancialReportAccountIdsFromTree(nodes: FinancialReportTreeNode[]): number[] {
    const accountIds = new Set<number>();
    const visit = (node: FinancialReportTreeNode) => {
      if (node.accountId != null) {
        accountIds.add(node.accountId);
      }
      node.childNodes.forEach(childNode => visit(childNode));
    };
    (nodes || []).forEach(node => visit(node));
    return [...accountIds];
  }

  resolveFinancialReportDrillDownSpec(
    node: FinancialReportTreeNode,
    reportKind: FinancialReportKind
  ): FinancialReportDrillDownSpec {
    if (node.drillDownSpec) {
      return node.drillDownSpec;
    }

    const accountIds = this.collectFinancialReportAccountIdsFromTree(node.childNodes);
    return {
      accountIds,
      mode: reportKind === 'balanceSheet' ? 'balance' : 'activity'
    };
  }

  expandFinancialReportAccountIdsForRemap(
    accountIds: Set<number>,
    accountIdRemap: Map<number, number>
  ): Set<number> {
    const expanded = new Set(accountIds);
    accountIdRemap.forEach((canonicalId, sourceId) => {
      if (expanded.has(canonicalId)) {
        expanded.add(sourceId);
      }
      if (expanded.has(sourceId)) {
        expanded.add(canonicalId);
      }
    });
    return expanded;
  }

  resolveFinancialReportDrillDownAccountIds(
    spec: FinancialReportDrillDownSpec,
    accounts: ChartOfAccountResponse[],
    accountIdRemap: Map<number, number>
  ): Set<number> {
    const allowed = new Set<number>();
    (spec.accountIds || []).forEach(accountId => allowed.add(accountId));
    if (spec.accountTypeIds?.length) {
      const allowedTypes = new Set(spec.accountTypeIds);
      accounts.forEach(account => {
        if (allowedTypes.has(account.accountTypeId)) {
          allowed.add(account.accountId);
        }
      });
    }
    if (spec.includeProfitLossActivity) {
      const profitLossTypes = new Set<number>(this.financialReportProfitLossAccountTypes);
      accounts.forEach(account => {
        if (profitLossTypes.has(account.accountTypeId)) {
          allowed.add(account.accountId);
        }
      });
    }
    return this.expandFinancialReportAccountIdsForRemap(allowed, accountIdRemap);
  }

  isFinancialReportProfitLossAccountType(accountTypeId: number | undefined): boolean {
    return accountTypeId !== undefined
      && this.financialReportProfitLossAccountTypes.includes(accountTypeId as AccountType);
  }

  isFinancialReportDrillDownLineInDateScope(
    line: JournalEntryLineSearchResponse,
    spec: FinancialReportDrillDownSpec,
    accounts: ChartOfAccountResponse[],
    startDate: string | null,
    endDate: string | null
  ): boolean {
    const accountTypeId = accounts.find(account => account.accountId === line.chartOfAccountId)?.accountTypeId;
    const isProfitLossAccount = this.isFinancialReportProfitLossAccountType(accountTypeId);

    if (spec.includeProfitLossActivity && isProfitLossAccount) {
      return this.isJournalEntryLineInDateRange(line.transactionDate, startDate, endDate);
    }
    if (spec.mode === 'balance') {
      // When a start is present (BS drill-down Start/End), show JE activity in that window.
      if (startDate) {
        return this.isJournalEntryLineInDateRange(line.transactionDate, startDate, endDate);
      }
      return this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, endDate);
    }
    return this.isJournalEntryLineInDateRange(line.transactionDate, startDate, endDate);
  }

  isFinancialReportDrillDownLineInColumn(
    line: JournalEntryLineSearchResponse,
    columnId: string,
    context: FinancialReportDrillDownContext,
    spec: FinancialReportDrillDownSpec
  ): boolean {
    if (columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID) {
      return true;
    }

    const { columnContext, scopedAccounts, startDate, endDate } = context;
    const accountTypeId = scopedAccounts.find(account => account.accountId === line.chartOfAccountId)?.accountTypeId;
    const isProfitLossAccount = this.isFinancialReportProfitLossAccountType(accountTypeId);
    const column = columnContext.columns.find(item => item.columnId === columnId);

    if (columnContext.isTimeBased && columnContext.balanceSheet) {
      if (isProfitLossAccount && (spec.includeProfitLossActivity || spec.mode === 'activity')) {
        if (!column) {
          return false;
        }
        // Match Net Income columns: YTD from report year start through this column's as-of end.
        return this.isJournalEntryLineInDateRange(line.transactionDate, startDate, column.periodEnd || endDate);
      }
      if (spec.mode === 'balance') {
        if (!column) {
          return false;
        }
        if (startDate) {
          return this.isJournalEntryLineInDateRange(line.transactionDate, startDate, column.periodEnd || endDate);
        }
        return this.isJournalEntryLineOnOrBeforeDate(line.transactionDate, column.periodEnd || endDate);
      }
    }

    if (columnContext.isTimeBased) {
      if (!column) {
        return false;
      }
      return this.resolveFinancialReportTimePeriodColumnId(line.transactionDate, [column]) === columnId;
    }

    return this.resolveFinancialReportLineColumnId(line, columnContext, scopedAccounts) === columnId;
  }

  filterFinancialReportDrillDownLines(
    lines: JournalEntryLineSearchResponse[],
    nodeId: string,
    columnId: string,
    context: FinancialReportDrillDownContext,
    sections: FinancialReportTreeNode[]
  ): JournalEntryLineSearchResponse[] {
    const node = this.findFinancialReportTreeNode(sections, nodeId);
    if (!node) {
      return [];
    }

    const spec = this.resolveFinancialReportDrillDownSpec(node, context.reportKind);
    const allowedAccountIds = this.resolveFinancialReportDrillDownAccountIds(
      spec,
      context.scopedAccounts,
      context.accountIdRemap
    );
    if (allowedAccountIds.size === 0) {
      return [];
    }

    return (lines || []).filter(line => {
      if (!allowedAccountIds.has(line.chartOfAccountId)) {
        return false;
      }
      const accountTypeId = context.scopedAccounts.find(account => account.accountId === line.chartOfAccountId)?.accountTypeId;
      if (this.shouldExcludeRetainedEarningsCloseFromProfitLossActivity(line, accountTypeId)) {
        return false;
      }
      if (!this.isFinancialReportDrillDownLineInDateScope(
        line,
        spec,
        context.scopedAccounts,
        context.startDate,
        context.endDate
      )) {
        return false;
      }
      return this.isFinancialReportDrillDownLineInColumn(line, columnId, context, spec);
    });
  }

  getFinancialReportDrillDownColumnLabel(
    columnId: string,
    reportResult: FinancialReportResult
  ): string {
    if (columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID) {
      return 'Total';
    }
    return reportResult.columns.find(column => column.columnId === columnId)?.label || columnId;
  }
  //#endregion

  //#region AR Aging Report Mapping
  buildArAgingReport(request: ArAgingReportBuildRequest): ArAgingReportResult {
    const asOfDate = request.asOfDate || this.utility.todayAsCalendarDateString();
    const bucketDefinitions = buildArAgingBucketDefinitions(
      request.intervalDays ?? 30,
      request.throughDays !== undefined ? request.throughDays : 90
    );
    const bucketIds = bucketDefinitions.map(bucket => bucket.id);
    const contactNameByContactId = request.contactNameByContactId || new Map<string, string>();
    const paymentTermsByContactId = request.paymentTermsByContactId || new Map<string, number | null>();
    const invoiceDetails = this.buildArAgingInvoiceDetailsFromJournalLines(
      request.lines || [],
      asOfDate,
      request.propertyCodeByPropertyId,
      paymentTermsByContactId,
      contactNameByContactId,
      bucketDefinitions
    ).sort((a, b) => compareArAgingInvoiceSortKeys(a, b));

    const customerRows = sortArAgingCustomerRows(
      this.buildArAgingCustomerRows(invoiceDetails, bucketIds),
      request.sortBy ?? 'default'
    );
    const totals = createEmptyArAgingBucketAmounts(bucketIds);
    invoiceDetails.forEach(invoice => {
      totals[invoice.bucketId] = this.roundFinancialReportAmount((totals[invoice.bucketId] || 0) + invoice.balanceDue);
    });
    const grandTotal = bucketIds.reduce(
      (sum, bucketId) => this.roundFinancialReportAmount(sum + (totals[bucketId] || 0)),
      0
    );

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: 'A/R Aging Summary',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      bucketColumns: bucketDefinitions.map(bucket => ({ id: bucket.id, label: bucket.label })),
      customerRows,
      totals,
      grandTotal,
      invoiceDetails
    };
  }

  buildArAgingCustomerRows(invoiceDetails: ArAgingInvoiceDetail[], bucketIds: ArAgingBucketId[]): ArAgingCustomerRow[] {
    const rowsByCustomer = new Map<string, ArAgingCustomerRow>();
    invoiceDetails.forEach(invoice => {
      let row = rowsByCustomer.get(invoice.customerKey);
      if (!row) {
        row = {
          customerKey: invoice.customerKey,
          customerLabel: invoice.customerLabel,
          companySortKey: invoice.companySortKey,
          contactSortKey: invoice.contactSortKey,
          contactId: invoice.contactId,
          bucketAmounts: createEmptyArAgingBucketAmounts(bucketIds),
          total: 0,
          reservationRows: [],
          invoices: []
        };
        rowsByCustomer.set(invoice.customerKey, row);
      }
      row.bucketAmounts[invoice.bucketId] = this.roundFinancialReportAmount((row.bucketAmounts[invoice.bucketId] || 0) + invoice.balanceDue);
      row.total = this.roundFinancialReportAmount(row.total + invoice.balanceDue);
      row.invoices.push(invoice);
    });

    rowsByCustomer.forEach(row => {
      row.reservationRows = this.buildArAgingReservationRows(row.invoices, bucketIds);
    });

    return Array.from(rowsByCustomer.values()).sort((a, b) => compareArAgingCustomerSortKeys(a, b));
  }

  buildArAgingReservationRows(invoices: ArAgingInvoiceDetail[], bucketIds: ArAgingBucketId[]): ArAgingReservationRow[] {
    const rowsByReservation = new Map<string, ArAgingReservationRow>();
    invoices.forEach(invoice => {
      let row = rowsByReservation.get(invoice.reservationKey);
      if (!row) {
        row = {
          reservationKey: invoice.reservationKey,
          reservationId: invoice.reservationId ?? null,
          reservationLabel: invoice.reservationLabel,
          bucketAmounts: createEmptyArAgingBucketAmounts(bucketIds),
          total: 0,
          invoices: []
        };
        rowsByReservation.set(invoice.reservationKey, row);
      }
      row.bucketAmounts[invoice.bucketId] = this.roundFinancialReportAmount((row.bucketAmounts[invoice.bucketId] || 0) + invoice.balanceDue);
      row.total = this.roundFinancialReportAmount(row.total + invoice.balanceDue);
      row.invoices.push(invoice);
    });

    return Array.from(rowsByReservation.values()).sort((a, b) =>
      a.reservationLabel.localeCompare(b.reservationLabel, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  buildArAgingReservationKey(invoice: InvoiceResponse): string {
    const reservationId = String(invoice.reservationId ?? '').trim();
    if (reservationId) {
      return reservationId;
    }

    const reservationCode = String(invoice.reservationCode ?? '').trim();
    if (reservationCode) {
      return reservationCode;
    }

    return `invoice:${invoice.invoiceId}`;
  }

  buildArAgingReservationLabelSource(
    reservation: ReservationResponse,
    invoice?: InvoiceResponse
  ): ReservationCodeResponse {
    const primaryContactId = (reservation.contactIds || []).find(id => String(id || '').trim().length > 0) ?? '';
    return {
      reservationId: reservation.reservationId,
      reservationCode: reservation.reservationCode,
      propertyId: reservation.propertyId,
      propertyCode: String(invoice?.propertyCode ?? '').trim(),
      officeId: reservation.officeId,
      officeName: reservation.officeName,
      contactId: primaryContactId,
      contactName: reservation.contactName ?? '',
      companyId: reservation.companyId ?? null,
      companyName: reservation.companyName ?? null,
      tenantName: reservation.tenantName ?? '',
      reservationTypeId: reservation.reservationTypeId,
      isActive: reservation.isActive
    };
  }

  buildArAgingReservationLabel(
    invoice: InvoiceResponse,
    contactsByContactId: ReadonlyMap<string, ContactResponse> = new Map<string, ContactResponse>(),
    reservationsByReservationId: ReadonlyMap<string, ReservationCodeResponse> = new Map()
  ): string {
    const contactId = (invoice.contactId || '').trim();
    const contact = contactId ? contactsByContactId.get(contactId) : undefined;
    const reservationId = (invoice.reservationId || '').trim();
    const reservation = reservationId ? reservationsByReservationId.get(reservationId) : null;
    const reservationContext = reservation ?? this.buildArAgingReservationStub(invoice);

    try {
      const reservationLabel = this.utility.getReservationDropdownLabel(reservationContext, contact ?? null).trim();
      if (reservationLabel) {
        return reservationLabel;
      }
    } catch {
      // Fall back to invoice fields when reservation label helpers cannot resolve a value.
    }

    const reservationCode = String(invoice.reservationCode ?? '').trim();
    const tenantName = String(invoice.contactName || invoice.responsibleParty || '').trim();
    if (reservationCode && tenantName) {
      return `${reservationCode} ${tenantName}`;
    }

    return reservationCode || tenantName || invoice.invoiceCode || 'Unknown';
  }

  buildArAgingReservationStub(invoice: InvoiceResponse): ReservationCodeResponse {
    return {
      reservationId: String(invoice.reservationId ?? ''),
      reservationCode: String(invoice.reservationCode ?? ''),
      propertyId: String(invoice.propertyId ?? ''),
      propertyCode: String(invoice.propertyCode ?? ''),
      officeId: invoice.officeId,
      officeName: invoice.officeName ?? '',
      contactId: String(invoice.contactId ?? ''),
      contactName: invoice.contactName ?? '',
      companyId: invoice.companyId ?? null,
      companyName: invoice.companyName ?? null,
      tenantName: invoice.contactName ?? '',
      reservationTypeId: 0,
      isActive: true
    };
  }

  resolveArAgingResponsibleContact(
    invoice: InvoiceResponse,
    contactsByContactId: ReadonlyMap<string, ContactResponse>,
    reservation: ReservationCodeResponse | null | undefined
  ): ContactResponse | undefined {
    const reservationContext = reservation ?? this.buildArAgingReservationStub(invoice);
    const reservationTypeId = Number(reservationContext.reservationTypeId);
    if (reservationTypeId === ReservationType.Corporate || reservationTypeId === ReservationType.Platform) {
      const companyId = String(reservationContext.companyId ?? invoice.companyId ?? '').trim();
      if (companyId) {
        return contactsByContactId.get(companyId);
      }
    }

    const contactId = String(invoice.contactId ?? reservationContext.contactId ?? '').trim();
    return contactId ? contactsByContactId.get(contactId) : undefined;
  }

  buildArAgingCustomerLabel(
    invoice: InvoiceResponse,
    contactsByContactId: ReadonlyMap<string, ContactResponse>,
    reservationsByReservationId: ReadonlyMap<string, ReservationCodeResponse>,
    contactNameByContactId: ReadonlyMap<string, string> = new Map<string, string>()
  ): string {
    const reservationId = (invoice.reservationId || '').trim();
    const reservation = reservationId ? reservationsByReservationId.get(reservationId) : null;
    const contact = this.resolveArAgingResponsibleContact(invoice, contactsByContactId, reservation);

    if (contact) {
      const reservationContext = reservation ?? this.buildArAgingReservationStub(invoice);
      const responsibleParty = this.utility.getResponsibleParty(reservationContext, contact).trim();
      if (responsibleParty) {
        return responsibleParty;
      }
    }

    const contactId = (contact?.contactId || invoice.contactId || '').trim();
    return (invoice.responsibleParty || '').trim()
      || (invoice.contactName || '').trim()
      || (invoice.companyName || '').trim()
      || (contactId ? (contactNameByContactId.get(contactId) || '').trim() : '')
      || 'Unknown Customer';
  }

  buildArAgingInvoiceDetail(
    invoice: InvoiceResponse,
    asOfDate: string,
    costCodes: CostCodesResponse[],
    bucketDefinitions: ArAgingBucketDefinition[],
    contactNameByContactId: ReadonlyMap<string, string> = new Map<string, string>(),
    contactsByContactId: ReadonlyMap<string, ContactResponse> = new Map<string, ContactResponse>(),
    reservationsByReservationId: ReadonlyMap<string, ReservationCodeResponse> = new Map()
  ): ArAgingInvoiceDetail | null {
    if (!invoice.isActive) {
      return null;
    }

    const invoiceDate = this.toDateOnlyJsonString(invoice.invoiceDate);
    if (invoiceDate && invoiceDate > asOfDate) {
      return null;
    }

    const balanceDue = this.getArAgingInvoiceBalanceDue(invoice, asOfDate, costCodes);
    if (balanceDue <= 0.005) {
      return null;
    }

    const dueDate = this.toDateOnlyJsonString(invoice.dueDate) || invoiceDate || asOfDate;
    const daysPastDue = this.getArAgingDaysPastDue(asOfDate, dueDate);
    const reservationId = (invoice.reservationId || '').trim();
    const reservation = reservationId ? reservationsByReservationId.get(reservationId) : null;
    const responsibleContact = this.resolveArAgingResponsibleContact(invoice, contactsByContactId, reservation);
    const contactId = (responsibleContact?.contactId || invoice.contactId || '').trim() || null;
    const customerLabel = this.buildArAgingCustomerLabel(
      invoice,
      contactsByContactId,
      reservationsByReservationId,
      contactNameByContactId
    );
    const companySortKey = buildArAgingCompanySortKey(invoice, customerLabel);
    const contactSortKey = buildArAgingContactSortKey(invoice);
    const customerKey = `${contactId || ''}|${companySortKey.toLowerCase()}|${contactSortKey.toLowerCase()}`;

    return {
      invoiceId: invoice.invoiceId,
      invoiceCode: invoice.invoiceCode,
      customerKey,
      customerLabel,
      companySortKey,
      contactSortKey,
      contactId,
      reservationKey: this.buildArAgingReservationKey(invoice),
      reservationId: invoice.reservationId,
      reservationLabel: this.buildArAgingReservationLabel(invoice, contactsByContactId, reservationsByReservationId),
      invoiceDate: invoiceDate || asOfDate,
      dueDate,
      daysPastDue,
      balanceDue,
      bucketId: resolveArAgingBucketId(daysPastDue, bucketDefinitions),
      reservationCode: invoice.reservationCode,
      propertyCode: invoice.propertyCode,
      officeId: invoice.officeId
    };
  }

  getArAgingInvoiceBalanceDue(
    invoice: InvoiceResponse,
    asOfDate: string,
    costCodes: CostCodesResponse[]
  ): number {
    const ledgerLines = Array.isArray(invoice.ledgerLines) ? invoice.ledgerLines : [];
    const totalAmount = Number(invoice.totalAmount || 0);
    const paidAmount = ledgerLines.length > 0
      ? this.getArAgingPaidAmountFromLedgerLines(ledgerLines, invoice.officeId, costCodes, asOfDate)
      : Number(invoice.paidAmount || 0);

    return this.roundFinancialReportAmount(totalAmount - paidAmount);
  }

  getArAgingPaidAmountFromLedgerLines(
    ledgerLines: LedgerLineResponse[],
    officeId: number,
    costCodes: CostCodesResponse[],
    asOfDate: string
  ): number {
    return ledgerLines.reduce((sum, line) => {
      const lineDate = this.toDateOnlyJsonString(line.ledgerLineDate);
      if (lineDate && lineDate > asOfDate) {
        return sum;
      }

      if (!this.isArAgingPaymentLine(line, officeId, costCodes)) {
        return sum;
      }

      const amount = Number(line.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  isArAgingPaymentLine(
    line: LedgerLineResponse,
    officeId: number,
    costCodes: CostCodesResponse[]
  ): boolean {
    if (line.transactionTypeId === TransactionType.Payment) {
      return true;
    }

    const costCodeId = line.costCodeId;
    if (costCodeId == null) {
      return false;
    }

    const matchingCostCode = costCodes.find(
      costCode => costCode.costCodeId === costCodeId && costCode.officeId === officeId
    ) ?? costCodes.find(costCode => costCode.costCodeId === costCodeId);
    return matchingCostCode?.transactionTypeId === TransactionType.Payment;
  }

  getArAgingDaysPastDue(asOfDate: string, dueDate: string): number {
    const asOf = this.utility.parseDateOnlyStringToDate(asOfDate);
    const due = this.utility.parseDateOnlyStringToDate(dueDate);
    if (!asOf || !due) {
      return 0;
    }
    const diffMs = asOf.getTime() - due.getTime();
    return Math.floor(diffMs / 86400000);
  }

  buildArAgingInvoiceDetailsFromJournalLines(
    lines: JournalEntryLineSearchResponse[],
    asOfDate: string,
    propertyCodeByPropertyId: ReadonlyMap<string, string>,
    paymentTermsByContactId: ReadonlyMap<string, number | null>,
    contactNameByContactId: ReadonlyMap<string, string>,
    bucketDefinitions: ArAgingBucketDefinition[]
  ): ArAgingInvoiceDetail[] {
    type ArLot = {
      journalEntryLineId: string;
      transactionDate: string;
      remaining: number;
      contactId: string | null;
      contactName: string;
      reservationId: string | null;
      reservationCode: string | null;
      reservationLabel: string;
      reservationKey: string;
      propertyCode: string | null;
      sourceCode: string | null;
      sourceTypeId: number | null;
      sourceId: string | null;
      journalEntryCode: string;
      officeId: number;
    };

    const linesByGroup = new Map<string, JournalEntryLineSearchResponse[]>();
    (lines || []).forEach(line => {
      const transactionDate = this.toDateOnlyJsonString(line.transactionDate);
      if (!transactionDate || transactionDate > asOfDate) {
        return;
      }

      const contactId = (line.contactId || '').trim() || 'no-contact';
      const reservationId = (line.reservationId || '').trim() || 'no-reservation';
      const groupKey = `${contactId}|${reservationId}`;
      const bucket = linesByGroup.get(groupKey) ?? [];
      bucket.push(line);
      linesByGroup.set(groupKey, bucket);
    });

    const invoiceDetails: ArAgingInvoiceDetail[] = [];
    linesByGroup.forEach(groupLines => {
      const sortedLines = groupLines.slice().sort((left, right) => {
        const leftDate = this.toDateOnlyJsonString(left.transactionDate) || '';
        const rightDate = this.toDateOnlyJsonString(right.transactionDate) || '';
        const dateCompare = leftDate.localeCompare(rightDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        const codeCompare = (left.journalEntryCode || '').localeCompare(right.journalEntryCode || '', undefined, { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) {
          return codeCompare;
        }

        return (left.journalEntryLineId || '').localeCompare(right.journalEntryLineId || '', undefined, { sensitivity: 'base' });
      });

      const lots: ArLot[] = [];
      sortedLines.forEach(line => {
        const transactionDate = this.toDateOnlyJsonString(line.transactionDate) || asOfDate;
        const amount = this.roundFinancialReportAmount(Number(line.debit || 0) - Number(line.credit || 0));
        if (Math.abs(amount) <= 0.005) {
          return;
        }

        const contactId = (line.contactId || '').trim() || null;
        const contactName = (line.contactName || '').trim()
          || (contactId ? (contactNameByContactId.get(contactId) || '').trim() : '')
          || 'Unknown Customer';
        const reservationId = (line.reservationId || '').trim() || null;
        const reservationCode = (line.reservationCode || '').trim() || null;
        const reservationLabel = reservationCode || reservationId || 'No Reservation';
        const reservationKey = reservationId || reservationCode || `line:${line.journalEntryLineId}`;
        const propertyId = (line.propertyId || '').trim() || null;
        const propertyCode = propertyId
          ? (propertyCodeByPropertyId.get(propertyId) || line.propertyCode || null)
          : (line.propertyCode || null);
        const sourceCode = (line.sourceCode || '').trim() || null;
        const sourceTypeId = Number(line.sourceTypeId);
        const sourceId = (line.sourceId || '').trim() || null;
        const journalEntryCode = (line.journalEntryCode || '').trim() || sourceCode || line.journalEntryLineId;

        if (amount > 0.005) {
          let debit = amount;
          while (debit > 0.005 && lots.length > 0 && lots[0].remaining < -0.005) {
            const lot = lots[0];
            const take = Math.min(-lot.remaining, debit);
            lot.remaining = this.roundFinancialReportAmount(lot.remaining + take);
            debit = this.roundFinancialReportAmount(debit - take);
            if (Math.abs(lot.remaining) <= 0.005) {
              lots.shift();
            }
          }

          if (debit > 0.005) {
            lots.push({
              journalEntryLineId: line.journalEntryLineId,
              transactionDate,
              remaining: debit,
              contactId,
              contactName,
              reservationId,
              reservationCode,
              reservationLabel,
              reservationKey,
              propertyCode,
              sourceCode,
              sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
              sourceId,
              journalEntryCode,
              officeId: Number(line.officeId) || 0
            });
          }
          return;
        }

        let apply = this.roundFinancialReportAmount(-amount);
        while (apply > 0.005 && lots.length > 0 && lots[0].remaining > 0.005) {
          const lot = lots[0];
          const take = Math.min(lot.remaining, apply);
          lot.remaining = this.roundFinancialReportAmount(lot.remaining - take);
          apply = this.roundFinancialReportAmount(apply - take);
          if (lot.remaining <= 0.005) {
            lots.shift();
          }
        }

        if (apply > 0.005) {
          lots.push({
            journalEntryLineId: line.journalEntryLineId,
            transactionDate,
            remaining: this.roundFinancialReportAmount(-apply),
            contactId,
            contactName,
            reservationId,
            reservationCode,
            reservationLabel,
            reservationKey,
            propertyCode,
            sourceCode,
            sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
            sourceId,
            journalEntryCode,
            officeId: Number(line.officeId) || 0
          });
        }
      });

      lots.forEach(lot => {
        if (Math.abs(lot.remaining) <= 0.005) {
          return;
        }

        const customerLabel = (lot.contactName || '').trim()
          || (lot.contactId ? (contactNameByContactId.get(lot.contactId) || '').trim() : '')
          || 'Unknown Customer';
        const customerKey = `${lot.contactId || ''}|${customerLabel.toLowerCase()}`;
        const paymentTermsId = lot.contactId ? (paymentTermsByContactId.get(lot.contactId) ?? null) : null;
        const dueDate = this.addOwnerApAgingTermsToDate(lot.transactionDate, paymentTermsId);
        const daysPastDue = this.getArAgingDaysPastDue(asOfDate, dueDate);

        invoiceDetails.push({
          invoiceId: lot.journalEntryLineId,
          invoiceCode: lot.sourceCode || lot.journalEntryCode,
          customerKey,
          customerLabel,
          companySortKey: customerLabel.toLowerCase(),
          contactSortKey: customerLabel.toLowerCase(),
          contactId: lot.contactId,
          reservationKey: lot.reservationKey,
          reservationId: lot.reservationId,
          reservationLabel: lot.reservationLabel,
          invoiceDate: lot.transactionDate,
          dueDate,
          daysPastDue,
          balanceDue: lot.remaining,
          bucketId: resolveArAgingBucketId(daysPastDue, bucketDefinitions),
          reservationCode: lot.reservationCode,
          propertyCode: lot.propertyCode,
          officeId: lot.officeId,
          sourceTypeId: lot.sourceTypeId,
          sourceId: lot.sourceId
        });
      });
    });

    return invoiceDetails;
  }

  buildArAgingJeDetailReport(request: ArAgingJeDetailBuildRequest): ArAgingDetailReportResult {
    const transactionRows: ArAgingDetailRow[] = [];

    request.invoiceDetails.forEach(detail => {
      if (request.bucketFilter && detail.bucketId !== request.bucketFilter) {
        return;
      }

      transactionRows.push({
        rowId: `ar-je:${detail.invoiceId}`,
        kind: 'transaction',
        label: null,
        bucketId: detail.bucketId,
        transactionType: null,
        transactionDate: detail.invoiceDate,
        num: null,
        referenceNo: detail.invoiceCode,
        name: detail.customerLabel,
        terms: 'Due on receipt',
        dueDate: detail.dueDate,
        classLabel: detail.propertyCode?.trim() || 'Company',
        aging: detail.daysPastDue,
        openBalance: this.roundFinancialReportAmount(detail.balanceDue),
        invoiceId: detail.invoiceId,
        officeId: detail.officeId,
        sourceTypeId: detail.sourceTypeId ?? null,
        sourceId: detail.sourceId ?? null,
        reservationId: detail.reservationId ?? null
      });
    });

    transactionRows.sort((a, b) =>
      (a.transactionDate || '').localeCompare(b.transactionDate || '')
      || (a.referenceNo || '').localeCompare(b.referenceNo || '', undefined, { numeric: true, sensitivity: 'base' })
      || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    const reportTotal = transactionRows.reduce(
      (sum, row) => this.roundFinancialReportAmount(sum + Number(row.openBalance || 0)),
      0
    );
    const rows: ArAgingDetailRow[] = [];
    if (transactionRows.length > 0) {
      rows.push({
        rowId: 'ar-aging-total',
        kind: 'bucketTotal',
        label: (request.scopeLabel || '').trim() || 'Customer',
        bucketId: request.bucketFilter,
        transactionType: null,
        transactionDate: null,
        num: null,
        referenceNo: null,
        name: null,
        terms: null,
        dueDate: null,
        classLabel: null,
        aging: null,
        openBalance: reportTotal,
        invoiceId: null
      });
      rows.push(...transactionRows);
    }

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: 'AR Aging Detail',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(request.asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      scopeLabel: request.scopeLabel,
      rows,
      reportTotal
    };
  }

  buildArAgingDetailReport(request: ArAgingDetailBuildRequest): ArAgingDetailReportResult {
    const asOfDate = request.asOfDate;
    const transactionRows: ArAgingDetailRow[] = [];

    request.invoiceDetails.forEach(detail => {
      if (request.bucketFilter && detail.bucketId !== request.bucketFilter) {
        return;
      }

      const sourceInvoice = request.invoicesById.get(detail.invoiceId);
      if (!sourceInvoice) {
        return;
      }

      const reservationContext = sourceInvoice.reservationId
        ? request.reservationContextByReservationId.get(sourceInvoice.reservationId.trim())
        : undefined;
      const terms = reservationContext?.termsLabel || 'Due on receipt';
      const customerName = (detail.customerLabel || '').trim() || 'Unknown Customer';
      const referenceNo = (detail.invoiceCode || '').trim() || null;
      const propertyId = (sourceInvoice.propertyId || '').trim() || null;
      const propertyLabel = propertyId
        ? ((detail.propertyCode || '').trim() || propertyId)
        : 'Company';

      transactionRows.push({
        rowId: `invoice:${detail.invoiceId}`,
        kind: 'transaction',
        label: null,
        bucketId: detail.bucketId,
        transactionType: 'Invoice',
        transactionDate: detail.invoiceDate,
        num: null,
        referenceNo,
        name: customerName,
        terms,
        dueDate: detail.dueDate,
        classLabel: propertyLabel,
        aging: detail.daysPastDue,
        openBalance: this.roundFinancialReportAmount(Number(sourceInvoice.totalAmount || 0)),
        invoiceId: detail.invoiceId
      });

      (sourceInvoice.ledgerLines || []).forEach(line => {
        const lineDate = this.toDateOnlyJsonString(line.ledgerLineDate);
        if (lineDate && lineDate > asOfDate) {
          return;
        }
        if (!this.isArAgingPaymentLine(line, sourceInvoice.officeId, request.costCodes)) {
          return;
        }

        const amount = Number(line.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0.005) {
          return;
        }

        transactionRows.push({
          rowId: `payment:${line.ledgerLineId}`,
          kind: 'transaction',
          label: null,
          bucketId: detail.bucketId,
          transactionType: 'Payment',
          transactionDate: lineDate || detail.invoiceDate,
          num: null,
          referenceNo,
          name: customerName,
          terms,
          dueDate: detail.dueDate,
          classLabel: propertyLabel,
          aging: detail.daysPastDue,
          openBalance: this.roundFinancialReportAmount(-amount),
          invoiceId: detail.invoiceId
        });
      });
    });

    transactionRows.sort((a, b) =>
      (a.transactionDate || '').localeCompare(b.transactionDate || '')
      || (a.referenceNo || '').localeCompare(b.referenceNo || '', undefined, { numeric: true, sensitivity: 'base' })
      || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    const reportTotal = transactionRows.reduce(
      (sum, row) => this.roundFinancialReportAmount(sum + Number(row.openBalance || 0)),
      0
    );
    const rows: ArAgingDetailRow[] = [];
    if (transactionRows.length > 0) {
      rows.push({
        rowId: 'ar-aging-total',
        kind: 'bucketTotal',
        label: (request.scopeLabel || '').trim() || 'Customer',
        bucketId: request.bucketFilter,
        transactionType: null,
        transactionDate: null,
        num: null,
        referenceNo: null,
        name: null,
        terms: null,
        dueDate: null,
        classLabel: null,
        aging: null,
        openBalance: reportTotal,
        invoiceId: null
      });
      rows.push(...transactionRows);
    }

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: 'A/R Aging Detail',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      scopeLabel: request.scopeLabel,
      rows,
      reportTotal
    };
  }

  buildArAgingAsOfLabel(asOfDate: string): string {
    const parsed = this.utility.parseDateOnlyStringToDate(asOfDate);
    if (!parsed) {
      return asOfDate;
    }
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  //#endregion

  //#region AP Aging Report Mapping
  getContactDisplayName(contact: Pick<ContactResponse, 'companyName' | 'fullName' | 'displayName' | 'firstName' | 'lastName'> | null | undefined): string {
    if (!contact) {
      return '';
    }

    const companyName = (contact.companyName || '').trim();
    if (companyName) {
      return companyName;
    }

    const fullName = (contact.fullName || contact.displayName || '').trim();
    if (fullName) {
      return fullName;
    }

    return `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  }

  buildContactDisplayNameById(contacts: ContactResponse[] | null | undefined): Map<string, string> {
    const namesById = new Map<string, string>();
    (contacts || []).forEach(contact => {
      const contactId = String(contact.contactId || '').trim();
      const displayName = this.getContactDisplayName(contact);
      if (contactId && displayName) {
        namesById.set(contactId, displayName);
      }
    });
    return namesById;
  }

  buildOwnerApAgingReport(request: OwnerApAgingReportBuildRequest): ApAgingReportResult {
    const asOfDate = request.asOfDate || this.utility.todayAsCalendarDateString();
    const bucketDefinitions = buildApAgingBucketDefinitions(
      request.intervalDays ?? 30,
      request.throughDays !== undefined ? request.throughDays : 90
    );
    const bucketIds = bucketDefinitions.map(bucket => bucket.id);
    const billDetails = this.buildOwnerApAgingBillDetails(
      request.lines || [],
      asOfDate,
      request.propertyCodeByPropertyId,
      request.paymentTermsByContactId || new Map<string, number | null>(),
      request.contactNameByContactId || new Map<string, string>(),
      bucketDefinitions
    ).sort((a, b) => compareApAgingBillSortKeys(a, b));

    const vendorRows = sortApAgingVendorRows(
      this.buildApAgingVendorRows(billDetails, bucketIds),
      request.sortBy ?? 'default'
    );
    const totals = createEmptyApAgingBucketAmounts(bucketIds);
    billDetails.forEach(bill => {
      totals[bill.bucketId] = this.roundFinancialReportAmount((totals[bill.bucketId] || 0) + bill.balanceDue);
    });
    const grandTotal = bucketIds.reduce(
      (sum, bucketId) => this.roundFinancialReportAmount(sum + (totals[bucketId] || 0)),
      0
    );

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: (request.reportTitle || '').trim() || 'Owner A/P Aging Summary',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      bucketColumns: bucketDefinitions.map(bucket => ({ id: bucket.id, label: bucket.label })),
      vendorRows,
      totals,
      grandTotal,
      billDetails
    };
  }

  buildOwnerApAgingBillDetails(
    lines: JournalEntryLineSearchResponse[],
    asOfDate: string,
    propertyCodeByPropertyId: ReadonlyMap<string, string>,
    paymentTermsByContactId: ReadonlyMap<string, number | null>,
    contactNameByContactId: ReadonlyMap<string, string>,
    bucketDefinitions: ApAgingBucketDefinition[]
  ): ApAgingBillDetail[] {
    type OwnerApLot = {
      journalEntryLineId: string;
      transactionDate: string;
      remaining: number;
      contactId: string | null;
      contactName: string;
      propertyId: string | null;
      propertyCode: string | null;
      sourceCode: string | null;
      sourceTypeId: number | null;
      sourceId: string | null;
      reservationId: string | null;
      journalEntryCode: string;
      officeId: number;
      memo: string | null;
    };

    const linesByProperty = new Map<string, JournalEntryLineSearchResponse[]>();
    (lines || []).forEach(line => {
      const transactionDate = this.toDateOnlyJsonString(line.transactionDate);
      if (!transactionDate || transactionDate > asOfDate) {
        return;
      }

      const propertyId = (line.propertyId || '').trim() || null;
      const propertyKey = propertyId || 'no-property';
      const bucket = linesByProperty.get(propertyKey) ?? [];
      bucket.push(line);
      linesByProperty.set(propertyKey, bucket);
    });

    const billDetails: ApAgingBillDetail[] = [];
    linesByProperty.forEach((propertyLines, propertyKey) => {
      const sortedLines = propertyLines.slice().sort((left, right) => {
        const leftDate = this.toDateOnlyJsonString(left.transactionDate) || '';
        const rightDate = this.toDateOnlyJsonString(right.transactionDate) || '';
        const dateCompare = leftDate.localeCompare(rightDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        const codeCompare = (left.journalEntryCode || '').localeCompare(right.journalEntryCode || '', undefined, { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) {
          return codeCompare;
        }

        return (left.journalEntryLineId || '').localeCompare(right.journalEntryLineId || '', undefined, { sensitivity: 'base' });
      });

      const lots: OwnerApLot[] = [];
      sortedLines.forEach(line => {
        const transactionDate = this.toDateOnlyJsonString(line.transactionDate) || asOfDate;
        const amount = this.roundFinancialReportAmount(Number(line.credit || 0) - Number(line.debit || 0));
        if (Math.abs(amount) <= 0.005) {
          return;
        }

        const propertyId = (line.propertyId || '').trim() || null;
        const propertyCode = propertyId
          ? (propertyCodeByPropertyId.get(propertyId) || line.propertyCode || null)
          : (line.propertyCode || null);
        const contactId = (line.contactId || '').trim() || null;
        const contactName = (line.contactName || '').trim()
          || (contactId ? (contactNameByContactId.get(contactId) || '').trim() : '')
          || 'Unknown Owner';
        const sourceCode = (line.sourceCode || '').trim() || null;
        const sourceTypeId = Number(line.sourceTypeId);
        const sourceId = (line.sourceId || '').trim() || null;
        const reservationId = (line.reservationId || '').trim() || null;
        const journalEntryCode = (line.journalEntryCode || '').trim() || sourceCode || line.journalEntryLineId;
        const memo = (line.journalEntryMemo || line.memo || '').trim() || null;

        if (amount > 0.005) {
          let credit = amount;
          while (credit > 0.005 && lots.length > 0 && lots[0].remaining < -0.005) {
            const lot = lots[0];
            const take = Math.min(-lot.remaining, credit);
            lot.remaining = this.roundFinancialReportAmount(lot.remaining + take);
            credit = this.roundFinancialReportAmount(credit - take);
            if (Math.abs(lot.remaining) <= 0.005) {
              lots.shift();
            }
          }

          if (credit > 0.005) {
            lots.push({
              journalEntryLineId: line.journalEntryLineId,
              transactionDate,
              remaining: credit,
              contactId,
              contactName,
              propertyId,
              propertyCode,
              sourceCode,
              sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
              sourceId,
              reservationId,
              journalEntryCode,
              officeId: Number(line.officeId) || 0,
              memo
            });
          }
          return;
        }

        let apply = this.roundFinancialReportAmount(-amount);
        while (apply > 0.005 && lots.length > 0 && lots[0].remaining > 0.005) {
          const lot = lots[0];
          const take = Math.min(lot.remaining, apply);
          lot.remaining = this.roundFinancialReportAmount(lot.remaining - take);
          apply = this.roundFinancialReportAmount(apply - take);
          if (lot.remaining <= 0.005) {
            lots.shift();
          }
        }

        // Unmatched debit (overpayment / prepaid) remains as an open negative A/P balance.
        if (apply > 0.005) {
          lots.push({
            journalEntryLineId: line.journalEntryLineId,
            transactionDate,
            remaining: this.roundFinancialReportAmount(-apply),
            contactId,
            contactName,
            propertyId,
            propertyCode,
            sourceCode,
            sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
            sourceId,
            reservationId,
            journalEntryCode,
            officeId: Number(line.officeId) || 0,
            memo
          });
        }
      });

      lots.forEach(lot => {
        if (Math.abs(lot.remaining) <= 0.005) {
          return;
        }

        const vendorId = lot.contactId;
        const vendorLabel = (lot.contactName || '').trim()
          || (vendorId ? (contactNameByContactId.get(vendorId) || '').trim() : '')
          || 'Unknown Owner';
        const vendorSortKey = vendorLabel;
        const vendorKey = `${vendorId || ''}|${vendorSortKey.toLowerCase()}`;
        const propertyId = lot.propertyId;
        const propertyCode = lot.propertyCode;
        const propertyLabel = propertyId ? (propertyCode || propertyId) : 'Company';
        const paymentTermsId = vendorId ? (paymentTermsByContactId.get(vendorId) ?? null) : null;
        const termsLabel = getTermType(paymentTermsId) || 'Due on receipt';
        const dueDate = this.addOwnerApAgingTermsToDate(lot.transactionDate, paymentTermsId);
        const daysPastDue = this.getArAgingDaysPastDue(asOfDate, dueDate);

        billDetails.push({
          receiptId: lot.journalEntryLineId,
          receiptCode: lot.sourceCode || lot.journalEntryCode,
          vendorKey,
          vendorLabel,
          vendorSortKey,
          vendorId,
          propertyKey,
          propertyId,
          propertyLabel,
          propertyCode,
          receiptDate: lot.transactionDate,
          dueDate,
          daysPastDue,
          balanceDue: lot.remaining,
          bucketId: resolveApAgingBucketId(daysPastDue, bucketDefinitions),
          billNumber: lot.memo,
          termsLabel,
          officeId: lot.officeId,
          sourceTypeId: lot.sourceTypeId,
          sourceId: lot.sourceId,
          reservationId: lot.reservationId
        });
      });
    });

    return billDetails;
  }

  buildStandardApAgingBillDetailsFromJournalLines(
    lines: JournalEntryLineSearchResponse[],
    asOfDate: string,
    propertyCodeByPropertyId: ReadonlyMap<string, string>,
    paymentTermsByContactId: ReadonlyMap<string, number | null>,
    contactNameByContactId: ReadonlyMap<string, string>,
    bucketDefinitions: ApAgingBucketDefinition[]
  ): ApAgingBillDetail[] {
    type ApLot = {
      journalEntryLineId: string;
      transactionDate: string;
      remaining: number;
      contactId: string | null;
      contactName: string;
      propertyId: string | null;
      propertyCode: string | null;
      propertyKey: string;
      sourceCode: string | null;
      sourceTypeId: number | null;
      sourceId: string | null;
      reservationId: string | null;
      journalEntryCode: string;
      officeId: number;
      memo: string | null;
    };

    const linesByGroup = new Map<string, JournalEntryLineSearchResponse[]>();
    (lines || []).forEach(line => {
      const transactionDate = this.toDateOnlyJsonString(line.transactionDate);
      if (!transactionDate || transactionDate > asOfDate) {
        return;
      }

      const contactId = (line.contactId || '').trim() || 'no-contact';
      const propertyId = (line.propertyId || '').trim() || 'no-property';
      const groupKey = `${contactId}|${propertyId}`;
      const bucket = linesByGroup.get(groupKey) ?? [];
      bucket.push(line);
      linesByGroup.set(groupKey, bucket);
    });

    const billDetails: ApAgingBillDetail[] = [];
    linesByGroup.forEach(groupLines => {
      const sortedLines = groupLines.slice().sort((left, right) => {
        const leftDate = this.toDateOnlyJsonString(left.transactionDate) || '';
        const rightDate = this.toDateOnlyJsonString(right.transactionDate) || '';
        const dateCompare = leftDate.localeCompare(rightDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        const codeCompare = (left.journalEntryCode || '').localeCompare(right.journalEntryCode || '', undefined, { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) {
          return codeCompare;
        }

        return (left.journalEntryLineId || '').localeCompare(right.journalEntryLineId || '', undefined, { sensitivity: 'base' });
      });

      const lots: ApLot[] = [];
      sortedLines.forEach(line => {
        const transactionDate = this.toDateOnlyJsonString(line.transactionDate) || asOfDate;
        const amount = this.roundFinancialReportAmount(Number(line.credit || 0) - Number(line.debit || 0));
        if (Math.abs(amount) <= 0.005) {
          return;
        }

        const propertyId = (line.propertyId || '').trim() || null;
        const propertyKey = propertyId || 'no-property';
        const propertyCode = propertyId
          ? (propertyCodeByPropertyId.get(propertyId) || line.propertyCode || null)
          : (line.propertyCode || null);
        const contactId = (line.contactId || '').trim() || null;
        const contactName = (line.contactName || '').trim()
          || (contactId ? (contactNameByContactId.get(contactId) || '').trim() : '')
          || 'Unknown Vendor';
        const sourceCode = (line.sourceCode || '').trim() || null;
        const sourceTypeId = Number(line.sourceTypeId);
        const sourceId = (line.sourceId || '').trim() || null;
        const reservationId = (line.reservationId || '').trim() || null;
        const journalEntryCode = (line.journalEntryCode || '').trim() || sourceCode || line.journalEntryLineId;
        const memo = (line.journalEntryMemo || line.memo || '').trim() || null;

        if (amount > 0.005) {
          let credit = amount;
          while (credit > 0.005 && lots.length > 0 && lots[0].remaining < -0.005) {
            const lot = lots[0];
            const take = Math.min(-lot.remaining, credit);
            lot.remaining = this.roundFinancialReportAmount(lot.remaining + take);
            credit = this.roundFinancialReportAmount(credit - take);
            if (Math.abs(lot.remaining) <= 0.005) {
              lots.shift();
            }
          }

          if (credit > 0.005) {
            lots.push({
              journalEntryLineId: line.journalEntryLineId,
              transactionDate,
              remaining: credit,
              contactId,
              contactName,
              propertyId,
              propertyCode,
              propertyKey,
              sourceCode,
              sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
              sourceId,
              reservationId,
              journalEntryCode,
              officeId: Number(line.officeId) || 0,
              memo
            });
          }
          return;
        }

        let apply = this.roundFinancialReportAmount(-amount);
        while (apply > 0.005 && lots.length > 0 && lots[0].remaining > 0.005) {
          const lot = lots[0];
          const take = Math.min(lot.remaining, apply);
          lot.remaining = this.roundFinancialReportAmount(lot.remaining - take);
          apply = this.roundFinancialReportAmount(apply - take);
          if (lot.remaining <= 0.005) {
            lots.shift();
          }
        }

        if (apply > 0.005) {
          lots.push({
            journalEntryLineId: line.journalEntryLineId,
            transactionDate,
            remaining: this.roundFinancialReportAmount(-apply),
            contactId,
            contactName,
            propertyId,
            propertyCode,
            propertyKey,
            sourceCode,
            sourceTypeId: Number.isFinite(sourceTypeId) && sourceTypeId > 0 ? sourceTypeId : null,
            sourceId,
            reservationId,
            journalEntryCode,
            officeId: Number(line.officeId) || 0,
            memo
          });
        }
      });

      lots.forEach(lot => {
        if (Math.abs(lot.remaining) <= 0.005) {
          return;
        }

        const vendorId = lot.contactId;
        const vendorLabel = (lot.contactName || '').trim()
          || (vendorId ? (contactNameByContactId.get(vendorId) || '').trim() : '')
          || 'Unknown Vendor';
        const vendorSortKey = vendorLabel;
        const vendorKey = `${vendorId || ''}|${vendorSortKey.toLowerCase()}`;
        const propertyId = lot.propertyId;
        const propertyCode = lot.propertyCode;
        const propertyLabel = propertyId ? (propertyCode || propertyId) : 'Company';
        const paymentTermsId = vendorId ? (paymentTermsByContactId.get(vendorId) ?? null) : null;
        const termsLabel = getTermType(paymentTermsId) || 'Due on receipt';
        const dueDate = this.addOwnerApAgingTermsToDate(lot.transactionDate, paymentTermsId);
        const daysPastDue = this.getArAgingDaysPastDue(asOfDate, dueDate);

        billDetails.push({
          receiptId: lot.journalEntryLineId,
          receiptCode: lot.sourceCode || lot.journalEntryCode,
          vendorKey,
          vendorLabel,
          vendorSortKey,
          vendorId,
          propertyKey: lot.propertyKey,
          propertyId,
          propertyLabel,
          propertyCode,
          receiptDate: lot.transactionDate,
          dueDate,
          daysPastDue,
          balanceDue: lot.remaining,
          bucketId: resolveApAgingBucketId(daysPastDue, bucketDefinitions),
          billNumber: lot.memo,
          termsLabel,
          officeId: lot.officeId,
          sourceTypeId: lot.sourceTypeId,
          sourceId: lot.sourceId,
          reservationId: lot.reservationId
        });
      });
    });

    return billDetails;
  }

  addOwnerApAgingTermsToDate(transactionDate: string, paymentTermsId: number | null | undefined): string {
    const termDays = getPaymentTermDays(paymentTermsId);
    if (termDays <= 0) {
      return transactionDate;
    }

    const [year, month, day] = transactionDate.split('-').map(Number);
    if (!year || !month || !day) {
      return transactionDate;
    }

    const parsed = new Date(year, month - 1, day);
    if (isNaN(parsed.getTime())) {
      return transactionDate;
    }

    const due = this.utility.addCalendarDaysToDate(parsed, termDays);
    return this.toDateOnlyJsonString(due) || transactionDate;
  }

  buildOwnerApAgingDetailReport(request: Omit<ApAgingDetailBuildRequest, 'receiptsById'>): ApAgingDetailReportResult {
    const transactionRows: ApAgingDetailRow[] = [];

    request.billDetails.forEach(detail => {
      if (request.bucketFilter && detail.bucketId !== request.bucketFilter) {
        return;
      }

      transactionRows.push({
        rowId: `owner-ap:${detail.receiptId}`,
        kind: 'transaction',
        label: null,
        bucketId: detail.bucketId,
        transactionType: null,
        transactionDate: detail.receiptDate,
        num: null,
        referenceNo: detail.receiptCode,
        name: detail.vendorLabel,
        terms: detail.termsLabel || 'Due on receipt',
        dueDate: detail.dueDate,
        classLabel: detail.propertyId
          ? ((detail.propertyCode || '').trim() || detail.propertyId)
          : 'Company',
        aging: detail.daysPastDue,
        openBalance: this.roundFinancialReportAmount(detail.balanceDue),
        receiptId: null,
        invoiceId: null,
        officeId: detail.officeId,
        sourceTypeId: detail.sourceTypeId ?? null,
        sourceId: detail.sourceId ?? null,
        reservationId: detail.reservationId ?? null
      });
    });

    transactionRows.sort((a, b) =>
      (a.transactionDate || '').localeCompare(b.transactionDate || '')
      || (a.referenceNo || '').localeCompare(b.referenceNo || '', undefined, { numeric: true, sensitivity: 'base' })
      || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    const reportTotal = transactionRows.reduce(
      (sum, row) => this.roundFinancialReportAmount(sum + Number(row.openBalance || 0)),
      0
    );
    const rows: ApAgingDetailRow[] = [];
    if (transactionRows.length > 0) {
      rows.push({
        rowId: 'owner-ap-total',
        kind: 'bucketTotal',
        label: (request.scopeLabel || '').trim() || 'Owner',
        bucketId: request.bucketFilter,
        transactionType: null,
        transactionDate: null,
        num: null,
        referenceNo: null,
        name: null,
        terms: null,
        dueDate: null,
        classLabel: null,
        aging: null,
        openBalance: reportTotal,
        receiptId: null
      });
      rows.push(...transactionRows);
    }

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: 'Owner AP Aging Detail',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(request.asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      scopeLabel: request.scopeLabel,
      rows,
      reportTotal
    };
  }

  buildStandardApAgingJeDetailReport(request: Omit<ApAgingDetailBuildRequest, 'receiptsById'>): ApAgingDetailReportResult {
    const ownerStyle = this.buildOwnerApAgingDetailReport(request);
    return {
      ...ownerStyle,
      reportTitle: 'AP Aging Detail',
      rows: ownerStyle.rows.map(row => ({
        ...row,
        rowId: row.rowId.startsWith('owner-ap') ? row.rowId.replace('owner-ap', 'ap-je') : row.rowId
      }))
    };
  }

  buildApAgingReport(request: ApAgingReportBuildRequest): ApAgingReportResult {
    const asOfDate = request.asOfDate || this.utility.todayAsCalendarDateString();
    const bucketDefinitions = buildApAgingBucketDefinitions(
      request.intervalDays ?? 30,
      request.throughDays !== undefined ? request.throughDays : 90
    );
    const bucketIds = bucketDefinitions.map(bucket => bucket.id);
    const contactNameByContactId = request.contactNameByContactId || new Map<string, string>();
    const paymentTermsByContactId = request.paymentTermsByContactId || new Map<string, number | null>();
    const billDetails = this.buildStandardApAgingBillDetailsFromJournalLines(
      request.lines || [],
      asOfDate,
      request.propertyCodeByPropertyId,
      paymentTermsByContactId,
      contactNameByContactId,
      bucketDefinitions
    ).sort((a, b) => compareApAgingBillSortKeys(a, b));

    const vendorRows = sortApAgingVendorRows(
      this.buildApAgingVendorRows(billDetails, bucketIds),
      request.sortBy ?? 'default'
    );
    const totals = createEmptyApAgingBucketAmounts(bucketIds);
    billDetails.forEach(bill => {
      totals[bill.bucketId] = this.roundFinancialReportAmount((totals[bill.bucketId] || 0) + bill.balanceDue);
    });
    const grandTotal = bucketIds.reduce(
      (sum, bucketId) => this.roundFinancialReportAmount(sum + (totals[bucketId] || 0)),
      0
    );

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: (request.reportTitle || '').trim() || 'A/P Aging Summary',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      bucketColumns: bucketDefinitions.map(bucket => ({ id: bucket.id, label: bucket.label })),
      vendorRows,
      totals,
      grandTotal,
      billDetails
    };
  }

  buildApAgingVendorRows(billDetails: ApAgingBillDetail[], bucketIds: ApAgingBucketId[]): ApAgingVendorRow[] {
    const rowsByVendor = new Map<string, ApAgingVendorRow>();
    billDetails.forEach(bill => {
      let row = rowsByVendor.get(bill.vendorKey);
      if (!row) {
        row = {
          vendorKey: bill.vendorKey,
          vendorLabel: bill.vendorLabel,
          vendorSortKey: bill.vendorSortKey,
          vendorId: bill.vendorId,
          bucketAmounts: createEmptyApAgingBucketAmounts(bucketIds),
          total: 0,
          propertyRows: [],
          bills: []
        };
        rowsByVendor.set(bill.vendorKey, row);
      }
      row.bucketAmounts[bill.bucketId] = this.roundFinancialReportAmount((row.bucketAmounts[bill.bucketId] || 0) + bill.balanceDue);
      row.total = this.roundFinancialReportAmount(row.total + bill.balanceDue);
      row.bills.push(bill);
    });

    rowsByVendor.forEach(row => {
      row.propertyRows = this.buildApAgingPropertyRows(row.bills, bucketIds);
    });

    return Array.from(rowsByVendor.values()).sort((a, b) => compareApAgingVendorSortKeys(a, b));
  }

  buildApAgingPropertyRows(bills: ApAgingBillDetail[], bucketIds: ApAgingBucketId[]): ApAgingPropertyRow[] {
    const rowsByProperty = new Map<string, ApAgingPropertyRow>();
    bills.forEach(bill => {
      let row = rowsByProperty.get(bill.propertyKey);
      if (!row) {
        row = {
          propertyKey: bill.propertyKey,
          propertyId: bill.propertyId,
          propertyLabel: bill.propertyLabel,
          propertyCode: bill.propertyCode,
          bucketAmounts: createEmptyApAgingBucketAmounts(bucketIds),
          total: 0,
          bills: []
        };
        rowsByProperty.set(bill.propertyKey, row);
      }
      row.bucketAmounts[bill.bucketId] = this.roundFinancialReportAmount((row.bucketAmounts[bill.bucketId] || 0) + bill.balanceDue);
      row.total = this.roundFinancialReportAmount(row.total + bill.balanceDue);
      row.bills.push(bill);
    });

    return Array.from(rowsByProperty.values()).sort((a, b) =>
      a.propertyLabel.localeCompare(b.propertyLabel, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  buildApAgingBillDetail(
    receipt: ReceiptResponse,
    asOfDate: string,
    propertyCodeByPropertyId: ReadonlyMap<string, string>,
    bucketDefinitions: ApAgingBucketDefinition[],
    contactNameByContactId: ReadonlyMap<string, string> = new Map<string, string>(),
    paymentTermsByContactId: ReadonlyMap<string, number | null> = new Map<string, number | null>()
  ): ApAgingBillDetail | null {
    if (!receipt.isActive) {
      return null;
    }

    const receiptDate = this.toDateOnlyJsonString(receipt.receiptDate);
    if (receiptDate && receiptDate > asOfDate) {
      return null;
    }

    const balanceDue = this.getApAgingBillBalanceDue(receipt, asOfDate);
    if (balanceDue <= 0.005) {
      return null;
    }

    const vendorId = (receipt.vendorId || '').trim() || null;
    const vendorLabel = (receipt.vendorName || '').trim()
      || (vendorId ? (contactNameByContactId.get(vendorId) || '').trim() : '')
      || 'Unknown Vendor';
    const vendorSortKey = vendorLabel;
    const vendorKey = `${vendorId || ''}|${vendorSortKey.toLowerCase()}`;
    const propertyId = (receipt.propertyIds?.[0] || '').trim() || null;
    const propertyCode = propertyId ? (propertyCodeByPropertyId.get(propertyId) || null) : null;
    const propertyKey = propertyId || 'no-property';
    const propertyLabel = propertyId ? (propertyCode || propertyId) : 'Company';
    const paymentTermsId = vendorId ? (paymentTermsByContactId.get(vendorId) ?? null) : null;
    const termsLabel = getTermType(paymentTermsId) || 'Due on receipt';
    const dueDate = this.toDateOnlyJsonString(receipt.dueDate)
      || this.addOwnerApAgingTermsToDate(receiptDate || asOfDate, paymentTermsId);
    const daysPastDue = this.getArAgingDaysPastDue(asOfDate, dueDate);

    return {
      receiptId: receipt.receiptId,
      receiptCode: receipt.receiptCode,
      vendorKey,
      vendorLabel,
      vendorSortKey,
      vendorId,
      propertyKey,
      propertyId,
      propertyLabel,
      propertyCode,
      receiptDate: receiptDate || asOfDate,
      dueDate,
      daysPastDue,
      balanceDue,
      bucketId: resolveApAgingBucketId(daysPastDue, bucketDefinitions),
      billNumber: receipt.billNumber?.trim() || null,
      termsLabel,
      officeId: receipt.officeId
    };
  }

  getApAgingBillBalanceDue(receipt: ReceiptResponse, asOfDate: string): number {
    const totalAmount = Number(receipt.amount || 0);
    const paidAmount = Number(receipt.paidAmount || 0);
    const paidDate = this.toDateOnlyJsonString(receipt.paidDate);
    const effectivePaidAmount = paidDate && paidDate > asOfDate ? 0 : paidAmount;
    return this.roundFinancialReportAmount(totalAmount - effectivePaidAmount);
  }

  buildApAgingDetailReport(request: ApAgingDetailBuildRequest): ApAgingDetailReportResult {
    const asOfDate = request.asOfDate;
    const transactionRows: ApAgingDetailRow[] = [];

    request.billDetails.forEach(detail => {
      if (request.bucketFilter && detail.bucketId !== request.bucketFilter) {
        return;
      }

      const sourceReceipt = request.receiptsById.get(detail.receiptId);
      if (!sourceReceipt) {
        return;
      }

      const vendorName = (detail.vendorLabel || '').trim() || 'Unknown Vendor';
      const termsLabel = detail.termsLabel || 'Due on receipt';
      const referenceNo = (detail.receiptCode || '').trim() || null;
      const propertyLabel = detail.propertyId
        ? ((detail.propertyCode || '').trim() || detail.propertyId)
        : 'Company';
      transactionRows.push({
        rowId: `bill:${detail.receiptId}`,
        kind: 'transaction',
        label: null,
        bucketId: detail.bucketId,
        transactionType: 'Bill',
        transactionDate: detail.receiptDate,
        num: null,
        referenceNo,
        name: vendorName,
        terms: termsLabel,
        dueDate: detail.dueDate,
        classLabel: propertyLabel,
        aging: detail.daysPastDue,
        openBalance: this.roundFinancialReportAmount(Number(sourceReceipt.amount || 0)),
        receiptId: detail.receiptId
      });

      const paidAmount = this.getApAgingBillPaidAmountForDetail(sourceReceipt, asOfDate);
      if (paidAmount > 0.005) {
        transactionRows.push({
          rowId: `payment:${detail.receiptId}`,
          kind: 'transaction',
          label: null,
          bucketId: detail.bucketId,
          transactionType: 'Payment',
          transactionDate: this.toDateOnlyJsonString(sourceReceipt.paidDate) || detail.receiptDate,
          num: null,
          referenceNo,
          name: vendorName,
          terms: termsLabel,
          dueDate: detail.dueDate,
          classLabel: propertyLabel,
          aging: detail.daysPastDue,
          openBalance: this.roundFinancialReportAmount(-paidAmount),
          receiptId: detail.receiptId
        });
      }
    });

    transactionRows.sort((a, b) =>
      (a.transactionDate || '').localeCompare(b.transactionDate || '')
      || (a.referenceNo || '').localeCompare(b.referenceNo || '', undefined, { numeric: true, sensitivity: 'base' })
      || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    const reportTotal = transactionRows.reduce(
      (sum, row) => this.roundFinancialReportAmount(sum + Number(row.openBalance || 0)),
      0
    );
    const rows: ApAgingDetailRow[] = [];
    if (transactionRows.length > 0) {
      rows.push({
        rowId: 'ap-aging-total',
        kind: 'bucketTotal',
        label: (request.scopeLabel || '').trim() || 'Vendor',
        bucketId: request.bucketFilter,
        transactionType: null,
        transactionDate: null,
        num: null,
        referenceNo: null,
        name: null,
        terms: null,
        dueDate: null,
        classLabel: null,
        aging: null,
        openBalance: reportTotal,
        receiptId: null
      });
      rows.push(...transactionRows);
    }

    const entityParts = [request.companyName?.trim(), request.officeName?.trim()].filter(part => !!part);
    return {
      reportTitle: 'A/P Aging Detail',
      periodLabel: `As of ${this.buildArAgingAsOfLabel(asOfDate)}`,
      entityLineLabel: entityParts.length > 0 ? entityParts.join(' ') : null,
      scopeLabel: request.scopeLabel,
      rows,
      reportTotal
    };
  }

  mapApAgingReportToPrintableDocument(result: ApAgingReportResult): PrintableReportDocument {
    const bucketIds = (result.bucketColumns || []).map(column => column.id);
    const columns: PrintableReportDocument['columns'] = [
      { label: 'Vendor', align: 'left' },
      ...(result.bucketColumns || []).map(column => ({ label: column.label, align: 'right' as const })),
      { label: 'Total', align: 'right' }
    ];
    const rows: PrintableReportRow[] = (result.vendorRows || []).map(vendor => ({
      kind: 'line',
      cells: [
        vendor.vendorLabel,
        ...bucketIds.map(bucketId => this.formatArAgingPrintableBucketAmount(vendor.bucketAmounts[bucketId])),
        this.formatter.currencyUsd(vendor.total)
      ]
    }));

    rows.push({
      kind: 'total',
      cells: [
        'Total',
        ...bucketIds.map(bucketId => this.formatArAgingPrintableBucketAmount(result.totals[bucketId])),
        this.formatter.currencyUsd(result.grandTotal)
      ]
    });

    return {
      title: result.reportTitle,
      subtitleLines: [result.entityLineLabel, result.periodLabel].filter(line => !!line?.trim()),
      columns,
      rows
    };
  }

getApAgingBillPaidAmountForDetail(receipt: ReceiptResponse, asOfDate: string): number {
    const paidAmount = Number(receipt.paidAmount || 0);
    if (paidAmount <= 0.005) {
      return 0;
    }

    const paidDate = this.toDateOnlyJsonString(receipt.paidDate);
    if (paidDate && paidDate > asOfDate) {
      return 0;
    }

    return paidAmount;
  }
  //#endregion

  //#region Accounting Rent Roll Mapping
  mapRentRollRowsFromAgreements(
    propertyAgreements: RentRollPropertyAgreement[],
    dateRange: { startDate: string | null; endDate: string | null }
  ): RentRollRow[] {
    const range = this.resolveRentRollRange(dateRange);
    return (propertyAgreements || [])
      .flatMap(propertyAgreement => this.mapRentRollRowsFromAgreement(propertyAgreement, range.startDate, range.endDate))
      .sort((left, right) =>
        left.propertyCode.localeCompare(right.propertyCode, undefined, { sensitivity: 'base', numeric: true })
        || String(left.billDate || '').localeCompare(String(right.billDate || ''), undefined, { sensitivity: 'base' })
        || left.vendorName.localeCompare(right.vendorName, undefined, { sensitivity: 'base' })
        || left.terms.localeCompare(right.terms, undefined, { sensitivity: 'base' })
      );
  }

  mapRentRollRowsFromAgreement(propertyAgreement: RentRollPropertyAgreement, rangeStartDate: Date, rangeEndDate: Date): RentRollRow[] {
    const propertyId = String(propertyAgreement?.propertyId || '').trim();
    const propertyCode = String(propertyAgreement?.propertyCode || '').trim();
    const officeId = Number.isFinite(Number(propertyAgreement?.officeId)) ? Number(propertyAgreement?.officeId) : null;
    return (propertyAgreement?.agreementLines || [])
      .flatMap(line => this.mapRentRollRowsForLine(propertyId, propertyCode, officeId, line, rangeStartDate, rangeEndDate))
      .filter((line): line is RentRollRow => !!line);
  }

  mapRentRollRowsForLine(
    propertyId: string,
    propertyCode: string,
    officeId: number | null,
    line: PropertyAgreementLineResponse | null | undefined,
    rangeStartDate: Date,
    rangeEndDate: Date
  ): RentRollRow[] {
    const monthlyAmount = Number(line?.monthly || 0);
    const dailyAmount = Number(line?.daily || 0);
    const depositAmount = Number(line?.deposit || 0);
    const oneTimeAmount = Number(line?.oneTime || 0);
    const hasMonthlyAmount = Number.isFinite(monthlyAmount) && monthlyAmount > 0;
    const hasDailyAmount = Number.isFinite(dailyAmount) && dailyAmount > 0;
    const hasDepositAmount = Number.isFinite(depositAmount) && depositAmount > 0;
    const hasOneTimeAmount = Number.isFinite(oneTimeAmount) && oneTimeAmount > 0;
    const hasOneTimeCharges = hasDepositAmount || hasOneTimeAmount;
    if (!hasMonthlyAmount && !hasDailyAmount && !hasOneTimeCharges) {
      return [];
    }

    const startDateRaw = String(line?.startDate || '').trim() || null;
    const startDate = this.utility.parseDateOnlyStringToDate(startDateRaw) || null;
    const endDate = this.utility.parseDateOnlyStringToDate(line?.endDate) || null;
    const billDayOfMonth = this.resolveRentRollBillDay(startDateRaw, startDate);
    const occurrences = this.buildRentRollOccurrenceDates(rangeStartDate, rangeEndDate, billDayOfMonth);

    return occurrences
      .filter(occurrenceDate => this.shouldIncludeRentRollOccurrence(occurrenceDate, startDate, endDate, hasOneTimeCharges))
      .map(occurrenceDate => this.mapRentRollRow(
        propertyId,
        propertyCode,
        officeId,
        line,
        occurrenceDate,
        hasMonthlyAmount ? monthlyAmount : 0,
        hasDailyAmount ? dailyAmount : 0,
        hasDepositAmount ? depositAmount : 0,
        hasOneTimeAmount ? oneTimeAmount : 0,
        startDate
      ))
      .filter((row): row is RentRollRow => !!row);
  }

  mapRentRollRow(
    propertyId: string,
    propertyCode: string,
    officeId: number | null,
    line: PropertyAgreementLineResponse | null | undefined,
    occurrenceDate: Date,
    monthlyAmount: number,
    dailyAmount: number,
    depositAmount: number,
    oneTimeAmount: number,
    startDate: Date | null
  ): RentRollRow | null {
    const daysInOccurrenceMonth = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth() + 1, 0).getDate();
    const isRent = !!line?.isRent;
    const serviceDaysInOccurrenceMonth = this.getServiceDaysInOccurrenceMonth(occurrenceDate, startDate, this.utility.parseDateOnlyStringToDate(line?.endDate) || null);
    const recurringAmount = this.calculateRentRollRecurringAmount({
      isRent,
      monthlyAmount,
      dailyAmount,
      daysInOccurrenceMonth,
      serviceDaysInOccurrenceMonth,
      startDate,
      endDate: this.utility.parseDateOnlyStringToDate(line?.endDate) || null,
      occurrenceDate
    });
    const includeOneTimeCharges = this.isSameYearMonth(occurrenceDate, startDate);
    const occurrenceDepositAmount = includeOneTimeCharges ? depositAmount : 0;
    const occurrenceOneTimeAmount = includeOneTimeCharges ? oneTimeAmount : 0;
    const totalAmount = recurringAmount + occurrenceDepositAmount + occurrenceOneTimeAmount;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return null;
    }

    return {
      propertyId,
      propertyCode,
      officeId,
      agreementLineId: line?.agreementLineId ?? null,
      billDate: this.utility.formatDateOnlyForApi(occurrenceDate),
      title: String(line?.title || '').trim(),
      vendorId: String(line?.vendorId || '').trim() || null,
      vendorName: String(line?.vendorName || '').trim(),
      terms: String(line?.terms || '').trim(),
      chartOfAccountId: Number.isFinite(Number(line?.chartOfAccountId)) && Number(line?.chartOfAccountId) > 0
        ? Number(line?.chartOfAccountId)
        : null,
      startDate: line?.startDate ?? null,
      endDate: line?.endDate ?? null,
      depositAmount: occurrenceDepositAmount,
      oneTimeAmount: occurrenceOneTimeAmount,
      monthlyAmount: Number.isFinite(monthlyAmount) && monthlyAmount > 0 ? monthlyAmount : 0,
      dailyAmount: Number.isFinite(dailyAmount) && dailyAmount > 0 ? dailyAmount : 0,
      totalAmount: this.roundFinancialReportAmount(totalAmount),
      isRent,
      notes: String(line?.notes || '').trim()
    };
  }

  calculateRentRollRecurringAmount(args: {
    isRent: boolean;
    monthlyAmount: number;
    dailyAmount: number;
    daysInOccurrenceMonth: number;
    serviceDaysInOccurrenceMonth: number;
    startDate: Date | null;
    endDate: Date | null;
    occurrenceDate: Date;
  }): number {
    const {
      isRent,
      monthlyAmount,
      dailyAmount,
      daysInOccurrenceMonth,
      serviceDaysInOccurrenceMonth,
      startDate,
      endDate,
      occurrenceDate
    } = args;

    if (monthlyAmount > 0) {
      if (!isRent) {
        return monthlyAmount;
      }
      const monthStart = this.getMonthStart(occurrenceDate);
      const monthEnd = this.getMonthEnd(occurrenceDate);
      const isFullMonthService = (!startDate || startDate.getTime() <= monthStart.getTime())
        && (!endDate || endDate.getTime() >= monthEnd.getTime());
      if (isFullMonthService) {
        return monthlyAmount;
      }
      if (serviceDaysInOccurrenceMonth <= 0) {
        return 0;
      }
      return monthlyAmount * (serviceDaysInOccurrenceMonth / 30);
    }

    if (dailyAmount > 0) {
      if (!isRent) {
        return dailyAmount * daysInOccurrenceMonth;
      }
      return dailyAmount * Math.max(serviceDaysInOccurrenceMonth, 0);
    }

    return 0;
  }

  getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  getMonthEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  getServiceDaysInOccurrenceMonth(occurrenceDate: Date, startDate: Date | null, endDate: Date | null): number {
    const monthStart = this.getMonthStart(occurrenceDate);
    const monthEnd = this.getMonthEnd(occurrenceDate);
    const effectiveStart = startDate && startDate.getTime() > monthStart.getTime() ? startDate : monthStart;
    const effectiveEnd = endDate && endDate.getTime() < monthEnd.getTime() ? endDate : monthEnd;
    if (effectiveEnd.getTime() < effectiveStart.getTime()) {
      return 0;
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1;
  }

  resolveRentRollRange(dateRange: { startDate: string | null; endDate: string | null }): { startDate: Date; endDate: Date } {
    const now = new Date();
    const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const parsedStart = this.utility.parseDateOnlyStringToDate(dateRange?.startDate) || fallbackStart;
    const parsedEnd = this.utility.parseDateOnlyStringToDate(dateRange?.endDate) || parsedStart || fallbackEnd;
    const startDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate());
    const endDate = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate());
    if (startDate.getTime() <= endDate.getTime()) {
      return { startDate, endDate };
    }
    return { startDate: endDate, endDate: startDate };
  }

  resolveRentRollBillDay(startDateRaw: string | null, startDate: Date | null): number {
    const dayFromString = this.extractDayOfMonthFromCalendarString(startDateRaw);
    const dayOfMonth = dayFromString ?? startDate?.getDate() ?? 1;
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1) {
      return 1;
    }
    if (dayOfMonth > 31) {
      return 31;
    }
    return dayOfMonth;
  }

  extractDayOfMonthFromCalendarString(value: string | null): number | null {
    const raw = String(value || '').trim();
    if (!raw) {
      return null;
    }
    const datePart = raw.split('T')[0]?.split(' ')[0] ?? '';
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (isoMatch) {
      const day = Number(isoMatch[3]);
      return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
    }
    const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(datePart);
    if (usMatch) {
      const day = Number(usMatch[2]);
      return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
    }
    return null;
  }

  buildRentRollOccurrenceDates(rangeStartDate: Date, rangeEndDate: Date, billDayOfMonth: number): Date[] {
    const dates: Date[] = [];
    let year = rangeStartDate.getFullYear();
    let month = rangeStartDate.getMonth();
    const endYear = rangeEndDate.getFullYear();
    const endMonth = rangeEndDate.getMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const day = Math.min(billDayOfMonth, daysInMonth);
      dates.push(new Date(year, month, day));
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return dates;
  }

  shouldIncludeRentRollOccurrence(
    occurrenceDate: Date,
    startDate: Date | null,
    endDate: Date | null,
    hasOneTimeCharges: boolean
  ): boolean {
    if (startDate && occurrenceDate.getTime() < startDate.getTime()) {
      return false;
    }
    if (endDate && occurrenceDate.getTime() > endDate.getTime()) {
      return false;
    }
    if (hasOneTimeCharges && !this.isSameYearMonth(occurrenceDate, startDate)) {
      return false;
    }
    return true;
  }

  isSameYearMonth(left: Date | null, right: Date | null): boolean {
    if (!left || !right) {
      return false;
    }
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
  }

  sumRentRollTotal(rows: RentRollRow[]): number {
    return (rows || []).reduce((sum, row) => this.roundFinancialReportAmount(sum + Number(row?.totalAmount || 0)), 0);
  }
  //#endregion

  //#region Reconcile-Account-Report
  buildReconcileAccountReport(request: ReconcileAccountReportBuildRequest): ReconcileAccountReportResult {
    const statementDate = String(request.statementDate || '').trim();
    const accountNo = String(request.account?.accountNo || '').trim();
    const accountName = String(request.account?.name || '').trim();
    const accountLabel = accountNo && accountName ? `${accountNo} · ${accountName}` : accountNo || accountName;
    const periodEndingLabel = statementDate ? this.formatter.formatDateString(statementDate) : '';
    const entityLine = [request.companyName?.trim(), request.officeName?.trim()].filter(Boolean).join(' ');
    const periodLine = periodEndingLabel
      ? `${accountLabel}, Period Ending ${periodEndingLabel}`
      : accountLabel;
    const reportTitle = request.view === 'detail' ? 'Reconciliation Detail' : 'Reconciliation Summary';

    const eligibleLines = (request.lines ?? [])
      .filter(line => {
        const transactionDate = String(line.transactionDate || '').trim();
        return !statementDate || !transactionDate || transactionDate <= statementDate;
      })
      .map(line => ({
        line,
        amount: this.getReconcileAccountLineAmount(line),
        isCleared: this.isReconcileReportLineCleared(line)
      }));

    const compareReconcileLines = (
      left: { line: JournalEntryLineSearchResponse },
      right: { line: JournalEntryLineSearchResponse }
    ): number => {
      const leftDate = String(left.line.transactionDate || '').trim();
      const rightDate = String(right.line.transactionDate || '').trim();
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }

      return String(left.line.journalEntryCode || '').localeCompare(String(right.line.journalEntryCode || ''));
    };

    const clearedLines = eligibleLines.filter(item => item.isCleared).sort(compareReconcileLines);
    const unclearedLines = eligibleLines.filter(item => !item.isCleared).sort(compareReconcileLines);

    const clearedPayments = clearedLines.filter(item => item.amount < 0);
    const clearedDeposits = clearedLines.filter(item => item.amount > 0);
    const unclearedPayments = unclearedLines.filter(item => item.amount < 0);
    const unclearedDeposits = unclearedLines.filter(item => item.amount > 0);

    const sumAmounts = (items: { amount: number }[]): number =>
      this.roundFinancialReportAmount(items.reduce((sum, item) => sum + Number(item.amount || 0), 0));

    const clearedPaymentsTotal = sumAmounts(clearedPayments);
    const clearedDepositsTotal = sumAmounts(clearedDeposits);
    const totalClearedTransactions = this.roundFinancialReportAmount(clearedPaymentsTotal + clearedDepositsTotal);
    const beginningBalance = this.roundFinancialReportAmount(Number(request.beginningBalance || 0));
    const clearedBalance = this.roundFinancialReportAmount(beginningBalance + totalClearedTransactions);

    const unclearedPaymentsTotal = sumAmounts(unclearedPayments);
    const unclearedDepositsTotal = sumAmounts(unclearedDeposits);
    const totalUnclearedTransactions = this.roundFinancialReportAmount(unclearedPaymentsTotal + unclearedDepositsTotal);
    const registerBalance = this.roundFinancialReportAmount(clearedBalance + totalUnclearedTransactions);
    const endingBalance = this.roundFinancialReportAmount(Number(request.endingBalance ?? registerBalance));

    const registerBalanceLabel = periodEndingLabel
      ? `Register Balance as of ${periodEndingLabel}`
      : 'Register Balance';

    const rows: ReconcileAccountReportRow[] = [];
    if (request.view === 'detail') {
      rows.push({
        rowId: 'detail-columns',
        rowKind: 'columnHeader',
        label: 'Type',
        type: 'Date',
        date: 'Num',
        num: 'Name',
        name: 'Clr',
        clr: 'Amount',
        amount: null,
        balance: null
      });
    }

    rows.push({
      rowId: 'beginning-balance',
      rowKind: 'beginning',
      label: 'Beginning Balance',
      balance: beginningBalance,
      amount: request.view === 'detail' ? null : beginningBalance
    });

    rows.push({
      rowId: 'section-cleared',
      rowKind: 'section',
      label: 'Cleared Transactions',
      depth: 0
    });

    this.appendReconcileAccountSubsectionRows(rows, {
      view: request.view,
      sectionKey: 'cleared-payments',
      subsectionLabel: `Checks and Payments - ${clearedPayments.length} items`,
      lines: clearedPayments,
      totalLabel: 'Total Checks and Payments',
      includeRunningBalance: true
    });

    this.appendReconcileAccountSubsectionRows(rows, {
      view: request.view,
      sectionKey: 'cleared-deposits',
      subsectionLabel: `Deposits and Credits - ${clearedDeposits.length} items`,
      lines: clearedDeposits,
      totalLabel: 'Total Deposits and Credits',
      includeRunningBalance: true
    });

    rows.push({
      rowId: 'total-cleared-transactions',
      rowKind: 'total',
      label: 'Total Cleared Transactions',
      amount: totalClearedTransactions,
      balance: request.view === 'detail' ? totalClearedTransactions : null,
      depth: 0
    });

    rows.push({
      rowId: 'cleared-balance',
      rowKind: 'summary',
      label: 'Cleared Balance',
      amount: request.view === 'detail' ? totalClearedTransactions : clearedBalance,
      balance: clearedBalance,
      depth: 0
    });

    rows.push({
      rowId: 'section-uncleared',
      rowKind: 'section',
      label: 'Uncleared Transactions',
      depth: 0
    });

    if (unclearedPayments.length > 0) {
      this.appendReconcileAccountSubsectionRows(rows, {
        view: request.view,
        sectionKey: 'uncleared-payments',
        subsectionLabel: `Checks and Payments - ${unclearedPayments.length} items`,
        lines: unclearedPayments,
        totalLabel: 'Total Checks and Payments',
        includeRunningBalance: true
      });
    }

    if (unclearedDeposits.length > 0) {
      this.appendReconcileAccountSubsectionRows(rows, {
        view: request.view,
        sectionKey: 'uncleared-deposits',
        subsectionLabel: `Deposits and Credits - ${unclearedDeposits.length} items`,
        lines: unclearedDeposits,
        totalLabel: 'Total Deposits and Credits',
        includeRunningBalance: true
      });
    }

    rows.push({
      rowId: 'total-uncleared-transactions',
      rowKind: 'total',
      label: 'Total Uncleared Transactions',
      amount: totalUnclearedTransactions,
      balance: request.view === 'detail' ? totalUnclearedTransactions : null,
      depth: 0
    });

    rows.push({
      rowId: 'register-balance',
      rowKind: 'summary',
      label: registerBalanceLabel,
      amount: request.view === 'detail'
        ? this.roundFinancialReportAmount(totalClearedTransactions + totalUnclearedTransactions)
        : registerBalance,
      balance: registerBalance,
      depth: 0
    });

    rows.push({
      rowId: 'ending-balance',
      rowKind: 'ending',
      label: 'Ending Balance',
      amount: request.view === 'detail'
        ? this.roundFinancialReportAmount(totalClearedTransactions + totalUnclearedTransactions)
        : endingBalance,
      balance: endingBalance,
      depth: 0
    });

    return {
      reportTitle,
      entityLine,
      periodLine,
      view: request.view,
      rows
    };
  }

appendReconcileAccountSubsectionRows(
    rows: ReconcileAccountReportRow[],
    params: {
      view: ReconcileAccountReportView;
      sectionKey: string;
      subsectionLabel: string;
      lines: { line: JournalEntryLineSearchResponse; amount: number; isCleared: boolean }[];
      totalLabel: string;
      includeRunningBalance: boolean;
    }
  ): void {
    if (params.lines.length === 0) {
      return;
    }

    const subsectionTotal = this.roundFinancialReportAmount(
      params.lines.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    if (params.view === 'summary') {
      rows.push({
        rowId: `${params.sectionKey}-summary`,
        rowKind: 'subsection',
        label: params.subsectionLabel,
        amount: subsectionTotal,
        depth: 1
      });
      return;
    }

    rows.push({
      rowId: `${params.sectionKey}-header`,
      rowKind: 'subsection',
      label: params.subsectionLabel,
      depth: 1
    });

    let runningBalance = 0;
    params.lines.forEach((item, index) => {
      runningBalance = this.roundFinancialReportAmount(runningBalance + item.amount);
      const line = item.line;
      rows.push({
        rowId: `${params.sectionKey}-line-${line.journalEntryLineId || index}`,
        rowKind: 'line',
        type: getSourceTypeLabel(line.sourceTypeId, SourceTypeLabels),
        date: this.formatter.formatDateString(String(line.transactionDate || '')),
        num: this.resolveJournalEntryLineSourceDisplay(line),
        name: String(line.contactName || '').trim(),
        clr: item.isCleared ? 'X' : '',
        amount: item.amount,
        balance: params.includeRunningBalance ? runningBalance : null,
        depth: 2
      });
    });

    rows.push({
      rowId: `${params.sectionKey}-total`,
      rowKind: 'total',
      label: params.totalLabel,
      amount: subsectionTotal,
      balance: params.includeRunningBalance ? subsectionTotal : null,
      depth: 1
    });
  }

getReconcileAccountLineAmount(line: JournalEntryLineSearchResponse): number {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (debit > 0) {
      return this.roundFinancialReportAmount(debit);
    }
    if (credit > 0) {
      return this.roundFinancialReportAmount(-credit);
    }
    return 0;
  }

isReconcileReportLineCleared(line: JournalEntryLineSearchResponse): boolean {
    if (line.clearedOn) {
      return true;
    }
    return line.isCleared === true;
  }

  mapReconcileAccountReportToPrintableDocument(result: ReconcileAccountReportResult): PrintableReportDocument {
    const subtitleLines = [result.entityLine, result.periodLine].filter(line => !!line?.trim());
    if (result.view === 'detail') {
      return {
        title: result.reportTitle,
        subtitleLines,
        columns: [
          { label: 'Type', align: 'left' },
          { label: 'Date', align: 'left' },
          { label: 'Num', align: 'left' },
          { label: 'Name', align: 'left' },
          { label: 'Clr', align: 'center' },
          { label: 'Amount', align: 'right' },
          { label: 'Balance', align: 'right' }
        ],
        rows: (result.rows || [])
          .filter(row => row.rowKind !== 'columnHeader')
          .map(row => this.mapReconcileAccountDetailPrintableRow(row))
      };
    }

    return {
      title: result.reportTitle,
      subtitleLines,
      columns: [
        { label: '', align: 'left' },
        { label: 'Amount', align: 'right' }
      ],
      rows: (result.rows || []).map(row => this.mapReconcileAccountSummaryPrintableRow(row))
    };
  }

mapReconcileAccountSummaryPrintableRow(row: ReconcileAccountReportRow): PrintableReportRow {
    const kind = this.mapReconcileAccountPrintableRowKind(row.rowKind);
    const amountDisplay = this.formatReconcileAccountSummaryPrintableAmount(row);
    return {
      kind,
      cells: [row.label || '', amountDisplay],
      indent: row.depth
    };
  }

mapReconcileAccountDetailPrintableRow(row: ReconcileAccountReportRow): PrintableReportRow {
    const kind = this.mapReconcileAccountPrintableRowKind(row.rowKind);
    if (row.rowKind === 'line') {
      return {
        kind,
        cells: [
          row.type || '',
          row.date || '',
          row.num || '',
          row.name || '',
          row.clr || '',
          this.formatReconcileAccountPrintableAmount(row.amount),
          this.formatReconcileAccountPrintableAmount(row.balance)
        ]
      };
    }

    return {
      kind,
      cells: [
        row.label || '',
        '',
        '',
        '',
        '',
        this.formatReconcileAccountPrintableAmount(row.amount),
        this.formatReconcileAccountPrintableAmount(row.balance)
      ],
      indent: row.depth
    };
  }

mapReconcileAccountPrintableRowKind(
    rowKind: ReconcileAccountReportRow['rowKind']
  ): PrintableReportRowKind {
    if (rowKind === 'section') {
      return 'section';
    }
    if (rowKind === 'subsection') {
      return 'subsection';
    }
    if (rowKind === 'line') {
      return 'line';
    }
    if (rowKind === 'total' || rowKind === 'beginning' || rowKind === 'ending') {
      return rowKind === 'beginning' ? 'summary' : 'total';
    }
    return 'summary';
  }

formatReconcileAccountSummaryPrintableAmount(row: ReconcileAccountReportRow): string {
    if (row.amount != null && Number.isFinite(row.amount)) {
      return this.formatter.currencyUsd(row.amount);
    }
    if (row.balance != null && Number.isFinite(row.balance)) {
      return this.formatter.currencyUsd(row.balance);
    }
    return '';
  }

formatReconcileAccountPrintableAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return '';
    }
    return this.formatter.currencyUsd(value);
  }

  mapFinancialReportToPrintableDocument(result: FinancialReportResult, entityLine: string): PrintableReportDocument {
    const amountColumnIds = this.getFinancialReportPrintableAmountColumnIds(result);
    const columns: PrintableReportDocument['columns'] = [
      { label: '', align: 'left' },
      ...amountColumnIds.map(columnId => ({
        label: this.getFinancialReportPrintableColumnLabel(result, columnId),
        align: 'right' as const
      }))
    ];
    const rows: PrintableReportRow[] = [];
    (result.sections || []).forEach(section => this.appendFinancialReportPrintableRows(section, amountColumnIds, rows));

    return {
      title: result.reportTitle,
      subtitleLines: [entityLine, result.periodLabel].filter(line => !!line?.trim()),
      columns,
      rows
    };
  }

  mapArAgingReportToPrintableDocument(result: ArAgingReportResult): PrintableReportDocument {
    const bucketIds = (result.bucketColumns || []).map(column => column.id);
    const columns: PrintableReportDocument['columns'] = [
      { label: 'Customer', align: 'left' },
      ...(result.bucketColumns || []).map(column => ({ label: column.label, align: 'right' as const })),
      { label: 'Total', align: 'right' }
    ];
    const rows: PrintableReportRow[] = (result.customerRows || []).map(customer => ({
      kind: 'line',
      cells: [
        customer.customerLabel,
        ...bucketIds.map(bucketId => this.formatArAgingPrintableBucketAmount(customer.bucketAmounts[bucketId])),
        this.formatter.currencyUsd(customer.total)
      ]
    }));

    rows.push({
      kind: 'total',
      cells: [
        'Total',
        ...bucketIds.map(bucketId => this.formatArAgingPrintableBucketAmount(result.totals[bucketId])),
        this.formatter.currencyUsd(result.grandTotal)
      ]
    });

    return {
      title: result.reportTitle,
      subtitleLines: [result.entityLineLabel, result.periodLabel].filter(line => !!line?.trim()),
      columns,
      rows
    };
  }

getFinancialReportPrintableAmountColumnIds(result: FinancialReportResult): string[] {
    const columnIds = (result.columns || []).map(column => column.columnId);
    if (result.showTotalColumn) {
      columnIds.push(FINANCIAL_REPORT_TOTAL_COLUMN_ID);
    }
    return columnIds;
  }

getFinancialReportPrintableColumnLabel(result: FinancialReportResult, columnId: string): string {
    if (columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID) {
      return 'Total';
    }
    return result.columns.find(column => column.columnId === columnId)?.label || columnId;
  }

appendFinancialReportPrintableRows(
    node: FinancialReportTreeNode,
    amountColumnIds: string[],
    rows: PrintableReportRow[]
  ): void {
    const hasChildren = node.childNodes.length > 0;
    const hideSectionAmounts = hasChildren && node.rowKind === 'section';
    rows.push({
      kind: this.mapFinancialReportPrintableRowKind(node.rowKind, node.depth),
      cells: [
        node.label,
        ...amountColumnIds.map(columnId => hideSectionAmounts
          ? ''
          : this.formatFinancialReportPrintableAmount(node.columnAmounts[columnId]))
      ],
      indent: node.depth
    });

    node.childNodes.forEach(childNode => this.appendFinancialReportPrintableRows(childNode, amountColumnIds, rows));
  }

mapFinancialReportPrintableRowKind(
    rowKind: FinancialReportTreeNode['rowKind'],
    depth: number
  ): PrintableReportRowKind {
    if (rowKind === 'section') {
      return depth > 0 ? 'subsection' : 'section';
    }
    if (rowKind === 'account') {
      return 'line';
    }
    if (rowKind === 'total') {
      return 'total';
    }
    return 'summary';
  }

formatFinancialReportPrintableAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return '';
    }
    return this.formatter.currencyUsd(value);
  }

formatArAgingPrintableBucketAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || Math.abs(value) <= 0.005) {
      return '';
    }
    return this.formatter.currencyUsd(value);
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
