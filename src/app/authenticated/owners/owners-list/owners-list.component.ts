import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, input } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { ContactListComponent } from '../../contacts/contact-list/contact-list.component';
import { EntityType } from '../../contacts/models/contact-enum';
import { OwnerComponent } from '../../leads/owner/owner.component';
import { OwnerEditSelection } from '../../leads/models/lead-owner.model';
import { OwnersService } from '../services/owners.service';

@Component({
  standalone: true,
  selector: 'app-owners-list',
  imports: [CommonModule, MaterialModule, ContactListComponent, OwnerComponent, ContactComponent],
  templateUrl: './owners-list.component.html',
  styleUrl: './owners-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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
    private ownersService: OwnersService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

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

    this.ownersService.createOwnerLeadFromContactByContext(contactId).pipe(take(1)).subscribe({
      next: result => {
        if (!result) {
          void this.router.navigateByUrl(RouterUrl.OwnerShell);
          return;
        }
        const contactOfficeId = Number(result.contact.officeId);
        if (Number.isFinite(contactOfficeId) && contactOfficeId > 0) {
          void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${result.createdLead.ownerId}&officeId=${contactOfficeId}`);
          return;
        }
        void this.router.navigateByUrl(`${RouterUrl.OwnerShell}?leadOwnerId=${result.createdLead.ownerId}`);
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to create owner lead from contact.', CommonMessage.Error);
        void this.router.navigateByUrl(RouterUrl.OwnerShell);
        this.markViewForCheck();
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

  //#endregion
}
