import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
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
import { ChartOfAccountsListComponent } from '../../accounting/chart-of-accounts-list/chart-of-accounts-list.component';
import { ChartOfAccountsComponent } from '../../accounting/chart-of-accounts/chart-of-accounts.component';
import { ColorListComponent } from '../color/color-list/color-list.component';
import { ColorComponent } from '../color/color/color.component';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { OfficeService } from '../office/services/office.service';
import { OfficeResponse } from '../office/models/office.model';
import { take, finalize } from 'rxjs';

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
    ChartOfAccountsListComponent,
    ChartOfAccountsComponent,
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
    chartOfAccounts: false,
    color: false
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
  isEditingChartOfAccounts: boolean = false;
  chartOfAccountsId: string | number | null = null;
  chartOfAccountsOfficeId: number | null = null;
  chartOfAccountsOffices: OfficeResponse[] = [];
  selectedChartOfAccountsOfficeId: number | null = null;
  showInactiveChartOfAccounts: boolean = false;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService
  ) {
  }

  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
    // Load offices for Chart of Accounts dropdown
    this.loadChartOfAccountsOffices();
  }

  loadChartOfAccountsOffices(): void {
    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices) => {
        this.chartOfAccountsOffices = offices || [];
      },
      error: (err) => {
        console.error('Error loading offices for Chart of Accounts:', err);
      }
    });
  }

  onChartOfAccountsOfficeChange(): void {
    // When office changes, update the officeId for chart of accounts
    // The chart-of-accounts-list component will detect the change via ngOnChanges and make the API call
    this.chartOfAccountsOfficeId = this.selectedChartOfAccountsOfficeId;
  }

  toggleInactiveChartOfAccounts(): void {
    this.showInactiveChartOfAccounts = !this.showInactiveChartOfAccounts;
  }

  // Event handlers for child components
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

  onChartOfAccountsAdd(): void {
    this.chartOfAccountsId = 'new';
    this.chartOfAccountsOfficeId = this.selectedChartOfAccountsOfficeId;
    this.isEditingChartOfAccounts = true;
    if (this.isEditingChartOfAccounts) {
      this.expandedSections.chartOfAccounts = true;
    }
  }

  onChartOfAccountsEdit(chartOfAccountId: number): void {
    this.chartOfAccountsId = chartOfAccountId;
    // Use the selected officeId, or it will be determined from the chart of account data when loading
    this.chartOfAccountsOfficeId = this.selectedChartOfAccountsOfficeId;
    this.isEditingChartOfAccounts = true;
    if (this.isEditingChartOfAccounts) {
      this.expandedSections.chartOfAccounts = true;
    }
  }

  onChartOfAccountsBack(): void {
    this.chartOfAccountsId = null;
    this.chartOfAccountsOfficeId = null;
    this.isEditingChartOfAccounts = false;
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

  ngOnDestroy(): void {
    this.navigationContext.clearContext();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
}

