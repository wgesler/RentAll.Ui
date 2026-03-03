import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ContractorListComponent } from '../contractor-list/contractor-list.component';
import { InspectionChecklistComponent } from '../inspection-checklist/inspection-checklist.component';
import { HistoryComponent } from '../history/history.component';
import { WorkOrderListComponent } from '../work-order-list/work-order-list.component';

@Component({
  selector: 'app-maintenance',
  imports: [
    CommonModule,
    MaterialModule,
    InspectionChecklistComponent,
    WorkOrderListComponent,
    ContractorListComponent,
    HistoryComponent
  ],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent implements OnInit {
  property: PropertyResponse | null = null;
  isServiceError = false;
  selectedTabIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(take(1)).subscribe(params => {
      const tabParam = Number(params.get('tab'));
      if (!Number.isNaN(tabParam) && tabParam >= 0 && tabParam <= 4) {
        this.selectedTabIndex = tabParam;
      }
    });

    this.route.paramMap.pipe(
      filter(params => params.has('id')),
      take(1)
    ).subscribe(params => {
      const id = params.get('id')!;
      this.propertyService.getPropertyByGuid(id).pipe(take(1)).subscribe({
        next: (p) => this.property = p,
        error: () => {
          this.property = null;
          this.isServiceError = true;
        }
      });
    });
  }

  onTabChange(event: { index: number }): void {
    this.selectedTabIndex = event.index;
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
}
