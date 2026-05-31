import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, skip, take, takeUntil } from 'rxjs';
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
import { OwnerComponent } from '../owner/owner.component';
import { OwnerEditSelection } from '../models/lead-owner.model';
import { OwnerListComponent } from '../owner-list/owner-list.component';
import { LeadsReportsComponent } from '../reports/leads-reports.component';
import { RentalComponent, RentalLeadFormClosed } from '../rental/rental.component';
import { RentalEditSelection } from '../models/lead-rental.model';
import { RentalListComponent } from '../rental-list/rental-list.component';

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
  @ViewChildren(RentalListComponent) rentalLists?: QueryList<RentalListComponent>;
  @ViewChildren(OwnerListComponent) ownerLists?: QueryList<OwnerListComponent>;
  @ViewChildren(GeneralListComponent) generalLists?: QueryList<GeneralListComponent>;
  @ViewChildren(LeadsReportsComponent) reportsSections?: QueryList<LeadsReportsComponent>;

  private route = inject(ActivatedRoute);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);

  selectedTabIndex = 0;
  organizationId = '';
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
  officeTitleBarShowError = false;
  isAdmin = false;
  isOwnerAdmin = false;

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
  private isApplyingQueryParamState = false;
  private lastKnownQueryStateKey: string | null = null;
  private initialOfficeScopeApplied = false;

  //#region Leads-Shell
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    /** Page-level office filter: seeded from global; does not write global. */
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    this.loadOffices();
    this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        this.applyOfficeFromGlobal(officeId);
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
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    this.cdr.markForCheck();
  }

  onTabIndexChange(nextTabIndex: number): void {
    nextTabIndex = this.normalizeTabIndex(nextTabIndex);
    if (this.isApplyingQueryParamState || nextTabIndex === this.selectedTabIndex) {
      this.selectedTabIndex = nextTabIndex;
      return;
    }
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
  }

  onReportsDateRangeChange(): void {
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
  }

  onRentalLeadFormClosed(result?: RentalLeadFormClosed): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.rentalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    if (result?.saved) {
      this.restoreTitleBarOfficeFromGlobalSelection();
    }
  }

  onRentalOfficeSelectionRequired(): void {
    if (this.offices.length > 0) {
      this.officeTitleBarShowError = true;
    } else {
      this.toastr.warning('Please select a specific office in the title bar before saving.', 'Office required');
    }
    this.cdr.markForCheck();
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
  }

  onOwnerLeadFormClosed(): void {
    this.showOwnerLeadForm = false;
    this.ownerShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.restoreTitleBarOfficeFromGlobalSelection();
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
  }

  onGeneralLeadFormClosed(result?: GeneralLeadFormClosed): void {
    this.showGeneralLeadForm = false;
    this.generalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    if (result?.saved) {
      this.restoreTitleBarOfficeFromGlobalSelection();
    }
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
    this.restoreTitleBarOfficeFromGlobalSelection();
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
      this.onReportsDateRangeChange();
    }
  }

  /** Page-level office follows global header; does not write global. */
  private applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 1) {
      this.applyPageOfficeScope(this.offices[0].officeId);
    } else if (this.offices.length > 1) {
      const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
      this.applyPageOfficeScope(resolved);
    } else {
      this.selectedOfficeId = officeId;
      this.selectedOffice = null;
      this.clearOfficeTitleBarErrorIfValid();
    }
    this.cdr.markForCheck();
  }

  /** Title-bar office change on this page only (never updates global selection). */
  private applyPageOfficeScope(officeId: number | null): void {
    if (this.offices.length > 0) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
    } else {
      this.selectedOffice = null;
      this.selectedOfficeId = officeId;
    }
    this.clearOfficeTitleBarErrorIfValid();
    this.propagateOfficeToLeadLists();
  }

  resolveOfficeScope(officeId: number | null): void {
    this.applyPageOfficeScope(officeId);
  }

  restoreTitleBarOfficeFromGlobalSelection(): void {
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
  }

  private propagateOfficeToLeadLists(): void {
    const scopeOfficeId = this.selectedOfficeId;
    queueMicrotask(() => {
      this.rentalLists?.forEach(section => {
        if (section.offices.length > 0) {
          section.resolveOfficeScope(scopeOfficeId);
          section.markViewForCheck();
        }
      });
      this.ownerLists?.forEach(section => {
        if (section.offices.length > 0) {
          section.resolveOfficeScope(scopeOfficeId);
          section.markViewForCheck();
        }
      });
      this.generalLists?.forEach(section => {
        if (section.offices.length > 0) {
          section.resolveOfficeScope(scopeOfficeId);
          section.markViewForCheck();
        }
      });
    });
  }

  private clearOfficeTitleBarErrorIfValid(): void {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      this.officeTitleBarShowError = false;
    }
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
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue());
            }
          } else if (this.selectedOfficeId != null) {
            this.applyPageOfficeScope(this.selectedOfficeId);
          }
          this.cdr.markForCheck();
        });
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
  }
  //#endregion
}
