import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { AccountTypeLabels } from '../models/accounting-enum';
import { ChartOfAccountRequest, ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';

@Component({
  standalone: true,
  selector: 'app-chart-of-accounts',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './chart-of-accounts.component.html',
  styleUrl: './chart-of-accounts.component.scss'
})
export class ChartOfAccountComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() officeId: number | null = null;
  @Input() source: 'accounting' | 'configuration' = 'accounting';
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();
  @ViewChild('officeSelect') officeSelectRef: MatSelect;
  @ViewChild('accountNoInput') accountNoInputRef: ElementRef<HTMLInputElement>;

  isServiceError = false;
  accountId: number | null = null;
  chartOfAccount: ChartOfAccountResponse | null = null;
  form: FormGroup;
  isSubmitting = false;
  isAddMode = false;
  saveAttempted = false;
  accountTypes = AccountTypeLabels.map(({ value, label }) => ({ value, label }));
  parentAccountOptions: { value: number; label: string }[] = [];
  allChartOfAccounts: ChartOfAccountResponse[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['chartOfAccount', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public chartOfAccountsService: ChartOfAccountsService,
    public router: Router,
    public fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region ChartOfAccount
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.buildForm();
    this.loadOffices();
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.allChartOfAccounts = accounts || [];
        this.refreshParentAccountOptions();
      });
    });

    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.syncSelectedOfficeFromInput();
      this.initializeFromId();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && this.offices.length > 0) {
      this.initializeFromId();
    }
    if (changes['officeId'] && this.offices.length > 0) {
      this.syncSelectedOfficeFromInput();
      if (!this.isAddMode && this.accountId && this.selectedOffice) {
        this.getChartOfAccount();
      } else {
        this.refreshParentAccountOptions();
      }
    }
  }

  initializeFromId(): void {
    this.syncSelectedOfficeFromInput();
    if (!this.id) {
      this.isAddMode = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccount');
      this.refreshParentAccountOptions();
      this.scheduleFocusFirstField();
      return;
    }

    const idStr = this.id.toString();
    this.isAddMode = idStr === 'new';
    if (this.isAddMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccount');
      this.refreshParentAccountOptions();
      this.scheduleFocusFirstField();
      return;
    }

    this.accountId = Number(idStr);
    if (this.selectedOffice) {
      this.getChartOfAccount();
    } else if (this.offices.length > 0) {
      this.selectedOffice = this.offices[0];
      this.getChartOfAccount();
    } else {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccount');
    }
  }

  getChartOfAccount(): void {
    if (!this.selectedOffice || this.accountId == null) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccount');
      return;
    }

    this.chartOfAccountsService.getChartOfAccountById(this.selectedOffice.officeId, this.accountId).pipe(
      take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccount'))).subscribe({
      next: response => {
        this.chartOfAccount = response;
        this.selectedOffice = this.offices.find(o => o.officeId === response.officeId) || this.selectedOffice;
        this.populateForm();
        this.refreshParentAccountOptions();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          return;
        }
        this.toastr.error('Unable to load chart of account.', CommonMessage.Error);
      }
    });
  }

  saveChartOfAccount(): void {
    this.saveAttempted = true;
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity({ emitEvent: false });

    const hasRequiredOfficeSelection = !this.shouldValidateOfficeSelection || !!this.selectedOffice?.officeId;
    if (!this.form.valid || !hasRequiredOfficeSelection) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const officeIdNumber = this.selectedOffice!.officeId;
    const isSubaccount = formValue.isSubaccount === true;
    const parsedSubAccountId = this.utilityService.parseOptionalIntString(formValue.subAccountId);

    const request: ChartOfAccountRequest = {
      organizationId: user?.organizationId || '',
      officeId: officeIdNumber,
      accountNo: String(formValue.accountNo || '').trim(),
      accountTypeId: parseInt(formValue.accountTypeId, 10),
      name: String(formValue.name || '').trim(),
      isSubaccount,
      subAccountId: isSubaccount ? parsedSubAccountId : null,
      description: this.utilityService.trimOrNull(formValue.description),
      note: this.utilityService.trimOrNull(formValue.note)
    };

    if (this.isAddMode) {
      if (isSubaccount && request.subAccountId == null) {
        this.isSubmitting = false;
        this.toastr.error('Select a valid parent account for the subaccount.', CommonMessage.Error);
        return;
      }
    } else {
      request.accountId = this.accountId ?? undefined;

      if (request.accountId == null) {
        this.isSubmitting = false;
        this.toastr.error('Unable to determine account id.', CommonMessage.Error);
        return;
      }

      if (isSubaccount && (request.subAccountId == null || request.subAccountId === request.accountId)) {
        this.isSubmitting = false;
        this.toastr.error('Select a valid parent account for the subaccount.', CommonMessage.Error);
        return;
      }
    }

    const save$ = this.isAddMode
      ? this.chartOfAccountsService.createChartOfAccount(request)
      : this.chartOfAccountsService.updateChartOfAccount(request);

    save$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        this.toastr.success(
          this.isAddMode ? 'Chart of account created successfully' : 'Chart of account updated successfully',
          CommonMessage.Success,
          { timeOut: CommonTimeouts.Success }
        );
        this.chartOfAccountsService.notifyChartOfAccountsChanged();
        if (this.isAddMode) {
          this.resetFormForNewEntry();
        } else {
          this.back();
        }
        this.savedEvent.emit();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status && (err.status >= 500 || (err.status >= 400 && err.status < 500 && err.status !== 400))) {
          this.toastr.error('Save chart of account request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    const user = this.authService.getUser();
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      accountNo: new FormControl('', [Validators.required]),
      accountTypeId: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      isSubaccount: new FormControl(false),
      subAccountId: new FormControl(''),
      description: new FormControl(''),
      note: new FormControl('')
    });

    this.form.get('isSubaccount')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(isSubaccount => {
      this.applySubaccountValidators(isSubaccount === true);
    });
  }

  populateForm(): void {
    if (!this.chartOfAccount || !this.form) {
      return;
    }
    this.accountId = this.chartOfAccount.accountId ?? this.accountId;
    this.form.patchValue({
      organizationId: this.chartOfAccount.organizationId,
      accountNo: this.chartOfAccount.accountNo || '',
      accountTypeId: this.chartOfAccount.accountTypeId?.toString() || '',
      name: this.chartOfAccount.name || '',
      isSubaccount: this.chartOfAccount.isSubaccount === true,
      subAccountId: this.chartOfAccount.subAccountId?.toString() || '',
      description: this.chartOfAccount.description || '',
      note: this.chartOfAccount.note || ''
    });
    this.applySubaccountValidators(this.chartOfAccount.isSubaccount === true);
  }

  applySubaccountValidators(isSubaccount: boolean): void {
    const subAccountControl = this.form.get('subAccountId');
    if (!subAccountControl) {
      return;
    }
    if (isSubaccount) {
      subAccountControl.setValidators([Validators.required]);
    } else {
      subAccountControl.clearValidators();
      subAccountControl.setValue('');
    }
    subAccountControl.updateValueAndValidity({ emitEvent: false });
  }

  resetFormForNewEntry(): void {
    this.form.reset();
    const user = this.authService.getUser();
    this.form.patchValue({
      organizationId: user?.organizationId || '',
      isSubaccount: false
    });
    this.form.markAsUntouched();
    this.saveAttempted = false;
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))
    ).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.syncSelectedOfficeFromInput();
        this.refreshParentAccountOptions();
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  refreshParentAccountOptions(): void {
    const officeId = this.selectedOffice?.officeId;
    if (!officeId) {
      this.parentAccountOptions = [];
      return;
    }
    const currentAccountId = this.isAddMode ? null : this.accountId;
    this.parentAccountOptions = this.allChartOfAccounts
      .filter(account => account.officeId === officeId)
      .filter(account => account.accountId !== currentAccountId)
      .map(account => ({
        value: account.accountId,
        label: `${account.accountNo} - ${account.name}`
      }));
  }

  focusFirstField(): void {
    if (this.isAddMode && this.officeSelectRef) {
      this.officeSelectRef.focus();
      return;
    }
    this.accountNoInputRef?.nativeElement?.focus();
  }

  onOfficeChange(): void {
    if (this.selectedOffice?.officeId) {
      this.saveAttempted = false;
      this.refreshParentAccountOptions();
      return;
    }
    this.parentAccountOptions = [];
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) {
      return;
    }
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }

  syncSelectedOfficeFromInput(): void {
    if (this.officeId != null) {
      this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
      return;
    }
    this.selectedOffice = null;
  }

  getOfficeName(): string {
    if (this.selectedOffice) {
      return this.selectedOffice.name || '';
    }
    return this.source === 'configuration' ? 'All Offices' : '';
  }

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (!this.isSubmitting) {
      this.saveChartOfAccount();
    }
  }

  get shouldValidateOfficeSelection(): boolean {
    return this.isAddMode;
  }

  get showOfficeValidationError(): boolean {
    return this.saveAttempted && this.shouldValidateOfficeSelection && !this.selectedOffice?.officeId;
  }

  get showSubaccountFields(): boolean {
    return this.form?.get('isSubaccount')?.value === true;
  }
  //#endregion

  //#region Utility Methods
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
