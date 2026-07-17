import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { TransactionTypeLabels } from '../../models/accounting-enum';
import { CostCodesRequest, CostCodesResponse, CostCodesListDisplay } from '../../models/cost-codes.model';
import { CostCodesService } from '../../services/cost-codes.service';

@Component({
    standalone: true,
    selector: 'app-cost-codes',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './cost-codes.component.html',
    styleUrl: './cost-codes.component.scss'
})

export class CostCodesComponent implements OnInit, OnDestroy, OnChanges {

  @Input() id: string | number | null = null; // Input to accept id from parent
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() copyFrom: CostCodesListDisplay | null = null;
  @Input() source: 'accounting' | 'configuration' = 'accounting'; // Track where component came from
  @Output() backEvent = new EventEmitter<void>(); // Emit when back button is clicked
  @Output() savedEvent = new EventEmitter<void>();
  costCodesService = inject(CostCodesService);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService); // Emit when save is successful
  @ViewChild('firstInput') firstInputRef: MatSelect;
  @ViewChild('costCodeInput') costCodeInputRef: ElementRef<HTMLInputElement>;
  
  isServiceError: boolean = false;
  costCodeId: number | null = null;
  costCode: CostCodesResponse;
  form: FormGroup;
  fromAccountingTab: boolean = false; // Track if navigated from Accounting tab
  fromOffice: boolean = false; // Track if navigated from Office component (embedded)
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  saveAttempted: boolean = false;
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
 
  organizationId = '';
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
   
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['costCode', 'offices']));
  isPageReady = false;
  destroy$ = new Subject<void>();

  //#region CostCode
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.buildForm();
    this.loadOffices();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
      }

      const routeOfficeId = Number(this.route.snapshot.queryParamMap.get('officeId'));
      if (!this.selectedOffice && Number.isFinite(routeOfficeId) && routeOfficeId > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === routeOfficeId) || null;
      }

      this.applyCostCodeIdContext(this.resolveCostCodeEntityId());
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && this.offices.length > 0) {
      const entityId = this.resolveCostCodeEntityId();
      if (entityId) {
        this.applyCostCodeIdContext(entityId);
      }
    }
    
    if (changes['copyFrom'] && this.isAddMode && this.offices.length > 0) {
      this.applyCopyFromIfPresent();
    }
    
    // Handle officeId changes (from title bar via parent)
    if (changes['officeId'] && this.offices.length > 0) {
      this.syncSelectedOfficeFromInput();
      if (!this.isAddMode && this.costCodeId && this.selectedOffice) {
        this.getCostCode();
      }
    }
  }

  getCostCode(): void {
    if (!this.selectedOffice || !this.costCodeId) {
      // Remove from loading set if we can't load
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
      return;
    }
    
    // Add costCode to loading set
    this.utilityService.addLoadItem(this.itemsToLoad$, 'costCode');
    
    this.costCodesService.getCostCodeById(this.costCodeId, this.selectedOffice.officeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode'); })).subscribe({
      next: (response: CostCodesResponse) => {
        this.costCode = response;
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

  saveCostCode(): void {
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

    // Ensure officeId is a number (already checked for null/0 above)
    const officeIdNumber: number = this.selectedOffice.officeId;

    const costCodeRequest: CostCodesRequest = {
      costCodeId: this.isAddMode ? undefined : this.costCodeId,
      organizationId: user?.organizationId || '',
      officeId: officeIdNumber,
      costCode: formValue.costCode || '',
      transactionTypeId: parseInt(formValue.transactionTypeId, 10),
      description: formValue.description || '',
      isActive: formValue.isActive !== false
    };

    if (this.isAddMode) {
      this.costCodesService.createCostCode(costCodeRequest).pipe(
        take(1), 
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: CostCodesResponse | null) => {
          // Handle successful response (even if body is empty/null)
          this.toastr.success('Cost Code created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          
          // Refresh all cached cost codes so all list views are current.
          this.costCodesService.refreshAllCostCodes().pipe(take(1)).subscribe();
          
          // Clear form for another entry (don't navigate back)
          this.resetForm();
          
          this.savedEvent.emit();
        },
        error: () => {
        }
      });
    } else {
      this.costCodesService.updateCostCode(costCodeRequest).pipe(
        take(1), 
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: CostCodesResponse | null) => {
          // Handle successful response (even if body is empty/null)
          this.toastr.success('Cost Code updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.costCodesService.refreshAllCostCodes().pipe(take(1)).subscribe();
          this.savedEvent.emit();
          this.back();
        },
        error: (err: HttpErrorResponse) => {
          // Only show error for actual errors (5xx server errors or 4xx client errors except 400)
          if (err.status && (err.status >= 500 || (err.status >= 400 && err.status < 500 && err.status !== 400))) {
            this.toastr.error('Update cost code request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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

    // Build form with costCode as optional initially (will be set to required in add mode after isAddMode is determined)
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      costCode: new FormControl('', []), // Validators will be set based on mode
      transactionTypeId: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
    
    // Set costCode validators based on mode after form is built
    this.updateCostCodeValidators();
  }

  populateForm(): void {
    if (this.costCode && this.form) {
      this.form.patchValue({
        organizationId: this.costCode.organizationId,
        costCode: this.costCode.costCode || '',
        transactionTypeId: this.costCode.transactionTypeId?.toString() || '',
        description: this.costCode.description || '',
        isActive: this.costCode.isActive !== false
      });
    }
  }

  applyCopyFromIfPresent(): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    if (this.copyFrom) {
      this.populateFormFromCopy(this.copyFrom);
      return;
    }
    this.loadCopyFromQueryParam();
  }

  loadCopyFromQueryParam(): void {
    const copyFromId = Number(this.route.snapshot.queryParamMap.get('copyFrom'));
    const officeId = Number(this.route.snapshot.queryParamMap.get('officeId'));
    if (!Number.isFinite(copyFromId) || copyFromId <= 0 || !Number.isFinite(officeId) || officeId <= 0) {
      return;
    }
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || this.selectedOffice;
    this.costCodesService.getCostCodeById(copyFromId, officeId).pipe(take(1)).subscribe({
      next: (response: CostCodesResponse) => {
        this.populateFormFromCopy({
          costCodeId: response.costCodeId,
          officeId: response.officeId,
          officeName: '',
          costCode: response.costCode,
          transactionTypeId: response.transactionTypeId,
          transactionType: '',
          description: response.description,
          isActive: response.isActive
        });
      }
    });
  }

  populateFormFromCopy(source: CostCodesListDisplay): void {
    if (!this.form) {
      return;
    }
    if (source.officeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === source.officeId) || this.selectedOffice;
    }
    const user = this.authService.getUser();
    this.form.patchValue({
      organizationId: user?.organizationId || '',
      costCode: '',
      transactionTypeId: source.transactionTypeId?.toString() || '',
      description: source.description || '',
      isActive: source.isActive !== false
    });
  }

  resetForm(): void {
    // Reset form to allow another entry
    this.form.reset();
    const user = this.authService.getUser();
    this.form.patchValue({
      organizationId: user?.organizationId || '',
      isActive: true
    });
    // Reset costCode field to empty
    this.form.get('costCode')?.setValue('');
    this.form.get('transactionTypeId')?.setValue('');
    this.form.get('description')?.setValue('');
    // Mark form as untouched
    this.form.markAsUntouched();
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  focusFirstField(): void {
    if (this.source === 'configuration' || !this.isAddMode) {
      this.costCodeInputRef?.nativeElement?.focus();
      return;
    }
    this.firstInputRef?.focus();
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }
  
  onOfficeChange(): void {
    if (this.selectedOffice?.officeId) {
      this.saveAttempted = false;
    }
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

  updateCostCodeValidators(): void {
    const costCodeControl = this.form.get('costCode');
    if (costCodeControl) {
      costCodeControl.setValidators([Validators.required]);
      costCodeControl.updateValueAndValidity();
    }
  }

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (!this.isSubmitting) {
      this.saveCostCode();
    }
  }

  get shouldValidateOfficeSelection(): boolean {
    return this.isAddMode;
  }

  get showOfficeValidationError(): boolean {
    return this.saveAttempted && this.shouldValidateOfficeSelection && !this.selectedOffice?.officeId;
  }
  //#endregion

  //#region Utility Methods
  resolveCostCodeEntityId(): string {
    const routeId = this.route.snapshot.paramMap.get('id');
    if (routeId != null) {
      return routeId;
    }
    if (this.id != null && String(this.id).trim() !== '') {
      return String(this.id).trim();
    }
    return '';
  }

  applyCostCodeIdContext(entityId: string): void {
    this.isAddMode = entityId === 'new';
    this.updateCostCodeValidators();
    if (this.isAddMode) {
      this.costCodeId = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
      this.applyCopyFromIfPresent();
      this.scheduleFocusFirstField();
      return;
    }

    this.costCodeId = Number(entityId);
    if (this.selectedOffice) {
      this.getCostCode();
    } else if (this.offices.length > 0) {
      this.selectedOffice = this.offices[0];
      this.getCostCode();
    } else {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
    }
  }

  back(): void {
    // Refresh cost codes when navigating back
    if (this.selectedOffice) {
      this.costCodesService.refreshCostCodesForOffice(this.selectedOffice.officeId);
    }
    
    // Component is always embedded - just emit event, parent handles showing the list
    // Parent components (accounting/configuration) will set isEditingCostCodes = false
    // which will show the cost-codes-list component again
    this.backEvent.emit();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
