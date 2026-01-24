import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ChartOfAccountsResponse, ChartOfAccountsRequest } from '../models/chart-of-accounts.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { AccountingType } from '../models/accounting-enum';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';

@Component({
  selector: 'app-chart-of-accounts',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './chart-of-accounts.component.html',
  styleUrl: './chart-of-accounts.component.scss'
})

export class ChartOfAccountsComponent implements OnInit, OnDestroy {
  @Input() id: string | number | null = null; // Input to accept id from parent (for embedded mode)
  @Input() officeId: number | null = null; // Input to accept officeId from parent (for embedded mode)
  @Input() embeddedMode: boolean = false; // If true, component is embedded in parent
  @Output() backEvent = new EventEmitter<void>(); // Emit when back button is clicked (for embedded mode)
  @Output() savedEvent = new EventEmitter<void>(); // Emit when save is successful (for embedded mode)
  
  isServiceError: boolean = false;
  chartOfAccountId: number;
  chartOfAccount: ChartOfAccountsResponse;
  form: FormGroup;
  fromAccountingTab: boolean = false; // Track if navigated from Accounting tab
  fromOffice: boolean = false; // Track if navigated from Office component (embedded)
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOfficeId: number | null = null;
  officesSubscription?: Subscription;
  
  accountTypes: { value: number, label: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['chartOfAccount', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public chartOfAccountsService: ChartOfAccountsService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private officeService: OfficeService
  ) {
  }

  //#region ChartOfAccount
  ngOnInit(): void {
    this.initializeAccountTypes();
    
    // If in embedded mode, use Input properties instead of route params
    if (this.embeddedMode) {
      if (this.officeId) {
        this.selectedOfficeId = this.officeId;
      }
      this.fromOffice = true; // Set flag for embedded mode
      
      this.loadOffices().then(() => {
        if (this.id) {
          const idStr = this.id.toString();
          this.isAddMode = idStr === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('chartOfAccount');
            this.buildForm();
          } else {
            this.chartOfAccountId = parseInt(idStr, 10);
            if (this.selectedOfficeId) {
              this.getChartOfAccount();
            }
          }
        }
      });
      return;
    }
    
    // Not in embedded mode - use route params (existing behavior)
    const snapshotParams = this.route.snapshot.queryParams;
    const officeId = snapshotParams['officeId'];
    if (officeId) {
      this.selectedOfficeId = parseInt(officeId, 10);
    }
    // Check if navigated from Accounting tab - read from snapshot for immediate availability
    this.fromAccountingTab = snapshotParams['fromAccountingTab'] === 'true';
    // Check if navigated from Office component (embedded) - read from snapshot for immediate availability
    this.fromOffice = snapshotParams['fromOffice'] === 'true';
    
    // Also subscribe to query params for changes
    this.route.queryParams.subscribe(params => {
      const updatedOfficeId = params['officeId'];
      if (updatedOfficeId) {
        this.selectedOfficeId = parseInt(updatedOfficeId, 10);
      }
      // Update fromAccountingTab flag if it changes
      this.fromAccountingTab = params['fromAccountingTab'] === 'true';
      // Update fromOffice flag if it changes
      this.fromOffice = params['fromOffice'] === 'true';
    });
    
    this.loadOffices().then(() => {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          const idParam = paramMap.get('id');
          this.isAddMode = idParam === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('chartOfAccount');
            this.buildForm();
          } else {
            this.chartOfAccountId = parseInt(idParam || '0', 10);
            // Need officeId from query params
            if (this.selectedOfficeId) {
              this.getChartOfAccount();
            } else if (this.offices.length > 0) {
              // If no officeId in query params, use first office
              this.selectedOfficeId = this.offices[0].officeId;
              this.getChartOfAccount();
            }
          }
        }
      });
    });
  }

  getChartOfAccount(): void {
    if (!this.selectedOfficeId || !this.chartOfAccountId) {
      return;
    }
    this.chartOfAccountsService.getChartOfAccountById(this.chartOfAccountId, this.selectedOfficeId).pipe(
      take(1), 
      finalize(() => { this.removeLoadItem('chartOfAccount'); })
    ).subscribe({
      next: (response: ChartOfAccountsResponse) => {
        this.chartOfAccount = response;
        // Use officeId from the response
        if (response.officeId) {
          this.selectedOfficeId = response.officeId;
        }
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  saveChartOfAccount(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    // Ensure we have a valid officeId
    if (!this.selectedOfficeId || this.selectedOfficeId === 0) {
      this.toastr.error('Office is required', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();

    // Ensure officeId is a number (already checked for null/0 above)
    const officeIdNumber: number = Number(this.selectedOfficeId);

    const chartOfAccountRequest: ChartOfAccountsRequest = {
      chartOfAccountId: this.isAddMode ? undefined : this.chartOfAccountId,
      organizationId: user?.organizationId || '',
      officeId: officeIdNumber,
      accountId: parseInt(formValue.accountId, 10),
      description: formValue.description || '',
      accountType: parseInt(formValue.accountType, 10),
      isActive: formValue.isActive !== false
    };

    if (this.isAddMode) {
      this.chartOfAccountsService.createChartOfAccount(chartOfAccountRequest).pipe(
        take(1), 
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: ChartOfAccountsResponse | null) => {
          // Handle successful response (even if body is empty/null)
          this.toastr.success('Chart of Account created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.savedEvent.emit();
            this.back();
          } else {
            this.back();
          }
        },
        error: (err: HttpErrorResponse) => {
          // Only show error for actual errors (5xx server errors or 4xx client errors except 400)
          if (err.status && (err.status >= 500 || (err.status >= 400 && err.status < 500 && err.status !== 400))) {
            this.toastr.error('Create chart of account request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
          // For 400 errors, the API should return validation errors in the response body
          // which can be handled separately if needed
        }
      });
    } else {
      this.chartOfAccountsService.updateChartOfAccount(chartOfAccountRequest).pipe(
        take(1), 
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: ChartOfAccountsResponse | null) => {
          // Handle successful response (even if body is empty/null)
          this.toastr.success('Chart of Account updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.savedEvent.emit();
            this.back();
          } else {
            this.back();
          }
        },
        error: (err: HttpErrorResponse) => {
          // Only show error for actual errors (5xx server errors or 4xx client errors except 400)
          if (err.status && (err.status >= 500 || (err.status >= 400 && err.status < 500 && err.status !== 400))) {
            this.toastr.error('Update chart of account request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
          // For 400 errors, the API should return validation errors in the response body
          // which can be handled separately if needed
        }
      });
    }
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    const user = this.authService.getUser();

    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      accountId: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      accountType: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.chartOfAccount && this.form) {
      this.form.patchValue({
        organizationId: this.chartOfAccount.organizationId,
        accountId: this.chartOfAccount.accountId.toString(),
        description: this.chartOfAccount.description || '',
        accountType: this.chartOfAccount.accountType.toString(),
        isActive: this.chartOfAccount.isActive !== false
      });
    }
  }
  //#endregion

  //#region Data Load Methods
  initializeAccountTypes(): void {
    this.accountTypes = [
      { value: AccountingType.Bank, label: 'Bank' },
      { value: AccountingType.AccountsReceivable, label: 'Accounts Receivable' },
      { value: AccountingType.OtherCurrentAsset, label: 'Other Current Asset' },
      { value: AccountingType.FixedAsset, label: 'Fixed Asset' },
      { value: AccountingType.AccountsPayable, label: 'Accounts Payable' },
      { value: AccountingType.CreditCard, label: 'Credit Card' },
      { value: AccountingType.OtherCurrentLiability, label: 'Other Current Liability' },
      { value: AccountingType.LongTermLiability, label: 'Long Term Liability' },
      { value: AccountingType.Equity, label: 'Equity' },
      { value: AccountingType.Income, label: 'Income' },
      { value: AccountingType.CostOfGoodsSold, label: 'Cost of Goods Sold' },
      { value: AccountingType.Expense, label: 'Expense' }
    ];
  }

  loadOffices(): Promise<void> {
    return new Promise((resolve) => {
      // Wait for offices to be loaded initially, then subscribe to changes
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.removeLoadItem('offices');
        this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.offices.map(office => ({
            value: office.officeId,
            name: office.name
          }));
          if (this.offices.length > 0 && !this.selectedOfficeId) {
            this.selectedOfficeId = this.offices[0].officeId;
          }
          resolve();
        });
      });
    });
  }
   //#endregion

  //#region Utility Methods
  getOfficeName(): string {
    if (!this.selectedOfficeId) {
      return '';
    }
    const office = this.availableOffices.find(o => o.value === this.selectedOfficeId);
    return office?.name || '';
  }

  onAccountNoKeyPress(event: KeyboardEvent): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    // Allow only numbers (0-9)
    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.backEvent.emit();
      return;
    }
    
    // If navigated from Office component (embedded), go back to Office component
    if (this.fromOffice && this.selectedOfficeId) {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, [this.selectedOfficeId.toString()]);
      this.router.navigateByUrl(url);
    } else if (this.fromAccountingTab) {
      // If navigated from Accounting tab, go back to Accounting list with Chart Of Accounts tab selected
      const url = RouterUrl.AccountingList;
      const queryParams: string[] = [];
      if (this.selectedOfficeId) {
        queryParams.push('officeId=' + this.selectedOfficeId);
      }
      queryParams.push('tab=chartOfAccounts');
      this.router.navigateByUrl(url + (queryParams.length > 0 ? '?' + queryParams.join('&') : ''));
    } else {
      // Navigate back to Chart Of Accounts list with officeId query parameter if available
      if (this.selectedOfficeId) {
        this.router.navigateByUrl(RouterUrl.ChartOfAccountsList + '?officeId=' + this.selectedOfficeId);
      } else {
        this.router.navigateByUrl(RouterUrl.ChartOfAccountsList);
      }
    }
  }
  //#endregion
}
