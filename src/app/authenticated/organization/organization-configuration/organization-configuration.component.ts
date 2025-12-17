import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
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
import { filter } from 'rxjs/operators';
import { NavigationContextService } from '../../../services/navigation-context.service';

@Component({
  selector: 'app-organization-configuration',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
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
    boardSelectionCriteria: true,
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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navigationContext: NavigationContextService
  ) { }

  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
  }

  ngOnDestroy(): void {
    // Clear context when leaving settings page
    this.navigationContext.clearContext();
  }

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
}

