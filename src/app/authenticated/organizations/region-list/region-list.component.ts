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
import { RegionListDisplay, RegionResponse } from '../models/region.model';
import { OfficeService } from '../services/office.service';
import { RegionService } from '../services/region.service';

@Component({
    selector: 'app-region-list',
    templateUrl: './region-list.component.html',
    styleUrls: ['./region-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class RegionListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() regionSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allRegions: RegionListDisplay[] = [];
  regionsDisplay: RegionListDisplay[] = [];

  regionsDisplayedColumns: ColumnSet = {
    'regionCode': { displayAs: 'Code', maxWidth: '20ch' },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['regions']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public regionService: RegionService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService) {
  }

  //#region Region-List
  ngOnInit(): void {
    this.getRegions();
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
    this.regionService.getRegions().pipe(take(1), finalize(() => { this.removeLoadItem('regions'); })).subscribe({
      next: (response: RegionResponse[]) => {
        this.allRegions = this.mappingService.mapRegions(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
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
          if (err.status === 404) {
            // Handle not found error if business logic requires
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
  //#endregion

  //#region Filtering Methods
  applyFilters(): void {
    this.regionsDisplay = this.showInactive
      ? this.allRegions
      : this.allRegions.filter(region => region.isActive);
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

