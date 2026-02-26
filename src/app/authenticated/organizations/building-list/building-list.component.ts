import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { BuildingListDisplay, BuildingResponse } from '../models/building.model';
import { BuildingService } from '../services/building.service';
import { OfficeService } from '../services/office.service';

@Component({
    selector: 'app-building-list',
    templateUrl: './building-list.component.html',
    styleUrls: ['./building-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class BuildingListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() buildingSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allBuildings: BuildingListDisplay[] = [];
  buildingsDisplay: BuildingListDisplay[] = [];

  buildingsDisplayedColumns: ColumnSet = {
    'buildingCode': { displayAs: 'Code', maxWidth: '20ch' },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['buildings']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public buildingService: BuildingService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  //#region Building-List
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
    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.removeLoadItem('buildings'); })).subscribe({
      next: (response: BuildingResponse[]) => {
        this.allBuildings = this.mappingService.mapBuildings(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.removeLoadItem('buildings');
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
        error: (_err: HttpErrorResponse) => {}
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
  //#endregion

  //#region Filter methods
  applyFilters(): void {
    this.buildingsDisplay = this.showInactive
      ? this.allBuildings
      : this.allBuildings.filter(building => building.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

