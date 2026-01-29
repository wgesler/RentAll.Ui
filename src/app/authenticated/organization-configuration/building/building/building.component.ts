import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { BuildingService } from '../services/building.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { BuildingResponse, BuildingRequest } from '../models/building.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';

@Component({
  selector: 'app-building',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './building.component.html',
  styleUrl: './building.component.scss'
})

export class BuildingComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeBuildingId: string | null = null;
  building: BuildingResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['building', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public buildingService: BuildingService,
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

  //#region Buildings
  ngOnInit(): void {
    this.loadOffices();
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
    this.buildingService.getBuildingById(buildingIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('building'); })).subscribe({
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
        this.removeLoadItem('building');
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
      name: formValue.name,
      description: formValue.description || undefined,
      officeId: formValue.officeId ? formValue.officeId.toString() : undefined,
      hoaName: formValue.hoaName || undefined,
      hoaPhone: formValue.hoaPhone ? this.formatterService.stripPhoneFormatting(formValue.hoaPhone) : undefined,
      hoaEmail: formValue.hoaEmail || undefined,
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
          if (err.status !== 400) {
            this.toastr.error('Create building request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeBuildingId;
      const buildingIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(buildingIdNum)) {
        this.toastr.error('Invalid building ID', CommonMessage.Error);
        return;
      }
      buildingRequest.buildingId = buildingIdNum;
      buildingRequest.organizationId = this.building?.organizationId || user?.organizationId || '';
      this.buildingService.updateBuilding(buildingRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
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
          if (err.status !== 400) {
            this.toastr.error('Update building request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
      buildingCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      officeId: new FormControl(null),
      hoaName: new FormControl(''),
      hoaPhone: new FormControl('', [
        Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4})?$/)
      ]),
      hoaEmail: new FormControl('', [Validators.email]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.building && this.form) {
      this.form.patchValue({
        buildingCode: this.building.buildingCode?.toUpperCase() || '',
        name: this.building.name,
        description: this.building.description || '',
        officeId: this.building.officeId ? parseInt(this.building.officeId, 10) : null,
        hoaName: this.building.hoaName || '',
        hoaPhone: this.formatterService.phoneNumber(this.building.hoaPhone) || '',
        hoaEmail: this.building.hoaEmail || '',
        isActive: this.building.isActive
      });
    }
  }
  //#endregion

  //#region Phone formatting methods
  formatHoaPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('hoaPhone'));
  }

  onHoaPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('hoaPhone'));
  }
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('buildingCode'));
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
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.BuildingList);
    }
  }
  //#endregion
}

