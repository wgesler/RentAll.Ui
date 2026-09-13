import { FileDetails } from '../../documents/models/document.model';
import { UtilityService } from '../../../services/utility.service';
import { ReceiptExtractResponse, Split } from '../models/receipt.model';
import { ReceiptDraftRequest, ReceiptDraftSourceFlags } from '../models/receipt-draft.model';

export function buildReceiptDraftRequestFromCapture(
  organizationId: string,
  officeId: number | null,
  fileDetails: FileDetails,
  extraction: ReceiptExtractResponse | null
): ReceiptDraftRequest {
  const propertyIds = (extraction?.propertyIds || [])
    .map(propertyId => (propertyId || '').trim())
    .filter(propertyId => propertyId.length > 0);

  const amount = Number(extraction?.amount ?? 0) || 0;
  const headerDescription = (extraction?.description || '').trim();
  const description = headerDescription || (extraction?.split?.description || '').trim() || null;
  const splitAmount = Number(extraction?.split?.amount ?? amount) || amount;
  const splits: Split[] = [];

  if (splitAmount !== 0 || description) {
    splits.push({
      amount: splitAmount,
      description: headerDescription || (extraction?.split?.description || '').trim() || '',
      receiptTypeId: Number(extraction?.split?.receiptTypeId ?? 1) || 1,
      chartOfAccountId: extraction?.split?.chartOfAccountId ?? null
    });
  }

  return {
    organizationId,
    officeId: officeId && officeId > 0 ? officeId : null,
    propertyIds,
    receiptDate: extraction?.receiptDate ?? null,
    dueDate: extraction?.dueDate ?? extraction?.receiptDate ?? null,
    accountingPeriod: extraction?.accountingPeriod ?? extraction?.receiptDate ?? null,
    billNumber: extraction?.billNumber ?? null,
    amount,
    description,
    bankCardId: extraction?.bankCardId && extraction.bankCardId > 0 ? extraction.bankCardId : null,
    vendorName: extraction?.vendorName ?? null,
    splits,
    fileDetails,
    isUtility: false,
    businessPrivate: false,
    isActive: true,
    draftSourceFlags: ReceiptDraftSourceFlags.Upload,
    extractionJson: extraction ? JSON.stringify(extraction) : null
  };
}

export function buildReceiptDraftRequestFromForm(
  utilityService: UtilityService,
  organizationId: string,
  formValue: {
    officeId?: number | null;
    propertyIds?: string[] | null;
    receiptDate?: unknown;
    dueDate?: unknown;
    accountingPeriod?: unknown;
    billNumber?: string | null;
    amount?: unknown;
    description?: string | null;
    bankCardId?: number | null;
    vendorId?: string | null;
    vendorName?: string | null;
    isUtility?: boolean;
    businessPrivate?: boolean;
    isActive?: boolean;
    receiptPath?: string | null;
  },
  splits: Split[],
  options: {
    receiptDraftId?: string | null;
    fileDetails?: FileDetails | null;
    sendNewReceiptFile?: boolean;
    draftSourceFlags?: ReceiptDraftSourceFlags;
    extractionJson?: string | null;
    paidAmount?: number | null;
  } = {}
): ReceiptDraftRequest {
  const bankCardId = Number(formValue.bankCardId ?? 0);
  const amountStr = String(formValue.amount ?? '').replace(/[^0-9.-]/g, '');
  const amount = parseFloat(amountStr) || 0;
  const propertyIds = (formValue.propertyIds || [])
    .map(propertyId => (propertyId || '').trim())
    .filter(propertyId => propertyId.length > 0);

  return {
    receiptDraftId: options.receiptDraftId ?? undefined,
    organizationId,
    officeId: formValue.officeId && formValue.officeId > 0 ? formValue.officeId : null,
    propertyIds,
    receiptDate: utilityService.toDateOnlyJsonString(formValue.receiptDate) ?? null,
    dueDate: utilityService.toDateOnlyJsonString(formValue.dueDate) ?? null,
    accountingPeriod: utilityService.toDateOnlyJsonString(formValue.accountingPeriod) ?? null,
    billNumber: (formValue.billNumber || '').trim() || null,
    amount,
    description: (formValue.description || '').trim() || null,
    bankCardId: bankCardId > 0 ? bankCardId : null,
    vendorId: (formValue.vendorId || '').trim() || null,
    vendorName: (formValue.vendorName || '').trim() || null,
    splits: (splits || []).map(split => {
      const receiptSplitId = Number(split.receiptSplitId ?? 0);
      const chartOfAccountId = Number(split.chartOfAccountId ?? 0);
      return {
        receiptSplitId: Number.isFinite(receiptSplitId) && receiptSplitId > 0 ? receiptSplitId : null,
        amount: Number(split.amount ?? 0) || 0,
        description: (split.description || '').trim(),
        propertyId: split.propertyId ?? null,
        workOrderId: split.workOrderId ?? null,
        workOrderCode: (split.workOrderCode || split.workOrder || '').trim() || null,
        receiptTypeId: Number(split.receiptTypeId ?? 0) || 0,
        chartOfAccountId: Number.isFinite(chartOfAccountId) && chartOfAccountId > 0 ? chartOfAccountId : null
      };
    }),
    receiptPath: options.sendNewReceiptFile ? null : ((formValue.receiptPath || '').trim() || null),
    fileDetails: options.sendNewReceiptFile ? (options.fileDetails ?? null) : null,
    isUtility: !!formValue.isUtility,
    businessPrivate: !!formValue.businessPrivate,
    isActive: formValue.isActive !== false,
    draftSourceFlags: options.draftSourceFlags ?? ReceiptDraftSourceFlags.Upload,
    extractionJson: options.extractionJson ?? null,
    paidAmount: options.paidAmount ?? null
  };
}
