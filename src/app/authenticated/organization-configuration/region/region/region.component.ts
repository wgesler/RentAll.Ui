import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { RegionService } from '../services/region.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { RegionResponse, RegionRequest } from '../models/region.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-region',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './region.component.html',
  styleUrl: './region.component.scss'
})

export class RegionComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeRegionId: string | null = null;
  region: RegionResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];

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
    private officeService: OfficeService
  ) {
  }

  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get region ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeRegionId = paramMap.get('id');
          this.isAddMode = this.routeRegionId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('region');
            this.buildForm();
          } else {
            this.getRegion(this.routeRegionId);
          }
        }
      });
      if (!this.isAddMode) {
        this.buildForm();
      }
    } else {
      // In embedded mode, use the input id
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
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload region
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
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
        if (err.status !== 400) {
          this.toastr.error('Could not load region info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('region');
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
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.RegionList);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Create region request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
      this.regionService.updateRegion(regionIdNum, regionRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: RegionResponse) => {
          this.toastr.success('Region updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.RegionList);
          }
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update region request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
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
        officeId: this.region.officeId ? parseInt(this.region.officeId, 10) : null,
        isActive: this.region.isActive
      });
    }
  }

  // Utility Methods
  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ regionCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
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
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.RegionList);
    }
  }
}

