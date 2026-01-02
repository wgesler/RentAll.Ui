import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { AreaService } from '../services/area.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { AreaResponse, AreaRequest } from '../models/area.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-area',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './area.component.html',
  styleUrl: './area.component.scss'
})

export class AreaComponent implements OnInit, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  private routeAreaId: string | null = null;
  area: AreaResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];

  constructor(
    public areaService: AreaService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService
  ) {
    this.itemsToLoad.push('area');
  }

  ngOnInit(): void {
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get area ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeAreaId = paramMap.get('id');
          this.isAddMode = this.routeAreaId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('area');
            this.buildForm();
          } else {
            this.getArea(this.routeAreaId);
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
          this.removeLoadItem('area');
          this.buildForm();
        } else {
          this.getArea(this.id.toString());
        }
      }
    }
  }

  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) return;

    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === orgId && o.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Area Component - Error loading offices:', err);
        this.offices = [];
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload area
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getArea(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('area');
        this.buildForm();
      }
    }
  }

  getArea(id?: string | number): void {
    const idToUse = id || this.id || this.routeAreaId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const areaIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(areaIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid area ID', CommonMessage.Error);
      return;
    }
    this.areaService.getAreaById(areaIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('area') })).subscribe({
      next: (response: AreaResponse) => {
        this.area = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load area info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ areaCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
  }

  saveArea(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const areaRequest: AreaRequest = {
      organizationId: user?.organizationId || '',
      areaCode: formValue.areaCode,
      name: formValue.name,
      description: formValue.description || undefined,
      officeId: formValue.officeId ? formValue.officeId.toString() : undefined,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.areaService.createArea(areaRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AreaResponse) => {
          this.toastr.success('Area created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AreaList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create area request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeAreaId;
      const areaIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(areaIdNum)) {
        this.isLoadError = true;
        this.toastr.error('Invalid area ID', CommonMessage.Error);
        return;
      }
      areaRequest.areaId = areaIdNum;
      areaRequest.organizationId = this.area?.organizationId || user?.organizationId || '';
      this.areaService.updateArea(areaIdNum, areaRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AreaResponse) => {
          this.toastr.success('Area updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.AreaList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update area request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  // Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      areaCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      officeId: new FormControl(null),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.area && this.form) {
      this.form.patchValue({
        areaCode: this.area.areaCode?.toUpperCase() || '',
        name: this.area.name,
        description: this.area.description || '',
        officeId: this.area.officeId ? parseInt(this.area.officeId, 10) : null,
        isActive: this.area.isActive
      });
    }
  }

  // Utilty Methods
  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.AreaList);
    }
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
