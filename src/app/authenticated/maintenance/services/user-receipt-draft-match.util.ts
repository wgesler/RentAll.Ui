import { ReceiptDraftResponse } from '../models/receipt-draft.model';

export function normalizePersonName(value: string | null | undefined): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function personNameMatchesCardOwner(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  cardOwner: string | null | undefined
): boolean {
  const ownerTokens = normalizePersonName(cardOwner).split(' ').filter(token => token.length > 0);
  if (ownerTokens.length === 0) {
    return false;
  }

  const first = normalizePersonName(firstName);
  const last = normalizePersonName(lastName);
  if (!first || !last) {
    return false;
  }

  const full = `${first} ${last}`;
  const reverse = `${last} ${first}`;
  const ownerName = ownerTokens.join(' ');
  if (full === ownerName || reverse === ownerName) {
    return true;
  }

  return ownerTokens.includes(first) && ownerTokens.includes(last);
}

function isReceiptLikeAssignedToUser(
  item: { createdBy?: string | null; bankCardId?: number | null },
  user: { userId?: string | null; firstName?: string | null; lastName?: string | null },
  cardNameByBankCardId: Map<number, string>
): boolean {
  const userId = String(user.userId || '').trim();
  const createdBy = String(item.createdBy || '').trim();
  if (userId && createdBy && userId === createdBy) {
    return true;
  }

  const bankCardId = Number(item.bankCardId ?? 0);
  if (bankCardId <= 0) {
    return false;
  }

  const cardName = cardNameByBankCardId.get(bankCardId) || '';
  return personNameMatchesCardOwner(user.firstName, user.lastName, cardName);
}

export function isDraftAssignedToUser(
  draft: ReceiptDraftResponse,
  user: { userId?: string | null; firstName?: string | null; lastName?: string | null },
  cardNameByBankCardId: Map<number, string>
): boolean {
  if (!draft || draft.isActive === false || draft.isPromoted) {
    return false;
  }

  return isReceiptLikeAssignedToUser(draft, user, cardNameByBankCardId);
}

export function isReceiptAssignedToUser(
  receipt: { createdBy?: string | null; bankCardId?: number | null; isActive?: boolean | null },
  user: { userId?: string | null; firstName?: string | null; lastName?: string | null },
  cardNameByBankCardId: Map<number, string>
): boolean {
  if (!receipt || receipt.isActive === false) {
    return false;
  }

  return isReceiptLikeAssignedToUser(receipt, user, cardNameByBankCardId);
}

export function buildCardNameLookup(
  offices: Array<{ bankCards?: Array<{ bankCardId?: number; cardName?: string | null }> | null }> | null | undefined
): Map<number, string> {
  const lookup = new Map<number, string>();
  (offices || []).forEach(office => {
    (office.bankCards || []).forEach(card => {
      const bankCardId = Number(card.bankCardId ?? 0);
      if (bankCardId <= 0) {
        return;
      }
      lookup.set(bankCardId, (card.cardName || '').trim());
    });
  });
  return lookup;
}
