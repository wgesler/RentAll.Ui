import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { InvoiceListComponent } from '../invoices/invoice-list/invoice-list.component';

@Component({
  standalone: true,
  selector: 'app-billing-shell',
  templateUrl: './billing-shell.component.html',
  styleUrl: './billing-shell.component.scss',
  imports: [CommonModule, MaterialModule, TitleBarSelectComponent, InvoiceListComponent]
})
export class BillingShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);

  organizations: OrganizationResponse[] = [];
  selectedOrganizationId: string | null = null;
  currentUserOrganizationId: string | null = null;
  destroy$ = new Subject<void>();

  //#region Billing-Shell
  ngOnInit(): void {
    this.currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.loadOrganizations();
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    this.selectedOrganizationId = value == null || value === '' ? null : String(value);
  }

  onInvoiceOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.organizationId !== this.currentUserOrganizationId);
      }
    });
  }
  //#endregion

  //#region Utility Methods
  get organizationTitleBarOptions(): { value: string; label: string; code?: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || '',
      code: organization.organizationCode || ''
    }));
  }

  get selectedOrganizationName(): string | null {
    if (!this.selectedOrganizationId) {
      return null;
    }
    return this.organizations.find(organization => organization.organizationId === this.selectedOrganizationId)?.name || null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
