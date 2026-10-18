import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { MaterialModule } from '../../../material.module';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { TicketReceiptDialogComponent } from '../../tickets/ticket/ticket-receipt-dialog.component';
import { AdminReceiptService, MissingReceipt, UnassignedReceiptImage } from '../services/admin-receipt.service';
import { ReceiptService } from '../../maintenance/services/receipt.service';

@Component({
  standalone: true,
  selector: 'app-admin-receipts',
  templateUrl: './admin-receipts.component.html',
  styleUrl: './admin-receipts.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class AdminReceiptsComponent implements OnChanges {
  @Input() organizationId = '';
  @Input() officeId: number | null = null;
  @Input() officeIds: number[] = [];
  @Input() startDate: string | null = null;
  @Input() endDate: string | null = null;
  @Input() searchNonce = 0;

  private adminReceiptService = inject(AdminReceiptService);
  private receiptService = inject(ReceiptService);
  private dialog = inject(MatDialog);
  private pdfThumbnailService = inject(PdfThumbnailService);
  private toastr = inject(ToastrService);

  receipts: MissingReceipt[] = [];
  images: UnassignedReceiptImage[] = [];
  selectedReceiptId = '';
  selectedPath = '';
  currentImageUrl: string | null = null;
  currentFileName = '';
  replacementImageUrl: string | null = null;
  replacementFileName = '';
  isLoading = false;
  filesLoading = false;
  isMatching = false;
  private loadVersion = 0;

  get selectedReceipt(): MissingReceipt | null {
    return this.receipts.find(receipt => receipt.receiptId === this.selectedReceiptId) ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['searchNonce'] || this.searchNonce < 1 || !this.organizationId) {
      return;
    }
    this.load();
  }

  load(): void {
    const version = ++this.loadVersion;
    this.isLoading = true;
    this.filesLoading = true;
    this.selectedReceiptId = '';
    this.selectedPath = '';
    this.currentImageUrl = null;
    this.currentFileName = '';
    this.replacementImageUrl = null;
    this.replacementFileName = '';
    this.receipts = [];
    this.images = [];
    this.receiptService.searchReceipts({
      officeIds: this.officeIds,
      isActive: null,
      includeInactive: true,
      startDate: this.startDate,
      endDate: this.endDate,
      organizationId: this.organizationId
    }).pipe(take(1)).subscribe({
      next: (receipts) => {
        if (version !== this.loadVersion) {
          return;
        }
        this.receipts = (receipts || []).map(receipt => ({
          receiptId: receipt.receiptId,
          officeId: receipt.officeId,
          officeName: receipt.officeName,
          receiptCode: receipt.receiptCode,
          receiptDate: receipt.receiptDate,
          amount: receipt.amount,
          vendorName: receipt.vendorName ?? null,
          description: receipt.description,
          receiptPath: receipt.receiptPath ?? null,
          noReceiptAvailable: receipt.noReceiptAvailable === true
        }));
        this.isLoading = false;
      },
      error: () => {
        if (version !== this.loadVersion) {
          return;
        }
        this.receipts = [];
        this.isLoading = false;
        this.toastr.error('The receipts could not be loaded.', CommonMessage.Error);
      }
    });
    this.loadFiles(version);
  }

  loadFiles(version: number): void {
    this.adminReceiptService.getFiles(this.organizationId, this.officeId).pipe(take(1)).subscribe({
      next: (files) => {
        if (version !== this.loadVersion) {
          return;
        }
        const list = files || [];
        if (list.length === 0) {
          this.filesLoading = false;
          return;
        }
        let pending = list.length;
        const finish = () => {
          if (version !== this.loadVersion) {
            return;
          }
          pending -= 1;
          if (pending <= 0) {
            this.filesLoading = false;
          }
        };
        for (const file of list) {
          const pdf = this.isPdfFile(file.contentType, file.fileName);
          if (!file.contentType?.startsWith('image/') && !pdf) {
            this.images = [...this.images, file];
            finish();
            continue;
          }
          this.adminReceiptService.getImage(this.organizationId, file.path).pipe(take(1)).subscribe({
            next: (details) => {
              if (version !== this.loadVersion) {
                return;
              }
              const contentType = details?.contentType || file.contentType;
              const dataUrl = details?.dataUrl ?? null;
              const addFile = (thumbnailUrl: string | null) => {
                if (version !== this.loadVersion) {
                  return;
                }
                this.images = [...this.images, {
                  ...file,
                  fileName: details?.fileName || file.fileName,
                  contentType,
                  dataUrl,
                  thumbnailUrl
                }];
                finish();
              };
              if (pdf || this.isPdfFile(contentType, details?.fileName)) {
                void this.pdfThumbnailService.getFirstPageDataUrl(dataUrl, 240).then(addFile);
                return;
              }
              addFile(dataUrl);
            },
            error: () => finish()
          });
        }
      },
      error: () => {
        if (version !== this.loadVersion) {
          return;
        }
        this.images = [];
        this.filesLoading = false;
        this.toastr.error('The unassigned files could not be loaded.', CommonMessage.Error);
      }
    });
  }

  isPdfFile(contentType: string | null | undefined, fileName: string | null | undefined): boolean {
    return (contentType || '').toLowerCase().includes('pdf') || (fileName || '').toLowerCase().endsWith('.pdf');
  }

  openReceipt(receipt: MissingReceipt): void {
    this.selectReceipt(receipt);
    this.dialog.open(TicketReceiptDialogComponent, {
      width: '95vw',
      maxWidth: '1300px',
      maxHeight: '95vh',
      disableClose: true,
      autoFocus: false,
      data: {
        property: null,
        ticketId: null,
        receiptId: receipt.receiptId,
        organizationId: this.organizationId
      }
    }).afterClosed().pipe(take(1)).subscribe(result => {
      if (result?.saved) {
        this.load();
      }
    });
  }

  selectReceipt(receipt: MissingReceipt): void {
    this.selectedReceiptId = receipt.receiptId;
    this.currentImageUrl = null;
    this.currentFileName = '';
    if (!receipt.receiptPath) {
      return;
    }

    this.currentFileName = receipt.receiptPath.split('/').pop() || 'Receipt file';
    this.adminReceiptService.getImage(this.organizationId, receipt.receiptPath).pipe(take(1)).subscribe({
      next: (details) => {
        if (this.selectedReceiptId !== receipt.receiptId) {
          return;
        }
        this.currentFileName = details?.fileName || this.currentFileName;
        this.currentImageUrl = details?.contentType?.startsWith('image/') ? details.dataUrl : null;
      }
    });
  }

  selectReplacement(image: UnassignedReceiptImage): void {
    this.selectedPath = image.path;
    this.replacementFileName = image.fileName || 'Receipt file';
    this.replacementImageUrl = image.contentType?.startsWith('image/') ? image.dataUrl : null;
    if (image.dataUrl) {
      this.openReplacementDialog(image.dataUrl, this.replacementFileName);
      return;
    }

    this.adminReceiptService.getImage(this.organizationId, image.path).pipe(take(1)).subscribe({
      next: (details) => {
        if (this.selectedPath !== image.path) {
          return;
        }
        this.replacementFileName = details?.fileName || this.replacementFileName;
        const dataUrl = details?.dataUrl ?? null;
        if (details?.contentType?.startsWith('image/')) {
          this.replacementImageUrl = dataUrl;
        }
        if (dataUrl) {
          this.openReplacementDialog(dataUrl, this.replacementFileName);
        }
      }
    });
  }

  openReplacementDialog(imageSrc: string, title: string): void {
    this.dialog.open(ImageViewDialogComponent, {
      data: { imageSrc, title: title || 'Receipt' },
      width: '60vw',
      height: '88vh',
      minWidth: '320px',
      minHeight: '320px',
      maxWidth: '95vw',
      panelClass: 'image-view-dialog-panel'
    });
  }

  match(): void {
    if (!this.selectedReceiptId || !this.selectedPath || this.isMatching) {
      return;
    }

    this.isMatching = true;
    this.adminReceiptService.match(this.organizationId, this.selectedReceiptId, this.selectedPath).pipe(take(1)).subscribe({
      next: () => {
        this.isMatching = false;
        this.toastr.success('Receipt file switched.', CommonMessage.Success);
        this.load();
      },
      error: () => {
        this.isMatching = false;
        this.toastr.error('The receipt file could not be switched.', CommonMessage.Error);
      }
    });
  }
}
