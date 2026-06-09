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
import { RegionListDisplay, RegionResponse } from '../models/region.model';
import { OfficeResponse } from '../models/office.model';
import { OfficeService } from '../services/office.service';
import { RegionService } from '../services/region.service';

@Component({
    standalone: true,
    selector: 'app-region-list',
    templateUrl: './region-list.component.html',
    styleUrls: ['./region-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class RegionListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Output() regionSelected = new EventEmitter<string | number | null>();
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allRegions: RegionListDisplay[] = [];
  regionsDisplay: RegionListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  officeScopeResolved: boolean = false;

  regionsDisplayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'regionCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'regions', 'officeScope']));
  destroy$ = new Subject<void>();

  constructor(
    public regionService: RegionService,
    public toastr: ToastrService,
    public mappingService: MappingService,
    private authService: AuthService,
    private officeService: OfficeService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Region-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.getRegions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && this.offices.length > 0) {
      this.resolveOfficeScope(changes['officeId'].currentValue);
      this.markViewForCheck();
    }
  }

  addRegion(): void {
    this.regionSelected.emit('new');
  }

  getRegions(): void {
    this.regionService.getRegions().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions'); })).subscribe({
      next: (response: RegionResponse[]) => {
        this.allRegions = this.mappingService.mapRegions(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
        this.markViewForCheck();
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
    
  goToRegion(event: RegionListDisplay): void {
    this.regionSelected.emit(event.regionId);
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
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
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
