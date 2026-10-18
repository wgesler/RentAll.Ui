import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { DocumentHealthComponent } from '../../logs/document-health/document-health.component';
import { AdminTasksComponent } from '../admin-tasks/admin-tasks.component';
import { AdminReceiptsComponent } from '../admin-receipts/admin-receipts.component';

@Component({
  standalone: true,
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  imports: [CommonModule, FormsModule, MaterialModule, TitleBarSelectComponent, AdminTasksComponent, AdminReceiptsComponent, DocumentHealthComponent]
})
export class AdminShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private organizationService = inject(OrganizationService);
  private globalSelectionService = inject(GlobalSelectionService);
  private utilityService = inject(UtilityService);
  private destroy$ = new Subject<void>();
  private readonly clearPinsEventName = 'rentall-clear-pins';
  private readonly pinnedTopBarStorageKeyPrefix = 'rentall-admin-shell-pinned-dates';

  organizations: OrganizationResponse[] = [];
  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  selectedTabIndex = 0;
  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRangePinned = false;
  appliedOrganizationId = '';
  appliedOfficeId: number | null = null;
  appliedOfficeIds: number[] = [];
  appliedStartDate: string | null = null;
  appliedEndDate: string | null = null;
  searchNonce = 0;

  get organizationOptions(): SearchableSelectOption[] {
    return this.organizations.map(organization => ({
      value: organization.organizationId,
      label: organization.name
    }));
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.applyPinnedTopBarFromStorage();
    if (!this.dateRangePinned) {
      this.setDefaultTopBar();
    }
    this.loadOrganizations();
    this.loadOffices();
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
  }

  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = organizations || [];
        if (this.organizationId && !this.organizations.some(organization => organization.organizationId === this.organizationId) && this.organizations.length > 0) {
          this.organizationId = this.organizations[0].organizationId;
          this.selectedOfficeId = null;
          this.loadOffices();
        }
      },
      error: () => {
        this.organizations = [];
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.selectedOfficeId = null;
      return;
    }

    const organizationId = this.organizationId;
    this.officeService.getOfficesByOrganization(organizationId).pipe(take(1)).subscribe({
      next: (offices) => {
        if (this.organizationId !== organizationId) {
          return;
        }
        this.offices = offices || [];
        if (this.selectedOfficeId != null && !this.offices.some(office => office.officeId === this.selectedOfficeId)) {
          this.selectedOfficeId = null;
          this.persistPinnedTopBarIfActive();
        }
        this.runSearch();
      },
      error: () => {
        if (this.organizationId !== organizationId) {
          return;
        }
        this.offices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? '' : String(value);
    if (!organizationId || organizationId === this.organizationId) {
      return;
    }

    this.organizationId = organizationId;
    this.selectedOfficeId = null;
    this.persistPinnedTopBarIfActive();
    this.loadOffices();
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.runSearch();
  }

  onDateRangeChange(): void {
    this.normalizeDateRange();
    this.runSearch();
  }

  normalizeDateRange(): void {
    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const swapped = this.startDate;
      this.startDate = this.endDate;
      this.endDate = swapped;
    }
  }

  runSearch(): void {
    this.normalizeDateRange();
    this.appliedOrganizationId = this.organizationId;
    this.appliedOfficeId = this.selectedOfficeId;
    this.appliedOfficeIds = this.selectedOfficeId != null
      ? [this.selectedOfficeId]
      : this.offices.map(office => office.officeId);
    this.appliedStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    this.appliedEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    this.searchNonce += 1;
    this.persistPinnedTopBarIfActive();
  }

  setDefaultTopBar(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.endDate = today;
    this.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
  }

  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      this.persistPinnedTopBar();
      return;
    }
    this.clearPinnedTopBarStorage();
    this.setDefaultTopBar();
    this.loadOffices();
  }

  persistPinnedTopBarIfActive(): void {
    if (this.dateRangePinned) {
      this.persistPinnedTopBar();
    }
  }

  persistPinnedTopBar(): void {
    if (!this.dateRangePinned || !this.organizationId || !this.startDate || !this.endDate) {
      return;
    }
    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }
    localStorage.setItem(this.getPinnedTopBarStorageKey(), JSON.stringify({
      enabled: true,
      organizationId: this.organizationId,
      officeId: this.selectedOfficeId,
      startDate,
      endDate
    }));
  }

  applyPinnedTopBarFromStorage(): void {
    const stored = this.readPinnedTopBarFromStorage();
    if (!stored) {
      this.dateRangePinned = false;
      return;
    }
    stored.startDate.setHours(0, 0, 0, 0);
    stored.endDate.setHours(0, 0, 0, 0);
    this.dateRangePinned = true;
    this.organizationId = stored.organizationId;
    this.selectedOfficeId = stored.officeId;
    this.startDate = stored.startDate;
    this.endDate = stored.endDate;
  }

  readPinnedTopBarFromStorage(): { organizationId: string; officeId: number | null; startDate: Date; endDate: Date } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const rawValue = localStorage.getItem(this.getPinnedTopBarStorageKey());
    if (!rawValue) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; organizationId?: string; officeId?: number | null; startDate?: string; endDate?: string };
      const organizationId = String(parsed?.organizationId ?? '').trim();
      if (parsed?.enabled !== true || !organizationId || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      const startDate = this.utilityService.parseCalendarDateInput(parsed.startDate);
      const endDate = this.utilityService.parseCalendarDateInput(parsed.endDate);
      if (!startDate || !endDate) {
        return null;
      }
      const officeId = parsed.officeId == null ? null : Number(parsed.officeId);
      return {
        organizationId,
        officeId: Number.isFinite(officeId) && (officeId ?? 0) > 0 ? officeId : null,
        startDate,
        endDate
      };
    } catch {
      return null;
    }
  }

  clearPinnedTopBarStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getPinnedTopBarStorageKey());
  }

  getPinnedTopBarStorageKey(): string {
    const userKey = this.authService.getUser()?.userId?.trim() || 'anonymous';
    return `${this.pinnedTopBarStorageKeyPrefix}-${userKey}`;
  }

  onClearPins = (): void => {
    if (!this.dateRangePinned) {
      return;
    }
    this.dateRangePinned = false;
    this.clearPinnedTopBarStorage();
    this.setDefaultTopBar();
    this.loadOffices();
  };

  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
