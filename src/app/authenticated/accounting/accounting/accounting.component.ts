
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
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
    private costCodesService: CostCodesService
  ) { }

  ngOnInit(): void {
    this.applyQueryParamState(this.route.snapshot.queryParams);
    
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => this.applyQueryParamState(params));
  }

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
