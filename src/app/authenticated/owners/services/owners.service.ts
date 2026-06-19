import { Injectable } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, filter, map, switchMap, take } from 'rxjs/operators';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { LeadOwnerResponse, LeadOwnerUpdateRequest } from '../../leads/models/lead-owner.model';
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
import { PropertyRequest, PropertyResponse } from '../../properties/models/property.model';
import { PropertyInformationResponse } from '../../properties/models/property-information.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { PropertyInformationService } from '../../properties/services/property-information.service';
import { OwnerAgreementInformationResponse } from '../models/owner-agreement-information.model';
import { OwnerAgreementInformationRequest } from '../models/owner-agreement-information.model';
import { OwnerHtmlResponse } from '../models/owner-html.model';
import { CommonService } from '../../../services/common.service';
import { MappingService } from '../../../services/mapping.service';

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

export type OwnerLeadFromContactContextResult = {
  contact: ContactResponse;
  createdLead: LeadOwnerResponse;
};

/**
 * The full set of data an owner-agreement document needs to render. Resolved once per owner/property
 * selection so every form tab (Agreement, Deposit, state forms) can share it instead of re-fetching.
 */
export type OwnerAgreementContext = {
  organization: OrganizationResponse | null;
  offices: OfficeResponse[];
  accountingOffices: AccountingOfficeResponse[];
  ownerContact: ContactResponse | null;
  leadOwner: LeadOwnerResponse | null;
  property: PropertyResponse | null;
  propertyAgreement: PropertyAgreementResponse | null;
  agreementInformation: OwnerAgreementInformationResponse | null;
};

@Injectable({
  providedIn: 'root'
})
export class OwnersService {
  constructor(
    private leadsService: LeadsService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private propertyInformationService: PropertyInformationService,
    private propertyAgreementService: PropertyAgreementService,
    private officeService: OfficeService,
    private stateFormService: StateFormService,
    private accountingOfficeService: AccountingOfficeService,
    private commonService: CommonService,
    private documentService: DocumentService,
    private mappingService: MappingService
  ) {}

