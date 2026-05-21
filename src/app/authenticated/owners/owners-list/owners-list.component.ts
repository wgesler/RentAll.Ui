import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { switchMap, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MappingService } from '../../../services/mapping.service';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { ContactListComponent } from '../../contacts/contact-list/contact-list.component';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactRequest, ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { LeadStateType } from '../../leads/models/lead-enums';
import { LeadOwnerRequest } from '../../leads/models/lead-owner.model';
import { OwnerComponent } from '../../leads/owner/owner.component';
import { OwnerEditSelection } from '../../leads/owner-list/owner-list.component';
import { OwnerListComponent } from '../../leads/owner-list/owner-list.component';
import { LeadsService } from '../../leads/services/leads.service';

@Component({
  standalone: true,
  selector: 'app-owners-list',
  imports: [CommonModule, MaterialModule, OwnerListComponent, ContactListComponent, OwnerComponent, ContactComponent],
  templateUrl: './owners-list.component.html',
  styleUrl: './owners-list.component.scss'
})
export class OwnersListComponent {
  officeId = input<number | null>(null);
  ownerEntityTypeId = EntityType.Owner;
  showInactiveOwnerContacts = false;
  showOwnerLeadForm = false;
  ownerLeadFormId: string | null = null;
  showOwnerContactForm = false;
  ownerContactId = 'new';
  ownerContactCopyFrom: string | null = null;

  constructor(
    private router: Router,
    private contactService: ContactService,
    private leadsService: LeadsService,
    private mappingService: MappingService,
    private toastr: ToastrService
  ) {}

  //#region Owners-List
  onAddOwnerLead(): void {
    this.showOwnerContactForm = false;
    this.ownerContactId = 'new';
    this.ownerContactCopyFrom = null;
    this.ownerLeadFormId = 'new';
    this.showOwnerLeadForm = true;
  }

  onEditOwnerLead(ownerSelection: number | OwnerEditSelection): void {
    const ownerLeadId = typeof ownerSelection === 'number' ? ownerSelection : ownerSelection?.ownerId;
    const officeId = typeof ownerSelection === 'number' ? null : ownerSelection?.officeId ?? null;
    if (!ownerLeadId) {
      return;
    }
    this.showOwnerContactForm = false;
    this.ownerContactId = 'new';
    this.ownerContactCopyFrom = null;
    this.showOwnerLeadForm = false;
    this.ownerLeadFormId = null;
    const officeQuery = Number(officeId);
    if (Number.isFinite(officeQuery) && officeQuery > 0) {
      void this.router.navigateByUrl(`${RouterUrl.Leads}?tab=owner&leadOwnerId=${ownerLeadId}&officeId=${officeQuery}`);
      return;
    }
    void this.router.navigateByUrl(`${RouterUrl.Leads}?tab=owner&leadOwnerId=${ownerLeadId}`);
  }

  onOwnerContactsShowInactiveChange(showInactive: boolean): void {
    this.showInactiveOwnerContacts = showInactive;
  }

  onOpenOwnerContact(event: { contactId: string; copyFrom?: string; entityTypeId?: number; ownerLeadId?: number | null; officeId?: number | null }): void {
    const ownerLeadId = Number(event?.ownerLeadId);
    const officeId = Number(event?.officeId);
    const contactId = String(event?.contactId || '').trim();
    this.showOwnerLeadForm = false;
    this.ownerLeadFormId = null;
    this.showOwnerContactForm = false;
    this.ownerContactId = 'new';
    this.ownerContactCopyFrom = null;

    if (Number.isFinite(ownerLeadId) && ownerLeadId > 0) {
      if (Number.isFinite(officeId) && officeId > 0) {
        void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${ownerLeadId}&officeId=${officeId}`);
        return;
      }
      void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${ownerLeadId}`);
      return;
    }

    if (!contactId) {
      void this.router.navigateByUrl(RouterUrl.OwnerShell);
      return;
    }

    this.contactService.getContactByGuid(contactId).pipe(
      take(1),
      switchMap(contact => this.leadsService.createOwnerLead(this.buildOwnerLeadCreateRequestFromContact(contact)).pipe(
        take(1),
        switchMap(createdLead => this.contactService.updateContact(this.buildContactUpdateRequestWithOwnerLeadId(contact, createdLead.ownerId)).pipe(
          take(1),
          switchMap(() => this.contactService.refreshContacts().pipe(take(1))),
          switchMap(() => {
            const contactOfficeId = Number(contact.officeId);
            if (Number.isFinite(contactOfficeId) && contactOfficeId > 0) {
              return this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${createdLead.ownerId}&officeId=${contactOfficeId}`);
            }
            return this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${createdLead.ownerId}`);
          })
        ))
      ))
    ).subscribe({
      next: () => {},
      error: () => {
        this.toastr.error('Unable to create owner lead from contact.', CommonMessage.Error);
        void this.router.navigateByUrl(RouterUrl.OwnerShell);
      }
    });
  }

  onOwnerLeadFormClosed(): void {
    this.showOwnerLeadForm = false;
    this.ownerLeadFormId = null;
  }

  onOwnerContactFormClosed(): void {
    this.showOwnerContactForm = false;
    this.ownerContactId = 'new';
    this.ownerContactCopyFrom = null;
  }

  buildOwnerLeadCreateRequestFromContact(contact: ContactResponse): LeadOwnerRequest {
    return {
      officeId: Number(contact.officeId),
      leadStateId: LeadStateType.New,
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
      emailPhoneConsent: false,
      smsConsent: false,
      isActive: false
    };
  }

  buildContactUpdateRequestWithOwnerLeadId(contact: ContactResponse, ownerLeadId: number): ContactRequest {
    const { fullName: _fullName, officeName: _officeName, ...requestBase } = contact;
    return {
      ...requestBase,
      officeAccess: this.mappingService.normalizeOfficeAccessNumbers(contact.officeAccess),
      ownerLeadId
    };
  }
  //#endregion
}
