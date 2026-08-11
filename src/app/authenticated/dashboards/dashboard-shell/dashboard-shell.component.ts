import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { DashboardArrivalsTabComponent } from '../dashboard-arrivals-tab/dashboard-arrivals-tab.component';
import { DashboardCleaningTabComponent } from '../dashboard-cleaning-tab/dashboard-cleaning-tab.component';
import { DashboardCompanyDataHostComponent } from '../dashboard-company-data-host/dashboard-company-data-host.component';
import { DashboardDeparturesTabComponent } from '../dashboard-departures-tab/dashboard-departures-tab.component';
import { DashboardMainComponent } from '../dashboard-main/dashboard-main.component';
import { DashboardOfflineTabComponent } from '../dashboard-offline-tab/dashboard-offline-tab.component';
import { DashboardOnlineTabComponent } from '../dashboard-online-tab/dashboard-online-tab.component';

@Component({
  standalone: true,
  selector: 'app-dashboard-shell',
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.scss',
  imports: [
    CommonModule,
    MaterialModule,
    DashboardMainComponent,
    DashboardCompanyDataHostComponent,
    DashboardArrivalsTabComponent,
    DashboardDeparturesTabComponent,
    DashboardOnlineTabComponent,
    DashboardOfflineTabComponent,
    DashboardCleaningTabComponent
  ]
})
export class DashboardShellComponent implements OnInit, OnDestroy {
  selectedTabIndex = 0;

  //#region Dashboard-Shell
  ngOnInit(): void {}

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {}
  //#endregion
}
