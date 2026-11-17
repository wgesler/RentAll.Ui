import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReceiptType } from '../../maintenance/models/maintenance-enums';
import { ReceiptPrefill, ReceiptRequest, ReceiptSelection, isReceiptCompanyPropertyId, resolveFirstRealReceiptPropertyId } from '../../maintenance/models/receipt.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { UtilityService } from '../../../services/utility.service';
import { RentRollCreateBillRequest } from '../models/rent-roll.model';

export interface RentRollBillOffice {
  officeId: number;
  name?: string | null;
}

export interface RentRollCreateBillEditorState {
  propertyId: string;
  isCompanyProperty: boolean;
  resolvedOfficeId: number | null;
  property: PropertyResponse;
  prefill: ReceiptPrefill;
  agreementLineId: number | null;
  agreementLineNotes: string | null;
}

export class RentRollCreateBillQueue {
  requests: RentRollCreateBillRequest[] = [];
  index = -1;
  savedCount = 0;

  get isActive(): boolean {
    return this.index >= 0 && this.index < this.requests.length;
  }

  get total(): number {
    return this.requests.length;
  }

  start(requests: RentRollCreateBillRequest[]): RentRollCreateBillRequest | null {
    const queue = (requests || []).filter(request => !!request);
    if (queue.length === 0) {
      return null;
    }
    this.requests = queue;
    this.index = 0;
    this.savedCount = 0;
    return queue[0];
  }

  /** Records the current bill as saved and returns the next request, or null when the queue is finished. */
  recordSavedAndAdvance(): RentRollCreateBillRequest | null {
    this.savedCount++;
    this.index++;
    return this.index < this.requests.length ? this.requests[this.index] : null;
  }

  clear(): void {
    this.requests = [];
    this.index = -1;
    this.savedCount = 0;
  }
}

@Injectable({
  providedIn: 'root'
})
export class RentRollBillService {
  private receiptService = inject(ReceiptService);
  private utilityService = inject(UtilityService);

  toAgreementLineId(value: string | number | null | undefined): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.trunc(parsed);
  }

  buildPropertyStub(organizationId: string, officeId: number | null, offices: RentRollBillOffice[]): PropertyResponse {
    const resolvedOfficeId = officeId ?? 0;
    const officeName = offices.find(office => office.officeId === resolvedOfficeId)?.name ?? '';
    return {
      propertyId: '',
      organizationId,
      propertyCode: '',
      officeId: resolvedOfficeId,
      officeName,
      isActive: true
    } as PropertyResponse;
  }

  buildOpenBillProperty(
    selection: ReceiptSelection,
    organizationId: string,
    officeId: number | null,
    offices: RentRollBillOffice[],
    getPropertyCode: (propertyId: string) => string | null | undefined
  ): PropertyResponse {
    const propertyId = resolveFirstRealReceiptPropertyId(selection?.propertyId ? [selection.propertyId] : selection?.receipt?.propertyIds);
    const property = this.buildPropertyStub(organizationId, officeId, offices);
    if (propertyId) {
      property.propertyId = propertyId;
      const propertyCode = getPropertyCode(propertyId);
      if (propertyCode) {
        property.propertyCode = propertyCode;
      }
    } else if (
      isReceiptCompanyPropertyId(selection?.propertyId)
      || (selection?.receipt?.propertyIds || []).some(id => isReceiptCompanyPropertyId(id))
    ) {
      property.propertyCode = 'Company';
    }
    return property;
  }

  buildCreateBillEditorState(
    request: RentRollCreateBillRequest,
    organizationId: string,
    fallbackOfficeId: number | null,
    fallbackBillDate: string | null,
    offices: RentRollBillOffice[]
  ): RentRollCreateBillEditorState {
    const propertyId = (request.propertyId || '').trim();
    const isCompanyProperty = isReceiptCompanyPropertyId(propertyId);
    const officeId = request.officeId ?? fallbackOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) && Number(officeId) > 0
      ? Number(officeId)
      : null;
    const billDate = request.billDate || fallbackBillDate || this.utilityService.formatDateOnlyForApi(new Date());
    const dueDate = request.dueDate || billDate;
    const agreementLineId = this.toAgreementLineId(request.agreementLineId);
    const agreementLineNotes = (request.notes || '').trim() || null;
    const description = (request.description || '').trim();
    const amount = Number(request.amount || 0);

    const property = this.buildPropertyStub(organizationId, resolvedOfficeId ?? officeId, offices);
    if (isCompanyProperty) {
      property.propertyId = propertyId;
      property.propertyCode = 'Company';
    } else if (propertyId) {
      property.propertyId = propertyId;
    }

    return {
      propertyId,
      isCompanyProperty,
      resolvedOfficeId,
      property,
      prefill: {
        key: `${request.agreementLineId || 'line'}-${Date.now()}`,
        officeId: resolvedOfficeId ?? officeId,
        propertyIds: propertyId ? [propertyId] : [],
        agreementLineId,
        agreementLineNotes,
        receiptDate: billDate,
        dueDate,
        accountingPeriod: billDate,
        description,
        amount,
        bankCardId: 0,
        vendorId: request.vendorId,
        vendorName: request.vendorName,
        split: {
          amount,
          description,
          receiptTypeId: isCompanyProperty ? ReceiptType.Company : ReceiptType.Owner,
          chartOfAccountId: request.chartOfAccountId
        },
        businessPrivate: isCompanyProperty
      },
      agreementLineId,
      agreementLineNotes
    };
  }

  /** Links an existing bill to its rent roll agreement line. Returns true when the bill was updated. */
  async ensureAgreementLineLink(selection: ReceiptSelection): Promise<boolean> {
    const receiptId = (selection?.receiptId || '').trim();
    const agreementLineId = this.toAgreementLineId(selection?.agreementLineId);
    const notes = (selection?.notes || '').trim();
    if (!receiptId || !agreementLineId || !notes) {
      return false;
    }
    try {
      const receipt = await firstValueFrom(this.receiptService.getReceiptById(receiptId));
      if (this.toAgreementLineId(receipt?.agreementLineId)) {
        return false;
      }
      const updateRequest: ReceiptRequest = {
        receiptId: receipt.receiptId,
        organizationId: receipt.organizationId,
        officeId: receipt.officeId,
        propertyIds: [...(receipt.propertyIds || [])],
        agreementLineId,
        receiptDate: receipt.receiptDate,
        dueDate: receipt.dueDate,
        accountingPeriod: receipt.accountingPeriod,
        billNumber: receipt.billNumber ?? null,
        ticketId: receipt.ticketId || '',
        amount: Number(receipt.amount || 0),
        paidAmount: Number(receipt.paidAmount || 0),
        paidDate: receipt.paidDate ?? null,
        description: (receipt.description || '').trim(),
        bankCardId: receipt.bankCardId ?? null,
        vendorId: receipt.vendorId ?? null,
        vendorName: receipt.vendorName ?? null,
        splits: [...(receipt.splits || [])],
        receiptPath: receipt.receiptPath ?? null,
        noReceiptAvailable: receipt.noReceiptAvailable === true,
        fileDetails: null,
        paymentTypeId: Number(receipt.paymentTypeId || 0),
        checkPrinted: !!receipt.checkPrinted,
        isUtility: !!receipt.isUtility,
        businessPrivate: !!receipt.businessPrivate,
        isActive: !!receipt.isActive
      };
      await firstValueFrom(this.receiptService.updateReceipt(updateRequest));
      return true;
    } catch {
      // Do not block opening the bill editor if this background link fails.
      return false;
    }
  }
}
