import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { AreaService } from '../services/area.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { AreaResponse, AreaRequest } from '../models/area.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { OfficeService } from '../services/office.service';
import { OfficeResponse } from '../models/office.model';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-area',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './area.component.html',
  styleUrl: './area.component.scss'
})

export class AreaComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  
  isServiceError: boolean = false;
  routeAreaId: string | null = null;
  area: AreaResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['area', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public areaService: AreaService,
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

  //#region Area
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
        this.removeLoadItem('area');
        this.buildForm();
      } else {
        this.getArea(this.id.toString());
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If id changes, reload area
    if (changes['id'] && !changes['id'].firstChange) {
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
    this.areaService.getAreaById(areaIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('area'); })).subscribe({
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
        this.removeLoadItem('area');
      }
    });
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
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Create area request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeAreaId;
      const areaIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(areaIdNum)) {
        this.toastr.error('Invalid area ID', CommonMessage.Error);
        return;
      }
      areaRequest.areaId = areaIdNum;
      areaRequest.organizationId = this.area?.organizationId || user?.organizationId || '';
      this.areaService.updateArea(areaRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: AreaResponse) => {
          this.toastr.success('Area updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update area request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
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
      areaCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      officeId: new FormControl(null, [Validators.required]),
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
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('areaCode'));
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
    this.backEvent.emit();
  }
  //#endregion
}
