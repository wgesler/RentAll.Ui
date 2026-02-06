import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { AgentListComponent } from '../agent-list/agent-list.component';
import { AgentComponent } from '../agent/agent.component';
import { OfficeListComponent } from '../office-list/office-list.component';
import { OfficeComponent } from '../office/office.component';
import { AccountingOfficeListComponent } from '../accounting-office-list/accounting-office-list.component';
import { AccountingOfficeComponent } from '../accounting-office/accounting-office.component';
import { RegionListComponent } from '../region-list/region-list.component';
import { RegionComponent } from '../region/region.component';
import { AreaListComponent } from '../area-list/area-list.component';
import { AreaComponent } from '../area/area.component';
import { BuildingListComponent } from '../building-list/building-list.component';
import { BuildingComponent } from '../building/building.component';
import { CostCodesListComponent } from '../../accounting/cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from '../../accounting/cost-codes/cost-codes.component';
import { ColorListComponent } from '../color-list/color-list.component';
import { ColorComponent } from '../color/color.component';
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
    AccountingOfficeListComponent,
    AccountingOfficeComponent,
    RegionListComponent,
    RegionComponent,
    AreaListComponent,
    AreaComponent,
    BuildingListComponent,
    BuildingComponent,
    CostCodesListComponent,
    CostCodesComponent,
    ColorListComponent,
    ColorComponent
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
  isEditingAccountingOffice: boolean = false;
  accountingOfficeId: string | number | null = null;
  isEditingRegion: boolean = false;
  regionId: string | number | null = null;
  isEditingArea: boolean = false;
  areaId: string | number | null = null;
  isEditingBuilding: boolean = false;
  buildingId: string | number | null = null;
  isEditingCostCodes: boolean = false;
  costCodesId: string | number | null = null;
  costCodesOfficeId: number | null = null;
  selectedCostCodesOfficeId: number | null = null;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;

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

  onCostCodesOfficeChangeFromList(officeId: number | null): void {
    // Handle office change from cost-codes-list component
    this.selectedCostCodesOfficeId = officeId;
    this.costCodesOfficeId = officeId;
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

  onAccountingOfficeSelected(accountingOfficeId: string | number | null): void {
    this.accountingOfficeId = accountingOfficeId;
    this.isEditingAccountingOffice = accountingOfficeId !== null;
    if (this.isEditingAccountingOffice) {
      this.expandedSections.accountingOffices = true;
    }
  }

  onAccountingOfficeBack(): void {
    this.accountingOfficeId = null;
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

  onCostCodesAdd(): void {
    this.costCodesId = 'new';
    this.costCodesOfficeId = this.selectedCostCodesOfficeId;
    this.isEditingCostCodes = true;
    if (this.isEditingCostCodes) {
      this.expandedSections.costCodes = true;
    }
  }

  onCostCodesEdit(event: string | { costCodeId: string, officeId: number | null }): void {
    // Handle both old format (string) and new format (object)
    if (typeof event === 'string') {
      this.costCodesId = event;
      this.costCodesOfficeId = this.selectedCostCodesOfficeId;
    } else {
      this.costCodesId = event.costCodeId;
      this.costCodesOfficeId = event.officeId || this.selectedCostCodesOfficeId;
    }
    this.isEditingCostCodes = true;
    if (this.isEditingCostCodes) {
      this.expandedSections.costCodes = true;
    }
  }

  onCostCodesBack(): void {
    this.costCodesId = null;
    this.costCodesOfficeId = null;
    this.isEditingCostCodes = false;
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

