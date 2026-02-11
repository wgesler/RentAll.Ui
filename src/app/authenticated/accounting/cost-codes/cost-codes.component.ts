import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { TransactionTypeLabels } from '../models/accounting-enum';
import { CostCodesRequest, CostCodesResponse } from '../models/cost-codes.model';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
  selector: 'app-cost-codes',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './cost-codes.component.html',
  styleUrl: './cost-codes.component.scss'
})

export class CostCodesComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null; // Input to accept id from parent
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() source: 'accounting' | 'configuration' = 'accounting'; // Track where component came from
  @Output() backEvent = new EventEmitter<void>(); // Emit when back button is clicked
  @Output() savedEvent = new EventEmitter<void>(); // Emit when save is successful
  
  isServiceError: boolean = false;
  costCodeId: string;
  costCode: CostCodesResponse;
  form: FormGroup;
  fromAccountingTab: boolean = false; // Track if navigated from Accounting tab
  fromOffice: boolean = false; // Track if navigated from Office component (embedded)
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
 
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  officesSubscription?: Subscription;
   
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['costCode', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public costCodesService: CostCodesService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region CostCode
  ngOnInit(): void {
    this.buildForm();
    this.loadOffices();
    
    // Component is always embedded - use Input properties
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
      }
      
      if (this.id) {
        const idStr = this.id.toString();
        this.isAddMode = idStr === 'new';
        this.updateCostCodeValidators();
        if (this.isAddMode) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
        } else {
          this.costCodeId = idStr;
          if (this.selectedOffice) {
            this.getCostCode();
          } else if (this.offices.length > 0) {
            // If no officeId provided, try with first office as fallback
            this.selectedOffice = this.offices[0];
            this.getCostCode();
          } else {
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
          }
        }
      } else {
        // No id provided - default to add mode
        this.isAddMode = true;
        this.updateCostCodeValidators();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle id changes (including first change when inputs are bound)
    if (changes['id'] && this.offices.length > 0) {
      const newId = changes['id'].currentValue;
      if (newId) {
        const idStr = newId.toString();
        this.isAddMode = idStr === 'new';
        this.updateCostCodeValidators();
        if (this.isAddMode) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
        } else {
          this.costCodeId = idStr;
          if (this.selectedOffice) {
            this.getCostCode();
          } else if (this.offices.length > 0) {
            this.selectedOffice = this.offices[0];
            this.getCostCode();
          } else {
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
          }
        }
      } else {
        // No id - add mode
        this.isAddMode = true;
        this.updateCostCodeValidators();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode');
      }
    }
    
    // Handle officeId changes
    if (changes['officeId'] && this.offices.length > 0) {
      if (this.officeId) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        // If we have a costCodeId and are in edit mode, reload
        if (!this.isAddMode && this.costCodeId && this.selectedOffice) {
          this.getCostCode();
        }
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
          
          // Refresh cost codes for the office
          if (this.selectedOffice) {
            this.costCodesService.refreshCostCodesForOffice(this.selectedOffice.officeId);
          }
          
          // Clear form for another entry (don't navigate back)
          this.resetFormForNewEntry();
          
          this.savedEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          // Only show error for actual errors (5xx server errors or 4xx client errors except 400)
          if (err.status && (err.status >= 500 || (err.status >= 400 && err.status < 500 && err.status !== 400))) {
            this.toastr.error('Create cost code request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
          // For 400 errors, the API should return validation errors in the response body
          // which can be handled separately if needed
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

  resetFormForNewEntry(): void {
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
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
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

  updateCostCodeValidators(): void {
    const costCodeControl = this.form.get('costCode');
    if (costCodeControl) {
      if (this.isAddMode) {
        costCodeControl.setValidators([Validators.required]);
      } else {
        costCodeControl.clearValidators();
      }
      costCodeControl.updateValueAndValidity();
    }
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
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
  //#endregion
}
