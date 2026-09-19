import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, map, of, switchMap, take } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReceiptDraftService } from './receipt-draft.service';
import { buildCardNameLookup, isDraftAssignedToUser } from './user-receipt-draft-match.util';

export interface UserReceiptDraftNoticeRefreshOptions {
  delayMs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserReceiptDraftNoticeService {
  private authService = inject(AuthService);
  private receiptDraftService = inject(ReceiptDraftService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private officeService = inject(OfficeService);

  private readonly loginRefreshDelayMs = 1500;
  private readonly pendingSubject = new BehaviorSubject<boolean>(false);
  readonly hasPendingUserReceiptDrafts$ = this.pendingSubject.asObservable();

  private refreshLoadId = 0;
  private scheduledRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private loginPromptHandled = false;
  private readonly openReceiptsDraftsRequestedSubject = new BehaviorSubject<boolean>(false);
  readonly openReceiptsDraftsRequested$ = this.openReceiptsDraftsRequestedSubject.asObservable();

  shouldShowLoginPrompt(): boolean {
    return this.pendingSubject.value && !this.loginPromptHandled;
  }

  resetLoginPrompt(): void {
    this.loginPromptHandled = false;
  }

  markLoginPromptHandled(): void {
    this.loginPromptHandled = true;
  }

  requestOpenReceiptsDrafts(): void {
    this.openReceiptsDraftsRequestedSubject.next(true);
  }

  consumeOpenReceiptsDrafts(): boolean {
    const requested = this.openReceiptsDraftsRequestedSubject.value;
    if (requested) {
      this.openReceiptsDraftsRequestedSubject.next(false);
    }
    return requested;
  }

  refresh(options?: UserReceiptDraftNoticeRefreshOptions): void {
    const delayMs = Math.max(0, options?.delayMs ?? 0);
    if (this.scheduledRefreshTimer != null) {
      clearTimeout(this.scheduledRefreshTimer);
      this.scheduledRefreshTimer = null;
    }

    if (delayMs > 0) {
      this.scheduledRefreshTimer = setTimeout(() => {
        this.scheduledRefreshTimer = null;
        this.executeRefresh();
      }, delayMs);
      return;
    }

    this.executeRefresh();
  }

  scheduleRefreshAfterLogin(): void {
    this.loginPromptHandled = false;
    this.refresh({ delayMs: this.loginRefreshDelayMs });
  }

  clearPendingNotice(): void {
    this.cancelScheduledRefresh();
    this.refreshLoadId++;
    this.pendingSubject.next(false);
    this.loginPromptHandled = false;
    this.openReceiptsDraftsRequestedSubject.next(false);
  }

  notifyDraftsChanged(): void {
    this.refresh();
  }

  private cancelScheduledRefresh(): void {
    if (this.scheduledRefreshTimer != null) {
      clearTimeout(this.scheduledRefreshTimer);
      this.scheduledRefreshTimer = null;
    }
  }

  private executeRefresh(): void {
    const loadId = ++this.refreshLoadId;
    const user = this.authService.getUser();
    const organizationId = String(user?.organizationId || '').trim();
    if (!organizationId || !user?.userId) {
      this.pendingSubject.next(false);
      return;
    }

    this.loadPendingDraftsForUser(organizationId, user).pipe(take(1)).subscribe({
      next: hasPending => {
        if (loadId !== this.refreshLoadId) {
          return;
        }
        this.pendingSubject.next(hasPending);
      },
      error: () => {
        if (loadId !== this.refreshLoadId) {
          return;
        }
        this.pendingSubject.next(false);
      }
    });
  }

  private loadPendingDraftsForUser(
    organizationId: string,
    user: { userId?: string | null; firstName?: string | null; lastName?: string | null }
  ): Observable<boolean> {
    return this.officeService.getOffices(organizationId).pipe(
      take(1),
      switchMap(offices => {
        const officeIds = (offices || []).map(office => office.officeId).filter(id => id > 0);
        if (officeIds.length === 0) {
          return of(false);
        }

        return forkJoin({
          drafts: this.receiptDraftService.searchReceiptDrafts({
            officeIds,
            includePromoted: false,
            isActive: true
          }).pipe(take(1)),
          accountingOffices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
            take(1),
            switchMap(() => this.accountingOfficeService.getAllAccountingOffices().pipe(take(1)))
          )
        }).pipe(
          map(({ drafts, accountingOffices }) => {
            const cardNameByBankCardId = buildCardNameLookup(accountingOffices);
            return (drafts || []).some(draft => isDraftAssignedToUser(draft, user, cardNameByBankCardId));
          })
        );
      })
    );
  }
}
