import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
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
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ColorListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() colorSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allColors: ColorListDisplay[] = [];
  colorsDisplay: ColorListDisplay[] = [];

  colorsDisplayedColumns: ColumnSet = {
    'reservationStatus': { displayAs: 'Reservation Status', maxWidth: '40ch' },
    'color': { displayAs: 'Color', maxWidth: '30ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public colorService: ColorService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private utilityService: UtilityService) {
  }

  //#region Color-List
  ngOnInit(): void {
    this.getColors();
  }

  addColor(): void {
    if (this.embeddedInSettings) {
      this.colorSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Color, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors'); })).subscribe({
      next: (response: ColorResponse[]) => {
        this.allColors = this.mappingService.mapColors(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors');
      }
    });
  }

  goToColor(event: ColorListDisplay): void {
    if (!event || event.colorId === null || event.colorId === undefined) return;
    if (this.embeddedInSettings) {
      this.colorSelected.emit(event.colorId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Color, [event.colorId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Utility Methods
  applyFilters(): void {
    this.colorsDisplay = this.allColors;
  }
  
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

