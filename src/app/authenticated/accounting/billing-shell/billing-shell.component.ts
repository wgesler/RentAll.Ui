import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationListService } from '../../organizations/services/organization-list.service';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { InvoicePreviewSelection, InvoiceResponse, InvoiceSelection } from '../models/invoice.model';
import { BillingCreateComponent } from '../invoices/billing-create/billing-create.component';
import { BillingComponent } from '../invoices/billing/billing.component';
import { InvoiceListComponent } from '../invoices/invoice-list/invoice-list.component';

@Component({
  standalone: true,
  selector: 'app-billing-shell',
  templateUrl: './billing-shell.component.html',
  styleUrl: './billing-shell.component.scss',
  imports: [CommonModule, MaterialModule, TitleBarSelectComponent, InvoiceListComponent, BillingComponent, BillingCreateComponent]
})
export class BillingShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private organizationListService = inject(OrganizationListService);
  private cdr = inject(ChangeDetectorRef);

  organizations: OrganizationResponse[] = [];
  selectedOrganizationId: string | null = null;
  currentUserOrganizationId: string | null = null;
  activeInvoiceId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  previewInvoiceId: string | null = null;
  showPreview = false;
  destroy$ = new Subject<void>();

  //#region Billing-Shell
  ngOnInit(): void {
    this.currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.loadOrganizations();
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    this.selectedOrganizationId = value == null || value === '' ? null : String(value);
    this.clearEditor();
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

    if (selection.reservationId) {
      this.selectedOrganizationId = selection.reservationId;
    }

    this.showPreview = false;
    this.previewInvoiceId = null;
    this.selectedInvoice = invoiceId === 'new' ? null : (selection.invoice ?? null);
    this.activeInvoiceId = invoiceId;
    this.cdr.markForCheck();
  }

  onPreview(selection: InvoicePreviewSelection): void {
    const invoiceId = (selection?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    if (selection.reservationId) {
      this.selectedOrganizationId = selection.reservationId;
    }

    this.activeInvoiceId = null;
    this.selectedInvoice = null;
    this.previewInvoiceId = invoiceId;
    this.showPreview = true;
    this.cdr.markForCheck();
  }

  onBillingPreview(invoice: InvoiceResponse): void {
    this.onPreview({
      invoiceId: invoice.invoiceId,
      invoiceCode: invoice.invoiceCode,
      officeId: invoice.officeId ?? 1,
      reservationId: invoice.reservationId || this.selectedOrganizationId
    });
  }

  onEditorBack(): void {
    this.clearEditor();
  }

  clearEditor(): void {
    this.activeInvoiceId = null;
    this.selectedInvoice = null;
    this.previewInvoiceId = null;
    this.showPreview = false;
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizations(): void {
    this.organizationListService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe(organizations => {
      this.organizations = (organizations || []).filter(o => o.organizationId !== this.currentUserOrganizationId);
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
