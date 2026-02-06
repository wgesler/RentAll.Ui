import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { RegionService } from '../services/region.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { RegionResponse, RegionRequest } from '../models/region.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { OfficeService } from '../services/office.service';
import { OfficeResponse } from '../models/office.model';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-region',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './region.component.html',
  styleUrl: './region.component.scss'
})

export class RegionComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  
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
    private mappingService: MappingService
  ) {
  }

  //#region Region
  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new' || this.id === 'new';
      if (this.isAddMode) {
        this.removeLoadItem('region');
        this.buildForm();
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
        this.removeLoadItem('region');
        this.buildForm();
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
    this.regionService.getRegionById(regionIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('region'); })).subscribe({
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
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.removeLoadItem('offices');
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      regionCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      officeId: new FormControl(null),
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

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('regionCode'));
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
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }
  //#endregion
}

