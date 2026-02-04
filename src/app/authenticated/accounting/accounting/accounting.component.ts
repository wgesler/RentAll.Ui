import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { Router, ActivatedRoute } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { filter, take, Subscription } from 'rxjs';
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
  
  // Cost Codes controls
  showInactiveCostCodes: boolean = false;
  costCodesOffices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  
  // Cost Codes edit state
  isEditingCostCodes: boolean = false;
  costCodesId: string | number | null = null;
  costCodesOfficeId: number | null = null;

  constructor(
    private officeService: OfficeService,
    private router: Router,
    private route: ActivatedRoute,
    private costCodesService: CostCodesService
  ) { }

  ngOnInit(): void {
    this.loadOffices();
    
    // Read initial query params immediately (before subscription) so invoice-list gets companyId on first render
    const initialParams = this.route.snapshot.queryParams;
    if (initialParams['officeId']) {
      const officeId = parseInt(initialParams['officeId'], 10);
      if (!isNaN(officeId)) {
        this.selectedOfficeId = officeId;
      }
    }
    if (initialParams['companyId']) {
      this.selectedCompanyId = initialParams['companyId'];
    }
    if (initialParams['reservationId']) {
      this.selectedReservationId = initialParams['reservationId'];
    }
    if (initialParams['invoiceId']) {
      this.selectedInvoiceId = initialParams['invoiceId'];
    }
    if (initialParams['tab']) {
      const tabIndex = parseInt(initialParams['tab'], 10);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 3) {
        this.selectedTabIndex = tabIndex;
      }
    }
    
    // Check query params for tab selection and filters (subscribe to changes, not just initial)
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tabIndex = parseInt(params['tab'], 10);
        if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 3 && this.selectedTabIndex !== tabIndex) {
          this.selectedTabIndex = tabIndex;
        }
      }
      if (params['officeId']) {
        const officeId = parseInt(params['officeId'], 10);
        if (!isNaN(officeId) && this.selectedOfficeId !== officeId) {
          this.selectedOfficeId = officeId;
        }
      }
      if (params['reservationId']) {
        const reservationId = params['reservationId'];
        if (this.selectedReservationId !== reservationId) {
          this.selectedReservationId = reservationId;
        }
      }
      if (params['invoiceId']) {
        const invoiceId = params['invoiceId'];
        if (this.selectedInvoiceId !== invoiceId) {
          this.selectedInvoiceId = invoiceId;
        }
      }
      if (params['companyId']) {
        const companyId = params['companyId'];
        if (this.selectedCompanyId !== companyId) {
          this.selectedCompanyId = companyId;
        }
      }
    });
  }


  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.costCodesOffices = offices || [];
      });
    });
  }
  //#endregion

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
      ? `${RouterUrl.CreateInvoice}?${params.join('&')}`
      : RouterUrl.CreateInvoice;
    this.router.navigateByUrl(url);
  }

  toggleInactiveCostCodes(): void {
    this.showInactiveCostCodes = !this.showInactiveCostCodes;
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
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion

}
