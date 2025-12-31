import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { RouterUrl, RouterToken } from '../../../app.routes';
import { AgentListComponent } from '../agent/agent-list/agent-list.component';
import { AgentComponent } from '../agent/agent/agent.component';
import { FranchiseListComponent } from '../franchise/franchise-list/franchise-list.component';
import { FranchiseComponent } from '../franchise/franchise/franchise.component';
import { RegionListComponent } from '../region/region-list/region-list.component';
import { RegionComponent } from '../region/region/region.component';
import { AreaListComponent } from '../area/area-list/area-list.component';
import { AreaComponent } from '../area/area/area.component';
import { BuildingListComponent } from '../building/building-list/building-list.component';
import { BuildingComponent } from '../building/building/building.component';
import { ColorListComponent } from '../color/color-list/color-list.component';
import { ColorComponent } from '../color/color/color.component';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse, OrganizationRequest } from '../../organization/models/organization.model';
import { AuthService } from '../../../services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { filter, take, finalize } from 'rxjs/operators';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-organization-configuration',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    AgentListComponent, 
    AgentComponent,
    FranchiseListComponent,
    FranchiseComponent,
    RegionListComponent,
    RegionComponent,
    AreaListComponent,
    AreaComponent,
    BuildingListComponent,
    BuildingComponent,
    ColorListComponent,
    ColorComponent
  ],
  templateUrl: './organization-configuration.component.html',
  styleUrls: ['./organization-configuration.component.scss']
})
export class OrganizationConfigurationComponent implements OnInit, OnDestroy {
  expandedSections = {
    organizationInformation: true,
    color: false,
    agents: false,
    franchises: false,
    regions: false,
    area: false,
    building: false
  };
  isEditingAgent: boolean = false;
  agentId: string | null = null;
  isEditingFranchise: boolean = false;
  franchiseId: string | number | null = null;
  isEditingRegion: boolean = false;
  regionId: string | number | null = null;
  isEditingArea: boolean = false;
  areaId: string | number | null = null;
  isEditingBuilding: boolean = false;
  buildingId: string | number | null = null;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;
  
