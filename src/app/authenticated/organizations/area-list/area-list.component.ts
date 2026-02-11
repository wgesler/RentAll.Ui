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
import { AreaListDisplay, AreaResponse } from '../models/area.model';
import { AreaService } from '../services/area.service';
import { OfficeService } from '../services/office.service';

@Component({
    selector: 'app-area-list',
    templateUrl: './area-list.component.html',
    styleUrls: ['./area-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class AreaListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() areaSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allAreas: AreaListDisplay[] = [];
  areasDisplay: AreaListDisplay[] = [];

  areasDisplayedColumns: ColumnSet = {
    'areaCode': { displayAs: 'Code', maxWidth: '20ch' },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['areas']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public areaService: AreaService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  //#region Area-List
  ngOnInit(): void {
    this.getAreas();
  }

  addArea(): void {
    if (this.embeddedInSettings) {
      this.areaSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Area, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getAreas(): void {
    this.areaService.getAreas().pipe(take(1), finalize(() => { this.removeLoadItem('areas'); })).subscribe({
      next: (response: AreaResponse[]) => {
        this.allAreas = this.mappingService.mapAreas(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Areas', CommonMessage.ServiceError);
        }
        this.removeLoadItem('areas');
      }
    });
  }

  deleteArea(area: AreaListDisplay): void {
    if (confirm(`Are you sure you want to delete ${area.areaCode}?`)) {
      this.areaService.deleteArea(area.areaId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Area deleted successfully', CommonMessage.Success);
          this.getAreas();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete area. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete area', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToArea(event: AreaListDisplay): void {
    if (this.embeddedInSettings) {
      this.areaSelected.emit(event.areaId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Area, [event.areaId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Filtering Methods
  applyFilters(): void {
    this.areasDisplay = this.showInactive
      ? this.allAreas
      : this.allAreas.filter(area => area.isActive);
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
