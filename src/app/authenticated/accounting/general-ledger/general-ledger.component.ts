import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, filter, switchMap, take, takeUntil } from 'rxjs';
import { of } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceTypeLabels, getSourceTypeLabel } from '../models/accounting-enum';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { JournalEntryLineDetailDisplay, JournalEntryRequest, JournalEntryResponse } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../services/general-ledger.service';

@Component({
  selector: 'app-general-ledger',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, DataTableComponent],
  templateUrl: './general-ledger.component.html',
  styleUrls: ['./general-ledger.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneralLedgerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() journalEntryId: string | null = null;
  @Input() selectedJournalEntryLineId: string | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  isServiceError = false;
  isSaving = false;
  journalEntry: JournalEntryResponse | null = null;
  lineRows: JournalEntryLineDetailDisplay[] = [];
  organizationId = '';
  chartOfAccounts: ChartOfAccountResponse[] = [];

  form = this.formBuilder.group({
    postingDate: this.formBuilder.control<Date | null>(null, Validators.required),
    memo: this.formBuilder.control<string>(''),
    isPosted: this.formBuilder.control<boolean>(false)
  });

  lineDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'Line No', maxWidth: '8ch', alignment: 'center', headerAlignment: 'center', sort: false },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    account: { displayAs: 'Account', maxWidth: '28ch' },
    memo: { displayAs: 'Memo', maxWidth: '28ch', wrap: true },
    debit: { displayAs: 'Debit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    credit: { displayAs: 'Credit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['journalEntry', 'referenceData']));
  destroy$ = new Subject<void>();

  constructor(
    public generalLedgerService: GeneralLedgerService,
    public mappingService: MappingService,
    public formatter: FormatterService,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private chartOfAccountsService: ChartOfAccountsService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef) {
  }

  //#region General-Ledger
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadReferenceData();
    this.loadJournalEntry();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['journalEntryId'] && !changes['journalEntryId'].firstChange) {
      this.loadJournalEntry();
    }
  }

  get canEdit(): boolean {
    return !!this.journalEntry && !this.journalEntry.isVoided;
  }

  get canSave(): boolean {
    return this.canEdit && this.form.valid && !this.isSaving;
  }
  //#endregion

  //#region Get Methods
  getSourceTypeLabel(): string {
    return getSourceTypeLabel(this.journalEntry?.sourceTypeId, SourceTypeLabels);
  }

  getTotalDebitDisplay(): string {
    const total = (this.journalEntry?.journalEntryLines ?? []).reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    return this.formatter.currency(total);
  }

  getTotalCreditDisplay(): string {
    const total = (this.journalEntry?.journalEntryLines ?? []).reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    return this.formatter.currency(total);
  }
  //#endregion

  //#region Save
  saveJournalEntry(): void {
    if (!this.journalEntry || !this.canSave) {
      return;
    }

    const request = this.buildUpdateRequest();
    if (!request) {
      return;
    }

    const shouldPost = !!this.form.getRawValue().isPosted;
    this.isSaving = true;
    this.markViewForCheck();

    this.generalLedgerService.updateJournalEntry(request).pipe(
      switchMap(updated => {
        if (shouldPost && !updated.isPosted) {
          return this.generalLedgerService.postJournalEntry(updated.journalEntryId);
        }
        if (!shouldPost && updated.isPosted) {
          return this.generalLedgerService.unpostJournalEntry(updated.journalEntryId);
        }
        return of(updated);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: updatedEntry => {
        this.journalEntry = updatedEntry;
        this.syncFormFromJournalEntry();
        this.applyLineDisplay();
        this.toastr.success('Journal entry saved.', 'Success');
        this.savedEvent.emit();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.toastr.error(apiMessage || 'Unable to save journal entry.', 'Error');
      }
    });
  }

  buildUpdateRequest(): JournalEntryRequest | null {
    if (!this.journalEntry) {
      return null;
    }

    const postingDate = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().postingDate)
      ?? this.journalEntry.postingDate;

    return {
      journalEntryId: this.journalEntry.journalEntryId,
      organizationId: this.journalEntry.organizationId,
      officeId: this.journalEntry.officeId,
      transactionDate: this.journalEntry.transactionDate,
      postingDate,
      sourceTypeId: this.journalEntry.sourceTypeId ?? null,
      sourceId: this.journalEntry.sourceId ?? null,
      memo: this.form.getRawValue().memo?.trim() || null,
      isPosted: this.journalEntry.isPosted,
      isVoided: this.journalEntry.isVoided,
      journalEntryLines: (this.journalEntry.journalEntryLines ?? []).map(line => ({
        journalEntryLineId: line.journalEntryLineId,
        journalEntryId: line.journalEntryId,
        chartOfAccountId: line.chartOfAccountId,
        costCodeId: line.costCodeId ?? null,
        propertyId: line.propertyId ?? null,
        reservationId: line.reservationId ?? null,
        contactId: line.contactId ?? null,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? null
      }))
    };
  }
  //#endregion

  //#region Data Loading Methods
  loadReferenceData(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'referenceData');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'referenceData');

    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyLineDisplay();
        this.markViewForCheck();
      });
    });

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'referenceData');
  }

  loadJournalEntry(): void {
    const journalEntryId = this.journalEntryId?.trim();
    if (!journalEntryId) {
      this.journalEntry = null;
      this.lineRows = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
      this.markViewForCheck();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'journalEntry');
    this.isServiceError = false;

    this.generalLedgerService.getJournalEntryById(journalEntryId).pipe(
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry')),
      takeUntil(this.destroy$)
    ).subscribe({
      next: journalEntry => {
        this.journalEntry = journalEntry;
        this.syncFormFromJournalEntry();
        this.applyLineDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('General Ledger - error loading journal entry:', error);
        this.isServiceError = true;
        this.journalEntry = null;
        this.lineRows = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  syncFormFromJournalEntry(): void {
    if (!this.journalEntry) {
      this.form.reset({
        postingDate: null,
        memo: '',
        isPosted: false
      });
      return;
    }

    this.form.reset({
      postingDate: this.utilityService.parseDateOnlyStringToDate(this.journalEntry.postingDate),
      memo: this.journalEntry.memo ?? '',
      isPosted: this.journalEntry.isPosted
    });

    if (this.canEdit) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }

  applyLineDisplay(): void {
    if (!this.journalEntry) {
      this.lineRows = [];
      return;
    }

    this.lineRows = this.mappingService.mapJournalEntryLineDetailDisplay(
      this.journalEntry.journalEntryLines,
      this.chartOfAccounts,
      this.journalEntry.officeId
    );
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  back(): void {
    this.backEvent.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
