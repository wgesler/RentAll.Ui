import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Observable, map, of } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { UserGroupInput, getUserGroupNumbers } from '../../shared/access/role-access';
import { PasswordCheckDialogService } from '../../shared/modals/password-check-dialog/password-check-dialog.service';
import { UserGroups } from '../../users/models/user-enums';
import {
  PostingStatus,
  getPostingStatusLabel,
  isJournalEntryHardClosed,
  isJournalEntryPosted,
  isJournalEntrySoftClosed,
  isManualJournalEntry
} from '../models/accounting-enum';

export type JournalEntrySourceDocumentLabel =
  | 'Invoice'
  | 'Receipt'
  | 'Work Order'
  | 'Deposit'
  | 'Transfer'
  | 'Journal Entry';

const POSTED_JOURNAL_ENTRY_EDIT_ROLES: UserGroups[] = [
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.OfficeAdmin,
  UserGroups.AccountingAdmin,
  UserGroups.Accounting
];

const SOFT_CLOSED_JOURNAL_ENTRY_EDIT_ROLES: UserGroups[] = [
  UserGroups.SuperAdmin,
  UserGroups.Admin,
  UserGroups.OfficeAdmin
];

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
      return this.hasAnyRole(groups, POSTED_JOURNAL_ENTRY_EDIT_ROLES);
    }

    if (isJournalEntrySoftClosed(postingStatusId)) {
      return this.hasAnyRole(groups, SOFT_CLOSED_JOURNAL_ENTRY_EDIT_ROLES);
    }

    if (isJournalEntryHardClosed(postingStatusId)) {
      return false;
    }

    return true;
  }

  strictestPostingStatus(
    postingStatusIds: Array<number | null | undefined>
  ): number {
    if (!postingStatusIds.length) {
      return PostingStatus.Open;
    }

    return postingStatusIds.reduce((strictest, postingStatusId) => {
      const status = Number(postingStatusId ?? PostingStatus.Open);
      return status > strictest ? status : strictest;
    }, PostingStatus.Open);
  }

  canDeleteApplicationObject(
    postingStatusId: number | null | undefined,
    userGroups?: UserGroupInput
  ): boolean {
    const status = Number(postingStatusId ?? PostingStatus.Open);
    if (status === PostingStatus.Open) {
      return true;
    }

    if (isJournalEntryPosted(status)) {
      return false;
    }

    if (isJournalEntrySoftClosed(status)) {
      const groups = userGroups ?? this.authService.getUser()?.userGroups;
      return this.hasAnyRole(groups, SOFT_CLOSED_JOURNAL_ENTRY_EDIT_ROLES);
    }

    return false;
  }

  canDeleteManualJournalEntry(
    sourceTypeId: number | undefined | null,
    journalEntryKindId: number | undefined | null,
    postingStatusId: number | null | undefined,
    userGroups?: UserGroupInput
  ): boolean {
    if (!isManualJournalEntry(sourceTypeId, journalEntryKindId)) {
      return false;
    }

    const status = Number(postingStatusId ?? PostingStatus.Open);
    if (status === PostingStatus.Open) {
      return true;
    }

    if (isJournalEntrySoftClosed(status)) {
      const groups = userGroups ?? this.authService.getUser()?.userGroups;
      return this.hasAnyRole(groups, SOFT_CLOSED_JOURNAL_ENTRY_EDIT_ROLES);
    }

    return false;
  }

  getUpdateBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined
  ): string {
    return this.getMutationBlockedMessage(documentLabel, postingStatusId, 'edit');
  }

  getDeleteBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined
  ): string {
    return this.getMutationBlockedMessage(documentLabel, postingStatusId, 'delete');
  }

  private getMutationBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined,
    action: 'edit' | 'delete'
  ): string {
    const documentName = documentLabel.toLowerCase();

    if (isJournalEntryPosted(postingStatusId)) {
      if (action === 'delete') {
        return `This ${documentName} has already been posted and may not be deleted.`;
      }

      return `This ${documentName} has already been posted and can only be edited by an Accountant or an Administrator.`;
    }

    if (isJournalEntrySoftClosed(postingStatusId)) {
      if (action === 'delete') {
        return `This ${documentName} has been soft-closed and can only be deleted by an Administrator.`;
      }

      return `This ${documentName} has been soft-closed and can only be edited by an Administrator.`;
    }

    if (isJournalEntryHardClosed(postingStatusId)) {
      return `This ${documentName} has been hard-closed and may not be ${action === 'delete' ? 'deleted' : 'edited'}.`;
    }

    const statusLabel = getPostingStatusLabel(postingStatusId) || 'Posted';
    return `This ${documentName} has been ${statusLabel.toLowerCase()} and we are unable to ${action} this ${documentName}.`;
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
    return this.confirmMutationIfAllowed(
      postingStatusId,
      documentLabel,
      'save changes to',
      postingStatus => this.canUpdateJournalEntry(postingStatus),
      (label, status) => this.getUpdateBlockedMessage(label, status)
    );
  }

  confirmDeleteIfAllowed(
    postingStatusId: number | null | undefined,
    documentLabel: JournalEntrySourceDocumentLabel
  ): Observable<boolean> {
    return this.confirmMutationIfAllowed(
      postingStatusId,
      documentLabel,
      'delete',
      postingStatus => this.canDeleteApplicationObject(postingStatus),
      (label, status) => this.getDeleteBlockedMessage(label, status)
    );
  }

  confirmPaymentIfAllowed(
    postingStatusIds: Array<number | null | undefined>,
    documentLabel: JournalEntrySourceDocumentLabel
  ): Observable<boolean> {
    const postingStatusId = this.strictestPostingStatus(postingStatusIds);
    return this.confirmMutationIfAllowed(
      postingStatusId,
      documentLabel,
      'apply payment to',
      status => this.canUpdateJournalEntry(status),
      (label, status) => this.getUpdateBlockedMessage(label, status)
    );
  }

  private confirmMutationIfAllowed(
    postingStatusId: number | null | undefined,
    documentLabel: JournalEntrySourceDocumentLabel,
    actionHint: string,
    canProceed: (postingStatusId: number | null | undefined) => boolean,
    blockedMessage: (documentLabel: JournalEntrySourceDocumentLabel, postingStatusId: number | null | undefined) => string
  ): Observable<boolean> {
    if (!canProceed(postingStatusId)) {
      this.toastr.error(blockedMessage(documentLabel, postingStatusId), CommonMessage.Error);
      return of(false);
    }

    if (postingStatusId == null || postingStatusId === PostingStatus.Open) {
      return of(true);
    }

    const statusLabel = getPostingStatusLabel(postingStatusId) || 'Posted';
    return this.passwordCheckDialogService.confirm({
      message: `This ${documentLabel} has been ${statusLabel}.`,
      hint: `Enter your password to ${actionHint} this ${documentLabel.toLowerCase()}.`
    }).pipe(map(password => !!password));
  }

  hasAnyRole(userGroups: UserGroupInput, roles: UserGroups[]): boolean {
    const groupNumbers = getUserGroupNumbers(userGroups);
    return roles.some(role => groupNumbers.includes(role));
  }
}
