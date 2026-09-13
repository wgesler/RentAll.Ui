import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize, switchMap, take, takeUntil } from 'rxjs';
import { FileDetails } from '../../documents/models/document.model';
import { MaterialModule } from '../../../material.module';
import { SearchableSelectComponent } from '../../shared/searchable-select/searchable-select.component';
import { ReceiptReadingOverlayComponent } from '../../shared/receipt-reading-overlay/receipt-reading-overlay.component';
import { ReceiptDraftResponse, ReceiptDraftSourceFlags } from '../models/receipt-draft.model';
import { ReceiptSelection, resolveFirstRealReceiptPropertyId } from '../models/receipt.model';
import { ReceiptDraftService } from '../services/receipt-draft.service';
import { buildReceiptDraftRequestFromForm } from '../services/receipt-draft-form.mapper';
import { UtilityService } from '../../../services/utility.service';
import { ReceiptComponent } from '../receipt/receipt.component';

@Component({
  standalone: true,
  selector: 'app-receipt-draft',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent, ReceiptReadingOverlayComponent],
  templateUrl: '../receipt/receipt.component.html',
  styleUrl: '../receipt/receipt.component.scss'
})
export class ReceiptDraftComponent extends ReceiptComponent implements OnInit, OnChanges, OnDestroy {
  @Input() receiptDraftId: string | null = null;
  @Output() draftSavedEvent = new EventEmitter<string>();
  @Output() draftPromotedEvent = new EventEmitter<ReceiptSelection>();

  private receiptDraftService = inject(ReceiptDraftService);
  private draftToastr = inject(ToastrService);
  private draftUtilityService = inject(UtilityService);

  receiptDraft: ReceiptDraftResponse | null = null;
  isLoadingDraft = false;
  isPromotingDraft = false;
  isDeletingDraft = false;
  private openedExistingReceiptDraft = false;

  constructor() {
    super();
  }

  //#region Receipt-Draft
  override get isReceiptDraftMode(): boolean {
    return true;
  }

  override get shouldShowReceiptLoading(): boolean {
    return this.isLoadingDraft || ((!this.isPageReady || !this.isReceiptContentReady) && this.isEditDraftMode);
  }

  override get loadingReceiptMessage(): string {
    return 'Loading receipt draft...';
  }

  override get receiptCodeFieldLabel(): string {
    return 'Draft Code';
  }

  override get receiptCodeDisplayValue(): string {
    return (this.receiptDraft?.draftCode || '').trim() || 'New';
  }

  override get showSaveAndNewButton(): boolean {
    return false;
  }

  override get primarySaveButtonLabel(): string {
    return 'Save Draft';
  }

  override get showDraftManagementActions(): boolean {
    return this.isEditDraftMode;
  }

  override get isDraftPromoted(): boolean {
    return !!this.receiptDraft?.isPromoted;
  }

  override get promotedReceiptCodeDisplay(): string {
    return (this.receiptDraft?.promotedReceiptCode || '').trim();
  }

  override get isPromotingReceiptDraft(): boolean {
    return this.isPromotingDraft;
  }

  override get isDeletingReceiptDraft(): boolean {
    return this.isDeletingDraft;
  }

  get isEditDraftMode(): boolean {
    return !!(this.receiptDraftId || '').trim();
  }

  override ngOnInit(): void {
    this.receiptId = 'new';
    this.shellContext = 'maintenance';
    this.autoBackOnSave = false;
    this.showInlineSaveButtons = true;
    this.openedExistingReceiptDraft = this.isEditDraftMode;
    super.ngOnInit();
    if (this.isEditDraftMode) {
      this.isReceiptContentReady = false;
      this.loadReceiptDraft(this.receiptDraftId!);
    }
  }

  override ngOnChanges(changes: SimpleChanges): void {
    if (changes['receiptDraftId'] && !changes['receiptDraftId'].firstChange) {
      this.openedExistingReceiptDraft = this.isEditDraftMode;
      if (this.isEditDraftMode) {
        this.isReceiptContentReady = false;
        this.loadReceiptDraft(this.receiptDraftId!);
      } else {
        this.receiptDraft = null;
        this.receiptDraftId = null;
        this.resetForm();
        this.applyShellOfficeToReceipt();
        this.updateDraftFormDisabledState();
      }
      return;
    }

    super.ngOnChanges(changes);
  }

  override saveReceiptAndNew(): void {
    this.saveReceipt();
  }

