import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, filter, finalize, skip, switchMap, take, takeUntil } from 'rxjs';
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
  cachedChartOfAccounts: ChartOfAccountResponse[] = [];
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
  isAdmin = false;
  readonly noParentLabel = 'None';

  accountTypes = AccountTypeLabels.map(({ value, label }) => ({ value, label }));

  chartOfAccountsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    accountNo: { displayAs: 'Account', maxWidth: '10ch', sortType: 'natural' },
    accountType: { displayAs: 'Type', maxWidth: '20ch' },
    name: { displayAs: 'Name', maxWidth: '35ch' },
    description: { displayAs: 'Description', maxWidth: '35ch' },
    endingBalanceDisplay: { displayAs: 'Ending Balance', maxWidth: '18ch' },
    statementDateDisplay: { displayAs: 'Statement Date', maxWidth: '18ch' },
    isSubaccountDisplay: { displayAs: 'Subaccount', maxWidth: '12ch', alignment: 'center' },
    parentAccountDropdown: { displayAs: 'Parent Account', maxWidth: '30ch', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter accounts...' }
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
    this.isAdmin = this.authService.isAdmin();
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
        this.chartOfAccountsService.refreshChartOfAccountsForOffice(officeIdToUse).pipe(take(1)).subscribe(() => {
          this.filterChartOfAccounts();
          this.markViewForCheck();
        });
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

  onChartOfAccountParentAccountDropdownChange(event: ChartOfAccountListDisplay & { __changedDropdownColumn?: string }): void {
    if (!this.isAdmin) {
      return;
    }

    const changedColumn = event.__changedDropdownColumn || '';
    if (changedColumn !== 'parentAccountDropdown') {
      return;
    }

    const selectedLabel = String(event.parentAccountDropdown?.value || this.noParentLabel).trim();
    const selectedParentAccountId = this.resolveParentAccountIdFromLabel(event.officeId, selectedLabel, event.accountId);
    const currentParentLabel = this.getParentAccountLabel(event.officeId, event.subAccountId) || this.noParentLabel;

    if (selectedLabel === currentParentLabel) {
      return;
    }

    if (selectedLabel !== this.noParentLabel && selectedParentAccountId == null) {
      this.applyParentAccountDropdownsToDisplays();
      this.toastr.error('Select a valid parent account.', CommonMessage.Error);
      this.markViewForCheck();
      return;
    }

    if (selectedParentAccountId === event.accountId) {
      this.applyParentAccountDropdownsToDisplays();
      this.toastr.error('An account cannot be its own parent.', CommonMessage.Error);
      this.markViewForCheck();
      return;
    }

    this.chartOfAccountsService.getChartOfAccountById(event.officeId, event.accountId).pipe(take(1),
      switchMap(account => {
        const nextIsSubaccount = selectedLabel !== this.noParentLabel && selectedParentAccountId != null;
        const nextParentAccountId = nextIsSubaccount ? selectedParentAccountId : null;

        if (account.isSubaccount === nextIsSubaccount && (account.subAccountId ?? null) === nextParentAccountId) {
          return this.chartOfAccountsService.refreshChartOfAccountsForOffice(event.officeId);
        }

        return this.chartOfAccountsService.updateChartOfAccount(
          this.mappingService.mapChartOfAccountSubaccountParentUpdate(account, nextParentAccountId)).pipe(take(1),
          switchMap(() => this.chartOfAccountsService.refreshChartOfAccountsForOffice(event.officeId))
        );
      }),
      finalize(() => {
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        const nextIsSubaccount = selectedLabel !== this.noParentLabel && selectedParentAccountId != null;
        const nextParentAccountId = nextIsSubaccount ? selectedParentAccountId : null;
        this.patchLocalChartOfAccountSubaccountState(event.officeId, event.accountId, nextIsSubaccount, nextParentAccountId);
        this.toastr.success('Chart of account updated.', CommonMessage.Success);
        this.filterChartOfAccounts();
        this.markViewForCheck();
      },
      error: () => {
        this.applyParentAccountDropdownsToDisplays();
        this.toastr.error('Unable to update chart of account.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  onChartOfAccountSaved(): void {
    this.chartOfAccountsService.notifyChartOfAccountsChanged();
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
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.cachedChartOfAccounts = accounts || [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts');
        this.filterChartOfAccounts();
        this.markViewForCheck();
      });
    });
  }
  //#endregion

  //#region Filter Methods
  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    this.filterChartOfAccounts();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }
    this.chartOfAccountsDisplay = this.mappingService.mapChartOfAccounts(this.allChartOfAccounts, this.offices, this.accountTypes);
    this.applyParentAccountDropdownsToDisplays();
  }

  filterChartOfAccounts(): void {
    if (!this.selectedOffice) {
      this.allChartOfAccounts = this.cachedChartOfAccounts;
      this.applyFilters();
      this.markViewForCheck();
      return;
    }

    this.allChartOfAccounts = this.cachedChartOfAccounts.filter(account => account.officeId === this.selectedOffice!.officeId);
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

  //#region Dynamic List Methods
  applyParentAccountDropdownsToDisplays(): void {
    this.chartOfAccountsDisplay = (this.chartOfAccountsDisplay || []).map(row => {
      const parentOptionLabels = this.getParentAccountOptionLabels(row.officeId, row.accountId);
      const preferredLabel = this.getParentAccountLabel(row.officeId, row.subAccountId) || this.noParentLabel;
      const selectedLabel = this.resolveDropdownLabelFromOptions(parentOptionLabels, preferredLabel);
      const displayOptions = this.ensureDropdownOptionLabels(parentOptionLabels, selectedLabel);

      return {
        ...row,
        parentAccountDropdown: {
          value: selectedLabel,
          isOverridable: this.isAdmin,
          options: displayOptions,
          searchableDropdown: true,
          dropdownSearchPlaceholder: 'Type to filter accounts...',
          toString: () => selectedLabel
        }
      };
    });
  }

  getParentAccountOptionLabels(officeId: number, accountId: number): string[] {
    return this.cachedChartOfAccounts
      .filter(account => account.officeId === officeId)
      .filter(account => !account.isSubaccount && account.accountId !== accountId)
      .map(account => this.formatParentAccountLabel(account));
  }

  getParentAccountLabel(officeId: number, subAccountId?: number | null): string {
    if (!subAccountId) {
      return '';
    }

    const parentAccount = this.cachedChartOfAccounts
      .filter(account => account.officeId === officeId)
      .find(account => account.accountId === subAccountId);
    return parentAccount ? this.formatParentAccountLabel(parentAccount) : '';
  }

  resolveParentAccountIdFromLabel(officeId: number, label: string, accountId: number): number | null {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel || normalizedLabel === this.noParentLabel.toLowerCase()) {
      return null;
    }

    const matchedAccount = this.cachedChartOfAccounts
      .filter(account => account.officeId === officeId)
      .find(account => !account.isSubaccount && account.accountId !== accountId && this.formatParentAccountLabel(account).toLowerCase() === normalizedLabel);
    return matchedAccount?.accountId ?? null;
  }

  formatParentAccountLabel(account: ChartOfAccountResponse): string {
    return `${account.accountNo} - ${account.name}`;
  }

  resolveDropdownLabelFromOptions(optionLabels: string[], preferredLabel: string): string {
    const normalizedPreferred = preferredLabel.trim().toLowerCase();
    if (!normalizedPreferred || normalizedPreferred === this.noParentLabel.toLowerCase()) {
      return this.noParentLabel;
    }

    const exactMatch = optionLabels.find(label => label.trim().toLowerCase() === normalizedPreferred);
    return exactMatch || preferredLabel.trim();
  }

  ensureDropdownOptionLabels(optionLabels: string[], selectedLabel: string): string[] {
    const dedupedOptions = optionLabels.filter(label => label.trim().toLowerCase() !== this.noParentLabel.toLowerCase());
    const normalizedSelected = selectedLabel.trim().toLowerCase();
    const baseOptions = [this.noParentLabel, ...dedupedOptions];

    if (!normalizedSelected || normalizedSelected === this.noParentLabel.toLowerCase()) {
      return baseOptions;
    }

    const alreadyPresent = baseOptions.some(label => label.trim().toLowerCase() === normalizedSelected);
    if (alreadyPresent) {
      return baseOptions;
    }

    return [...baseOptions, selectedLabel.trim()];
  }

  patchLocalChartOfAccountSubaccountState(officeId: number, accountId: number, isSubaccount: boolean, subAccountId: number | null): void {
    this.allChartOfAccounts = this.allChartOfAccounts.map(account =>
      account.officeId === officeId && account.accountId === accountId
        ? { ...account, isSubaccount, subAccountId }
        : account
    );
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  onChartOfAccountBack(): void {
    if (this.selectedOffice?.officeId) {
      this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOffice.officeId).pipe(take(1)).subscribe();
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
