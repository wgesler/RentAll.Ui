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
import { RegionListDisplay, RegionResponse } from '../models/region.model';
import { OfficeResponse } from '../models/office.model';
import { GlobalSelectionService } from '../services/global-selection.service';
import { OfficeService } from '../services/office.service';
import { RegionService } from '../services/region.service';

@Component({
    standalone: true,
    selector: 'app-region-list',
    templateUrl: './region-list.component.html',
    styleUrls: ['./region-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})

export class RegionListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() regionSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allRegions: RegionListDisplay[] = [];
  regionsDisplay: RegionListDisplay[] = [];

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  officeScopeResolved: boolean = false;

  regionsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'regionCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'regions', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  globalOfficeSubscription?: Subscription;

  constructor(
    public regionService: RegionService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private utilityService: UtilityService) {
  }

  //#region Region-List
  ngOnInit(): void {
    this.loadOffices();
    this.getRegions();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
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
    this.regionService.getRegions().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions'); })).subscribe({
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

  //#region Filtering Methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allRegions;
    if (this.selectedOffice) {
      filtered = filtered.filter(region => region.officeId === this.selectedOffice!.officeId);
    }
    this.regionsDisplay = this.showInactive
      ? filtered
      : filtered.filter(region => region.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Form Response Methods
  goToRegion(event: RegionListDisplay): void {
    if (this.embeddedInSettings) {
      this.regionSelected.emit(event.regionId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Region, [event.regionId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  
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

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

