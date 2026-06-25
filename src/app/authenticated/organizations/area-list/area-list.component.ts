import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, finalize, take, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AreaListDisplay, AreaResponse } from '../models/area.model';
import { OfficeResponse } from '../models/office.model';
import { AreaService } from '../services/area.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-area-list',
    templateUrl: './area-list.component.html',
    styleUrls: ['./area-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class AreaListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Output() areaSelected = new EventEmitter<string | number | null>();
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allAreas: AreaListDisplay[] = [];
  areasDisplay: AreaListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officeScopeResolved: boolean = false;

  areasDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'areaCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'areas', 'officeScope']));
  destroy$ = new Subject<void>();

  constructor(
    public areaService: AreaService,
    public toastr: ToastrService,
    public mappingService: MappingService,
    private authService: AuthService,
    private officeService: OfficeService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Area-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.getAreas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && this.offices.length > 0) {
      this.resolveOfficeScope(changes['officeId'].currentValue);
      this.markViewForCheck();
    }
  }

  addArea(): void {
    this.areaSelected.emit('new');
  }

  getAreas(): void {
    this.areaService.getAreas().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas'); })).subscribe({
      next: (response: AreaResponse[]) => {
        this.allAreas = this.mappingService.mapAreas(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas');
        this.markViewForCheck();
      }
    });
  }

  deleteArea(area: AreaListDisplay): void {
    this.areaService.deleteArea(area.areaId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Area deleted successfully', CommonMessage.Success);
        this.getAreas();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToArea(event: AreaListDisplay): void {
    this.areaSelected.emit(event.areaId);
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        this.offices = allOffices || [];
        this.resolveOfficeScope(this.officeId);
        this.markViewForCheck();
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyFilters();
  }
  //#endregion

  //#region Filtering Methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allAreas;
    if (this.selectedOffice) {
      filtered = filtered.filter(area => Number(area.officeId) === this.selectedOffice!.officeId);
    }
    this.areasDisplay = this.showInactive
      ? filtered
      : filtered.filter(area => area.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
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
