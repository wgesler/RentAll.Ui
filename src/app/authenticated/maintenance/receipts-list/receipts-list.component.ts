import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { EMPTY, finalize, switchMap, take } from 'rxjs';
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
import { ReceiptDisplayList, ReceiptRequest, ReceiptResponse, ReceiptSelection } from '../models/receipt.model';
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
  @Output() receiptSelect = new EventEmitter<ReceiptSelection>();

  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  receipts: ReceiptResponse[] = [];
  receiptsDisplay: ReceiptDisplayList[] = [];
  allReceipts: ReceiptDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();

  isAdmin = false;
  canEditIsActiveCheckbox = false;

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
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
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
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    if (!this.isActiveTab) {
      return;
    }
    this.loadPropertyLookup();
    this.getReceipts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isActiveTab']) {
      this.setIsActiveCheckboxEditability();
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
    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit({
        receiptId: null,
        officeId: this.property?.officeId ?? this.officeId ?? null,
        propertyId: (this.property?.propertyId || '').trim() || null
      });
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, ['new']);
    const propertyId = (this.property?.propertyId || '').trim();
    this.router.navigate([url], {
      queryParams: propertyId ? { propertyId } : {},
      state: this.property ? { property: this.property } : undefined
    });
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
      const selectedPropertyId = (event.propertyIds || [])
        .map(propertyId => (propertyId || '').trim())
        .find(propertyId => propertyId.length > 0) || null;
      this.receiptSelect.emit({
        receiptId: event.receiptId,
        officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
        propertyId: selectedPropertyId
      });
      return;
    }
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, [String(event.receiptId)]);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  onReceiptCheckboxChange(event: ReceiptDisplayList): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }
    const changedCheckboxColumn = (event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          if (receipt.isActive === nextValue) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          const payload = this.buildReceiptIsActiveUpdateRequest(receipt, nextValue);
          return this.receiptService.updateReceipt(payload);
        })
      )
      .subscribe({
        next: saved => {
          this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyPropertyCodesToDisplays();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
        },
        error: () => {
          this.applyReceiptIsActiveValue(event.receiptId, previousValue);
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
        }
      });
  }

  openReceiptDialog(item: ReceiptDisplayList): void {
    this.receiptService.getReceiptById(item.receiptId).pipe(take(1)).subscribe({
      next: (receipt: ReceiptResponse) => {
        const fd = receipt?.fileDetails;
        const imageSrc =
          fd?.dataUrl ||
          (fd?.file && fd?.contentType ? `data:${fd.contentType};base64,${fd.file}` : null);
        if (!imageSrc) {
          this.toastr.warning('Receipt file is not available.', 'Receipt');
          return;
        }
        const data: ImageViewDialogData = { imageSrc, title: 'Receipt' };
        this.dialog.open(ImageViewDialogComponent, {
          data,
          width: '60vw',
          height: '88vh',
          maxWidth: '60vw',
          maxHeight: '88vh',
          panelClass: 'image-view-dialog-panel'
        });
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

  //#region IsActive
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.receiptDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  buildReceiptIsActiveUpdateRequest(receipt: ReceiptResponse, isActive: boolean): ReceiptRequest {
    const splits = (receipt.splits || []).map(s => ({
      amount: Number(s.amount) || 0,
      description: String(s.description ?? '').trim(),
      workOrder: s.workOrder != null && String(s.workOrder).trim().length > 0 ? String(s.workOrder).trim() : ''
    }));
    return {
      receiptId: receipt.receiptId,
      organizationId: receipt.organizationId,
      officeId: receipt.officeId,
      propertyIds: [...(receipt.propertyIds || [])],
      maintenanceId: receipt.maintenanceId,
      amount: Number(receipt.amount) || 0,
      description: String(receipt.description ?? '').trim(),
      splits,
      receiptPath: receipt.receiptPath ?? null,
      isActive
    };
  }

  syncReceiptRowFromServer(receipt: ReceiptResponse): void {
    this.receipts = this.receipts.map(r => (r.receiptId === receipt.receiptId ? receipt : r));
    this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
    this.applyPropertyCodesToDisplays();
    this.applyFilters();
  }

  applyReceiptIsActiveValue(receiptId: number, isActive: boolean): void {
    this.allReceipts = (this.allReceipts || []).map(r => (r.receiptId === receiptId ? { ...r, isActive } : r));
    this.receipts = (this.receipts || []).map(r => (r.receiptId === receiptId ? { ...r, isActive } : r));
    this.applyFilters();
  }
  //#endregion
}
