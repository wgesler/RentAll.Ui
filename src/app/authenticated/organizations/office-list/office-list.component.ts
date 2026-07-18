import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, take, Subject, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeListDisplay, OfficeResponse } from '../models/office.model';
import { OfficeService } from '../services/office.service';

export interface OfficeCopyPayload {
  office: OfficeResponse;
  organizationId: string | null;
}

@Component({
    standalone: true,
    selector: 'app-office-list',
    templateUrl: './office-list.component.html',
    styleUrls: ['./office-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class OfficeListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() organizationId: string | null = null;
  @Output() officeSelected = new EventEmitter<string | number | null>();
  @Output() copyOfficeEvent = new EventEmitter<OfficeCopyPayload>();
  officeService = inject(OfficeService);
  toastr = inject(ToastrService);
  mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allOffices: OfficeListDisplay[] = [];
  officesDisplay: OfficeListDisplay[] = [];

  officesDisplayedColumns: ColumnSet = {
    'officeCode': { displayAs: 'Code', maxWidth: '20ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'address': { displayAs: 'Location', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'fax': { displayAs: 'Fax', maxWidth: '20ch' },
    'website': { displayAs: 'Website', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());

  //#region Office-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.getOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['organizationId'] && !changes['organizationId'].firstChange) {
      this.getOffices();
    }
  }

  addOffice(): void {
    this.officeSelected.emit('new');
  }

  getOffices(forceRefresh = false): void {
    const orgId = (this.organizationId ?? this.authService.getUser()?.organizationId ?? '').trim();
    if (!orgId) {
      this.isServiceError = true;
      this.markViewForCheck();
      return;
    }
    const load$ = forceRefresh
      ? this.officeService.refreshOffices(orgId)
      : this.officeService.ensureOfficesLoaded(orgId);
    load$.pipe(take(1)).subscribe({
      next: (response: OfficeResponse[]) => {
        this.allOffices = this.mappingService.mapOffices(response);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  deleteOffice(office: OfficeListDisplay): void {
    this.officeService.deleteOffice(office.officeId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Office deleted successfully', CommonMessage.Success);
        this.getOffices(true);
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToOffice(event: OfficeListDisplay): void {
    this.officeSelected.emit(event.officeId);
  }

  copyOffice(row: OfficeListDisplay): void {
    this.officeService.getOfficeById(row.officeId).pipe(take(1)).subscribe({
      next: (response: OfficeResponse) => {
        const copyData: OfficeResponse = { ...response, name: '' };
        this.copyOfficeEvent.emit({
          office: copyData,
          organizationId: this.organizationId ?? null
        });
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Filter methods
  applyFilters(): void {
    this.officesDisplay = this.showInactive
      ? this.allOffices.filter(office => office.isActive === false)
      : this.allOffices.filter(office => office.isActive === true);
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


