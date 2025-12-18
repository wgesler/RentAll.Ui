import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { BuildingService } from '../services/building.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { BuildingResponse, BuildingRequest } from '../models/building.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NavigationContextService } from '../../../services/navigation-context.service';

@Component({
  selector: 'app-building',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './building.component.html',
  styleUrl: './building.component.scss'
})

export class BuildingComponent implements OnInit, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  private routeBuildingId: string | null = null;
  building: BuildingResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;

  constructor(
    public buildingService: BuildingService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService
  ) {
    this.itemsToLoad.push('building');
  }

  ngOnInit(): void {
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get building ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeBuildingId = paramMap.get('id');
          this.isAddMode = this.routeBuildingId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('building');
            this.buildForm();
          } else {
            this.getBuilding(this.routeBuildingId);
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
          this.removeLoadItem('building');
          this.buildForm();
        } else {
          this.getBuilding(this.id.toString());
        }
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload building
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getBuilding(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('building');
        this.buildForm();
      }
    }
  }

  getBuilding(id?: string | number): void {
    const idToUse = id || this.id || this.routeBuildingId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const buildingIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(buildingIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid building ID', CommonMessage.Error);
      return;
    }
    this.buildingService.getBuildingById(buildingIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('building') })).subscribe({
      next: (response: BuildingResponse) => {
        this.building = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load building info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveBuilding(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const buildingRequest: BuildingRequest = {
      organizationId: user?.organizationId || '',
      buildingCode: formValue.buildingCode,
      description: formValue.description,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.buildingService.createBuilding(buildingRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: BuildingResponse) => {
          this.toastr.success('Building created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.BuildingList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create building request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeBuildingId;
      const buildingIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(buildingIdNum)) {
        this.isLoadError = true;
        this.toastr.error('Invalid building ID', CommonMessage.Error);
        return;
      }
      buildingRequest.buildingId = buildingIdNum;
      buildingRequest.organizationId = this.building?.organizationId || user?.organizationId || '';
      this.buildingService.updateBuilding(buildingIdNum, buildingRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: BuildingResponse) => {
          this.toastr.success('Building updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.BuildingList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update building request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  // Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      buildingCode: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.building && this.form) {
      this.form.patchValue({
        buildingCode: this.building.buildingCode,
        description: this.building.description,
        isActive: this.building.isActive
      });
    }
  }

  // Utility Methods
  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.BuildingList);
    }
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

