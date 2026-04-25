import { Injectable } from '@angular/core';
import { WorkOrderResponse } from '../models/work-order.model';

export interface WorkOrderAmountContext {
  applyMarkup?: boolean;
  isOwnerType?: boolean;
  markupPercent?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class WorkOrderAmountService {
  calculateLineTotal(receiptAmount: unknown, laborHours: unknown, laborCost: unknown): number {
    const receipt = Number(receiptAmount) || 0;
    const hours = Math.floor(Number(laborHours)) || 0;
    const cost = Number(laborCost) || 0;
    return Math.round((receipt + hours * cost) * 100) / 100;
  }

  resolveWorkOrderDisplayAmount(workOrder: WorkOrderResponse, context?: WorkOrderAmountContext): number {
    const row = workOrder as unknown as Record<string, unknown>;
    const scalarKeys = [
      'amount', 'Amount',
      'totalAmount', 'TotalAmount',
      'workOrderAmount', 'WorkOrderAmount',
      'workOrderTotal', 'WorkOrderTotal',
      'total', 'Total',
      'itemAmount', 'ItemAmount'
    ];
    const collectionKeys = [
      'workOrderItems', 'WorkOrderItems',
      'workorderItems',
      'workOrderItem', 'WorkOrderItem',
      'items', 'Items',
      'lines', 'Lines',
      'workOrderLines', 'WorkOrderLines'
    ];

    for (const collectionKey of collectionKeys) {
      const totalFromCollection = this.sumWorkOrderCollection(row[collectionKey], context);
      if (totalFromCollection !== null) {
        return totalFromCollection;
      }
    }

    for (const scalarKey of scalarKeys) {
      const parsedScalar = this.parseLooseNumber(row[scalarKey]);
      if (parsedScalar !== null) {
        return parsedScalar;
      }
    }

    return 0;
  }

  sumWorkOrderCollection(collectionValue: unknown, context?: WorkOrderAmountContext): number | null {
    const entries = this.extractCollectionEntries(collectionValue);
    if (!entries) {
      return null;
    }

    return Math.round(entries.reduce<number>((sum, entry) => {
      if (!entry || typeof entry !== 'object') {
        return sum;
      }
      const lineTotal = this.resolveWorkOrderItemTotal(entry as Record<string, unknown>, context);
      return lineTotal !== null ? sum + lineTotal : sum;
    }, 0) * 100) / 100;
  }

  resolveWorkOrderItemTotal(item: Record<string, unknown>, context?: WorkOrderAmountContext): number | null {
    const itemAmount = this.parseLooseNumber(item['itemAmount'])
      ?? this.parseLooseNumber(item['ItemAmount'])
      ?? this.parseLooseNumber(item['amount'])
      ?? this.parseLooseNumber(item['Amount'])
      ?? this.parseLooseNumber(item['totalAmount'])
      ?? this.parseLooseNumber(item['TotalAmount'])
      ?? this.parseLooseNumber(item['total'])
      ?? this.parseLooseNumber(item['Total'])
      ?? this.parseLooseNumber(item['lineAmount'])
      ?? this.parseLooseNumber(item['LineAmount']);
    if (itemAmount !== null) {
      return Math.round(itemAmount * 100) / 100;
    }

    const receiptAmount = this.parseLooseNumber(item['receiptAmount']) ?? this.parseLooseNumber(item['ReceiptAmount']);
    const laborHours = this.parseLooseNumber(item['laborHours']) ?? this.parseLooseNumber(item['LaborHours']) ?? 0;
    const laborCost = this.parseLooseNumber(item['laborCost']) ?? this.parseLooseNumber(item['LaborCost']) ?? 0;

    if (receiptAmount !== null) {
      const adjustedReceiptAmount = this.applyMarkupToReceiptAmount(receiptAmount, context);
      return this.calculateLineTotal(adjustedReceiptAmount, laborHours, laborCost);
    }

    return null;
  }

  parseLooseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '').trim();
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  parseMarkupPercent(markupPercent: unknown): number | null {
    if (markupPercent === null || markupPercent === undefined || markupPercent === '') {
      return null;
    }
    if (typeof markupPercent === 'number') {
      return Number.isFinite(markupPercent) ? markupPercent : null;
    }
    if (typeof markupPercent === 'string') {
      const cleaned = markupPercent.replace('%', '').trim();
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  getMarkupFactor(context?: WorkOrderAmountContext): number {
    const applyMarkup = context?.applyMarkup === true;
    const isOwnerType = context?.isOwnerType === true;
    if (!applyMarkup || !isOwnerType) {
      return 1;
    }

    const parsedMarkup = this.parseMarkupPercent(context?.markupPercent);
    if (parsedMarkup === null || parsedMarkup === 0) {
      return 1;
    }

    const normalizedPercent = Math.abs(parsedMarkup) <= 1 ? (parsedMarkup * 100) : parsedMarkup;
    return 1 + (normalizedPercent / 100);
  }

  applyMarkupToReceiptAmount(baseAmount: unknown, context?: WorkOrderAmountContext): number {
    const amount = Number(baseAmount) || 0;
    const factor = this.getMarkupFactor(context);
    return Math.round(amount * factor * 100) / 100;
  }

  removeMarkupFromReceiptAmount(markedAmount: unknown, context?: WorkOrderAmountContext): number {
    const amount = Number(markedAmount) || 0;
    const factor = this.getMarkupFactor(context);
    if (!Number.isFinite(factor) || factor === 0) {
      return Math.round(amount * 100) / 100;
    }
    return Math.round((amount / factor) * 100) / 100;
  }

  extractCollectionEntries(collectionValue: unknown): unknown[] | null {
    if (Array.isArray(collectionValue)) {
      return collectionValue;
    }

    if (collectionValue && typeof collectionValue === 'object') {
      const asRecord = collectionValue as Record<string, unknown>;
      if (Array.isArray(asRecord['$values'])) {
        return asRecord['$values'] as unknown[];
      }
      const objectEntries = Object.values(asRecord).filter(value => value && typeof value === 'object');
      return objectEntries.length > 0 ? objectEntries : null;
    }

    if (typeof collectionValue === 'string') {
      const raw = collectionValue.trim();
      if (raw.startsWith('[') || raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            return parsed;
          }
          if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['$values'])) {
            return (parsed as Record<string, unknown>)['$values'] as unknown[];
          }
        } catch {
          return null;
        }
      }
    }

    return null;
  }
}
