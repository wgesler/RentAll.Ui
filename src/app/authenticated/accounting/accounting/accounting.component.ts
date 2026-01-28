import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { CostCodesListComponent } from '../cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from '../cost-codes/cost-codes.component';
import { CreateInvoiceComponent } from '../create-invoice/create-invoice.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { Router } from '@angular/router';
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
    CreateInvoiceComponent,
    DocumentListComponent
  ],
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  selectedTabIndex: number = 0; // Default to Outstanding Invoices tab
  selectedOfficeId: number | null = null; // Shared office selection state
  selectedReservationId: string | null = null; // Shared reservation selection state
  
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
    private costCodesService: CostCodesService
  ) { }

  ngOnInit(): void {
    this.loadOffices();
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
  }

  onInvoiceOfficeChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  onInvoiceReservationChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
  }

  onCostCodesOfficeChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  onCreateInvoiceOfficeChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  onCreateInvoiceReservationChange(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
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
    // Refresh cost codes list after save (for embedded mode)
    // The form will be cleared by the component itself, we just need to refresh the list
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
