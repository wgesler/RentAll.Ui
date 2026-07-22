import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { getPostingStatusLabel } from '../../models/accounting-enum';
import { JournalEntryLineSearchResponse, JournalEntryPostingAction, JournalEntryPostingDialogData, JournalEntryPostingDialogEntry, JournalEntryPostingDialogResult } from '../../models/journal-entry.model';
import { GeneralLedgerService } from '../../services/general-ledger.service';

@Component({
  standalone: true,
  selector: 'app-journal-entry-posting-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './journal-entry-posting-dialog.component.html',
  styleUrl: './journal-entry-posting-dialog.component.scss'
})
export class JournalEntryPostingDialogComponent implements OnInit, OnDestroy {
  data = inject<JournalEntryPostingDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<JournalEntryPostingDialogComponent, JournalEntryPostingDialogResult | undefined>>(MatDialogRef);
  private fb = inject(FormBuilder);
  private generalLedgerService = inject(GeneralLedgerService);
  private formatterService = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);

  displayedEntries: JournalEntryPostingDialogEntry[] = [];
  isLoadingEntries = false;
  showDateValidationError = false;
  destroy$ = new Subject<void>();

  readonly form = this.fb.group({
    action: ['post' as JournalEntryPostingAction, Validators.required],
    startDate: [null as Date | null],
    endDate: [null as Date | null]
  });

  readonly postingActionInstructions: ReadonlyArray<{
    action: JournalEntryPostingAction;
    label: string;
    text: string;
  }> = [
    {
      action: 'post',
      label: 'Post',
      text: 'Prevents items from being cleared from the General Ledger.'
    },
    {
      action: 'softClose',
      label: 'Soft Close',
      text: 'Locks down Journal Entries within certain date ranges and requires an administrator to change.'
    },
    {
      action: 'hardClose',
      label: 'Hard Close',
      text: 'Locks down Journal Entries within certain date ranges and prevents all changes.'
    }
  ];

  //#region Journal Entry Posting Dialog
  ngOnInit(): void {
    this.displayedEntries = [...this.data.initialEntries];
    this.form.get('action')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(action => {
      this.showDateValidationError = false;
      if (action === 'post') {
        this.displayedEntries = [...this.data.initialEntries];
        return;
      }
      this.tryLoadPeriodEntries();
    });

    this.form.get('startDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.showDateValidationError = false;
      if (this.requiresDateRange) {
        this.tryLoadPeriodEntries();
      }
    });

    this.form.get('endDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.showDateValidationError = false;
      if (this.requiresDateRange) {
        this.tryLoadPeriodEntries();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get requiresDateRange(): boolean {
    return this.form.getRawValue().action !== 'post';
  }

  get hasPeriodDateRange(): boolean {
    return !!this.resolveDateControlValue('startDate') && !!this.resolveDateControlValue('endDate');
  }

  get dateFieldClass(): string {
    return this.showDateValidationError ? 'journal-entry-posting-dialog__date-field journal-entry-posting-dialog__date-field--error' : 'journal-entry-posting-dialog__date-field';
  }

  get confirmButtonLabel(): string {
    const action = this.form.getRawValue().action;
    if (action === 'softClose') {
      return 'Soft Close';
    }
    if (action === 'hardClose') {
      return 'Hard Close';
    }
    return 'Post';
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onPost(): void {
    const action = this.form.getRawValue().action;
    if (this.requiresDateRange) {
      const startDate = this.resolveDateControlValue('startDate');
      const endDate = this.resolveDateControlValue('endDate');
      if (!startDate || !endDate) {
        this.showDateValidationError = true;
        this.toastr.error('Please correct the highlighted fields before posting.', CommonMessage.Error);
        return;
      }
      if (Date.parse(`${startDate}T00:00:00`) > Date.parse(`${endDate}T00:00:00`)) {
        this.showDateValidationError = true;
        this.toastr.error('Start Date must be on or before End Date.', CommonMessage.Error);
        return;
      }
    }

    if (this.displayedEntries.length === 0 && action === 'post') {
      this.toastr.warning('Select one or more journal entries to post.');
      return;
    }

    const startDate = this.requiresDateRange ? this.resolveDateControlValue('startDate') : null;
    const endDate = this.requiresDateRange ? this.resolveDateControlValue('endDate') : null;
    this.dialogRef.close({
      action,
      officeId: this.data.officeId,
      journalEntryIds: this.displayedEntries.map(entry => entry.journalEntryId),
      startDate,
      endDate
    });
  }
  //#endregion

  //#region Data Loading Methods
  tryLoadPeriodEntries(): void {
    const startDate = this.resolveDateControlValue('startDate');
    const endDate = this.resolveDateControlValue('endDate');
    if (!startDate || !endDate) {
      this.displayedEntries = [];
      return;
    }

    if (Date.parse(`${startDate}T00:00:00`) > Date.parse(`${endDate}T00:00:00`)) {
      this.displayedEntries = [];
      return;
    }

    this.isLoadingEntries = true;
    this.generalLedgerService.searchJournalEntryLines({
      officeIds: this.data.officeIds,
      includeVoided: true,
      includeUnposted: true
    }).pipe(
      take(1),
      finalize(() => {
        this.isLoadingEntries = false;
      })
    ).subscribe({
      next: lines => {
        this.displayedEntries = this.buildPeriodEntries(lines, startDate, endDate);
      },
      error: () => {
        this.displayedEntries = [];
        this.toastr.error('Unable to load journal entries for the selected date range.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Utility Methods
  buildPeriodEntries(lines: JournalEntryLineSearchResponse[], startDate: string, endDate: string): JournalEntryPostingDialogEntry[] {
    const grouped = new Map<string, JournalEntryLineSearchResponse>();
    for (const line of lines ?? []) {
      const journalEntryId = (line.journalEntryId || '').trim();
      if (!journalEntryId || grouped.has(journalEntryId)) {
        continue;
      }
      if (!this.isAccountingPeriodInRange(line.accountingPeriod, startDate, endDate)) {
        continue;
      }
      grouped.set(journalEntryId, line);
    }

    return Array.from(grouped.values())
      .sort((left, right) => this.compareEntries(left, right))
      .map(line => this.mapLineToEntry(line));
  }

  mapLineToEntry(line: JournalEntryLineSearchResponse): JournalEntryPostingDialogEntry {
    const journalEntryMemo = (line.journalEntryMemo || '').trim();
    const lineMemo = (line.memo || '').trim();
    return {
      journalEntryId: line.journalEntryId,
      journalEntryCode: (line.journalEntryCode || '').trim(),
      transactionDate: this.formatterService.formatDateString(line.transactionDate),
      accountingPeriod: this.formatterService.formatDateString(line.accountingPeriod),
      description: lineMemo || journalEntryMemo || '—',
      postingStatusId: Number(line.postingStatusId ?? 0),
      postingStatusLabel: getPostingStatusLabel(line.postingStatusId)
    };
  }

  isAccountingPeriodInRange(accountingPeriod: string, startDate: string, endDate: string): boolean {
    const periodValue = Date.parse(`${accountingPeriod}T00:00:00`);
    const startValue = Date.parse(`${startDate}T00:00:00`);
    const endValue = Date.parse(`${endDate}T00:00:00`);
    if (!Number.isFinite(periodValue) || !Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      return false;
    }
    return periodValue >= startValue && periodValue <= endValue;
  }

  compareEntries(left: JournalEntryLineSearchResponse, right: JournalEntryLineSearchResponse): number {
    const createdCompare = left.journalEntryCreatedOn.localeCompare(right.journalEntryCreatedOn);
    if (createdCompare !== 0) {
      return createdCompare;
    }

    return (left.journalEntryCode || '').trim().localeCompare((right.journalEntryCode || '').trim());
  }

  resolveDateControlValue(controlName: 'startDate' | 'endDate'): string | null {
    const value = this.form.get(controlName)?.value;
    return this.utilityService.toDateOnlyJsonString(value);
  }
  //#endregion
}
