import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
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
      receiptKind: 2,
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
          receiptPath: receipt.receiptPath ?? null
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
          if (!file.contentType?.startsWith('image/')) {
            this.images = [...this.images, file];
            finish();
            continue;
          }
          this.adminReceiptService.getImage(this.organizationId, file.path).pipe(take(1)).subscribe({
            next: (details) => {
              if (version !== this.loadVersion) {
                return;
              }
              this.images = [...this.images, {
                ...file,
                fileName: details?.fileName || file.fileName,
                contentType: details?.contentType || file.contentType,
                dataUrl: details?.dataUrl ?? null
              }];
              finish();
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
    this.replacementImageUrl = image.dataUrl;
    if (this.replacementImageUrl || !image.contentType?.startsWith('image/')) {
      return;
    }

    this.adminReceiptService.getImage(this.organizationId, image.path).pipe(take(1)).subscribe({
      next: (details) => {
        if (this.selectedPath !== image.path) {
          return;
        }
        this.replacementFileName = details?.fileName || this.replacementFileName;
        this.replacementImageUrl = details?.contentType?.startsWith('image/') ? details.dataUrl : null;
      }
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
