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
import { AreaListDisplay, AreaResponse } from '../models/area.model';
import { OfficeResponse } from '../models/office.model';
import { AreaService } from '../services/area.service';
import { GlobalOfficeSelectionService } from '../services/global-office-selection.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-area-list',
    templateUrl: './area-list.component.html',
    styleUrls: ['./area-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
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
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  officeScopeResolved: boolean = false;

  areasDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'areaCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'areas', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  globalOfficeSubscription?: Subscription;

  constructor(
    public areaService: AreaService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private utilityService: UtilityService) {
  }

  //#region Area-List
  ngOnInit(): void {
    this.loadOffices();
    this.getAreas();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
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
    this.areaService.getAreas().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas'); })).subscribe({
      next: (response: AreaResponse[]) => {
        this.allAreas = this.mappingService.mapAreas(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas');
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
    if (this.embeddedInSettings) {
      this.areaSelected.emit(event.areaId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Area, [event.areaId.toString()]);
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
        this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { requireResolvedSelectionEmpty: true }).pipe(take(1)).subscribe({
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
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.applyFilters();
  }
    
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
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
