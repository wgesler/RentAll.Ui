import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { RouterUrl, RouterToken } from '../../../app.routes';
import { AgentListComponent } from '../agent/agent-list/agent-list.component';
import { AgentComponent } from '../agent/agent/agent.component';
import { OfficeListComponent } from '../office/office-list/office-list.component';
import { OfficeComponent } from '../office/office/office.component';
import { RegionListComponent } from '../region/region-list/region-list.component';
import { RegionComponent } from '../region/region/region.component';
import { AreaListComponent } from '../area/area-list/area-list.component';
import { AreaComponent } from '../area/area/area.component';
import { BuildingListComponent } from '../building/building-list/building-list.component';
import { BuildingComponent } from '../building/building/building.component';
import { ColorListComponent } from '../color/color-list/color-list.component';
import { ColorComponent } from '../color/color/color.component';
import { OfficeConfigurationService } from '../office/services/office-configuration.service';
import { OfficeConfigurationRequest, OfficeConfigurationResponse } from '../office/models/office-configuration.model';
import { OfficeService } from '../office/services/office.service';
import { OfficeResponse } from '../office/models/office.model';
import { AuthService } from '../../../services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { filter, take, finalize } from 'rxjs/operators';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    AgentListComponent, 
    AgentComponent,
    OfficeListComponent,
    OfficeComponent,
    RegionListComponent,
    RegionComponent,
    AreaListComponent,
    AreaComponent,
    BuildingListComponent,
    BuildingComponent,
    ColorListComponent,
    ColorComponent
  ],
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit, OnDestroy {
  expandedSections = {
    offices: false,
    agents: false,
    regions: false,
    area: false,
    building: false,
    color: false,
    organizationInformation: false
  };
  isEditingAgent: boolean = false;
  agentId: string | null = null;
  isEditingOffice: boolean = false;
  officeId: string | number | null = null;
  isEditingRegion: boolean = false;
  regionId: string | number | null = null;
  isEditingArea: boolean = false;
  areaId: string | number | null = null;
  isEditingBuilding: boolean = false;
  buildingId: string | number | null = null;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;
  
  officeConfigurationForm: FormGroup;
  officeConfiguration: OfficeConfigurationResponse | null = null;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  isLoading: boolean = false;
  isSubmitting: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService,
    private officeConfigurationService: OfficeConfigurationService,
    private officeService: OfficeService,
    private authService: AuthService,
    private toastr: ToastrService,
    private formatterService: FormatterService,
    private fb: FormBuilder
  ) {
    this.officeConfigurationForm = this.buildForm();
  }

  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
    this.loadOffices();
  }

  loadOffices(): void {
    const user = this.authService.getUser();
    if (!user?.organizationId) {
      return;
    }

    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === user.organizationId && o.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading offices:', err);
        this.toastr.error('Could not load offices.', CommonMessage.ServiceError);
        this.offices = [];
      }
    });
  }

  onOfficeDropdownSelected(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    if (officeId) {
      this.loadOfficeConfiguration(officeId);
    } else {
      this.officeConfiguration = null;
      this.resetForm();
    }
  }

  loadOfficeConfiguration(officeId: number): void {
    this.isLoading = true;
    this.officeConfigurationService.getOfficeConfigurationByOfficeId(officeId).pipe(
      take(1),
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (config: OfficeConfigurationResponse) => {
        this.officeConfiguration = config;
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading office configuration:', err);
        if (err.status === 404) {
          // Office configuration doesn't exist yet, initialize with defaults
          this.officeConfiguration = null;
          this.resetForm();
        } else {
          this.toastr.error('Could not load office configuration.', CommonMessage.ServiceError);
        }
      }
    });
  }

  saveOfficeConfiguration(): void {
    if (!this.officeConfigurationForm.valid) {
      this.officeConfigurationForm.markAllAsTouched();
      return;
    }

    if (!this.selectedOfficeId) {
      this.toastr.error('Please select an office.', CommonMessage.ServiceError);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.officeConfigurationForm.getRawValue();

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
        this.toastr.success('Office configuration updated successfully.', CommonMessage.Success);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Update office configuration request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
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

    this.officeConfigurationForm.patchValue({
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
    this.officeConfigurationForm.patchValue({
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
    this.formatterService.formatDecimalControl(this.officeConfigurationForm.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.officeConfigurationForm.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  // Phone formatting methods
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.officeConfigurationForm.get('afterHoursPhone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.officeConfigurationForm.get('afterHoursPhone'));
  }

  // Event handlers for child components
  onAgentSelected(agentId: string | number | null): void {
    this.agentId = agentId !== null ? agentId.toString() : null;
    this.isEditingAgent = agentId !== null;
    if (this.isEditingAgent) {
      this.expandedSections.agents = true;
    }
  }

  onAgentBack(): void {
    this.agentId = null;
    this.isEditingAgent = false;
  }

  onOfficeSelected(officeId: string | number | null): void {
    this.officeId = officeId;
    this.isEditingOffice = officeId !== null;
    if (this.isEditingOffice) {
      this.expandedSections.offices = true;
    }
  }

  onOfficeBack(): void {
    this.officeId = null;
    this.isEditingOffice = false;
  }

  onRegionSelected(regionId: string | number | null): void {
    this.regionId = regionId;
    this.isEditingRegion = regionId !== null;
    if (this.isEditingRegion) {
      this.expandedSections.regions = true;
    }
  }

  onRegionBack(): void {
    this.regionId = null;
    this.isEditingRegion = false;
  }

  onAreaSelected(areaId: string | number | null): void {
    this.areaId = areaId;
    this.isEditingArea = areaId !== null;
    if (this.isEditingArea) {
      this.expandedSections.area = true;
    }
  }

  onAreaBack(): void {
    this.areaId = null;
    this.isEditingArea = false;
  }

  onBuildingSelected(buildingId: string | number | null): void {
    this.buildingId = buildingId;
    this.isEditingBuilding = buildingId !== null;
    if (this.isEditingBuilding) {
      this.expandedSections.building = true;
    }
  }

  onBuildingBack(): void {
    this.buildingId = null;
    this.isEditingBuilding = false;
  }

  onColorSelected(colorId: string | number | null): void {
    this.colorId = colorId;
    this.isEditingColor = colorId !== null;
    if (this.isEditingColor) {
      this.expandedSections.color = true;
    }
  }

  onColorBack(): void {
    this.colorId = null;
    this.isEditingColor = false;
  }

  onPanelOpened(section: string): void {
    this.expandedSections[section] = true;
  }

  onPanelClosed(section: string): void {
    this.expandedSections[section] = false;
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }

  ngOnDestroy(): void {
    // Clear context when leaving settings page
    this.navigationContext.clearContext();
  }

}

