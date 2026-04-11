import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../models/office.model';
import { RegionRequest, RegionResponse } from '../models/region.model';
import { OfficeService } from '../services/office.service';
import { RegionService } from '../services/region.service';

@Component({
    standalone: true,
    selector: 'app-region',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './region.component.html',
    styleUrl: './region.component.scss'
})

export class RegionComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;
  
  isServiceError: boolean = false;
  routeRegionId: string | null = null;
  region: RegionResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['region', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public regionService: RegionService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region Region
  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new' || this.id === 'new';
      if (this.isAddMode) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'region');
        this.buildForm();
        this.scheduleFocusFirstField();
      } else {
        this.getRegion(this.id.toString());
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If id changes, reload region
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getRegion(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'region');
        this.buildForm();
        this.scheduleFocusFirstField();
      }
    }
  }

  getRegion(id?: string | number): void {
    const idToUse = id || this.id || this.routeRegionId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const regionIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(regionIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid region ID', CommonMessage.Error);
      return;
    }
    this.regionService.getRegionById(regionIdNum).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'region'); })).subscribe({
      next: (response: RegionResponse) => {
        this.region = response;
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

  saveRegion(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const regionRequest: RegionRequest = {
      organizationId: user?.organizationId || '',
      regionCode: formValue.regionCode,
      name: formValue.name,
      description: formValue.description || undefined,
      officeId: formValue.officeId ? formValue.officeId.toString() : undefined,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.regionService.createRegion(regionRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: RegionResponse) => {
          this.toastr.success('Region created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeRegionId;
      const regionIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(regionIdNum)) {
        this.toastr.error('Invalid region ID', CommonMessage.Error);
        return;
      }
      regionRequest.regionId = regionIdNum;
      regionRequest.organizationId = this.region?.organizationId || user?.organizationId || '';
      this.regionService.updateRegion(regionRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: RegionResponse) => {
          this.toastr.success('Region updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      regionCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      officeId: new FormControl(null, [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.region && this.form) {
      this.form.patchValue({
        regionCode: this.region.regionCode?.toUpperCase() || '',
        name: this.region.name,
        description: this.region.description || '',
        officeId: this.region.officeId,
        isActive: this.region.isActive
      });
    }
  }
  //#endregion

  //#region Form Response Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('regionCode'));
  }

  focusFirstField(): void {
    const el = this.firstInputRef?.nativeElement;
    if (el?.focus) {
      el.focus();
    }
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }
  
  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (this.form?.valid && !this.isSubmitting) {
      this.saveRegion();
    }
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
  //#endregion
}

