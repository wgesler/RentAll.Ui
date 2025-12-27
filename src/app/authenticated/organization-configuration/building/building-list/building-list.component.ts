import { OnInit, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { BuildingResponse, BuildingListDisplay } from '../models/building.model';
import { BuildingService } from '../services/building.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';

@Component({
  selector: 'app-building-list',
  templateUrl: './building-list.component.html',
  styleUrls: ['./building-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class BuildingListComponent implements OnInit {
  @Input() embeddedInSettings: boolean = false;
  @Output() buildingSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  buildingsDisplayedColumns: ColumnSet = {
    'buildingCode': { displayAs: 'Building Code', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '40ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allBuildings: BuildingListDisplay[] = [];
  buildingsDisplay: BuildingListDisplay[] = [];

  constructor(
    public buildingService: BuildingService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('buildings');
  }

  ngOnInit(): void {
    this.getBuildings();
  }

  addBuilding(): void {
    if (this.embeddedInSettings) {
      this.buildingSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Building, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getBuildings(): void {
    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.removeLoadItem('buildings') })).subscribe({
      next: (response: BuildingResponse[]) => {
        this.allBuildings = this.mappingService.mapBuildings(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Buildings', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteBuilding(building: BuildingListDisplay): void {
    if (confirm(`Are you sure you want to delete ${building.buildingCode}?`)) {
      this.buildingService.deleteBuilding(building.buildingId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Building deleted successfully', CommonMessage.Success);
          this.getBuildings();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete building. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete building', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToBuilding(event: BuildingListDisplay): void {
    if (this.embeddedInSettings) {
      this.buildingSelected.emit(event.buildingId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Building, [event.buildingId.toString()]);
      this.router.navigateByUrl(url);
    }
  }

  // Filter methods
  applyFilters(): void {
    this.buildingsDisplay = this.showInactive
      ? this.allBuildings
      : this.allBuildings.filter(building => building.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

 // Utility methods
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