  override executeDraftSave(): void {
    if (this.isDraftPromoted) {
      return;
    }

    this.saveValidationHighlightActive = false;
    this.commitPendingAmountEdits();
    this.syncInitialSplitDescriptionFromHeader();
    this.syncSplitPropertiesToPrefilledCompanySelection();
    const request = this.buildReceiptDraftRequest();
    this.isSubmitting = true;
    const save$ = this.shouldUpdateExistingReceiptDraft()
      ? this.receiptDraftService.updateReceiptDraft({ ...request, receiptDraftId: this.receiptDraftId! })
      : this.receiptDraftService.createReceiptDraft(request);

    save$.pipe(
      take(1),
      finalize(() => {
        this.isSubmitting = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: draft => {
        this.receiptDraft = draft;
        this.receiptDraftId = draft.receiptDraftId;
        this.openedExistingReceiptDraft = true;
        this.saveValidationHighlightActive = false;
        this.splitTotalValidationError = false;
        this.draftToastr.success('Receipt draft saved.', 'Success');
        this.draftSavedEvent.emit(draft.receiptDraftId);
        this.updateDraftFormDisabledState();
        if (this.autoBackOnSave) {
          this.back();
        }
      },
      error: (err) => {
        this.draftToastr.error(this.resolveReceiptDraftSaveError(err), 'Error');
      }
    });
  }

  override validateBeforeReceiptSubmit(options?: { forPromote?: boolean }): string[] {
    if (options?.forPromote) {
      this.ensurePromoteAccountingDates();
    }
    return super.validateBeforeReceiptSubmit(options);
  }

  override promoteReceiptDraft(): void {
    if (!this.isEditDraftMode || this.isDraftPromoted) {
      return;
    }

    const validationErrors = this.validateBeforeReceiptSubmit({ forPromote: true });
    if (validationErrors.length > 0) {
      this.showValidationErrorToast(validationErrors);
      return;
    }

    const request = this.buildReceiptDraftRequest();
    this.isPromotingDraft = true;
    this.receiptDraftService.updateReceiptDraft({ ...request, receiptDraftId: this.receiptDraftId! })
      .pipe(
        switchMap(() => this.receiptDraftService.promoteReceiptDraft(this.receiptDraftId!)),
        take(1),
        finalize(() => {
          this.isPromotingDraft = false;
          this.markViewForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: result => {
          this.saveValidationHighlightActive = false;
          this.splitTotalValidationError = false;
          this.receiptFileValidationError = false;
          this.draftToastr.success(`Promoted to receipt ${result.receipt.receiptCode}`, 'Success');
          this.draftPromotedEvent.emit({
            receiptId: result.receipt.receiptId,
            officeId: result.receipt.officeId ?? this.getReceiptOfficeId(),
            propertyId: resolveFirstRealReceiptPropertyId(
              result.receipt.propertyIds?.length
                ? result.receipt.propertyIds
                : this.getPayloadPropertyIds()
            ),
            receipt: null
          });
        },
        error: (err) => {
          this.draftToastr.error(this.resolveReceiptDraftSaveError(err), 'Error');
        }
      });
  }

  override deleteReceiptDraft(): void {
    if (!this.isEditDraftMode || this.isDraftPromoted) {
      return;
    }

    this.isDeletingDraft = true;
    this.receiptDraftService.deleteReceiptDraft(this.receiptDraftId!)
      .pipe(
        finalize(() => {
          this.isDeletingDraft = false;
          this.markViewForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.draftToastr.success('Receipt draft deleted.', 'Success');
          this.back();
        },
        error: () => this.draftToastr.error('Unable to delete receipt draft.', 'Error')
      });
  }
  //#endregion

  //#region Data Load Methods
  loadReceiptDraft(receiptDraftId: string): void {
    this.isLoadingDraft = true;
    this.receiptDraftService.getReceiptDraftById(receiptDraftId)
      .pipe(
        finalize(() => {
          this.isLoadingDraft = false;
          this.isReceiptContentReady = true;
          this.refreshReceiptFilePreviewAfterLoad();
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
            this.applyShellOfficeToReceipt();
          }
          void this.applyLoadedReceiptDraft(draft);
        },
        error: () => this.draftToastr.error('Unable to load receipt draft.', 'Error')
      });
  }

  async applyLoadedReceiptDraft(draft: ReceiptDraftResponse): Promise<void> {
    if (!this.form) {
      return;
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
    this.markExplicitPropertySelectionFromFormIfPresent();
    this.updateDraftFormDisabledState();
    this.hasNewReceiptUpload = false;
    this.applyReceiptFilePreview(
      (draft.fileDetails as FileDetails | null | undefined) ?? null,
      draft.receiptPath || ''
    );
    this.markViewForCheck();
  }
  //#endregion

  //#region Utility Methods
  ensurePromoteAccountingDates(): void {
    const receiptDate = this.form.get('receiptDate')?.value;
    if (!receiptDate) {
      return;
    }

    if (!this.draftUtilityService.toDateOnlyJsonString(this.form.get('dueDate')?.value)) {
      this.form.patchValue({
        dueDate: this.getReceiptDateControlValue(receiptDate)
      }, { emitEvent: false });
    }

    if (!this.draftUtilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value)) {
      this.form.patchValue({
        accountingPeriod: this.getReceiptDateControlValue(receiptDate)
      }, { emitEvent: false });
    }
  }

  refreshReceiptFilePreviewAfterLoad(): void {
    if (!this.form || !this.receiptFileDetails) {
      return;
    }

    this.applyReceiptFilePreview(this.receiptFileDetails, this.form.get('receiptPath')?.value);
  }

  applyCapturedReceiptFile(fileDetails: FileDetails, markAsNewUpload = true): void {
    if (!this.form) {
      return;
    }

    this.applyReceiptFilePreview(fileDetails, this.form.get('receiptPath')?.value);
    this.hasNewReceiptUpload = markAsNewUpload;
    this.receiptFileValidationError = false;
    if (markAsNewUpload) {
      this.form.patchValue({ receiptPath: '' }, { emitEvent: false });
    }
    this.markViewForCheck();
  }

  shouldUpdateExistingReceiptDraft(): boolean {
    const draftId = (this.receiptDraftId || '').trim();
    if (!draftId) {
      return false;
    }
    return this.openedExistingReceiptDraft || !!this.receiptDraft;
  }

  buildReceiptDraftRequest() {
    return buildReceiptDraftRequestFromForm(
      this.draftUtilityService,
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

  updateDraftFormDisabledState(): void {
    if (this.isDraftPromoted) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
    this.markViewForCheck();
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
  //#endregion
}
