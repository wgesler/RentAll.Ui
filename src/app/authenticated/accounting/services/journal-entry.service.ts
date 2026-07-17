import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Observable, map, of } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { UserGroupInput, getUserGroupNumbers } from '../../shared/access/role-access';
import { PasswordCheckDialogService } from '../../shared/modals/password-check-dialog/password-check-dialog.service';
import { UserGroups } from '../../users/models/user-enums';
import { PostingStatus, getPostingStatusLabel, isJournalEntryHardClosed, isJournalEntryPosted, isJournalEntrySoftClosed } from '../models/accounting-enum';

export type JournalEntrySourceDocumentLabel = 'Invoice' | 'Receipt' | 'Work Order' | 'Deposit' | 'Transfer';

@Injectable({
  providedIn: 'root'
})
export class JournalEntryService {
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private passwordCheckDialogService = inject(PasswordCheckDialogService);

  canUpdateJournalEntry(
    postingStatusId: number | null | undefined,
    userGroups?: UserGroupInput
  ): boolean {
    const groups = userGroups ?? this.authService.getUser()?.userGroups;

    if (postingStatusId == null || postingStatusId === PostingStatus.Open) {
      return true;
    }

    if (isJournalEntryPosted(postingStatusId)) {
      return this.hasAnyRole(groups, [
        UserGroups.SuperAdmin,
        UserGroups.Admin,
        UserGroups.OwnerAdmin,
        UserGroups.AccountingAdmin,
        UserGroups.Accounting
      ]);
    }

    if (isJournalEntrySoftClosed(postingStatusId)) {
      return this.hasAnyRole(groups, [UserGroups.SuperAdmin, UserGroups.Admin, UserGroups.OwnerAdmin]);
    }

    if (isJournalEntryHardClosed(postingStatusId)) {
      return false;
    }

    return true;
  }

  getUpdateBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined
  ): string {
    const documentName = documentLabel.toLowerCase();

    if (isJournalEntryPosted(postingStatusId)) {
      return `This ${documentName} has already been posted and can only be edited by an Accountant or an Administrator.`;
    }

    if (isJournalEntrySoftClosed(postingStatusId)) {
      return `This ${documentName} has been soft-closed and can only be edited by an Administrator.`;
    }

    if (isJournalEntryHardClosed(postingStatusId)) {
      return `This ${documentName} has been hard-closed and may not be edited.`;
    }

    const statusLabel = getPostingStatusLabel(postingStatusId) || 'Posted';
    return `This ${documentName} has been ${statusLabel.toLowerCase()} and we are unable to edit this ${documentName}.`;
  }

  guardCanUpdateJournalEntry(
    postingStatusId: number | null | undefined,
    documentLabel: JournalEntrySourceDocumentLabel
  ): boolean {
    if (this.canUpdateJournalEntry(postingStatusId)) {
      return true;
    }

    this.toastr.error(this.getUpdateBlockedMessage(documentLabel, postingStatusId), CommonMessage.Error);
    return false;
  }

  confirmUpdateIfAllowed(
    postingStatusId: number | null | undefined,
    documentLabel: JournalEntrySourceDocumentLabel
  ): Observable<boolean> {
    if (!this.canUpdateJournalEntry(postingStatusId)) {
      this.toastr.error(this.getUpdateBlockedMessage(documentLabel, postingStatusId), CommonMessage.Error);
      return of(false);
    }

    if (postingStatusId == null || postingStatusId === PostingStatus.Open) {
      return of(true);
    }

    const statusLabel = getPostingStatusLabel(postingStatusId) || 'Posted';
    return this.passwordCheckDialogService.confirm({
      message: `This ${documentLabel} has been ${statusLabel}.`,
      hint: `Enter your password to save changes to this ${documentLabel.toLowerCase()}.`
    }).pipe(map(password => !!password));
  }

  hasAnyRole(userGroups: UserGroupInput, roles: UserGroups[]): boolean {
    const groupNumbers = getUserGroupNumbers(userGroups);
    return roles.some(role => groupNumbers.includes(role));
  }
}
