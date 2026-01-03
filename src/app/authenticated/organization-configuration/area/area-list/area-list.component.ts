import { OnInit, Component, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { AreaResponse, AreaListDisplay } from '../models/area.model';
import { AreaService } from '../services/area.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';

@Component({
  selector: 'app-area-list',
  templateUrl: './area-list.component.html',
  styleUrls: ['./area-list.component.scss'],
  standalone: true,
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
  offices: OfficeResponse[] = [];

  areasDisplayedColumns: ColumnSet = {
    'areaCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'officeName': { displayAs: 'Office', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['areas', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public areaService: AreaService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  ngOnInit(): void {
    this.loadOffices();
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
        this.allAreas = this.mappingService.mapAreas(response, this.offices);
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

  // Data Loading Methods
  loadOffices(): void {
    this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = offices || [];
        this.getAreas();
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.getAreas();
      }
    });
  }

  // Filtering Methods
  applyFilters(): void {
    this.areasDisplay = this.showInactive
      ? this.allAreas
      : this.allAreas.filter(area => area.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
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
}
