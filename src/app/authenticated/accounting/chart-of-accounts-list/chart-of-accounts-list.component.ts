import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, skip, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountTypeLabels } from '../models/accounting-enum';
import { ChartOfAccountComponent } from '../chart-of-accounts/chart-of-accounts.component';
import { ChartOfAccountListDisplay, ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';

@Component({
  standalone: true,
  selector: 'app-chart-of-accounts-list',
  templateUrl: './chart-of-accounts-list.component.html',
  styleUrls: ['./chart-of-accounts-list.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective, ChartOfAccountComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartOfAccountsListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Input() embeddedInSettings = false;
  @Output() officeIdChange = new EventEmitter<number | null>();

  isServiceError = false;
  allChartOfAccounts: ChartOfAccountResponse[] = [];
  chartOfAccountsDisplay: ChartOfAccountListDisplay[] = [];

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown = false;
  officeScopeResolved = false;
  isEditingChartOfAccount = false;
  chartOfAccountId: string | number | null = null;
  chartOfAccountOfficeId: number | null = null;

  accountTypes = AccountTypeLabels.map(({ value, label }) => ({ value, label }));

  chartOfAccountsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    accountNo: { displayAs: 'Account No', maxWidth: '15ch', sortType: 'natural' },
    accountType: { displayAs: 'Type', maxWidth: '25ch' },
    name: { displayAs: 'Name', maxWidth: '35ch' },
    description: { displayAs: 'Description', maxWidth: '35ch' },
    isSubaccountDisplay: { displayAs: 'Subaccount', maxWidth: '12ch', alignment: 'center' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['chartOfAccounts']));
  destroy$ = new Subject<void>();

  constructor(
    public chartOfAccountsService: ChartOfAccountsService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private utilityService: UtilityService,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService,
    private cdr: ChangeDetectorRef) {
  }

  //#region ChartOfAccounts-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.loadChartOfAccounts();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
      this.markViewForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      if (this.isEditingChartOfAccount) {
        this.chartOfAccountOfficeId = newOfficeId ?? null;
      }
      if (this.offices.length > 0) {
        this.resolveOfficeScope(newOfficeId, false);
      }
    }
  }

  addChartOfAccount(): void {
    if (!this.embeddedInSettings) {
      return;
    }
    this.chartOfAccountId = 'new';
    this.chartOfAccountOfficeId = this.selectedOffice?.officeId || this.officeId || null;
    this.isEditingChartOfAccount = true;
  }

  deleteChartOfAccount(account: ChartOfAccountListDisplay): void {
    const officeIdToUse = account.officeId || this.selectedOffice?.officeId;
    if (!officeIdToUse || account.accountId == null) {
      return;
    }
    this.chartOfAccountsService.deleteChartOfAccount(officeIdToUse, account.accountId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Chart of account deleted successfully', CommonMessage.Success);
        this.chartOfAccountsService.refreshChartOfAccountsForOffice(officeIdToUse);
        this.filterChartOfAccounts();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 404) {
          this.toastr.error('Unable to delete chart of account.', CommonMessage.Error);
        }
      }
    });
  }

  goToChartOfAccount(event: ChartOfAccountListDisplay): void {
    if (!this.embeddedInSettings) {
      return;
    }
    this.chartOfAccountId = event.accountId;
    this.chartOfAccountOfficeId = event.officeId || this.selectedOffice?.officeId || this.officeId || null;
    this.isEditingChartOfAccount = true;
  }

  onChartOfAccountSaved(): void {
    this.chartOfAccountsService.refreshAllChartOfAccounts();
    this.filterChartOfAccounts();
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        this.offices = allOffices || [];
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, useGlobalSelection: this.embeddedInSettings }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = this.embeddedInSettings ? false : uiState.showOfficeDropdown;
            const officeIdToUse = this.embeddedInSettings ? this.officeId : uiState.selectedOfficeId;
            this.resolveOfficeScope(officeIdToUse ?? null, this.officeId === null || this.officeId === undefined);
            this.markViewForCheck();
          }
        });
        this.markViewForCheck();
      });
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts');
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.filterChartOfAccounts();
        this.markViewForCheck();
      });
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Filter Methods
  onOfficeChange(): void {
    if (!this.embeddedInSettings) {
      this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    }
    this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    this.filterChartOfAccounts();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }
    this.chartOfAccountsDisplay = this.mappingService.mapChartOfAccounts(this.allChartOfAccounts, this.offices, this.accountTypes);
  }

  filterChartOfAccounts(): void {
    if (!this.selectedOffice) {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(take(1)).subscribe(allAccounts => {
        this.allChartOfAccounts = allAccounts || [];
        this.applyFilters();
        this.markViewForCheck();
      });
      return;
    }

    this.allChartOfAccounts = this.chartOfAccountsService.getChartOfAccountsForOffice(this.selectedOffice.officeId);
    this.applyFilters();
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    }
    this.filterChartOfAccounts();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  onChartOfAccountBack(): void {
    if (this.selectedOffice?.officeId) {
      this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOffice.officeId);
    }
    this.chartOfAccountId = null;
    this.chartOfAccountOfficeId = null;
    this.isEditingChartOfAccount = false;
    this.filterChartOfAccounts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
