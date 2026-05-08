
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { GlobalSelectionService } from '../services/global-selection.service';
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
import { OfficeService } from '../services/office.service';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { TrackerListComponent } from '../tracker-list/tracker-list.component';
import { TrackerContextType } from '../models/tracker-enum';
import { TrackerDefinitionListDisplay, TrackerSelectionEvent } from '../models/tracker.model';

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
    TitleBarSelectComponent,
    TrackerListComponent
],
    templateUrl: './configuration.component.html',
    styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit, OnDestroy {
  @ViewChild(OfficeListComponent) officeListComponent?: OfficeListComponent;
  @ViewChild(AgentListComponent) agentListComponent?: AgentListComponent;
  @ViewChild(RegionListComponent) regionListComponent?: RegionListComponent;
  @ViewChild(AreaListComponent) areaListComponent?: AreaListComponent;
  @ViewChild(BuildingListComponent) buildingListComponent?: BuildingListComponent;
  @ViewChild(AccountingOfficeListComponent) accountingOfficeListComponent?: AccountingOfficeListComponent;
  @ViewChild(ColorListComponent) colorListComponent?: ColorListComponent;
  @ViewChild(TrackerListComponent) trackerListComponent?: TrackerListComponent;

  expandedSections = {offices: false, accountingOffices: false,  agents: false, regions: false, area: false, building: false, costCodes: false, color: false,branding: false, trackers: false };
  isEditingAgent: boolean = false;
  agentId: string | null = null;
  shouldRefreshAgents: boolean = false;
  isEditingOffice: boolean = false;
  officeId: string | number | null = null;
  copyOfficeData: OfficeResponse | null = null;
  shouldRefreshOffices: boolean = false;
  isEditingAccountingOffice: boolean = false;
  accountingOfficeId: string | number | null = null;
  copyAccountingOfficeData: AccountingOfficeResponse | null = null;
  shouldRefreshAccountingOffices: boolean = false;
  isEditingRegion: boolean = false;
  regionId: string | number | null = null;
  shouldRefreshRegions: boolean = false;
  isEditingArea: boolean = false;
  areaId: string | number | null = null;
  shouldRefreshAreas: boolean = false;
  isEditingBuilding: boolean = false;
  buildingId: string | number | null = null;
  shouldRefreshBuildings: boolean = false;
  selectedCostCodesOfficeId: number | null = null;
  isEditingColor: boolean = false;
  colorId: string | number | null = null;
  shouldRefreshColors: boolean = false;
  isEditingTracker: boolean = false;
  trackerDefinitionId: string | null = null;
  selectedTrackerContextId: TrackerContextType | null = null;
  selectedTrackerOfficeId: number | null = null;
  selectedTracker: TrackerDefinitionListDisplay | null = null;
  shouldRefreshTrackers: boolean = false;

  // Organization dropdown (SuperAdmin only)
  isSuperAdmin: boolean = false;
  isAdminLikeSettingsUser: boolean = false;
  isLimitedSettingsUser: boolean = false;
  organizations: OrganizationResponse[] = [];
  offices: OfficeResponse[] = [];
  selectedOrganizationId: string | null = null;

  currentUserOrganizationId: string | null = null;

  constructor(
    private router: Router,
    private navigationContext: NavigationContextService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService
  ) {
  }

  //#region Configuration
  ngOnInit(): void {
    // Set that we're in settings context
    this.navigationContext.setIsInSettingsContext(true);
    const user = this.authService.getUser();
    this.currentUserOrganizationId = user?.organizationId || null;
    this.selectedCostCodesOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();

    this.isSuperAdmin = this.authService.hasRole(UserGroups.SuperAdmin);
    this.isAdminLikeSettingsUser = this.authService.isAdmin();
    this.isLimitedSettingsUser = !this.isAdminLikeSettingsUser &&
    (
      this.authService.hasRole(UserGroups.Agent) ||
      this.authService.hasRole(UserGroups.AgentAdmin) ||
      this.authService.hasRole(UserGroups.PropertyManager) ||
      this.authService.hasRole(UserGroups.PropertyManagerAdmin)
    );

    if (this.isSuperAdmin) {
      this.loadOrganizations();
    }
    this.loadSettingsOffices();
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

  loadSettingsOffices(): void {
    const organizationId = this.effectiveOrganizationId;
    if (!organizationId) {
      this.offices = [];
      this.selectedCostCodesOfficeId = null;
      return;
    }

    this.globalSelectionService.ensureOfficeScope(organizationId, null).pipe(take(1)).subscribe({
      next: (selectedOfficeId) => {
        this.offices = (this.officeService.getAllOfficesValue() || []).filter(office => office.isActive);
        if (this.offices.length === 1) {
          this.selectedCostCodesOfficeId = this.offices[0].officeId;
          this.globalSelectionService.setSelectedOfficeId(this.selectedCostCodesOfficeId);
          return;
        }

        const hasSelectedOffice = this.selectedCostCodesOfficeId != null && this.offices.some(office => office.officeId === this.selectedCostCodesOfficeId);
        this.selectedCostCodesOfficeId = hasSelectedOffice ? this.selectedCostCodesOfficeId : selectedOfficeId;
      },
      error: () => {
        this.offices = [];
        this.selectedCostCodesOfficeId = null;
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  get organizationTitleBarOptions(): { value: string, label: string }[] {
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
    this.loadSettingsOffices();
  }

  get effectiveOrganizationId(): string | null {
    return this.selectedOrganizationId || this.currentUserOrganizationId;
  }

  get officeTitleBarOptions(): { value: number; label: string }[] {
    return (this.offices || []).map((office) => ({
      value: office.officeId,
      label: office.name || ''
    }));
  }

  get shouldShowOfficeTitleBarDropdown(): boolean {
    return (this.offices || []).length > 1;
  }

  onSettingsOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.selectedCostCodesOfficeId = Number.isFinite(officeId as number) ? officeId : null;
    this.globalSelectionService.setSelectedOfficeId(this.selectedCostCodesOfficeId);
  }

  onCostCodesOfficeChangeFromList(officeId: number | null): void {
    // Handle office change from cost-codes-list component
    this.selectedCostCodesOfficeId = officeId;
    this.globalSelectionService.setSelectedOfficeId(officeId);
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
    if (this.shouldRefreshOffices) {
      this.officeListComponent?.getOffices();
    }
    this.shouldRefreshOffices = false;
    this.officeId = null;
    this.copyOfficeData = null;
    this.isEditingOffice = false;
  }

  onOfficeSaved(): void {
    this.shouldRefreshOffices = true;
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
    if (this.shouldRefreshAccountingOffices) {
      this.accountingOfficeListComponent?.getAccountingOffices();
    }
    this.shouldRefreshAccountingOffices = false;
    this.accountingOfficeId = null;
    this.copyAccountingOfficeData = null;
    this.isEditingAccountingOffice = false;
  }

  onAccountingOfficeSaved(): void {
    this.shouldRefreshAccountingOffices = true;
  }

  onAgentSelected(agentId: string | number | null): void {
    this.agentId = agentId !== null ? agentId.toString() : null;
    this.isEditingAgent = agentId !== null;
    if (this.isEditingAgent) {
      this.expandedSections.agents = true;
    }
  }

  onAgentBack(): void {
    if (this.shouldRefreshAgents) {
      this.agentListComponent?.getAgents();
    }
    this.shouldRefreshAgents = false;
    this.agentId = null;
    this.isEditingAgent = false;
  }

  onAgentSaved(): void {
    this.shouldRefreshAgents = true;
  }

  onRegionSelected(regionId: string | number | null): void {
    this.regionId = regionId;
    this.isEditingRegion = regionId !== null;
    if (this.isEditingRegion) {
      this.expandedSections.regions = true;
    }
  }

  onRegionBack(): void {
    if (this.shouldRefreshRegions) {
      this.regionListComponent?.getRegions();
    }
    this.shouldRefreshRegions = false;
    this.regionId = null;
    this.isEditingRegion = false;
  }

  onRegionSaved(): void {
    this.shouldRefreshRegions = true;
  }

  onAreaSelected(areaId: string | number | null): void {
    this.areaId = areaId;
    this.isEditingArea = areaId !== null;
    if (this.isEditingArea) {
      this.expandedSections.area = true;
    }
  }

  onAreaBack(): void {
    if (this.shouldRefreshAreas) {
      this.areaListComponent?.getAreas();
    }
    this.shouldRefreshAreas = false;
    this.areaId = null;
    this.isEditingArea = false;
  }

  onAreaSaved(): void {
    this.shouldRefreshAreas = true;
  }

  onBuildingSelected(buildingId: string | number | null): void {
    this.buildingId = buildingId;
    this.isEditingBuilding = buildingId !== null;
    if (this.isEditingBuilding) {
      this.expandedSections.building = true;
    }
  }

  onBuildingBack(): void {
    if (this.shouldRefreshBuildings) {
      this.buildingListComponent?.getBuildings();
    }
    this.shouldRefreshBuildings = false;
    this.buildingId = null;
    this.isEditingBuilding = false;
  }

  onBuildingSaved(): void {
    this.shouldRefreshBuildings = true;
  }

  onColorSelected(colorId: string | number | null): void {
    this.colorId = colorId;
    this.isEditingColor = colorId !== null;
    if (this.isEditingColor) {
      this.expandedSections.color = true;
    }
  }

  onColorBack(): void {
    if (this.shouldRefreshColors) {
      this.colorListComponent?.getColors();
    }
    this.shouldRefreshColors = false;
    this.colorId = null;
    this.isEditingColor = false;
  }

  onColorSaved(): void {
    this.shouldRefreshColors = true;
  }

  onTrackerSelected(event: TrackerSelectionEvent): void {
    this.trackerDefinitionId = event?.trackerDefinitionId ?? null;
    this.selectedTrackerContextId = event?.trackerContextId ?? null;
    this.selectedTrackerOfficeId = event?.officeId ?? this.selectedCostCodesOfficeId;
    this.selectedTracker = event?.tracker ?? null;
    this.isEditingTracker = this.trackerDefinitionId !== null;
    if (this.isEditingTracker) {
      this.expandedSections.trackers = true;
    }
  }

  onTrackerBack(): void {
    if (this.shouldRefreshTrackers) {
      this.trackerListComponent?.getTrackers();
    }
    this.shouldRefreshTrackers = false;
    this.trackerDefinitionId = null;
    this.selectedTrackerContextId = null;
    this.selectedTrackerOfficeId = null;
    this.selectedTracker = null;
    this.isEditingTracker = false;
  }

  onTrackerSaved(): void {
    this.shouldRefreshTrackers = true;
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

