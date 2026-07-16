import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { UserGroupInput, getUserGroupNumbers } from '../../shared/access/role-access';
import { UserGroups } from '../../users/models/user-enums';
import { PostingStatus, getPostingStatusLabel, isJournalEntryHardClosed, isJournalEntryPosted, isJournalEntrySoftClosed } from '../models/accounting-enum';

export type JournalEntrySourceDocumentLabel = 'Invoice' | 'Receipt' | 'Work Order' | 'Deposit' | 'Transfer';

@Injectable({
  providedIn: 'root'
})
export class JournalEntryService {
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

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
    const statusLabel = getPostingStatusLabel(postingStatusId) || 'Posted';
    return `This ${documentLabel} has been ${statusLabel} and we are unable to edit this ${documentLabel}.`;
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

  private hasAnyRole(userGroups: UserGroupInput, roles: UserGroups[]): boolean {
    const groupNumbers = getUserGroupNumbers(userGroups);
    return roles.some(role => groupNumbers.includes(role));
  }
}
