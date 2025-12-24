import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { RouterUrl, RouterToken } from '../../../app.routes';
import { AgentListComponent } from '../../agent/agent-list/agent-list.component';
import { AgentComponent } from '../../agent/agent/agent.component';
import { FranchiseListComponent } from '../../franchise/franchise-list/franchise-list.component';
import { FranchiseComponent } from '../../franchise/franchise/franchise.component';
import { RegionListComponent } from '../../region/region-list/region-list.component';
import { RegionComponent } from '../../region/region/region.component';
import { AreaListComponent } from '../../area/area-list/area-list.component';
import { AreaComponent } from '../../area/area/area.component';
import { BuildingListComponent } from '../../building/building-list/building-list.component';
import { BuildingComponent } from '../../building/building/building.component';
import { ColorListComponent } from '../../color/color-list/color-list.component';
import { ColorComponent } from '../../color/color/color.component';
import { OrganizationService } from '../services/organization.service';
import { OrganizationResponse, OrganizationRequest } from '../models/organization.model';
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
    const afterHoursPhoneDigits = this.stripPhoneFormatting(formValue.afterHoursPhone);

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
      afterHoursPhone: new FormControl('')
    });
  }

  populateForm(): void {
    if (!this.organization) return;

    this.organizationForm.patchValue({
      maintenanceEmail: this.organization.maintenanceEmail || '',
      afterHoursPhone: this.formatterService.phoneNumber(this.organization.afterHoursPhone) || ''
    });
  }

  // Phone input formatting (matches Contact page behavior)
  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let digits = input.value.replace(/\D/g, '');
    if (digits.length > 10) {
      digits = digits.substring(0, 10);
    }

    let formatted = digits;
    if (digits.length > 6) {
      formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length > 3) {
      formatted = `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    } else if (digits.length > 0) {
      formatted = `(${digits}`;
    } else {
      formatted = '';
    }

    this.organizationForm.get('afterHoursPhone')?.setValue(formatted, { emitEvent: false });
  }

  stripPhoneFormatting(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  formatPhone(): void {
    const phoneControl = this.organizationForm.get('afterHoursPhone');
    if (phoneControl && phoneControl.value) {
      const phone = phoneControl.value.replace(/\D/g, '');
      if (phone.length === 10) {
        const formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
        phoneControl.setValue(formatted, { emitEvent: false });
      }
    }
  }

  // Event handlers for child components
  onAgentSelected(agentId: string | null): void {
    this.agentId = agentId;
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