  organizationForm: FormGroup;
  organization: OrganizationResponse | null = null;
  isLoading: boolean = false;
  isSubmitting: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService,
    private organizationService: OrganizationService,
    private authService: AuthService,
    private toastr: ToastrService,
    private formatterService: FormatterService,
    private fb: FormBuilder
  ) {
    this.organizationForm = this.buildForm();
  }

  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
    this.loadOrganization();
  }


  loadOrganization(): void {
    const user = this.authService.getUser();
    if (!user?.organizationId) {
      return;
    }

    this.isLoading = true;
    this.organizationService.getOrganizationByGuid(user.organizationId).pipe(
      take(1),
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (organization: OrganizationResponse) => {
        this.organization = organization;
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading organization:', err);
        this.toastr.error('Could not load organization information.', CommonMessage.ServiceError);
      }
    });
  }

    saveOrganizationInformation(): void {
    if (!this.organizationForm.valid) {
      this.organizationForm.markAllAsTouched();
      return;
    }

    if (!this.organization) {
      this.toastr.error('Organization data not loaded.', CommonMessage.ServiceError);
      return;
    }

    const user = this.authService.getUser();
    if (!user?.organizationId) {
      this.toastr.error('No organization ID found.', CommonMessage.Unauthorized);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.organizationForm.getRawValue();
    const afterHoursPhoneDigits = this.formatterService.stripPhoneFormatting(formValue.afterHoursPhone);

    // Build full OrganizationRequest with all existing organization data plus the new fields
    const organizationRequest: OrganizationRequest = {
      organizationId: this.organization.organizationId,
      organizationCode: this.organization.organizationCode,
      name: this.organization.name,
      address1: this.organization.address1,
      address2: this.organization.address2 || '',
      suite: this.organization.suite || '',
      city: this.organization.city,
      state: this.organization.state,
      zip: this.organization.zip,
      phone: this.organization.phone,
      website: this.organization.website || '',
      logoPath: this.organization.logoPath || undefined,
      maintenanceEmail: formValue.maintenanceEmail || undefined,
      afterHoursPhone: afterHoursPhoneDigits || undefined,
      defaultDeposit: formValue.defaultDeposit ? parseFloat(formValue.defaultDeposit.toString()) : undefined,
      utilityOneBed: formValue.utilityOneBed ? parseFloat(formValue.utilityOneBed.toString()) : undefined,
      utilityTwoBed: formValue.utilityTwoBed ? parseFloat(formValue.utilityTwoBed.toString()) : undefined,
      utilityThreeBed: formValue.utilityThreeBed ? parseFloat(formValue.utilityThreeBed.toString()) : undefined,
      utilityFourBed: formValue.utilityFourBed ? parseFloat(formValue.utilityFourBed.toString()) : undefined,
      utilityHouse: formValue.utilityHouse ? parseFloat(formValue.utilityHouse.toString()) : undefined,
      maidOneBed: formValue.maidOneBed ? parseFloat(formValue.maidOneBed.toString()) : undefined,
      maidTwoBed: formValue.maidTwoBed ? parseFloat(formValue.maidTwoBed.toString()) : undefined,
      maidThreeBed: formValue.maidThreeBed ? parseFloat(formValue.maidThreeBed.toString()) : undefined,
      maidFourBed: formValue.maidFourBed ? parseFloat(formValue.maidFourBed.toString()) : undefined,
      isActive: this.organization.isActive
    };

    this.organizationService.updateOrganization(user.organizationId, organizationRequest).pipe(
      take(1),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: (response: OrganizationResponse) => {
        this.organization = response;
        this.toastr.success('Organization information updated successfully.', CommonMessage.Success);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error updating organization:', err);
        if (err.status !== 400) {
          this.toastr.error('Update organization request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      maintenanceEmail: new FormControl(''),
      afterHoursPhone: new FormControl(''),
      defaultDeposit: new FormControl<string>('0.00'),
      utilityOneBed: new FormControl<string>('0.00'),
      utilityTwoBed: new FormControl<string>('0.00'),
      utilityThreeBed: new FormControl<string>('0.00'),
      utilityFourBed: new FormControl<string>('0.00'),
      utilityHouse: new FormControl<string>('0.00'),
      maidOneBed: new FormControl<string>('0.00'),
      maidTwoBed: new FormControl<string>('0.00'),
      maidThreeBed: new FormControl<string>('0.00'),
      maidFourBed: new FormControl<string>('0.00')
    });
  }

  populateForm(): void {
    if (!this.organization) return;

    this.organizationForm.patchValue({
      maintenanceEmail: this.organization.maintenanceEmail || '',
      afterHoursPhone: this.formatterService.phoneNumber(this.organization.afterHoursPhone) || '',
      defaultDeposit: this.organization.defaultDeposit !== null && this.organization.defaultDeposit !== undefined ? this.organization.defaultDeposit.toFixed(2) : '0.00',
      utilityOneBed: this.organization.utilityOneBed !== null && this.organization.utilityOneBed !== undefined ? this.organization.utilityOneBed.toFixed(2) : '0.00',
      utilityTwoBed: this.organization.utilityTwoBed !== null && this.organization.utilityTwoBed !== undefined ? this.organization.utilityTwoBed.toFixed(2) : '0.00',
      utilityThreeBed: this.organization.utilityThreeBed !== null && this.organization.utilityThreeBed !== undefined ? this.organization.utilityThreeBed.toFixed(2) : '0.00',
      utilityFourBed: this.organization.utilityFourBed !== null && this.organization.utilityFourBed !== undefined ? this.organization.utilityFourBed.toFixed(2) : '0.00',
      utilityHouse: this.organization.utilityHouse !== null && this.organization.utilityHouse !== undefined ? this.organization.utilityHouse.toFixed(2) : '0.00',
      maidOneBed: this.organization.maidOneBed !== null && this.organization.maidOneBed !== undefined ? this.organization.maidOneBed.toFixed(2) : '0.00',
      maidTwoBed: this.organization.maidTwoBed !== null && this.organization.maidTwoBed !== undefined ? this.organization.maidTwoBed.toFixed(2) : '0.00',
      maidThreeBed: this.organization.maidThreeBed !== null && this.organization.maidThreeBed !== undefined ? this.organization.maidThreeBed.toFixed(2) : '0.00',
      maidFourBed: this.organization.maidFourBed !== null && this.organization.maidFourBed !== undefined ? this.organization.maidFourBed.toFixed(2) : '0.00'
    });
  }

  // Phone input formatting
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.organizationForm.get('afterHoursPhone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.organizationForm.get('afterHoursPhone'));
  }

  // Decimal input formatting
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.organizationForm.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.organizationForm.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
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

  onFranchiseSelected(franchiseId: string | number | null): void {
    this.franchiseId = franchiseId;
    this.isEditingFranchise = franchiseId !== null;
    if (this.isEditingFranchise) {
      this.expandedSections.franchises = true;
    }
  }

  onFranchiseBack(): void {
    this.franchiseId = null;
    this.isEditingFranchise = false;
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

