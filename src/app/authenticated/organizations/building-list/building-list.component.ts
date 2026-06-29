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
import { BuildingListDisplay, BuildingResponse } from '../models/building.model';
import { OfficeResponse } from '../models/office.model';
import { BuildingService } from '../services/building.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-building-list',
    templateUrl: './building-list.component.html',
    styleUrls: ['./building-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class BuildingListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Output() buildingSelected = new EventEmitter<string | number | null>();
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allBuildings: BuildingListDisplay[] = [];
  buildingsDisplay: BuildingListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officeScopeResolved: boolean = false;

  buildingsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'buildingCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'buildings', 'officeScope']));
  destroy$ = new Subject<void>();

  constructor(
    public buildingService: BuildingService,
    public toastr: ToastrService,
    public mappingService: MappingService,
    private authService: AuthService,
    private officeService: OfficeService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Building-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.getBuildings();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && this.offices.length > 0) {
      this.resolveOfficeScope(changes['officeId'].currentValue);
      this.markViewForCheck();
    }
  }

  addBuilding(): void {
    this.buildingSelected.emit('new');
  }

  getBuildings(): void {
    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (response: BuildingResponse[]) => {
        this.allBuildings = this.mappingService.mapBuildings(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
        this.markViewForCheck();
      }
    });
  }

  deleteBuilding(building: BuildingListDisplay): void {
    this.buildingService.deleteBuilding(building.buildingId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Building deleted successfully', CommonMessage.Success);
        this.getBuildings();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToBuilding(event: BuildingListDisplay): void {
    this.buildingSelected.emit(event.buildingId);
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

  //#region Filter methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allBuildings;
    if (this.selectedOffice) {
      filtered = filtered.filter(building => Number(building.officeId) === this.selectedOffice!.officeId);
    }
    this.buildingsDisplay = this.showInactive
      ? filtered.filter(building => building.isActive === false)
      : filtered.filter(building => building.isActive === true);
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
