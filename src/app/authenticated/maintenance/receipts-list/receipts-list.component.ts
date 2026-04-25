import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReceiptDisplayList, ReceiptResponse } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';

@Component({
  standalone: true,
  selector: 'app-receipts-list',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './receipts-list.component.html',
  styleUrl: './receipts-list.component.scss'
})
export class ReceiptsListComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() isActiveTab = false;
  @Input() embeddedInMaintenance = false;
  @Input() refreshTrigger: number = 0;
  @Output() receiptSelect = new EventEmitter<number | null>();

  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  receipts: ReceiptResponse[] = [];
  receiptsDisplay: ReceiptDisplayList[] = [];
  allReceipts: ReceiptDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();

  selectedProperty: PropertyResponse | null = null;
  selectedPropertyId: string | null = null;

  receiptDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderDisplay: { displayAs: 'WO Code(s)', wrap: true, maxWidth: '25ch' },
    receipt: { displayAs: 'Receipt', wrap: false, sort: false, maxWidth: '12ch', alignment: 'center'  },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'center'  },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '25ch' },
    splitSummaryDisplay: { displayAs: 'Splits', wrap: false, maxWidth: '10ch', alignment: 'center' },
    splitTotalDisplay: { displayAs: 'Split Total', wrap: false, maxWidth: '12ch', alignment: 'center' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '20ch', alignment: 'center' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor(
    private receiptService: ReceiptService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private authService: AuthService,
    private router: Router,
    private dialog: MatDialog,
    private toastr: ToastrService
  ) {}

  //#region Receipts List
  ngOnInit(): void {
    if (!this.isActiveTab) {
      return;
    }
    this.loadPropertyLookup();
    this.getReceipts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isActiveTab']) {
      if (!this.isActiveTab) {
        return;
      }
      this.loadPropertyLookup();
      this.getReceipts();
      return;
    }

    if (!this.isActiveTab) {
      return;
    }

    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.selectedPropertyId = null;
        this.getReceipts();
        return;
      }

      if (this.selectedPropertyId !== propertyId) {
        this.selectedPropertyId = propertyId;
        this.getReceipts();
      }
    }
    if (changes['officeId'] && !this.property?.propertyId) {
      this.getReceipts();
    }
    if (changes['refreshTrigger']) {
      this.getReceipts();
    }
  }

  getReceipts(): void {
    this.isServiceError = false;
    this.isLoading = true;
    const propertyId = this.property?.propertyId ?? null;
    const officeId = this.officeId ?? null;
    this.receiptService.getReceipts(propertyId, officeId).pipe(take(1), finalize(() => (this.isLoading = false))).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        this.receipts = receipts || [];
        this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
        this.applyPropertyCodesToDisplays();
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.receipts = [];
        this.allReceipts = [];
        this.receiptsDisplay = [];
      }
    });
  }

  addReceipt(): void {
    if (!this.property) return;
    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit(null);
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, ['new']);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  deleteReceipt(event: ReceiptDisplayList): void {
    this.receiptService.deleteReceipt(event.receiptId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Receipt deleted successfully', CommonMessage.Success);
        this.receipts = this.receipts.filter(receipt => receipt.receiptId !== event.receiptId);
        this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  goToReceipt(event: ReceiptDisplayList): void {
    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit(event.receiptId);
      return;
    }
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, [String(event.receiptId)]);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  openReceiptDialog(item: ReceiptDisplayList): void {
    this.receiptService.getReceiptById(item.receiptId).pipe(take(1)).subscribe({
      next: (receipt: ReceiptResponse) => {
        const fd = receipt?.fileDetails;
        const imageSrc =
          fd?.dataUrl ||
          (fd?.file && fd?.contentType ? `data:${fd.contentType};base64,${fd.file}` : null);
        if (!imageSrc) {
          this.toastr.warning('Receipt image is not available.', 'Receipt');
          return;
        }
        const data: ImageViewDialogData = { imageSrc, title: 'Receipt' };
        this.dialog.open(ImageViewDialogComponent, { data, width: '90vw', maxWidth: '600px' });
      },
      error: () => this.toastr.error('Unable to load receipt.', 'Receipt')
    });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.receiptsDisplay = this.showInactive
      ? [...this.allReceipts]
      : this.allReceipts.filter(receipt => receipt.isActive !== false);
  }

  loadPropertyLookup(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      return;
    }
    this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(take(1)).subscribe({
      next: properties => {
        this.propertyCodeLookup = new Map(
          (properties || []).map(property => [property.propertyId, property.propertyCode || ''])
        );
        this.applyPropertyCodesToDisplays();
        this.applyFilters();
      }
    });
  }

  applyPropertyCodesToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => ({
      ...receipt,
      propertyCode: (receipt.propertyIds || [])
        .map(propertyId => this.propertyCodeLookup.get(propertyId) || propertyId)
        .filter(code => (code || '').trim().length > 0)
        .join(', ')
    }));
  }
  //#endregion
}
