import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, filter, map, take } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactRequest } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { LeadOwnerRequest, LeadOwnerResponse, LeadOwnerUpdateRequest } from '../../leads/models/lead-owner.model';
import { PublicOwnerFormResponse, PublicOwnerFormSubmitRequest } from '../../leads/models/owner-form-share.model';
import { OwnerInventoryInformationRequest, OwnerInventoryInformationResponse } from '../../leads/models/owner-inventory-information.model';
import { LeadsService } from '../../leads/services/leads.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { StateFormResponse } from '../../organizations/models/state-form.model';
import { OfficeService } from '../../organizations/services/office.service';
import { StateFormService } from '../../organizations/services/state-form.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { OwnerAgreementInformationResponse } from '../models/owner-agreement-information.model';
import { OwnerAgreementInformationRequest } from '../models/owner-agreement-information.model';
import { OwnerHtmlResponse } from '../models/owner-html.model';
import { CommonService } from '../../../services/common.service';

export type PublicOwnerAgreementContext = {
  organization: OrganizationResponse | null;
  office: OfficeResponse | null;
  contact: ContactResponse | null;
  publicForm: PublicOwnerFormResponse | null;
  owner: LeadOwnerResponse | null;
  property: PropertyResponse | null;
  propertyAgreement: PropertyAgreementResponse | null;
  agreementInfo: OwnerAgreementInformationResponse | null;
  accountingOffice: AccountingOfficeResponse | null;
};

@Injectable({
  providedIn: 'root'
})
export class OwnersService {
  constructor(
    private http: HttpClient,
    private leadsService: LeadsService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private propertyAgreementService: PropertyAgreementService,
    private officeService: OfficeService,
    private stateFormService: StateFormService,
    private accountingOfficeService: AccountingOfficeService,
    private commonService: CommonService
  ) {}

  isPublicTokenMode(token: string | null | undefined): boolean {
    return this.normalizeToken(token).length > 0;
  }

  normalizeToken(token: string | null | undefined): string {
    return String(token || '').trim();
  }

