
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { GlobalOfficeSelectionService } from '../services/global-office-selection.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { CostCodesListComponent } from '../../accounting/cost-codes-list/cost-codes-list.component';
import { UserGroups } from '../../users/models/user-enums';
import { AccountingOfficeListComponent } from '../accounting-office-list/accounting-office-list.component';
import { AccountingOfficeComponent } from '../accounting-office/accounting-office.component';
import { AgentListComponent } from '../agent-list/agent-list.component';
import { AgentComponent } from '../agent/agent.component';
import { AreaListComponent } from '../area-list/area-list.component';
import { AreaComponent } from '../area/area.component';
import { BuildingListComponent } from '../building-list/building-list.component';
import { BuildingComponent } from '../building/building.component';
import { ColorListComponent } from '../color-list/color-list.component';
import { ColorComponent } from '../color/color.component';
import { AccountingOfficeResponse } from '../models/accounting-office.model';
import { OrganizationResponse } from '../models/organization.model';
import { OfficeResponse } from '../models/office.model';
import { OfficeListComponent, OfficeCopyPayload } from '../office-list/office-list.component';
import { OfficeComponent } from '../office/office.component';
import { RegionListComponent } from '../region-list/region-list.component';
import { RegionComponent } from '../region/region.component';
import { OrganizationService } from '../services/organization.service';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
    standalone: true,
    selector: 'app-configuration',
    imports: [
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    AgentListComponent,
    AgentComponent,
    OfficeListComponent,
    OfficeComponent,
    AccountingOfficeListComponent,
    AccountingOfficeComponent,
    RegionListComponent,
    RegionComponent,
    AreaListComponent,
    AreaComponent,
    BuildingListComponent,
    BuildingComponent,
    CostCodesListComponent,
    ColorListComponent,
    ColorComponent,
    TitlebarSelectComponent
],
    templateUrl: './configuration.component.html',
    styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit, OnDestroy {
  expandedSections = {
    offices: false,
    accountingOffices: false,
    agents: false,
    regions: false,
    area: false,
    building: false,
    costCodes: false,
    color: false
  };
  isEditingAgent: boolean = false;
  agentId: string | null = null;
  isEditingOffice: boolean = false;
  officeId: string | number | null = null;
  copyOfficeData: OfficeResponse | null = null;
  isEditingAccountingOffice: boolean = false;
  accountingOfficeId: string | number | null = null;
  copyAccountingOfficeData: AccountingOfficeResponse | null = null;
  isEditingRegion: boolean = false;
  regionId: string | number | null = null;
  isEditingArea: boolean = false;
  areaId: string | number | null = null;
  isEditingBuilding: boolean = false;
  buildingId: string | number | null = null;
  selectedCostCodesOfficeId: number | null = null;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;

  // Organization dropdown (SuperAdmin only)
  isSuperAdmin: boolean = false;
  organizations: OrganizationResponse[] = [];
  selectedOrganizationId: string | null = null;

  currentUserOrganizationId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService,
    private organizationService: OrganizationService,
    private authService: AuthService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService
  ) {
  }

  //#region Configuration
  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
    // Cost Codes in Settings: default to working office so list is filtered by office
    this.selectedCostCodesOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
    // Check if user is SuperAdmin
    const user = this.authService.getUser();
    this.currentUserOrganizationId = user?.organizationId || null;
    if (user && user.userGroups) {
      const userGroupNumbers = user.userGroups.map(group => {
        if (typeof group === 'string') {
          const enumKey = Object.keys(UserGroups).find(key => key === group);
          if (enumKey) {
            return UserGroups[enumKey as keyof typeof UserGroups];
          }
          const num = parseInt(group, 10);
          if (!isNaN(num)) {
            return num;
          }
        }
        return typeof group === 'number' ? group : null;
      }).filter(num => num !== null) as number[];
      
      this.isSuperAdmin = userGroupNumbers.includes(UserGroups.SuperAdmin);
      
      if (this.isSuperAdmin) {
        this.loadOrganizations();
      }
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1)).subscribe({
      next: (organizations) => {
        this.organizations = organizations || [];
        if (this.organizations.length > 0 && !this.selectedOrganizationId) {
          const matchingOrganization = this.organizations.find(
            org => org.organizationId === this.currentUserOrganizationId
          );
          this.selectedOrganizationId = matchingOrganization?.organizationId || this.organizations[0].organizationId;
        }
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading organizations:', err);
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  get organizationTitlebarOptions(): { value: string, label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
    }));
  }

  onSettingsOrganizationDropdownChange(value: string | number | null): void {
    this.selectedOrganizationId = value == null || value === '' ? null : String(value);
    this.onOrganizationChange();
  }

  onOrganizationChange(): void {
  }

  get effectiveOrganizationId(): string | null {
    return this.selectedOrganizationId || this.currentUserOrganizationId;
  }

  onCostCodesOfficeChangeFromList(officeId: number | null): void {
    // Handle office change from cost-codes-list component
    this.selectedCostCodesOfficeId = officeId;
  }

  onOfficeSelected(officeId: string | number | null): void {
    this.officeId = officeId;
    this.copyOfficeData = null;
    this.isEditingOffice = officeId !== null;
    if (this.isEditingOffice) {
      this.expandedSections.offices = true;
    }
  }

  onCopyOffice(payload: OfficeCopyPayload): void {
    this.copyOfficeData = payload.office;
    this.officeId = 'new';
    this.isEditingOffice = true;
    this.expandedSections.offices = true;
  }

  onOfficeBack(): void {
    this.officeId = null;
    this.copyOfficeData = null;
    this.isEditingOffice = false;
  }

  onAccountingOfficeSelected(accountingOfficeId: string | number | null): void {
    this.accountingOfficeId = accountingOfficeId;
    this.copyAccountingOfficeData = null;
    this.isEditingAccountingOffice = accountingOfficeId !== null;
    if (this.isEditingAccountingOffice) {
      this.expandedSections.accountingOffices = true;
    }
  }

  onCopyAccountingOffice(accountingOffice: AccountingOfficeResponse): void {
    this.copyAccountingOfficeData = accountingOffice;
    this.accountingOfficeId = 'new';
    this.isEditingAccountingOffice = true;
    this.expandedSections.accountingOffices = true;
  }

  onAccountingOfficeBack(): void {
    this.accountingOfficeId = null;
    this.copyAccountingOfficeData = null;
    this.isEditingAccountingOffice = false;
  }

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
  //#endregion

  //#region Utility Methods
  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
  
  ngOnDestroy(): void {
    this.navigationContext.clearContext();
  }
  //#endregion
}

