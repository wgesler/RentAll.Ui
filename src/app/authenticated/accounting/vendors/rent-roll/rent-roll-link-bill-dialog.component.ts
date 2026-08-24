import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { take } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { ReceiptResponse, isReceiptCompanyPropertyId } from '../../../maintenance/models/receipt.model';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';

export interface RentRollLinkBillDialogData {
  officeId: number | null;
  propertyId: string;
  propertyCode: string;
  vendorId: string | null;
  vendorName: string;
  agreementLineId: string;
  billDate: string | null;
  searchDateRange: { startDate: string | null; endDate: string | null };
}

export interface RentRollLinkBillOption {
  receiptId: string;
  receiptCode: string;
  receiptDate: string | null;
  vendorName: string;
  description: string;
  amountDisplay: string;
  linkStatus: string;
  selectable: boolean;
  vendorMatches: boolean;
}

export interface RentRollLinkBillDialogResult {
  receiptId: string;
}

@Component({
  standalone: true,
  selector: 'app-rent-roll-link-bill-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './rent-roll-link-bill-dialog.component.html',
  styleUrl: './rent-roll-link-bill-dialog.component.scss'
})
export class RentRollLinkBillDialogComponent {
  data = inject<RentRollLinkBillDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<RentRollLinkBillDialogComponent, RentRollLinkBillDialogResult | undefined>>(MatDialogRef);
  private receiptService = inject(ReceiptService);
  private formatter = inject(FormatterService);

  billOptions: RentRollLinkBillOption[] = [];
  selectedReceiptId: string | null = null;
  isLoading = true;
  loadError = false;
  readonly displayedColumns = ['select', 'receiptCode', 'receiptDate', 'vendorName', 'description', 'amountDisplay', 'linkStatus'];

  constructor() {
    this.loadBillOptions();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onLink(): void {
    const receiptId = (this.selectedReceiptId || '').trim();
    if (!receiptId) {
      return;
    }
    this.dialogRef.close({ receiptId });
  }

  selectBill(receiptId: string, selectable: boolean): void {
    if (!selectable) {
      return;
    }
    this.selectedReceiptId = receiptId;
  }

  private loadBillOptions(): void {
    const officeId = Number(this.data.officeId ?? 0);
    if (!Number.isFinite(officeId) || officeId <= 0) {
      this.isLoading = false;
      this.loadError = true;
      return;
    }

    const request: MaintenanceListSearchRequest = {
      officeIds: [officeId],
      propertyId: isReceiptCompanyPropertyId(this.data.propertyId) ? null : this.data.propertyId,
      startDate: this.data.searchDateRange.startDate ?? null,
      endDate: this.data.searchDateRange.endDate ?? null,
      includeInactive: false,
      receiptKind: 1
    };

    this.receiptService.searchReceipts(request).pipe(take(1)).subscribe({
      next: receipts => {
        this.billOptions = this.buildBillOptions(receipts || []);
        this.selectedReceiptId = this.billOptions.find(option => option.selectable && option.linkStatus === 'Linked')?.receiptId
          ?? this.billOptions.find(option => option.selectable)?.receiptId
          ?? null;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = true;
      }
    });
  }

  private buildBillOptions(receipts: ReceiptResponse[]): RentRollLinkBillOption[] {
    const propertyId = (this.data.propertyId || '').trim().toLowerCase();
    const agreementLineId = this.toAgreementLineIdNumber(this.data.agreementLineId);
    const billPeriod = this.resolveBillMatchPeriod(this.data.billDate);

    return receipts
      .map(receipt => this.mapBillOption(receipt, propertyId, agreementLineId, billPeriod))
      .filter((option): option is RentRollLinkBillOption => !!option)
      .sort((left, right) =>
        Number(right.selectable) - Number(left.selectable)
        || Number(right.vendorMatches) - Number(left.vendorMatches)
        || left.receiptDate.localeCompare(right.receiptDate, undefined, { sensitivity: 'base' })
        || left.receiptCode.localeCompare(right.receiptCode, undefined, { sensitivity: 'base', numeric: true })
      );
  }

  private mapBillOption(
    receipt: ReceiptResponse,
    propertyId: string,
    agreementLineId: number | null,
    billPeriod: string | null
  ): RentRollLinkBillOption | null {
    const receiptPropertyIds = (receipt.propertyIds || [])
      .map(id => (id || '').trim().toLowerCase())
      .filter(id => !!id);
    const matchesProperty = !propertyId
      || receiptPropertyIds.length === 0
      || receiptPropertyIds.includes(propertyId);
    if (!matchesProperty) {
      return null;
    }

    const receiptBillPeriod = this.resolveBillMatchPeriod(receipt.receiptDate);
    if (billPeriod && receiptBillPeriod && receiptBillPeriod !== billPeriod) {
      return null;
    }

    const receiptAgreementLineId = this.toAgreementLineIdNumber(receipt.agreementLineId);
    const vendorId = (this.data.vendorId || '').trim().toLowerCase();
    const receiptVendorId = (receipt.vendorId || '').trim().toLowerCase();
    const vendorMatches = !!vendorId && vendorId === receiptVendorId;
    let linkStatus = 'Available';
    let selectable = true;
    if (receiptAgreementLineId != null) {
      if (agreementLineId != null && receiptAgreementLineId === agreementLineId) {
        linkStatus = 'Linked';
      } else {
        linkStatus = 'Linked to another line';
        selectable = false;
      }
    }

    return {
      receiptId: receipt.receiptId,
      receiptCode: receipt.receiptCode || receipt.receiptId,
      receiptDate: this.formatter.formatDateString(receipt.receiptDate) || '—',
      vendorName: (receipt.vendorName || '').trim() || '—',
      description: (receipt.description || '').trim() || '—',
      amountDisplay: this.formatter.currencyUsd(Number(receipt.amount || 0)),
      linkStatus,
      selectable,
      vendorMatches
    };
  }

  private resolveBillMatchPeriod(value: string | null | undefined): string | null {
    const normalizedDate = (value || '').trim();
    if (!normalizedDate) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-\d{2}/.exec(normalizedDate);
    if (!match) {
      return null;
    }
    return `${match[1]}-${match[2]}`;
  }

  private toAgreementLineIdNumber(value: string | number | null | undefined): number | null {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.trunc(parsed);
  }
}