  getOwnerByContext(token: string | null | undefined, ownerLeadId: number | null | undefined): Observable<LeadOwnerResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerLeadByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const ownerId = Number(ownerLeadId);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      return of(null);
    }
    return this.leadsService.getOwnerLeadById(ownerId).pipe(catchError(() => of(null)));
  }

  getOwnerContactByContext(token: string | null | undefined, ownerLeadId: number | null | undefined): Observable<ContactResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerContactByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const ownerId = Number(ownerLeadId);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      return of(null);
    }
    return this.contactService.getContacts().pipe(
      map(contacts => (contacts || []).find(contact =>
        Number(contact.entityTypeId) === Number(EntityType.Owner) && Number(contact.ownerLeadId) === ownerId
      ) || null),
      catchError(() => of(null))
    );
  }

  getPropertyByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<PropertyResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerPropertyByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const resolvedPropertyId = String(propertyId || '').trim();
    if (!resolvedPropertyId || resolvedPropertyId === 'new') {
      return of(null);
    }
    return this.propertyService.getPropertyByGuid(resolvedPropertyId).pipe(catchError(() => of(null)));
  }

  getPropertyAgreementByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<PropertyAgreementResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerPropertyAgreementByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const resolvedPropertyId = String(propertyId || '').trim();
    if (!resolvedPropertyId || resolvedPropertyId === 'new') {
      return of(null);
    }
    return this.propertyAgreementService.getPropertyAgreement(resolvedPropertyId).pipe(catchError(() => of(null)));
  }

  getAgreementInformationByContext(token: string | null | undefined, officeId: number | null | undefined, propertyId: string | null | undefined): Observable<OwnerAgreementInformationResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerAgreementInformationByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const scopedPropertyId = propertyId && propertyId !== 'new' ? propertyId : null;
    return this.leadsService.getOwnerAgreementInformationByScope(officeId ?? null, scopedPropertyId).pipe(catchError(() => of(null)));
  }

  getPublicOwnerAgreementContext(token: string): Observable<PublicOwnerAgreementContext> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of(this.emptyPublicOwnerAgreementContext());
    }

    return forkJoin({
      organization: this.leadsService.getPublicOwnerOrganizationByToken(normalizedToken).pipe(catchError(() => of(null))),
      office: this.leadsService.getPublicOwnerOfficeByToken(normalizedToken).pipe(catchError(() => of(null))),
      contact: this.leadsService.getPublicOwnerContactByToken(normalizedToken).pipe(catchError(() => of(null))),
      publicForm: this.leadsService.getPublicOwnerFormByToken(normalizedToken).pipe(catchError(() => of(null))),
      owner: this.leadsService.getPublicOwnerLeadByToken(normalizedToken).pipe(catchError(() => of(null))),
      property: this.leadsService.getPublicOwnerPropertyByToken(normalizedToken).pipe(catchError(() => of(null))),
      propertyAgreement: this.leadsService.getPublicOwnerPropertyAgreementByToken(normalizedToken).pipe(catchError(() => of(null))),
      agreementInfo: this.leadsService.getPublicOwnerAgreementInformationByToken(normalizedToken).pipe(catchError(() => of(null))),
      accountingOffice: this.leadsService.getPublicOwnerAccountingOfficeByToken(normalizedToken).pipe(catchError(() => of(null)))
    });
  }

  getPublicOwnerFormByToken(token: string): Observable<PublicOwnerFormResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of(null);
    }
    return this.leadsService.getPublicOwnerFormByToken(normalizedToken).pipe(catchError(() => of(null)));
  }

  submitOwnerFormByContext(token: string | null | undefined, body: PublicOwnerFormSubmitRequest): Observable<PublicOwnerFormResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of(null);
    }
    return this.leadsService.submitPublicOwnerFormByToken(normalizedToken, body).pipe(catchError(() => of(null)));
  }

  getOwnerInventoryInformationByOwnerId(ownerId: number): Observable<OwnerInventoryInformationResponse | null> {
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      return of(null);
    }
    return this.leadsService.getOwnerInventoryInformationByOwnerId(ownerId).pipe(catchError(() => of(null)));
  }

  updateOwnerInventoryInformation(body: OwnerInventoryInformationRequest): Observable<OwnerInventoryInformationResponse | null> {
    return this.leadsService.updateOwnerInventoryInformation(body).pipe(catchError(() => of(null)));
  }

  updateOwnerLead(body: LeadOwnerUpdateRequest): Observable<LeadOwnerResponse | null> {
    return this.leadsService.updateOwnerLead(body).pipe(catchError(() => of(null)));
  }

  createOwnerLead(body: LeadOwnerRequest): Observable<LeadOwnerResponse | null> {
    return this.leadsService.createOwnerLead(body).pipe(catchError(() => of(null)));
  }

  createOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse | null> {
    return this.leadsService.createOwnerAgreementInformation(body).pipe(catchError(() => of(null)));
  }

  updateOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse | null> {
    return this.leadsService.updateOwnerAgreementInformation(body).pipe(catchError(() => of(null)));
  }

  getOwnerHtmlByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<OwnerHtmlResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerTemplatesByToken(normalizedToken).pipe(catchError(() => of(null)));
    }

    const resolvedPropertyId = String(propertyId || '').trim();
    if (!resolvedPropertyId || resolvedPropertyId === 'new') {
      return of(null);
    }

    return this.leadsService.getOwnerHtmlByPropertyId(resolvedPropertyId).pipe(catchError(() => of(null)));
  }

  getOwnerHtmlByContextWithFallback(token: string | null | undefined, propertyId: string | null | undefined): Observable<OwnerHtmlResponse> {
    return forkJoin({
      ownerHtml: this.getOwnerHtmlByContext(token, propertyId).pipe(catchError(() => of(null))),
      ownerAgreementAsset: this.loadTemplateAssetHtml('assets/owner-agreement.html').pipe(catchError(() => of(''))),
      directDepositAsset: this.loadTemplateAssetHtml('assets/direct-deposit.html').pipe(catchError(() => of('')))
    }).pipe(
      map(result => {
        const ownerAgreement = String(result.ownerHtml?.ownerAgreement || '').trim();
        const directDeposit = String(result.ownerHtml?.directDeposit || '').trim();
        const resolvedOwnerAgreement = this.resolveOwnerAgreementTemplate(ownerAgreement, result.ownerAgreementAsset);
        const resolvedDirectDeposit = this.resolveDirectDepositTemplate(directDeposit, result.directDepositAsset);
        const ownerAgreementSource = !ownerAgreement ? 'asset-fallback-empty-api' : (resolvedOwnerAgreement === ownerAgreement ? 'api' : 'asset-fallback-structure');
        const directDepositSource = !directDeposit ? 'asset-fallback-empty-api' : (resolvedDirectDeposit === directDeposit ? 'api' : 'asset-fallback-structure');

        if (!ownerAgreement && !directDeposit) {
          return this.createOwnerHtmlFallbackModel(result.ownerAgreementAsset, result.directDepositAsset, propertyId);
        }

        return {
          propertyId: String(result.ownerHtml?.propertyId || propertyId || '').trim(),
          organizationId: String(result.ownerHtml?.organizationId || '').trim(),
          ownerAgreement: resolvedOwnerAgreement,
          directDeposit: resolvedDirectDeposit,
          isDeleted: !!result.ownerHtml?.isDeleted,
          createdOn: String(result.ownerHtml?.createdOn || ''),
          createdBy: String(result.ownerHtml?.createdBy || ''),
          modifiedOn: String(result.ownerHtml?.modifiedOn || ''),
          modifiedBy: String(result.ownerHtml?.modifiedBy || '')
        } as OwnerHtmlResponse;
      })
    );
  }

  getTemplateHtmlByContext(token: string | null | undefined, propertyId: string | null | undefined, templateType: string): Observable<string> {
    const normalizedTemplateType = String(templateType || '').trim().toLowerCase();
    return this.getOwnerHtmlByContextWithFallback(token, propertyId).pipe(
      map(ownerHtml => {
        if (normalizedTemplateType.includes('deposit')) {
          return String(ownerHtml.directDeposit || '').trim();
        }
        return String(ownerHtml.ownerAgreement || '').trim();
      }),
      catchError(() => of(''))
    );
  }

  getPublicOwnerOrganizationByToken(token: string): Observable<OrganizationResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of(null);
    }
    return this.leadsService.getPublicOwnerOrganizationByToken(normalizedToken).pipe(catchError(() => of(null)));
  }

  getOrganizationByContext(token: string | null | undefined): Observable<OrganizationResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      return this.leadsService.getPublicOwnerOrganizationByToken(normalizedToken).pipe(catchError(() => of(null)));
    }
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      return of(cached);
    }
    this.commonService.loadOrganization();
    return this.commonService.getOrganization().pipe(
      filter(org => org !== null),
      take(1),
      catchError(() => of(null))
    );
  }

  getPublicOwnerOfficeByToken(token: string): Observable<OfficeResponse | null> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of(null);
    }
    return this.leadsService.getPublicOwnerOfficeByToken(normalizedToken).pipe(catchError(() => of(null)));
  }

  getPublicOwnerOfficesByToken(token: string): Observable<OfficeResponse[]> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return of([]);
    }
    return this.leadsService.getPublicOwnerOfficesByToken(normalizedToken).pipe(catchError(() => of([])));
  }

  getPublicOwnerStateFormsByToken(token: string, organizationId?: string | null): Observable<StateFormResponse[]> {
    return this.getStateFormsByContext(token, null, organizationId);
  }

  getStateForms(stateCode: string): Observable<StateFormResponse[]> {
    return this.getStateFormsByContext(null, stateCode, null);
  }

  getStateFormsByContext(token: string | null | undefined, stateCode: string | null | undefined, organizationId?: string | null): Observable<StateFormResponse[]> {
    const normalizedToken = this.normalizeToken(token);
    if (normalizedToken) {
      const normalizedOrganizationId = String(organizationId || '').trim();
      return this.leadsService.getPublicOwnerFormStateFormsByToken(normalizedToken, stateCode, normalizedOrganizationId).pipe(catchError(() => of([])));
    }

    const normalizedStateCode = String(stateCode || '').trim().toUpperCase();
    if (normalizedStateCode.length !== 2) {
      return of([]);
    }
    return this.stateFormService.getStateForms(normalizedStateCode).pipe(catchError(() => of([])));
  }

  ensureOfficesLoaded(organizationId: string): Observable<OfficeResponse[]> {
    return this.officeService.ensureOfficesLoaded(organizationId).pipe(catchError(() => of([])));
  }

  loadAllOffices(organizationId: string): Observable<OfficeResponse[]> {
    return this.officeService.loadAllOffices(organizationId).pipe(catchError(() => of([])));
  }

  setOfficesForContext(organizationId: string | null, offices: OfficeResponse[]): void {
    this.officeService.setOfficesForContext(organizationId, offices);
  }

  getAllOfficesValue(): OfficeResponse[] {
    return this.officeService.getAllOfficesValue();
  }

  ensureContactsLoaded(): Observable<ContactResponse[]> {
    return this.contactService.ensureContactsLoaded().pipe(catchError(() => of([])));
  }

  getContacts(): Observable<ContactResponse[]> {
    return this.contactService.getContacts().pipe(catchError(() => of([])));
  }

  refreshContacts(): Observable<ContactResponse[]> {
    return this.contactService.refreshContacts().pipe(catchError(() => of([])));
  }

  getContactByGuid(contactId: string): Observable<ContactResponse | null> {
    const normalizedContactId = String(contactId || '').trim();
    if (!normalizedContactId) {
      return of(null);
    }
    return this.contactService.getContactByGuid(normalizedContactId).pipe(catchError(() => of(null)));
  }

  updateContact(contact: ContactRequest): Observable<ContactResponse | null> {
    return this.contactService.updateContact(contact).pipe(catchError(() => of(null)));
  }

  deleteContact(contactId: string): Observable<void> {
    const normalizedContactId = String(contactId || '').trim();
    if (!normalizedContactId) {
      return of(void 0);
    }
    return this.contactService.deleteContact(normalizedContactId).pipe(catchError(() => of(void 0)));
  }

  getPropertiesByOwner(ownerId: string): Observable<PropertyListResponse[]> {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) {
      return of([]);
    }
    return this.propertyService.getPropertiesByOwner(normalizedOwnerId).pipe(catchError(() => of([])));
  }

  ensureAccountingOfficesLoaded(): Observable<AccountingOfficeResponse[]> {
    return this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(catchError(() => of([])));
  }

  getAllAccountingOfficesValue(): AccountingOfficeResponse[] {
    return this.accountingOfficeService.getAllAccountingOfficesValue();
  }

  emptyPublicOwnerAgreementContext(): PublicOwnerAgreementContext {
    return {
      organization: null,
      office: null,
      contact: null,
      publicForm: null,
      owner: null,
      property: null,
      propertyAgreement: null,
      agreementInfo: null,
      accountingOffice: null
    };
  }

  private loadTemplateAssetHtml(path: string): Observable<string> {
    return this.http.get(path, { responseType: 'text' }).pipe(catchError(() => of('')));
  }

  private createOwnerHtmlFallbackModel(ownerAgreementHtml: string, directDepositHtml: string, propertyId: string | null | undefined): OwnerHtmlResponse {
    return {
      propertyId: String(propertyId || '').trim(),
      organizationId: '',
      ownerAgreement: String(ownerAgreementHtml || ''),
      directDeposit: String(directDepositHtml || ''),
      isDeleted: false,
      createdOn: '',
      createdBy: '',
      modifiedOn: '',
      modifiedBy: ''
    };
  }

  private resolveOwnerAgreementTemplate(apiTemplate: string, assetTemplate: string): string {
    const normalizedApiTemplate = String(apiTemplate || '').trim();
    if (!normalizedApiTemplate) {
      return String(assetTemplate || '');
    }

    const hasTemplateStyles = /<style[\s>]/i.test(normalizedApiTemplate);
    const hasAgreementScaffold = /id=["']terms["']/i.test(normalizedApiTemplate) || /class=["']section-text["']/i.test(normalizedApiTemplate);
    if (hasTemplateStyles && hasAgreementScaffold) {
      return normalizedApiTemplate;
    }

    return String(assetTemplate || normalizedApiTemplate);
  }

  private resolveDirectDepositTemplate(apiTemplate: string, assetTemplate: string): string {
    const normalizedApiTemplate = String(apiTemplate || '').trim();
    if (!normalizedApiTemplate) {
      return String(assetTemplate || '');
    }

    const hasTemplateStyles = /<style[\s>]/i.test(normalizedApiTemplate);
    const hasDirectDepositMarkers =
      /Direct Deposit Authorization\/Agreement/i.test(normalizedApiTemplate) &&
      /\{\{ownerName\}\}/.test(normalizedApiTemplate) &&
      /\{\{officeLogoBase64\}\}/.test(normalizedApiTemplate);

    if (hasTemplateStyles && hasDirectDepositMarkers) {
      return normalizedApiTemplate;
    }

    return String(assetTemplate || normalizedApiTemplate);
  }
}
