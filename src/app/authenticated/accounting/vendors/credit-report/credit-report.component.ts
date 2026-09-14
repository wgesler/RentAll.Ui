import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, EMPTY, Subject, switchMap, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { FileDetails } from '../../../documents/models/document.model';
import { AuthService } from '../../../../services/auth.service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { ReceiptDraftService } from '../../../maintenance/services/receipt-draft.service';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { PaymentType } from '../../models/accounting-enum';
import { CreditReportLineDisplay, CreditReportLineEdit, CreditReportLineResponse, CreditReportResponse } from './credit-report.model';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { BankCardResponse } from '../../../organizations/models/bank.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';

@Component({
  selector: 'app-credit-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './credit-report.component.html',
  styleUrl: './credit-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreditReportComponent implements OnInit, OnChanges, OnDestroy {
  @Input() organizationId = '';
  @Input() officeId: number | null = null;
  @Input() fileDetails: FileDetails | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() createDisabledChange = new EventEmitter<boolean>();
  @Output() lineEdit = new EventEmitter<CreditReportLineEdit>();

  private receiptService = inject(ReceiptService);
  private receiptDraftService = inject(ReceiptDraftService);
  private journalEntryService = inject(JournalEntryService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  readonly lineColumns: ColumnSet = {
    chargeDate: { displayAs: 'Date', maxWidth: '12ch', alignment: 'center' },
    vendor: { displayAs: 'Vendor', maxWidth: '30ch' },
    workOrderDisplay: { displayAs: 'Work Order', wrap: true, maxWidth: '15ch' },
    amount: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    bankCardDropdown: { displayAs: 'Card', wrap: true, maxWidth: '25ch', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter bank cards...' },
    cardOwner: { displayAs: 'Card Owner', maxWidth: '22ch', wrap: true },
    documentCode: { displayAs: 'Ref', maxWidth: '20ch', sortType: 'natural' },
    description: { displayAs: 'Description', maxWidth: '28ch', wrap: true },
    isComplete: { displayAs: 'Complete', maxWidth: '10ch', isCheckmark: true, suppressRowClick: true, wrap: false, alignment: 'center', headerAlignment: 'center' },
    isDraft: { displayAs: 'Draft', maxWidth: '8ch', isCheckmark: true, suppressRowClick: true, wrap: false, alignment: 'center', headerAlignment: 'center' },
    isMissing: { displayAs: 'Missing', maxWidth: '9ch', isCheckmark: true, suppressRowClick: true, wrap: false, alignment: 'center', headerAlignment: 'center' },
    isUnknown: { displayAs: 'Unknown', maxWidth: '10ch', isCheckmark: true, suppressRowClick: true, wrap: false, alignment: 'center', headerAlignment: 'center' }
  };

  reportLines: CreditReportLineDisplay[] = [];
  proposedDraftLines: CreditReportLineResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  bankCardOptions: Array<{ bankCardId: number; label: string; cardName: string }> = [];
  warnings: string[] = [];
  fileName = '';
  isServiceError = false;
  hasProcessed = false;
  draftsCreated = false;
  isCreatingDrafts = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  //#region Credit Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.emitCreateDisabled();
    this.loadOfficeBankCards();
    this.processFile(this.fileDetails);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.refreshBankCardOptions();
    }
    if (changes['fileDetails'] && !changes['fileDetails'].firstChange) {
      this.processFile(this.fileDetails);
    }
  }

  cancel(): void {
    this.closed.emit();
  }
  //#endregion

  //#region Data Loading Methods
  processFile(fileDetails: FileDetails | null): void {
    const organizationId = (this.organizationId || this.authService.getUser()?.organizationId || '').trim();
    if (!fileDetails?.file || !organizationId) {
      this.hasProcessed = false;
      this.emitCreateDisabled();
      this.markViewForCheck();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'creditReport');
    this.isServiceError = false;
    this.hasProcessed = false;
    this.draftsCreated = false;
    this.proposedDraftLines = [];
    this.reportLines = [];
    this.fileName = fileDetails.fileName || '';
    this.emitCreateDisabled();
    this.receiptService.processCreditReport(organizationId, fileDetails, this.officeId).pipe(take(1)).subscribe({
      next: (response) => {
        this.applyResponse(response);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'creditReport');
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.hasProcessed = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'creditReport');
        this.toastr.error('Unable to read the credit report.', CommonMessage.Error);
        this.emitCreateDisabled();
        this.markViewForCheck();
      }
    });
  }

  applyResponse(response: CreditReportResponse): void {
    this.proposedDraftLines = (response.createdDrafts || []).filter(line => !line.receiptDraftId && !line.draftCode);
    this.reportLines = this.mappingService.mapCreditReportReportLines(response);
    this.applyBankCardDropdowns();
    this.warnings = response.warnings || [];
    this.fileName = response.fileName || this.fileName;
    this.hasProcessed = true;
    this.draftsCreated = false;
    this.emitCreateDisabled();
    if (this.warnings.length > 0) {
      this.toastr.warning(this.warnings[0]);
    } else {
      this.toastr.success('Credit report processed.', CommonMessage.Success);
    }
  }

  createProposedDrafts(): void {
    const organizationId = (this.organizationId || this.authService.getUser()?.organizationId || '').trim();
    if (!organizationId || this.proposedDraftLines.length === 0 || this.draftsCreated || this.isCreatingDrafts) {
      return;
    }

    this.isCreatingDrafts = true;
    this.emitCreateDisabled();
    this.receiptService.createCreditReportDrafts(organizationId, this.proposedDraftLines, this.officeId).pipe(take(1)).subscribe({
      next: (response) => {
        this.proposedDraftLines = response.createdDrafts || [];
        this.reportLines = [
          ...this.reportLines.filter(line => !line.isMissing),
          ...this.mappingService.mapCreditReportLines(this.proposedDraftLines, 'draft')
        ];
        this.applyBankCardDropdowns();
        this.draftsCreated = true;
        this.isCreatingDrafts = false;
        this.toastr.success('Draft receipts created.', CommonMessage.Success);
        this.emitCreateDisabled();
        this.markViewForCheck();
      },
      error: () => {
        this.isCreatingDrafts = false;
        this.toastr.error('Unable to create draft receipts.', CommonMessage.Error);
        this.emitCreateDisabled();
        this.markViewForCheck();
      }
    });
  }
  loadOfficeBankCards(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.accountingOffices = offices || [];
          this.refreshBankCardOptions();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.refreshBankCardOptions();
      }
    });
  }

  refreshBankCardOptions(): void {
    const officeId = Number(this.officeId ?? 0);
    const offices = officeId > 0
      ? this.accountingOffices.filter(office => Number(office.officeId) === officeId)
      : this.accountingOffices;
    const cards = offices.flatMap(office => this.mappingService.mapBankCardsFromResponse(office.bankCards as BankCardResponse[]));
    this.bankCardOptions = cards
      .filter(card => Number(card.bankCardId) > 0)
      .map(card => ({ bankCardId: Number(card.bankCardId), label: (card.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card), cardName: (card.cardName || '').trim() }))
      .filter(option => option.label.length > 0);
    this.applyBankCardDropdowns();
    this.markViewForCheck();
  }

  applyBankCardDropdowns(): void {
    const labels = this.bankCardOptions.map(option => option.label);
    this.reportLines = this.reportLines.map(line => {
      const matchedCard = this.bankCardOptions.find(option => option.bankCardId === Number(line.bankCardId ?? 0));
      const selectedLabel = matchedCard?.label || '';
      return {
        ...line,
        cardOwner: this.mappingService.mapCreditReportCardOwner(matchedCard?.cardName),
        bankCardDropdown: {
          value: selectedLabel,
          isOverridable: true,
          options: labels,
          toString: () => selectedLabel
        }
      };
    });
    this.markViewForCheck();
  }

  onCardDropdownChange(event: CreditReportLineDisplay & { __changedDropdownColumn?: string }): void {
    if (event.__changedDropdownColumn !== 'bankCardDropdown') {
      return;
    }

    const selectedLabel = String(event.bankCardDropdown?.value || '').trim();
    const selected = this.bankCardOptions.find(option => option.label === selectedLabel);
    if (!selected) {
      return;
    }

    event.bankCardId = selected.bankCardId;
    event.cardOwner = this.mappingService.mapCreditReportCardOwner(selected.cardName);
    if (event.sourceLine) {
      event.sourceLine.bankCardId = selected.bankCardId;
      event.sourceLine.bankCardDisplayName = selected.label;
    }
    this.applyBankCardDropdowns();

    const draftId = String(event.receiptDraftId || '').trim();
    const receiptId = String(event.receiptId || '').trim();
    if (draftId) {
      this.persistDraftCard(draftId, selected.bankCardId);
      return;
    }
    if (receiptId) {
      this.persistReceiptCard(receiptId, selected.bankCardId);
    }
  }

  persistDraftCard(receiptDraftId: string, bankCardId: number): void {
    this.receiptDraftService.getReceiptDraftById(receiptDraftId).pipe(take(1), switchMap(draft => {
      const amount = Number(draft.amount) || 0;
      return this.receiptDraftService.updateReceiptDraft({
        receiptDraftId: draft.receiptDraftId,
        organizationId: draft.organizationId,
        officeId: draft.officeId,
        propertyIds: draft.propertyIds || [],
        receiptDate: draft.receiptDate,
        dueDate: draft.dueDate,
        accountingPeriod: draft.accountingPeriod,
        billNumber: draft.billNumber,
        amount,
        description: draft.description,
        bankCardId,
        vendorId: draft.vendorId,
        vendorName: draft.vendorName,
        paidAmount: bankCardId > 0 ? (Number(draft.paidAmount) || amount) : Number(draft.paidAmount) || 0,
        paidDate: bankCardId > 0 ? (draft.paidDate || draft.receiptDate) : draft.paidDate,
        paymentDescription: draft.paymentDescription,
        splits: draft.splits || [],
        agreementLineId: draft.agreementLineId,
        receiptPath: draft.receiptPath,
        fileDetails: draft.fileDetails,
        paymentTypeId: bankCardId > 0 ? (Number(draft.paymentTypeId) || PaymentType.CreditCard) : Number(draft.paymentTypeId) || 0,
        checkPrinted: draft.checkPrinted,
        isUtility: draft.isUtility,
        businessPrivate: draft.businessPrivate,
        isActive: draft.isActive !== false,
        draftSourceFlags: draft.draftSourceFlags,
        extractionJson: draft.extractionJson
      });
    })).subscribe({
      next: () => this.toastr.success('Draft updated.', CommonMessage.Success),
      error: () => this.toastr.error('Unable to update the card.', CommonMessage.Error)
    });
  }

  persistReceiptCard(receiptId: string, bankCardId: number): void {
    this.receiptService.getReceiptById(receiptId).pipe(take(1), switchMap(receipt => {
      if (Number(receipt.bankCardId ?? 0) === bankCardId) {
        return EMPTY;
      }
      return this.receiptService.updateReceipt(this.mappingService.mapReceiptUpdateRequest(receipt, { bankCardId, vendorId: null }));
    })).subscribe({
      next: () => this.toastr.success('Receipt updated.', CommonMessage.Success),
      error: () => this.toastr.error('Unable to update the card.', CommonMessage.Error)
    });
  }

  editLine(line: CreditReportLineDisplay): void {
    const receiptId = String(line.receiptId || '').trim();
    const receiptDraftId = String(line.receiptDraftId || '').trim();
    if (receiptId) {
      this.lineEdit.emit({ receiptId, receiptDraftId: null, lineKey: line.lineKey });
      return;
    }
    if (receiptDraftId) {
      this.lineEdit.emit({ receiptId: null, receiptDraftId, lineKey: line.lineKey });
      return;
    }
    this.lineEdit.emit({
      receiptId: null,
      receiptDraftId: null,
      lineKey: line.lineKey,
      prefill: this.mappingService.mapCreditReportLinePrefill(line, this.officeId)
    });
  }

  deleteLine(line: CreditReportLineDisplay): void {
    const receiptId = String(line.receiptId || '').trim();
    const receiptDraftId = String(line.receiptDraftId || '').trim();
    if (receiptDraftId) {
      this.receiptDraftService.deleteReceiptDraft(receiptDraftId).pipe(take(1)).subscribe({
        next: () => {
          this.removeLineFromReport(line);
          this.toastr.success('Draft deleted.', CommonMessage.Success);
        },
        error: () => this.toastr.error('Unable to delete the draft.', CommonMessage.Error)
      });
      return;
    }
    if (receiptId) {
      this.journalEntryService.confirmDeleteIfAllowed(null, 'Receipt').pipe(take(1), switchMap(canProceed => canProceed ? this.receiptService.deleteReceipt(receiptId).pipe(take(1)) : EMPTY)).subscribe({
        next: () => {
          this.removeLineFromReport(line);
          this.toastr.success('Receipt deleted.', CommonMessage.Success);
        },
        error: () => this.toastr.error('Unable to delete the receipt.', CommonMessage.Error)
      });
      return;
    }
    this.removeLineFromReport(line);
  }

  markLineSavedAsDraft(lineKey: string, receiptDraftId: string): void {
    const key = String(lineKey || '').trim();
    const draftId = String(receiptDraftId || '').trim();
    if (!key || !draftId) {
      return;
    }

    this.applySavedDraftToLine(key, draftId, null);
    this.receiptDraftService.getReceiptDraftById(draftId).pipe(take(1)).subscribe({
      next: draft => {
        this.reportLines = this.reportLines.map(line => line.lineKey === key
          ? this.mappingService.mapCreditReportLineFromDraft(line, draft)
          : line);
        const sourceLine = this.reportLines.find(line => line.lineKey === key)?.sourceLine;
        if (sourceLine) {
          this.proposedDraftLines = this.proposedDraftLines.filter(item => item !== sourceLine);
        }
        this.applyBankCardDropdowns();
        this.emitCreateDisabled();
        this.markViewForCheck();
      },
      error: () => this.markViewForCheck()
    });
  }

  applySavedDraftToLine(lineKey: string, receiptDraftId: string, draftCode: string | null): void {
    this.reportLines = this.reportLines.map(line => {
      if (line.lineKey !== lineKey) {
        return line;
      }
      return {
        ...line,
        isMissing: false,
        isUnknown: false,
        isDraft: true,
        isComplete: false,
        receiptDraftId,
        documentCode: draftCode || line.documentCode
      };
    });
    const sourceLine = this.reportLines.find(line => line.lineKey === lineKey)?.sourceLine;
    if (sourceLine) {
      sourceLine.receiptDraftId = receiptDraftId;
      if (draftCode) {
        sourceLine.draftCode = draftCode;
      }
      this.proposedDraftLines = this.proposedDraftLines.filter(item => item !== sourceLine);
    }
    this.emitCreateDisabled();
    this.markViewForCheck();
  }

  removeLineFromReport(line: CreditReportLineDisplay): void {
    this.reportLines = this.reportLines.filter(item => item.lineKey !== line.lineKey);
    this.proposedDraftLines = this.proposedDraftLines.filter(item => item !== line.sourceLine);
    this.emitCreateDisabled();
    this.markViewForCheck();
  }

  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  emitCreateDisabled(): void {
    this.createDisabledChange.emit(this.isCreateDraftsDisabled);
  }

  get reportEntityLine(): string {
    return this.fileName || 'Upload a credit card statement';
  }

  get reportPeriodLine(): string {
    if (!this.hasProcessed) {
      return '';
    }
    const completeCount = this.reportLines.filter(line => line.isComplete).length;
    const draftCount = this.reportLines.filter(line => line.isDraft).length;
    const missingCount = this.reportLines.filter(line => line.isMissing).length;
    const unknownCount = this.reportLines.filter(line => line.isUnknown).length;
    return `${completeCount} complete · ${draftCount} draft · ${missingCount} missing · ${unknownCount} unknown`;
  }

  get isCreateDraftsDisabled(): boolean {
    return this.draftsCreated || this.isCreatingDrafts || this.proposedDraftLines.length === 0;
  }
  //#endregion
}
