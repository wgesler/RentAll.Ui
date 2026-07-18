import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, finalize, take, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../models/accounting-office.model';
import { OfficeResponse } from '../models/office.model';
import { AccountingOfficeService } from '../services/accounting-office.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-accounting-office-list',
    templateUrl: './accounting-office-list.component.html',
    styleUrls: ['./accounting-office-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class AccountingOfficeListComponent implements OnInit, OnDestroy {

  @Output() officeSelected = new EventEmitter<string | number | null>();
  @Output() copyAccountingOfficeEvent = new EventEmitter<AccountingOfficeResponse>();
  accountingOfficeService = inject(AccountingOfficeService);
  toastr = inject(ToastrService);
  formatterService = inject(FormatterService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  isServiceError: boolean = false;
  showInactive: boolean = false;

  organizationId = '';
  offices: OfficeResponse[] = [];

  allAccountingOffices: AccountingOfficeListDisplay[] = [];
  accountingOfficesDisplay: AccountingOfficeListDisplay[] = [];

  accountingOfficesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '15ch' },
    'name': { displayAs: 'Name', maxWidth: '15ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'fax': { displayAs: 'Fax', maxWidth: '20ch' },
    'bankName': { displayAs: 'Bank Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '40ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  //#region Office-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
  }

  addAccountingOffice(): void {
    this.officeSelected.emit('new');
  }

  getAccountingOffices(forceRefresh = false): void {
    const load$ = forceRefresh
      ? this.accountingOfficeService.refreshAccountingOffices()
      : this.accountingOfficeService.ensureAccountingOfficesLoaded();
    load$.pipe(take(1)).subscribe({
      next: (response: AccountingOfficeResponse[]) => {
        this.allAccountingOffices = this.mappingService.mapAccountingOffices(response, this.offices);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  deleteAccountingOffice(office: AccountingOfficeListDisplay): void {
    this.accountingOfficeService.deleteAccountingOffice(office.officeId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Accounting Office deleted successfully', CommonMessage.Success);
        this.getAccountingOffices(true);
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  goToAccountingOffice(event: AccountingOfficeListDisplay): void {
    this.officeSelected.emit(event.officeId);
  }

  copyAccountingOffice(row: AccountingOfficeListDisplay): void {
    this.accountingOfficeService.getAccountingOfficeById(row.officeId).pipe(take(1)).subscribe({
      next: (response: AccountingOfficeResponse) => {
        const copyData: AccountingOfficeResponse = { ...response, name: '' };
        this.copyAccountingOfficeEvent.emit(copyData);
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        if (!this.offices.length) {
          this.allAccountingOffices = [];
          this.accountingOfficesDisplay = [];
          this.markViewForCheck();
          return;
        }
        this.getAccountingOffices();
        this.markViewForCheck();
      });
    });
  }
  //#endregion

  //#region Filter methods
  applyFilters(): void {
    this.accountingOfficesDisplay = this.showInactive
      ? this.allAccountingOffices.filter(office => office.isActive === false)
      : this.allAccountingOffices.filter(office => office.isActive === true);
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
