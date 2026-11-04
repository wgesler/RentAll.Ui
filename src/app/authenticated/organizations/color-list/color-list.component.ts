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
import { CommonMessage } from '../../../enums/common-message.enum';
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
    'color': { displayAs: 'Color', maxWidth: '30ch' },
    'statusEnabled': { displayAs: 'In Use', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '12ch' }
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
      error: (_err: HttpErrorResponse) => {
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

  onStatusEnabledChange(event: ColorListDisplay): void {
    const changedCheckboxColumn = (event as unknown as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'statusEnabled') {
      return;
    }
    const previousValue = (event as unknown as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as unknown as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.colorService.updateStatusEnabled(event.reservationStatusId, nextValue).pipe(take(1)).subscribe({
      next: () => {
        this.setStatusEnabled(event.reservationStatusId, nextValue);
        this.toastr.success('Status updated successfully', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.setStatusEnabled(event.reservationStatusId, previousValue);
        this.toastr.error('Failed to update status', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  setStatusEnabled(reservationStatusId: number, isEnabled: boolean): void {
    this.allColors = this.allColors.map(color => color.reservationStatusId === reservationStatusId ? { ...color, statusEnabled: isEnabled } : color);
    this.applyFilters();
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

