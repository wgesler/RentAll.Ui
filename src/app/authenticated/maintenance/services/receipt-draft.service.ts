import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { isReceiptCompanyPropertyId } from '../models/receipt.model';
import {
  PromoteReceiptDraftResponse,
  ReceiptDraftRequest,
  ReceiptDraftResponse,
  ReceiptDraftSearchRequest,
  ReceiptDraftSourceFlags
} from '../models/receipt-draft.model';

@Injectable({
  providedIn: 'root'
})
export class ReceiptDraftService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);

  readonly controller: string;

  constructor() {
    this.controller = this.configService.config().apiUrl + 'maintenance/receipt-draft/';
  }

  searchReceiptDrafts(request: ReceiptDraftSearchRequest): Observable<ReceiptDraftResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      return of([]);
    }

    return this.http.post<ReceiptDraftResponse[]>(`${this.controller}search`, {
      officeIds,
      propertyId: this.resolveListPropertyId(request.propertyId),
      isActive: request.isActive ?? null,
      includeInactive: !!request.includeInactive,
      includePromoted: !!request.includePromoted,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null,
      receiptKind: request.receiptKind ?? null,
      vendorId: request.vendorId ?? null,
      draftSourceFlags: request.draftSourceFlags ?? null
    }).pipe(map(drafts => (drafts || []).map(draft => this.mapReceiptDraftResponse(draft))));
  }

  getReceiptDraftById(receiptDraftId: string): Observable<ReceiptDraftResponse> {
    return this.http.get<ReceiptDraftResponse>(this.controller + receiptDraftId)
      .pipe(map(draft => this.mapReceiptDraftResponse(draft)));
  }

  createReceiptDraft(request: ReceiptDraftRequest): Observable<ReceiptDraftResponse> {
    const payload = this.normalizeReceiptDraftRequest(request);
    delete payload.receiptDraftId;
    return this.http.post<ReceiptDraftResponse>(this.controller, payload)
      .pipe(map(draft => this.mapReceiptDraftResponse(draft)));
  }

  updateReceiptDraft(request: ReceiptDraftRequest): Observable<ReceiptDraftResponse> {
    return this.http.put<ReceiptDraftResponse>(this.controller, this.normalizeReceiptDraftRequest(request))
      .pipe(map(draft => this.mapReceiptDraftResponse(draft)));
  }

  deleteReceiptDraft(receiptDraftId: string): Observable<void> {
    return this.http.delete<void>(this.controller + receiptDraftId);
  }

  promoteReceiptDraft(receiptDraftId: string): Observable<PromoteReceiptDraftResponse> {
    return this.http.post<PromoteReceiptDraftResponse>(`${this.controller}${receiptDraftId}/promote`, {});
  }

  linkReceiptDraftToReceipt(receiptDraftId: string, receiptId: string): Observable<ReceiptDraftResponse> {
    return this.http.post<ReceiptDraftResponse>(`${this.controller}${receiptDraftId}/link/${receiptId}`, {})
      .pipe(map(draft => this.mapReceiptDraftResponse(draft)));
  }

  mapReceiptDraftResponse(raw: ReceiptDraftResponse | Record<string, unknown>): ReceiptDraftResponse {
    const draft = raw as ReceiptDraftResponse;
    return {
      ...draft,
      draftSourceFlags: Number(draft.draftSourceFlags ?? ReceiptDraftSourceFlags.None),
      hasUploadSource: !!draft.hasUploadSource,
      hasStatementImportSource: !!draft.hasStatementImportSource,
      isPromoted: !!draft.isPromoted,
      splits: this.mappingService.mapReceiptSplitsFromApi(draft.splits)
    };
  }

  private normalizeReceiptDraftRequest(request: ReceiptDraftRequest): ReceiptDraftRequest {
    const bankCardId = Number(request.bankCardId ?? 0);
    const amount = Number(request.amount ?? 0) || 0;
    const receiptDraftId = this.normalizeGuid(request.receiptDraftId) ?? undefined;
    const organizationId = this.normalizeGuid(request.organizationId) ?? request.organizationId;

    return {
      receiptDraftId,
      organizationId,
      officeId: Number(request.officeId ?? 0) > 0 ? Number(request.officeId) : null,
      propertyIds: (request.propertyIds || [])
        .map(propertyId => this.normalizeGuid(propertyId))
        .filter((propertyId): propertyId is string => !!propertyId),
      receiptDate: request.receiptDate ?? null,
      dueDate: request.dueDate ?? null,
      accountingPeriod: request.accountingPeriod ?? null,
      billNumber: (request.billNumber || '').trim() || null,
      amount,
      description: (request.description || '').trim() || null,
      bankCardId: bankCardId > 0 ? bankCardId : null,
      vendorId: this.normalizeGuid(request.vendorId),
      vendorName: (request.vendorName || '').trim() || null,
      paidAmount: request.paidAmount ?? (bankCardId > 0 ? amount : 0),
      paidDate: request.paidDate ?? null,
      paymentDescription: (request.paymentDescription || '').trim() || null,
      splits: (request.splits || []).map(split => ({
        receiptSplitId: this.normalizePositiveIntOrNull(split.receiptSplitId),
        amount: Number(split.amount ?? 0) || 0,
        description: (split.description || '').trim(),
        propertyId: this.normalizeGuid(split.propertyId),
        workOrderId: this.normalizeGuid(split.workOrderId),
        workOrderCode: (split.workOrderCode || split.workOrder || '').trim() || null,
        receiptTypeId: Number(split.receiptTypeId ?? 0) || 0,
        chartOfAccountId: this.normalizePositiveIntOrNull(split.chartOfAccountId)
      })),
      agreementLineId: this.normalizePositiveIntOrNull(request.agreementLineId),
      receiptPath: (request.receiptPath || '').trim() || null,
      fileDetails: (request.fileDetails?.file || '').trim() ? request.fileDetails : null,
      paymentTypeId: Number(request.paymentTypeId ?? 0) || 0,
      checkPrinted: !!request.checkPrinted,
      isUtility: !!request.isUtility,
      businessPrivate: !!request.businessPrivate,
      isActive: request.isActive !== false,
      draftSourceFlags: Number(request.draftSourceFlags ?? ReceiptDraftSourceFlags.Upload) || ReceiptDraftSourceFlags.Upload,
      extractionJson: request.extractionJson ?? null
    };
  }

  private normalizePositiveIntOrNull(value: unknown): number | null {
    const normalized = Number(value ?? 0);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
  }

  private normalizeGuid(value: unknown): string | null {
    const normalized = (value ?? '').toString().trim();
    if (!normalized) {
      return null;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
      ? normalized
      : null;
  }

  private resolveListPropertyId(propertyId?: string | null): string | null {
    const normalizedPropertyId = (propertyId || '').trim();
    if (!normalizedPropertyId || isReceiptCompanyPropertyId(normalizedPropertyId)) {
      return null;
    }
    return normalizedPropertyId;
  }
}
