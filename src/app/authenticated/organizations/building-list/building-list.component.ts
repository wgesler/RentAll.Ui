import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { BuildingListDisplay, BuildingResponse } from '../models/building.model';
import { OfficeResponse } from '../models/office.model';
import { GlobalSelectionService } from '../services/global-selection.service';
import { BuildingService } from '../services/building.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-building-list',
    templateUrl: './building-list.component.html',
    styleUrls: ['./building-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})

export class BuildingListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() buildingSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allBuildings: BuildingListDisplay[] = [];
  buildingsDisplay: BuildingListDisplay[] = [];

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  officeScopeResolved: boolean = false;

  buildingsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'buildingCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'buildings', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public buildingService: BuildingService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private utilityService: UtilityService) {
  }

  //#region Building-List
  ngOnInit(): void {
    this.loadOffices();
    this.getBuildings();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
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
    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (response: BuildingResponse[]) => {
        this.allBuildings = this.mappingService.mapBuildings(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
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
    if (this.embeddedInSettings) {
      this.buildingSelected.emit(event.buildingId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Building, [event.buildingId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.globalSelectionService.getOfficeUiState$(this.offices, { requireResolvedSelectionEmpty: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.selectedOffice = uiState.selectedOffice;
            this.showOfficeDropdown = this.embeddedInSettings ? false : uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId);
          }
        });
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.applyFilters();
  }
  
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
      ? filtered
      : filtered.filter(building => building.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

