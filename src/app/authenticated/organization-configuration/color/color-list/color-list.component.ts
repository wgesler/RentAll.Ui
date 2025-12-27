import { OnInit, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { ColorResponse, ColorListDisplay } from '../models/color.model';
import { ColorService } from '../services/color.service';
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
  selector: 'app-color-list',
  templateUrl: './color-list.component.html',
  styleUrls: ['./color-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ColorListComponent implements OnInit {
  @Input() embeddedInSettings: boolean = false;
  @Output() colorSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;

  colorsDisplayedColumns: ColumnSet = {
    'reservationStatus': { displayAs: 'Reservation Status', maxWidth: '40ch' },
    'color': { displayAs: 'Color', maxWidth: '30ch' }
  };
  private allColors: ColorListDisplay[] = [];
  colorsDisplay: ColorListDisplay[] = [];

  constructor(
    public colorService: ColorService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('colors');
  }

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
    this.colorService.getColors().pipe(take(1), finalize(() => { this.removeLoadItem('colors') })).subscribe({
      next: (response: ColorResponse[]) => {
        this.allColors = this.mappingService.mapColors(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Colors', CommonMessage.ServiceError);
        }
      }
    });
  }

  applyFilters(): void {
    this.colorsDisplay = this.allColors;
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

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

