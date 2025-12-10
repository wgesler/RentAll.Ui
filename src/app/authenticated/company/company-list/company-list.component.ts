import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { CompanyResponse, CompanyListDisplay } from '../models/company.model';
import { CompanyService } from '../services/company.service';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, forkJoin, filter } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-company-list',
  templateUrl: './company-list.component.html',
  styleUrls: ['./company-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class CompanyListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  companiesDisplayedColumns: ColumnSet = {
    'companyCode': { displayAs: 'Code', maxWidth: '10ch' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'contact': { displayAs: 'Contact', maxWidth: '25ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'zip': { displayAs: 'Zip' },
    'phone': { displayAs: 'Phone' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allCompanies: CompanyListDisplay[] = [];
  companiesDisplay: CompanyListDisplay[] = [];
  private contacts: ContactResponse[] = [];

  constructor(
    public companyService: CompanyService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private contactService: ContactService) {
      this.itemsToLoad.push('companies');
  }

  ngOnInit(): void {    // Load contacts from already-cached source
    this.contactService.getAllCompanyContacts().pipe(filter((contacts: ContactResponse[]) => contacts && contacts.length > 0), take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        this.getCompanies();
      },
      error: (err: HttpErrorResponse) => {
        console.error('Company List Component - Error loading contacts:', err);
        this.contacts = [];
        this.getCompanies();
      }
    });
  }

  getCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.removeLoadItem('companies') })).subscribe({
      next: (companies) => {
        this.allCompanies = this.mappingService.mapCompanies(companies, this.contacts);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Companies', CommonMessage.ServiceError);
        }
      }
    });
  }

  addCompany(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Company, ['new']));
  }

  deleteCompany(company: CompanyListDisplay): void {
    if (confirm(`Are you sure you want to delete ${company.name}?`)) {
      this.companyService.deleteCompany(company.companyId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Company deleted successfully', CommonMessage.Success);
          this.getCompanies(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete company. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete company', CommonMessage.Error);
          }
        }
      });
    }
  }

  // Routing methods
  goToCompany(event: CompanyListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Company, [event.companyId]));
  }

  goToContact(event: CompanyListDisplay): void {
    if (event.contactId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
    }
  }

  // Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.companiesDisplay = this.showInactive
      ? this.allCompanies
      : this.allCompanies.filter(company => company.isActive);
  }

  // Utility helpers
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

