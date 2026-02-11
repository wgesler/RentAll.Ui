import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    InvoiceListComponent, 
    CostCodesListComponent, 
    CostCodesComponent,
    GeneralLedgerComponent,
    DocumentListComponent
  ],
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  @ViewChild('accountingDocumentList') accountingDocumentList?: DocumentListComponent;
  
  DocumentType = DocumentType; // Expose DocumentType enum to template
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
    // Update URL query params when tab changes manually (user clicks tab)
    const queryParams: any = { tab: event.index.toString() };
    if (this.selectedOfficeId) {
      queryParams.officeId = this.selectedOfficeId.toString();
    }
    if (this.selectedReservationId) {
      queryParams.reservationId = this.selectedReservationId;
    }
    if (this.selectedInvoiceId) {
      queryParams.invoiceId = this.selectedInvoiceId;
    }
    if (this.selectedCompanyId) {
      queryParams.companyId = this.selectedCompanyId;
    }
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    });
    
    // When Documents tab (index 3) is selected, reload the document list
    if (event.index === 3 && this.accountingDocumentList) {
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
      // Update URL query params to include companyId
      const queryParams: any = { tab: this.selectedTabIndex.toString() };
      if (this.selectedOfficeId) {
        queryParams.officeId = this.selectedOfficeId.toString();
      }
      if (this.selectedReservationId) {
        queryParams.reservationId = this.selectedReservationId;
      }
      if (this.selectedInvoiceId) {
        queryParams.invoiceId = this.selectedInvoiceId;
      }
      if (this.selectedCompanyId) {
        queryParams.companyId = this.selectedCompanyId;
      }
      this.router.navigate([], { 
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge'
      });
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
    const tabIndex = getNumberQueryParam(params, 'tab', 0, 3);
    if (tabIndex !== null && this.selectedTabIndex !== tabIndex) {
      this.selectedTabIndex = tabIndex;
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null && this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
    }

    const reservationId = getStringQueryParam(params, 'reservationId');
    if (reservationId !== null && this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }

    const invoiceId = getStringQueryParam(params, 'invoiceId');
    if (invoiceId !== null && this.selectedInvoiceId !== invoiceId) {
      this.selectedInvoiceId = invoiceId;
    }

    const companyId = getStringQueryParam(params, 'companyId');
    if (companyId !== null && this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

}
