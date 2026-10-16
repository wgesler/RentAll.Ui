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

  organizations: OrganizationResponse[] = [];
  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  selectedTabIndex = 0;
  startDate: Date | null = null;
  endDate: Date | null = null;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.endDate = today;
    this.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
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
        }
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
    this.loadOffices();
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
  }

  onDateRangeChange(): void {
    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const swapped = this.startDate;
      this.startDate = this.endDate;
      this.endDate = swapped;
    }
  }

  runSearch(): void {
    this.onDateRangeChange();
    this.appliedOrganizationId = this.organizationId;
    this.appliedOfficeId = this.selectedOfficeId;
    this.appliedOfficeIds = this.selectedOfficeId != null
      ? [this.selectedOfficeId]
      : this.offices.map(office => office.officeId);
    this.appliedStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    this.appliedEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    this.searchNonce += 1;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
