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
import { MappingService } from '../../../services/mapping.service';

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
  chartOfAccountId: string;
  chartOfAccount: ChartOfAccountsResponse;
  form: FormGroup;
  fromAccountingTab: boolean = false; // Track if navigated from Accounting tab
  fromOffice: boolean = false; // Track if navigated from Office component (embedded)
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
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
    private officeService: OfficeService,
    private mappingService: MappingService
  ) {
  }

  //#region ChartOfAccount
  ngOnInit(): void {
    this.initializeAccountTypes();
    this.buildForm(); // Build form once in ngOnInit
    this.loadOffices();
    
    // If in embedded mode, use Input properties instead of route params
    if (this.embeddedMode) {
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        if (this.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        }
        
        if (this.id) {
          const idStr = this.id.toString();
          this.isAddMode = idStr === 'new';
          this.updateAccountIdValidators(); // Update validators based on mode
          if (this.isAddMode) {
            this.removeLoadItem('chartOfAccount');
          } else {
            this.chartOfAccountId = idStr;
            if (this.selectedOffice) {
              this.getChartOfAccount();
            } else if (this.offices.length > 0) {
              // If no officeId provided, try with first office as fallback
              this.selectedOffice = this.offices[0];
              this.getChartOfAccount();
            } else {
              this.removeLoadItem('chartOfAccount');
            }
          }
        }
      });
      return;
    }
    
    // Not in embedded mode - use route params (existing behavior)
    const snapshotParams = this.route.snapshot.queryParams;
    const officeId = snapshotParams['officeId'];

    this.fromAccountingTab = snapshotParams['fromAccountingTab'] === 'true';
    this.fromOffice = snapshotParams['fromOffice'] === 'true';
    
    // Also subscribe to query params for changes
    this.route.queryParams.subscribe(params => {
      const updatedOfficeId = params['officeId'];
      if (updatedOfficeId && this.offices.length > 0) {
        const parsedOfficeId = parseInt(updatedOfficeId, 10);
        this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
      }
 
      this.fromAccountingTab = params['fromAccountingTab'] === 'true';
      this.fromOffice = params['fromOffice'] === 'true';
    });
    
    // Wait for offices to load before processing route params
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (officeId && this.offices.length > 0) {
        const parsedOfficeId = parseInt(officeId, 10);
        this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
      }
      
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          const idParam = paramMap.get('id');
          this.isAddMode = idParam === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('chartOfAccount');
            // Form already built, no need to rebuild
          } else {
            this.chartOfAccountId = idParam || '';
            if (this.selectedOffice) {
              this.getChartOfAccount();
            } else if (this.offices.length > 0) {
              // If no officeId in query params, use first office
              this.selectedOffice = this.offices[0];
              this.getChartOfAccount();
            }
          }
        }
      });
    });
  }

  getChartOfAccount(): void {
    if (!this.selectedOffice || !this.chartOfAccountId) {
      return;
    }
    this.chartOfAccountsService.getChartOfAccountById(this.chartOfAccountId, this.selectedOffice.officeId).pipe(take(1), finalize(() => { this.removeLoadItem('chartOfAccount'); })).subscribe({
      next: (response: ChartOfAccountsResponse) => {
        this.chartOfAccount = response;
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
    if (!this.selectedOffice || !this.selectedOffice.officeId) {
      this.toastr.error('Office is required', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();

    // Ensure officeId is a number (already checked for null/0 above)
    const officeIdNumber: number = this.selectedOffice.officeId;

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
          
          // Refresh chart of accounts for the office
          if (this.selectedOffice) {
            this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOffice.officeId);
          }
          
          // Clear form for another entry (don't navigate back)
          this.resetFormForNewEntry();
          
          if (this.embeddedMode) {
            this.savedEvent.emit();
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

    // Build form with accountId as optional initially (will be set to required in add mode after isAddMode is determined)
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      accountId: new FormControl('', []), // Validators will be set based on mode
      description: new FormControl('', [Validators.required]),
      accountType: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
    
    // Set accountId validators based on mode after form is built
    this.updateAccountIdValidators();
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

  resetFormForNewEntry(): void {
    // Reset form to allow another entry
    this.form.reset();
    const user = this.authService.getUser();
    this.form.patchValue({
      organizationId: user?.organizationId || '',
      isActive: true
    });
    // Reset accountId field to empty
    this.form.get('accountId')?.setValue('');
    this.form.get('description')?.setValue('');
    this.form.get('accountType')?.setValue('');
    // Mark form as untouched
    this.form.markAsUntouched();
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

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.removeLoadItem('offices');
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    // This will be called when office selection changes in the dropdown
    // selectedOffice is updated via ngModel binding
  }

  getOfficeName(): string {
    if (!this.selectedOffice) {
      return '';
    }
    return this.selectedOffice.name || '';
  }

  updateAccountIdValidators(): void {
    const accountIdControl = this.form.get('accountId');
    if (accountIdControl) {
      if (this.isAddMode) {
        accountIdControl.setValidators([Validators.required]);
      } else {
        accountIdControl.clearValidators();
      }
      accountIdControl.updateValueAndValidity();
    }
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
  //#endregion

  //#region Utility Methods
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
    // Refresh chart of accounts when navigating back
    if (this.selectedOffice) {
      this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOffice.officeId);
    }
    
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.backEvent.emit();
      return;
    }
    
    // If navigated from Office component (embedded), go back to Office component
    if (this.fromOffice && this.selectedOffice) {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, [this.selectedOffice.officeId.toString()]);
      this.router.navigateByUrl(url);
    } else if (this.fromAccountingTab) {
      // If navigated from Accounting tab, go back to Accounting list with Chart Of Accounts tab selected
      const url = RouterUrl.AccountingList;
      const queryParams: string[] = [];
      if (this.selectedOffice) {
        queryParams.push('officeId=' + this.selectedOffice.officeId);
      }
      queryParams.push('tab=chartOfAccounts');
      this.router.navigateByUrl(url + (queryParams.length > 0 ? '?' + queryParams.join('&') : ''));
    } else {
      // Navigate back to Chart Of Accounts list with officeId query parameter if available
      if (this.selectedOffice) {
        this.router.navigateByUrl(RouterUrl.ChartOfAccountsList + '?officeId=' + this.selectedOffice.officeId);
      } else {
        this.router.navigateByUrl(RouterUrl.ChartOfAccountsList);
      }
    }
  }
  //#endregion
}
