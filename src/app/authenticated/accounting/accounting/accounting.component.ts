
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { UserGroups } from '../../users/models/user-enums';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';

@Component({
    selector: 'app-accounting',
    imports: [
    MaterialModule,
    FormsModule,
    InvoiceListComponent,
    CostCodesListComponent,
    GeneralLedgerComponent,
    DocumentListComponent,
    EmailListComponent
],
    templateUrl: './accounting.component.html',
    styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  DocumentType = DocumentType; // Expose DocumentType enum to template
  EmailType = EmailType; // Expose EmailType enum to template
  selectedTabIndex: number = 0; // Default to Outstanding Invoices tab
  isSuperAdmin: boolean = false;

  organizations: OrganizationResponse[] = [];
  availableOffices: OfficeResponse[] = [];
  selectedOrganizationId: string | null = null;
  selectedOfficeId: number | null = null; 
  selectedCompanyId: string | null = null; 
  selectedReservationId: string | null = null; 
  selectedInvoiceId: string | null = null; 
   
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private utilityService: UtilityService,
    private organizationService: OrganizationService
  ) { }

  //#region Accounting
  ngOnInit(): void {
    this.initializeSuperAdminFilters();
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));
  }

  initializeSuperAdminFilters(): void {
    const user = this.authService.getUser();
    this.isSuperAdmin = this.utilityService.hasRole(user?.userGroups, UserGroups.SuperAdmin);
    if (!this.isSuperAdmin) {
      return;
    }

    this.selectedOrganizationId = null;
    const currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.organizationId !== currentUserOrganizationId);
      }
    });
  }
  //#endregion

  //#region Invoice Drop Downs
  onInvoiceOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onInvoiceOfficeChange(officeId: number | null): void {
   if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }
  
  onInvoiceCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onInvoiceReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //region CostCode Drop Downs
  onCostCodesOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
     }
  }
  //#endregion

  //#region General Ledger Drop Downs
  onGeneralLedgerOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
        this.selectedOrganizationId = organizationId
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
  //#endregion

  //#region Document Drop Downs
  onDocumentsOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId
    }
  }

  onDocumentsOfficeChange(officeId: number | null): void {
     if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
       this.selectedReservationId = null;
    }
  }

  onDocumentsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
      }
  }

  onDocumentsReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //#region Email Drop Downs
  onEmailsOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onEmailsOfficeChange(officeId: number | null): void {
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }
  }

  onEmailsCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }
  
  onEmailsReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }
  //#endregion

  //#region Tab Selections
  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    // Keep URL tab-only to avoid preselecting dropdowns from query params.
    const queryParams: any = { tab: event.index.toString() };
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
    
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
