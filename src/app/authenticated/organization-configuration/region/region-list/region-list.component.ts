import { OnInit, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { RegionResponse, RegionListDisplay } from '../models/region.model';
import { RegionService } from '../services/region.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-region-list',
  templateUrl: './region-list.component.html',
  styleUrls: ['./region-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class RegionListComponent implements OnInit {
  @Input() embeddedInSettings: boolean = false;
  @Output() regionSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  regionsDisplayedColumns: ColumnSet = {
    'regionCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'officeName': { displayAs: 'Office', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allRegions: RegionListDisplay[] = [];
  regionsDisplay: RegionListDisplay[] = [];
  private offices: OfficeResponse[] = [];

  constructor(
    public regionService: RegionService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private officeService: OfficeService) {
      this.itemsToLoad.push('regions');
  }

  ngOnInit(): void {
    this.loadOffices();
  }

  loadOffices(): void {
    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = offices || [];
        this.getRegions();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Region List Component - Error loading offices:', err);
        this.offices = [];
        this.getRegions();
      }
    });
  }

  addRegion(): void {
    if (this.embeddedInSettings) {
      this.regionSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Region, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getRegions(): void {
    this.regionService.getRegions().pipe(take(1), finalize(() => { this.removeLoadItem('regions') })).subscribe({
      next: (response: RegionResponse[]) => {
        this.allRegions = this.mappingService.mapRegions(response, this.offices);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Regions', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteRegion(region: RegionListDisplay): void {
    if (confirm(`Are you sure you want to delete ${region.regionCode}?`)) {
      this.regionService.deleteRegion(region.regionId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Region deleted successfully', CommonMessage.Success);
          this.getRegions();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete region. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete region', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToRegion(event: RegionListDisplay): void {
    if (this.embeddedInSettings) {
      this.regionSelected.emit(event.regionId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Region, [event.regionId.toString()]);
      this.router.navigateByUrl(url);
    }
  }

  // Filtering Methods
  applyFilters(): void {
    this.regionsDisplay = this.showInactive
      ? this.allRegions
      : this.allRegions.filter(region => region.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

