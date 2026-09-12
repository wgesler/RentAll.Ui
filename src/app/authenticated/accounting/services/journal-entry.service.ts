import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Observable, map, of } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { UserGroupInput, getUserGroupNumbers } from '../../shared/access/role-access';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { PasswordCheckDialogService } from '../../shared/modals/password-check-dialog/password-check-dialog.service';
import { UserGroups } from '../../users/models/user-enums';
import {
  PostingStatus,
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
  | 'Payment'
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

const CLOSED_DOCUMENT_NOT_PERMITTED_MESSAGE =
  'This document has been closed by accounting. Please see your administrative or accounting staff to change.';

const SOFT_CLOSED_OVERRIDE_MESSAGE =
  'This document has been closed by accounting. Please enter your password to override.';

const HARD_CLOSED_DOCUMENT_MESSAGE =
  'This document has been hard closed by accounting. No changes are possible at this time.';

@Injectable({
  providedIn: 'root'
})
export class JournalEntryService {
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
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

    if (isJournalEntryPosted(status) || isJournalEntrySoftClosed(status)) {
      return this.canDeleteWithElevatedPostingStatus(userGroups);
    }

    return false;
  }

  canDeleteJournalEntry(
    postingStatusId: number | null | undefined,
    userGroups?: UserGroupInput
  ): boolean {
    return this.canDeleteApplicationObject(postingStatusId, userGroups);
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

    if (isJournalEntryPosted(status) || isJournalEntrySoftClosed(status)) {
      return this.canDeleteWithElevatedPostingStatus(userGroups);
    }

    return false;
  }

  private canDeleteWithElevatedPostingStatus(userGroups?: UserGroupInput): boolean {
    const groups = userGroups ?? this.authService.getUser()?.userGroups;
    return this.hasAnyRole(groups, SOFT_CLOSED_JOURNAL_ENTRY_EDIT_ROLES);
  }

  getUpdateBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined
  ): string {
    return this.getMutationBlockedMessage(postingStatusId);
  }

  getDeleteBlockedMessage(
    documentLabel: JournalEntrySourceDocumentLabel,
    postingStatusId: number | null | undefined
  ): string {
    return this.getMutationBlockedMessage(postingStatusId);
  }

  private getMutationBlockedMessage(postingStatusId: number | null | undefined): string {
    if (isJournalEntryHardClosed(postingStatusId)) {
      return HARD_CLOSED_DOCUMENT_MESSAGE;
    }

    return CLOSED_DOCUMENT_NOT_PERMITTED_MESSAGE;
  }

  revertFormIfClosedDocumentUpdateBlocked(
    postingStatusId: number | null | undefined,
    canProceed: boolean,
    revert: () => void
  ): void {
    const status = Number(postingStatusId ?? PostingStatus.Open);
    if (!canProceed && status !== PostingStatus.Open) {
      revert();
    }
  }

  revertFormIfHardClosedUpdateBlocked(
    postingStatusId: number | null | undefined,
    canProceed: boolean,
    revert: () => void
  ): void {
    this.revertFormIfClosedDocumentUpdateBlocked(postingStatusId, canProceed, revert);
  }

  revertFormIfHardClosedPaymentUpdateBlocked(
    postingStatusIds: Array<number | null | undefined>,
    canProceed: boolean,
    revert: () => void
  ): void {
    this.revertFormIfClosedDocumentUpdateBlocked(this.strictestPostingStatus(postingStatusIds), canProceed, revert);
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
      postingStatus => this.canUpdateJournalEntry(postingStatus)
    );
  }

  confirmDeleteIfAllowed(
    postingStatusId: number | null | undefined,
    documentLabel: JournalEntrySourceDocumentLabel
  ): Observable<boolean> {
    return this.confirmMutationIfAllowed(
      postingStatusId,
      postingStatus => this.canDeleteApplicationObject(postingStatus)
    );
  }

  confirmPaymentIfAllowed(
    postingStatusIds: Array<number | null | undefined>,
    documentLabel: JournalEntrySourceDocumentLabel
  ): Observable<boolean> {
    const postingStatusId = this.strictestPostingStatus(postingStatusIds);
    return this.confirmMutationIfAllowed(
      postingStatusId,
      status => this.canUpdateJournalEntry(status)
    );
  }

  private confirmMutationIfAllowed(
    postingStatusId: number | null | undefined,
    canProceed: (postingStatusId: number | null | undefined) => boolean
  ): Observable<boolean> {
    const status = Number(postingStatusId ?? PostingStatus.Open);

    if (status === PostingStatus.Open) {
      return of(true);
    }

    if (isJournalEntryHardClosed(status)) {
      return this.showClosedDocumentAlert(HARD_CLOSED_DOCUMENT_MESSAGE);
    }

    if (!canProceed(postingStatusId)) {
      return this.showClosedDocumentAlert(CLOSED_DOCUMENT_NOT_PERMITTED_MESSAGE);
    }

    if (isJournalEntrySoftClosed(status)) {
      return this.passwordCheckDialogService.confirm({
        title: 'Closed Document',
        message: SOFT_CLOSED_OVERRIDE_MESSAGE
      }).pipe(map(password => !!password));
    }

    return of(true);
  }

  private showClosedDocumentAlert(message: string): Observable<boolean> {
    const dialogData: GenericModalData = {
      title: 'Document Closed',
      message,
      icon: 'warning',
      iconColor: 'warn',
      no: '',
      yes: 'OK',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: true
    };

    return this.dialog.open(GenericModalComponent, { data: dialogData, width: '35rem' }).afterClosed().pipe(
      map(() => false)
    );
  }

  hasAnyRole(userGroups: UserGroupInput, roles: UserGroups[]): boolean {
    const groupNumbers = getUserGroupNumbers(userGroups);
    return roles.some(role => groupNumbers.includes(role));
  }
}
