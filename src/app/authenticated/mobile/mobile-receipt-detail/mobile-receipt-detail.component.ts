import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { SearchableSelectComponent } from '../../shared/searchable-select/searchable-select.component';
import { ReceiptExtractResponse, ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptDraftResponse, ReceiptDraftSourceFlags } from '../../maintenance/models/receipt-draft.model';
import { ReceiptDraftService } from '../../maintenance/services/receipt-draft.service';
import { buildReceiptDraftRequestFromForm } from '../../maintenance/services/receipt-draft-form.mapper';
import { MobileCaptureReceiptDraft, MobileCaptureReceiptDraftService } from '../mobile-capture-receipt-draft.service';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { WorkOrderSelection } from '../../maintenance/work-order-list/work-order-list.component';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { UtilityService } from '../../../services/utility.service';
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
  private captureReceiptDraftService = inject(MobileCaptureReceiptDraftService);
  private receiptDraftService = inject(ReceiptDraftService);
  private mobileUtilityService = inject(UtilityService);
  private mobileCdr = inject(ChangeDetectorRef);

  receiptDraftId: string | null = null;
  private openedExistingReceiptDraft = false;
  receiptDraft: ReceiptDraftResponse | null = null;
  isSavingDraft = false;
  isLoadingReceiptDraft = false;
  receiptPreviewOpen = false;
  receiptPreviewViewerSrc: SafeResourceUrl | null = null;
  private receiptPreviewObjectUrl: string | null = null;

  //#region Mobile-Receipt-Detail
  override ngOnInit(): void {
    const queryParams = this.mobileRoute.snapshot.queryParamMap;
    this.mobileReturnTicketId = queryParams.get('returnTicketId')?.trim() || null;
    this.mobileReturnTicketTab = queryParams.get('returnTicketTab')?.trim() || null;

    const queryReceiptDraftId = queryParams.get('receiptDraftId')?.trim() || null;

    let captureDraft: MobileCaptureReceiptDraft | null = null;
    if (this.receiptId === 'new') {
      captureDraft = this.captureReceiptDraftService.consumeDraft();
    }

    if (captureDraft) {
      this.receiptDraftId = null;
      this.openedExistingReceiptDraft = false;
      const captureOfficeId = Number(captureDraft.officeId ?? 0);
      if (Number.isFinite(captureOfficeId) && captureOfficeId > 0) {
        this.officeId = captureOfficeId;
      }
    } else {
      this.receiptDraftId = queryReceiptDraftId;
      this.openedExistingReceiptDraft = !!queryReceiptDraftId;
    }

    this.shellContext = this.authService.isAdmin() ? 'accounting' : 'maintenance';
    this.showInlineSaveButtons = true;
    this.autoBackOnSave = true;
    super.ngOnInit();

    if (captureDraft) {
      void this.applyCaptureReceiptDraft(captureDraft);
    } else if (this.receiptDraftId) {
      void this.loadReceiptDraft(this.receiptDraftId);
    }

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

  get isReceiptDraftPromoted(): boolean {
    return !!this.receiptDraft?.isPromoted;
  }

  get isReceiptDraftFlow(): boolean {
    return this.isAddMode && !!(this.receiptDraftId || this.receiptDraft);
  }

  override get tracksExplicitPropertySelection(): boolean {
    return this.isAddMode;
  }

  override shouldRequireExplicitPropertySelectionForSave(): boolean {
    return this.isAddMode;
  }

  override shouldRequireExplicitPropertySelectionForPromote(): boolean {
    return this.isAddMode;
  }

  get draftCodeDisplay(): string {
    if (this.isLoadingReceiptDraft) {
      return 'New';
    }
    const draftCode = (this.receiptDraft?.draftCode || '').trim();
    return draftCode || 'New';
  }

  override afterReceiptSaved(saved: ReceiptResponse): void {
    const draftId = (this.receiptDraftId || '').trim();
    if (!draftId || this.receiptDraft?.isPromoted) {
      return;
    }

    this.receiptDraftService.linkReceiptDraftToReceipt(draftId, saved.receiptId)
      .pipe(take(1))
      .subscribe({
        next: draft => {
          this.receiptDraft = draft;
          this.markViewForCheck();
        },
        error: () => {
          this.mobileToastr.warning('Receipt saved, but the draft link could not be updated.', 'Receipt Draft');
        }
      });
  }

  saveReceiptAsDraft(): void {
    if (this.isSubmitting || this.isSavingDraft || this.isReceiptDraftPromoted) {
      return;
    }

    this.saveValidationHighlightActive = false;
    this.commitPendingAmountEdits();
    this.syncInitialSplitDescriptionFromHeader();
    this.syncSplitPropertiesToPrefilledCompanySelection();
    const request = this.buildMobileReceiptDraftRequest();
    this.isSavingDraft = true;
    this.markViewForCheck();

    const save$ = this.shouldUpdateExistingReceiptDraft()
      ? this.receiptDraftService.updateReceiptDraft({ ...request, receiptDraftId: this.receiptDraftId! })
      : this.receiptDraftService.createReceiptDraft(request);

    save$.pipe(
      finalize(() => {
        this.isSavingDraft = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: draft => {
        this.receiptDraftId = draft.receiptDraftId;
        this.receiptDraft = draft;
        this.openedExistingReceiptDraft = true;
        this.receiptDescriptionChange.emit((draft.description || draft.draftCode || '').trim());
        this.mobileToastr.success('Receipt draft saved.', 'Success');
        if (this.autoBackOnSave) {
          this.back();
        }
      },
      error: (err) => {
        const message = this.resolveReceiptDraftSaveError(err);
        this.mobileToastr.error(message, 'Error');
        this.markViewForCheck();
      }
    });
  }

  override applyLoadedReceipt(receipt: ReceiptResponse): void {
    super.applyLoadedReceipt(receipt);
    if (this.isAccountingShell) {
      this.updateAccountingBillFieldValidators();
      this.updateSplitLineAccountValidators();
    }
    this.receiptDescriptionChange.emit((receipt.description || '').trim());
  }

  override loadSplitAccountsForCurrentOffice(): void {
    super.loadSplitAccountsForCurrentOffice();
    if (this.isAddMode) {
      this.syncInitialSplitDescriptionFromHeader();
    }
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

  override showValidationErrorToast(details?: string | string[]): void {
    super.showValidationErrorToast(details);
    this.markViewForCheck();
  }

  override markViewForCheck(): void {
    super.markViewForCheck();
    this.mobileCdr.detectChanges();
  }
  //#endregion

  //#region Data Load Methods
  async loadReceiptDraft(receiptDraftId: string): Promise<void> {
    this.isLoadingReceiptDraft = true;
    this.receiptDraftService.getReceiptDraftById(receiptDraftId)
      .pipe(
        finalize(() => {
          this.isLoadingReceiptDraft = false;
          this.markViewForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: draft => {
          this.receiptDraft = draft;
          this.receiptDraftId = draft.receiptDraftId;
          if (draft.officeId && draft.officeId > 0) {
            this.officeId = draft.officeId;
          }
          void this.applyLoadedReceiptDraft(draft);
        },
        error: () => this.mobileToastr.error('Unable to load receipt draft.', 'Error')
      });
  }

  async applyLoadedReceiptDraft(draft: ReceiptDraftResponse): Promise<void> {
    if (!this.form) {
      return;
    }

    if (draft.fileDetails) {
      this.applyCapturedReceiptFile(draft.fileDetails as FileDetails, false);
    } else if (draft.receiptPath) {
      this.receiptFileName = draft.receiptPath;
    }

    if (draft.receiptPath) {
      this.form.patchValue({ receiptPath: draft.receiptPath }, { emitEvent: false });
    }

    const propertyIds = (draft.propertyIds || [])
      .map(propertyId => (propertyId || '').trim())
      .filter(propertyId => propertyId.length > 0);

    this.form.patchValue({
      receiptDate: this.getReceiptDateControlValue(draft.receiptDate ?? null),
      dueDate: this.getReceiptDateControlValue(draft.dueDate ?? draft.receiptDate ?? null),
      accountingPeriod: this.getReceiptDateControlValue(draft.accountingPeriod ?? draft.receiptDate ?? null),
      propertyIds: propertyIds.length > 0 ? propertyIds : this.form.get('propertyIds')?.value,
      description: draft.description ?? '',
      amount: draft.amount != null ? this.formatter.currency(draft.amount) : '0.00',
      bankCardId: draft.bankCardId ?? 0,
      vendorId: (draft.vendorId || '').trim() || null,
      vendorName: draft.vendorName ?? '',
      billNumber: draft.billNumber ?? '',
      isUtility: draft.isUtility ?? false,
      businessPrivate: draft.businessPrivate ?? false,
      isActive: draft.isActive
    }, { emitEvent: false });

    const headerDescription = (draft.description ?? '').trim();
    const draftSplits = (draft.splits || []).map((split, index) => ({
      ...split,
      description: (split.description || '').trim() || (index === 0 ? headerDescription : '')
    }));

    if (draft.officeId && draft.officeId > 0) {
      this.applyShellOfficeToReceipt();
    }

    if (draftSplits.length > 0) {
      this.replaceSplitLines(draftSplits);
    } else {
      this.ensureAtLeastOneSplit();
    }

    this.onOverallBankCardChange();
    this.updateVendorFieldValidators();
    this.applyCompanyReceiptTypeWhenCompanyPropertySelected();
    this.syncSplitPropertiesToPrefilledCompanySelection();
    this.syncInitialSplitDescriptionFromHeader(headerDescription);
    this.receiptDescriptionChange.emit((headerDescription || draft.draftCode || '').trim());
    if (this.tracksExplicitPropertySelection) {
      this.resetExplicitPropertySelection();
      this.markExplicitPropertySelectionFromFormIfPresent();
    }

    const storedExtraction = this.parseStoredExtractionJson(draft.extractionJson);
    const hasSavedExtractedFields = headerDescription.length > 0 || draft.amount != null;
    if (storedExtraction && !hasSavedExtractedFields) {
      this.applyDocumentExtractPrefill(storedExtraction);
    }

    this.markViewForCheck();
  }

  async applyCaptureReceiptDraft(draft: MobileCaptureReceiptDraft): Promise<void> {
    if (!this.form) {
      return;
    }

    this.applyCapturedReceiptFile(draft.fileDetails);
    if (draft.extraction) {
      this.applyDocumentExtractPrefill(this.buildCaptureExtraction(draft));
    } else {
      await this.extractReceiptFromUpload();
    }

    const description = (this.form.get('description')?.value || '').trim();
    if (description) {
      this.receiptDescriptionChange.emit(description);
    }
    this.markViewForCheck();
  }
  //#endregion

  //#region Utility Methods
  override back(): void {
    const ticketRoute = getMobileTicketReturnRoute(this.mobileReturnTicketId, this.mobileReturnTicketTab);
    if (ticketRoute) {
      void this.mobileRouter.navigate(ticketRoute);
      return;
    }
    const queryParams = this.shouldReturnToDraftReceiptList()
      ? { draft: 'true' }
      : undefined;
    void this.mobileRouter.navigate(['/mobile', 'maintenance', 'receipts'], { queryParams });
  }

  override ngOnDestroy(): void {
    this.mobileChromeOverlayService.setPrimaryChromeHidden(false);
    this.releaseReceiptPreviewObjectUrl();
    super.ngOnDestroy();
  }

  shouldReturnToDraftReceiptList(): boolean {
    const draftQuery = (this.mobileRoute.snapshot.queryParamMap.get('draft') || '').trim().toLowerCase();
    if (draftQuery === 'true' || draftQuery === '1') {
      return true;
    }
    return !!(this.receiptDraftId || this.receiptDraft);
  }

  releaseReceiptPreviewObjectUrl(): void {
    if (!this.receiptPreviewObjectUrl) {
      return;
    }
    URL.revokeObjectURL(this.receiptPreviewObjectUrl);
    this.receiptPreviewObjectUrl = null;
  }

  applyCapturedReceiptFile(fileDetails: FileDetails, markAsNewUpload = true): void {
    if (!this.form) {
      return;
    }

    this.applyReceiptFilePreview(fileDetails, this.form.get('receiptPath')?.value);
    this.hasNewReceiptUpload = markAsNewUpload;
    this.receiptFileValidationError = false;
    this.form.patchValue({ receiptPath: '' }, { emitEvent: false });
    this.markViewForCheck();
  }

  shouldUpdateExistingReceiptDraft(): boolean {
    const draftId = (this.receiptDraftId || '').trim();
    if (!draftId) {
      return false;
    }
    return this.openedExistingReceiptDraft || !!this.receiptDraft;
  }

  resolveReceiptDraftSaveError(err: unknown): string {
    const body = (err as { error?: unknown })?.error;
    if (typeof body === 'string' && body.trim()) {
      return body.trim();
    }
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const title = String(record['title'] ?? '').trim();
      const message = String(record['message'] ?? record['error'] ?? '').trim();
      const errors = record['errors'];
      if (errors && typeof errors === 'object') {
        const first = Object.values(errors as Record<string, unknown[]>)
          .flatMap(value => (Array.isArray(value) ? value : []))
          .map(value => String(value).trim())
          .find(value => value.length > 0);
        if (first) {
          return first;
        }
      }
      if (message) {
        return message;
      }
      if (title) {
        return title;
      }
    }
    return 'Unable to save receipt draft.';
  }

  buildMobileReceiptDraftRequest() {
    return buildReceiptDraftRequestFromForm(
      this.mobileUtilityService,
      this.organizationId,
      {
        officeId: this.getReceiptOfficeId(),
        propertyIds: this.getPayloadPropertyIds(),
        receiptDate: this.form.get('receiptDate')?.value,
        dueDate: this.form.get('dueDate')?.value,
        accountingPeriod: this.form.get('accountingPeriod')?.value,
        billNumber: this.form.get('billNumber')?.value,
        amount: this.form.get('amount')?.value,
        description: this.form.get('description')?.value,
        bankCardId: Number(this.form.get('bankCardId')?.value ?? 0),
        vendorId: this.normalizeGuidOrNull(this.form.get('vendorId')?.value),
        vendorName: this.form.get('vendorName')?.value,
        isUtility: this.form.get('isUtility')?.value,
        businessPrivate: this.form.get('businessPrivate')?.value,
        isActive: this.form.get('isActive')?.value,
        receiptPath: (this.receiptDraft?.receiptPath || this.form.get('receiptPath')?.value || '').trim() || null
      },
      this.getDraftPayloadSplitsFromForm(),
      {
        receiptDraftId: this.shouldUpdateExistingReceiptDraft() ? this.receiptDraftId : null,
        fileDetails: this.receiptFileDetails,
        sendNewReceiptFile: this.hasNewReceiptUpload,
        draftSourceFlags: this.receiptDraft?.draftSourceFlags ?? ReceiptDraftSourceFlags.Upload,
        extractionJson: this.receiptDraft?.extractionJson ?? null,
        paidAmount: this.receiptDraft?.paidAmount ?? null
      }
    );
  }

  syncInitialSplitDescriptionFromHeader(headerDescription?: string | null): void {
    this.syncInitialSplitWithOverallIfNeeded();
    this.applyDescriptionToHeaderAndFirstSplitLine(headerDescription);
    this.backfillFirstSplitDescriptionFromHeaderIfNeeded();
    queueMicrotask(() => {
      this.applyDescriptionToHeaderAndFirstSplitLine();
      this.backfillFirstSplitDescriptionFromHeaderIfNeeded();
      this.markViewForCheck();
    });
  }

  parseStoredExtractionJson(extractionJson: string | null | undefined): ReceiptExtractResponse | null {
    const raw = (extractionJson || '').trim();
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ReceiptExtractResponse;
      return parsed?.key ? parsed : { ...parsed, key: `stored-extraction-${Date.now()}` };
    } catch {
      return null;
    }
  }

  buildCaptureExtraction(draft: MobileCaptureReceiptDraft): ReceiptExtractResponse {
    const extraction = draft.extraction;
    if (!extraction) {
      return {
        key: `capture-receipt-${Date.now()}`
      };
    }

    const captureOfficeId = Number(draft.officeId ?? 0);
    return {
      ...extraction,
      officeId: Number.isFinite(captureOfficeId) && captureOfficeId > 0
        ? captureOfficeId
        : (extraction.officeId ?? null),
      propertyIds: draft.propertyId ? [draft.propertyId] : (extraction.propertyIds || [])
    };
  }
  //#endregion
}
