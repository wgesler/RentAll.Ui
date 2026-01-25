import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { ChartOfAccountsListComponent } from '../chart-of-accounts-list/chart-of-accounts-list.component';
import { ChartOfAccountsComponent } from '../chart-of-accounts/chart-of-accounts.component';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { filter, take, Subscription } from 'rxjs';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, InvoiceListComponent, ChartOfAccountsListComponent, ChartOfAccountsComponent],
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  selectedTabIndex: number = 0; // Default to Invoices tab
  selectedOfficeId: number | null = null; // Shared office selection state
  
  // Chart of Accounts controls
  showInactiveChartOfAccounts: boolean = false;
  chartOfAccountsOffices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  
  // Chart of Accounts edit state
  isEditingChartOfAccounts: boolean = false;
  chartOfAccountsId: string | number | null = null;
  chartOfAccountsOfficeId: number | null = null;

  constructor(
    private officeService: OfficeService,
    private router: Router,
    private chartOfAccountsService: ChartOfAccountsService
  ) { }

  ngOnInit(): void {
    this.loadOffices();
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.chartOfAccountsOffices = offices || [];
      });
    });
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
  }

  onInvoiceOfficeChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  onChartOfAccountsOfficeChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
  }

  toggleInactiveChartOfAccounts(): void {
    this.showInactiveChartOfAccounts = !this.showInactiveChartOfAccounts;
  }

  onChartOfAccountsAdd(): void {
    this.chartOfAccountsId = 'new';
    this.chartOfAccountsOfficeId = this.selectedOfficeId;
    this.isEditingChartOfAccounts = true;
  }

  onChartOfAccountsEdit(event: { chartOfAccountId: string, officeId: number | null }): void {
    this.chartOfAccountsId = event.chartOfAccountId;
    this.chartOfAccountsOfficeId = event.officeId || this.selectedOfficeId;
    this.isEditingChartOfAccounts = true;
  }

  onChartOfAccountsBack(): void {
    // Refresh chart of accounts list when navigating back
    if (this.selectedOfficeId) {
      this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOfficeId);
    }
    this.chartOfAccountsId = null;
    this.chartOfAccountsOfficeId = null;
    this.isEditingChartOfAccounts = false;
  }

  onChartOfAccountsSaved(): void {
    // Refresh chart of accounts list after save (for embedded mode)
    // The form will be cleared by the component itself, we just need to refresh the list
    if (this.selectedOfficeId) {
      this.chartOfAccountsService.refreshChartOfAccountsForOffice(this.selectedOfficeId);
    }
  }
}
