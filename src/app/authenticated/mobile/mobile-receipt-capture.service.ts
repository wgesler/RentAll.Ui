import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { CommonMessage } from '../../enums/common-message.enum';
import { AuthService } from '../../services/auth.service';
import { ImageOptimizationFailedError, UtilityService } from '../../services/utility.service';
import { ReceiptExtractResponse } from '../maintenance/models/receipt.model';
import { ReceiptService } from '../maintenance/services/receipt.service';
import { GlobalSelectionService } from '../organizations/services/global-selection.service';
import { MobileCaptureReceiptDraftService } from './mobile-capture-receipt-draft.service';

@Injectable({
  providedIn: 'root'
})
export class MobileReceiptCaptureService {
  private router = inject(Router);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private receiptService = inject(ReceiptService);
  private globalSelectionService = inject(GlobalSelectionService);
  private captureReceiptDraftService = inject(MobileCaptureReceiptDraftService);
  private toastr = inject(ToastrService);
  private isProcessing = false;

  get isCaptureInProgress(): boolean {
    return this.isProcessing;
  }

  openCameraPicker(fileInput: HTMLInputElement): void {
    if (this.isProcessing) {
      return;
    }
    fileInput.click();
  }

  openUploadPicker(fileInput: HTMLInputElement): void {
    if (this.isProcessing) {
      return;
    }
    fileInput.click();
  }

  async handleReceiptFileSelected(event: Event): Promise<void> {
    const file = this.utilityService.getFirstSelectedFile(event);
    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      inputElement.value = '';
    }
    if (!file || this.isProcessing) {
      return;
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    const officeId = Number(this.globalSelectionService.getSelectedOfficeIdValue() ?? 0);
    if (!organizationId) {
      this.toastr.error('Organization is not available.', CommonMessage.Error);
      return;
    }
    if (!Number.isFinite(officeId) || officeId <= 0) {
      this.toastr.warning('Select an office before capturing a receipt.', CommonMessage.Error);
      return;
    }

    this.isProcessing = true;
    try {
      const payload = await this.utilityService.buildOptimizedUploadPayload(file);
      let extraction: ReceiptExtractResponse | null = null;
      try {
        extraction = await this.receiptService.extractReceipt(organizationId, payload.fileDetails, officeId).pipe(take(1)).toPromise() ?? null;
        if ((extraction?.warnings || []).length > 0) {
          this.toastr.warning('Receipt read with items to review.');
        }
      } catch {
        this.toastr.warning('Receipt captured, but automatic reading is unavailable. Enter details manually.');
      }

      this.captureReceiptDraftService.setDraft({
        officeId,
        propertyId: null,
        fileDetails: payload.fileDetails,
        extraction
      });
      await this.router.navigate(['/mobile', 'maintenance', 'receipts', 'new']);
    } catch (error) {
      if (error instanceof ImageOptimizationFailedError) {
        this.toastr.error(this.utilityService.getImageCompressionFailureMessage(file.name), CommonMessage.Error);
      } else {
        this.toastr.error(`Unable to prepare ${file.name}.`, CommonMessage.Error);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
