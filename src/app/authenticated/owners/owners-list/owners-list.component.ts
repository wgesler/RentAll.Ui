import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ContactListComponent } from '../../contacts/contact-list/contact-list.component';
import { EntityType } from '../../contacts/models/contact-enum';
import { OwnersService } from '../services/owners.service';

@Component({
  standalone: true,
  selector: 'app-owners-list',
  imports: [CommonModule, MaterialModule, ContactListComponent],
  templateUrl: './owners-list.component.html',
  styleUrl: './owners-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnersListComponent {

  officeId = input<number | null>(null);
  private router = inject(Router);
  private ownersService = inject(OwnersService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  ownerEntityTypeId = EntityType.Owner;
  showInactiveOwnerContacts = false;

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  //#region Owners-List
  onOwnerContactsShowInactiveChange(showInactive: boolean): void {
    this.showInactiveOwnerContacts = showInactive;
  }

  onOpenOwnerContact(event: { contactId: string; copyFrom?: string; entityTypeId?: number; ownerLeadId?: number | null; officeId?: number | null }): void {
    const ownerLeadId = Number(event?.ownerLeadId);
    const officeId = Number(event?.officeId);
    const contactId = String(event?.contactId || '').trim();

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
  //#endregion
}
