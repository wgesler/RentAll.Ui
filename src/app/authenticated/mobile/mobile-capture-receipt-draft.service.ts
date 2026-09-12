import { Injectable } from '@angular/core';
import { FileDetails } from '../../shared/models/fileDetails';
import { ReceiptExtractResponse } from '../maintenance/models/receipt.model';

export interface MobileCaptureReceiptDraft {
  officeId: number;
  propertyId: string | null;
  fileDetails: FileDetails;
  extraction: ReceiptExtractResponse | null;
}

@Injectable({
  providedIn: 'root'
})
export class MobileCaptureReceiptDraftService {
  private draft: MobileCaptureReceiptDraft | null = null;

  setDraft(draft: MobileCaptureReceiptDraft): void {
    this.draft = draft;
  }

  consumeDraft(): MobileCaptureReceiptDraft | null {
    const current = this.draft;
    this.draft = null;
    return current;
  }

  clearDraft(): void {
    this.draft = null;
  }
}
