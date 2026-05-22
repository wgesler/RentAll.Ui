import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, Subscription, skip, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { GeneralComponent, GeneralLeadFormClosed } from '../general/general.component';
import { GeneralListComponent } from '../general-list/general-list.component';
import { OwnerComponent, OwnerLeadFormClosed } from '../owner/owner.component';
import { OwnerEditSelection, OwnerListComponent } from '../owner-list/owner-list.component';
import { LeadsReportsComponent } from '../reports/leads-reports.component';
import { RentalComponent, RentalLeadFormClosed } from '../rental/rental.component';
import { RentalEditSelection, RentalListComponent } from '../rental-list/rental-list.component';

@Component({
  standalone: true,
  selector: 'app-leads-shell',
  templateUrl: './leads-shell.component.html',
  styleUrls: ['./leads-shell.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    TitleBarSelectComponent,
    RentalListComponent,
    RentalComponent,
    OwnerListComponent,
    OwnerComponent,
    GeneralListComponent,
    GeneralComponent,
    LeadsReportsComponent
  ]
})
export class LeadsShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);

  selectedTabIndex = 0;
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
  officeTitleBarShowError = false;
  isAdmin = false;

  showRentalLeadForm = false;
  showOwnerLeadForm = false;
  showGeneralLeadForm = false;
  rentalShellLeadId: string | null = null;
  ownerShellLeadId: string | null = null;
  generalShellLeadId: string | null = null;
  reportsStartDate: Date | null = null;
  reportsEndDate: Date | null = null;
  /** Tab index to restore when leaving embedded add via title bar Back (0 rental, 1 owner, 2 general). */
  embeddedLeadFormReturnTabIndex = 0;

  private destroy$ = new Subject<void>();
  private officesSubscription?: Subscription;
  private globalOfficeSubscription?: Subscription;
  private isApplyingQueryParamState = false;
  private isWritingQueryParams = false;
  private lastKnownQueryStateKey: string | null = null;

  //#region Leads-Shell
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    const initialGlobalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    if (initialGlobalOfficeId != null && initialGlobalOfficeId > 0) {
      this.selectedOfficeId = initialGlobalOfficeId;
    }
    this.loadOffices();
    this.globalOfficeSubscription = this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        this.syncOfficeFromGlobal(officeId);
      });
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(queryParamMap => {
      const params: Record<string, unknown> = {};
      queryParamMap.keys.forEach(key => {
        params[key] = queryParamMap.get(key) ?? '';
      });
      this.applyRouteQueryState(params);
    });
  }

  get officeOptions(): { value: number; label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.onOfficeIdChange(value == null || value === '' ? null : Number(value));
  }

  onOfficeIdChange(officeId: number | null): void {
    this.resolveOfficeScope(officeId);
    this.updateUrlWithCurrentState();
  }

  onTabIndexChange(nextTabIndex: number): void {
    nextTabIndex = this.normalizeTabIndex(nextTabIndex);
    if (this.isApplyingQueryParamState || nextTabIndex === this.selectedTabIndex) {
      this.selectedTabIndex = nextTabIndex;
      return;
    }
    const wasEmbeddedLeadFormOpen = this.showRentalLeadForm || this.showOwnerLeadForm || this.showGeneralLeadForm;
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.selectedTabIndex = nextTabIndex;
    if (this.selectedTabIndex === this.getReportsTabIndex() && !this.reportsStartDate && !this.reportsEndDate) {
      this.setDefaultReportDateRange();
    }
    this.updateUrlWithCurrentState();
  }

  onReportsDateRangeChange(shouldSyncUrl: boolean = true): void {
    if (!this.reportsStartDate && !this.reportsEndDate) {
      this.setDefaultReportDateRange();
    } else if (this.reportsStartDate && !this.reportsEndDate) {
      const end = new Date(this.reportsStartDate);
      end.setMonth(end.getMonth() + 6);
      end.setHours(0, 0, 0, 0);
      this.reportsEndDate = end;
    } else if (!this.reportsStartDate && this.reportsEndDate) {
      const start = new Date(this.reportsEndDate);
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      this.reportsStartDate = start;
    }
    if (this.reportsStartDate) {
      this.reportsStartDate.setHours(0, 0, 0, 0);
    }
    if (this.reportsEndDate) {
      this.reportsEndDate.setHours(0, 0, 0, 0);
    }
    if (this.reportsStartDate && this.reportsEndDate && this.reportsStartDate.getTime() > this.reportsEndDate.getTime()) {
      const temp = this.reportsStartDate;
      this.reportsStartDate = this.reportsEndDate;
      this.reportsEndDate = temp;
    }
    if (shouldSyncUrl && !this.isApplyingQueryParamState) {
      this.updateUrlWithCurrentState();
    }
  }

  onAddRentalLead(): void {
    this.officeTitleBarShowError = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 0;
    this.rentalShellLeadId = 'new';
    this.showRentalLeadForm = true;
    this.selectedTabIndex = 0;
    this.updateUrlWithCurrentState();
  }

  onEditRentalLead(selection: RentalEditSelection): void {
    if (!selection?.rentalId) {
      return;
    }
    if ((this.selectedOfficeId == null || this.selectedOfficeId <= 0) && selection.officeId != null && selection.officeId > 0) {
      this.resolveOfficeScope(selection.officeId);
    }
    this.officeTitleBarShowError = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 0;
    this.rentalShellLeadId = String(selection.rentalId);
    this.showRentalLeadForm = true;
    this.selectedTabIndex = 0;
    this.updateUrlWithCurrentState();
  }

  onRentalLeadFormClosed(result?: RentalLeadFormClosed): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.rentalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    if (result?.saved) {
      this.restoreTitleBarOfficeFromGlobalSelection();
    }
    this.updateUrlWithCurrentState();
  }

  onRentalOfficeSelectionRequired(): void {
    if (this.offices.length > 0) {
      this.officeTitleBarShowError = true;
    } else {
      this.toastr.warning('Please select a specific office in the title bar before saving.', 'Office required');
    }
    this.cdr.markForCheck();
  }

  onOwnerOfficeSelectionRequired(): void {
    this.onRentalOfficeSelectionRequired();
  }

  onGeneralOfficeSelectionRequired(): void {
    this.onRentalOfficeSelectionRequired();
  }

  onAddOwnerLead(): void {
    if (!this.isAdmin) {
      return;
    }
    this.showRentalLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = this.getOwnerTabIndex();
    this.ownerShellLeadId = 'new';
    this.showOwnerLeadForm = true;
    this.selectedTabIndex = this.getOwnerTabIndex();
    this.updateUrlWithCurrentState();
  }

  onEditOwnerLead(selection: OwnerEditSelection): void {
    if (!this.isAdmin) {
      return;
    }
    if (!selection?.ownerId) {
      return;
    }
    if ((this.selectedOfficeId == null || this.selectedOfficeId <= 0) && selection.officeId != null && selection.officeId > 0) {
      this.resolveOfficeScope(selection.officeId);
    }
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = this.getOwnerTabIndex();
    this.ownerShellLeadId = String(selection.ownerId);
    this.showOwnerLeadForm = true;
    this.selectedTabIndex = this.getOwnerTabIndex();
    this.updateUrlWithCurrentState();
  }

  onOwnerLeadFormClosed(result?: OwnerLeadFormClosed): void {
    this.showOwnerLeadForm = false;
    this.ownerShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    if (result?.saved) {
      this.restoreTitleBarOfficeFromGlobalSelection();
    }
    this.updateUrlWithCurrentState();
  }

  onAddGeneralLead(): void {
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = this.getGeneralTabIndex();
    this.generalShellLeadId = 'new';
    this.showGeneralLeadForm = true;
    this.selectedTabIndex = this.getGeneralTabIndex();
    this.updateUrlWithCurrentState();
  }

  onEditGeneralLead(generalId: number): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = this.getGeneralTabIndex();
    this.generalShellLeadId = String(generalId);
    this.showGeneralLeadForm = true;
    this.selectedTabIndex = this.getGeneralTabIndex();
    this.updateUrlWithCurrentState();
  }

  onGeneralLeadFormClosed(result?: GeneralLeadFormClosed): void {
    this.showGeneralLeadForm = false;
    this.generalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    if (result?.saved) {
      this.restoreTitleBarOfficeFromGlobalSelection();
    }
    this.updateUrlWithCurrentState();
  }

  onEmbeddedLeadFormBack(): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }
  //#endregion

  //#region Office Methods
  applyRouteQueryState(params: Record<string, unknown>): void {
    const nextQueryStateKey = this.buildQueryStateKey(params);
    if (this.lastKnownQueryStateKey === nextQueryStateKey) {
      return;
    }
    this.lastKnownQueryStateKey = nextQueryStateKey;
    this.isApplyingQueryParamState = true;
    this.applyQueryParamState(params);
    this.applyLeadSelectionFromQueryParams(params);
    this.isApplyingQueryParamState = false;
  }

  applyLeadSelectionFromQueryParams(params: Record<string, unknown>): void {
    if (!this.isAdmin) {
      return;
    }
    const tab = String(params['tab'] || '').trim().toLowerCase();
    if (tab !== 'owner') {
      return;
    }
    const ownerId = getNumberQueryParam(params, 'leadOwnerId', 1);
    if (!ownerId) {
      return;
    }
    const officeId = getNumberQueryParam(params, 'officeId', 1);
    this.onEditOwnerLead({ ownerId, officeId });
  }

  applyQueryParamState(params: Record<string, unknown>): void {
    const tab = String(params['tab'] || '').trim().toLowerCase();
    const nextIndex =
      tab === 'reports'
        ? this.getReportsTabIndex()
        : tab === 'general'
          ? this.getGeneralTabIndex()
          : tab === 'owner'
            ? this.getOwnerTabIndex()
            : 0;
    if (this.selectedTabIndex !== nextIndex) {
      this.selectedTabIndex = nextIndex;
    }

    const startDateParam = getStringQueryParam(params, 'startDate');
    const endDateParam = getStringQueryParam(params, 'endDate');
    this.reportsStartDate = this.utilityService.parseDateOnlyStringToDate(startDateParam);
    this.reportsEndDate = this.utilityService.parseDateOnlyStringToDate(endDateParam);
    if (this.selectedTabIndex === this.getReportsTabIndex()) {
      this.onReportsDateRangeChange(false);
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null) {
      if (this.offices.length > 0) {
        const matchedOffice = this.offices.find(o => o.officeId === officeId) || null;
        this.selectedOffice = matchedOffice;
        this.selectedOfficeId = matchedOffice?.officeId ?? null;
      } else {
        this.selectedOffice = null;
        this.selectedOfficeId = officeId;
      }
      this.clearOfficeTitleBarErrorIfValid();
      return;
    }

    if (getStringQueryParam(params, 'officeId') === null) {
      this.selectedOffice = null;
      this.selectedOfficeId = null;
    }
  }

  syncOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 0) {
      return;
    }
    this.resolveOfficeScope(officeId);
    this.cdr.markForCheck();
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
    this.clearOfficeTitleBarErrorIfValid();
  }

  restoreTitleBarOfficeFromGlobalSelection(): void {
    const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    this.resolveOfficeScope(globalOfficeId);
  }

  private clearOfficeTitleBarErrorIfValid(): void {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      this.officeTitleBarShowError = false;
    }
  }

  updateUrlWithCurrentState(): void {
    return;
  }

  setDefaultReportDateRange(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    this.reportsStartDate = start;
    this.reportsEndDate = today;
  }

  buildQueryStateKey(params: Record<string, unknown>): string {
    const tab = params['tab'] == null || String(params['tab']).trim() === '' ? null : String(params['tab']).trim().toLowerCase();
    const officeId = params['officeId'] == null || String(params['officeId']).trim() === '' ? null : String(params['officeId']).trim();
    const leadOwnerId = params['leadOwnerId'] == null || String(params['leadOwnerId']).trim() === '' ? null : String(params['leadOwnerId']).trim();
    const startDate = params['startDate'] == null || String(params['startDate']).trim() === '' ? null : String(params['startDate']).trim();
    const endDate = params['endDate'] == null || String(params['endDate']).trim() === '' ? null : String(params['endDate']).trim();
    return `${tab ?? ''}|${officeId ?? ''}|${leadOwnerId ?? ''}|${startDate ?? ''}|${endDate ?? ''}`;
  }

  getOwnerTabIndex(): number {
    return this.isAdmin ? 1 : 0;
  }

  getGeneralTabIndex(): number {
    return this.isAdmin ? 2 : 1;
  }

  getReportsTabIndex(): number {
    return this.isAdmin ? 3 : 2;
  }

  normalizeTabIndex(index: number): number {
    const max = this.getReportsTabIndex();
    return Math.min(Math.max(index, 0), max);
  }

  loadOffices(): void {
    this.officesSubscription?.unsubscribe();
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      this.cdr.markForCheck();
      return;
    }

    this.officesSubscription = this.officeService
      .ensureOfficesLoaded(organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: allOffices => {
          this.offices = allOffices || [];

          let didSetInitialOffice = false;
          if (!this.selectedOffice && this.offices.length === 1) {
            this.resolveOfficeScope(this.offices[0].officeId);
            didSetInitialOffice = true;
          } else if (!this.selectedOffice) {
            const initialOfficeId = this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue();
            if (initialOfficeId !== null) {
              const initialOffice = this.offices.find(office => office.officeId === initialOfficeId) || null;
              if (initialOffice) {
                this.resolveOfficeScope(initialOffice.officeId);
                didSetInitialOffice = true;
              }
            }
          }
          this.cdr.markForCheck();
          if (didSetInitialOffice) {
            this.updateUrlWithCurrentState();
          }
        },
        error: () => {
          this.offices = [];
          this.cdr.markForCheck();
        }
      });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
