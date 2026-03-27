
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';

@Component({
    selector: 'app-accounting',
    standalone: true,
    imports: [
    MaterialModule,
    FormsModule,
    InvoiceListComponent,
    CostCodesListComponent,
    GeneralLedgerComponent,
    DocumentListComponent,
    EmailListComponent,
    TitlebarSelectComponent
],
    templateUrl: './accounting.component.html',
    styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingCostCodes') accountingCostCodes?: CostCodesListComponent;
  @ViewChild('accountingGeneralLedger') accountingGeneralLedger?: GeneralLedgerComponent;
  @ViewChild('accountingEmailList') accountingEmailList?: EmailListComponent;
  @ViewChild('accountingDocumentList') accountingDocumentList?: DocumentListComponent;
  DocumentType = DocumentType; // Expose DocumentType enum to template
  EmailType = EmailType; // Expose EmailType enum to template
  selectedTabIndex: number = 0; // Default to Outstanding Invoices tab
  isSuperAdmin: boolean = false;
  currentUserOrganizationId: string | null;

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
    this.currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.organizationId !== this.currentUserOrganizationId);
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
    // Navigate to Create Invoice/Billing page (standalone route)
    // Always include officeId, invoiceId, reservationId, and companyId if available
    const params: string[] = [];
    
    // Add returnTo parameter to track where we came from
    params.push(`returnTo=accounting`);
    params.push(`autoPrint=true`);
    
    if(this.isSuperAdmin)
    {
      if (this.currentUserOrganizationId) {
        params.push(`organizationId=${this.currentUserOrganizationId}`);
        params.push(`reservationId=${this.selectedOrganizationId}`);
      }
    }
    else {
      if (event.officeId !== null && event.officeId !== undefined) {
        params.push(`officeId=${event.officeId}`);
      }
      if (this.selectedCompanyId) {
        params.push(`companyId=${this.selectedCompanyId}`);
      }
      if (event.reservationId !== null && event.reservationId !== undefined && event.reservationId !== '') {
        params.push(`reservationId=${event.reservationId}`);
      }
      if (event.invoiceId) {
        params.push(`invoiceId=${event.invoiceId}`);
      }
    }
    
    // Navigate to the Create Invoice route with all parameters
    const url = params.length > 0 
      ? `${RouterUrl.InvoiceCreate}?${params.join('&')}`
      : RouterUrl.InvoiceCreate;
    this.router.navigateByUrl(url);
  }

  //#endregion

  //#region Utility Methods
  getOfficeOptions(offices: OfficeResponse[] | null | undefined): { value: number, label: string }[] {
    return (offices || []).map(office => ({ value: office.officeId, label: office.name }));
  }

  getCompanyOptions(companies: { value: { contactId: string }, label: string }[] | null | undefined): { value: string, label: string }[] {
    return (companies || []).map(company => ({ value: company.value.contactId, label: company.label }));
  }

  getReservationOptions(reservations: { value: { reservationId: string }, label: string }[] | null | undefined): { value: string, label: string }[] {
    return (reservations || []).map(reservation => ({ value: reservation.value.reservationId, label: reservation.label }));
  }

  getDocumentTypeOptions(documentTypes: { value: number, label: string }[] | null | undefined): { value: number, label: string }[] {
    return documentTypes || [];
  }

  onAccountingInvoiceOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }
    const officeId = value == null || value === '' ? null : Number(value);
    this.accountingInvoiceList.selectedOffice = officeId == null
      ? null
      : this.accountingInvoiceList.offices.find(office => office.officeId === officeId) || null;
    this.accountingInvoiceList.onOfficeChange();
  }

  onAccountingInvoiceCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingInvoiceList.selectedCompanyContact = contactId
      ? this.accountingInvoiceList.availableCompanyContacts.find(company => company.value.contactId === contactId)?.value || null
      : null;
    this.accountingInvoiceList.onCompanyChange();
  }

  onAccountingInvoiceReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceList) {
      return;
    }
    const reservationId = value == null || value === '' ? null : String(value);
    this.accountingInvoiceList.selectedReservation = reservationId
      ? this.accountingInvoiceList.availableReservations.find(reservation => reservation.value.reservationId === reservationId)?.value || null
      : null;
    this.accountingInvoiceList.onReservationChange();
  }

  onAccountingCostCodesOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingCostCodes) {
      return;
    }
    const officeId = value == null || value === '' ? null : Number(value);
    this.accountingCostCodes.selectedOffice = officeId == null
      ? null
      : this.accountingCostCodes.offices.find(office => office.officeId === officeId) || null;
    this.accountingCostCodes.onOfficeChange();
  }

  onAccountingGeneralLedgerOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    this.accountingGeneralLedger.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingGeneralLedger.onOfficeChange();
  }

  onAccountingGeneralLedgerCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingGeneralLedger.selectedCompanyContact = contactId
      ? this.accountingGeneralLedger.availableCompanyContacts.find(company => company.value.contactId === contactId)?.value || null
      : null;
    this.accountingGeneralLedger.onCompanyChange();
  }

  onAccountingGeneralLedgerReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingGeneralLedger) {
      return;
    }
    this.accountingGeneralLedger.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingGeneralLedger.onReservationChange();
  }

  onAccountingEmailOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    this.accountingEmailList.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingEmailList.onOfficeChange();
  }

  onAccountingEmailCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingEmailList.selectedCompanyContact = contactId
      ? this.accountingEmailList.availableCompanyContacts.find(company => company.value.contactId === contactId)?.value || null
      : null;
    this.accountingEmailList.onCompanyChange();
  }

  onAccountingEmailReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingEmailList) {
      return;
    }
    this.accountingEmailList.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingEmailList.onReservationChange();
  }

  onAccountingDocumentOfficeDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.accountingDocumentList.onOfficeChange();
  }

  onAccountingDocumentCompanyDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    const contactId = value == null || value === '' ? null : String(value);
    this.accountingDocumentList.selectedCompany = contactId
      ? this.accountingDocumentList.availableCompanies.find(company => company.value.contactId === contactId)?.value || null
      : null;
    this.accountingDocumentList.onCompanyChange();
  }

  onAccountingDocumentReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.selectedReservationId = value == null || value === '' ? null : String(value);
    this.accountingDocumentList.onReservationChange();
  }

  onAccountingDocumentTypeDropdownChange(value: string | number | null): void {
    if (!this.accountingDocumentList) {
      return;
    }
    this.accountingDocumentList.selectedDocumentTypeId = value == null || value === '' ? null : Number(value);
    this.accountingDocumentList.onDocumentTypeChange();
  }

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
