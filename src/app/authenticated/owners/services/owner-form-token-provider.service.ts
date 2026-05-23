import { Injectable } from '@angular/core';
import { catchError, filter, forkJoin, map, Observable, of, take } from 'rxjs';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { LeadOwnerResponse } from '../../leads/models/lead-owner.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { FORM_TOKEN_PROVIDERS, FormTokenProvider, FormTokenProviderInputs } from '../../shared/forms/services/form-token-provider';
import { OwnerFormPlaceholderService } from './owner-form-placeholder.service';
import { OwnersService } from './owners.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerFormTokenProviderService implements FormTokenProvider {
  readonly contextType = 'owner';

  constructor(
    private commonService: CommonService,
    private ownersService: OwnersService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private ownerFormPlaceholderService: OwnerFormPlaceholderService
  ) {}

  applyTokens(templateHtml: string, inputs: FormTokenProviderInputs): Observable<string> {
    const organizationId = String(this.commonService.getOrganizationValue()?.organizationId || '').trim();
    const ownerLeadId = Number(inputs.ownerLeadId);
    const scopedPropertyId = inputs.propertyId && inputs.propertyId !== 'new' ? String(inputs.propertyId) : '';

    this.commonService.loadStates();
    this.commonService.loadOrganization();

    const organizationFromCache = this.commonService.getOrganizationValue();
    const organization$ = organizationFromCache
      ? of(organizationFromCache)
      : this.commonService.getOrganization().pipe(
          filter(org => org !== null),
          take(1),
          catchError(() => of(null))
        );
    const offices$ = organizationId
      ? this.ownersService.ensureOfficesLoaded(organizationId).pipe(take(1), catchError(() => of([])))
      : of([]);
    const contacts$ = this.ownersService.ensureContactsLoaded().pipe(take(1), catchError(() => of([])));
    const property$ = scopedPropertyId
      ? this.ownersService.getPropertyByContext(null, scopedPropertyId).pipe(take(1), catchError(() => of(null)))
      : of(null);
    const leadOwner$ = Number.isFinite(ownerLeadId) && ownerLeadId > 0
      ? this.ownersService.getOwnerByContext(null, ownerLeadId).pipe(take(1), catchError(() => of(null)))
      : of(null);

    return forkJoin({
      organization: organization$,
      offices: offices$,
      contacts: contacts$,
      property: property$,
      leadOwner: leadOwner$
    }).pipe(
      map(({ organization, offices, contacts, property, leadOwner }) => {
        return this.applyOwnerTokens(templateHtml, inputs, {
          organization: organization as OrganizationResponse | null,
          offices: (offices || []) as OfficeResponse[],
          contacts: (contacts || []) as ContactResponse[],
          property: property as PropertyResponse | null,
          leadOwner: leadOwner as LeadOwnerResponse | null
        });
      })
    );
  }

  private applyOwnerTokens(
    html: string,
    inputs: FormTokenProviderInputs,
    data: {
      organization: OrganizationResponse | null;
      offices: OfficeResponse[];
      contacts: ContactResponse[];
      property: PropertyResponse | null;
      leadOwner: LeadOwnerResponse | null;
    }
  ): string {
    const selectedOffice = this.resolveSelectedOffice(data.offices, inputs.officeId);
    const ownerContact = data.contacts.find(contact =>
      Number(contact.entityTypeId) === Number(EntityType.Owner) &&
      Number(contact.ownerLeadId) === Number(inputs.ownerLeadId)
    ) || null;

    const ownerFullName = ownerContact?.fullName || `${ownerContact?.firstName || ''} ${ownerContact?.lastName || ''}`.trim();
    const propertyOwner1Name = this.getPropertyOwnerName(data.contacts, data.property?.owner1Id);
    const propertyOwner2Name = this.getPropertyOwnerName(data.contacts, data.property?.owner2Id);
    let owner1Name = propertyOwner1Name || ownerFullName;
    let owner2Name = '';
    if (propertyOwner2Name && propertyOwner2Name.toLowerCase() !== owner1Name.toLowerCase()) {
      owner2Name = propertyOwner2Name;
    }
    if (!owner1Name && owner2Name) {
      owner1Name = owner2Name;
      owner2Name = '';
    }
    const ownerPairSeparator = owner2Name ? ', ' : '';
    const today = this.formatterService.formatDateStringLong(this.utilityService.todayAsCalendarDateString()) || '';
    const monthlyRent = this.getMonthlyRent(data.property, data.leadOwner);
    const ownerStateCode = String(ownerContact?.state || '').trim();
    const ownerState = this.lookupStateName(ownerStateCode);
    const companyStateCode = String(selectedOffice?.state || data.organization?.state || '').trim();
    const companyState = this.lookupStateName(companyStateCode);
    const companyCity = String(selectedOffice?.city || data.organization?.city || '').trim();
    const companyName = String(data.organization?.name || '').trim();
    const officeName = String(selectedOffice?.name || '').trim();
    const companyAddress1 = this.getCompanyAddress1(selectedOffice, data.organization);
    const companyAddress2 = this.getCompanyAddress2(selectedOffice, data.organization, companyState);
    const companyAddress = [companyAddress1, companyAddress2].filter(part => part.length > 0).join(', ');
    const ownerAddress = this.composeAddress(ownerContact);
    const propertyAddress = this.composeAddress(data.property);
    const propertyAddress1 = String(data.property?.address1 || '').trim();
    const propertyCity = String(data.property?.city || '').trim();
    const propertyState = this.lookupStateName(data.property?.state);
    const propertyZip = String(data.property?.zip || '').trim();
    const officeLogoBase64 = selectedOffice?.fileDetails?.dataUrl || data.organization?.fileDetails?.dataUrl || '';

    const tokenValues: Record<string, string> = {
      agreementStartDate: today,
      ownerSignatureDate: today,
      agentSignatureDate: today,
      ownerName: ownerFullName,
      ownerFullName,
      Owner1Name: owner1Name,
      Owner2Name: owner2Name,
      ownerPairSeparator,
      OwnerPairSeparator: ownerPairSeparator,
      ownerState,
      ownerAddressSingleLine: ownerAddress,
      ownerAddress: ownerAddress,
      propertyAddressSingleLine: propertyAddress,
      propertyAddress: propertyAddress,
      address1: propertyAddress1,
      city: propertyCity,
      state: propertyState,
      zip: propertyZip,
      propertyCode: String(data.property?.propertyCode || '').trim(),
      companyName,
      companyNameInCaps: companyName.toUpperCase(),
      officeName,
      companyState,
      companyCity,
      companyAddress,
      companyAddressSingleLine: companyAddress,
      companyAddress1,
      companyAddress2,
      accountingOfficeAddress: companyAddress,
      accountingOfficeAddressSingleLine: companyAddress,
      monthlyRent,
      officeLogoBase64
    };

    return this.ownerFormPlaceholderService.replaceTokens(html, tokenValues, {
      clearUnresolved: true,
      includeUnderlinedVariants: true
    });
  }

  private resolveSelectedOffice(offices: OfficeResponse[], officeId: number | null): OfficeResponse | null {
    const requestedOfficeId = Number(officeId);
    if (Number.isFinite(requestedOfficeId) && requestedOfficeId > 0) {
      return offices.find(office => office.officeId === requestedOfficeId) || null;
    }
    return offices.length === 1 ? offices[0] : null;
  }

  private lookupStateName(code: string | null | undefined): string {
    const normalized = String(code || '').trim();
    if (!normalized) {
      return '';
    }
    const stateMatch = (this.commonService.getStatesFullValue() || []).find(state =>
      String(state.code || '').trim().toLowerCase() === normalized.toLowerCase()
    );
    return String(stateMatch?.name || normalized).trim();
  }

  private getCompanyAddress1(selectedOffice: OfficeResponse | null, organization: OrganizationResponse | null): string {
    const address1 = String(selectedOffice?.address1 || organization?.address1 || '').trim();
    const suiteRaw = String(selectedOffice?.suite || organization?.suite || '').trim();
    if (!address1) {
      return '';
    }
    if (!suiteRaw) {
      return address1;
    }
    return `${address1}, ${this.normalizeSuiteForDisplay(suiteRaw)}`;
  }

  private getCompanyAddress2(selectedOffice: OfficeResponse | null, organization: OrganizationResponse | null, companyState: string): string {
    const city = String(selectedOffice?.city || organization?.city || '').trim();
    const zip = String(selectedOffice?.zip || organization?.zip || '').trim();
    const cityState = [city, companyState].filter(part => part.length > 0).join(', ');
    return [cityState, zip].filter(part => part.length > 0).join(' ');
  }

  private normalizeSuiteForDisplay(suiteRaw: string | null | undefined): string {
    const value = String(suiteRaw || '').trim();
    if (!value) {
      return '';
    }
    if (/^(suite|ste|unit|apt|apartment)\b/i.test(value) || value.startsWith('#')) {
      return value;
    }
    return `#${value}`;
  }

  private composeAddress(source: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null | undefined): string {
    if (!source) {
      return '';
    }
    return [
      String(source.address1 || '').trim(),
      String(source.address2 || '').trim(),
      String(source.city || '').trim(),
      this.lookupStateName(source.state),
      String(source.zip || '').trim()
    ].filter(part => part.length > 0).join(', ');
  }

  private getMonthlyRent(property: PropertyResponse | null, leadOwner: LeadOwnerResponse | null): string {
    const leadOwnerTargetMonthly = Number(leadOwner?.adjustedGrossRentTarget);
    if (Number.isFinite(leadOwnerTargetMonthly) && leadOwnerTargetMonthly > 0) {
      return this.formatCurrencyRaw(leadOwnerTargetMonthly);
    }
    const propertyBillingRate = Number((property as any)?.billingRate);
    if (Number.isFinite(propertyBillingRate) && propertyBillingRate > 0) {
      return this.formatCurrencyRaw(propertyBillingRate);
    }
    return '';
  }

  private formatCurrencyRaw(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '';
    }
    const parsed = Number(String(value).replace(/[$,]/g, ''));
    if (!Number.isFinite(parsed)) {
      return '';
    }
    return '$' + parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private getPropertyOwnerName(contacts: ContactResponse[], contactId: string | null | undefined): string {
    const normalizedContactId = String(contactId || '').trim().toLowerCase();
    if (!normalizedContactId) {
      return '';
    }
    const contact = (contacts || []).find(item =>
      String(item.contactId || '').trim().toLowerCase() === normalizedContactId
    );
    return String(contact?.fullName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim()).trim();
  }
}

export const OWNER_FORM_TOKEN_PROVIDER = {
  provide: FORM_TOKEN_PROVIDERS,
  useExisting: OwnerFormTokenProviderService,
  multi: true
};
