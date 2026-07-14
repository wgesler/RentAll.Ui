import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, take, Subject, takeUntil} from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ColorListDisplay, ColorResponse } from '../models/color.model';
import { ColorService } from '../services/color.service';

@Component({
    standalone: true,
    selector: 'app-color-list',
    templateUrl: './color-list.component.html',
    styleUrls: ['./color-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class ColorListComponent implements OnInit, OnDestroy {

  @Output() colorSelected = new EventEmitter<string | number | null>();
  colorService = inject(ColorService);
  toastr = inject(ToastrService);
  mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  isServiceError: boolean = false;
  allColors: ColorListDisplay[] = [];
  colorsDisplay: ColorListDisplay[] = [];

  colorsDisplayedColumns: ColumnSet = {
    'reservationStatus': { displayAs: 'Reservation Status', maxWidth: '40ch' },
    'color': { displayAs: 'Color', maxWidth: '30ch' }
  };

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors']));

  //#region Color-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.getColors();
  }

  getColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors'); })).subscribe({
      next: (response: ColorResponse[]) => {
        this.allColors = this.mappingService.mapColors(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors');
        this.markViewForCheck();
      }
    });
  }

  goToColor(event: ColorListDisplay): void {
    if (!event || event.colorId === null || event.colorId === undefined) return;
    this.colorSelected.emit(event.colorId);
  }
  //#endregion

  //#region Utility Methods
  applyFilters(): void {
    this.colorsDisplay = this.allColors;
  }
  
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

