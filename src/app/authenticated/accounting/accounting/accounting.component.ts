
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { UserGroups } from '../../users/models/user-enums';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-accounting',
    imports: [
    MaterialModule,
    FormsModule,
    InvoiceListComponent,
    CostCodesListComponent,
    CostCodesComponent,
    GeneralLedgerComponent,
    DocumentListComponent,
    EmailListComponent
],
    templateUrl: './accounting.component.html',
    styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  @ViewChild('accountingDocumentList') accountingDocumentList?: DocumentListComponent;
  @ViewChild('accountingEmailList') accountingEmailList?: EmailListComponent;
  
  DocumentType = DocumentType; // Expose DocumentType enum to template
  EmailType = EmailType; // Expose EmailType enum to template
  selectedTabIndex: number = 0; // Default to Outstanding Invoices tab
  isSuperAdmin: boolean = false;
  organizations: OrganizationResponse[] = [];
  selectedOrganizationId: string | null = null;
  availableOffices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null; // Shared office selection state
  selectedReservationId: string | null = null; // Shared reservation selection state
  selectedInvoiceId: string | null = null; // Shared invoice selection state
  selectedCompanyId: string | null = null; // Shared company selection state
  
  
  // Cost Codes edit state
  isEditingCostCodes: boolean = false;
  costCodesId: string | number | null = null;
  costCodesOfficeId: number | null = null;
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private costCodesService: CostCodesService,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private officeService: OfficeService
  ) { }

  ngOnInit(): void {
    this.initializeSuperAdminFilters();
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));
  }

  //#region Tab Selections
  private initializeSuperAdminFilters(): void {
    const user = this.authService.getUser();
    this.isSuperAdmin = this.hasRole(user?.userGroups, UserGroups.SuperAdmin);
    if (!this.isSuperAdmin) {
      return;
    }

    this.selectedOrganizationId = user?.organizationId || null;
    this.loadOrganizationsForSuperAdmin();
    this.loadOfficesForOrganization(this.selectedOrganizationId);
  }

  private loadOrganizationsForSuperAdmin(): void {
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = organizations || [];
        if (!this.selectedOrganizationId && this.organizations.length > 0) {
          this.selectedOrganizationId = this.organizations[0].organizationId;
        }
      }
    });
  }

  private loadOfficesForOrganization(organizationId: string | null): void {
    if (!organizationId) {
      this.availableOffices = [];
      this.selectedOfficeId = null;
      return;
    }

    // Keep the shared office cache aligned so child tabs map office names correctly.
    this.officeService.loadAllOffices(organizationId);

    this.officeService.getOfficesByOrganization(organizationId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (offices) => {
        this.availableOffices = offices || [];
        const officeStillValid = this.availableOffices.some(o => o.officeId === this.selectedOfficeId);
        if (!officeStillValid) {
          this.selectedOfficeId = null;
          this.selectedReservationId = null;
          this.selectedCompanyId = null;
        }
      },
      error: () => {
        this.availableOffices = [];
        this.selectedOfficeId = null;
      }
    });
  }

  onOrganizationFilterChange(): void {
    this.selectedOfficeId = null;
    this.selectedReservationId = null;
    this.selectedCompanyId = null;
    this.loadOfficesForOrganization(this.selectedOrganizationId);
  }

  onOfficeFilterChange(): void {
    this.selectedReservationId = null;
    this.selectedCompanyId = null;
  }

  private hasRole(groups: Array<string | number> | undefined, role: UserGroups): boolean {
    if (!groups || groups.length === 0) {
      return false;
    }

    return groups.some(group => {
      if (typeof group === 'string') {
        if (group === UserGroups[role]) {
          return true;
        }
        const parsed = Number(group);
        return !isNaN(parsed) && parsed === role;
      }
      return typeof group === 'number' && group === role;
    });
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    // Keep URL tab-only to avoid preselecting dropdowns from query params.
    const queryParams: any = { tab: event.index.toString() };
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
    
    // When Emails tab (index 3) is selected, reload the email list
    if (event.index === 3 && this.accountingEmailList) {
      this.accountingEmailList.reload();
    }

    // When Documents tab (index 4) is selected, reload the document list
    if (event.index === 4 && this.accountingDocumentList) {
      this.accountingDocumentList.reload();
    }
  }

  onInvoiceOfficeChange(officeId: number | null): void {
   if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
      if (this.accountingDocumentList) {
        this.accountingDocumentList.reload();
      }
    }
  }

  onInvoiceReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
      if (this.accountingDocumentList) {
        this.accountingDocumentList.reload();
      }
    }
  }

  onInvoiceCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onCostCodesOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
     }
  }

  onGeneralLedgerOfficeChange(officeId: number | null): void {
     if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }

  onGeneralLedgerReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }

  onGeneralLedgerCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onDocumentsOfficeChange(officeId: number | null): void {
     if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
       this.selectedReservationId = null;
       if (this.accountingDocumentList) {
        this.accountingDocumentList.reload();
      }
    }
  }
  
  onDocumentsReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
       if (this.accountingDocumentList) {
        this.accountingDocumentList.reload();
      }
    }
  }

  onDocumentsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onEmailsOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }

  onEmailsReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }

  onEmailsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onPrintInvoice(event: { officeId: number | null, reservationId: string | null, invoiceId: string }): void {
    // Navigate to Create Invoice page (standalone route)
    // Always include officeId, invoiceId, reservationId, and companyId if available
    const params: string[] = [];
    
    // Add returnTo parameter to track where we came from
    params.push(`returnTo=accounting`);
    
    if (event.officeId !== null && event.officeId !== undefined) {
      params.push(`officeId=${event.officeId}`);
    }
    if (event.reservationId !== null && event.reservationId !== undefined && event.reservationId !== '') {
      params.push(`reservationId=${event.reservationId}`);
    }
    if (event.invoiceId) {
      params.push(`invoiceId=${event.invoiceId}`);
    }
    // Include companyId if available
    if (this.selectedCompanyId) {
      params.push(`companyId=${this.selectedCompanyId}`);
    }
    
    // Navigate to the Create Invoice route with all parameters
    const url = params.length > 0 
      ? `${RouterUrl.InvoiceCreate}?${params.join('&')}`
      : RouterUrl.InvoiceCreate;
    this.router.navigateByUrl(url);
  }

  onCostCodesAdd(): void {
    this.costCodesId = 'new';
    this.costCodesOfficeId = this.selectedOfficeId;
    this.isEditingCostCodes = true;
  }

  onCostCodesEdit(event: { costCodeId: string, officeId: number | null }): void {
    this.costCodesId = event.costCodeId;
    this.costCodesOfficeId = event.officeId || this.selectedOfficeId;
    this.isEditingCostCodes = true;
  }

  onCostCodesBack(): void {
    // Refresh cost codes list when navigating back
    if (this.selectedOfficeId) {
      this.costCodesService.refreshCostCodesForOffice(this.selectedOfficeId);
    }
    this.costCodesId = null;
    this.costCodesOfficeId = null;
    this.isEditingCostCodes = false;
  }

  onCostCodesSaved(): void {
    if (this.selectedOfficeId) {
      this.costCodesService.refreshCostCodesForOffice(this.selectedOfficeId);
    }
  }
  //#endregion

  //#region Utility Methods
  applyQueryParamState(params: Record<string, string>): void {
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 4);
    if (tabIndex !== null && this.selectedTabIndex !== tabIndex) {
      this.selectedTabIndex = tabIndex;
    }
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

}
