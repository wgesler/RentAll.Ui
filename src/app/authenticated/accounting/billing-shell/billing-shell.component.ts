import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { InvoiceResponse, InvoiceSelection } from '../models/invoice.model';
import { InvoiceListComponent } from '../invoices/invoice-list/invoice-list.component';
import { InvoiceComponent } from '../invoices/invoice/invoice.component';

@Component({
  standalone: true,
  selector: 'app-billing-shell',
  templateUrl: './billing-shell.component.html',
  styleUrl: './billing-shell.component.scss',
  imports: [CommonModule, MaterialModule, TitleBarSelectComponent, InvoiceListComponent, InvoiceComponent]
})
export class BillingShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private cdr = inject(ChangeDetectorRef);

  organizations: OrganizationResponse[] = [];
  selectedOrganizationId: string | null = null;
  currentUserOrganizationId: string | null = null;
  activeInvoiceId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  selectedOfficeId: number | null = null;
  selectedReservationId: string | null = null;
  selectedCompanyId: string | null = null;
  invoiceDetailInstance = 0;
  invoicesRefreshTrigger = 0;
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

  onInvoiceSelect(selection: InvoiceSelection): void {
    const invoiceId = (selection?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    if (selection.officeId != null) {
      this.selectedOfficeId = selection.officeId;
    }
    if (selection.reservationId) {
      this.selectedReservationId = selection.reservationId;
    }
    if (selection.companyId != null && selection.companyId !== '') {
      this.selectedCompanyId = selection.companyId;
    }

    const reopeningInvoiceAdd = invoiceId === 'new' && this.activeInvoiceId === 'new';
    this.selectedInvoice = invoiceId === 'new' ? null : (selection.invoice ?? null);
    this.activeInvoiceId = invoiceId;
    if (reopeningInvoiceAdd) {
      this.invoiceDetailInstance++;
    }
    this.cdr.markForCheck();
  }

  closeEmbeddedInvoiceEditor(refresh = true): void {
    this.activeInvoiceId = null;
    this.selectedInvoice = null;
    this.selectedOfficeId = null;
    this.selectedReservationId = null;
    this.selectedCompanyId = null;
    if (refresh) {
      this.invoicesRefreshTrigger++;
    }
    this.cdr.markForCheck();
  }

  onInvoiceCreated(): void {
    this.closeEmbeddedInvoiceEditor(true);
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
  get organizationTitleBarOptions(): { value: string; label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
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
