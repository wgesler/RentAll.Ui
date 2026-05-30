import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { EMPTY, finalize, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { BankCardResponse } from '../../organizations/models/bank.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReceiptDisplayList, ReceiptRequest, ReceiptResponse, ReceiptSelection } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  standalone: true,
  selector: 'app-receipts-list',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './receipts-list.component.html',
  styleUrl: './receipts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptsListComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() isActiveTab = false;
  @Input() embeddedInMaintenance = false;
  @Input() refreshTrigger: number = 0;
  @Output() receiptSelect = new EventEmitter<ReceiptSelection>();
  @Output() workOrderSelect = new EventEmitter<{ workOrderId: string | null; propertyId: string | null }>();

  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  receipts: ReceiptResponse[] = [];
  receiptsDisplay: ReceiptDisplayList[] = [];
  allReceipts: ReceiptDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();
  bankCardOptionsByOfficeId = new Map<number, Array<{ bankCardId: number; label: string }>>();
  vendorOptionsByOfficeId = new Map<number, Array<{ contactId: string; label: string }>>();

  isAdmin = false;
  canEditIsActiveCheckbox = false;

  selectedProperty: PropertyResponse | null = null;
  selectedPropertyId: string | null = null;
  persistedFilterVal = '';
  private readonly receiptListFilterStorageKey = 'maintenance.receiptsList.filter';

  receiptDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderDisplay: { displayAs: 'WO Code(s)', wrap: true, maxWidth: '18ch' },
    receiptTypeDisplay: { displayAs: 'Type(s)', wrap: true, maxWidth: '15ch' },
    receipt: { displayAs: 'Receipt', wrap: false, sort: false, maxWidth: '12ch', alignment: 'center'  },
    receiptDate: { displayAs: 'Receipt Date', wrap: false, maxWidth: '22ch', alignment: 'center', editableType: 'date', suppressRowClick: true },
    vendorDisplay: { displayAs: 'Vendor', wrap: false, maxWidth: '25ch', editableType: 'text', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter vendors...' },
    bankCardDropdown: { displayAs: 'Bank Card', wrap: true, maxWidth: '25ch', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter bank cards...' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'center'  },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '25ch' },
    createdBy: { displayAs: 'Created By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor(
    private receiptService: ReceiptService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private accountingOfficeService: AccountingOfficeService,
    private contactService: ContactService,
    private workOrderService: WorkOrderService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  //#region Receipts List
  ngOnInit(): void {
    this.persistedFilterVal = this.readPersistedFilterValue();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.loadBankCardOptions();
    this.loadVendorOptions();
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
    this.receiptService.getReceipts(propertyId, officeId).pipe(take(1), finalize(() => {
      this.isLoading = false;
      this.markViewForCheck();
    })).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        this.receipts = receipts || [];
        this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
        this.applyBankCardDropdownsToDisplays();
        this.applyVendorCellsToDisplays();
        this.applyPropertyCodesToDisplays();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.receipts = [];
        this.allReceipts = [];
        this.receiptsDisplay = [];
        this.markViewForCheck();
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
        this.applyBankCardDropdownsToDisplays();
        this.applyVendorCellsToDisplays();
        this.applyPropertyCodesToDisplays();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.markViewForCheck();
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

  goToWorkOrderFromCode(event: { rowItem?: ReceiptDisplayList; workOrderCode?: string }): void {
    const rowItem = event?.rowItem;
    const targetWorkOrderCode = (event?.workOrderCode || '').trim();
    if (!rowItem || !targetWorkOrderCode) {
      return;
    }

    const propertyId =
      (rowItem.propertyIds || []).map(id => (id || '').trim()).find(id => id.length > 0)
      || (this.property?.propertyId || '').trim()
      || (this.selectedPropertyId || '').trim()
      || null;
    const officeId = Number(rowItem.officeId || this.officeId || 0) || null;

    this.workOrderService.getWorkOrders(propertyId, officeId).pipe(take(1)).subscribe({
      next: workOrders => {
        const matchingWorkOrder = (workOrders || []).find(
          workOrder => (workOrder.workOrderCode || '').trim().toLowerCase() === targetWorkOrderCode.toLowerCase()
        );
        if (!matchingWorkOrder) {
          this.toastr.warning(`Unable to locate ${targetWorkOrderCode}.`, 'Work Order');
          this.markViewForCheck();
          return;
        }

        const workOrderId = String(matchingWorkOrder.workOrderId || '').trim();
        const resolvedPropertyId = (matchingWorkOrder.propertyId || propertyId || '').trim();
        if (!workOrderId || !resolvedPropertyId) {
          this.toastr.error('Unable to open work order: missing work order context.', 'Work Order');
          return;
        }

        if (this.embeddedInMaintenance) {
          this.workOrderSelect.emit({
            workOrderId,
            propertyId: resolvedPropertyId
          });
          return;
        }

        const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [resolvedPropertyId]);
        this.router.navigate([maintenanceUrl], {
          queryParams: {
            tab: 3,
            workOrderId
          }
        });
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to load work order.', 'Work Order');
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Inline Receipt Edits
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
          this.applyBankCardDropdownsToDisplays();
          this.applyVendorCellsToDisplays();
          this.applyPropertyCodesToDisplays();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
          this.markViewForCheck();
        },
        error: () => {
          this.applyReceiptIsActiveValue(event.receiptId, previousValue);
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
  }

  onReceiptDropdownChange(event: ReceiptDisplayList & { __changedDropdownColumn?: string }): void {
    if (!this.isAdmin) {
      return;
    }
    const changedColumn = event.__changedDropdownColumn || '';
    if (changedColumn !== 'bankCardDropdown' && changedColumn !== 'vendorDisplay') {
      return;
    }
    if (changedColumn === 'bankCardDropdown') {
      const selectedLabel = String(event.bankCardDropdown?.value || '').trim();
      if (!selectedLabel) {
        return;
      }
      const selectedBankCardId = this.resolveBankCardIdFromLabel(event.officeId, selectedLabel);
      if (selectedBankCardId === null) {
        return;
      }

      this.receiptService
        .getReceiptById(event.receiptId)
        .pipe(
          take(1),
          switchMap(receipt => {
          const currentBankCardId = Number(receipt.bankCardId ?? 0);
            if (currentBankCardId === selectedBankCardId) {
              this.syncReceiptRowFromServer(receipt);
              return EMPTY;
            }
            const payload = this.buildReceiptBankCardInlineUpdateRequest(receipt, selectedBankCardId);
            return this.receiptService.updateReceipt(payload);
          })
        )
        .subscribe({
          next: saved => {
            this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyBankCardDropdownsToDisplays();
            this.applyVendorCellsToDisplays();
            this.applyPropertyCodesToDisplays();
            this.applyFilters();
            this.toastr.success('Receipt updated.', CommonMessage.Success);
            this.markViewForCheck();
          },
          error: () => {
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyBankCardDropdownsToDisplays();
            this.applyVendorCellsToDisplays();
            this.applyPropertyCodesToDisplays();
            this.applyFilters();
            this.toastr.error('Unable to update receipt.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      return;
    }

    const selectedVendorLabel = this.normalizeVendorDisplayText((event.vendorDisplay as { value?: string } | undefined)?.value || '');
    if (!selectedVendorLabel) {
      return;
    }
    const selectedVendorId = this.resolveVendorIdFromLabel(event.officeId, selectedVendorLabel);
    if (!selectedVendorId) {
      return;
    }

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          const isBill = Number(receipt.bankCardId ?? 0) === 0;
          if (!isBill) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          const currentVendorId = String(receipt.vendorId || '').trim();
          if (currentVendorId === selectedVendorId) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          const payload = this.buildReceiptVendorDropdownUpdateRequest(receipt, selectedVendorId);
          return this.receiptService.updateReceipt(payload);
        })
      )
      .subscribe({
        next: saved => {
          this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyBankCardDropdownsToDisplays();
          this.applyVendorCellsToDisplays();
          this.applyPropertyCodesToDisplays();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
          this.markViewForCheck();
        },
        error: () => {
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyBankCardDropdownsToDisplays();
          this.applyVendorCellsToDisplays();
          this.applyPropertyCodesToDisplays();
          this.applyFilters();
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
  }

  onReceiptInlineEditChange(event: ReceiptDisplayList & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    if (!this.isAdmin) {
      return;
    }
    const changedInlineColumn = event.__changedInlineColumn || '';
    if (changedInlineColumn !== 'vendorDisplay' && changedInlineColumn !== 'receiptDate') {
      return;
    }
    if (changedInlineColumn === 'receiptDate') {
      const nextReceiptDate = this.normalizeDateInputValue(event.__inlineValue);

      this.receiptService
        .getReceiptById(event.receiptId)
        .pipe(
          take(1),
          switchMap(receipt => {
            const currentReceiptDate = this.normalizeDateInputValue(receipt.receiptDate);
            if (!nextReceiptDate || nextReceiptDate === currentReceiptDate) {
              this.syncReceiptRowFromServer(receipt);
              return EMPTY;
            }
            const payload = this.buildReceiptDateInlineUpdateRequest(receipt, nextReceiptDate);
            return this.receiptService.updateReceipt(payload);
          })
        )
        .subscribe({
          next: saved => {
            this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyBankCardDropdownsToDisplays();
            this.applyVendorCellsToDisplays();
            this.applyPropertyCodesToDisplays();
            this.applyFilters();
            this.toastr.success('Receipt updated.', CommonMessage.Success);
            this.markViewForCheck();
          },
          error: () => {
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyBankCardDropdownsToDisplays();
            this.applyVendorCellsToDisplays();
            this.applyPropertyCodesToDisplays();
            this.applyFilters();
            this.toastr.error('Unable to update receipt.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      return;
    }

    if (event.vendorDisplayReadOnly) {
      return;
    }
    const nextVendorName = this.normalizeVendorDisplayText(event.__inlineValue);
    let previousVendorName = '';

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          const isBill = Number(receipt.bankCardId ?? 0) === 0;
          if (isBill) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          previousVendorName = String(receipt.vendorName ?? '').trim();
          if (nextVendorName === previousVendorName) {
            return EMPTY;
          }
          const payload = this.buildReceiptVendorInlineUpdateRequest(receipt, nextVendorName);
          return this.receiptService.updateReceipt(payload);
        })
      )
      .subscribe({
        next: saved => {
          this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyBankCardDropdownsToDisplays();
          this.applyVendorCellsToDisplays();
          this.applyPropertyCodesToDisplays();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
          this.markViewForCheck();
        },
        error: () => {
          this.applyReceiptVendorDisplayValue(event.receiptId, previousVendorName);
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
  }

  openReceiptDialog(item: ReceiptDisplayList): void {
    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) {
      this.toastr.warning('Please allow pop-ups to open receipts in a new tab.', 'Receipt');
      return;
    }

    receiptWindow.document.title = 'Receipt';
    receiptWindow.document.body.innerHTML = '<p style="font-family: Arial, sans-serif; padding: 12px;">Loading receipt...</p>';

    this.receiptService.getReceiptById(item.receiptId).pipe(take(1)).subscribe({
      next: (receipt: ReceiptResponse) => {
        const fd = receipt?.fileDetails;
        const imageSrc =
          fd?.dataUrl ||
          (fd?.file && fd?.contentType ? `data:${fd.contentType};base64,${fd.file}` : null);
        if (!imageSrc) {
          receiptWindow.close();
          this.toastr.warning('Receipt file is not available.', 'Receipt');
          this.markViewForCheck();
          return;
        }
        this.renderReceiptInWindow(receiptWindow, imageSrc);
        this.markViewForCheck();
      },
      error: () => {
        receiptWindow.close();
        this.toastr.error('Unable to load receipt.', 'Receipt');
        this.markViewForCheck();
      }
    });
  }

  renderReceiptInWindow(receiptWindow: Window, imageSrc: string): void {
    const isPdf = /^data:application\/pdf/i.test(imageSrc);
    const renderSrc = this.toBlobObjectUrl(imageSrc) ?? imageSrc;
    const receiptDocument = receiptWindow.document;
    receiptDocument.open();
    receiptDocument.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          <style>
            html, body { height: 100%; margin: 0; background: #f5f6f8; }
            .receipt-frame { width: 100%; height: 100%; border: 0; background: #fff; }
            .receipt-image-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            .receipt-image { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          ${isPdf
            ? '<iframe id="receipt-frame" class="receipt-frame" title="Receipt PDF"></iframe>'
            : '<div class="receipt-image-wrap"><img id="receipt-image" class="receipt-image" alt="Receipt image" /></div>'}
        </body>
      </html>
    `);
    receiptDocument.close();

    const releaseUrl = () => {
      if (renderSrc.startsWith('blob:')) {
        URL.revokeObjectURL(renderSrc);
      }
    };
    receiptWindow.addEventListener('beforeunload', releaseUrl);

    if (isPdf) {
      const frame = receiptDocument.getElementById('receipt-frame') as HTMLIFrameElement | null;
      if (frame) {
        frame.src = renderSrc;
      }
      return;
    }

    const image = receiptDocument.getElementById('receipt-image') as HTMLImageElement | null;
    if (image) {
      image.src = renderSrc;
      image.addEventListener('load', releaseUrl, { once: true });
      image.addEventListener('error', releaseUrl, { once: true });
    }
  }

  toBlobObjectUrl(src: string): string | null {
    if (!src || !src.startsWith('data:')) {
      return null;
    }
    try {
      const dataUrlParts = src.split(',');
      if (dataUrlParts.length < 2) {
        return null;
      }
      const header = dataUrlParts[0];
      const data = dataUrlParts.slice(1).join(',');
      const mimeMatch = header.match(/^data:([^;]+)/i);
      const mimeType = mimeMatch?.[1] || 'application/octet-stream';
      const isBase64 = /;base64/i.test(header);
      const binaryString = isBase64 ? atob(data) : decodeURIComponent(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
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

  onTableFilterValueChanged(filterValue: string): void {
    this.persistedFilterVal = filterValue || '';
    try {
      sessionStorage.setItem(this.receiptListFilterStorageKey, this.persistedFilterVal);
    } catch {
      // no-op: ignore storage exceptions and keep in-memory value
    }
  }

  readPersistedFilterValue(): string {
    try {
      return sessionStorage.getItem(this.receiptListFilterStorageKey) || '';
    } catch {
      return '';
    }
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
        this.markViewForCheck();
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

  loadBankCardOptions(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: accountingOffices => {
        const officeMap = new Map<number, Array<{ bankCardId: number; label: string }>>();
        (accountingOffices || []).forEach(office => {
          const officeId = Number(office.officeId);
          if (!Number.isFinite(officeId) || officeId <= 0) {
            return;
          }
          const mappedCards = this.mappingService.mapBankCardsFromResponse(office.bankCards as BankCardResponse[]);
          const cardOptions = [
            { bankCardId: 0, label: 'Bill' },
            ...mappedCards
              .filter(card => Number(card.bankCardId) > 0)
              .map(card => ({
                bankCardId: Number(card.bankCardId),
                label: this.toBankCardOptionLabel(card)
              }))
          ];
          officeMap.set(officeId, cardOptions);
        });
        this.bankCardOptionsByOfficeId = officeMap;
        this.applyBankCardDropdownsToDisplays();
        this.applyVendorCellsToDisplays();
        this.applyFilters();
        this.markViewForCheck();
      }
    });
  }

  loadVendorOptions(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: contacts => {
        const officeMap = new Map<number, Array<{ contactId: string; label: string }>>();
        (contacts || [])
          .filter(contact => contact.entityTypeId === EntityType.Vendor)
          .forEach(contact => {
            const officeId = Number(contact.officeId);
            const contactId = String(contact.contactId || '').trim();
            if (!Number.isFinite(officeId) || officeId <= 0 || contactId.length === 0) {
              return;
            }
            const rows = officeMap.get(officeId) || [];
            rows.push({
              contactId,
              label: this.normalizeVendorDisplayText(this.utilityService.getVendorDropdownLabel(contact))
            });
            officeMap.set(officeId, rows);
          });
        this.vendorOptionsByOfficeId = officeMap;
        this.applyVendorCellsToDisplays();
        this.applyFilters();
        this.markViewForCheck();
      }
    });
  }

  applyBankCardDropdownsToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => {
      const officeId = Number(receipt.officeId ?? 0);
      const bankCardId = Number(receipt.bankCardId ?? 0);
      const optionsForOffice = this.bankCardOptionsByOfficeId.get(officeId) || [{ bankCardId: 0, label: 'Bill' }];
      const optionLabels = optionsForOffice.map(option => option.label);
      const selectedLabel =
        optionsForOffice.find(option => option.bankCardId === bankCardId)?.label
        || (receipt.bankCardDisplayName || '').trim()
        || 'Bill';
      return {
        ...receipt,
        receiptDateReadOnly: !this.isAdmin,
        bankCardDropdown: {
          value: selectedLabel,
          isOverridable: this.isAdmin,
          options: optionLabels,
          toString: () => selectedLabel
        }
      };
    });
  }

  applyVendorCellsToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => {
      const officeId = Number(receipt.officeId ?? 0);
      const isBill = Number(receipt.bankCardId ?? 0) === 0;
      const vendorName = this.normalizeVendorDisplayText(receipt.vendorName);
      if (!isBill) {
        return {
          ...receipt,
          vendorDisplay: vendorName,
          vendorDisplayReadOnly: !this.isAdmin,
          vendorDisplayClickToEdit: this.isAdmin,
          vendorDisplayEditing: false
        };
      }

      const vendorOptionsForOffice = this.vendorOptionsByOfficeId.get(officeId) || [];
      const vendorLabels = vendorOptionsForOffice.map(option => option.label);
      const selectedVendorLabel = this.normalizeVendorDisplayText(
        vendorOptionsForOffice.find(option => option.contactId === String(receipt.vendorId || '').trim())?.label
        || vendorName
      );
      return {
        ...receipt,
        vendorDisplay: {
          value: selectedVendorLabel,
          isOverridable: this.isAdmin,
          options: vendorLabels,
          toString: () => selectedVendorLabel
        },
        vendorDisplayReadOnly: true
      };
    });
  }
  //#endregion

  //#region IsActive
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.receiptDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  buildReceiptIsActiveUpdateRequest(receipt: ReceiptResponse, isActive: boolean): ReceiptRequest {
    const splits = (receipt.splits || []).map(s => ({
      receiptSplitId: s.receiptSplitId ?? null,
      amount: Number(s.amount) || 0,
      description: String(s.description ?? '').trim(),
      workOrderId: s.workOrderId ?? null,
      workOrderCode: s.workOrderCode != null && String(s.workOrderCode).trim().length > 0 ? String(s.workOrderCode).trim() : '',
      workOrder: s.workOrder != null && String(s.workOrder).trim().length > 0 ? String(s.workOrder).trim() : '',
      receiptTypeId: s.receiptTypeId ?? 0
    }));
    return {
      receiptId: receipt.receiptId,
      organizationId: receipt.organizationId,
      officeId: receipt.officeId,
      propertyIds: [...(receipt.propertyIds || [])],
      receiptDate: receipt.receiptDate || '',
      maintenanceId: receipt.maintenanceId,
      amount: Number(receipt.amount) || 0,
      description: String(receipt.description ?? '').trim(),
      bankCardId: receipt.bankCardId ?? null,
      vendorId: receipt.vendorId ?? null,
      vendorName: receipt.vendorName ?? null,
      splits,
      receiptPath: receipt.receiptPath ?? null,
      isActive
    };
  }

  buildReceiptBankCardInlineUpdateRequest(receipt: ReceiptResponse, bankCardId: number): ReceiptRequest {
    return this.buildReceiptFieldUpdateRequest(receipt, { bankCardId });
  }

  buildReceiptVendorInlineUpdateRequest(receipt: ReceiptResponse, vendorName: string): ReceiptRequest {
    const normalizedVendorName = String(vendorName || '').trim();
    return this.buildReceiptFieldUpdateRequest(receipt, { vendorName: normalizedVendorName || null });
  }

  buildReceiptVendorDropdownUpdateRequest(receipt: ReceiptResponse, vendorId: string): ReceiptRequest {
    const normalizedVendorId = String(vendorId || '').trim() || null;
    return this.buildReceiptFieldUpdateRequest(receipt, { vendorId: normalizedVendorId });
  }

  buildReceiptDateInlineUpdateRequest(receipt: ReceiptResponse, receiptDate: string): ReceiptRequest {
    return this.buildReceiptFieldUpdateRequest(receipt, { receiptDate });
  }

  private buildReceiptFieldUpdateRequest(receipt: ReceiptResponse, fields: Partial<Pick<ReceiptRequest, 'bankCardId' | 'vendorId' | 'vendorName' | 'receiptDate' | 'isActive'>>): ReceiptRequest {
    const hasBankCardId = Object.prototype.hasOwnProperty.call(fields, 'bankCardId');
    const hasVendorId = Object.prototype.hasOwnProperty.call(fields, 'vendorId');
    const hasVendorName = Object.prototype.hasOwnProperty.call(fields, 'vendorName');
    const hasReceiptDate = Object.prototype.hasOwnProperty.call(fields, 'receiptDate');
    const hasIsActive = Object.prototype.hasOwnProperty.call(fields, 'isActive');
    const splits = (receipt.splits || []).map(s => ({
      receiptSplitId: s.receiptSplitId ?? null,
      amount: Number(s.amount) || 0,
      description: String(s.description ?? '').trim(),
      workOrderId: s.workOrderId ?? null,
      workOrderCode: s.workOrderCode != null && String(s.workOrderCode).trim().length > 0 ? String(s.workOrderCode).trim() : '',
      workOrder: s.workOrder != null && String(s.workOrder).trim().length > 0 ? String(s.workOrder).trim() : '',
      receiptTypeId: s.receiptTypeId ?? 0
    }));
    return {
      receiptId: receipt.receiptId,
      organizationId: receipt.organizationId,
      officeId: receipt.officeId,
      propertyIds: [...(receipt.propertyIds || [])],
      receiptDate: hasReceiptDate ? (fields.receiptDate || '') : (receipt.receiptDate || ''),
      maintenanceId: receipt.maintenanceId,
      amount: Number(receipt.amount) || 0,
      description: String(receipt.description ?? '').trim(),
      bankCardId: hasBankCardId ? (fields.bankCardId ?? null) : (receipt.bankCardId ?? null),
      vendorId: hasVendorId ? (fields.vendorId ?? null) : (receipt.vendorId ?? null),
      vendorName: hasVendorName ? (fields.vendorName ?? null) : (receipt.vendorName ?? null),
      splits,
      receiptPath: receipt.receiptPath ?? null,
      isActive: hasIsActive ? (fields.isActive ?? receipt.isActive) : receipt.isActive
    };
  }

  syncReceiptRowFromServer(receipt: ReceiptResponse): void {
    this.receipts = this.receipts.map(r => (r.receiptId === receipt.receiptId ? receipt : r));
    this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
    this.applyBankCardDropdownsToDisplays();
    this.applyVendorCellsToDisplays();
    this.applyPropertyCodesToDisplays();
    this.applyFilters();
  }

  applyReceiptIsActiveValue(receiptId: number, isActive: boolean): void {
    this.allReceipts = (this.allReceipts || []).map(r => (r.receiptId === receiptId ? { ...r, isActive } : r));
    this.receipts = (this.receipts || []).map(r => (r.receiptId === receiptId ? { ...r, isActive } : r));
    this.applyFilters();
  }

  applyReceiptVendorDisplayValue(receiptId: number, vendorDisplay: string): void {
    this.allReceipts = (this.allReceipts || []).map(r => (
      r.receiptId === receiptId ? { ...r, vendorDisplay: this.normalizeVendorDisplayText(vendorDisplay) } : r
    ));
    this.applyFilters();
  }

  resolveBankCardIdFromLabel(officeId: number | null | undefined, label: string): number | null {
    const parsedOfficeId = Number(officeId ?? 0);
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const options = this.bankCardOptionsByOfficeId.get(parsedOfficeId) || [];
    const matchingOption = options.find(option => option.label.trim().toLowerCase() === normalizedLabel);
    return matchingOption ? matchingOption.bankCardId : null;
  }

  resolveVendorIdFromLabel(officeId: number | null | undefined, label: string): string | null {
    const parsedOfficeId = Number(officeId ?? 0);
    const normalizedLabel = this.normalizeVendorDisplayText(label).toLowerCase();
    const options = this.vendorOptionsByOfficeId.get(parsedOfficeId) || [];
    const matchingOption = options.find(option => this.normalizeVendorDisplayText(option.label).toLowerCase() === normalizedLabel);
    return matchingOption ? matchingOption.contactId : null;
  }

  toBankCardOptionLabel(card: BankCardResponse): string {
    return (card?.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card);
  }

  normalizeVendorDisplayText(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    const withoutQuotes = raw.replace(/['"]/g, '').replace(/\s{2,}/g, ' ').trim();
    return withoutQuotes || '';
  }

  normalizeDateInputValue(value: unknown): string {
    return this.utilityService.toDateOnlyJsonString(value) || '';
  }

  //#endregion
}
