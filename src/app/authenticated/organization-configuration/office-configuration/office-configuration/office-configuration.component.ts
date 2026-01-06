import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { OfficeConfigurationService } from '../services/office-configuration.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { OfficeConfigurationResponse, OfficeConfigurationRequest } from '../models/office-configuration.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';
import { FormatterService } from '../../../../services/formatter-service';

@Component({
  selector: 'app-office-configuration',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './office-configuration.component.html',
  styleUrl: './office-configuration.component.scss'
})

export class OfficeConfigurationComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeOfficeId: string | null = null;
  officeConfiguration: OfficeConfigurationResponse | null = null;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['officeConfiguration', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public officeConfigurationService: OfficeConfigurationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService,
    private formatterService: FormatterService
  ) {
  }

  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get office ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeOfficeId = paramMap.get('id');
          this.isAddMode = this.routeOfficeId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('officeConfiguration');
            this.buildForm();
          } else {
            const officeIdNum = Number(this.routeOfficeId);
            if (!isNaN(officeIdNum)) {
              this.selectedOfficeId = officeIdNum;
              this.getOfficeConfiguration(officeIdNum);
            }
          }
        }
      });
      if (!this.isAddMode) {
        this.buildForm();
      }
    } else {
      // In embedded mode, use the input officeId
      if (this.officeId) {
        this.isAddMode = this.officeId === 'new' || this.officeId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('officeConfiguration');
          this.buildForm();
        } else {
          const officeIdNum = Number(this.officeId);
          if (!isNaN(officeIdNum)) {
            this.selectedOfficeId = officeIdNum;
            this.getOfficeConfiguration(officeIdNum);
          }
        }
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and officeId changes, reload configuration
    if (this.embeddedMode && changes['officeId'] && !changes['officeId'].firstChange) {
      const newId = changes['officeId'].currentValue;
      if (newId && newId !== 'new') {
        const officeIdNum = Number(newId);
        if (!isNaN(officeIdNum)) {
          this.selectedOfficeId = officeIdNum;
          this.getOfficeConfiguration(officeIdNum);
        }
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('officeConfiguration');
        this.buildForm();
      }
    }
  }

  getOfficeConfiguration(officeId: number): void {
    if (!officeId || isNaN(officeId)) {
      return;
    }
    this.officeConfigurationService.getOfficeConfigurationByOfficeId(officeId).pipe(take(1), finalize(() => { this.removeLoadItem('officeConfiguration'); })).subscribe({
      next: (response: OfficeConfigurationResponse) => {
        this.officeConfiguration = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Office configuration doesn't exist yet, initialize with defaults
          this.officeConfiguration = null;
          this.resetForm();
          this.removeLoadItem('officeConfiguration');
        } else {
          this.isServiceError = true;
          if (err.status !== 400) {
            this.toastr.error('Could not load office configuration info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
          this.removeLoadItem('officeConfiguration');
        }
      }
    });
  }

  onOfficeDropdownSelected(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    if (officeId) {
      this.getOfficeConfiguration(officeId);
    } else {
      this.officeConfiguration = null;
      this.resetForm();
    }
  }

  saveOfficeConfiguration(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.selectedOfficeId) {
      this.toastr.error('Please select an office.', CommonMessage.ServiceError);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();

    const officeConfigurationRequest: OfficeConfigurationRequest = {
      officeId: this.selectedOfficeId,
      maintenanceEmail: formValue.maintenanceEmail || undefined,
      afterHoursPhone: formValue.afterHoursPhone ? this.formatterService.stripPhoneFormatting(formValue.afterHoursPhone) : undefined,
      afterHoursInstructions: formValue.afterHoursInstructions || undefined,
      defaultDeposit: formValue.defaultDeposit ? parseFloat(formValue.defaultDeposit.toString()) : 0,
      utilityOneBed: formValue.utilityOneBed ? parseFloat(formValue.utilityOneBed.toString()) : 0,
      utilityTwoBed: formValue.utilityTwoBed ? parseFloat(formValue.utilityTwoBed.toString()) : 0,
      utilityThreeBed: formValue.utilityThreeBed ? parseFloat(formValue.utilityThreeBed.toString()) : 0,
      utilityFourBed: formValue.utilityFourBed ? parseFloat(formValue.utilityFourBed.toString()) : 0,
      utilityHouse: formValue.utilityHouse ? parseFloat(formValue.utilityHouse.toString()) : 0,
      maidOneBed: formValue.maidOneBed ? parseFloat(formValue.maidOneBed.toString()) : 0,
      maidTwoBed: formValue.maidTwoBed ? parseFloat(formValue.maidTwoBed.toString()) : 0,
      maidThreeBed: formValue.maidThreeBed ? parseFloat(formValue.maidThreeBed.toString()) : 0,
      maidFourBed: formValue.maidFourBed ? parseFloat(formValue.maidFourBed.toString()) : 0,
      parkingLowEnd: formValue.parkingLowEnd ? parseFloat(formValue.parkingLowEnd.toString()) : 0,
      parkingHighEnd: formValue.parkingHighEnd ? parseFloat(formValue.parkingHighEnd.toString()) : 0,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true
    };

    const save$ = this.officeConfiguration 
      ? this.officeConfigurationService.updateOfficeConfiguration(this.selectedOfficeId, officeConfigurationRequest)
      : this.officeConfigurationService.createOfficeConfiguration(this.selectedOfficeId, officeConfigurationRequest);

    save$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: (response: OfficeConfigurationResponse) => {
        this.officeConfiguration = response;
        this.toastr.success('Office configuration saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        if (this.embeddedMode) {
          this.backEvent.emit();
        } else if (this.returnToSettings) {
          this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
        } else {
          // Navigate to list - need to add route
          this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Save office configuration request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Data Loading Methods
  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.removeLoadItem('offices');
      return;
    }

    this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === orgId && o.isActive);
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      maintenanceEmail: new FormControl<string>(''),
      afterHoursPhone: new FormControl<string>(''),
      afterHoursInstructions: new FormControl<string>(''),
      defaultDeposit: new FormControl<string>('0.00'),
      utilityOneBed: new FormControl<string>('0.00'),
      utilityTwoBed: new FormControl<string>('0.00'),
      utilityThreeBed: new FormControl<string>('0.00'),
      utilityFourBed: new FormControl<string>('0.00'),
      utilityHouse: new FormControl<string>('0.00'),
      maidOneBed: new FormControl<string>('0.00'),
      maidTwoBed: new FormControl<string>('0.00'),
      maidThreeBed: new FormControl<string>('0.00'),
      maidFourBed: new FormControl<string>('0.00'),
      parkingLowEnd: new FormControl<string>('0.00'),
      parkingHighEnd: new FormControl<string>('0.00'),
      isActive: new FormControl<boolean>(true)
    });
  }

  populateForm(): void {
    if (!this.officeConfiguration) {
      this.resetForm();
      return;
    }

    this.form.patchValue({
      maintenanceEmail: this.officeConfiguration.maintenanceEmail || '',
      afterHoursPhone: this.formatterService.phoneNumber(this.officeConfiguration.afterHoursPhone) || '',
      afterHoursInstructions: this.officeConfiguration.afterHoursInstructions || '',
      defaultDeposit: this.officeConfiguration.defaultDeposit !== null && this.officeConfiguration.defaultDeposit !== undefined ? this.officeConfiguration.defaultDeposit.toFixed(2) : '0.00',
      utilityOneBed: this.officeConfiguration.utilityOneBed !== null && this.officeConfiguration.utilityOneBed !== undefined ? this.officeConfiguration.utilityOneBed.toFixed(2) : '0.00',
      utilityTwoBed: this.officeConfiguration.utilityTwoBed !== null && this.officeConfiguration.utilityTwoBed !== undefined ? this.officeConfiguration.utilityTwoBed.toFixed(2) : '0.00',
      utilityThreeBed: this.officeConfiguration.utilityThreeBed !== null && this.officeConfiguration.utilityThreeBed !== undefined ? this.officeConfiguration.utilityThreeBed.toFixed(2) : '0.00',
      utilityFourBed: this.officeConfiguration.utilityFourBed !== null && this.officeConfiguration.utilityFourBed !== undefined ? this.officeConfiguration.utilityFourBed.toFixed(2) : '0.00',
      utilityHouse: this.officeConfiguration.utilityHouse !== null && this.officeConfiguration.utilityHouse !== undefined ? this.officeConfiguration.utilityHouse.toFixed(2) : '0.00',
      maidOneBed: this.officeConfiguration.maidOneBed !== null && this.officeConfiguration.maidOneBed !== undefined ? this.officeConfiguration.maidOneBed.toFixed(2) : '0.00',
      maidTwoBed: this.officeConfiguration.maidTwoBed !== null && this.officeConfiguration.maidTwoBed !== undefined ? this.officeConfiguration.maidTwoBed.toFixed(2) : '0.00',
      maidThreeBed: this.officeConfiguration.maidThreeBed !== null && this.officeConfiguration.maidThreeBed !== undefined ? this.officeConfiguration.maidThreeBed.toFixed(2) : '0.00',
      maidFourBed: this.officeConfiguration.maidFourBed !== null && this.officeConfiguration.maidFourBed !== undefined ? this.officeConfiguration.maidFourBed.toFixed(2) : '0.00',
      parkingLowEnd: this.officeConfiguration.parkingLowEnd !== null && this.officeConfiguration.parkingLowEnd !== undefined ? this.officeConfiguration.parkingLowEnd.toFixed(2) : '0.00',
      parkingHighEnd: this.officeConfiguration.parkingHighEnd !== null && this.officeConfiguration.parkingHighEnd !== undefined ? this.officeConfiguration.parkingHighEnd.toFixed(2) : '0.00',
      isActive: this.officeConfiguration.isActive !== undefined ? this.officeConfiguration.isActive : true
    });
  }

  resetForm(): void {
    this.form.patchValue({
      maintenanceEmail: '',
      afterHoursPhone: '',
      afterHoursInstructions: '',
      defaultDeposit: '0.00',
      utilityOneBed: '0.00',
      utilityTwoBed: '0.00',
      utilityThreeBed: '0.00',
      utilityFourBed: '0.00',
      utilityHouse: '0.00',
      maidOneBed: '0.00',
      maidTwoBed: '0.00',
      maidThreeBed: '0.00',
      maidFourBed: '0.00',
      parkingLowEnd: '0.00',
      parkingHighEnd: '0.00',
      isActive: true
    });
  }

  // Decimal input formatting
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  // Phone formatting methods
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('afterHoursPhone'));
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get('afterHoursPhone');
    const phone = this.formatterService.stripPhoneFormatting(input.value);
    
    if (phone.length <= 10) {
      let formatted = phone;
      if (phone.length > 6) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
      } else if (phone.length > 3) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3)}`;
      } else if (phone.length > 0) {
        formatted = `(${phone}`;
      }
      
      // Update both the input element and form control to ensure proper display
      input.value = formatted;
      if (control) {
        control.setValue(formatted, { emitEvent: false });
      }
    } else {
      // If more than 10 digits, keep only the first 10
      const trimmedPhone = phone.substring(0, 10);
      const formatted = `(${trimmedPhone.substring(0, 3)}) ${trimmedPhone.substring(3, 6)}-${trimmedPhone.substring(6)}`;
      input.value = formatted;
      if (control) {
        control.setValue(formatted, { emitEvent: false });
      }
    }
  }

  // Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }

  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      // Navigate to list - need to add route
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    }
  }
}