  //#region GET
  getOwnerByContext(token: string | null | undefined, ownerLeadId: number | null | undefined): Observable<LeadOwnerResponse | null> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerLeadByToken(token!)
      : this.leadsService.getOwnerLeadById(ownerLeadId!);
  }

  getOwnerContactByContext(token: string | null | undefined, ownerLeadId: number | null | undefined): Observable<ContactResponse | null> {
    if (this.isPublicTokenMode(token)) {
      return this.leadsService.getPublicOwnerContactByToken(token!);
    }
    return this.contactService.getContacts().pipe(
      map(contacts =>
        (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) && Number(contact.ownerLeadId) === Number(ownerLeadId)
        ) || null
      )
    );
  }

  getOwnerContactsByContext(): Observable<ContactResponse[]> {
    return this.contactService.ensureContactsLoaded();
  }

  getPropertyByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<PropertyResponse | null> {
    const normalizedPropertyId = String(propertyId || '').trim();
    if (this.isPublicTokenMode(token)) {
      if (normalizedPropertyId && normalizedPropertyId !== 'new') {
        return this.leadsService.getPublicOwnerPropertyByIdAndToken(token!, normalizedPropertyId);
      }
      return this.leadsService.getPublicOwnerPropertyByToken(token!);
    }
    if (!normalizedPropertyId || normalizedPropertyId === 'new') {
      return of(null);
    }
    return this.propertyService.getPropertyByGuid(normalizedPropertyId);
  }

  getOwnerPropertiesByContext(token: string | null | undefined, ownerContactId: string | null | undefined): Observable<PropertyListResponse[]> {
    if (this.isPublicTokenMode(token)) {
      return this.leadsService.getPublicOwnerPropertiesByToken(token!);
    }
    const normalizedOwnerId = String(ownerContactId || '').trim();
    if (!normalizedOwnerId) {
      return of([]);
    }
    return this.propertyService.getPropertiesByOwner(normalizedOwnerId);
  }

  getPropertyInformationByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<PropertyInformationResponse | null> {
    const normalizedPropertyId = String(propertyId || '').trim();
    if (this.isPublicTokenMode(token)) {
      if (normalizedPropertyId && normalizedPropertyId !== 'new') {
        return this.leadsService.getPublicOwnerPropertyInformationByIdAndToken(token!, normalizedPropertyId);
      }
      return this.leadsService.getPublicOwnerPropertyInformationByToken(token!);
    }
    if (!normalizedPropertyId || normalizedPropertyId === 'new') {
      return of(null);
    }
    return this.propertyInformationService.getPropertyInformationByGuid(normalizedPropertyId);
  }

  getPropertyAgreementByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<PropertyAgreementResponse | null> {
    if (this.isPublicTokenMode(token)) {
      return this.leadsService.getPublicOwnerPropertyAgreementByToken(token!);
    }
    if (!propertyId || propertyId === 'new') {
      return of(null);
    }
    return this.propertyAgreementService.getPropertyAgreement(propertyId);
  }

  getAgreementInformationByContext(token: string | null | undefined, officeId: number | null | undefined, propertyId: string | null | undefined): Observable<OwnerAgreementInformationResponse | null> {
    if (this.isPublicTokenMode(token)) {
      return this.leadsService.getPublicOwnerAgreementInformationByToken(token!);
    }
    const scopedPropertyId = propertyId && propertyId !== 'new' ? propertyId : null;
    return this.leadsService.getOwnerAgreementInformationByScope(officeId ?? null, scopedPropertyId);
  }

  getOwnerFormByContext(token: string | null | undefined): Observable<PublicOwnerFormResponse | null> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerFormByToken(token!)
      : of(null);
  }

  getPublicAgreementContext(token: string): Observable<PublicOwnerAgreementContext> {
    return forkJoin({
      organization: this.leadsService.getPublicOwnerOrganizationByToken(token).pipe(catchError(() => of(null))),
      office: this.leadsService.getPublicOwnerOfficeByToken(token).pipe(catchError(() => of(null))),
      contact: this.leadsService.getPublicOwnerContactByToken(token).pipe(catchError(() => of(null))),
      publicForm: this.leadsService.getPublicOwnerFormByToken(token).pipe(catchError(() => of(null))),
      owner: this.leadsService.getPublicOwnerLeadByToken(token).pipe(catchError(() => of(null))),
      property: this.leadsService.getPublicOwnerPropertyByToken(token).pipe(catchError(() => of(null))),
      propertyAgreement: this.leadsService.getPublicOwnerPropertyAgreementByToken(token).pipe(catchError(() => of(null))),
      agreementInfo: this.leadsService.getPublicOwnerAgreementInformationByToken(token).pipe(catchError(() => of(null))),
      accountingOffice: this.leadsService.getPublicOwnerAccountingOfficeByToken(token).pipe(catchError(() => of(null)))
    });
  }

  /**
   * Resolves the entire owner-agreement context (organization, offices, accounting offices, owner
   * contact, lead owner, property, property agreement, agreement information) in a single call so the
   * owner-shell can load it once (lazily, shareReplay) and feed every form tab. Public/token mode is
   * served by the single public-context endpoint; internal mode fans out to the per-entity calls.
   */
  getOwnerAgreementContextByContext(
    token: string | null | undefined,
    ownerLeadId: number | null | undefined,
    propertyId: string | null | undefined,
    officeId: number | null | undefined
  ): Observable<OwnerAgreementContext> {
    if (this.isPublicTokenMode(token)) {
      const scopedPropertyId = propertyId && propertyId !== 'new' ? propertyId : null;
      return forkJoin({
        organization: this.leadsService.getPublicOwnerOrganizationByToken(token!).pipe(catchError(() => of(null))),
        office: this.leadsService.getPublicOwnerOfficeByToken(token!).pipe(catchError(() => of(null))),
        contact: this.leadsService.getPublicOwnerContactByToken(token!).pipe(catchError(() => of(null))),
        publicForm: this.leadsService.getPublicOwnerFormByToken(token!).pipe(catchError(() => of(null))),
        owner: this.leadsService.getPublicOwnerLeadByToken(token!).pipe(catchError(() => of(null))),
        property: this.getPropertyByContext(token, scopedPropertyId).pipe(catchError(() => of(null))),
        propertyAgreement: this.getPropertyAgreementByContext(token, scopedPropertyId).pipe(catchError(() => of(null))),
        agreementInfo: this.getAgreementInformationByContext(token, officeId, scopedPropertyId).pipe(catchError(() => of(null))),
        accountingOffice: this.leadsService.getPublicOwnerAccountingOfficeByToken(token!).pipe(catchError(() => of(null)))
      }).pipe(
        map(context => ({
          organization: context.organization,
          offices: context.office ? [context.office] : [],
          accountingOffices: context.accountingOffice ? [context.accountingOffice] : [],
          ownerContact: context.contact || this.mappingService.mapPublicOwnerContact(context.publicForm?.form),
          leadOwner: context.owner,
          property: context.property,
          propertyAgreement: context.propertyAgreement,
          agreementInformation: context.agreementInfo
        }))
      );
    }

    return this.getOrganizationByContext(null).pipe(
      catchError(() => of(null)),
      switchMap(organization =>
        forkJoin({
          offices: this.getOfficeListByContext(null, organization?.organizationId).pipe(catchError(() => of([] as OfficeResponse[]))),
          ownerContact: this.getOwnerContactsByContext().pipe(
            map(contacts => (contacts || []).find(contact =>
              Number(contact.entityTypeId) === Number(EntityType.Owner) && Number(contact.ownerLeadId) === Number(ownerLeadId)
            ) || null),
            catchError(() => of(null))
          ),
          leadOwner: this.getOwnerByContext(null, ownerLeadId).pipe(catchError(() => of(null))),
          property: this.getPropertyByContext(null, propertyId).pipe(catchError(() => of(null))),
          propertyAgreement: this.getPropertyAgreementByContext(null, propertyId).pipe(catchError(() => of(null))),
          accountingOffices: this.getAccountingOfficesByContext().pipe(catchError(() => of([] as AccountingOfficeResponse[]))),
          agreementInformation: this.getAgreementInformationByContext(null, officeId, propertyId).pipe(catchError(() => of(null)))
        }).pipe(
          map(parts => ({
            organization,
            offices: parts.offices,
            accountingOffices: parts.accountingOffices,
            ownerContact: parts.ownerContact,
            leadOwner: parts.leadOwner,
            property: parts.property,
            propertyAgreement: parts.propertyAgreement,
            agreementInformation: parts.agreementInformation
          }))
        )
      )
    );
  }

  getOrganizationByContext(token: string | null | undefined): Observable<OrganizationResponse | null> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerOrganizationByToken(token!)
      : this.commonService.getOrganization().pipe(filter(org => org !== null), take(1));
  }

  getStateFormsByContext(token: string | null | undefined, stateCode: string | null | undefined, organizationId?: string | null): Observable<StateFormResponse[]> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerFormStateFormsByToken(token!, stateCode, organizationId)
      : this.stateFormService.getStateForms(stateCode!);
  }

  getOfficeListByContext(token: string | null | undefined, organizationId: string | null | undefined): Observable<OfficeResponse[]> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerOfficeByToken(token!).pipe(map(office => (office ? [office] : [])))
      : this.officeService.ensureOfficesLoaded(String(organizationId || '').trim());
  }

  /** Live office stream for internal use: ensures the org offices are loaded, then emits on every cache update. Public/token context emits the single owner office once. */
  getOfficeListStreamByContext(token: string | null | undefined, organizationId: string | null | undefined): Observable<OfficeResponse[]> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.getPublicOwnerOfficeByToken(token!).pipe(map(office => (office ? [office] : [])))
      : this.officeService.ensureOfficesLoaded(String(organizationId || '').trim()).pipe(switchMap(() => this.officeService.getAllOffices()));
  }

  getOfficeListSnapshotByContext(): OfficeResponse[] {
    return this.officeService.getAllOfficesValue();
  }

  getAccountingOfficesByContext(): Observable<AccountingOfficeResponse[]> {
    return this.accountingOfficeService.ensureAccountingOfficesLoaded();
  }

  getOwnerHtmlByContext(token: string | null | undefined, propertyId: string | null | undefined): Observable<OwnerHtmlResponse | null> {
    if (this.isPublicTokenMode(token)) {
      return this.leadsService.getPublicOwnerTemplatesByToken(token!);
    }
    if (!propertyId || propertyId === 'new') {
      return of(null);
    }
    return this.leadsService.getOwnerHtmlByPropertyId(propertyId);
  }

  getTemplateHtmlByContext(token: string | null | undefined, propertyId: string | null | undefined, templateType: string): Observable<string> {
    const normalizedTemplateType = String(templateType || '').trim().toLowerCase();
    return this.getOwnerHtmlByContext(token, propertyId).pipe(
      map(ownerHtml => normalizedTemplateType.includes('deposit')
        ? String(ownerHtml?.directDeposit || '').trim()
        : String(ownerHtml?.ownerAgreement || '').trim())
    );
  }
  //#endregion

  //#region POST
  submitOwnerFormByContext(token: string | null | undefined, body: PublicOwnerFormSubmitRequest): Observable<PublicOwnerFormResponse | null> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.submitPublicOwnerFormByToken(token!, body)
      : of(null);
  }

  createOwnerLeadFromContactByContext(contactId: string | null | undefined): Observable<OwnerLeadFromContactContextResult | null> {
    const normalizedContactId = String(contactId || '').trim();
    if (!normalizedContactId) {
      return of(null);
    }

    return this.contactService.getContactByGuid(normalizedContactId).pipe(
      switchMap(contact => {
        if (!contact) {
          return of(null);
        }
        return this.leadsService.createOwnerLead(this.mappingService.mapContactToOwnerLeadRequest(contact)).pipe(
          switchMap(createdLead => {
            if (!createdLead) {
              return of(null);
            }
            return this.contactService.updateContact(this.mappingService.mapContactToOwnerLeadLinkRequest(contact, createdLead.ownerId)).pipe(
              switchMap(() => this.contactService.refreshContacts().pipe(catchError(() => of([])), map(() => ({ contact, createdLead }))))
            );
          })
        );
      })
    );
  }

  createAgreementInformationByContext(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse | null> {
    return this.leadsService.createOwnerAgreementInformation(body);
  }

  generateDocumentDownloadByContext(token: string | null | undefined, dto: GenerateDocumentFromHtmlDto): Observable<Blob> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.generatePublicOwnerDocumentDownloadByToken(token!, { htmlContent: dto.htmlContent, fileName: dto.fileName })
      : this.documentService.generateDownload(dto);
  }

  /** Save (generate + persist) is internal-only. External token users are not permitted to save documents. */
  saveGeneratedDocumentByContext(token: string | null | undefined, dto: GenerateDocumentFromHtmlDto): Observable<DocumentResponse> {
    if (this.isPublicTokenMode(token)) {
      return throwError(() => new Error('Saving documents is not supported for external users.'));
    }
    return this.documentService.generate(dto);
  }
  //#endregion

  //#region PUT
  updateOwnerByContext(body: LeadOwnerUpdateRequest): Observable<LeadOwnerResponse | null> {
    return this.leadsService.updateOwnerLead(body);
  }

  updateAgreementInformationByContext(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse | null> {
    return this.leadsService.updateOwnerAgreementInformation(body);
  }

  updatePropertyInformationByContext(body: OwnerInventoryInformationRequest): Observable<OwnerInventoryInformationResponse | null> {
    return this.leadsService.updateOwnerInventoryInformation(body);
  }

  /** Property upsert through the owner-form flow is external-only; internal property CRUD is handled directly by the property component. */
  upsertPropertyByContext(token: string | null | undefined, body: PropertyRequest): Observable<PropertyResponse | null> {
    return this.isPublicTokenMode(token)
      ? this.leadsService.upsertPublicOwnerPropertyByToken(token!, body)
      : of(null);
  }
  //#endregion

  //#region DELETE
  deleteOwnerContactByContext(contactId: string | null | undefined): Observable<void> {
    const normalizedContactId = String(contactId || '').trim();
    if (!normalizedContactId) {
      return of(void 0);
    }
    return this.contactService.deleteContact(normalizedContactId);
  }
  //#endregion

  //#region Helpers
  isPublicTokenMode(token: string | null | undefined): boolean {
    return this.normalizeToken(token).length > 0;
  }

  normalizeToken(token: string | null | undefined): string {
    return String(token || '').trim();
  }
  //#endregion
}
