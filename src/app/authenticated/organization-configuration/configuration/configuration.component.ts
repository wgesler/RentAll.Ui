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
import { ColorListComponent } from '../color/color-list/color-list.component';
import { ColorComponent } from '../color/color/color.component';
import { OfficeConfigurationListComponent } from '../office-configuration/office-configuration-list/office-configuration-list.component';
import { OfficeConfigurationComponent } from '../office-configuration/office-configuration/office-configuration.component';
import { NavigationContextService } from '../../../services/navigation-context.service';

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
    ColorComponent,
    OfficeConfigurationListComponent,
    OfficeConfigurationComponent
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
    officeConfiguration: false
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
  isEditingOfficeConfiguration: boolean = false;
  officeConfigurationId: string | number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService
  ) {
  }

  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
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
  
  onOfficeConfigurationSelected(officeConfigurationId: string | number | null): void {
    this.officeConfigurationId = officeConfigurationId;
    this.isEditingOfficeConfiguration = officeConfigurationId !== null;
    if (this.isEditingOfficeConfiguration) {
      this.expandedSections.officeConfiguration = true;
    }
  }

  onOfficeConfigurationBack(): void {
    this.officeConfigurationId = null;
    this.isEditingOfficeConfiguration = false;
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

  ngOnDestroy(): void {
    this.navigationContext.clearContext();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OrganizationList);
  }
}

