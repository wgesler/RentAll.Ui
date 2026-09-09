import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { SearchableSelectComponent } from '../../shared/searchable-select/searchable-select.component';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { WorkOrderSelection } from '../../maintenance/work-order-list/work-order-list.component';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { MobileChromeOverlayService } from '../mobile-chrome-overlay.service';
import { getMobileTicketReturnRoute } from '../mobile-ticket-return.util';

@Component({
  standalone: true,
  selector: 'app-mobile-receipt-detail',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './mobile-receipt-detail.component.html',
  styleUrl: './mobile-receipt-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileReceiptDetailComponent extends ReceiptComponent implements OnInit, OnChanges, OnDestroy {
  @Output() receiptDescriptionChange = new EventEmitter<string>();
  private mobileRouter = inject(Router);
  private mobileRoute = inject(ActivatedRoute);
  private globalSelectionService = inject(GlobalSelectionService);
  private mobileReturnTicketId: string | null = null;
  private mobileReturnTicketTab: string | null = null;
  private sanitizer = inject(DomSanitizer);
  private mobileToastr = inject(ToastrService);
  private mobileChromeOverlayService = inject(MobileChromeOverlayService);
  receiptPreviewOpen = false;
  receiptPreviewViewerSrc: SafeResourceUrl | null = null;
  private receiptPreviewObjectUrl: string | null = null;

  //#region Mobile-Receipt-Detail
  override ngOnInit(): void {
    const queryParams = this.mobileRoute.snapshot.queryParamMap;
    this.mobileReturnTicketId = queryParams.get('returnTicketId')?.trim() || null;
    this.mobileReturnTicketTab = queryParams.get('returnTicketTab')?.trim() || null;

    this.shellContext = this.authService.isAdmin() ? 'accounting' : 'maintenance';
    this.showInlineSaveButtons = true;
    this.autoBackOnSave = true;
    super.ngOnInit();
    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.officeId = officeId;
      if (this.isAddMode || this.receiptOfficeInitialized) {
        this.applyShellOfficeToReceipt();
      }
      this.markViewForCheck();
    });
    this.form.get('description')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.receiptDescriptionChange.emit((value || '').trim());
    });
    if (this.isAddMode) {
      this.receiptDescriptionChange.emit('New');
    }
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['receiptId'] && this.receiptId === 'new') {
      this.receiptDescriptionChange.emit('New');
    }
  }

  override applyLoadedReceipt(receipt: ReceiptResponse): void {
    super.applyLoadedReceipt(receipt);
    if (this.isAccountingShell) {
      this.updateAccountingBillFieldValidators();
      this.updateSplitLineAccountValidators();
    }
    this.receiptDescriptionChange.emit((receipt.description || '').trim());
  }

  override back(): void {
    const ticketRoute = getMobileTicketReturnRoute(this.mobileReturnTicketId, this.mobileReturnTicketTab);
    if (ticketRoute) {
      void this.mobileRouter.navigate(ticketRoute);
      return;
    }
    void this.mobileRouter.navigate(['/mobile', 'maintenance', 'receipts']);
  }

  override emitWorkOrderSelection(selection: WorkOrderSelection): void {
    const workOrderId = (selection.workOrderId || '').trim();
    if (!workOrderId) {
      this.mobileToastr.error('Unable to open work order: missing navigation context.', 'Work Order');
      return;
    }

    const returnReceiptId = String(
      selection.returnReceiptId ?? selection.prefilledReceiptId ?? this.receipt?.receiptId ?? this.receiptId ?? ''
    ).trim();
    const queryParams: Record<string, string> = {};

    if (returnReceiptId && returnReceiptId !== 'new') {
      queryParams['returnReceiptId'] = returnReceiptId;
    }

    if (workOrderId === 'new') {
      const propertyId = (selection.propertyId || '').trim();
      const prefilledReceiptId = (selection.prefilledReceiptId || '').trim();
      const prefilledReceiptSplitKey = (selection.prefilledReceiptSplitKey || '').trim();

      if (prefilledReceiptId) {
        queryParams['receiptId'] = prefilledReceiptId;
      }
      if (prefilledReceiptSplitKey) {
        queryParams['receiptSplitKey'] = prefilledReceiptSplitKey;
      }
      if (propertyId) {
        queryParams['propertyId'] = propertyId;
      }

      void this.mobileRouter.navigate(['/mobile', 'maintenance', 'work-orders', 'new'], { queryParams });
      return;
    }

    void this.mobileRouter.navigate(['/mobile', 'maintenance', 'work-orders', workOrderId], { queryParams });
  }

  override openReceiptDialog(): void {
    const imageSrc = this.receiptPreviewDataUrl;
    if (!imageSrc) {
      this.mobileToastr.warning('Receipt file is not available.', 'Receipt');
      return;
    }

    this.releaseReceiptPreviewObjectUrl();
    const renderSrc = this.toBlobObjectUrl(imageSrc) ?? imageSrc;
    if (renderSrc.startsWith('blob:')) {
      this.receiptPreviewObjectUrl = renderSrc;
    }
    this.receiptPreviewViewerSrc = this.isReceiptPreviewPdf()
      ? this.sanitizer.bypassSecurityTrustResourceUrl(renderSrc)
      : null;
    this.receiptPreviewOpen = true;
    this.mobileChromeOverlayService.setPrimaryChromeHidden(true);
    this.markViewForCheck();
  }

  closeReceiptPreview(): void {
    this.receiptPreviewOpen = false;
    this.receiptPreviewViewerSrc = null;
    this.releaseReceiptPreviewObjectUrl();
    this.mobileChromeOverlayService.setPrimaryChromeHidden(false);
    this.markViewForCheck();
  }

  override ngOnDestroy(): void {
    this.mobileChromeOverlayService.setPrimaryChromeHidden(false);
    this.releaseReceiptPreviewObjectUrl();
    super.ngOnDestroy();
  }

  private releaseReceiptPreviewObjectUrl(): void {
    if (!this.receiptPreviewObjectUrl) {
      return;
    }
    URL.revokeObjectURL(this.receiptPreviewObjectUrl);
    this.receiptPreviewObjectUrl = null;
  }
  //#endregion
}
